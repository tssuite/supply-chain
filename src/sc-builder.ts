// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Scope } from './scope.ts';
import type { Node } from './node.ts';
import { ScBuilderBluePrint } from './sc-builder-blue-print.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { ScBuilderNodeAdder } from './sc-builder-node-adder.ts';
import { ScBuilderNodeReplacer } from './sc-builder-node-replacer.ts';
import { ScBuilderScopeAdder } from './sc-builder-scope-adder.ts';
import { ScBuilderInserts } from './sc-builder-inserts.ts';

/// Realizes a builder
export class ScBuilder {
  /// Instante of a builder blue print
  constructor({
    bluePrint,
    scope,
    parent,
  }: {
    bluePrint: ScBuilderBluePrint;
    scope: Scope;
    parent?: ScBuilder;
  }) {
    this.bluePrint = bluePrint;
    this.scope = scope;
    this.parent = parent;

    this._init();
    this.applyToScope(scope);
    ScBuilder.instances.push(this);
    this.bluePrint.onInstantiate({ hostScope: scope });
  }

  /// Disposes the builder
  dispose(): void {
    for (const dispose of [...this._dispose].reverse()) {
      dispose();
    }
    const index = ScBuilder.instances.indexOf(this);
    if (index !== -1) {
      ScBuilder.instances.splice(index, 1);
    }
    this._dispose.length = 0;

    if (this.parent) {
      const childIndex = this.parent._children.indexOf(this);
      if (childIndex !== -1) {
        this.parent._children.splice(childIndex, 1);
      }
    }
  }

  /// The parent builder
  parent?: ScBuilder;

  /// All instances of the builder
  static readonly instances: ScBuilder[] = [];

  /// Applies the builder to this scope and all its children
  applyToScope(scope: Scope, { applyChildBuilders = true } = {}): void {
    // Process the current scope
    if (this.bluePrint.shouldProcessScope(scope)) {
      this.inserts.applyToScope(scope);
      this.nodeReplacer.applyToScope(scope);
      this.nodeAdder.applyToScope(scope);
      this.scopeAdder.applyToScope(scope);

      if (applyChildBuilders) {
        this._applyChildBuilders(scope);
      }
    }

    // Process children
    if (!this.bluePrint.shouldProcessChildren(scope)) return;

    for (const child of scope.children) {
      this.applyToScope(child, { applyChildBuilders });
    }
  }

  /// Applies the builder to this node
  applyToNode(node: Node<any>): void {
    this.inserts.applyToNode(node);
    this.nodeReplacer.applyToNode(node);
  }

  /// The blue print of the builder
  readonly bluePrint: ScBuilderBluePrint;

  /// The scope this builder is instantiated in
  readonly scope: Scope;

  /// Returns an example instance of the builder
  static example(): ScBuilder {
    return ScBuilderBluePrint.example;
  }

  /// The inserts of the builder
  inserts!: ScBuilderInserts;

  /// The node replacer of the builder
  nodeReplacer!: ScBuilderNodeReplacer;

  /// The node adder of the builder
  nodeAdder!: ScBuilderNodeAdder;

  /// The scope adder of the builder
  scopeAdder!: ScBuilderScopeAdder;

  /// This scope is used to perform checks
  static readonly testScope = Scope.example({
    key: `scBuilderTestScope${Math.floor(Math.random() * 1000)}`,
  });

  // ######################
  // Private
  // ######################
  private readonly _children: ScBuilder[] = [];

  private readonly _dispose: Array<() => void> = [];

  private _init(): void {
    this._initScope();
    this._initInserts();
    this._initNodeReplacer();
    this._initNodeAdder();
    this._initScopeAdder();
    this._updateOnSupplierChange();
  }

  private _initScope(): void {
    if (this.scope.builder(this.bluePrint.key) != null) {
      return;
      // throw ArgumentError(
      //   'Another builder with key ${bluePrint.key} is added.',
      // );
    }

    this.scope.addScBuilder(this);

    this._dispose.push(() => this.scope.removeScBuilder(this));
  }

  private _initInserts(): void {
    this.inserts = new ScBuilderInserts({ builder: this });
    this._dispose.push(() => this.inserts.dispose());
  }

  private _initNodeReplacer(): void {
    this.nodeReplacer = new ScBuilderNodeReplacer({ builder: this });
    this._dispose.push(() => this.nodeReplacer.dispose());
  }

  private _initNodeAdder(): void {
    this.nodeAdder = new ScBuilderNodeAdder({ builder: this });
    this._dispose.push(() => this.nodeAdder.dispose());
  }

  private _initScopeAdder(): void {
    this.scopeAdder = new ScBuilderScopeAdder({ builder: this });
    this._dispose.push(() => this.scopeAdder.dispose());
  }

  private _applyChildBuilders(scope: Scope): void {
    for (const child of this.bluePrint.children({ hostScope: scope })) {
      this._children.push(child.instantiate({ scope, parent: this }));
    }

    this._dispose.push(() => {
      for (const child of [...this._children]) {
        child.dispose();
      }
    });
  }

  // ...........................................................................
  private _updateOnSupplierChange(): void {
    // No suppliers? Do nothing.
    if (this.bluePrint.needsUpdateSuppliers.length === 0) {
      return;
    }

    // Get the builders meta scope
    const buildersMetaScope = this.scope.metaScopeFindOrCreate('builders');

    // Create a node blue print listening to changes on the supplier
    const needsUpdate = new NodeBluePrint<void>({
      key: `${this.bluePrint.key}NeedsUpdate`,
      suppliers: this.bluePrint.needsUpdateSuppliers,
      initialProduct: null as unknown as void,
      produce: (components, _previousProduct, _node) =>
        this.bluePrint.needsUpdate({ hostScope: this.scope, components }),
    });

    // Instantiate the blue print within host scospe
    const onChangeNode = needsUpdate.instantiate({ scope: buildersMetaScope });

    this._dispose.push(() => onChangeNode.dispose());
  }
}

// Register the ScBuilder factory so sc-builder-blue-print.ts can create
// builders without a runtime import (breaks the ESM cycle).
import { registerScBuilderFactory } from './internal/registry.ts';
registerScBuilderFactory((options) => new ScBuilder(options));
