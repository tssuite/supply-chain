// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Scope } from './scope.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { ScBuilder } from './sc-builder.ts';
import { ScBuilderBluePrint } from './sc-builder-blue-print.ts';
import { Owner } from './owner.ts';
import type { Node } from './node.ts';

/// Manages the nodes added by a builder
export class ScBuilderNodeAdder {
  /// The constructor
  constructor({ builder }: { builder: ScBuilder }) {
    this.builder = builder;
    this._check();
    this._initOwner();
  }

  // ...........................................................................
  /// Disposes the nodes and removes it from the scope
  dispose(): void {
    for (const node of [...this.managedNodes]) {
      node.dispose();
    }
  }

  /// The builder this class belongs to
  readonly builder: ScBuilder;

  /// Returns an example instance for test purposes
  static get example(): ScBuilderNodeAdder {
    const scope = Scope.example();

    scope.mockContent({
      a: 1,
      b: 2,
      c: { d: 4, e: 5, f: 'f' },
    });

    const builder = new ExampleScBuilderAddingNodes().instantiate({ scope });
    return builder.nodeAdder;
  }

  // ...........................................................................
  /// Deeply iterate through all child nodes and replace nodes
  applyToScope(scope: Scope): void {
    this._applyToScope(scope);
  }

  /// Returns the added nodes
  managedNodes: Node<any>[] = [];

  // ######################
  // Private
  // ######################

  // ...........................................................................
  private _owner!: Owner<Node<any>>;

  // ...........................................................................
  private _initOwner(): void {
    this._owner = new Owner<Node<any>>({
      willErase: (p0) => {
        const index = this.managedNodes.indexOf(p0);
        /* v8 ignore next -- guard: willErase only fires for nodes this adder manages */
        if (index !== -1) {
          this.managedNodes.splice(index, 1);
        }
      },
    });
  }

  // ...........................................................................
  private _applyToScope(scope: Scope): void {
    const bluePrints = this.builder.bluePrint.addNodes({ hostScope: scope });

    // Make sure the node does not already exist.
    for (const bluePrint of bluePrints) {
      const node = scope.node<unknown>(bluePrint.key);
      if (node != null) {
        throw new Error(
          `Node with key "${bluePrint.key}" already exists. ` +
            'Please use "ScBuilderBluePrint:replaceNode" instead.',
        );
      }
    }

    // Add the nodes to the scope
    const addedNodes = scope.findOrCreateNodes(bluePrints, { owner: this._owner });

    // Remember the managed nodes
    this.managedNodes.push(...addedNodes);
  }

  // ...........................................................................
  private _check(): void {
    const nodes = this.builder.bluePrint.addNodes({
      hostScope: ScBuilder.testScope,
    });
    if (nodes.length > 0) {
      throw new Error(
        'ScScopeBluePrint.addNodes(hostScope) ' +
          'must evaluate the hostScope and not add nodes to all scopes.',
      );
    }
  }
}

// #############################################################################
/// An example node adder for test purposes
export class ExampleScBuilderAddingNodes extends ScBuilderBluePrint {
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

  override addNodes({
    hostScope,
  }: {
    hostScope: Scope;
  }): NodeBluePrint<any>[] {
    // Add k,j to example scope
    if (hostScope.key === 'example') {
      return [
        new NodeBluePrint<number>({ key: 'k', initialProduct: 12 }),
        new NodeBluePrint<number>({ key: 'j', initialProduct: 367 }),
      ];
    }
    // Add x,y to c scope
    if (hostScope.key === 'c') {
      return [
        new NodeBluePrint<number>({ key: 'x', initialProduct: 966 }),
        new NodeBluePrint<number>({ key: 'y', initialProduct: 767 }),
      ];
    } else {
      return []; // coverage:ignore-line
    }
  }
}
