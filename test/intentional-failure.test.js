const test = require('node:test');
const assert = require('node:assert/strict');

test('intentional failure to prove CI works', () => {
  assert.equal('actual', 'expected');
});
