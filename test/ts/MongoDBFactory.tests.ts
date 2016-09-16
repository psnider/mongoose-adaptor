import chai                             = require('chai');
var expect                              = chai.expect
import fs                               = require('fs');
import child_process                    = require('child_process');
import mongoose                         = require('mongoose');
var ObjectId                            = mongoose.Schema.Types.ObjectId;
import path                             = require('path');
import tmp                              = require('tmp');

import configure                        = require('configure-local')
import DatabaseFactory                  = require('DatabaseFactory');
import MongoDBFactory_mod               = require('MongoDBFactory');
import MongoDBFactory                   = MongoDBFactory_mod.MongoDBFactory;
import MongoDBAdaptor                   = MongoDBFactory_mod.MongoDBAdaptor;



process.on('uncaughtException', function(error) {
  console.log('Found uncaughtException: ' + error);
});


function getOverTheNetworkObject(obj : any) : any {
    return JSON.parse(JSON.stringify(obj));
}



interface ConvertMongodbUpdateArgsTest {
    update_cmd:                 DatabaseFactory.IUpdateFieldCommand;
    expected_mongo_query:       any;
    expected_mongo_update:      any;
}


interface ConvertMongodbUpdateArgsTests {
    [name : string]: ConvertMongodbUpdateArgsTest;
}


var DETAILS_SCHEMA_DEF = {
    quantity:           Number,
    style:              String,
    color:              String
};


var COMPONENT_SCHEMA_DEF = {
    part_id:            ObjectId,  // The part ID in the database
    info:               DETAILS_SCHEMA_DEF
};


var PART_SCHEMA_DEF = {
    name:               String,
    description:        String,
    catalog_number:     String,
    notes:              [String],
    details:            DETAILS_SCHEMA_DEF,
    components:         [COMPONENT_SCHEMA_DEF]
};


var PART_SCHEMA = new mongoose.Schema(PART_SCHEMA_DEF);
var PartModel = mongoose.model('Part', PART_SCHEMA);




export class PartsMongoDB extends MongoDBAdaptor {

    constructor(done? : () => void) {
        super('Part', PartModel, done);
    }

}



describe('deepEqualObjOrMongo', function() {
    
    var deepEqualObjOrMongo = MongoDBFactory_mod.deepEqualObjOrMongo;
    

    it('+ should compare null-equivalent values as equal', function() {
        expect(deepEqualObjOrMongo(null, null)).to.be.true;
        expect(deepEqualObjOrMongo(undefined, undefined)).to.be.true;
        expect(deepEqualObjOrMongo(null, undefined)).to.be.true;
        expect(deepEqualObjOrMongo(undefined, null)).to.be.true;
    });
            

    it('+ should compare null-equivalent and non-null-equivalent values as not equal', function() {
        expect(deepEqualObjOrMongo(null, 0)).to.be.false;
        expect(deepEqualObjOrMongo(0, null)).to.be.false;
        expect(deepEqualObjOrMongo(undefined, 0)).to.be.false;
        expect(deepEqualObjOrMongo(0, undefined)).to.be.false;
    });
            

    it('+ should compare equivalent arrays as equal', function() {
        expect(deepEqualObjOrMongo([1,'b',3], [1,'b',3])).to.be.true;
    });
            

    it('+ should compare unequivalent arrays as not equal', function() {
        expect(deepEqualObjOrMongo([1,'b',3], [1,'b',3, 4])).to.be.false;
        expect(deepEqualObjOrMongo([1,'b',3], [1,'b',3.01])).to.be.false;
    });
            

    it('+ should compare equivalent objects as equal', function() {
        expect(deepEqualObjOrMongo({a: 1, b: 2}, {b: 2, a: 1})).to.be.true;
    });
            

    it('+ should compare unequivalent objects as not equal', function() {
        expect(deepEqualObjOrMongo({a: 1, b: 2}, {a: 1, b: 3})).to.be.false;
        expect(deepEqualObjOrMongo({a: 1, b: 2}, {a: 1, c: 2})).to.be.false;
    });
            

    it('+ should compare equivalent Dates as equal', function() {
        var base_time = 1000000000000;
        expect(deepEqualObjOrMongo(new Date(base_time), new Date(base_time))).to.be.true;
    });
            

    it('+ should compare unequivalent Dates as notequal', function() {
        var base_time = 1000000000000;
        expect(deepEqualObjOrMongo(new Date(base_time), new Date(base_time + 2000))).to.be.false;
    });
            
});
    
    

