// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { GraphToDot } from './graph-to-dot.ts';
import { GraphToMermaid, MarkdownFormat } from './graph-to-mermaid.ts';
import { Graph } from './graph.ts';
import { assert } from './internal/assert.ts';
import { ArgumentError } from './internal/errors.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { Node } from './node.ts';
import { Owner } from './owner.ts';
import { Scm } from './scm.ts';
import { ScopeBluePrint } from './scope-blue-print.ts';
import { isCamelCase } from './tools.ts';

import type { GraphScopeItem } from './graph.ts';
import type { ScBuilderBluePrint } from './sc-builder-blue-print.ts';
import type { ScBuilder } from './sc-builder.ts';
// .............................................................................
/**
 * Options used by the main creation path of {@link Scope}, mirroring Dart's
 * `factory Scope({required bluePrint, required parent, owner, isMetaScope})`.
 */
export interface ScopeOptions {
  /** The blue print of the scope. */
  bluePrint: ScopeBluePrint;

  /** The parent scope the new scope is added to. */
  parent: Scope;

  /** The owner of the scope when available. */
  owner?: Owner<Scope>;

  /** Whether the scope is a meta scope. */
  isMetaScope?: boolean;
}

// .............................................................................
/**
 * Internal options used by the private constructor of {@link Scope}.
 *
 * The `parent` may be `undefined` for the root scope, in which case `scm`
 * must be provided directly.
 */
interface ScopePrivateOptions {
  bluePrint: ScopeBluePrint;
  parent: Scope | undefined;
  owner?: Owner<Scope>;
  isMetaScope: boolean;
  scm?: Scm;
}

// .............................................................................
/** A supply scope is a container for connected nodes. */
export class Scope {
  // ...........................................................................
  /**
   * Creates a scope with a key. The key must be lower camel case.
   *
   * This is the main creation path used by `ScopeBluePrint.instantiate`. It
   * mirrors Dart's `factory Scope({...})`: it takes over the children and
   * nodes of a previously disposed scope with the same key when present.
   * @param options - The blue print, parent, owner and meta-scope flag.
   */
  constructor(options: ScopeOptions);
  // Internal overload used by the private factories.
  constructor(options: ScopePrivateOptions, _private: typeof Scope._privateKey);
  constructor(
    options: ScopeOptions | ScopePrivateOptions,
    _private?: typeof Scope._privateKey,
  ) {
    // .........................................................................
    // The private path is used by Scope.root, Scope.metaScope and the
    // _private factory. It does not perform the disposed-scope takeover.
    /* v8 ignore next */
    if (_private === Scope._privateKey) {
      const o = options as ScopePrivateOptions;
      this.bluePrint = o.bluePrint;
      this.parent = o.parent;
      this.isMetaScope = o.isMetaScope;
      this._owner = o.owner;
      this.scm = o.scm ?? o.parent!.scm;
      this.id = Scope._idCounter++;

      assert(
        isCamelCase(this.bluePrint.key),
        `Key "${this.bluePrint.key}" must be lower camel case`,
      );

      this._init({ isMetaScope: o.isMetaScope });
      return;
    }

    // .........................................................................
    // The public path mirrors Dart's `factory Scope({...})`.
    const o = options as ScopeOptions;
    const bluePrint = o.bluePrint;
    const parent = o.parent;
    const owner = o.owner;
    const isMetaScope = o.isMetaScope ?? false;

    // .........................................................................
    // There might be an existing scope that was disposed before.
    // Let's remove this scope.
    const disposedScope = parent._children.get(bluePrint.key);
    if (disposedScope != null) {
      assert(disposedScope.isDisposed);
      parent._children.delete(bluePrint.key);
    }

    // .........................................................................
    // Create the new scope
    this.bluePrint = bluePrint;
    this.parent = parent;
    this.isMetaScope = isMetaScope;
    this._owner = owner;
    this.scm = parent.scm;
    this.id = Scope._idCounter++;

    assert(
      isCamelCase(bluePrint.key),
      `Key "${bluePrint.key}" must be lower camel case`,
    );

    this._init({ isMetaScope });

    // .........................................................................
    // Move all children and nodes from the existing scope to the new scope.
    // Thus new nodes can take over the customers of their corresponding
    // disposed nodes. See "moveCustomersTo" in Node.
    assert(this._children.size === 0);
    assert(this._nodes.size === 0);
    if (disposedScope == null) {
      return;
    }

    // Move disposed child scopes to the new scope
    for (const child of disposedScope._children.values()) {
      this._children.set(child.key, child);
      child.parent = this;
    }

    // Move disposed meta scopes to the new scope
    for (const metaScope of [...disposedScope._metaScopes.values()]) {
      const existingMetaScope = this._metaScopes.get(metaScope.key);
      if (existingMetaScope == null) {
        this._metaScopes.set(metaScope.key, metaScope);
        continue;
      }
      for (const node of [...metaScope._nodes.values()]) {
        const existingNode = existingMetaScope._nodes.get(node.key);
        /* v8 ignore start */
        if (existingNode == null) {
          continue;
        }
        /* v8 ignore end */
        node.moveCustomersTo(existingNode);
      }
    }

    // Move disposed nodes to the new scope
    for (const disposedNode of [...disposedScope._nodes.values()]) {
      this._nodes.set(disposedNode.key, disposedNode);
    }

    // Erase the disposed scope
    disposedScope._erase();
  }

  // ...........................................................................
  /**
   * Private factory mirroring Dart's `Scope._private`. Used by subclasses and
   * the public factories. It does not perform the disposed-scope takeover.
   * @param options - The blue print, parent, owner and meta-scope flag.
   */
  /* v8 ignore start -- internal factory mirroring Dart's Scope._private; unused in the TS port */
  static _private(options: {
    bluePrint: ScopeBluePrint;
    parent: Scope;
    owner?: Owner<Scope>;
    isMetaScope: boolean;
  }): Scope {
    return new Scope(
      {
        bluePrint: options.bluePrint,
        parent: options.parent,
        owner: options.owner,
        isMetaScope: options.isMetaScope,
      },
      Scope._privateKey,
    );
  }
  /* v8 ignore stop */

  // ...........................................................................
  /**
   * Creates a root supply scope having no parent.
   * @param options - The key and supply chain manager of the root scope.
   */
  static root(options: { key: string; scm: Scm }): Scope {
    assert(isCamelCase(options.key));
    return new Scope(
      {
        bluePrint: new ScopeBluePrint({ key: options.key }),
        parent: undefined,
        isMetaScope: false,
        scm: options.scm,
      },
      Scope._privateKey,
    );
  }

  // ...........................................................................
  /**
   * Instantiates the scope as a meta scope.
   * @param options - The key and parent of the meta scope.
   */
  static metaScope(options: { key: string; parent: Scope }): Scope {
    return new Scope(
      {
        bluePrint: new ScopeBluePrint({ key: options.key }),
        parent: options.parent,
        isMetaScope: true,
      },
      Scope._privateKey,
    );
  }

  /** Returns the owner of the scope when available. */
  get owner(): Owner<Scope> | undefined {
    return this._owner;
  }

  /** Disposes the scope. */
  dispose(): void {
    this._dispose();
  }

  /** Sets back all nodes to its initial products. */
  reset(): void {
    for (const node of this._nodes.values()) {
      node.reset();
    }

    for (const child of this._children.values()) {
      child.reset();
    }
  }

