// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { keys, nextKey, testSetNextKeyCounter } from '../src/keys.ts';

describe('keys', () => {
  describe('nextKey', () => {
    it('should return the next key', () => {
      testSetNextKeyCounter(0);
      expect(nextKey()).toBe(keys[0]);
      expect(nextKey()).toBe(keys[1]);
      expect(nextKey()).toBe(keys[2]);

      testSetNextKeyCounter(0);
      expect(nextKey()).toBe(keys[0]);
      expect(nextKey()).toBe(keys[1]);
      expect(nextKey()).toBe(keys[2]);

      testSetNextKeyCounter(keys.length - 1);
      expect(nextKey()).toBe(keys[keys.length - 1]);
      expect(nextKey()).toBe(keys[0]);
    });
  });
});
