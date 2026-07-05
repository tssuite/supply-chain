// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assert } from './internal/assert.ts';
import { ArgumentError } from './internal/errors.ts';
import { isCamelCase } from './tools.ts';
import { Duration } from './duration.ts';
import { Priority } from './priority.ts';
import { Owner } from './owner.ts';
import { Scope } from './scope.ts';
import { Scm } from './scm.ts';
import { NodeBluePrint, doNothing, nbp } from './node-blue-print.ts';
import { Graph, GraphScopeItem } from './graph.ts';
import { GraphToDot } from './graph-to-dot.ts';
import { GraphToMermaid, MarkdownFormat } from './graph-to-mermaid.ts';
// Insert participates in a reference cycle with Node. Import the type only so
// node.ts never runtime-imports insert.ts. The boolean `isInsert` flag is used
// instead of `instanceof Insert`, and casts go through `as unknown as`.
import type { Insert } from './insert.ts';

/** A supplier delivers products to a node */
export type Supplier<T> = Node<T>;

/** A customer receives products to a node */
export type Customer<T> = Node<T>;

/** A worker is a node on the assembly line */
export type Worker<T> = Node<T>;

/**
 * Produce delegate.
 *
 * May return a product synchronously (`T`) or asynchronously (`Promise<T>`).
 * Synchronous producers behave exactly as before. Asynchronous producers keep
 * the node in production until their promise resolves or the node's
 * {@link Node.productionTimeout} elapses.
 * @typeParam T - The type of the produced product.
 */
export type Produce<T> = (
  components: unknown[],
  previousProduct: T,
  node: Node<T>,
) => T | Promise<T>;

/**
 * A node in a scope.
 * @typeParam T - The type of the product produced by the node.
 */
export class Node<T> {
  /**
   * Creates a new node.
   * @param p - The node configuration.
   *   produce function, key and initial product.
   */
  constructor(p: {
    bluePrint: NodeBluePrint<T>;
    scope: Scope;
    isInsert?: boolean;
    owner?: Owner<Node<any>>;
  }) {
    this.scope = p.scope;
    this.isInsert = p.isInsert ?? false;
    this.scm = p.scope.scm;
    this._owner = p.owner;
    this._originalProduct = p.bluePrint.initialProduct;
    assert(isCamelCase(p.bluePrint.key));
    this._bluePrints.push(p.bluePrint);
    this._init();
  }

  /** Allows to listen to 'on/change' */
  static onChangeEnabled = false;

  /** Allows to listen to 'on.recursiveChange' */
  static onRecursiveChangeEnabled = false;

  // ...........................................................................
  /**
   * Disposes the node.
   * - All suppliers are removed: node will not update anymore.
   * - Node is marked as disposed.
   * - When node has no customers anymore it will also be erased.
   * - As long the node has still customers it remains in the node hierarchy
   *   to not break the chain.
   */
  dispose(): void {
    this._owner?.willDispose?.(this);
    this._isDisposed = true;

    // Remove the node from the scm's prepared sets. Disposed nodes must not
    // keep the production pipeline open.
    this.scm.removeDisposedNode(this);

    // Supersede any in-flight asynchronous production so its late result is
    // discarded by [_onAsyncResult].
    this._produceGeneration++;
    this._isProducingAsync = false;

    // Remove all suppliers
    for (const supplier of [...this.suppliers]) {
      this._removeSupplier(supplier);
    }

    // Tell Scm to update smartNodes
    this.scm.updateSmartNodes(this);

    // Mute suppliers in the bluePrint
    if (this.bluePrint.suppliers.length !== 0 && !this.isSmartNode) {
      const muted = this.bluePrint.copyWith({
        produce: doNothing as Produce<T>,
        suppliers: [],
      });
      this.addBluePrint(muted);
    }

    // Add the node to disposed.nodes
    if (this.customers.length !== 0) {
      this.scm.disposedItems.addNode(this);
    }
    // Erase the node if it should not have customers relying on it
    else {
      this._erase();
    }

    this._owner?.didDispose?.(this);
  }

  // ...........................................................................
  /** Erases the node */
  private _erase(): void {
    this._owner?.willErase?.(this);
    assert(this.customers.length === 0);
    assert(this.isDisposed);

    assert(
      this.scope.node<T>(this.key) === this ||
        this.scope.node<T>(this.key) == null,
    );
    this.scope.removeNode(this.key);
    this.scm.removeNode(this);
    this.scm.disposedItems.removeNode(this);

    this._isErased = true;
    this._owner?.didErase?.(this);
  }

  /** Returns true if node is initialized */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /** Returns true if node is erased */
  get isErased(): boolean {
    return this._isErased;
  }

  /** Returns true if the node is disposed */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Returns true if node is a smartNode */
  get isSmartNode(): boolean {
    return this.smartMaster.length !== 0;
  }

  // ...........................................................................
  /** Set back to initial state */
  reset(): void {
    if (this._originalProduct === this.bluePrint.initialProduct) {
      return;
    }

    this._originalProduct = this.bluePrint.initialProduct;
    this.scm.nominate(this);
  }

  // ...........................................................................
  /** ScBuilders use this method to replace the present blue print */
  addBluePrint(bluePrint: NodeBluePrint<T>): void {
    // Replacing blueprints is not allowed for smartNode blueprints
    assert(!this.isSmartNode);
    this._addBluePrint(bluePrint);
  }

  /** ScBuilders use this method to remove a formerly added blue print */
  removeBluePrint(bp: NodeBluePrint<T>): void {
    if (!this._bluePrints.includes(bp)) {
      throw new ArgumentError(`The blue print "${bp.key}" does not exist.`);
    }

    if (this._bluePrints[0] === bp) {
      throw new ArgumentError('Cannot remove last bluePrint.');
    }

    const index = this._bluePrints.indexOf(bp);
    /* v8 ignore next -- guard: bp presence was already validated above */
    if (index !== -1) {
      this._bluePrints.splice(index, 1);
    }

    if (!this.isDisposed) {
      this.reset();
      this.scm.nominate(this);
    }
  }

