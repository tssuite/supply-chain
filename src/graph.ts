// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ArgumentError } from './internal/errors.ts';
import { GraphToDot } from './graph-to-dot.ts';
import { GraphToMermaid, MarkdownFormat } from './graph-to-mermaid.ts';
import type { Node } from './node.ts';
import type { Scope } from './scope.ts';

/// The separation between nodes
export const nodeSeparation = 0.25;

/// The separation between ranks
export const rankSeparation = 0.25;

// .............................................................................
/// An item representing a node in the graph
export class GraphNodeItem {
  /// Constructor
  constructor(options: {
    node: Node<any>;
    shownCustomers: GraphNodeItem[];
    isHighlighted?: boolean;
  }) {
    this.node = options.node;
    this.shownCustomers = options.shownCustomers;
    this.isHighlighted = options.isHighlighted ?? false;
  }

  /// The customers to be printed
  readonly shownCustomers: GraphNodeItem[];

  /// The node represented by the item
  readonly node: Node<any>;

  /// Is the node highlighted
  readonly isHighlighted: boolean;

  /// String representation of the item
  toString(): string {
    return this.node.key;
  }
}

// .............................................................................
/// An item representing a scope in the graph
export class GraphScopeItem {
  /// Constructor
  constructor(options: {
    scope: Scope;
    nodeItems: GraphNodeItem[];
    children: GraphScopeItem[];
    isHighlighted?: boolean;
  }) {
    this.scope = options.scope;
    this.nodeItems = options.nodeItems;
    this.children = options.children;
    this.isHighlighted = options.isHighlighted ?? false;

    for (const node of this.nodeItems) {
      if (node.node.scope !== this.scope) {
        throw new ArgumentError('All nodes must be in the given scope.');
      }
    }
  }

  /// The scope represented by the node
  readonly scope: Scope;

  /// The children to be printed
  readonly children: GraphScopeItem[];

  /// The nodes to be shown in the scope
  readonly nodeItems: GraphNodeItem[];

  /// Is the scope highlighted
  readonly isHighlighted: boolean;

  /// String representation of the item
  toString(): string {
    return this.scope.key;
  }

  /// Find a node item in the graph
  findNodeItem(node: Node<any>): GraphNodeItem | undefined {
    for (const nodeItem of this.nodeItems) {
      if (nodeItem.node === node) {
        return nodeItem;
      }
    }

    for (const child of this.children) {
      const result = child.findNodeItem(node);
      if (result != null) {
        return result;
      }
    }
    return undefined;
  }

  /// Find a scope item in the graph
  findScopeItem(scope: Scope): GraphScopeItem | undefined {
    if (this.scope === scope) {
      return this;
    }

    for (const child of this.children) {
      const result = child.findScopeItem(scope);
      if (result != null) {
        return result;
      }
    }
    return undefined;
  }
}

// #############################################################################
/// Creates a dot graph with certain configuration
export class Graph {
  /// Constructor
  constructor() {}

  // ...........................................................................
  /// Returns graph for a node that can be converted to the dot format later
  treeForNode(options: {
    node: Node<any>;
    supplierDepth?: number;
    customerDepth?: number;
    highlightedNodes?: Node<any>[];
    highlightedScopes?: Scope[];
  }): GraphScopeItem {
    return this._treeForNode({
      node: options.node,
      supplierDepth: options.supplierDepth ?? 0,
      customerDepth: options.customerDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    })!;
  }

  // ...........................................................................
  /// Returns a graph for a scope that can be converted to the dot format later
  treeForScope(options: {
    scope: Scope;
    childScopeDepth?: number;
    parentScopeDepth?: number;
    highlightedNodes?: Node<any>[];
    highlightedScopes?: Scope[];
  }): GraphScopeItem {
    return this._treeForScope({
      scope: options.scope,
      childScopeDepth: options.childScopeDepth ?? 0,
      parentScopeDepth: options.parentScopeDepth ?? 0,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    })!;
  }

