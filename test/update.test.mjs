import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from '../web/js/update.js';

test('version comparison', () => {
  assert.equal(isNewer('v1.0.1', '1.0.0'), true);
  assert.equal(isNewer('1.2.0', '1.10.0'), false);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.0.0', '1.0.0'), false);
  assert.equal(isNewer('v1.0.0-beta.1', '1.0.0'), false);
});