  // ...........................................................................
  /** Called by SCM to update smartNodes */
  addSmartNodeReplacement(smartNode: NodeBluePrint<T>): void {
    assert(this.isSmartNode);
    assert(this.allBluePrints.length === 1);
    this._addBluePrint(smartNode);
  }

  // ...........................................................................
  /** Called by SCM to update smartNodes */
  resetSmartNodeReplacements(): void {
    assert(this.isSmartNode);
    assert(this.allBluePrints.length <= 2);
    if (this.allBluePrints.length === 2) {
      this.removeBluePrint(this.allBluePrints[this.allBluePrints.length - 1]);
    }
  }

  // ...........................................................................
  /** The configuration of this node */
  get bluePrint(): NodeBluePrint<T> {
    return this._bluePrint;
  }

  // ...........................................................................
  /** Returns all stacked blue prints */
  get allBluePrints(): NodeBluePrint<T>[] {
    return this._bluePrints;
  }

  // ...........................................................................
  // Identification
  /** The key of the node */
  get key(): string {
    return this.bluePrint.key;
  }

  /** The path of the node */
  get path(): string {
    return `${this.scope.path}/${this.key}`;
  }

  /**
   * Returns true, if this path matches the given path.
   * @param path - The path to match against.
   */
  matchesPath(path: string): boolean {
    return this._matchesPath(path.split('/'));
  }

  private static _idCounter = 0;

  /** The unique id of the node */
  readonly id: number = Node._idCounter++;

  /** Returns the key of the node */
  toString(): string {
    return this.key;
  }

  // ...........................................................................
  // Product

  /** The product of the node */
  get product(): T {
    return this._mockedProduct ?? this.insertResult ?? this._originalProduct;
  }

  /** The product of the node */
  set product(v: T) {
    assert(
      this.bluePrint.produce === (doNothing as unknown as Produce<T>),
      `${this.path}:  Product can only be set if bluePrint.produce is doNothing`,
    );
    this._throwIfNotAllowed(v);
    this._originalProduct = v;
    this.scm.nominate(this);
  }

  /** Returns the product converted to a JSON value */
  get productAsJson(): unknown {
    return this.bluePrint.toJson(this.product);
  }

  /** Sets the product from a JSON value */
  set productAsJson(json: unknown) {
    this.product = this.bluePrint.fromJson(json);
  }

  /** Returns the original product not processed by inserts */
  get originalProduct(): T {
    return this._mockedProduct ?? this._originalProduct;
  }

  /** If mocked product is set, this product is returned */
  set mockedProduct(t: T | undefined) {
    this._mockedProduct = t;
    this.scm.nominate(this);
  }

  /** Returns the mocked product or undefined */
  get mockedProduct(): T | undefined {
    return this._mockedProduct;
  }

  // ...........................................................................
  // Animation

  /** Returns true if node is animated */
  get isAnimated(): boolean {
    return this._isAnimated;
  }

  /** Assign true if node is animated. Node will be nominated on every frame. */
  set isAnimated(v: boolean) {
    if (this._isAnimated === v) {
      return;
    }

    this._isAnimated = v;

    if (v) {
      this.scm.animateNode(this);
    } else {
      this.scm.deanimateNode(this);
    }
  }

  // ...........................................................................
  // Preparation

  /** Returns true if node and its customers need to be prepared for production */
  needsPreparation(): boolean {
    // If new priority is higher then current one, a new preparation is needed
    return !this.isStaged;
  }

  /** Prepares the node for production with a given priority */
  prepare(): void {
    this.isStaged = true;
  }

  /** Returns true, if node is not staged */
  get isReady(): boolean {
    return !this.isStaged;
  }

  /** Is ready to produce when all suppliers are ready */
  get isReadyToProduce(): boolean {
    if (!this._suppliersAreInitialized) {
      return false;
    }

    for (const supplier of this.suppliers) {
      if (!supplier.isReady) {
        return false;
      }
    }
    return true;
  }

  // ...........................................................................
  // Priority

  /** The node's own priority. */
  get ownPriority(): Priority {
    return this._ownPriority;
  }

  /** Changes node's own priority */
  set ownPriority(p: Priority) {
    this._ownPriority = p;
    this.scm.priorityHasChanged(this);
  }

  /** SCM uses this to assign the highest customer priority */
  customerPriority: Priority | undefined;

  /** The used priority. Is the highest priority of node and its customers */
  get priority(): Priority {
    return this.customerPriority != null &&
      this.customerPriority.value > this.ownPriority.value
      ? this.customerPriority
      : this.ownPriority;
  }

  // ...........................................................................
  // Production

  private readonly _products: unknown[] = [];

  /** The product produced by this node */
  private _originalProduct: T;

  /**
   * Monotonic production generation.
   *
   * Incremented on every {@link produce} call. An asynchronous production
   * captures the generation it started with; when its promise resolves with a
   * different current generation (e.g. because the node was re-nominated,
   * mocked or disposed in the meantime) the result is discarded as superseded.
   */
  private _produceGeneration = 0;

  private _isProducingAsync = false;

  /** Returns true while an asynchronous production is in flight. */
  get isProducingAsync(): boolean {
    return this._isProducingAsync;
  }

