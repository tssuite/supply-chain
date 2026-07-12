// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assert } from './internal/assert.ts';
import { ArgumentError } from './internal/errors.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { Scope } from './scope.ts';

import type { Owner } from './owner.ts';
import type { ScBuilderBluePrint } from './sc-builder-blue-print.ts';

/** A callback invoked with a scope. */
type ScopeCallback = (scope: Scope) => void;

/** The result of {@link ScopeBluePrint.findItem}: the item and its path. */
export type FindItemResult = [item: unknown, absolutePath: string | undefined];

/**
 * A scope blue print is a collection of related node blue prints that can form
 * or build a scope.
 */
export class ScopeBluePrint {
  /** The key of the scope. */
  readonly key: string;

  /**
   * If `canBeSmart` is false this scope will not be a smart scope, even within
   * another smart scope or with a smart master path set.
   */
  readonly canBeSmart: boolean;

  protected readonly innerSmartMaster: readonly string[];
  protected readonly innerNodes: readonly NodeBluePrint<any>[];
  protected readonly innerChildren: readonly ScopeBluePrint[];
  protected readonly innerBuilders: readonly ScBuilderBluePrint[];
  protected readonly innerAliases: readonly string[];
  protected readonly innerConnections: ReadonlyMap<string, string>;
  private readonly onInstantiateCb?: ScopeCallback;
  private readonly onDisposeCb?: ScopeCallback;

  /**
   * Constructor of the scope.
   * @param params - The scope blue print fields.
   */
  constructor(params: {
    key: string;
    nodes?: readonly NodeBluePrint<any>[];
    children?: readonly ScopeBluePrint[];
    aliases?: readonly string[];
    connect?: ReadonlyMap<string, string>;
    builders?: readonly ScBuilderBluePrint[];
    onInstantiate?: ScopeCallback;
    onDispose?: ScopeCallback;
    smartMaster?: readonly string[];
    canBeSmart?: boolean;
  }) {
    this.key = params.key;
    this.innerNodes = params.nodes ?? [];
    this.innerChildren = params.children ?? [];
    this.innerAliases = params.aliases ?? [];
    this.innerConnections = params.connect ?? new Map<string, string>();
    this.innerBuilders = params.builders ?? [];
    this.onInstantiateCb = params.onInstantiate;
    this.onDisposeCb = params.onDispose;
    this.innerSmartMaster = params.smartMaster ?? [];
    this.canBeSmart = params.canBeSmart ?? true;
  }

  /**
   * Creates a blue print with children from JSON. The JSON map must have
   * exactly one key whose value is a map.
   * @param json - The JSON object.
   * @param options - Optional connections.
   */
  static fromJson(
    json: Record<string, unknown>,
    options: { connect?: ReadonlyMap<string, string> } = {},
  ): ScopeBluePrint {
    const rootKeys = Object.keys(json);
    assert(rootKeys.length === 1, 'Only one key is allowed in the root map.');
    const key = rootKeys[0];
    const value = json[key];
    assert(
      typeof value === 'object' && value !== null && !Array.isArray(value),
      'The value of the root map must be a map.',
    );
    const valueMap = value as Record<string, unknown>;

    const nodes: NodeBluePrint<any>[] = [];
    const children: ScopeBluePrint[] = [];

    for (const subKey of Object.keys(valueMap)) {
      const subValue = valueMap[subKey];

      if (subValue instanceof ScopeBluePrint) {
        assert(
          subValue.key === subKey,
          `The key of the node "${subValue.key}" must be "${subKey}".`,
        );
        children.push(subValue);
        continue;
      }

      if (subValue instanceof NodeBluePrint) {
        assert(
          subValue.key === subKey,
          `The key of the node "${subValue.key}" must be "${subKey}".`,
        );
        nodes.push(subValue);
        continue;
      }

      // Parse children
      if (
        typeof subValue === 'object' &&
        subValue !== null &&
        !Array.isArray(subValue)
      ) {
        children.push(ScopeBluePrint.fromJson({ [subKey]: subValue }));
        continue;
      }

      // Parse primitive nodes (int/double collapse to number)
      let nodeBluePrint: NodeBluePrint<any>;
      switch (typeof subValue) {
        case 'number':
          nodeBluePrint = new NodeBluePrint<number>({
            key: subKey,
            initialProduct: subValue,
          });
          break;
        case 'string':
          nodeBluePrint = new NodeBluePrint<string>({
            key: subKey,
            initialProduct: subValue,
          });
          break;
        case 'boolean':
          nodeBluePrint = new NodeBluePrint<boolean>({
            key: subKey,
            initialProduct: subValue,
          });
          break;
        default:
          throw new ArgumentError(
            `Type ${typeof subValue} not supported. ` +
              `Use NodeBluePrint<${typeof subValue}> instead.`,
          );
      }
      nodes.push(nodeBluePrint);
    }

    return new ScopeBluePrint({
      key,
      nodes,
      children,
      connect: options.connect,
    });
  }

