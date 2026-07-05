// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assert } from './internal/assert.ts';
import { Scm } from './scm.ts';

import type { Node } from './node.ts';
import type { Scope } from './scope.ts';

/** Manages the disposal of resources. */
export class Disposed {
  /** The related supply chain manager. */
  readonly scm: Scm;

  // Sets (insertion-ordered) instead of arrays: removeNode/removeScope are
  // called once per erased item; with arrays each removal is a linear scan.
  private readonly disposedScopes = new Set<Scope>();
  private readonly disposedNodes = new Set<Node<any>>();

  /**
   * Constructor.
   * @param options - The owning supply chain manager.
   */
  constructor(options: { scm: Scm }) {
    this.scm = options.scm;
  }

  /** Disposed scopes. */
  get scopes(): readonly Scope[] {
    return [...this.disposedScopes];
  }

  /** Disposed nodes. */
  get nodes(): readonly Node<any>[] {
    return [...this.disposedNodes];
  }

  /**
   * Called by a node when it is disposed.
   * @param node - The disposed node.
   */
  addNode(node: Node<any>): void {
    assert(node.isDisposed);
    this.disposedNodes.add(node);
  }

  /**
   * Called by a node when it is erased.
   * @param node - The erased node.
   */
  removeNode(node: Node<any>): void {
    this.disposedNodes.delete(node);
  }

  /**
   * Called by a scope when it is disposed.
   * @param scope - The disposed scope.
   */
  addScope(scope: Scope): void {
    assert(scope.isDisposed);
    this.disposedScopes.add(scope);
  }

  /**
   * Called by a scope when it is erased or undisposed.
   * @param scope - The scope to remove.
   */
  removeScope(scope: Scope): void {
    this.disposedScopes.delete(scope);
  }

  /** Returns an example instance of this class. */
  static get example(): Disposed {
    return Scm.example().disposedItems;
  }
}