  /**
   * Produces the product.
   *
   * The produce function may return its product synchronously (`T`) or
   * asynchronously (`Promise<T>`). Synchronous products are applied immediately
   * (unchanged behavior). Asynchronous products keep the node in production
   * until the promise resolves or the node's {@link productionTimeout} elapses
   * (see {@link Scm}).
   * @param p - Production options.
   */
  produce(p: { announce?: boolean; triggerOnChange?: boolean } = {}): void {
    const announce = p.announce ?? true;
    const triggerOnChange = p.triggerOnChange ?? true;

    assert(!this.isDisposed);
    assert(this._suppliersAreInitialized);

    // Each production gets a unique generation. This supersedes any in-flight
    // asynchronous production from a previous call (including the mocked case
    // below), so its late result will be discarded by [_onAsyncResult].
    const generation = ++this._produceGeneration;

    if (this._mockedProduct != null) {
      this._isProducingAsync = false;
      this.scm.unregisterAsyncProduction(this);
      if (announce) {
        this.scm.hasNewProduct(this);
      }
      return;
    }

    let i = 0;
    for (const supplier of this.suppliers) {
      this._products[i] = supplier.product;
      i++;
    }

    const result = this.bluePrint.produce(
      this._products,
      this.previousProduct,
      this,
    );

    // Asynchronous production: keep the node in production. The result is
    // applied when the promise resolves (see [_onAsyncResult]). Until then the
    // node stays in scm.producingNodes - or until its productionTimeout
    // elapses, in which case it is finalized with the previous product.
    if (result instanceof Promise) {
      this._isProducingAsync = true;
      this.scm.registerAsyncProduction(this, result);
      result.then(
        (value: T) =>
          this._onAsyncResult(value, generation, announce, triggerOnChange),
        (error: unknown) =>
          this._onAsyncError(error, generation, announce, triggerOnChange),
      );
      return;
    }

    // Synchronous production.
    this._applyProduct(result, announce, triggerOnChange);
  }

  // ...........................................................................
  /** Applies a freshly produced [newProduct] and announces it via the SCM. */
  private _applyProduct(
    newProduct: T,
    announce: boolean,
    triggerOnChange: boolean,
  ): void {
    this._throwIfNotAllowed(newProduct);

    this._originalProduct = newProduct;

    // If this node is the last insert in the chain,
    // write the product into the host's insertResult
    if (this.isInsert) {
      const insert = this as unknown as Insert<T>;
      if (insert.isLastInsert) {
        insert.host.insertResult = newProduct;
      }
    }

    // Announce
    if (announce) {
      this.scm.hasNewProduct(this);
    }

    if (triggerOnChange) {
      this._triggerOnChange();
    }
  }

  // ...........................................................................
  /** Handles the result of an asynchronous production. */
  private _onAsyncResult(
    value: T,
    generation: number,
    announce: boolean,
    triggerOnChange: boolean,
  ): void {
    // Superseded by a newer production, or the node is gone: discard. Do not
    // touch the registry here - a newer production may own the current entry.
    if (
      generation !== this._produceGeneration ||
      this.isDisposed ||
      this.isErased
    ) {
      return;
    }

    this._isProducingAsync = false;
    this.scm.unregisterAsyncProduction(this);

    // Resolved within the production timeout and still producing: announce the
    // new product through the regular path (single update).
    if (this.scm.producingNodes.includes(this)) {
      this._applyProduct(value, announce, triggerOnChange);
      return;
    }

    // The production timeout already finalized this node with the previous
    // product. Apply the fresh product now and propagate it as a follow-up
    // update. We must not call scm.hasNewProduct here because the node already
    // left scm.producingNodes.
    this._throwIfNotAllowed(value);
    this._originalProduct = value;
    if (this.isInsert) {
      const insert = this as unknown as Insert<T>;
      if (insert.isLastInsert) {
        insert.host.insertResult = value;
      }
    }
    /* v8 ignore next -- SCM always drives async productions with triggerOnChange=true */
    if (triggerOnChange) {
      this._triggerOnChange();
    }
    this.scm.applyLateAsyncResult(this);
  }

  // ...........................................................................
  /** Handles a rejected asynchronous production. */
  private _onAsyncError(
    error: unknown,
    generation: number,
    announce: boolean,
    triggerOnChange: boolean,
  ): void {
    if (
      generation !== this._produceGeneration ||
      this.isDisposed ||
      this.isErased
    ) {
      return;
    }

    this._isProducingAsync = false;
    this.scm.unregisterAsyncProduction(this);

    // Keep the previous product. Surface the error through the SCM hook.
    this.scm.reportProductionError(this, error);

    // Free the node from production. If the timeout already finalized it, the
    // previous product is already in place and there is nothing to propagate.
    if (this.scm.producingNodes.includes(this)) {
      this.scm.hasNewProduct(this);
    }
  }

  /** Returns true, if node is staged for production */
  isStaged = false;

  /** Finalizes production */
  finalizeProduction(): void {
    this.isStaged = false;
  }

  // ...........................................................................
  // Suppliers

  /** The suppliers of the node */
  get suppliers(): readonly Node<any>[] {
    return this._suppliers;
  }

  /**
   * Get suppliers of the node of a given depth.
   * @param p - Options.
   */
  deepSuppliers(p: { depth?: number } = {}): Node<any>[] {
    let depth = p.depth ?? 1;
    if (depth < 0) depth = 100000;

    if (depth === 0) {
      return [];
    }

    const result: Node<any>[] = [...this.suppliers];

    for (const supplier of this.suppliers) {
      result.push(...supplier.deepSuppliers({ depth: depth - 1 }));
    }
    return result;
  }

  /** Call this method to update the suppliers again */
  needsInitSuppliers(): void {
    this._clearSuppliers();
  }

