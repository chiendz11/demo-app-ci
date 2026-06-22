const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveName,
  createPayload,
} = require('../app/server');

test('uses docker when NAME is missing', () => {
  assert.equal(resolveName({}), 'docker');
});

test('uses NAME from environment', () => {
  assert.equal(resolveName({ NAME: 'phase1' }), 'phase1');
});

test('creates expected response payload', () => {
  assert.deepEqual(createPayload('phase1', 123456), {
    msg: 'hello from phase1',
    ts: 123456,
  });
});