  /** Override to perform actions or checks before instantiation. */
  willInstantiate(): void {}

  /**
   * Override to perform actions after the scope blue print was instantiated.
   * @param scope - The instantiated scope.
   */
  onInstantiate(scope: Scope): void {
    this.onInstantiateCb?.(scope);
  }

  /**
   * Override to perform actions before the scope is disposed.
   * @param scope - The scope being disposed.
   */
  onDispose(scope: Scope): void {
    this.onDisposeCb?.(scope);
  }

  /**
   * Creates a copy of the scope with the given changes.
   * @param changes - The fields to override.
   */
  copyWith(changes: {
    key?: string;
    modifiedNodes?: readonly NodeBluePrint<any>[];
    modifiedScopes?: readonly ScopeBluePrint[];
    builders?: readonly ScBuilderBluePrint[];
    aliases?: readonly string[];
    connections?: ReadonlyMap<string, string>;
    smartMaster?: readonly string[];
    canBeSmart?: boolean;
  }): ScopeBluePrint {
    /* v8 ignore start */
    if (
      (changes.key === undefined || changes.key === this.key) &&
      (changes.modifiedNodes === undefined ||
        changes.modifiedNodes.length === 0 ||
        listsAreEqual(changes.modifiedNodes, this.nodes)) &&
      (changes.modifiedScopes === undefined ||
        changes.modifiedScopes.length === 0 ||
        listsAreEqual(changes.modifiedScopes, this.children)) &&
      (changes.builders === undefined || changes.builders === this.builders) &&
      (changes.aliases === undefined || changes.aliases === this.aliases) &&
      (changes.connections === undefined ||
        changes.connections === this.connections ||
        changes.connections.size === 0) &&
      (changes.smartMaster === undefined ||
        changes.smartMaster === this.innerSmartMaster) &&
      (changes.canBeSmart === undefined ||
        changes.canBeSmart === this.canBeSmart)
    ) /* v8 ignore end */
    {
      return this;
    }

    const mergedNodes = ScopeBluePrint.mergeNodesInternal(
      this.nodes,
      changes.modifiedNodes,
    );
    const mergedScopes = ScopeBluePrint.mergeScopesInternal(
      this.children,
      changes.modifiedScopes,
    );
    const mergedConnections = new Map<string, string>([
      ...this.innerConnections,
      ...(changes.connections ?? new Map<string, string>()),
    ]);

    return new ScopeBluePrint({
      key: changes.key ?? this.key,
      aliases: changes.aliases ?? this.innerAliases,
      nodes: mergedNodes,
      children: mergedScopes,
      connect: mergedConnections,
      builders: changes.builders ?? this.builders,
      smartMaster: changes.smartMaster ?? this.innerSmartMaster,
      canBeSmart: changes.canBeSmart ?? this.canBeSmart,
    });
  }

  /** If a smartMaster is set, nodes connect to the smart master's nodes. */
  get smartMaster(): readonly string[] {
    return this.canBeSmart ? this.innerSmartMaster : [];
  }

  /** Returns true if this scope is a smart scope, i.e. it has a smartMaster. */
  get isSmartScope(): boolean {
    return this.smartMaster.length > 0;
  }

  /** Returns the key. */
  toString(): string {
    return this.key;
  }

  /** Override to define the nodes of the scope. */
  buildNodes(): readonly NodeBluePrint<any>[] {
    return this.innerNodes;
  }

  /** Override to define the child scopes. */
  buildScopes(): readonly ScopeBluePrint[] {
    return this.innerChildren;
  }

  /** Override to modify the builders. */
  buildScBuilders(): readonly ScBuilderBluePrint[] {
    return this.innerBuilders;
  }

  /** Override to define the aliases of the scope. */
  buildAliases(): readonly string[] {
    return this.innerAliases;
  }

  /** Override to define the connections of the scope. */
  buildConnections(): ReadonlyMap<string, string> {
    return this.innerConnections;
  }

