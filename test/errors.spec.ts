// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, describe, expect, it } from 'vitest';

import {
  assert,
  assertionsAreEnabled,
  setAssertionsEnabled,
} from '../src/internal/assert.ts';
import {
  ArgumentError,
  AssertionError,
  StateError,
} from '../src/internal/errors.ts';

describe('errors', () => {
  it('ArgumentError is an Error with the right name', () => {
    const e = new ArgumentError('bad arg');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ArgumentError);
    expect(e.name).toBe('ArgumentError');
    expect(e.message).toBe('bad arg');
  });

  it('StateError is an Error with the right name', () => {
    const e = new StateError('bad state');
    expect(e).toBeInstanceOf(StateError);
    expect(e.name).toBe('StateError');
    expect(e.message).toBe('bad state');
  });

  it('AssertionError is an Error with the right name', () => {
    const e = new AssertionError();
    expect(e).toBeInstanceOf(AssertionError);
    expect(e.name).toBe('AssertionError');
  });
});

describe('assert', () => {
  afterEach(() => {
    setAssertionsEnabled(true);
  });

  it('does not throw when the condition holds', () => {
    expect(() => assert(true)).not.toThrow();
  });

  it('throws AssertionError with the default message', () => {
    expect(() => assert(false)).toThrow(AssertionError);
    expect(() => assert(false)).toThrow('Assertion failed');
  });

  it('throws AssertionError with a custom message', () => {
    expect(() => assert(0, 'boom')).toThrow('boom');
  });

  it('can be disabled', () => {
    expect(assertionsAreEnabled()).toBe(true);
    setAssertionsEnabled(false);
    expect(assertionsAreEnabled()).toBe(false);
    expect(() => assert(false)).not.toThrow();
  });
});
