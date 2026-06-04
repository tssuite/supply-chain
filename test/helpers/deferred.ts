// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/**
 * A promise together with its resolve/reject callbacks — the TypeScript
 * equivalent of Dart's `Completer<T>`.
 * @typeParam T - The resolved value type.
 */
export interface Deferred<T> {
  /** The pending promise. */
  promise: Promise<T>;
  /** Resolves the promise. */
  resolve: (value: T) => void;
  /** Rejects the promise. */
  reject: (error: unknown) => void;
}

/**
 * Creates a {@link Deferred}.
 * @typeParam T - The resolved value type.
 */
export const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