  /**
   * Is called by SCM to initialize the suppliers.
   * @param newSuppliers - The new suppliers keyed by their key.
   */
  initSuppliers(newSuppliers: Map<string, Node<any>>): void {
    this._throwOnCircularDependencies(newSuppliers);

    // Make sure the keys match the blue print's suppliers
    const s = this.bluePrint.suppliers;
    for (const supplierKey of newSuppliers.keys()) {
      assert(s.includes(supplierKey) || s.includes(`../${supplierKey}`));
    }

    // Reset old suppliers
    for (const supplier of [...this.suppliers]) {
      this._removeSupplier(supplier); // coverage:ignore-line
    }

    // Add the new suppliers. All old suppliers were removed before, so each
    // supplier is guaranteed to be new and no replacement lookup is needed.
    for (const supplier of newSuppliers.values()) {
      this._addNewSupplier(supplier);
    }

    // Enlarge or shrink _products
    this._products.length = this.suppliers.length;

    this._suppliersAreInitialized = true;
  }

  // ...........................................................................
  // Customers

  /** The customers of the node */
  get customers(): readonly Node<any>[] {
    return (this._customersArray ??= [...this._customers]);
  }

  /**
   * Get customers of the node of a given depth.
   * @param p - Options.
   */
  deepCustomers(p: { depth?: number } = {}): Node<any>[] {
    const depth = p.depth ?? 1;
    if (depth === 0) {
      return [];
    }

    const result: Node<any>[] = [...this.customers];

    for (const customer of this.customers) {
      result.push(...customer.deepCustomers({ depth: depth - 1 }));
    }
    return result;
  }

  // ...........................................................................
  /** Returns the master node for the smart node */
  findSmartMaster(): Node<T> | undefined {
    assert(this.isSmartNode);
    const masterPath = this.smartMaster;
    let parent: Scope | undefined = this.scope;
    while (parent != null) {
      const foundMaster = parent.findDirectChildNode<T>(masterPath);
      if (
        foundMaster != null &&
        !foundMaster.isDisposed &&
        foundMaster !== this &&
        foundMaster.scope !== this.scope
      ) {
        return foundMaster;
      }
      parent = parent.parent;
    }
    return undefined;
  }

  // ...........................................................................
  /**
   * Returns true if this node could be the master of the other node.
   * @param smartNode - The candidate smart node.
   */
  couldBeMasterOf(smartNode: Node<any>): boolean {
    if (smartNode.isSmartNode === false) {
      return false;
    }

    // Meta nodes cannot be master nodes currently
    if (this.isMetaNode) {
      return false;
    }

    if (!this._matchesPath(smartNode.smartMaster)) {
      return false;
    }

    return true;
  }

  // ...........................................................................
  /**
   * Returns the smart master path of this node or an empty path if this node
   * is not a smart node.
   */
  get smartMaster(): string[] {
    // Meta nodes are not smart nodes
    if (this.isMetaNode) {
      return [];
    }

    // If this node has a blue print that defines a smart master,
    // return the smart master defined by the blue print
    const bp = this.allBluePrints[0];
    if (bp.smartMaster.length !== 0) {
      return [...bp.smartMaster];
    }

    // Otherwise check, if the node is contained within a smart scope.
    const scopeSmartMaster = this.scope.smartMaster;
    if (scopeSmartMaster.length !== 0) {
      return [...scopeSmartMaster, this.key];
    }

    // Return an empty array otherwise
    return [];
  }

  // ...........................................................................
  /**
   * Insert uses this method to add itself to the host node.
   * @param insert - The insert to add.
   * @param p - Options.
   */
  addInsert(insert: Insert<T>, p: { index?: number } = {}): void {
    /* v8 ignore next -- Insert always passes an explicit index; the default is a convenience fallback */
    this._inserts.splice(p.index ?? this._inserts.length, 0, insert);
  }

  /**
   * Insert uses this method to remove itself from the host node.
   * @param insert - The insert to remove.
   */
  removeInsert(insert: Insert<T>): void {
    const index = this._inserts.indexOf(insert);
    /* v8 ignore next -- guard: removeInsert is only called for inserts present in the list */
    if (index !== -1) {
      this._inserts.splice(index, 1);
    }
  }

  /** Returns if node is an insert */
  readonly isInsert: boolean;

  /** The value returned by this method is forwarded to the produce method */
  protected get previousProduct(): T {
    return this.originalProduct;
  }

  /** The last insert will write its result into this variable */
  insertResult: T | undefined;

  /** Clears all inserts */
  clearInserts(): void {
    for (const insert of [...this._inserts]) {
      insert.dispose();
    }
  }

  /**
   * Returns the insert with the key or undefined when not found.
   * @param key - The key of the insert to find.
   */
  insert(key: string): Node<T> | undefined {
    for (const insert of this._inserts) {
      if (insert.key === key) {
        return insert;
      }
    }
    return undefined;
  }

  /** Returns the list of insert nodes */
  get inserts(): readonly Insert<T>[] {
    return this._inserts;
  }

  // ...........................................................................
  // Timeouts

  /** Is set to true if production times out */
  isTimedOut = false;

  /** Milliseconds showing the production start time. */
  productionStartTime: Duration = Duration.zero;

  /**
   * The production timeout for this node.
   *
   * Uses the node's blue print `NodeBluePrint.productionTimeout` when set,
   * otherwise falls back to the SCM's global `Scm.timeout`.
   */
  get productionTimeout(): Duration {
    return this.bluePrint.productionTimeout ?? this.scm.timeout;
  }

  // ...........................................................................
  /** Returns true if the node is a meta node */
  get isMetaNode(): boolean {
    return this.scope.isMetaScope;
  }

  // ...........................................................................
  /**
   * Example node for test purposes.
   * @param p - Example options.
   */
  static example(
    p: { bluePrint?: NodeBluePrint<number>; scope?: Scope; key?: string } = {},
  ): Node<number> {
    const scope = p.scope ?? Scope.example({ scm: Scm.testInstance });
    const bluePrint = p.bluePrint ?? NodeBluePrint.example({ key: p.key });

    const result = new Node<number>({ bluePrint, scope });

    // Realtime nodes will produce immediately
    result.ownPriority = Priority.realtime;

    return result;
  }

