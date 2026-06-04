// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ScBuilder } from './sc-builder.ts';
import type { Scope } from './scope.ts';
import type { Node } from './node.ts';

/**
 * Manages the inserts of a builder
 *
 * - Deeply iterates all nodes of the builder's scope
 * - Creates scopes for the inserts
 * - Creates the insert nodes for each child
 */
export class ScBuilderInserts {
  /**
   * The constructor
   * @param builder - The builder this inserts belongs to
   */
  constructor({ builder }: { builder: ScBuilder }) {
    this.builder = builder;
  }

  /** The builder this inserts belongs to */
  readonly builder: ScBuilder;

  // ...........................................................................
  /** Disposes the insert and removes it from the scope */
  dispose(): void {
    for (const scope of this._scopes) {
      scope.dispose();
    }
  }

  // ...........................................................................
  /** Returns an example instance */
  static example(): ScBuilderInserts {
    const builder = ScBuilder.example();
    const inserts = builder.inserts;
    return inserts;
  }

  // ...........................................................................
  /** Deeply iterate through all child nodes and init the inserts */
  applyToScope(scope: Scope): void {
    this._applyToScope(scope);
  }

  // ...........................................................................
  /** Deeply iterate through all child nodes and init the inserts */
  applyToNode(node: Node<any>): void {
    this._applyToNode(node);
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  private _applyToScope(scope: Scope): void {
    // Iterare all nodes and child nodes and apply the insert
    for (const node of scope.nodes) {
      this._applyToNode(node);
    }
  }

  // ...........................................................................
  private _applyToNode(node: Node<any>): void {
    // Get the inserts for the node
    const insertsForNode = this.builder.bluePrint.inserts({ hostNode: node });
    if (insertsForNode.length === 0) {
      return;
    }

    // Create a scope hosting all the inserts of the current builder
    const scopeForInsertsOfScBuilder = node.scope.findOrCreateChild(
      this.builder.bluePrint.key,
    );
    this._scopes.add(scopeForInsertsOfScBuilder);

    // Each node can have multiple inserts.
    // Therefore create a scope for each node
    const scopeForInsertsOfNode = scopeForInsertsOfScBuilder.findOrCreateChild(
      `${node.key}Inserts`,
    );

    // Add the inserts to the node
    for (const insertNodeBluePrint of insertsForNode) {
      insertNodeBluePrint.instantiateAsInsert({
        host: node,
        scope: scopeForInsertsOfNode,
      });
    }
  }

  private readonly _scopes: Set<Scope> = new Set<Scope>();
}
