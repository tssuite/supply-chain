// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// Import scm.ts first to prime the module graph in an order that avoids the
// scm.ts <-> disposed.ts / scope.ts circular-import initialization issue (see
// the Scm.testInstance static initializer). When scm.ts is the entry into the
// cycle, disposed.ts and scope.ts finish defining before the static `new Scm()`
// runs. Importing index.ts (which loads disposed.ts first) triggers the bug.
import '../src/scm.ts';

import {
  NodeBluePrint,
  ScBuilderBluePrint,
  ScBuilderNodeAdder,
  Scope,
} from '../src/index.ts';

// #############################################################################
/// An example node adder for test purposes
class AddExistingNodeScBuilder extends ScBuilderBluePrint {
  /// The constructor
  constructor() {
    super({ key: 'addExistingNodeScBuilder' });
  }

  override shouldProcessChildren(scope: Scope): boolean {
    return false;
  }

  override shouldProcessScope(scope: Scope): boolean {
    return true;
  }

  override addNodes({
    hostScope,
  }: {
    hostScope: Scope;
  }): NodeBluePrint<any>[] {
    // Try to add the already existing node "existing" to the host scope
    // Will throw.
    if (hostScope.key === 'example') {
      return [new NodeBluePrint<number>({ key: 'existing', initialProduct: 12 })];
    }

    return super.addNodes({ hostScope });
  }
}

// #############################################################################
class AddNodesToEveryScopeBuilder extends ScBuilderBluePrint {
  /// The constructor
  constructor() {
    super({ key: 'addNodesToEveryScopeBuilder' });
  }

  override shouldProcessChildren(scope: Scope): boolean {
    return true;
  }

  override addNodes({
    hostScope,
  }: {
    hostScope: Scope;
  }): NodeBluePrint<any>[] {
    // Try to add the already existing node "existing" to the host scope
    // Will throw.
    return [new NodeBluePrint<number>({ key: 'noEvaluation', initialProduct: 12 })];
  }
}

// ###########################################################################
describe('ScBuilderNodeAdder', () => {
  describe('instantiate, dispose, managedNodes', () => {
    it('should add and remove the added nodes', () => {
      // Create the node adder
      const builderNodeAdder = ScBuilderNodeAdder.example;
      expect(builderNodeAdder.managedNodes).toHaveLength(4);

      // Get the scope
      const scope = builderNodeAdder.builder.scope;
      expect(scope.key).toBe('example');

      // Did ExampleScBuilderAddingNodes add k and j to the example scope?
      const k = scope.node<number>('k');
      expect(k).not.toBeUndefined();
      expect(k!.product).toBe(12);

      const j = scope.node<number>('j');
      expect(j).not.toBeUndefined();
      expect(j!.product).toBe(367);

      // Did ExampleScBuilderAddingNodes add x and y to scope c?
      const scopeC = scope.findChildScope('c')!;
      const x = scopeC.node<number>('x');
      expect(x).not.toBeUndefined();
      expect(x!.product).toBe(966);

      const y = scopeC.node<number>('y');
      expect(y).not.toBeUndefined();
      expect(y!.product).toBe(767);

      // Dispose one of the nodes -> It should be removed from managed nodes
      expect(builderNodeAdder.managedNodes).toHaveLength(4);
      const managedNode = builderNodeAdder.managedNodes[0];
      managedNode.dispose();
      expect(builderNodeAdder.managedNodes).toHaveLength(3);

      // Dispose the builder -> Added nodes should be removed again
      builderNodeAdder.dispose();
      expect(scope.node<number>('k')).toBeUndefined();
      expect(scope.node<number>('j')).toBeUndefined();
      expect(scopeC.node<number>('x')).toBeUndefined();
      expect(scopeC.node<number>('y')).toBeUndefined();
      expect(builderNodeAdder.managedNodes).toHaveLength(0);

      // Added nodes should also be disposed
      expect(k!.isDisposed).toBe(true);
      expect(j!.isDisposed).toBe(true);
      expect(x!.isDisposed).toBe(true);
      expect(y!.isDisposed).toBe(true);
    });

    describe('should throw', () => {
      it('when the builder adds a node already existing', () => {
        // Create an example scope containing one node
        const scope = Scope.example();
        expect(scope.nodes).toHaveLength(0);

        // Add a node "existing" to the scope
        scope.findOrCreateNode<number>(
          new NodeBluePrint<number>({ key: 'existing', initialProduct: 12 }),
        );

        // Create a builder trying to add the already existing node
        // "existing". Should throw.
        expect(() =>
          new AddExistingNodeScBuilder().instantiate({ scope }),
        ).toThrow(
          'Node with key "existing" already exists. ' +
            'Please use "ScBuilderBluePrint:replaceNode" instead.',
        );
      });
    });
  });

  describe('should throw', () => {
    it('when addNodes() adds nodes to all scopes', () => {
      // Create an example scope containing one node
      const scope = Scope.example();
      expect(scope.nodes).toHaveLength(0);

      // Add a node "existing" to the scope
      scope.findOrCreateNode<number>(
        new NodeBluePrint<number>({ key: 'existing', initialProduct: 12 }),
      );

      // Try to add nodes to all scopes. Should throw.
      expect(() =>
        new AddNodesToEveryScopeBuilder().instantiate({ scope }),
      ).toThrow(
        'ScScopeBluePrint.addNodes(hostScope) ' +
          'must evaluate the hostScope and not add nodes to all scopes.',
      );
    });
  });
});
