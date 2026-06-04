// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/**
 * A callback invoked with the owned item.
 * @typeParam T - The type of the owned item.
 */
export type OwnerCallback<T> = (item: T) => void;

/**
 * Holds a set of callbacks that are called when a scope or a node is
 * disposed, undisposed or erased.
 * @typeParam T - The type of the owned item.
 */
export class Owner<T> {
  /** This callback is called when the item will be disposed. */
  readonly willDispose?: OwnerCallback<T>;

  /** This callback is called when the item is disposed. */
  readonly didDispose?: OwnerCallback<T>;

  /** This callback is called when the item will be undisposed. */
  readonly willUndispose?: OwnerCallback<T>;

  /** This callback is called when the item is undisposed. */
  readonly didUndispose?: OwnerCallback<T>;

  /** This callback is called when the item will be erased. */
  readonly willErase?: OwnerCallback<T>;

  /** This callback is called when the item is erased. */
  readonly didErase?: OwnerCallback<T>;

  /**
   * Creates a new owner.
   * @param callbacks - The lifecycle callbacks to register.
   */
  constructor(
    callbacks: {
      willDispose?: OwnerCallback<T>;
      didDispose?: OwnerCallback<T>;
      willUndispose?: OwnerCallback<T>;
      didUndispose?: OwnerCallback<T>;
      willErase?: OwnerCallback<T>;
      didErase?: OwnerCallback<T>;
    } = {},
  ) {
    this.willDispose = callbacks.willDispose;
    this.didDispose = callbacks.didDispose;
    this.willUndispose = callbacks.willUndispose;
    this.didUndispose = callbacks.didUndispose;
    this.willErase = callbacks.willErase;
    this.didErase = callbacks.didErase;
  }

  /** Returns a default instance that will do nothing. */
  static readonly example = new Owner<string>();
}