  // ...........................................................................
  /** Returns all the onChange meta nodes depending on this node */
  private get _onChangeNodes(): Node<any>[] {
    if (this.isMetaNode) {
      return [];
    }

    const result: Node<any>[] = [];

    // Add the onChange node of the own scope
    if (Node.onChangeEnabled) {
      result.push(this.scope.onChange!);
    }

    // Add onChangeRecursive of this node and its parents
    if (Node.onRecursiveChangeEnabled) {
      let parent: Scope | undefined = this.scope;
      while (parent != null) {
        result.push(parent.onChangeRecursive!);
        parent = parent.parent;
      }
    }

    return result;
  }

  // ...........................................................................
  private _triggerOnChange(): void {
    if (!Node.onChangeEnabled && !Node.onRecursiveChangeEnabled) {
      return;
    }

    for (const node of this._onChangeNodes) {
      this.scm.nominate(node);
    }
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  private readonly _owner: Owner<Node<any>> | undefined;
  private _suppliersAreInitialized!: boolean;
  private _isInitialized = false;

  // ...........................................................................
  /** Reset Id counter for tests */
  static testResetIdCounter(): void {
    Node._idCounter = 0;
  }

  // ...........................................................................
  // Init & Dispose
  private _init(): void {
    this._topoRank = this.scm.nextTopoRank();
    this._suppliersAreInitialized = this.bluePrint.suppliers.length === 0;
    this._initScope();
    this._initScm();
    this._isInitialized = true;
  }

  // ...........................................................................
  private _initScm(): void {
    this.scm.addNode(this);
    this.needsInitSuppliers();
    this.scm.updateSmartNodes(this);
  }

  // ...........................................................................
  private _initScope(): void {
    this.scope.addNode(this);
  }

  // ...........................................................................
  /** The supply chain manager */
  readonly scm: Scm;

  /** The chain this node belongs to */
  readonly scope: Scope;

  /**
   * The common scope of two nodes.
   * @param other - The other node.
   */
  commonParent(other: Node<any>): Scope {
    return this.scope.commonParent(other.scope);
  }

  // ...........................................................................
  /**
   * Save the graph to a file.
   *
   * The format can be dot, mmd, md, svg, png, pdf.
   * @param path - The file path to write to.
   * @param p - Graph options.
   */
  async writeImageFile(
    path: string,
    p: {
      supplierDepth?: number;
      customerDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
      scale?: number;
      write2x?: boolean;
      markdownFormat?: MarkdownFormat;
    } = {},
  ): Promise<void> {
    const g = this.graph({
      supplierDepth: p.supplierDepth ?? 0,
      customerDepth: p.customerDepth ?? 0,
      highlightedNodes: p.highlightedNodes ?? [this],
      highlightedScopes: p.highlightedScopes,
    });

    await Graph.writeImageFile({
      path,
      graph: g,
      scale: p.scale ?? 1.0,
      write2x: p.write2x ?? false,
      markdownFormat: p.markdownFormat ?? MarkdownFormat.gitHub,
    });
  }

  // ...........................................................................
  /**
   * Returns a graph.
   * @param p - Graph options.
   */
  graph(
    p: {
      supplierDepth?: number;
      customerDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
    } = {},
  ): GraphScopeItem {
    const graph = new Graph();
    const tree = graph.treeForNode({
      node: this,
      supplierDepth: p.supplierDepth ?? 0,
      customerDepth: p.customerDepth ?? 0,
      /* v8 ignore next -- highlightedNodes default is a convenience default not exercised by tests */
      highlightedNodes: p.highlightedNodes ?? [this],
      highlightedScopes: p.highlightedScopes,
    });
    return tree;
  }

  // ...........................................................................
  /**
   * Returns a dot graph that can be turned into svg using graphviz.
   * @param p - Graph options.
   */
  dot(
    p: {
      supplierDepth?: number;
      customerDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
    } = {},
  ): string {
    const g = this.graph({
      supplierDepth: p.supplierDepth ?? 0,
      customerDepth: p.customerDepth ?? 0,
      highlightedNodes: p.highlightedNodes ?? [this],
      highlightedScopes: p.highlightedScopes,
    });

    const dot = new GraphToDot({ graph: g }).dot;
    return dot;
  }

  // ...........................................................................
  /**
   * Returns a mermaid graph.
   * @param p - Graph options.
   */
  mermaid(
    p: {
      supplierDepth?: number;
      customerDepth?: number;
      highlightedNodes?: Node<any>[];
      highlightedScopes?: Scope[];
    } = {},
  ): string {
    const g = this.graph({
      supplierDepth: p.supplierDepth ?? 0,
      customerDepth: p.customerDepth ?? 0,
      highlightedNodes: p.highlightedNodes ?? [this],
      highlightedScopes: p.highlightedScopes,
    });

    const mm = new GraphToMermaid({ graph: g }).mermaid;
    return mm;
  }

  // ######################
  // Private
  // ######################

  private _isDisposed = false;
  private _isErased = false;

  private _mockedProduct: T | undefined;

  // ...........................................................................
  private readonly _inserts: Insert<T>[] = [];

  // ...........................................................................
  private get _bluePrint(): NodeBluePrint<T> {
    return this._bluePrints[this._bluePrints.length - 1];
  }

  private readonly _bluePrints: NodeBluePrint<T>[] = [];

  // ...........................................................................
  private _ownPriority: Priority = Priority.frame;

  // ...........................................................................
  // _suppliers is an array because the order of the suppliers must match the
  // order of the blue print's supplier paths (it defines the order of the
  // components handed to produce). _suppliersSet shadows the array for O(1)
  // contains checks.
  private readonly _suppliers: Supplier<any>[] = [];
  private readonly _suppliersSet = new Set<Supplier<any>>();
  private readonly _customers = new Set<Customer<any>>();

  // Cached array view of _customers handed out by the customers getter.
  // Invalidated on every mutation of _customers.
  private _customersArray: Customer<any>[] | undefined;

  // ...........................................................................
  /**
   * The node's position in a topological order of the supplier graph:
   * suppliers have smaller ranks than their customers.
   *
   * Maintained incrementally (Pearce-Kelly): most edges connect a lower
   * rank to a higher rank and cost O(1) to check for cycles. Only edges
   * violating the current order trigger a search of the affected region
   * plus a local rank reordering.
   */
  private _topoRank!: number;

  // ...........................................................................
  /**
   * Adds a supplier that is guaranteed not to be one of the current
   * suppliers, e.g. because all suppliers were removed before.
   * @param supplier - The supplier to add.
   */
  private _addNewSupplier(supplier: Supplier<any>): void {
    assert((supplier as unknown) !== this);

    // Supplier<T> already added? Do nothing.
    if (this._suppliersSet.has(supplier)) {
      return;
    }

    // Keep the topological ranks in order
    Node._restoreTopoOrderForEdge(supplier, this);

    // Add supplier to list of suppliers
    this._suppliers.push(supplier);
    this._suppliersSet.add(supplier);

    // This producer becomes a customer of its supplier
    supplier._addCustomer(this);

    // Because we have new dependencies, a rebuild is needed
    this.scm.nominate(this);
  }

  // ...........................................................................
  private _removeSupplier(supplier: Supplier<any>): void {
    if (!this._suppliersSet.has(supplier)) {
      return;
    }

    const index = this._suppliers.indexOf(supplier);
    this._suppliers.splice(index, 1);
    this._suppliersSet.delete(supplier);
    assert(supplier.customers.includes(this));
    supplier._removeCustomer(this);
  }

  // ...........................................................................
  /**
   * Is called by [_addNewSupplier] after this node was added to the
   * customer's supplier list.
   * @param customer - The customer to add.
   */
  private _addCustomer(customer: Customer<any>): void {
    this._customers.add(customer);
    this._customersArray = undefined;
  }

  // ...........................................................................
  private _removeCustomer(customer: Customer<any>): void {
    /* v8 ignore next -- guard: upstream _removeSupplier only removes existing customers */
    if (!this._customers.has(customer)) {
      return;
    }

    this._customers.delete(customer);
    this._customersArray = undefined;
    customer._removeSupplier(this);
    if (this.isDisposed && this._customers.size === 0) {
      this._erase();
    }
  }

  // ...........................................................................
  // Tick & Animation
  private _isAnimated = false;

  // ...........................................................................
  private _matchesPath(path: string[]): boolean {
    path = [...path];
    const key = path[path.length - 1];
    if (key !== this.key) {
      return false;
    }

    path = path.slice(0, path.length - 1);
    return this.scope.matchesPathArray(path);
  }

  // ...........................................................................
  private _throwIfNotAllowed(product: T): void {
    // Check, if the new product is allowed
    if (this.bluePrint.allowedProducts.length !== 0) {
      if (!this.bluePrint.allowedProducts.includes(product)) {
        throw new ArgumentError(
          `The product ${product} ` +
            'is not in the list of allowed products ' +
            `[${this.bluePrint.allowedProducts.join(', ')}].`,
        );
      }
    }
  }

  // ...........................................................................
  /**
   * Moves the customers of this node to the target node.
   * @param targetNode - The node to move the customers to.
   */
  moveCustomersTo(targetNode: Node<T>): void {
    for (const customer of [...this.customers]) {
      // Move the customer to the smartNode
      targetNode._customers.add(customer);
      targetNode._customersArray = undefined;
      this._customers.delete(customer);
      this._customersArray = undefined;

      // Replace the old suppliers by the smartNode
      const supplierIndex = customer._suppliers.indexOf(this);

      Node._restoreTopoOrderForEdge(targetNode, customer);
      customer._suppliers[supplierIndex] = targetNode;
      customer._suppliersSet.delete(this);
      customer._suppliersSet.add(targetNode);
      this.scm.nominate(customer);
    }

    /* v8 ignore next -- moveCustomersTo is only ever called on a disposed node */
    if (this.isDisposed) {
      this._erase();
    }
  }

  // ...........................................................................
  private _addBluePrint(bluePrint: NodeBluePrint<T>): void {
    const oldBluePrint = this.bluePrint;

    if (bluePrint === oldBluePrint) {
      return;
    }

    assert(bluePrint.key === this.bluePrint.key);

    // Update the bluePrint
    this._bluePrints.push(bluePrint);

    // Trigger a re-initialization of suppliers
    this.needsInitSuppliers();

    // If the produce function has changed, we need to produce again
    if (bluePrint.produce !== oldBluePrint.produce) {
      this.scm.nominate(this);
    }
  }

  // ...........................................................................
  private _clearSuppliers(): void {
    this._suppliersAreInitialized = this.bluePrint.suppliers.length === 0;

    for (const supplier of [...this.suppliers]) {
      this._removeSupplier(supplier);
    }

    if (!this._suppliersAreInitialized) {
      this.scm.needsInitSuppliers(this);
    }
  }

  // ...........................................................................
  /**
   * Throws if connecting this node to the new suppliers would create a cycle.
   *
   * Thanks to the topological ranks this is O(1) per supplier for the
   * common case (supplier rank smaller than customer rank). Only suppliers
   * violating the current order require a reachability check, bounded to
   * the affected rank region. Throws before any supplier is connected.
   * @param newSuppliers - The new suppliers keyed by their key.
   */
  private _throwOnCircularDependencies(
    newSuppliers: Map<string, Node<any>>,
  ): void {
    for (const supplier of newSuppliers.values()) {
      // A supplier with a smaller rank can never close a cycle.
      if (supplier._topoRank < this._topoRank) {
        continue;
      }

      // The supplier is the node itself or reachable from the node via
      // customer edges? Then the new edge would close a cycle.
      if (
        supplier === (this as unknown as Node<any>) ||
        Node._isReachableViaCustomers({ from: this, target: supplier })
      ) {
        this._throwCircularDependency(this, [...newSuppliers.values()], [
          this,
        ]);
      }
    }
  }

  // ...........................................................................
  /**
   * Returns true if the target is reachable from the start node via customer
   * edges.
   *
   * The search is bounded to the rank region `<= target._topoRank`: in a
   * valid topological order every path towards the target has strictly
   * increasing ranks.
   * @param p - The start node and the target node.
   */
  private static _isReachableViaCustomers(p: {
    from: Node<any>;
    target: Node<any>;
  }): boolean {
    const { from, target } = p;
    const maxRank = target._topoRank;
    const visited = new Set<Node<any>>();
    const stack: Node<any>[] = [from];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === target) {
        return true;
      }
      if (current._topoRank > maxRank || visited.has(current)) {
        continue;
      }
      visited.add(current);
      // Push one by one: spreading a large Set into push() exceeds V8's
      // argument limit (~125k) and throws a RangeError on wide fan-outs.
      for (const customer of current._customers) {
        stack.push(customer);
      }
    }
    return false;
  }

  // ...........................................................................
  /**
   * Restores the topological order before adding the edge from supplier
   * to customer (Pearce-Kelly).
   *
   * When the edge already respects the order (supplier rank smaller than
   * customer rank) this is O(1). Otherwise the affected rank region is searched and
   * locally reordered. If the new edge closes a cycle no order exists; the
   * ranks are left untouched (callers detect and report cycles themselves,
   * see [_throwOnCircularDependencies]).
   * @param supplier - The supplier side of the new edge.
   * @param customer - The customer side of the new edge.
   */
  private static _restoreTopoOrderForEdge(
    supplier: Node<any>,
    customer: Node<any>,
  ): void {
    if (supplier._topoRank < customer._topoRank) {
      return;
    }

    // Collect all nodes reachable forward from the customer within the
    // affected region (they must move behind the supplier).
    const maxRank = supplier._topoRank;
    const forward = new Set<Node<any>>();
    let stack: Node<any>[] = [customer];
    while (stack.length > 0) {
      const current = stack.pop()!;
      /* v8 ignore start -- defensive guard: initSuppliers rejects cycles
         before any edge is added (_throwOnCircularDependencies), so the
         forward walk never reaches the supplier there. Only kept for edge
         producers like moveCustomersTo that add edges without a pre-check. */
      if (current === supplier) {
        // The new edge closes a cycle - no topological order exists.
        return;
      }
      /* v8 ignore stop */
      if (current._topoRank > maxRank || forward.has(current)) {
        continue;
      }
      forward.add(current);
      for (const customer of current._customers) {
        stack.push(customer);
      }
    }

    // Collect all nodes reaching the supplier backwards within the affected
    // region (they must move before the customer's region).
    const minRank = customer._topoRank;
    const backward = new Set<Node<any>>();
    stack = [supplier];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current._topoRank < minRank || backward.has(current)) {
        continue;
      }
      backward.add(current);
      for (const supplier of current._suppliers) {
        stack.push(supplier);
      }
    }

    // Reassign the affected ranks: backward nodes keep their relative order
    // and move before the forward nodes, which also keep theirs.
    const pool = [
      ...[...backward].map((node) => node._topoRank),
      ...[...forward].map((node) => node._topoRank),
    ].sort((a, b) => a - b);

    const backwardSorted = [...backward].sort(
      (a, b) => a._topoRank - b._topoRank,
    );
    const forwardSorted = [...forward].sort(
      (a, b) => a._topoRank - b._topoRank,
    );

    let i = 0;
    for (const node of backwardSorted) {
      node._topoRank = pool[i++];
    }
    for (const node of forwardSorted) {
      node._topoRank = pool[i++];
    }
  }

  // ...........................................................................
  /**
   * Reconstructs the cycle path and throws. Only called on the error path.
   * @param node - The node closing the cycle.
   * @param suppliers - The suppliers to search through.
   * @param visited - The path visited so far.
   */
  private _throwCircularDependency(
    node: Node<any>,
    suppliers: Iterable<Node<any>>,
    visited: Node<any>[],
  ): void {
    const suppliersArray = [...suppliers];
    if (suppliersArray.includes(node)) {
      visited.push(node);
      const path = [...visited]
        .reverse()
        .map((n) => n.key)
        .join(' -> ');
      throw new Error(`Circular dependency detected: ${path}`);
    }

    for (const supplier of suppliersArray) {
      this._throwCircularDependency(node, supplier.suppliers, [
        ...visited,
        supplier,
      ]);
    }
  }
}

