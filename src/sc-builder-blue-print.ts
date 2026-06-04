// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { createScBuilder } from './internal/registry.ts';
import { Scope } from './scope.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { ScopeBluePrint } from './scope-blue-print.ts';
import type { Node } from './node.ts';
import type { ScBuilder } from './sc-builder.ts';

/**
 * Parameters for {@link ScBuilderBluePrint}'s constructor.
 */
export interface ScBuilderBluePrintParams {
  /** The key of the builder */
  key: string;

  /** When one of these suppliers change, the rebuild method will be called */
  needsUpdateSuppliers?: string[];

  /** Delegate adding scopes to a host scope */
  addScopes?: (p: { hostScope: Scope }) => ScopeBluePrint[];

  /** Delegate deciding whether a scope's children should be processed */
  shouldProcessChildren?: (scope: Scope) => boolean;

  /** Delegate deciding whether a scope should be processed */
  shouldProcessScope?: (scope: Scope) => boolean;

  /** Delegate replacing a scope in a host scope */
  replaceScope?: (p: {
    hostScope: Scope;
    scopeToBeReplaced: ScopeBluePrint;
  }) => ScopeBluePrint;

  /** Delegate adding nodes to a host scope */
  addNodes?: (p: {
    hostScope: Scope;
  }) => NodeBluePrint<any>[] | undefined;

  /** Delegate replacing a node in a host scope */
  replaceNode?: (p: {
    hostScope: Scope;
    nodeToBeReplaced: Node<any>;
  }) => NodeBluePrint<any> | undefined;

  /** Delegate adding inserts into a host node */
  inserts?: (p: { hostNode: Node<any> }) => NodeBluePrint<any>[];

  /** Delegate reacting to updates of the suppliers */
  needsUpdate?: (p: { hostScope: Scope; components: unknown[] }) => void;

  /** Delegate defining child builders */
  children?: (p: { hostScope: Scope }) => ScBuilderBluePrint[];
}

/**
 * A builder changes various aspects of a scope and its children
 */
export class ScBuilderBluePrint {
  /**
   * Creates a builder purely from constructor
   */
  constructor(params: ScBuilderBluePrintParams) {
    this.key = params.key;
    this.needsUpdateSuppliers = params.needsUpdateSuppliers ?? [];
    this._addScopes = params.addScopes;
    this._replaceScope = params.replaceScope;
    this._addNodes = params.addNodes;
    this._replaceNode = params.replaceNode;
    this._inserts = params.inserts;
    this._needsUpdate = params.needsUpdate;
    this._children = params.children;
    this._shouldProcessChildren = params.shouldProcessChildren;
    this._shouldProcessScope = params.shouldProcessScope;
  }

  /**
   * Instantiates this builder and it's children within the given hostScope
   * @param scope - The scope this builder will be instantiated in
   * @param parent - The parent builder
   */
  instantiate(p: { scope: Scope; parent?: ScBuilder }): ScBuilder {
    return createScBuilder({
      bluePrint: this,
      scope: p.scope,
      parent: p.parent,
    });
  }

  /**
   * Override this method to react to the instantiation of the builder
   * @param hostScope - The scope this builder is instantiated in
   */
   
  onInstantiate(p: { hostScope: Scope }): void {}

  /**
   * Determines whether the builder should process a scope's children
   *
   * This method should be overridden to define which scopes should allow
   * their children to be processed by the builder.
   *
   * If the method returns `false` for a given scope, the builder will skip
   * processing its children. If it returns `true`, the children will be
   * processed.
   *
   * By default, the method checks a delegate function `shouldProcessChildren`
   * (if provided), and returns `true` if the function is not defined.
   * @param scope - The scope for which the decision to process children is
   *   made.
   */
  shouldProcessChildren(scope: Scope): boolean {
    if (this._shouldProcessChildren != null) {
      return this._shouldProcessChildren(scope);
    }
    throw new Error(
      'Please either specify shouldProcessChildren constructor ' +
        'parameter ' +
        'or override shouldProcessChildren method in your class derived ' +
        'from ScBuilderBluePrint.',
    );
  }

  /**
   * Determines whether the builder should process a scope
   *
   * This method should be overridden to define which scopes should allow
   * their children to be processed by the builder.
   *
   * If the method returns `false` for a given scope, the builder will skip
   * processing its children. If it returns `true`, the children will be
   * processed.
   *
   * By default, the method checks a delegate function `shouldProcessScope`
   * (if provided), and returns `true` if the function is not defined.
   * @param scope - The scope for which the decision to process children is
   *   made.
   */
  shouldProcessScope(scope: Scope): boolean {
    if (this._shouldProcessScope != null) {
      return this._shouldProcessScope(scope);
    }
    throw new Error(
      'Please either specify shouldProcessScope constructor ' +
        'parameter ' +
        'or override shouldProcessScope method in your class derived ' +
        'from ScBuilderBluePrint.',
    );
  }