  /**
   * Merge nodes with overrides.
   * @param options - The original list and the overrides.
   */
  static mergeNodes(options: {
    original: readonly NodeBluePrint<any>[];
    overrides?: readonly NodeBluePrint<any>[];
  }): readonly NodeBluePrint<any>[] {
    return ScopeBluePrint.mergeNodesInternal(
      options.original,
      options.overrides,
    );
  }

  /**
   * Merge scopes with overrides.
   * @param options - The original list and the overrides.
   */
  static mergeScopes(options: {
    original: readonly ScopeBluePrint[];
    overrides?: readonly ScopeBluePrint[];
  }): readonly ScopeBluePrint[] {
    return ScopeBluePrint.mergeScopesInternal(
      options.original,
      options.overrides,
    );
  }

  /** Returns the aliases of the scope. */
  get aliases(): readonly string[] {
    return this.buildAliases();
  }

  /**
   * Returns true if the key matches the given key or one of the aliases.
   * @param key - The key to match.
   */
  matchesKey(key: string): boolean {
    return key === this.key || this.aliases.includes(key);
  }

  /** The nodes of the scope. */
  get nodes(): readonly NodeBluePrint<any>[] {
    return this.buildNodes();
  }

  /** The children of the scope. */
  get children(): readonly ScopeBluePrint[] {
    return this.buildScopes();
  }

  /**
   * The child with a given key, or undefined if not found.
   * @param key - The child key.
   */
  child(key: string): ScopeBluePrint | undefined {
    for (const child of this.children) {
      if (child.key === key) {
        return child;
      }
    }
    return undefined;
  }

  /** Allows connecting scopes and nodes to sources from the outside. */
  get connections(): ReadonlyMap<string, string> {
    return this.buildConnections();
  }

  /** The builders installed when the scope is instantiated. */
  get builders(): readonly ScBuilderBluePrint[] {
    return this.buildScBuilders();
  }

  /**
   * Returns the node blue print for a given key.
   * @param key - The node key.
   */
  node<T>(key: string): NodeBluePrint<T> | undefined {
    return ScopeBluePrint.nodeWithKey<T>(key, this.nodes);
  }

  /**
   * Returns the node or scope and its absolute path for a given search path.
   * @param searchPath - The slash-separated search path.
   */
  findItem(searchPath: string): FindItemResult {
    const absolutePath: string[] = [];
    const item = this.findItemInternal(searchPath.split('/'), absolutePath);
    return [item, item != null ? absolutePath.join('/') : undefined];
  }

  /**
   * Returns the node blue print for a given path.
   * @param path - The slash-separated node path.
   */
  findNode<T>(path: string): NodeBluePrint<T> | undefined {
    const item = this.findItemInternal(path.split('/'), [], {
      matchAlsoScopes: false,
    });
    return item instanceof NodeBluePrint
      ? (item as NodeBluePrint<T>)
      : undefined;
  }

  /**
   * Returns the absolute path of the node with the given path, or undefined.
   * @param path - The slash-separated node path.
   */
  absoluteNodePath(path: string): string | undefined {
    const absolutePath: string[] = [];
    const node = this.findItemInternal(path.split('/'), absolutePath);
    if (node == null) {
      return undefined;
    }
    return absolutePath.join('/');
  }

  /**
   * Returns the paths of all nodes belonging to this scope.
   * @param options - Whether to prepend the root scope key.
   */
  allNodePathes(options: { appendRootScopeKey?: boolean } = {}): string[] {
    return ScopeBluePrint.allNodePathesInternal(this, {
      appendRootScopeKey: options.appendRootScopeKey ?? false,
    });
  }