// ######################
// Examples
// ######################

/** Provides a deeply configured node structure */
export class ButterFlyExample {
  /**
   * Constructor.
   * @param p - Options.
   */
  constructor(p: { withScopes?: boolean } = {}) {
    const withScopes = p.withScopes ?? false;
    const scope = Scope.example({ scm: Scm.example(), key: 'butterFly' });

    const s11Bp = nbp({ from: ['s111'], to: 's11', init: 's11' });
    const s1Bp = nbp({ from: ['s11', 's10'], to: 's1', init: 's1' });
    const s0Bp = nbp({ from: ['s01', 's00'], to: 's0', init: 's0' });
    const xBp = nbp({ from: ['s1', 's0'], to: 'x', init: 'x' });
    const c00Bp = nbp({ from: ['c0'], to: 'c00', init: '0' });
    const c01Bp = nbp({ from: ['c0'], to: 'c01', init: '0' });

    const c0Bp = nbp({ from: ['x'], to: 'c0', init: '0' });
    const c1Bp = nbp({ from: ['x'], to: 'c1', init: '1' });

    const c10Bp = nbp({ from: ['c1'], to: 'c10', init: '0' });
    const c11Bp = nbp({ from: ['c1'], to: 'c11', init: '0' });

    const c111Bp = nbp({ from: ['c11'], to: 'c111', init: 'c111' });

    if (withScopes) {
      scope.mockContent({
        level3: {
          s111: 's111',
          level2: {
            s11: s11Bp,
            s10: 's10',
            s01: 's01',
            s00: 's00',
            level1: {
              s1: s1Bp,
              s0: s0Bp,
              level0: { x: xBp },
              c0: c0Bp,
              c1: c1Bp,
            },
            c00: c00Bp,
            c01: c01Bp,
            c10: c10Bp,
            c11: c11Bp,
          },
          c111: c111Bp,
        },
      });
    } else {
      scope.mockContent({
        s111: 's111',
        s11: s11Bp,
        s10: 's10',
        s01: 's01',
        s00: 's00',
        s1: s1Bp,
        s0: s0Bp,
        x: xBp,
        c0: c0Bp,
        c1: c1Bp,
        c00: c00Bp,
        c01: c01Bp,
        c10: c10Bp,
        c11: c11Bp,
        c111: c111Bp,
      });
    }

    this.s111 = scope.findNode<string>('s111')!;
    this.s11 = scope.findNode<string>('s11')!;
    this.s10 = scope.findNode<string>('s10')!;
    this.s01 = scope.findNode<string>('s01')!;
    this.s00 = scope.findNode<string>('s00')!;
    this.s1 = scope.findNode<string>('s1')!;
    this.s0 = scope.findNode<string>('s0')!;
    this.x = scope.findNode<string>('x')!;
    this.c0 = scope.findNode<string>('c0')!;
    this.c1 = scope.findNode<string>('c1')!;
    this.c00 = scope.findNode<string>('c00')!;
    this.c01 = scope.findNode<string>('c01')!;
    this.c10 = scope.findNode<string>('c10')!;
    this.c11 = scope.findNode<string>('c11')!;
    this.c111 = scope.findNode<string>('c111')!;

    this.allNodes = [
      this.s111,
      this.s11,
      this.s10,
      this.s01,
      this.s00,
      this.s1,
      this.s0,
      this.x,
      this.c0,
      this.c1,
      this.c00,
      this.c01,
      this.c10,
      this.c11,
      this.c111,
    ];

    if (withScopes) {
      this.level0 = scope.findChildScope('level0')!;
      this.level1 = scope.findChildScope('level1')!;
      this.level2 = scope.findChildScope('level2')!;
      this.level3 = scope.findChildScope('level3')!;

      this.allScopes = [
        this.level0,
        this.level1,
        this.level2,
        this.level3,
        scope,
      ];
    } else {
      this.allScopes = [];
    }

    scope.scm.flush();
  }