  // ...........................................................................
  // Modify scopes

  /**
   * Override this method to add scopes to the given host scope
   * @param hostScope - The host scope the returned scopes will be added to
   */
  addScopes(p: { hostScope: Scope }): ScopeBluePrint[] {
    return this._addScopes?.({ hostScope: p.hostScope }) ?? [];
  }

  /**
   * Override this method to replace scopes in the given host scope
   * @param hostScope - The host scope the replaced scope is coming from
   * @param scopeToBeReplaced - The original version of the scope to be
   *   replaced
   */
  replaceScope(p: {
    hostScope: Scope;
    scopeToBeReplaced: ScopeBluePrint;
  }): ScopeBluePrint {
    return (
      this._replaceScope?.({
        hostScope: p.hostScope,
        scopeToBeReplaced: p.scopeToBeReplaced,
      }) ?? p.scopeToBeReplaced
    );
  }

  // ...........................................................................
  // Modify nodes

  /**
   * Override this method to add nodes to a given host scope
   * @param hostScope - The host scope the returned nodes will be added to
   */
  addNodes(p: { hostScope: Scope }): NodeBluePrint<any>[] {
    return this._addNodes?.({ hostScope: p.hostScope }) ?? [];
  }

  /**
   * Override this method to replace a scope in a given host scope
   * @param hostScope - The host scope the replaced node is coming from
   * @param nodeToBeReplaced - The original version of the node to be replaced
   */
  replaceNode(p: {
    hostScope: Scope;
    nodeToBeReplaced: Node<any>;
  }): NodeBluePrint<any> {
    return (
      this._replaceNode?.({
        hostScope: p.hostScope,
        nodeToBeReplaced: p.nodeToBeReplaced,
      }) ?? p.nodeToBeReplaced.bluePrint
    );
  }

  // ...........................................................................
  // Inserts

  /**
   * Override this method to add inserts into a given node
   * @param hostNode - The host node the returned inserts will be added to
   */
  inserts(p: { hostNode: Node<any> }): NodeBluePrint<any>[] {
    return this._inserts?.({ hostNode: p.hostNode }) ?? [];
  }

  // ...........................................................................
  // Child builders

  /**
   * A builder can define builders for child scopes
   *
   * Child builders are instantiated before parent builders.
   * I.e. the parent's builders will be applied after the child builders.
   * @param hostScope - The host scope the child builders are defined for
   */
  children(p: { hostScope: Scope }): ScBuilderBluePrint[] {
    return this._children?.({ hostScope: p.hostScope }) ?? [];
  }

  // ...........................................................................
  /**
   * Returns an example instance of the builder
   */
  static get example(): ScBuilder {
    return ExampleScBuilderBluePrint.example;
  }

  /** The key of the builder */
  readonly key: string;

  // ...........................................................................
  /** When one of these suppliers change, the rebuild method will be called */
  readonly needsUpdateSuppliers: string[];

  /**
   * Override this method to react to do something when one of the suppliers
   * in needsUpdateSuppliers has a new product.
   * @param hostScope - The scope this builder is instantiated in
   * @param components - The latest components of the suppliers
   */
  needsUpdate(p: { hostScope: Scope; components: unknown[] }): void {
    this._needsUpdate?.({ hostScope: p.hostScope, components: p.components });
  }

  // ######################
  // Private
  // ######################

  protected readonly _addScopes?: (p: {
    hostScope: Scope;
  }) => ScopeBluePrint[];

  protected readonly _replaceScope?: (p: {
    hostScope: Scope;
    scopeToBeReplaced: ScopeBluePrint;
  }) => ScopeBluePrint;

  protected readonly _addNodes?: (p: {
    hostScope: Scope;
  }) => NodeBluePrint<any>[] | undefined;

  protected readonly _replaceNode?: (p: {
    hostScope: Scope;
    nodeToBeReplaced: Node<any>;
  }) => NodeBluePrint<any> | undefined;

  protected readonly _inserts?: (p: {
    hostNode: Node<any>;
  }) => NodeBluePrint<any>[];

  protected readonly _children?: (p: {
    hostScope: Scope;
  }) => ScBuilderBluePrint[];

  protected readonly _needsUpdate?: (p: {
    hostScope: Scope;
    components: unknown[];
  }) => void;

  protected readonly _shouldProcessChildren?: (scope: Scope) => boolean;
  protected readonly _shouldProcessScope?: (scope: Scope) => boolean;
}

// #############################################################################
/**
 * An example builder
 */