  /** Returns true if the scope is disposed. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Returns true if the scope is erased. */
  get isErased(): boolean {
    return this._isErased;
  }

  // ...........................................................................
  /** Returns the scope as string. */
  toString(): string {
    return this.key;
  }

  /**
   * Returns true if the key matches the given key or an alias.
   * @param key - The key to match against this scope's key and aliases.
   */
  matchesKey(key: string): boolean {
    return key === this.key || this._aliases.includes(key);
  }

  // ...........................................................................
  /** The supply chain manager. */
  readonly scm: Scm;

  /** The key of the scope. */
  get key(): string {
    return this.bluePrint.key;
  }

  /** The blue print of the scope. */
  readonly bluePrint: ScopeBluePrint;

  /** The path of the scope. */
  get path(): string {
    return this._path;
  }

  /** The path of the scope as array. */
  get pathArray(): string[] {
    return this._pathArray;
  }

  /**
   * Returns true if the scope matches the path.
   * @param path - The slash separated path to match.
   */
  matchesPath(path: string): boolean {
    return this._matchesPathArray(path.split('/'));
  }

  /**
   * Returns true if the scope matches the path.
   * @param pathArray - The path segments to match.
   */
  matchesPathArray(pathArray: string[]): boolean {
    return this._matchesPathArray(pathArray);
  }

  /** The depth of the scope. */
  get depth(): number {
    return this._pathArray.length;
  }

  /** The unique id of the scope. */
  readonly id: number;

  /** Reset id counter for test purposes. */
  static testResetIdCounter(): void {
    Scope._idCounter = 0;
  }

  /**
   * Old, misspelled name of {@link testResetIdCounter}. Kept as a forwarding
   * alias because the rename shipped in a non-major release.
   * @deprecated Use testResetIdCounter instead
   */
  static testRestIdCounter(): void {
    Scope.testResetIdCounter();
  }

  // ...........................................................................
  /** Returns the child scopes. */
  get children(): readonly Scope[] {
    return [...this._children.values()].filter((e) => !e.isDisposed);
  }

  /**
   * Returns
   * - empty array when depth = 0
   * - direct children when depth = 1
   * - direct children and children of children when depth = 2
   * - all nodes when depth = -1
   * @param options - The depth to descend into the child scopes.
   */
  deepChildren(options: { depth?: number } = {}): readonly Scope[] {
    const depth = options.depth ?? 1;
    if (depth === 0) {
      return [];
    }

    const result: Scope[] = [...this.children];

    for (const child of this.children) {
      result.push(...child.deepChildren({ depth: depth - 1 }));
    }
    return result;
  }

  /**
   * Returns
   * - empty array when depth = 0 || parent == null
   * - direct parent when depth = 1
   * - parent and parent of parent when depth = 2
   * - all parents = -1
   * @param options - The depth to ascend into the parent scopes.
   */
  deepParents(options: { depth?: number } = {}): readonly Scope[] {
    const depth = options.depth ?? 1;
    if (this.parent == null || depth === 0) {
      return [];
    }

    const result: Scope[] = [this.parent];

    const parents = this.parent.deepParents({ depth: depth - 1 });
    result.push(...parents);

    return result;
  }

  /** Iterable to iterate over all scopes recursively. */
  get allScopes(): readonly Scope[] {
    const result: Scope[] = [];
    result.push(this); // Yield the current scope
    for (const child of this.children) {
      result.push(...child.allScopes); // Recursively yield all children
    }
    return result;
  }

  /**
   * Returns the child scope with the given key.
   * @param key - The key or alias of the child scope.
   */
  child(key: string): Scope | undefined {
    // Fast path: _children is keyed by the child's key
    const direct = this._children.get(key);
    if (direct != null && !direct.isDisposed) {
      return direct;
    }

    // Slow path: the key may match an alias of a child
    for (const child of this.children) {
      if (child.matchesKey(key)) {
        return child;
      }
    }
    return undefined;
  }

  /** The parent supply scope. */
  parent: Scope | undefined;

  /** Returns the root scope of this scope. */
  get root(): Scope {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: Scope = this;
    while (result.parent != null) {
      result = result.parent;
    }
    return result;
  }

