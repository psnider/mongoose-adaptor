// NOTE: these tests call the versions for the functions that return Promises,
// as the Promise code wraps the callback versions,
// and this way both types are tested.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai = require("chai");
var expect = chai.expect;
const mongoose = require("mongoose");
var ObjectId = mongoose.Schema.Types.ObjectId;
const pino = require("pino");
const tests_1 = require("@sabbatical/document-database/tests");
const mongod_runner_1 = require("@sabbatical/mongod-runner");
const mongoose_adaptor_1 = require("@sabbatical/mongoose-adaptor");
const mongoose_connector_1 = require("@sabbatical/mongoose-connector");
process.on('uncaughtException', function (error) {
    console.log('Found uncaughtException: ' + error);
});
function getOverTheNetworkObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}
var Parts;
(function (Parts) {
    var DETAILS_SCHEMA_DEF = {
        quantity: Number,
        style: String,
        color: String
    };
    var COMPONENT_SCHEMA_DEF = {
        part_id: ObjectId,
        info: DETAILS_SCHEMA_DEF
    };
    var PART_SCHEMA_DEF = {
        _obj_ver: Number,
        name: String,
        description: String,
        catalog_number: String,
        notes: [String],
        details: DETAILS_SCHEMA_DEF,
        components: [COMPONENT_SCHEMA_DEF]
    };
    var SCHEMA = new mongoose.Schema(PART_SCHEMA_DEF);
    Parts.Model = mongoose.model('Part', SCHEMA);
})(Parts || (Parts = {}));
var fields_used_in_tests = {
    populated_string: 'name',
    unpopulated_string: 'description',
    string_array: { name: 'notes' },
    unique_key_fieldname: 'catalog_number',
    obj_array: {
        name: 'components',
        key_field: 'part_id',
        populated_field: { name: 'info.quantity', type: 'number' },
        unpopulated_field: { name: 'info.color', type: 'string' },
        createElement: createNewPartComponent
    }
};
var next_part_number = 0;
function createNewPart() {
    next_part_number++;
    return {
        name: 'widget',
        catalog_number: `W-${next_part_number}`,
        notes: ['all purpose'],
        components: [createNewPartComponent()]
    };
}
function createNewPartComponent() {
    return {
        part_id: mongoose_adaptor_1.MongooseDBAdaptor.createObjectId(),
        info: {
            quantity: (next_part_number % 2),
            style: ((next_part_number % 2) == 0) ? 'old' : 'new'
        }
    };
}
describe('MongooseDBAdaptor', function () {
    var PORT = 27016; // one less than the default port
    var NOTE = 'dont use with anti-widgets!';
    var UPDATED_NOTE = 'It actually works with anti-widgets!';
    var PART_ID = '123400000000000000000000';
    var COMPONENT_PART_ID = '123411111111111111111111';
    var COMPONENT_PART_2_ID = '123422222222222222222222';
    var enable_logging = (process.env.DISABLE_LOGGING == null) || ((process.env.DISABLE_LOGGING.toLowerCase() !== 'true') && (process.env.DISABLE_LOGGING !== '1'));
    var log = pino({ name: 'tests', enabled: enable_logging });
    var mongo_daemon;
    var shared_connections;
    var PARTS_ADAPTOR;
    function getPartsAdaptor() { return PARTS_ADAPTOR; }
    before(function (done) {
        mongo_daemon = new mongod_runner_1.MongoDaemonRunner({ port: PORT, use_tmp_dir: true, disable_logging: true });
        mongo_daemon.start((error) => {
            if (!error) {
                shared_connections = new mongoose_connector_1.SharedConnections(log);
                // TODO: [mongoose-adaptor.tests.ts should use config for mongo_path](https://github.com/psnider/mongoose-adaptor/issues/4)
                var mongodb_path = `localhost:${PORT}/test`;
                PARTS_ADAPTOR = new mongoose_adaptor_1.MongooseDBAdaptor('mongoose-adaptor-test', mongodb_path, shared_connections, Parts.Model);
                PARTS_ADAPTOR.connect((error) => {
                    done(error);
                });
            }
            else {
                done(error);
            }
        });
    });
    after(function (done) {
        PARTS_ADAPTOR.disconnect((error) => {
            if (!error) {
                mongo_daemon.stop((error) => {
                    done(error);
                });
            }
            else {
                done(error);
            }
        });
    });
    describe('convertUpdateCommandToMongo()', function () {
        var NON_ARRAY = { a: 1, b: 2 };
        var ARRAY = [3, 4];
        var KEY = 'key';
        var ELEMENT_ID = 'el-id';
        // This test data comes from the table in ./doc/MongoDB_management.md
        var CONVERT_TO_UPDATE_ARGS_TESTS = {
            SET_NONARRAY_FIELD_IN_OBJECT: {
                update_cmd: { cmd: 'set', field: 'n1.n2', value: NON_ARRAY },
                expected_mongo_query: {},
                expected_mongo_update: { $set: { 'n1.n2': NON_ARRAY } }
            },
            SET_ARRAY_FIELD_IN_OBJECT: {
                update_cmd: { cmd: 'set', field: 'n1.a1', value: ARRAY },
                expected_mongo_query: {},
                expected_mongo_update: { $set: { 'n1.a1': ARRAY } }
            },
            UNSET_NONARRAY_FIELD_IN_OBJECT: {
                update_cmd: { cmd: 'unset', field: 'n1.n2' },
                expected_mongo_query: {},
                expected_mongo_update: { $unset: { 'n1.n2': null } }
            },
            UNSET_ARRAY_FIELD_IN_OBJECT: {
                update_cmd: { cmd: 'unset', field: 'n1.a1' },
                expected_mongo_query: {},
                expected_mongo_update: { $unset: { 'n1.a1': null } }
            },
            SET_ELEMENT_OF_ARRAY: {
                update_cmd: { cmd: 'set', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, value: NON_ARRAY },
                expected_mongo_query: { 'n1.a1.key': ELEMENT_ID },
                expected_mongo_update: { $set: { 'n1.a1.$': NON_ARRAY } }
            },
            SET_FIELD_IN_ELEMENT_OF_ARRAY: {
                update_cmd: { cmd: 'set', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, subfield: 'n2.n3', value: NON_ARRAY },
                expected_mongo_query: { 'n1.a1.key': ELEMENT_ID },
                expected_mongo_update: { $set: { 'n1.a1.$.n2.n3': NON_ARRAY } }
            },
            UNSET_FIELD_IN_ELEMENT_OF_ARRAY: {
                update_cmd: { cmd: 'unset', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID, subfield: 'n2.n3' },
                expected_mongo_query: { 'n1.a1.key': ELEMENT_ID },
                expected_mongo_update: { $unset: { 'n1.a1.$.n2.n3': null } }
            },
            INSERT_ELEMENT_INTO_ARRAY: {
                update_cmd: { cmd: 'insert', field: 'n1.a1', value: NON_ARRAY },
                expected_mongo_query: {},
                expected_mongo_update: { $set: { $addToSet: { 'n1.a1': NON_ARRAY } } }
            },
            REMOVE_ELEMENT_FROM_ARRAY: {
                update_cmd: { cmd: 'remove', field: 'n1.a1', key_field: KEY, element_id: ELEMENT_ID },
                expected_mongo_query: {},
                expected_mongo_update: { $pull: { 'n1.a1': { KEY: ELEMENT_ID } } }
            }
        };
        function test_convertUpdateCommandToMongo(test_desc) {
            var mongo_update = mongoose_adaptor_1.MongooseDBAdaptor.convertUpdateCommandToMongo(test_desc.update_cmd);
            expect(mongo_update.query).to.deep.equal(test_desc.expected_mongo_query);
            //expect(mongo_update.update).to.deep.equal(test_desc.expected_mongo_update)
        }
        it('+ should convert: set a non-array field in an object', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_NONARRAY_FIELD_IN_OBJECT']);
        });
        it('+ should convert: set an array field in an object', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_ARRAY_FIELD_IN_OBJECT']);
        });
        it('+ should convert: unset a non-array field in an object', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_NONARRAY_FIELD_IN_OBJECT']);
        });
        it('+ should convert: unset an array field in an object', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_ARRAY_FIELD_IN_OBJECT']);
        });
        it('+ should convert: set an element of an array', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_ELEMENT_OF_ARRAY']);
        });
        it('+ should convert: set a field in an element of an array', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['SET_FIELD_IN_ELEMENT_OF_ARRAY']);
        });
        it('+ should convert: unset a field in an element of an array', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['UNSET_FIELD_IN_ELEMENT_OF_ARRAY']);
        });
        it('+ should convert: insert an element into an array', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['INSERT_ELEMENT_INTO_ARRAY']);
        });
        it('+ should convert: remove an element from an array', function () {
            test_convertUpdateCommandToMongo(CONVERT_TO_UPDATE_ARGS_TESTS['REMOVE_ELEMENT_FROM_ARRAY']);
        });
    });
    describe('create()', function () {
        tests_1.test_create(getPartsAdaptor, createNewPart, fields_used_in_tests);
    });
    describe('read()', function () {
        tests_1.test_read(getPartsAdaptor, createNewPart, fields_used_in_tests);
    });
    describe('replace()', function () {
        tests_1.test_replace(getPartsAdaptor, createNewPart, fields_used_in_tests, mongoose_adaptor_1.SUPPORTED_FEATURES);
    });
    describe('update()', function () {
        tests_1.test_update(getPartsAdaptor, createNewPart, fields_used_in_tests, mongoose_adaptor_1.SUPPORTED_FEATURES);
    });
    describe('del()', function () {
        tests_1.test_del(getPartsAdaptor, createNewPart, fields_used_in_tests);
    });
    describe('find()', function () {
        tests_1.test_find(getPartsAdaptor, createNewPart, fields_used_in_tests, mongoose_adaptor_1.SUPPORTED_FEATURES);
    });
});
