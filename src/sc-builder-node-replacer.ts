// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Scope } from './scope.ts';
import { ScBuilderBluePrint } from './sc-builder-blue-print.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import type { Node } from './node.ts';
import type { ScBuilder } from './sc-builder.ts';

/// Manages the nodes added by a builder
export class ScBuilderNodeReplacer {
  /// The constructor
  constructor({ builder }: { builder: ScBuilder }) {
    this.builder = builder;
  }

  // ...........................................................................
  /// Disposes the nodes and removes it from the scope
  dispose(): void {
    for (const d of [...this._dispose].reverse()) {
      d();
    }
  }

  /// The builder this class belongs to
  readonly builder: ScBuilder;

  /// Returns an example instance for test purposes
  static get example(): ScBuilderNodeReplacer {
    const scope = Scope.example({});

    scope.mockContent({
      a: 1,
      b: 2,
      c: { d: 4, e: 5, f: 'f' },
    });

    const builder = new ExampleScBuilderReplacingIntNodes().instantiate({
      scope,
    });
    return builder.nodeReplacer;
  }

  // ...........................................................................
  /// Deeply iterate through all child nodes and replace nodes
  applyToScope(scope: Scope): void {
    this._applyToScope(scope);
  }

  /// Apply the builder to a node
  applyToNode(node: Node<any>): void {
    this._applyToNode(node);
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  private _applyToScope(scope: Scope): void {
    for (const node of scope.nodes) {
      this._applyToNode(node);
    }
  }

  // ...........................................................................
  private _applyToNode(node: Node<any>): void {
    // Get the smartNode for the node from the builder
    const newBluePrint = this.builder.bluePrint.replaceNode({
      hostScope: node.scope,
      nodeToBeReplaced: node,
    });

    // No change? Continue
    if (newBluePrint === node.bluePrint) {
      return;
    }

    // Replace the blue print
    node.addBluePrint(newBluePrint);

    // On dispose we will revert the smartNode
    this._dispose.push(() => {
      node.removeBluePrint(newBluePrint);
    });
  }

  // ######################
  // Private
  // ######################

  private readonly _dispose: Array<() => void> = [];
}

// #############################################################################
/// An example builder replacing a node
export class ExampleScBuilderReplacingIntNodes extends ScBuilderBluePrint {
  /// The constructor
  constructor() {
    super({ key: 'example' });
  }

  override shouldProcessChildren(scope: Scope): boolean {
    return true;
  }

  override shouldProcessScope(scope: Scope): boolean {
    return true;
  }

  override replaceNode({
    hostScope,
    nodeToBeReplaced,
  }: {
    hostScope: Scope;
    nodeToBeReplaced: Node<any>;
  }): NodeBluePrint<any> {
    if (typeof nodeToBeReplaced.bluePrint.initialProduct === 'number') {
      return nodeToBeReplaced.bluePrint.copyWith({
        produce: (components, previous, node) => 42,
      });
    }

    return super.replaceNode({
      hostScope,
      nodeToBeReplaced,
    });
  }
}