  /**
   * Turns the blue print into a scope and adds it to the parent scope.
   * @param options - Target scope, optional connections, builder init flag, owner.
   */
  instantiate(options: {
    scope: Scope;
    connect?: ReadonlyMap<string, string>;
    initScBuilders?: boolean;
    owner?: Owner<Scope>;
  }): Scope {
    // Smart scopes must not be instantiated in smart scopes
    if (this.isSmartScope && options.scope.isSmartScope) {
      throw new ArgumentError(
        'Smart scopes must not be instantiated in smart scopes.',
      );
    }

    this.willInstantiate();
    const connections = new Map<string, string>([
      ...this.innerConnections,
      ...(options.connect ?? new Map<string, string>()),
    ]);

    // Connect nodes of this scope to suppliers from the outside.
    const self = this.applyConnections(this, new Map(connections));

    // Create an inner scope
    const innerScope = new Scope({
      parent: options.scope,
      bluePrint: self,
      owner: options.owner,
    });

    // Make sure there are no duplicate keys
    ScopeBluePrint.checkForDuplicateKeys(self.nodes);

    // Create nodes — ScBuilders are initialized after all nodes are created
    innerScope.findOrCreateNodes([...self.nodes], { applyScBuilders: false });

    // Init sub scopes
    for (const child of self.children) {
      child.instantiate({ scope: innerScope, initScBuilders: false });
    }

    // Add builders
    for (const builder of this.builders) {
      builder.instantiate({ scope: innerScope });
    }

    // Apply parent builders - but only once for the outermost scope of this
    // instantiation. The applyToScope pass covers the whole subtree; child
    // scopes (initScBuilders == false) must not repeat it for their
    // subtrees.
    if (options.initScBuilders ?? true) {
      this.applyParentScBuilders(innerScope);
    }

    // Call onInstantiate
    this.onInstantiate(innerScope);

    return innerScope;
  }

  /**
   * Creates an example instance for test purposes.
   * @param options - Optional key.
   */
  static example(options: { key?: string } = {}): ScopeBluePrint {
    const key = options.key ?? 'scope';

    const dependency = new NodeBluePrint<number>({
      key: 'dependency',
      initialProduct: 0,
      suppliers: [],
    });

    const node = new NodeBluePrint<number>({
      key: 'node',
      initialProduct: 1,
      suppliers: ['dependency'],
      produce: (components: unknown[]) => (components[0] as number) + 1,
    });

    const customer = new NodeBluePrint<number>({
      key: 'customer',
      initialProduct: 1,
      suppliers: ['node'],
      produce: (components: unknown[]) => (components[0] as number) + 1,
    });

    return new ExampleScopeBluePrintSimple({
      key,
      nodes: [dependency],
      children: [
        new ScopeBluePrint({ key: 'childScope', nodes: [node, customer] }),
      ],
    });
  }

  // ######################
  // Private
  // ######################

  private static nodeWithKey<T>(
    key: string,
    nodes: readonly NodeBluePrint<any>[],
  ): NodeBluePrint<T> | undefined {
    for (const node of nodes) {
      if (node.key === key) {
        return node as NodeBluePrint<T>;
      }
    }
    return undefined;
  }

  private static checkForDuplicateKeys(
    nodes: readonly NodeBluePrint<any>[],
  ): void {
    const occurrences = new Map<string, number>();
    for (const node of nodes) {
      occurrences.set(node.key, (occurrences.get(node.key) ?? 0) + 1);
    }
    const duplicates: string[] = [];
    for (const [key, count] of occurrences) {
      if (count > 1) {
        duplicates.push(key);
      }
    }
    if (duplicates.length > 0) {
      throw new ArgumentError(`Duplicate keys found: ${duplicates.join(', ')}`);
    }
  }

  private static mergeNodesInternal(
    original: readonly NodeBluePrint<any>[],
    overrides?: readonly NodeBluePrint<any>[],
  ): readonly NodeBluePrint<any>[] {
    if (overrides === undefined || overrides.length === 0) {
      return original;
    }
    if (original.length === 0) {
      return overrides;
    }
    const merged = [...original];
    for (const newOverride of overrides) {
      const index = merged.findIndex((e) => e.key === newOverride.key);
      if (index !== -1) {
        merged[index] = newOverride;
      } else {
        merged.push(newOverride);
      }
    }
    return merged;
  }

  private static mergeScopesInternal(
    original: readonly ScopeBluePrint[],
    overrides?: readonly ScopeBluePrint[],
  ): readonly ScopeBluePrint[] {
    if (overrides === undefined || overrides.length === 0) {
      return original;
    }
    if (original.length === 0) {
      return overrides;
    }
    const merged = [...original];
    for (const newOverride of overrides) {
      const index = merged.findIndex((e) => e.key === newOverride.key);
      if (index !== -1) {
        merged[index] = newOverride;
      } else {
        merged.push(newOverride);
      }
    }
    return merged;
  }