  // ...........................................................................
  /// Turn a graph into dot format
  static dot(options: { graph: GraphScopeItem }): string {
    return new GraphToDot({ graph: options.graph }).dot;
  }

  // ...........................................................................
  /// Turn a graph into mermaid format
  static mermaid(options: { graph: GraphScopeItem }): string {
    return new GraphToMermaid({ graph: options.graph }).mermaid;
  }

  // ...........................................................................
  /// Save the graph to a file
  ///
  /// The format can be dot, mmd, md, svg, png, pdf
  static async writeImageFile(options: {
    graph: GraphScopeItem;
    path: string;
    scale?: number;
    markdownFormat?: MarkdownFormat;
    write2x?: boolean;
  }): Promise<void> {
    /* v8 ignore start -- node-only IO delegation to graph-io.node.ts (excluded from coverage) */
    const { writeImageFile } = await import('./graph-io.node.ts');
    await writeImageFile({
      graph: options.graph,
      path: options.path,
      scale: options.scale ?? 1.0,
      markdownFormat: options.markdownFormat ?? MarkdownFormat.gitHub,
      write2x: options.write2x ?? false,
    });
    /* v8 ignore stop */
  }

  // ######################
  // text
  // ######################

  // ...........................................................................
  private _treeForScope(options: {
    scope: Scope;
    childScopeDepth: number;
    parentScopeDepth: number;
    highlightedNodes?: Node<any>[];
    highlightedScopes?: Scope[];
  }): GraphScopeItem | undefined {
    const { scope, childScopeDepth, parentScopeDepth } = options;

    // Get scopes to be shown
    const parentScopes = scope.deepParents({ depth: parentScopeDepth });
    const childScopes = scope.deepChildren({ depth: childScopeDepth });
    const scopesToBeShown: Scope[] = [...parentScopes, scope, ...childScopes];
    const scopesToBeShownWithChildren: Scope[] = [...scopesToBeShown];
    const scopesToBeShownEmpty = this._scopesToBeShownEmpty(scopesToBeShown);
    scopesToBeShown.push(...scopesToBeShownEmpty);

    // Show all nodes that are in the specified scopes
    const shownNodes: Node<any>[] = [];
    for (const s of scopesToBeShownWithChildren) {
      shownNodes.push(...s.nodes);
    }

    // Order the scopes by depth
    const orderedScopes = [...scopesToBeShown].sort(
      (a, b) => a.depth - b.depth,
    );

    // Create the graph based on the scopes
    const graph = this._graphFromScopes({
      shownScopes: orderedScopes,
      shownNodes: shownNodes,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });

    return graph;
  }

  // ...........................................................................
  private _scopesToBeShownEmpty(scopesToBeShown: Scope[]): Scope[] {
    // We want to show child scopes of scopes to be shown as shells
    // without nodes and child scope.
    // Thus we are collecting all child scopes of the scopes to be shown
    // If a child scope is not part of scopesTeBeShown it is shown empty.
    const result: Scope[] = [];
    for (const scope of scopesToBeShown) {
      for (const child of scope.children) {
        if (!scopesToBeShown.includes(child)) {
          result.push(child);
        }
      }
    }

    return result;
  }

  // ...........................................................................
  private _treeForNode(options: {
    node: Node<any>;
    supplierDepth: number;
    customerDepth: number;
    highlightedNodes?: Node<any>[];
    highlightedScopes?: Scope[];
  }): GraphScopeItem | undefined {
    const { node, supplierDepth, customerDepth } = options;

    // Get all supplier nodes
    const supplierNodes = node.deepSuppliers({ depth: supplierDepth });
    const customerNodes = node.deepCustomers({ depth: customerDepth });

    // Get shown nodes
    const shownNodes: Node<any>[] = [
      node,
      ...supplierNodes,
      ...customerNodes,
    ];

    // Get a list of all scopes to be shown
    const scopesToBeShown = this._scopesCoveredByNodes(shownNodes);

    // Order the scopes by depth
    const orderedScopes = [...scopesToBeShown].sort(
      (a, b) => a.depth - b.depth,
    );

    // Create the graph based on the scopes
    const graph = this._graphFromScopes({
      shownScopes: orderedScopes,
      shownNodes: shownNodes,
      highlightedNodes: options.highlightedNodes,
      highlightedScopes: options.highlightedScopes,
    });

    return graph;
  }