  // ...........................................................................

  /** s111 */
  readonly s111: Node<string>;

  /** s11 */
  readonly s11: Node<string>;

  /** s10 */
  readonly s10: Node<string>;

  /** s01 */
  readonly s01: Node<string>;

  /** s00 */
  readonly s00: Node<string>;

  /** s1 */
  readonly s1: Node<string>;

  /** s0 */
  readonly s0: Node<string>;

  /** x */
  readonly x: Node<string>;

  /** c0 */
  readonly c0: Node<string>;

  /** c1 */
  readonly c1: Node<string>;

  /** c00 */
  readonly c00: Node<string>;

  /** c01 */
  readonly c01: Node<string>;

  /** c10 */
  readonly c10: Node<string>;

  /** c11 */
  readonly c11: Node<string>;

  /** c111 */
  readonly c111: Node<string>;

  /** All nodes */
  readonly allNodes: Node<any>[];

  // ...........................................................................

  /** level0 */
  level0!: Scope;

  /** level1 */
  level1!: Scope;

  /** level2 */
  level2!: Scope;

  /** level3 */
  level3!: Scope;

  /** A list of all scopes */
  readonly allScopes: Scope[];
}

// #############################################################################
/** Creates a house with walls */
export class TriangleExample {
  /** Constructor */
  constructor() {
    this.triangle = Scope.example({ scm: Scm.example(), key: 'triangle' });
    this.triangle.mockContent({
      top: 0,
      left: {
        left: nbp({ from: ['top'], to: 'left', init: 0 }),
      },
      right: {
        right: nbp({ from: ['top', 'left'], to: 'right', init: 0 }),
      },
    });

    this.topNode = this.triangle.findNode<number>('top')!;
    this.leftNode = this.triangle.findNode<number>('left')!;
    this.rightNode = this.triangle.findNode<number>('right')!;

    this.topScope = this.triangle;
    this.leftScope = this.triangle.findChildScope('left')!;
    this.rightScope = this.triangle.findChildScope('right')!;

    this.allNodes = [this.topNode, this.leftNode, this.rightNode];
    this.allScopes = [this.topScope, this.leftScope, this.rightScope];

    this.triangle.scm.flush();
  }

  /** The house scope */
  readonly triangle: Scope;

  /** The top node */
  readonly topNode: Node<number>;

  /** The left node */
  readonly leftNode: Node<number>;

  /** The right node */
  readonly rightNode: Node<number>;

  /** The top scope */
  readonly topScope: Scope;

  /** The left scope */
  readonly leftScope: Scope;

  /** The right scope */
  readonly rightScope: Scope;

  /** All nodes */
  readonly allNodes: Node<any>[];

  /** All scopes */
  readonly allScopes: Scope[];
}

// Register the Node factory so node-blue-print.ts can create nodes without a
// runtime import (breaks the ESM cycle). See ./internal/registry.ts.
import { registerNodeFactory } from './internal/registry.ts';
registerNodeFactory((options) => new Node(options));
