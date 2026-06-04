// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { AssertionError } from './errors.ts';

let assertionsEnabled = true;

/**
 * Enables or disables assertions globally.
 *
 * Dart strips `assert` in release builds but keeps them in tests. Here
 * assertions are on by default (so tests that expect {@link AssertionError}
 * keep passing) and can be turned off for production.
 * @param enabled - Whether assertions should throw.
 */
export const setAssertionsEnabled = (enabled: boolean): void => {
  assertionsEnabled = enabled;
};

/** Returns whether assertions are currently enabled. */
export const assertionsAreEnabled = (): boolean => assertionsEnabled;

/**
 * Throws an {@link AssertionError} if {@link condition} is falsy and
 * assertions are enabled.
 * @param condition - The condition that must hold.
 * @param message - The message used when the assertion fails.
 */
export function assert(
  condition: unknown,
  message = 'Assertion failed',
): asserts condition {
  if (assertionsEnabled && !condition) {
    throw new AssertionError(message);
  }
}
