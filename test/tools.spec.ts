// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { isCamelCase } from '../src/tools.ts';

describe('tools', () => {
  describe('isCamelCase', () => {
    it('should return true if a string has camel case format', () => {
      expect(isCamelCase('_helloWorld')).toBe(true);
      expect(isCamelCase('helloWorld')).toBe(true);
      expect(isCamelCase('hello85')).toBe(true);
      expect(isCamelCase('hello')).toBe(true);
      expect(isCamelCase('Hello')).toBe(false);
      expect(isCamelCase('HelloWorld')).toBe(false);
      expect(isCamelCase('hello World')).toBe(false);
      expect(isCamelCase('hello-World')).toBe(false);
    });

    it('allows a leading paragraph sign', () => {
      expect(isCamelCase('§helloWorld')).toBe(true);
    });
  });
});