export class ExampleScBuilderBluePrint extends ScBuilderBluePrint {
  /**
   * The constructor
   */
  constructor(
    params: { key?: string; needsUpdateSuppliers?: string[] } = {},
  ) {
    super({
      key: params.key ?? 'exampleScBuilder',
      needsUpdateSuppliers: params.needsUpdateSuppliers,
    });
  }

  // ...........................................................................
  override shouldProcessChildren(scope: Scope): boolean {
    return true;
  }

  // ...........................................................................
  override shouldProcessScope(scope: Scope): boolean {
    return true;
  }

  // ...........................................................................
  // Inserts

  /**
   * Will add two inserts "add111" and "p1MultiplyByTen" to all nodes
   * starting with host
   * @param hostNode - The host node the inserts will be added to
   */
  override inserts(p: { hostNode: Node<any> }): NodeBluePrint<any>[] {
    // Add an insert to all nodes which keys start with "host"
    if (p.hostNode.key.startsWith('host') && typeof p.hostNode.product === 'number') {
      return [
        new NodeBluePrint<number>({
          key: 'p0Add111',
          initialProduct: 0,
          produce: (components, previousProduct, node) => {
            return previousProduct + 111;
          },
        }),
        new NodeBluePrint<number>({
          key: 'p1MultiplyByTen',
          initialProduct: 0,
          produce: (components, previousProduct, node) => {
            return previousProduct * 10;
          },
        }),
      ];
    }

    return super.inserts({ hostNode: p.hostNode });
  }

  // ...........................................................................
  /**
   * All scopes with key 'b' will get a child builder
   * @param hostScope - The host scope the child builders are defined for
   */
  override children(p: { hostScope: Scope }): ScBuilderBluePrint[] {
    return p.hostScope.key === 'b'
      ? [new ExampleChildScBuilderBluePrint()]
      : [];
  }

  // ...........................................................................
  /**
   * Returns an example instance of the ExampleScBuilder
   */
  static override get example(): ScBuilder {
    // The example applies inserts to all nodes with a key
    // starting with 'host'.

    // Let's create a node hiearchy with nodes starting with keys
    // starting with hosts
    const scope = Scope.example({
      builders: [
        new ExampleScBuilderBluePrint({ needsUpdateSuppliers: ['a/other'] }),
      ],
      children: [
        ScopeBluePrint.fromJson({
          a: {
            hostA: 0xa,
            other: 1,
            b: { hostB: 0xb, hostC: 0xc },
          },
        }),
      ],
    });

    // Apply the builder to the scope
    scope.scm.flush();
    return scope.builders[0];
  }

  /**
   * Returns how often needsUpdate was called
   */
  get needsUpdateCalls(): readonly [Scope, unknown[]][] {
    return this._needsUpdateCalls;
  }

  private readonly _needsUpdateCalls: [Scope, unknown[]][] = [];

  // ...........................................................................
  override needsUpdate(p: { hostScope: Scope; components: unknown[] }): void {
    super.needsUpdate({ hostScope: p.hostScope, components: p.components });
    this._needsUpdateCalls.push([p.hostScope, p.components]);
  }

  override onInstantiate(p: { hostScope: Scope }): void {
    super.onInstantiate({ hostScope: p.hostScope });

    // Create a node that counts how often onInstantiate was called
    const didCallOnInstantiate = p.hostScope.findOrCreateNode<number>(
      new NodeBluePrint<number>({
        key: 'didCallOnInstantiate',
        initialProduct: 0,
      }),
    );

    didCallOnInstantiate.product++;
  }
}

// #############################################################################
/**
 * An example builder
 */
export class ExampleChildScBuilderBluePrint extends ScBuilderBluePrint {
  /**
   * The constructor
   */
  constructor(params: { key?: string } = {}) {
    super({ key: params.key ?? 'exampleChildScBuilder' });
  }

  // ...........................................................................
  override shouldProcessChildren(scope: Scope): boolean {
    return true;
  }

  // ...........................................................................
  override shouldProcessScope(scope: Scope): boolean {
    return true;
  }

  // ...........................................................................
  // Inserts

  /**
   * Will an insert "c0MultiplyByTwo" to all nodes starting with host
   * @param hostNode - The host node the inserts will be added to
   */
  override inserts(p: { hostNode: Node<any> }): NodeBluePrint<any>[] {
    // Add an insert to all nodes which keys start with "host"
    if (p.hostNode.key.startsWith('host') && typeof p.hostNode.product === 'number') {
      return [
        new NodeBluePrint<number>({
          key: 'c0MultiplyByTwo',
          initialProduct: 0,
          produce: (components, previousProduct, node) => {
            return previousProduct * 2;
          },
        }),
      ];
    }

    return super.inserts({ hostNode: p.hostNode });
  }
}
