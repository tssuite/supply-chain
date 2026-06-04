// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Owner } from './owner.ts';
import { Scope } from './scope.ts';
import { ScopeBluePrint } from './scope-blue-print.ts';
import { ScBuilder } from './sc-builder.ts';
import { ScBuilderBluePrint } from './sc-builder-blue-print.ts';

/** Manages the scopes added by a builder */
export class ScBuilderScopeAdder {
  /**
   * The constructor
   * @param params - The construction parameters.
   */
  constructor(params: { builder: ScBuilder }) {
    this.builder = params.builder;
    this._check();
    this._initOwner();
  }

  // ...........................................................................
  /** Removes the added scopes again */
  dispose(): void {
    for (const scope of [...this.managedScopes]) {
      scope.dispose();
    }
  }

  /** The builder this class belongs to */
  readonly builder: ScBuilder;

  /** Returns an example instance for test purposes */
  static get example(): ScBuilderScopeAdder {
    const scope = Scope.example();

    scope.mockContent({
      a: 1,
      b: 2,
      c: { d: 4, e: 5, f: 'f' },
    });

    const builder = new ExampleScBuilderAddingScopes().instantiate({ scope });
    scope.scm.flush();
    return builder.scopeAdder;
  }

  // ...........................................................................
  /**
   * Deeply iterate through all child nodes and replace nodes
   * @param scope - The scope to apply this builder to.
   */
  applyToScope(scope: Scope): void {
    // We will not apply this builder to scopes created by this builder
    if (scope.owner === this._owner) {
      return;
    }

    this._applyToScope(scope);
  }

  /** Returns the added scopes */
  managedScopes: Scope[] = [];

  // ######################
  // Private
  // ######################

  // ...........................................................................
  private _owner!: Owner<Scope>;

  // ...........................................................................
  private _initOwner(): void {
    this._owner = new Owner<Scope>({
      willErase: (p0) => {
        const index = this.managedScopes.indexOf(p0);
        /* v8 ignore next -- guard: willErase only fires for scopes this adder manages */
        if (index !== -1) {
          this.managedScopes.splice(index, 1);
        }
      },
    });
  }

  // ...........................................................................
  private _check(): void {
    const scopes = this.builder.bluePrint.addScopes({
      hostScope: ScBuilder.testScope,
    });
    if (scopes.length > 0) {
      throw new Error(
        'ScScopeBluePrint.addScopes(hostScope) ' +
          'must evaluate the hostScope and not add scopes to all scopes.',
      );
    }
  }

  // ...........................................................................
  private _applyToScope(scope: Scope): void {
    // Add the scopes to the host scope
    const bluePrints = this.builder.bluePrint.addScopes({ hostScope: scope });

    // Make sure the scope does not already exist.
    for (const bluePrint of bluePrints) {
      const childScope = scope.child(bluePrint.key);
      if (childScope != null) {
        throw new Error(
          `Scope with key "${bluePrint.key}" already exists. ` +
            'Please use "ScBuilderBluePrint:replaceScope" instead.',
        );
      }
    }

    // Add the child scopes to the host scope
    const addedScopes = scope.addChildren(bluePrints, { owner: this._owner });

    // Remember created scopes
    this.managedScopes.push(...addedScopes);
  }

  // ######################
  // Private
  // ######################
}

// #############################################################################
/** An example node adder for test purposes */
export class ExampleScBuilderAddingScopes extends ScBuilderBluePrint {
  /** The constructor */
  constructor() {
    super({ key: 'example' });
  }

  /**
   * Whether the children of the given scope should be processed.
   * @param scope - The scope to check.
   */
  override shouldProcessChildren(scope: Scope): boolean {
    return true;
  }

  /**
   * Whether the given scope should be processed.
   * @param scope - The scope to check.
   */
  override shouldProcessScope(scope: Scope): boolean {
    return true;
  }

  /**
   * Returns the scopes to be added to the host scope.
   * @param params - The parameters.
   */
  override addScopes(params: { hostScope: Scope }): ScopeBluePrint[] {
    const { hostScope } = params;
    // Add k,j to example scope
    if (hostScope.key === 'example') {
      return [
        ScopeBluePrint.fromJson({
          k: { kv: 767 },
        }),
        ScopeBluePrint.fromJson({
          j: { jv: 171 },
        }),
      ];
    }
    // Add x,y to c scope
    if (hostScope.key === 'c') {
      return [
        ScopeBluePrint.fromJson({
          x: { xv: 530 },
        }),
        ScopeBluePrint.fromJson({
          y: { yv: 543 },
        }),
      ];
    } else {
      return []; // coverage:ignore-line
    }
  }
}
