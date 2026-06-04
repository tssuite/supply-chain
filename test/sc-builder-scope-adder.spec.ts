// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// NOTE: The src ESM modules have a fragile load order. The `../src/index.ts`
// barrel crashes on import when a sc-builder spec is the first module loaded
// (a circular-import cycle in the sc-builder cluster, see report). Importing the
// core modules first (node-blue-print -> scm -> scope -> scope-blue-print ->
// node) and then `sc-builder.ts` breaks that cycle, after which the barrel can
// be imported safely. Keep these leading side-effect imports and their order.
import '../src/node-blue-print.ts';
import '../src/scm.ts';
import '../src/scope.ts';
import '../src/scope-blue-print.ts';
import '../src/node.ts';
import '../src/sc-builder.ts';

import {
  Scope,
  ScopeBluePrint,
  ScBuilderBluePrint,
  ScBuilderScopeAdder,
} from '../src/index.ts';

// #############################################################################
/** An example node adder for test purposes */
class AddExistingScopeScBuilder extends ScBuilderBluePrint {
  /** The constructor */
  constructor() {
    super({ key: 'addExistingScopeScBuilder' });
  }

  override shouldProcessChildren(_scope: Scope): boolean {
    return false;
  }

  override shouldProcessScope(_scope: Scope): boolean {
    return true;
  }

  override addScopes(params: { hostScope: Scope }): ScopeBluePrint[] {
    // Try to add the already existing scope "existing" to the host scope
    // Will throw.
    if (params.hostScope.matchesKey('example')) {
      return [new ScopeBluePrint({ key: 'existing' })];
    }

    return super.addScopes({ hostScope: params.hostScope });
  }
}

// #############################################################################
class AddScopesToEveryScopeBuilder extends ScBuilderBluePrint {
  /** The constructor */
  constructor() {
    super({ key: 'addScopesToEveryScopeBuilder' });
  }

  override shouldProcessChildren(_scope: Scope): boolean {
    return true;
  }

  override addScopes(_params: { hostScope: Scope }): ScopeBluePrint[] {
    // Try to add the already existing node "existing" to the host scope
    // Will throw.

    return [new ScopeBluePrint({ key: 'someNode' })];
  }
}

// ###########################################################################
describe('ScBuilderScopeAdder', () => {
  describe('instantiate, dispose()', () => {
    it('should add and remove the added nodes', () => {
      // Create the scope adder builder
      const builderNodeAdder = ScBuilderScopeAdder.example;
      expect(builderNodeAdder.managedScopes).toHaveLength(4);

      // Get the scope
      const scope = builderNodeAdder.builder.scope;
      expect(scope.key).toBe('example');

      // Did ExampleScBuilderAddingScopes add scope k and j to the
      // example scope?
      const k = scope.child('k')!;
      const kv = k.node<number>('kv')!;
      expect(kv.product).toBe(767);

      const j = scope.child('j')!;
      const jv = j.node<number>('jv')!;
      expect(jv.product).toBe(171);

      // Did ExampleScBuilderAddingScopes add scope x and y to scope c?
      const scopeC = scope.findChildScope('c')!;
      const x = scopeC.child('x')!;
      const xv = x.node<number>('xv')!;
      expect(xv.product).toBe(530);

      const y = scopeC.child('y')!;
      const yv = y.node<number>('yv')!;
      expect(yv.product).toBe(543);

      // Try to apply the builder to one of the scopes created by the builder.
      // This should have no effect
      const scopeCreatedByBuilder = builderNodeAdder.managedScopes[0];
      builderNodeAdder.applyToScope(scopeCreatedByBuilder);
      expect(builderNodeAdder.managedScopes).toHaveLength(4);

      // Dispose one of the scopes created by the builder.
      // The builder should be informed and remove the scope from the
      // managed scopes.
      scopeCreatedByBuilder.dispose();
      expect(builderNodeAdder.managedScopes).toHaveLength(3);

      // Dispose the builder -> Added scopes and their nodes should
      // be removed again
      builderNodeAdder.dispose();
      expect(scope.child('k')).toBeUndefined();
      expect(scope.child('j')).toBeUndefined();
      expect(scopeC.child('x')).toBeUndefined();
      expect(scopeC.child('y')).toBeUndefined();

      // Managed scopes should be empty
      expect(builderNodeAdder.managedScopes).toHaveLength(0);

      // Added scopes should also be disposed
      expect(k.isDisposed).toBe(true);
      expect(j.isDisposed).toBe(true);
      expect(x.isDisposed).toBe(true);
      expect(y.isDisposed).toBe(true);

      // Also the nodes of the added scopes should be disposed
      expect(xv.isDisposed).toBe(true);
      expect(yv.isDisposed).toBe(true);
    });

    describe('should throw', () => {
      it('when the builder adds a scope already existing', () => {
        // Create an example scope containing one node
        const scope = Scope.example();
        expect(scope.nodes).toHaveLength(0);

        // Add a node "existing" to the scope
        scope.findOrCreateChild('existing');

        // Create a builder trying to add the existing scope "existing".
        // Should throw.
        expect(() =>
          new AddExistingScopeScBuilder().instantiate({ scope }),
        ).toThrow(
          'Scope with key "existing" already exists. ' +
            'Please use "ScBuilderBluePrint:replaceScope" instead.',
        );
      });

      it('when addScopes() adds scopes to all scopes', () => {
        // Create an example scope containing one node
        const scope = Scope.example();
        expect(scope.nodes).toHaveLength(0);

        // Create a builder trying to add the scope "someNode" to all scopes.
        // Should throw.
        expect(() =>
          new AddScopesToEveryScopeBuilder().instantiate({ scope }),
        ).toThrow(
          'ScScopeBluePrint.addScopes(hostScope) must evaluate ' +
            'the hostScope and not add scopes to all scopes',
        );
      });
    });
  });
});