  // ...........................................................................
  private _scopesCoveredByNodes(nodes: readonly Node<any>[]): Set<Scope> {
    // Get all scopes covered by the nodes
    const scopes = new Set<Scope>();
    for (const node of nodes) {
      scopes.add(node.scope);
    }

    // Get common parent scope
    const commonParent = this._commonParent(scopes);
    scopes.add(commonParent);

    // Add all scope that are inbetween the common parent and the scopes
    for (const scope of [...scopes]) {
      let current: Scope = scope;
      while (current !== commonParent) {
        scopes.add(current);
        current = current.parent!;
      }
    }

    return scopes;
  }

  // ...........................................................................
  private _commonParent(scopes: Iterable<Scope>): Scope {
    const iterator = [...scopes];
    return iterator.reduce((a, b) => a.commonParent(b));
  }

  // ...........................................................................
  private _graphFromScopes(options: {
    shownScopes: Scope[];
    shownNodes: Node<any>[];
    highlightedNodes?: Node<any>[];
    highlightedScopes?: Scope[];
  }): GraphScopeItem {
    // Iterate over all scopes beginning at the end
    // (the last scope is the most detailed one)

    const { shownScopes, shownNodes, highlightedNodes, highlightedScopes } =
      options;

    const scope = shownScopes[0];
    const shownChildren = this._shownChildren(
      scope,
      shownScopes,
      shownNodes,
      highlightedNodes,
      highlightedScopes,
    );

    const graphScopeItem = new GraphScopeItem({
      scope: scope,
      children: shownChildren,
      isHighlighted: highlightedScopes?.includes(scope) ?? false,
      nodeItems: this._shownNodesInScope(scope, shownNodes, highlightedNodes),
    });

    return graphScopeItem;
  }

  // ...........................................................................
  private _shownChildren(
    scope: Scope,
    shownScopes: Scope[],
    shownNodes: Node<any>[],
    highlightedNodes?: Node<any>[],
    highlightedScopes?: Scope[],
  ): GraphScopeItem[] {
    const result: GraphScopeItem[] = [];
    for (const child of scope.children) {
      if (shownScopes.includes(child)) {
        result.push(
          new GraphScopeItem({
            scope: child,
            children: this._shownChildren(
              child,
              shownScopes,
              shownNodes,
              highlightedNodes,
              highlightedScopes,
            ),
            isHighlighted: highlightedScopes?.includes(child) ?? false,
            nodeItems: this._shownNodesInScope(
              child,
              shownNodes,
              highlightedNodes,
            ),
          }),
        );
      }
    }
    return result;
  }

  // ...........................................................................
  private _shownNodes(
    nodes: readonly Node<any>[],
    allShownNodes: readonly Node<any>[] | undefined,
  ): GraphNodeItem[] {
    const result: GraphNodeItem[] = [];
    for (const node of nodes) {
      if (allShownNodes == null || allShownNodes.includes(node)) {
        const graphItem = new GraphNodeItem({
          node: node,
          isHighlighted: false,
          shownCustomers: [],
        });
        result.push(graphItem);
      }
    }
    return result;
  }

  // ...........................................................................
  private _shownNodesInScope(
    scope: Scope,
    allShownNodes: Node<any>[],
    highlightedNodes?: Node<any>[],
  ): GraphNodeItem[] {
    const nodes = allShownNodes.filter((node) => node.scope === scope);
    const result: GraphNodeItem[] = [];
    for (const node of nodes) {
      result.push(
        new GraphNodeItem({
          node: node,
          isHighlighted: highlightedNodes?.includes(node) ?? false,
          shownCustomers: this._shownNodes(node.customers, allShownNodes),
        }),
      );
    }

    return result;
  }
}