  /**
   * Returns the common root of this and the other scope.
   *
   * Throws if no common parent is found.
   * @param other - The other scope to find the common parent with.
   */
  commonParent(other: Scope): Scope {
    if (other === this) {
      return this;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: Scope = this;
    let a: Scope;
    let b: Scope;

    if (other.pathArray.length > this.pathArray.length) {
      a = self;
      b = other;
    } else {
      a = other;
      b = self;
    }

    let result = a;
    while (!result.isAncestorOf(b)) {
      if (result.parent == null) {
        throw new ArgumentError('No common parent found.');
      }

      result = result.parent;
    }
    return result;
  }

  /**
   * Adds a child scope.
   * @param bluePrint - The blue print of the child scope.
   * @param options - The owner of the new scope when available.
   */
  addChild(
    bluePrint: ScopeBluePrint,
    options: { owner?: Owner<Scope> } = {},
  ): Scope {
    return bluePrint.instantiate({ scope: this, owner: options.owner });
  }

  /**
   * Adds a number of children.
   * @param bluePrints - The blue prints of the child scopes.
   * @param options - The owner of the new scopes when available.
   */
  addChildren(
    bluePrints: ScopeBluePrint[],
    options: { owner?: Owner<Scope> } = {},
  ): Scope[] {
    const result: Scope[] = [];
    for (const bluePrint of bluePrints) {
      result.push(this.addChild(bluePrint, { owner: options.owner }));
    }

    return result;
  }

  /**
   * Find or create a child scope with key.
   * @param key - The key of the child scope.
   */
  findOrCreateChild(key: string): Scope {
    const existingChild = this.child(key);
    if (existingChild != null) {
      return existingChild;
    }

    return new ScopeBluePrint({ key }).instantiate({ scope: this });
  }

  /**
   * Returns true if this scope is an ancestor of the given scope.
   * @param scope - The scope to check ancestry against.
   */
  isAncestorOf(scope: Scope): boolean {
    if (this._children.has(scope.key)) {
      return true;
    }

    for (const child of this._children.values()) {
      if (child.isAncestorOf(scope)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns true if this scope is a descendant of the given scope.
   * @param scope - The scope to check descendancy against.
   */
  isDescendantOf(scope: Scope): boolean {
    if (scope._children.has(this.key)) {
      return true;
    }

    for (const child of scope._children.values()) {
      if (this.isDescendantOf(child)) {
        return true;
      }
    }

    return false;
  }

  // ...........................................................................
  // Meta scopes & nodes

  /**
   * Returns meta scopes. These scopes manage suppliers providing information
   * about the scope.
   *
   * Note: The 'on' meta scope is created lazily. It must not be created on
   * disposed scopes - creating a meta scope would undispose its parent.
   */
  get metaScopes(): readonly Scope[] {
    if (!this.isMetaScope && !this._isDisposed) {
      this._ensureOnMetaScope();
    }
    return [...this._metaScopes.values()];
  }

  /**
   * Returns the meta scope with the given key.
   * @param key - The key of the meta scope.
   */
  metaScope(key: string): Scope | undefined {
    if (key === 'on' && !this.isMetaScope && !this._isDisposed) {
      return this._ensureOnMetaScope();
    }
    return this._metaScopes.get(key);
  }

  /**
   * Allows to add nodes to the meta scope.
   * @param key - The key of the meta scope.
   */
  metaScopeFindOrCreate(key: string): Scope {
    const existingMetaScope = this.metaScope(key);
    if (existingMetaScope != null) {
      return existingMetaScope;
    }

    const result = Scope.metaScope({ key, parent: this });
    this._metaScopes.set(key, result);
    return result;
  }

  /** Returns true if scope is a meta scope. */
  readonly isMetaScope: boolean;

  /**
   * A node informing about changes in the scope or one of its children.
   * Is undefined when Node.onRecursiveChangeEnabled is false.
   */
  onChangeRecursive!: Node<Scope> | undefined;

  /**
   * A node informing about changes in the scope.
   * Is undefined when Node.onChangeEnabled is false.
   */
  onChange!: Node<Scope> | undefined;

  // ...........................................................................
  /** The nodes of this scope. */
  get nodes(): readonly Node<any>[] {
    return [...this._nodes.values()];
  }

  /**
   * Returns the own node for a given key or undefined if not found.
   * @param key - The key of the node.
   * @typeParam T - The product type of the node.
   */
  node<T>(key: string): Node<T> | undefined {
    return this._findItemInOwnScope<T>(key, [], true, true, false, [], []) as
      | Node<T>
      | undefined;
  }

  /**
   * Returns the own node (including inserts) with exactly the given key,
   * or undefined if not found.
   * @param key - The exact key of the node.
   */
  nodeByKey(key: string): Node<any> | undefined {
    return this._nodes.get(key);
  }

  /**
   * Returns the node with key. If not available in scope the node is created.
   * @param bluePrint - The blue print of the node.
   * @typeParam T - The product type of the node.
   */
  findOrCreateNode<T>(bluePrint: NodeBluePrint<T>): Node<T> {
    // Return existing node when already existing
    const existingNode = this._nodes.get(bluePrint.key);
    if (existingNode != null) {
      assert(
        existingNode.bluePrint.equals(bluePrint),
        `Node with key "${this.key}" already exists with different configuration`,
      );
      return existingNode as unknown as Node<T>;
    }

    // Validate before creating: a misconfigured blue print should fail
    // here with a clear error, not later during production.
    bluePrint.check();

    // Create a new node. createNode honors NodeBluePrint subtypes such as
    // AnimatedNodeBluePrint; for a plain blue print it builds a plain Node.
    const node = bluePrint.createNode({ scope: this });

    return node;
  }

  /**
   * Returns the nodes with key. If not available in scope they are created.
   * @param bluePrints - The blue prints of the nodes.
   * @param options - Whether to apply ScBuilders and the optional owner.
   */
  findOrCreateNodes(
    bluePrints: NodeBluePrint<any>[],
    options: {
      applyScBuilders?: boolean;
      owner?: Owner<Node<any>>;
    } = {},
  ): Node<any>[] {
    const result: Node<any>[] = [];
    for (const bluePrint of bluePrints) {
      const newNode = bluePrint.instantiate({
        scope: this,
        applyScBuilders: options.applyScBuilders,
        owner: options.owner,
      });
      result.push(newNode);
    }
    return result;
  }

  /**
   * Adds an existing node to the scope.
   * @param node - The node to add.
   * @typeParam T - The product type of the node.
   */
  addNode<T>(node: Node<T>): void {
    assert(!this._isErased);

    // Reactivate the scope if it should be disposed
    this._undispose();

    // Take over customers from an existing disposed node
    const existingNode = this._nodes.get(node.key);
    if (existingNode?.isDisposed === true) {
      existingNode.moveCustomersTo(node as unknown as Node<any>);
      assert(existingNode.isErased);
    }
    // Throw if node with key already exists
    else if (this._nodes.has(node.key)) {
      throw new ArgumentError(
        `Node with key ${node.key} already exists in scope "${this.key}"`,
      );
    }

    // Save the node
    this._nodes.set(node.key, node as unknown as Node<any>);
  }

  /**
   * Remove the node from the scope.
   * @param key - The key of the node to remove.
   */
  removeNode(key: string): void {
    const node = this._nodes.get(key);

    // Remove the node's inserts first
    node?.clearInserts();

    this._nodes.delete(key);

    // Erase the scope if it is disposed and empty
    if (this._isDisposed && this._isEmpty) {
      this._erase();
    }
  }

  /**
   * Remove the nodes from the scope.
   * @param bluePrints - The blue prints of the nodes to remove.
   */
  removeNodes(bluePrints: NodeBluePrint<any>[]): void {
    for (const bluePrint of bluePrints) {
      this.removeNode(bluePrint.key);
    }
  }

  /**
   * Add a blue print overlay on the top of an existing node.
   * @param bluePrint - The blue print overlay to add.
   */
  addOBluePrintverlay(bluePrint: NodeBluePrint<any>): void {
    const existingNode = this._nodes.get(bluePrint.key);
    if (existingNode == null) {
      throw new ArgumentError(
        `Node with key "${bluePrint.key}" does not exist in scope "${this.key}"`,
      );
    }

    existingNode.addBluePrint(bluePrint);
  }

  /**
   * Remove an overlay added before.
   * @param bluePrint - The blue print overlay to remove.
   */
  removeBluePrintverlay(bluePrint: NodeBluePrint<any>): void {
    const existingNode = this._nodes.get(bluePrint.key);
    if (existingNode == null) {
      throw new ArgumentError(
        `Node with key "${bluePrint.key}" does not exist in scope "${this.key}"`,
      );
    }

    existingNode.removeBluePrint(bluePrint);
  }

  /**
   * Add or replace a node with the new blue print.
   * @param bluePrint - The blue print of the node.
   * @typeParam T - The product type of the node.
   */
  addOrReplaceNode<T>(bluePrint: NodeBluePrint<T>): Node<T> {
    const existingNode = this._nodes.get(bluePrint.key);
    if (existingNode != null) {
      existingNode.dispose();
    }

    const result = bluePrint.instantiate({ scope: this });
    return result;
  }

  /**
   * Returns true if a node with the given key exists in this or a
   * parent supply scope.
   * @param key - The key of the node.
   */
  hasNode(key: string): boolean {
    if (this._nodes.has(key)) {
      return true;
    }

    return this.parent?.hasNode(key) ?? false;
  }

  /**
   * Returns the node of key in this or any parent nodes.
   * @param path - The path of the node.
   * @param options - Search behavior flags.
   * @typeParam T - The product type of the node.
   */
  findNode<T>(
    path: string,
    options: {
      throwIfNotFound?: boolean;
      skipInserts?: boolean;
      excludedNodes?: Node<T>[];
    } = {},
  ): Node<T> | undefined {
    return this._findItem<T>(path, {
      throwIfNotFound: options.throwIfNotFound ?? false,
      skipInserts: options.skipInserts ?? false,
      findNodes: true,
      findScopes: false,
      excludedNodes: options.excludedNodes ?? [],
    }) as Node<T> | undefined;
  }

  /**
   * Returns the child node but only when it is a direct child.
   * @param path - The path of the node.
   * @typeParam T - The product type of the node.
   */
  findDirectChildNode<T>(path: string[]): Node<T> | undefined {
    const nodeKey = path[path.length - 1];
    const scopePath = path.slice(0, path.length - 1);

    const childScope =
      scopePath.length === 0
        ? this
        : this._findChildScope(scopePath, { didFindFirstScope: true });

    return childScope?.node<T>(nodeKey);
  }

  /**
   * Returns the first scope with the given path.
   * Throws if multiple scopes with the same path exist.
   * @param path - The slash separated path of the scope.
   */
  findChildScope(path: string): Scope | undefined {
    return this._findChildScope(path.split('/'));
  }

  /**
   * Returns the scope of path in this or any parent scopes.
   * @param path - The path of the scope.
   * @param options - Search behavior flags.
   */
  findScope(
    path: string,
    options: {
      throwIfNotFound?: boolean;
      skipInserts?: boolean;
    } = {},
  ): Scope | undefined {
    return this._findItem<unknown>(path, {
      throwIfNotFound: options.throwIfNotFound ?? false,
      skipInserts: options.skipInserts ?? false,
      findNodes: false,
      findScopes: true,
    }) as Scope | undefined;
  }

  // ...........................................................................
  /**
   * This method is called by scopeInsert to add the insert.
   * @param builder - The builder to add.
   */
  addScBuilder(builder: ScBuilder): void {
    this._builders.push(builder);
  }

  /**
   * Removes a scope insert.
   * @param builder - The builder to remove.
   */
  removeScBuilder(builder: ScBuilder): void {
    const index = this._builders.indexOf(builder);
    if (index !== -1) {
      this._builders.splice(index, 1);
    }
  }

  /**
   * Returns the builder with given key or undefined if not found.
   * @param key - The key of the builder.
   */
  builder(key: string): ScBuilder | undefined {
    return this._builders.find((element) => element.bluePrint.key === key);
  }

  /** Returns the scope inserts. */
  get builders(): ScBuilder[] {
    return this._builders;
  }

  // ...........................................................................
  /**
   * Prints all pathes of the scope or its parent.
   *
   * If `parentDepth < 0`, start at the root.
   * If `childDepth < 0`, show all children.
   * @param options - The parent/child depth and printing flags.
   */
  ls(
    options: {
      parentDepth?: number;
      childDepth?: number;
      sourceNodesOnly?: boolean;
      printProducts?: boolean;
    } = {},
  ): string[] {
    let parentDepth = options.parentDepth ?? 0;
    const childDepthInput = options.childDepth ?? -1;
    const sourceNodesOnly = options.sourceNodesOnly ?? false;
    const printProducts = options.printProducts ?? false;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let start: Scope = this;

    // If parentDepth < 0, start at the root
    if (parentDepth < 0) {
      parentDepth = 0xffff;
    }

    // Find parent node that matches the parentDepth
    let realParentDepth = 0;

    while (parentDepth > 0 && start.parent != null) {
      start = start.parent;
      realParentDepth++;
      parentDepth--;
    }

    // If childDepth > 0, we need to add the parent depth to childDepth
    let childDepth = childDepthInput;
    if (childDepth > 0) {
      childDepth += realParentDepth;
    }

    // Define the result array
    const result: string[] = [];

    // Write the tree
    this._ls({
      scope: start,
      result,
      depth: childDepth,
      currentPath: '',
      infinite: childDepth < 0,
      sourceNodesOnly,
      printProducts,
    });

    return result;
  }

  // ...........................................................................
  /**
   * Dumps all pathes of the scope or its parent as a json map.
   *
   * If `parentDepth < 0`, start at the root.
   * If `childDepth < 0`, show all children.
   * @param options - The parent/child depth and serialization flags.
   */
  jsonDump(
    options: {
      parentDepth?: number;
      childDepth?: number;
      sourceNodesOnly?: boolean;
      removeEmptyScopes?: boolean;
      throwOnNonSerializableTypes?: boolean;
    } = {},
  ): Record<string, unknown> {
    let parentDepth = options.parentDepth ?? 0;
    const childDepthInput = options.childDepth ?? -1;
    const sourceNodesOnly = options.sourceNodesOnly ?? false;
    const removeEmptyScopes = options.removeEmptyScopes ?? false;
    const throwOnNonSerializableTypes =
      options.throwOnNonSerializableTypes ?? false;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let start: Scope = this;

    // If parentDepth < 0, start at the root
    if (parentDepth < 0) {
      parentDepth = 0xffff;
    }

    // Find parent node that matches the parentDepth
    let realParentDepth = 0;

    while (parentDepth > 0 && start.parent != null) {
      start = start.parent;
      realParentDepth++;
      parentDepth--;
    }

    // If childDepth > 0, we need to add the parent depth to childDepth
    let childDepth = childDepthInput;
    if (childDepth > 0) {
      childDepth += realParentDepth;
    }

    // Define the result array
    const result: Record<string, unknown> = {};

    // Write the tree
    this._jsonDump({
      scope: start,
      result,
      depth: childDepth,
      infinite: childDepth < 0,
      sourceNodesOnly,
      throwOnNonSerializableTypes,
    });

    if (removeEmptyScopes) {
      this._removeEmptyScopes(result);
    }

    return result;
  }

  // ...........................................................................
  /**
   * Exports the current configuration of the scope as a json map.
   *
   * Exports the params of the source nodes.
   * Note: Currently only simple types are exported.
   */
  preset(): Record<string, unknown> {
    return this.jsonDump({
      parentDepth: 0,
      childDepth: -1,
      sourceNodesOnly: true,
      removeEmptyScopes: true,
      throwOnNonSerializableTypes: true,
    });
  }

  // ...........................................................................
  /**
   * Applies a preset to the scope.
   * @param preset - The preset to apply.
   * @param options - The reset/throw flags and an optional errors collector.
   */
  setPreset(
    preset: Record<string, unknown>,
    options: {
      resetBefore?: boolean;
      throwOnErrors?: boolean;
      errors?: string[];
    } = {},
  ): void {
    const resetBefore = options.resetBefore ?? true;
    const throwOnErrors = options.throwOnErrors ?? true;
    let errors = options.errors;

    const oldPreset = this.preset();

    const presetKeys = Object.keys(preset);

    // Does the key of the preset match?
    if (presetKeys.length > 1) {
      throw new Error(`Preset must have only one key "${this.key}".`);
    }

    if (presetKeys.length === 1 && presetKeys[0] !== this.key) {
      throw new Error(
        `Preset key "${presetKeys[0]}" does not match scope key "${this.key}".`,
      );
    }

    const presetValues = Object.values(preset);
    if (presetKeys.length !== 0 && !Scope._isJsonObject(presetValues[0])) {
      throw new Error('Preset value must be a JSON object.');
    }

    // Reset old state before applying the preset
    if (resetBefore) {
      this.reset();
    }

    // If preset is empty, everything is only reset
    if (presetKeys.length === 0) {
      return;
    }

    // Apply the preset
    const path = this.key;
    errors ??= [];

    try {
      this._setPreset(presetValues[0] as Record<string, unknown>, path, errors);
    } catch (e) {
      /* v8 ignore next */
      errors.push(String(e));
    }

    // Rollback the preset if an error occurs
    if (errors.length !== 0) {
      this._setPreset(
        Object.values(oldPreset)[0] as Record<string, unknown>,
        path,
        errors,
      );

      if (throwOnErrors) {
        throw new Error(`Error while applying preset:\n${errors.join('\n')}`);
      }
    }
  }

  // ...........................................................................
  /**
   * Returns a graph.
   * @param options - The scope depth limits and highlighted nodes/scopes.
   */
  graph(
    options: {
      childScopeDepth?: number;
      parentScopeDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
    } = {},
  ): GraphScopeItem {
    const graph = new Graph();
    const tree = graph.treeForScope({
      scope: this,
      childScopeDepth: options.childScopeDepth ?? -1,
      parentScopeDepth: options.parentScopeDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });
    return tree;
  }

  // ...........................................................................
  /**
   * Returns a mermaid graph.
   * @param options - The scope depth limits and highlighted nodes/scopes.
   */
  mermaid(
    options: {
      childScopeDepth?: number;
      parentScopeDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
      markdownFormat?: MarkdownFormat;
    } = {},
  ): string {
    const g = this.graph({
      childScopeDepth: options.childScopeDepth ?? -1,
      parentScopeDepth: options.parentScopeDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });

    const mm = new GraphToMermaid({ graph: g });
    return options.markdownFormat == null
      ? mm.mermaid
      : mm.markdown({ markdownFormat: options.markdownFormat });
  }

  // ...........................................................................
  /**
   * Returns a graph that can be turned into svg using graphviz.
   * @param options - The scope depth limits and highlighted nodes/scopes.
   */
  dot(
    options: {
      childScopeDepth?: number;
      parentScopeDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
    } = {},
  ): string {
    const g = this.graph({
      childScopeDepth: options.childScopeDepth ?? -1,
      parentScopeDepth: options.parentScopeDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });

    const dot = new GraphToDot({ graph: g }).dot;
    return dot;
  }

  /**
   * Save the graph to a file.
   *
   * The format can be dot, mmd, md, svg, png, pdf.
   * @param path - The output file path.
   * @param options - The scope depth limits, highlights and image options.
   */
  async writeImageFile(
    path: string,
    options: {
      childScopeDepth?: number;
      parentScopeDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
      scale?: number;
      write2x?: boolean;
      markdownFormat?: MarkdownFormat;
    } = {},
  ): Promise<void> {
    const g = this.graph({
      childScopeDepth: options.childScopeDepth ?? -1,
      parentScopeDepth: options.parentScopeDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });

    await Graph.writeImageFile({
      path,
      graph: g,
      scale: options.scale ?? 1.0,
      write2x: options.write2x ?? false,
      markdownFormat: options.markdownFormat ?? MarkdownFormat.gitHub,
    });
  }

  // Test helpers

  // ...........................................................................
  /**
   * Creates an example instance of Scope.
   * @param options - The example scope configuration.
   */
  static example(
    options: {
      scm?: Scm;
      key?: string;
      aliases?: string[];
      builders?: ScBuilderBluePrint[];
      children?: ScopeBluePrint[];
      createNode?: boolean;
      smartMaster?: string[];
    } = {},
  ): Scope {
    const scm = options.scm ?? Scm.example();
    const key = options.key ?? 'example';
    const aliases = options.aliases ?? [];
    const builders = options.builders ?? [];
    const children = options.children ?? [];
    const createNode = options.createNode ?? true;
    const smartMaster = options.smartMaster ?? [];

    const root = Scope.root({ key: 'root', scm });
    if (createNode) {
      const bluePrint = new ScopeBluePrint({
        key,
        aliases,
        builders,
        children,
        smartMaster,
      });
      const result = bluePrint.instantiate({ scope: root });
      return result;
    } else {
      return root;
    }
  }

  // ...........................................................................
  /**
   * Allows to mock the content of the scope.
   *
   * ```ts
   * const scope = Scope.example();
   * scope.mockContent({
   *   a: {
   *     int: 5,
   *     b: {
   *       int: 10,
   *       double: 3.14,
   *       string: 'hello',
   *       bool: true,
   *       enum: new NodeBluePrint<TestEnum>({
   *         key: 'enum',
   *         initialProduct: TestEnum.a,
   *       }),
   *     },
   *     c: [
   *       new ScopeBluePrint({ key: 'd' }),
   *       new ScopeBluePrint({ key: 'e' }),
   *       new ScopeBluePrint({ key: 'f' }),
   *     ],
   *   },
   * });
   * ```
   * @param content - The mocked content of the scope.
   */
  mockContent(content: Record<string, unknown>): void {
    // Iterate all entries of the map
    for (const key of Object.keys(content)) {
      const value = content[key];

      // If the entry is a NodeBluePrint, create a child node
      if (value instanceof NodeBluePrint) {
        assert(value.key === key);
        value.instantiate({ scope: this });
      }
      // If value is a ScopeBluePrint, instantiate the scope
      else if (value instanceof ScopeBluePrint) {
        assert(value.key === key);
        value.instantiate({ scope: this });
      }
      // If value is a list, instantiate a scope with child scopes
      else if (Array.isArray(value)) {
        const scope = new ScopeBluePrint({ key }).instantiate({ scope: this });

        for (const item of value) {
          if (item instanceof ScopeBluePrint) {
            item.instantiate({ scope });
          } else {
            throw new ArgumentError('Lists must only contain ScopeBluePrints.');
          }
        }
      }
      // If the entry is a map, create a child scope
      else if (Scope._isJsonObject(value)) {
        // Read aliases
        const aliases = key.split('|').map((e) => e.trim());
        const k = aliases[0];
        const a = aliases.slice(1);

        // Create the blue print
        const bluePrint = new ScopeBluePrint({ key: k, aliases: a });
        const child = bluePrint.instantiate({ scope: this });

        // Forward child content to child
        child.mockContent(value as Record<string, unknown>);
      }
      // If value is a basic type, create a node
      else {
        switch (typeof value) {
          // int, double and num collapse to number
          case 'number':
            new NodeBluePrint<number>({
              key,
              initialProduct: value,
            }).instantiate({ scope: this });
            break;
          case 'string':
            new NodeBluePrint<string>({
              key,
              initialProduct: value,
            }).instantiate({ scope: this });
            break;
          case 'boolean':
            new NodeBluePrint<boolean>({
              key,
              initialProduct: value,
            }).instantiate({ scope: this });
            break;
          default:
            throw new ArgumentError(
              `Type ${typeof value} not supported. ` +
                `Use NodeBluePrint<${typeof value}> instead.`,
            );
        }
      }
    }
  }

  // ...........................................................................
  /**
   * Returns true if this scope is a smart scope, i.e. it either has
   * a blue print that defines a smart master or it has a parent that is a
   * smart scope.
   */
  get isSmartScope(): boolean {
    return this._smartMaster.length !== 0;
  }

  /** Returns the smart master path of the scope. */
  get smartMaster(): readonly string[] {
    return this._smartMaster;
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  /** Token guarding the internal constructor overload. */
  protected static readonly _privateKey = Symbol('Scope._private');

  // ...........................................................................
  private _path!: string;
  private _pathArray!: string[];
  private _aliases!: readonly string[];
  private _isDisposed = false;
  private _isErased = false;
  private _owner: Owner<Scope> | undefined;

  // ...........................................................................
  private readonly _children = new Map<string, Scope>();
  private readonly _metaScopes = new Map<string, Scope>();
  private readonly _nodes = new Map<string, Node<any>>();
  private static _idCounter = 0;

  // ...........................................................................
  private readonly _builders: ScBuilder[] = [];

  // ...........................................................................
  private _init(options: { isMetaScope?: boolean } = {}): void {
    /* v8 ignore next -- callers always pass an explicit isMetaScope boolean */
    const isMetaScope = options.isMetaScope ?? false;
    this._initParent(isMetaScope);
    this._initPath();
    this._initAliases();
    this._initMetaScopesAndNodes();
  }

  private _initParent(isMetaScope: boolean): void {
    if (this.parent == null) {
      return;
    }

    // Get the container
    const container = isMetaScope
      ? this.parent._metaScopes
      : this.parent._children;

    // Add scope to parent scope
    assert(container.get(this.key) == null);
    container.set(this.key, this);

    // Reactivate the parent scope if it is disposed
    this.parent._undispose();
  }

  private _initPath(): void {
    this._pathArray =
      this.parent == null ? [this.key] : [...this.parent._pathArray, this.key];
    this._path =
      this.parent == null ? this.key : `${this.parent.path}/${this.key}`;
  }

  private _initAliases(): void {
    this._aliases = this.bluePrint.aliases;
  }

  // ...........................................................................
  private _initMetaScopesAndNodes(): void {
    // Meta scopes will not have meta scopes
    if (this.isMetaScope) {
      return;
    }

    // The 'on' meta scope is created lazily (_ensureOnMetaScope) - unless
    // change nodes are enabled, which live inside it.
    if (Node.onChangeEnabled || Node.onRecursiveChangeEnabled) {
      this._ensureOnMetaScope();
    }

    this._initOnChangeNode();
    this._initOnChangeRecursiveNode();
  }

  // ...........................................................................
  /**
   * Creates the 'on' meta scope providing event suppliers like on.change.
   *
   * The scope is created lazily on first access: constructing it eagerly
   * would double the cost of every scope instantiation.
   */
  private _ensureOnMetaScope(): Scope {
    return (
      this._metaScopes.get('on') ??
      Scope.metaScope({ key: 'on', parent: this })
    );
  }

  // ...........................................................................
  private _dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._owner?.willDispose?.(this);

    this._isDisposed = true;

    // Call the blue print's onDispose method
    this.bluePrint.onDispose(this);

    // Dispose the scope's nodes
    for (const node of [...this._nodes.values()]) {
      node.dispose();
    }

    // Dispose the scope's child scopes
    for (const child of [...this.children]) {
      child.dispose();
    }

    // Dispose the meta scopes
    for (const metaScope of [...this.metaScopes]) {
      metaScope.dispose();
    }

    // Add the scope to the disposed scopes
    if (!this._isEmpty) {
      this.scm.disposedItems.addScope(this);
    }
    // Erase the scope if it has no content anymore
    else {
      this._erase();
    }

    this._owner?.didDispose?.(this);
  }

  // ...........................................................................
  private _erase(): void {
    if (this._isErased) {
      return;
    }

    this._owner?.willErase?.(this);

    this._isErased = true;

    // Remove the scope from its parent container
    if (this._parentContainer.get(this.key) === this) {
      this._parentContainer.delete(this.key);
    }

    // Remove the scope from the disposed scopes
    this.scm.disposedItems.removeScope(this);

    // Erase parent container if it is disposed and empty now
    if (this.parent?.isDisposed === true && this.parent?._isEmpty === true) {
      this.parent?._erase();
    }

    // Dispose all builders
    for (const builder of [...this._builders]) {
      builder.dispose();
    }
    this._builders.length = 0;

    this._owner?.didErase?.(this);
  }

  // ...........................................................................
  private _undispose(): void {
    if (!this.isDisposed) {
      return;
    }

    this._owner?.willUndispose?.(this);

    this._isDisposed = false;
    this.parent?._undispose();
    this.scm.disposedItems.removeScope(this);

    this._owner?.didUndispose?.(this);
  }

  // ...........................................................................
  private get _parentContainer(): Map<string, Scope> {
    return this.isMetaScope ? this.parent!._metaScopes : this.parent!._children;
  }

  // ...........................................................................
  private _initOnChangeNode(): void {
    if (!Node.onChangeEnabled) {
      this.onChange = undefined;
      return;
    }

    const onScope = this.metaScope('on')!;

    const bluePrint = new NodeBluePrint<Scope>({
      key: 'change',
      initialProduct: this,
      produce: () => this,
    });

    this.onChange = bluePrint.instantiate({ scope: onScope });
  }

  // ...........................................................................
  private _initOnChangeRecursiveNode(): void {
    if (!Node.onRecursiveChangeEnabled) {
      this.onChangeRecursive = undefined;
      return;
    }

    const onScope = this.metaScope('on')!;

    const bluePrint = new NodeBluePrint<Scope>({
      key: 'changeRecursive',
      initialProduct: this,
      produce: () => this,
    });

    this.onChangeRecursive = bluePrint.instantiate({ scope: onScope });
  }

  // ...........................................................................
  /**
   * Returns the node or scope of key in this or any parent/child scopes.
   */
  private _findItem<T>(
    key: string,
    options: {
      throwIfNotFound?: boolean;
      skipInserts?: boolean;
      findNodes: boolean;
      findScopes: boolean;
      excludedNodes?: Node<T>[];
    },
  ): unknown {
    /* v8 ignore start -- callers (findNode/findScope) always pass these resolved */
    const throwIfNotFound = options.throwIfNotFound ?? false;
    const skipInserts = options.skipInserts ?? false;
    /* v8 ignore stop */
    const findNodes = options.findNodes;
    const findScopes = options.findScopes;
    let excludedNodes = options.excludedNodes ?? [];

    /* v8 ignore start */
    if (findNodes === false && findScopes === false) {
      throw new ArgumentError('findNodes and findScopes cannot be both false.');
    }

    if (findNodes && findScopes) {
      throw new ArgumentError('findNodes and findScopes cannot be both true.');
    }
    /* v8 ignore stop */

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let searchRoot: Scope = this;
    let excludedScopes: Scope[] = [];

    // Handle the case that we must only search in parent scopes
    if (key.startsWith('../')) {
      key = key.substring(3);

      if (this.parent == null) {
        return undefined;
      }
      searchRoot = this.parent;
      excludedScopes = [this];
      const excludedNode = this.node<unknown>(key);
      if (
        excludedNode != null &&
        !(excludedNodes as Node<any>[]).includes(excludedNode)
      ) {
        excludedNodes = [...excludedNodes, excludedNode as unknown as Node<T>];
      }
    }

    // Continue processing
    const keyParts = key.split('/');
    const nodeKey = keyParts[keyParts.length - 1];
    const scopePath = findNodes
      ? keyParts.slice(0, keyParts.length - 1)
      : keyParts;

    // Fail fast: when no node with the searched key exists at all, the
    // search through the scope tree can be skipped entirely. Failed
    // lookups would otherwise scan large parts of the scope tree.
    if (findNodes && !this.scm.hasNodesWithKey(nodeKey)) {
      if (throwIfNotFound) {
        throw new ArgumentError(`Node with path "${key}" not found.`);
      }
      return undefined;
    }

    let result: unknown;

    result = searchRoot._findItemInOwnScope<T>(
      nodeKey,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    result ??= searchRoot._findItemNodeInParentScopes<T>(
      nodeKey,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    result ??= searchRoot._findOneItemInChildScopes<T>(
      nodeKey,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    result ??= searchRoot._findItemInDirectSiblingScopes<T>(
      nodeKey,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    result ??= searchRoot._findItemInParentsChildScopes<T>(
      nodeKey,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    if (result == null && throwIfNotFound) {
      const item = findNodes ? 'Node' : 'Scope';
      throw new ArgumentError(`${item} with path "${key}" not found.`);
    }

    return result;
  }

  // ...........................................................................
  private _findItemInOwnScope<T>(
    nodeKey: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): unknown {
    // Return undefined if the scope is excluded
    if (excludedScopes.length !== 0) {
      if (excludedScopes.includes(this)) {
        return undefined;
      }
    }

    // If path matches own scope and path segment is the last one
    // Return this scope.
    if (findScopes && scopePath.length === 1) {
      const result = this.child(scopePath[0]) ?? this.metaScope(scopePath[0]);

      if (
        excludedScopes.length !== 0 &&
        result != null &&
        excludedScopes.includes(result)
      ) {
        return undefined;
      }

      return result;
    }

    // If path matches own scope and path segment is not the last one
    const pathMatchesOwnScope =
      scopePath.length !== 0 && this.matchesPathArray(scopePath);

    // If the scope path is not empty, find the child scope
    if (scopePath.length !== 0 && !pathMatchesOwnScope) {
      const childScope =
        this.child(scopePath[0]) ?? this.metaScope(scopePath[0]);
      if (childScope == null) {
        return undefined;
      } else {
        return childScope._findItemInOwnScope<T>(
          nodeKey,
          scopePath.slice(1),
          skipInserts,
          findNodes,
          findScopes,
          excludedNodes,
          excludedScopes,
        );
      }
    }

    // Return undefined, if we do not want to find nodes
    if (!findNodes) {
      return undefined;
    }

    // Find the node in the current scope
    const node = this._nodes.get(nodeKey);
    if (node == null) {
      return undefined;
    }

    if ((excludedNodes as Node<any>[]).includes(node)) {
      return undefined;
    }

    if (skipInserts && node.isInsert) {
      return undefined;
    }

    // Check if the scope matches the path
    const nodeMatchesPath = this.matchesPathArray(scopePath);

    /* v8 ignore next 3 -- unreachable: a non-matching scope path is already handled by the child-scope branch above */
    if (!nodeMatchesPath) {
      return undefined;
    }

    return node;
  }

  // ...........................................................................
  private _findItemNodeInParentScopes<T>(
    key: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): unknown {
    return (
      this.parent?._findItemInOwnScope<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      ) ??
      this.parent?._findItemNodeInParentScopes<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      )
    );
  }

  // ...........................................................................
  private _findItemInDirectSiblingScopes<T>(
    key: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): unknown {
    if (this.parent == null) {
      return undefined;
    }

    for (const sibling of this.parent._children.values()) {
      const node = sibling._findItemInOwnScope<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      );
      if (node != null) {
        return node;
      }
    }

    return undefined;
  }

  // ...........................................................................
  private _findOneItemInChildScopes<T>(
    key: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): unknown {
    if (excludedScopes.length !== 0) {
      for (const child of this.children) {
        if (excludedScopes.includes(child)) {
          return undefined;
        }
      }
    }

    const result: unknown[] = this._findMultipleNodesInChildScopes<T>(
      key,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    if (result.length === 0) {
      return undefined;
    } else if (result.length === 1) {
      return result[0];
    } else {
      throw new ArgumentError(
        `Scope "${this.path}": More than one node ` +
          `with key "${key}" and Type found:\n - ` +
          `${result.map((e) => (e as { path: string }).path).join('\n - ')}`,
      );
    }
  }

  // ...........................................................................
  private _findMultipleNodesInChildScopes<T>(
    key: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): object[] {
    const result: object[] = [];

    for (const child of this._children.values()) {
      const node = child._findItemInOwnScope<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      );
      if (node != null) {
        result.push(node as object);
      }
    }

    if (result.length !== 0) {
      return result;
    }

    for (const child of this._children.values()) {
      const nodes = child._findMultipleNodesInChildScopes<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      );
      result.push(...nodes);
    }

    return result;
  }

  // ...........................................................................
  private _findItemInParentsChildScopes<T>(
    key: string,
    scopePath: string[],
    skipInserts: boolean,
    findNodes: boolean,
    findScopes: boolean,
    excludedNodes: Node<T>[],
    excludedScopes: Scope[],
  ): unknown {
    if (this.parent == null) {
      return undefined;
    }

    const result = this.parent._findOneItemInChildScopes<T>(
      key,
      scopePath,
      skipInserts,
      findNodes,
      findScopes,
      excludedNodes,
      excludedScopes,
    );

    if (result != null) {
      return result;
    } else {
      return this.parent._findItemInParentsChildScopes<T>(
        key,
        scopePath,
        skipInserts,
        findNodes,
        findScopes,
        excludedNodes,
        excludedScopes,
      );
    }
  }

  // ...........................................................................
  private _findChildScope(
    path: string[],
    options: { didFindFirstScope?: boolean } = {},
  ): Scope | undefined {
    const didFindFirstScope = options.didFindFirstScope ?? false;
    /* v8 ignore next 3 -- guard: callers never pass an empty path (split always yields >=1 segment) */
    if (path.length === 0) {
      return undefined;
    }

    if (path.length === 1) {
      if (this.matchesKey(path[0])) {
        return this;
      }
      const metaScopeForKey = this.metaScope(path[0]);
      if (metaScopeForKey != null) {
        return metaScopeForKey;
      }
    }

    if (path[0] === this.key || this.matchesKey(path[0])) {
      return this._findChildScope(path.slice(1), { didFindFirstScope: true });
    }

    if (didFindFirstScope) {
      const directChild = this.child(path[0]);
      if (directChild == null) {
        return undefined;
      } else {
        const restPath = path.slice(1);
        return restPath.length === 0
          ? directChild
          : directChild._findChildScope(restPath, {
              didFindFirstScope: true,
            });
      }
    }

    for (const child of this._children.values()) {
      const result = child._findChildScope(path);
      if (result != null) {
        return result;
      }
    }

    return undefined;
  }

  // ...........................................................................
  private _matchesPathArray(path: string[]): boolean {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let parent: Scope | undefined = this;
    let i = path.length - 1;

    while (i >= 0 && parent != null) {
      const segment = path[i];
      if (segment === '..') {
        i--;
        continue;
      }
      if (!parent.matchesKey(segment)) {
        return false;
      }

      parent = parent.parent;
      i--;
    }

    return true;
  }

  // ...........................................................................
  private get _isEmpty(): boolean {
    return (
      this._nodes.size === 0 &&
      this._children.size === 0 &&
      this._metaScopes.size === 0
    );
  }

  // ...........................................................................
  private _ls(options: {
    scope: Scope;
    result: string[];
    currentPath: string;
    depth: number;
    infinite: boolean;
    sourceNodesOnly: boolean;
    printProducts: boolean;
  }): void {
    const {
      scope,
      result,
      currentPath,
      depth,
      infinite,
      sourceNodesOnly,
      printProducts,
    } = options;

    if (!infinite && depth < 0) {
      return;
    }

    const dot = currentPath.length === 0 ? '' : '/';

    // Write children
    for (const child of scope.children) {
      const childPath = `${currentPath}${dot}${child.key}`;
      if (!sourceNodesOnly) {
        result.push(childPath);
      }

      child._ls({
        scope: child,
        result,
        depth: depth - 1,
        currentPath: childPath,
        infinite,
        sourceNodesOnly,
        printProducts,
      });
    }

    // Write nodes
    for (const node of scope.nodes) {
      if (sourceNodesOnly && node.bluePrint.suppliers.length !== 0) {
        continue;
      }

      const product = node.product;
      const value =
        printProducts &&
        (typeof product === 'number' || typeof product === 'string')
          ? ` (${node.product})`
          : '';

      result.push(`${currentPath}${dot}${node.key}${value}`);
    }
  }

  // ...........................................................................
  private _jsonDump(options: {
    scope: Scope;
    result: Record<string, unknown>;
    depth: number;
    infinite: boolean;
    sourceNodesOnly: boolean;
    throwOnNonSerializableTypes: boolean;
  }): void {
    const {
      scope,
      result,
      depth,
      infinite,
      sourceNodesOnly,
      throwOnNonSerializableTypes,
    } = options;

    if (!infinite && depth < 0) {
      return;
    }

    const content: Record<string, unknown> = {};
    result[scope.key] = content;

    // Write children
    for (const child of scope.children) {
      child._jsonDump({
        scope: child,
        result: content,
        depth: depth - 1,
        infinite,
        sourceNodesOnly,
        throwOnNonSerializableTypes,
      });
    }

    // Write nodes
    for (const node of scope.nodes) {
      if (sourceNodesOnly && node.bluePrint.suppliers.length !== 0) {
        continue;
      }

      try {
        content[node.key] = node.productAsJson;
      } catch (e) {
        content[node.key] = String(e)
          .replaceAll('"', '\\"')
          .replaceAll('\n', ' ');

        if (throwOnNonSerializableTypes) {
          throw e;
        }
      }
    }
  }

  // ...........................................................................
  private _removeEmptyScopes(map: Record<string, unknown>): void {
    const keys = Object.keys(map);
    for (const key of keys) {
      const value = map[key];
      if (Scope._isJsonObject(value)) {
        this._removeEmptyScopes(value as Record<string, unknown>);
        if (Object.keys(value as Record<string, unknown>).length === 0) {
          delete map[key];
        }
      }
    }
  }

  // ...........................................................................
  private _setPreset(
    preset: Record<string, unknown>,
    path: string,
    errors: string[],
  ): void {
    for (const key of Object.keys(preset)) {
      const value = preset[key];
      const childPath = `${path}/${key}`;

      const isMap = Scope._isJsonObject(value);
      const c: Scope | undefined = isMap ? this.child(key) : undefined;
      const n: Node<any> | undefined =
        c != null ? undefined : this.node<unknown>(key);

      if (isMap && n == null) {
        if (c != null) {
          c._setPreset(value as Record<string, unknown>, childPath, errors);
        } else {
          errors.push(`Scope "${childPath}" not found.`);
        }
      } else {
        if (n != null) {
          try {
            // int/double distinction collapses to number; assign as-is when
            // the value is a number, string, boolean or array.
            if (
              typeof value === 'number' ||
              typeof value === 'string' ||
              typeof value === 'boolean' ||
              Array.isArray(value)
            ) {
              n.product = value;
            } else {
              n.productAsJson = value;
            }
          } catch (e) {
            const printed = Scope._isJsonObject(value) ? 'JSON object' : value;
            const message = [
              `Node "${childPath}" could not be set to value "${printed}".`,
              String(e).replaceAll("'", '"'),
            ].join('\n');

            /* v8 ignore next -- dedup guard: identical error messages are not produced twice in practice */
            if (!errors.includes(message)) {
              errors.push(message);
            }
          }
        } else {
          errors.push(`Node "${childPath}" not found.`);
        }
      }
    }
  }

  // ...........................................................................
  private get _smartMaster(): readonly string[] {
    // Meta scopes are currently no smart scopes
    if (this.isMetaScope) {
      return [];
    }

    // If this scope's blue print is a smart scope return the blue print's
    // smart master path
    if (this.bluePrint.isSmartScope) {
      return this.bluePrint.smartMaster;
    }

    // Otherwise this scope becomes a smart scope when it is contained in a
    // smart scope. Compute the parent's smart master only once - it
    // recurses up the scope tree.
    const parentSmartMaster = this.parent?.smartMaster;
    if (parentSmartMaster != null && parentSmartMaster.length !== 0) {
      return [...parentSmartMaster, this.key];
    }

    return [];
  }

  // ...........................................................................
  /**
   * Returns true if the value is a plain JSON object (a Dart string-keyed
   * map). Arrays and class instances are not JSON objects here.
   */
  private static _isJsonObject(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null)
    );
  }
}

// #############################################################################
// Example scopes for test purposes

// .............................................................................
/** An example root scope. */
export class ExampleScopeRoot extends Scope {
  /**
   * Constructor.
   * @param options - The supply chain manager and the scope key.
   */
  constructor(options: { scm: Scm; key?: string }) {
    super(
      {
        bluePrint: new ScopeBluePrint({ key: options.key ?? 'exampleRoot' }),
        parent: undefined,
        isMetaScope: false,
        scm: options.scm,
      },
      Scope._privateKey,
    );

    this.findOrCreateNode(
      new NodeBluePrint<number>({
        initialProduct: 0,
        produce: (_components, previous) =>
          /* v8 ignore next */
          (previous as number) + 1,
        key: 'rootA',
      }),
    );

    this.findOrCreateNode(
      new NodeBluePrint<number>({
        initialProduct: 0,
        produce: (_components, previous) => (previous as number) + 1,
        key: 'rootB',
      }),
    );

    new ExampleChildScope({ key: 'childScopeA', parent: this });
    new ExampleChildScope({ key: 'childScopeB', parent: this });
  }
}

// .............................................................................
/** An example child scope. */
export class ExampleChildScope extends Scope {
  /**
   * Constructor.
   * @param options - The scope key and parent scope.
   */
  constructor(options: { key: string; parent: Scope }) {
    super(
      {
        bluePrint: new ScopeBluePrint({ key: options.key }),
        parent: options.parent,
        isMetaScope: false,
      },
      Scope._privateKey,
    );

    // Create a node
    this.findOrCreateNode(
      new NodeBluePrint<number>({
        initialProduct: 0,
        documentation: '<code>result = previous + 1</code>',
        produce: (_components, previous) => (previous as number) + 1,
        key: 'childNodeA',
        suppliers: ['rootA', 'rootB', 'childScopeA/childNodeB'],
      }),
    );

    this.findOrCreateNode(
      new NodeBluePrint<number>({
        initialProduct: 0,
        documentation: '<code>result = previous + 1</code>',
        produce: (_components, previous) => (previous as number) + 1,
        key: 'childNodeB',
      }),
    );

    // Create an example child scope
    new ExampleGrandChildScope({ key: 'grandChildScope', parent: this });
  }
}

// .............................................................................
/** An example grand child scope. */
export class ExampleGrandChildScope extends Scope {
  /**
   * Constructor.
   * @param options - The scope key and parent scope.
   */
  constructor(options: { key: string; parent: Scope }) {
    super(
      {
        bluePrint: new ScopeBluePrint({ key: options.key }),
        parent: options.parent,
        isMetaScope: false,
      },
      Scope._privateKey,
    );

    this.findOrCreateNode(
      new NodeBluePrint<number>({
        initialProduct: 0,
        produce: (_components, previous) => (previous as number) + 1,
        key: 'grandChildNodeA',
        suppliers: ['rootA'],
      }),
    );
  }
}
