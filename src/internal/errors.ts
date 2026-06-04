// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/**
 * Error thrown when an argument is invalid.
 *
 * Mirrors Dart's `ArgumentError` so ported `throw`/`catch` sites and tests
 * (`toThrow(ArgumentError)`) keep working.
 */
export class ArgumentError extends Error {
  /**
   * Creates an argument error.
   * @param message - The error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'ArgumentError';
    Object.setPrototypeOf(this, ArgumentError.prototype);
  }
}

/** Error thrown when an operation is not allowed in the current state. */
export class StateError extends Error {
  /**
   * Creates a state error.
   * @param message - The error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'StateError';
    Object.setPrototypeOf(this, StateError.prototype);
  }
}

/** Error thrown by {@link assert} when an assertion fails. */
export class AssertionError extends Error {
  /**
   * Creates an assertion error.
   * @param message - The error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = 'AssertionError';
    Object.setPrototypeOf(this, AssertionError.prototype);
  }
}