  private static connectNodeToSupplier(
    scope: ScopeBluePrint,
    path: string[],
    supplier: string,
  ): ScopeBluePrint {
    if (path.length === 1) {
      const n = scope.node(path[0]);
      /* v8 ignore next 3 -- defensive: the path was already resolved via absoluteNodePath */
      if (n === undefined) {
        throw new ArgumentError(`Node "${path[0]}" not found.`);
      }
      const modifiedN = n.connectSupplier(supplier);
      return scope.copyWith({ modifiedNodes: [modifiedN] });
    }

    const childScope = scope.children.find((e) => e.key === path[0]);
    /* v8 ignore next 3 -- defensive: the path was already resolved via absoluteNodePath */
    if (childScope === undefined) {
      throw new ArgumentError(`Scope "${path[0]}" not found.`);
    }
    const modifiedScope = ScopeBluePrint.connectNodeToSupplier(
      childScope,
      path.slice(1),
      supplier,
    );
    return scope.copyWith({ modifiedScopes: [modifiedScope] });
  }

  private static allNodePathesInternal(
    scope: ScopeBluePrint,
    options: { isFirstSegment?: boolean; appendRootScopeKey?: boolean } = {},
  ): string[] {
    const isFirstSegment = options.isFirstSegment ?? true;
    const appendRootScopeKey = options.appendRootScopeKey ?? false;
    const pathes: string[] = [];
    const firstSegmentName =
      isFirstSegment && appendRootScopeKey ? `${scope.key}/` : '';

    for (const node of scope.nodes) {
      pathes.push(`${firstSegmentName}${node.key}`);
    }

    for (const child of scope.children) {
      const childPathes = ScopeBluePrint.allNodePathesInternal(child, {
        isFirstSegment: false,
        appendRootScopeKey: false,
      });
      for (const childPath of childPathes) {
        pathes.push(`${firstSegmentName}${child.key}/${childPath}`);
      }
    }

    return pathes;
  }

  private static convertScopePathToNodePathes(
    scope: ScopeBluePrint,
    connections: ReadonlyMap<string, string>,
  ): [Map<string, string>, Map<string, string>] {
    const processedConnections = new Map<string, string>();
    const missingConnections = new Map<string, string>(connections);

    for (const [path, supplier] of connections) {
      const [item, absolutePath] = scope.findItem(path);
      if (item == null) {
        continue;
      }
      missingConnections.delete(path);

      if (item instanceof NodeBluePrint) {
        processedConnections.set(absolutePath as string, supplier);
      }

      if (item instanceof ScopeBluePrint) {
        missingConnections.delete(path);
        const nodePathes = ScopeBluePrint.allNodePathesInternal(item);
        for (const nodePath of nodePathes) {
          processedConnections.set(
            `${item.key}/${nodePath}`,
            `${supplier}/${nodePath}`,
          );
        }
      }
    }

    return [processedConnections, missingConnections];
  }

  private applyConnections(
    scope: ScopeBluePrint,
    connections: Map<string, string>,
  ): ScopeBluePrint {
    if (connections.size === 0) {
      return scope;
    }

    const [mappedConnections, missingConnections] =
      ScopeBluePrint.convertScopePathToNodePathes(scope, connections);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let modifiedSelf: ScopeBluePrint = this;

    for (const [key, supplier] of [...mappedConnections]) {
      const absolutePath = scope.absoluteNodePath(key);
      /* v8 ignore next -- mapped connections always resolve to an absolute path */
      if (absolutePath != null) {
        const segments = absolutePath.split('/');
        modifiedSelf = ScopeBluePrint.connectNodeToSupplier(
          modifiedSelf,
          segments.slice(1),
          supplier,
        );
        mappedConnections.delete(key);
      }
    }

    if (missingConnections.size > 0) {
      const entries = [...missingConnections]
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      throw new ArgumentError(
        `The following connections could not be applied: {${entries}}`,
      );
    }

    return modifiedSelf;
  }

  private applyParentScBuilders(scope: Scope): void {
    let parent = scope.parent;
    while (parent !== undefined) {
      for (const builder of parent.builders) {
        builder.applyToScope(scope, { applyChildBuilders: false });
      }
      parent = parent.parent;
    }
  }