describe('MongoDBAdaptor', function() {

    var NAME = 'MongoDBAdaptor_test';
    var SIZE_MB = 500;
    var RAM_DISK;
    var PORT = 27016;
    var SHOULD_DELETE_RAMDISK = true;
    var MONGO_PATH = 'localhost:' + PORT + '/' + NAME;


    var NOTE = 'dont use with anti-widgets!';
    var UPDATED_NOTE = 'It actually works with anti-widgets!';
    var PART_ID = '123400000000000000000000';
    var COMPONENT_PART_ID = '123411111111111111111111';
    var COMPONENT_PART_2_ID = '123422222222222222222222';

    var spawned_mongod;
    var tmp_dir


    before(function(done) {
        process.env['MONGO_PATH'] = MONGO_PATH;
        tmp_dir = tmp.dirSync({unsafeCleanup: true});
        var db_path  = path.join(tmp_dir.name, 'data');
        var log_path = path.join(tmp_dir.name, 'log');
        spawned_mongod = MongoDBFactory_mod.startMongod(PORT.toString(), db_path, log_path, function() {
            function onError(error : Error) : void {
                SHOULD_DELETE_RAMDISK = false;
            }
            var mongo_path = 'localhost:27016/test';
            MongoDBFactory_mod.connectViaMongoose(mongo_path, onError, done);
        });
    });


    after(function(done) {
        MongoDBFactory_mod.disconnectViaMongoose(function() {
            MongoDBFactory_mod.stopMongod(spawned_mongod, function() {
                tmp_dir.removeCallback();
                done()
            });
        });
    });


    describe('convertUpdateCommandToMongo()', function() {

        var NON_ARRAY = {a: 1, b: 2};
        var ARRAY = [3, 4];
        var KEY = 'key';
        var ELEMENT_ID = 'el-id';


        // This test data comes from the table in ./doc/MongoDB_management.md
        var CONVERT_TO_UPDATE_ARGS_TESTS : ConvertMongodbUpdateArgsTests = {
            SET_NONARRAY_FIELD_IN_OBJECT: {
                update_cmd: {cmd: 'set', field: 'n1.n2', value: NON_ARRAY},
                expected_mongo_query: {},
                expected_mongo_update: {$set: {'n1.n2': NON_ARRAY}}
            },
            SET_ARRAY_FIELD_IN_OBJECT: {
                update_cmd: {cmd: 'set', field: 'n1.a1', value: ARRAY},
                expected_mongo_query: {},
                expected_mongo_update: {$set: {'n1.a1': ARRAY}}
            },
            UNSET_NONARRAY_FIELD_IN_OBJECT: {
                update_cmd: {cmd: 'unset', field: 'n1.n2'},
                expected_mongo_query: {},
                expected_mongo_update: {$unset: {'n1.n2': null}}
            },
            UNSET_ARRAY_FIELD_IN_OBJECT: {
                update_cmd: {cmd: 'unset', field: 'n1.a1'},
                expected_mongo_query: {},
                expected_mongo_update: {$unset: {'n1.a1': null}}
            },

            SET_ELEMENT_OF_ARRAY: {
                update_cmd: {cmd: 'set', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, value: NON_ARRAY},
                expected_mongo_query: {'n1.a1.key': ELEMENT_ID},
                expected_mongo_update: {$set: {'n1.a1.$': NON_ARRAY}}
            },
            SET_FIELD_IN_ELEMENT_OF_ARRAY: {
                update_cmd: {cmd: 'set', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, subfield: 'n2.n3', value: NON_ARRAY},
                expected_mongo_query: {'n1.a1.key': ELEMENT_ID},
                expected_mongo_update: {$set: {'n1.a1.$.n2.n3': NON_ARRAY}}
            },
            UNSET_FIELD_IN_ELEMENT_OF_ARRAY: {
                update_cmd: {cmd: 'unset', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, subfield: 'n2.n3'},
                expected_mongo_query: {'n1.a1.key': ELEMENT_ID},
                expected_mongo_update: {$unset: {'n1.a1.$.n2.n3': null}}
            },
            INSERT_ELEMENT_INTO_ARRAY: {
                update_cmd: {cmd: 'insert', field: 'n1.a1', value: NON_ARRAY},
                expected_mongo_query: {},
                expected_mongo_update: {$set: {$addToSet: {'n1.a1': NON_ARRAY}}}
            },
            REMOVE_ELEMENT_FROM_ARRAY: {
                update_cmd: {cmd: 'remove', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID},
                expected_mongo_query: {},
                expected_mongo_update: {$pull: {'n1.a1': {KEY: ELEMENT_ID}}}
            }
        };


        function test_convertUpdateCommandToMongo(test_desc : ConvertMongodbUpdateArgsTest) {
            var mongo_update = MongoDBAdaptor.convertUpdateCommandToMongo(test_desc.update_cmd);
            expect(mongo_update.query).to.deep.equal(test_desc.expected_mongo_query);
            //expect(mongo_update.update).to.deep.equal(test_desc.expected_mongo_update);
        }


        it('+ should convert: set a non-array field in an object', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_NONARRAY_FIELD_IN_OBJECT']);
        });


        it('+ should convert: set an array field in an object', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_ARRAY_FIELD_IN_OBJECT']);
        });


        it('+ should convert: unset a non-array field in an object', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_NONARRAY_FIELD_IN_OBJECT']);
        });


        it('+ should convert: unset an array field in an object', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_ARRAY_FIELD_IN_OBJECT']);
        });


        it('+ should convert: set an element of an array', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_ELEMENT_OF_ARRAY']);
        });


        it('+ should convert: set a field in an element of an array', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_FIELD_IN_ELEMENT_OF_ARRAY']);
        });


        it('+ should convert: unset a field in an element of an array', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_FIELD_IN_ELEMENT_OF_ARRAY']);
        });


        it('+ should convert: insert an element into an array', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['INSERT_ELEMENT_INTO_ARRAY']);
        });


        it('+ should convert: remove an element from an array', function() {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['REMOVE_ELEMENT_FROM_ARRAY']);
        });

    });


    describe('update()', function() {

        var PARTS_ADAPTOR = new PartsMongoDB();


        function test_update(part, conditions, update_cmd: DatabaseFactory.IUpdateFieldCommand, done, tests) {
            if (conditions == null)  conditions = {};
            var _id;
            function update(result) {
                _id = result.elements[0]._id;
                conditions['_id'] = _id;
                return PARTS_ADAPTOR.update(conditions, [update_cmd]);
            }
            var create_promise = PARTS_ADAPTOR.create(part);
            var update_promise = create_promise.then(update);
            update_promise.then(
                (result) => {
                    var updated_part = result.elements[0];
                    expect(updated_part._id).to.equal(_id);
                    tests(updated_part);
                    done();
                },
                (error) => {
                    done(error);
                }
            );
        }


        describe('if selected item has a path without an array:', function() {

            describe('cmd=set:', function() {

                it('+ should replace an existing field in an object', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123'
                    };
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'name', value: 'sideways widget'};
                    test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                        expect(updated_part.name).to.equal('sideways widget');
                    });
                });


                it('+ should create a non-existant field in an object', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123'
                    };
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'description', value: 'Used when upright isnt right'};
                    test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                        expect(updated_part.description).to.equal('Used when upright isnt right');
                    });
                });

            });


            describe('cmd=unset', function() {

                it('+ should remove an existing field in an object', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123'
                    };
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'unset', field: 'name'};
                    test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                        expect(updated_part.name).to.be.undefined;
                    });
                });

            });

        });


        describe('if selected item has a path with an array', function() {

            describe('cmd=set', function() {

                it('+ should replace an existing element in an array of simple types', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123',
                        notes:              [NOTE]
                    };
                    var conditions = {notes: NOTE};
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'notes', element_id: NOTE, value: UPDATED_NOTE};
                    test_update(PART, conditions, UPDATE_CMD, done, (updated_part) => {
                        expect(updated_part.notes.length).to.equal(1);
                        expect(updated_part.notes[0]).to.equal(UPDATED_NOTE);
                    });
                });


                it('+ should replace an existing element in an array of objects', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123',
                        components: [{part_id: PART_ID, info: {quantity: 1}}]
                    };
                    var conditions = {'components.part_id': PART_ID};
                    var REPLACED_COMPONENT = {part_id: COMPONENT_PART_ID, info: {quantity: 1}};
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'components', key_field: 'part_id', element_id: PART_ID, value: REPLACED_COMPONENT};
                    // TODO: fix: for some crazy reason, this sequence is modifying REPLACED_COMPONENT
                    test_update(PART, conditions, UPDATE_CMD, done, (updated_part) => {
                        expect(updated_part.components.length).to.equal(1);
                        var component = updated_part.components[0];
                        expect(component).to.deep.equal(REPLACED_COMPONENT);
                    });
                });


                it('+ should create a new field in an existing element in an array of objects', function(done) {
                    var PART = {
                        name:               'widget',
                        catalog_number:     'W-123',
                        components: [{part_id: PART_ID, info: {quantity: 1}}]
                    };
                    var conditions = {'components.part_id': PART_ID};
                    var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'components', key_field: 'part_id', element_id: PART_ID, subfield: 'info.color', value: 'bronze'};
                    test_update(PART, conditions, UPDATE_CMD, done, (updated_part) => {
                        var component = updated_part.components[0];
                        expect(component.info).to.deep.equal({color: 'bronze', quantity: 1});
                    });
                });


                it('+ should replace an existing field in an existing element in an array of objects', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         components: [{part_id: PART_ID, info: {quantity: 1}}]
                     };
                     var conditions = {'components.part_id': PART_ID};
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'set', field: 'components', key_field: 'part_id', element_id: PART_ID, subfield: 'info.quantity', value: 2};
                     test_update(PART, conditions, UPDATE_CMD, done, (updated_part) => {
                         var component = updated_part.components[0];
                         expect(component.info).to.deep.equal({quantity: 2});
                     });
                });

            });


            describe('cmd=unset ', function() {

                it('+ should remove an existing field from an existing element in the array', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         components: [{part_id: PART_ID, info: {quantity: 1}}]
                     };
                     var conditions = {'components.part_id': PART_ID};
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'unset', field: 'components', key_field: 'part_id', element_id: PART_ID, subfield: 'info.quantity'};
                     test_update(PART, conditions, UPDATE_CMD, done, (updated_part) => {
                         var component = updated_part.components[0];
                         expect(component.info).to.exist;
                         expect(component.info.quantity).to.be.undefined;
                     });
                });


                it('- should not remove or delete an existing element of an array of simple types', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         notes:              [NOTE]
                     };
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'unset', field: 'notes', element_id: NOTE};
                     test_update(PART, null, UPDATE_CMD, (error : Error) => {
                        if (error != null) {
                            expect(error.message).to.equal('cmd=unset not allowed on array without a subfield, use cmd=remove');
                            done();
                        } else {
                            var error = new Error('unset unexpectedly succeeded');
                            done(error);
                        }
                     }, () => {});
                });


                it('- should not remove or delete an existing element of an array of objects', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         components: [{part_id: PART_ID, info: {quantity: 1}}]
                     };
                     var conditions = {'components.part_id': PART_ID};
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'unset', field: 'components', key_field: 'part_id', element_id: PART_ID};
                     test_update(PART, conditions, UPDATE_CMD, (error : Error) => {
                        if (error != null) {
                            expect(error.message).to.equal('cmd=unset not allowed on array without a subfield, use cmd=remove');
                            done();
                        } else {
                            var error = new Error('unset unexpectedly succeeded');
                            done(error);
                        }
                     }, () => {});
                });

            });


            describe('cmd=insert', function() {

                it('+ should create a new element in an array of simple types', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         notes:              [NOTE]
                     };
                     var ADDED_NOTE = 'compatible with both left- and right-widgets';
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'insert', field: 'notes', value: ADDED_NOTE};
                     test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                         var notes = updated_part.notes;
                         expect(notes.length).to.equal(2);
                         expect(notes[0]).to.equal(NOTE);
                         expect(notes[1]).to.equal(ADDED_NOTE);
                     });
                });


                it('+ should create a new element in an array of objects', function(done) {
                     var COMPONENT = {part_id: COMPONENT_PART_ID, info: {quantity: 1}};
                     var PART = {
                         name:              'widget',
                         catalog_number:    'W-123',
                         components:        [COMPONENT]
                     };
                     var ADDED_COMPONENT = {part_id: COMPONENT_PART_2_ID, info: {style: 'very stylish'}};
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'insert', field: 'components', value: ADDED_COMPONENT};
                     test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                         var components = getOverTheNetworkObject(updated_part.components);
                         expect(components.length).to.equal(2);
                         // didn't compare entire component via deep.equal because of _id
                         expect(components[0].part_id).to.equal(COMPONENT.part_id);
                         expect(components[0].info).to.deep.equal(COMPONENT.info);
                         expect(components[1].part_id).to.equal(ADDED_COMPONENT.part_id);
                         expect(components[1].info).to.deep.equal(ADDED_COMPONENT.info);
                     });

                });

            });


            describe('cmd=remove', function() {

                it('+ should remove an existing element from an array of simple types', function(done) {
                     var PART = {
                         name:               'widget',
                         catalog_number:     'W-123',
                         notes:              [NOTE]
                     };
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'remove', field: 'notes', element_id: NOTE};
                     test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                         var notes = updated_part.notes;
                         expect(notes.length).to.equal(0);
                     });
                });


                it('+ should remove an existing element from an array of objects', function(done) {
                     var COMPONENT = {part_id: COMPONENT_PART_ID, info: {quantity: 1}};
                     var PART = {
                         name:              'widget',
                         catalog_number:    'W-123',
                         components:        [COMPONENT]
                     };
                     var UPDATE_CMD : DatabaseFactory.IUpdateFieldCommand = {cmd: 'remove', field: 'components', key_field: 'part_id', element_id: COMPONENT_PART_ID};
                     test_update(PART, null, UPDATE_CMD, done, (updated_part) => {
                         var notes = updated_part.notes;
                         expect(notes.length).to.equal(0);
                     });
                });

            });

        });

    });

});