  private findItemInternal(
    path: string[],
    absolutePath: string[],
    options: { isFirstSegment?: boolean; matchAlsoScopes?: boolean } = {},
  ): unknown {
    const isFirstSegment = options.isFirstSegment ?? true;
    const matchAlsoScopes = options.matchAlsoScopes ?? true;
    let result: unknown;

    if (this.key !== path[0]) {
      absolutePath.push(this.key);
    }

    // Only one segment?
    if (path.length === 1) {
      const foundNode = this.node(path[0]);
      if (foundNode !== undefined) {
        absolutePath.push(foundNode.key);
        return foundNode;
      }

      if (matchAlsoScopes) {
        if (this.key === path[0]) {
          absolutePath.push(this.key);
          return this;
        }
        const foundChildScope = this.child(path[0]);
        if (foundChildScope !== undefined) {
          absolutePath.push(foundChildScope.key);
          return foundChildScope;
        }
      }

      if (!isFirstSegment) {
        return undefined;
      }
    }

    const childScope =
      this.key === path[0]
        ? this
        : this.children.find((e) => e.key === path[0]);

    const remainingPath = path.slice(1);
    const subPath: string[] = [];
    if (childScope !== undefined) {
      result = childScope.findItemInternal(remainingPath, subPath, {
        isFirstSegment: false,
        matchAlsoScopes,
      });
    }
    if (result != null) {
      absolutePath.push(...subPath);
      return result;
    }

    if (!isFirstSegment) {
      return undefined;
    }

    // Start searching deeper
    subPath.length = 0;
    const foundItems: unknown[] = [];
    for (const child of this.children) {
      result = child.findItemInternal(path, subPath, {
        isFirstSegment: true,
        matchAlsoScopes,
      });
      if (result != null) {
        foundItems.push(result);
      }
    }

    if (foundItems.length > 1) {
      throw new ArgumentError(
        `Multiple nodes with path "${path.join('/')}" found.`,
      );
    }

    absolutePath.push(...subPath);
    return foundItems.length > 0 ? foundItems[0] : undefined;
  }
}

function listsAreEqual<E>(a: readonly E[], b: readonly E[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// #############################################################################
/** An example scope blue print. */
export class ExampleScopeBluePrint extends ScopeBluePrint {
  /**
   * Constructor.
   * @param params - Optional key, extra nodes and children.
   */
  constructor(
    params: {
      key?: string;
      nodes?: readonly NodeBluePrint<any>[];
      children?: readonly ScopeBluePrint[];
    } = {},
  ) {
    super({
      key: params.key ?? 'parentScope',
      nodes: [
        new NodeBluePrint<number>({
          key: 'nodeConstructedByParent',
          initialProduct: 0,
          suppliers: [],
        }),
        ...(params.nodes ?? []),
      ],
      children: [
        new ScopeBluePrint({
          key: 'childScopeConstructedByParent',
          nodes: [
            new NodeBluePrint<number>({
              key: 'nodeConstructedByChildScope',
              initialProduct: 0,
              suppliers: [],
            }),
          ],
        }),
        ...(params.children ?? []),
      ],
    });
  }

  override buildNodes(): readonly NodeBluePrint<any>[] {
    return ScopeBluePrint.mergeNodes({
      original: [
        new NodeBluePrint<number>({
          key: 'nodeBuiltByParent',
          initialProduct: 0,
          suppliers: [],
        }),
        new NodeBluePrint<number>({
          key: 'nodeToBeReplaced',
          initialProduct: 0,
          suppliers: [],
        }),
      ],
      overrides: super.buildNodes(),
    });
  }

  override buildScopes(): readonly ScopeBluePrint[] {
    return ScopeBluePrint.mergeScopes({
      original: [
        new ScopeBluePrint({
          key: 'childScopeBuiltByParent',
          nodes: [
            new NodeBluePrint<number>({
              key: 'nodeBuiltByChildScope',
              initialProduct: 0,
              suppliers: [],
            }),
          ],
        }),
        ScopeBluePrint.example({ key: 'scopeToBeReplaced' }),
      ],
      overrides: super.buildScopes(),
    });
  }
}

/**
 * A very simple derived scope blue print. It adds one node and one scope using
 * the override mechanism.
 */
export class ExampleScopeBluePrintSimple extends ScopeBluePrint {
  override buildNodes(): readonly NodeBluePrint<any>[] {
    return ScopeBluePrint.mergeNodes({
      original: [
        new NodeBluePrint<number>({
          key: 'builtNode',
          initialProduct: 0,
          suppliers: [],
        }),
      ],
      overrides: super.buildNodes(),
    });
  }

  override buildScopes(): readonly ScopeBluePrint[] {
    return ScopeBluePrint.mergeScopes({
      original: [
        new ScopeBluePrint({
          key: 'builtScope',
          nodes: [
            new NodeBluePrint<number>({
              key: 'builtNodeInScope',
              initialProduct: 0,
              suppliers: [],
            }),
          ],
        }),
      ],
      overrides: super.buildScopes(),
    });
  }
}
