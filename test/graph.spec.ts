// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { writeGolden } from '@tssuite/golden';
import { beforeEach, describe, expect, it } from 'vitest';

// NOTE(port): These symbols are intentionally imported from their individual
// source files (in this order) rather than from '../src/index.ts'. The barrel
// in src/index.ts triggers a module-init-order cycle: Scm's eager static field
// `static readonly testInstance = new Scm(...)` constructs an Scm during module
// evaluation, which needs Disposed / Scope.root before those class bindings are
// initialized when scm.ts is pulled in first via the barrel. See insert.spec.ts.
import { Scope } from '../src/scope.ts';
import { Graph, GraphNodeItem, GraphScopeItem } from '../src/graph.ts';
import { Node, TriangleExample } from '../src/node.ts';
import { ArgumentError } from '../src/internal/errors.ts';
import { ScopeBluePrint } from '../src/scope-blue-print.ts';
import { NodeBluePrint } from '../src/node-blue-print.ts';

import { TestGraphs } from './helpers/test-graphs.ts';

describe('GraphScopeItem', () => {
  let t: TestGraphs;

  beforeEach(() => {
    t = new TestGraphs();
  });

  describe('should throw', () => {
    it('when nodeItems are not in scope', () => {
      expect(
        () =>
          new GraphScopeItem({
            scope: t.x.scope,
            children: [],
            nodeItems: [
              new GraphNodeItem({
                node: t.x.scm.nodes[0],
                shownCustomers: [],
              }),
            ],
          }),
      ).toThrow(ArgumentError);
      expect(
        () =>
          new GraphScopeItem({
            scope: t.x.scope,
            children: [],
            nodeItems: [
              new GraphNodeItem({
                node: t.x.scm.nodes[0],
                shownCustomers: [],
              }),
            ],
          }),
      ).toThrow('All nodes must be in the given scope.');
    });
  });

  describe('toString', () => {
    it('should return the scope.key', () => {
      const item = new GraphScopeItem({
        scope: t.x.scope,
        children: [],
        nodeItems: [],
      });
      expect(item.toString()).toBe(t.x.scope.key);
    });
  });
});

describe('GraphNodeItem', () => {
  let t: TestGraphs;

  beforeEach(() => {
    t = new TestGraphs();
  });

  describe('toString', () => {
    it('should return the node.key', () => {
      const item = new GraphNodeItem({ node: t.x, shownCustomers: [] });
      expect(item.toString()).toBe(t.x.key);
    });
  });
});

describe('Graph', () => {
  let t: TestGraphs;

  beforeEach(() => {
    t = new TestGraphs();
  });

  describe('dot, mermaid, writeImageFile', () => {
    it('generates dot graphs and writes image files', async () => {
      // Create the tree
      const graph = t.graph.treeForNode({ node: t.x });

      // Test dot
      const dot = Graph.dot({ graph });
      expect(dot).not.toEqual('');
      await writeGolden('graph_test/graph_test_01.dot', dot);

      // Test mermaid
      const mermaid = Graph.mermaid({ graph });
      expect(mermaid).not.toEqual('');
      await writeGolden('graph_test/graph_test_01.mmd', mermaid);
    });
  });

  describe('findNodeItem / findScopeItem', () => {
    it('returns undefined for a node not contained in the tree', () => {
      // Build a tree with one level of suppliers so child scope items exist,
      // forcing findNodeItem to recurse into children that do not contain the
      // searched node.
      const tree = t.graph.treeForNode({
        node: t.x,
        customerDepth: 1,
        supplierDepth: 1,
      });

      // x itself is found.
      expect(tree.findNodeItem(t.x)).not.toBeUndefined();

      // A deep node that is not part of the (shallow) tree is not found, even
      // after recursing through the rendered children.
      expect(tree.findNodeItem(t.s111)).toBeUndefined();
    });

    it('returns undefined for a scope not contained in the tree', () => {
      const tree = t.graph.treeForNode({
        node: t.x,
        customerDepth: 1,
        supplierDepth: 1,
      });

      // A deep scope not shown in the shallow tree is not found.
      expect(tree.findScopeItem(t.level3)).toBeUndefined();
    });

    it('omits sibling scopes that contain no shown nodes', () => {
      // A parent scope with three sibling child scopes a, b, c.
      // nodeA (in a) supplies nodeB (in b), so both are shown and their common
      // parent is `parent`. Scope c contains no shown node, so iterating the
      // children of `parent` exercises the `shownScopes.includes(child)` false
      // path for scope c.
      const root = Scope.example();
      new ScopeBluePrint({
        key: 'parent',
        children: [
          new ScopeBluePrint({
            key: 'a',
            nodes: [
              new NodeBluePrint<number>({ key: 'nodeA', initialProduct: 0 }),
            ],
          }),
          new ScopeBluePrint({
            key: 'b',
            nodes: [
              new NodeBluePrint<number>({
                key: 'nodeB',
                initialProduct: 0,
                // nodeB is a customer of nodeA in sibling scope a.
                suppliers: ['parent/a/nodeA'],
                produce: (c) => c[0] as number,
              }),
            ],
          }),
          new ScopeBluePrint({
            key: 'c',
            nodes: [
              new NodeBluePrint<number>({ key: 'nodeC', initialProduct: 0 }),
            ],
          }),
        ],
      }).instantiate({ scope: root });
      root.scm.flush();

      const parentScope = root.findScope('parent')!;
      const nodeA = root.scm.nodes.find((n) => n.key === 'nodeA') as Node<number>;
      const scopeC = parentScope.findChildScope('c')!;

      const tree = new Graph().treeForNode({
        node: nodeA,
        customerDepth: 1,
        supplierDepth: 0,
      });

      // Scope c (with no shown node) is not part of the rendered tree.
      expect(tree.findNodeItem(nodeA)).not.toBeUndefined();
      expect(tree.findScopeItem(scopeC)).toBeUndefined();
    });
  });

  describe('tree', () => {
    describe('treeForNode', () => {
      describe('should print a node', () => {
        it('with no suppliers and customers', () => {
          // Create the tree
          const tree = t.graph.treeForNode({ node: t.x });

          // Check tree
          expect(tree.isHighlighted).toBe(false);
          expect(tree.nodeItems).toHaveLength(1);
          expect(tree.nodeItems[0].isHighlighted).toBe(false);
        });

        describe('with direct suppliers', () => {
          it('when supplierDepth == 1', () => {
            // Create tree
            const tree = t.graph.treeForNode({
              node: t.x,
              supplierDepth: 1,
            });

            // ..........
            // Check tree
            expect(tree.children).toHaveLength(1);

            // First we expect level 1
            expect(tree.scope).toBe(t.level1);
            expect(tree.nodeItems).toHaveLength(2);
            expect(tree.nodeItems[0].node).toBe(t.s1);
            expect(tree.nodeItems[1].node).toBe(t.s0);

            // Level 1 should have level 0 as child scope
            expect(tree.children).toHaveLength(1);
            expect(tree.children[0].scope).toBe(t.level0);
          });
        });

        describe('with direct customers', () => {
          it('when customerDepth == 1', () => {
            // Create tree
            const tree = t.graph.treeForNode({
              node: t.x,
              customerDepth: 1,
            });

            // ..........
            // Check tree
            expect(tree.children).toHaveLength(1);

            // First we expect level 1
            expect(tree.scope).toBe(t.level1);
            expect(tree.nodeItems).toHaveLength(2);
            expect(tree.nodeItems[0].node).toBe(t.c0);
            expect(tree.nodeItems[1].node).toBe(t.c1);

            // Level 1 should have level 0 as child scope
            expect(tree.children).toHaveLength(1);
            expect(tree.children[0].scope).toBe(t.level0);
          });
        });

        describe('with direct customers and suppliers', () => {
          it('when customerDepth == 1 and suppliersDepth == 1', () => {
            // Create tree
            const tree = t.graph.treeForNode({
              node: t.x,
              customerDepth: 1,
              supplierDepth: 1,
            });

            // ..........
            // Check tree
            expect(tree.children).toHaveLength(1);

            // First we expect level 1
            expect(tree.scope).toBe(t.level1);
            expect(tree.nodeItems).toHaveLength(4);
            expect(tree.nodeItems[0].node).toBe(t.s1);
            expect(tree.nodeItems[1].node).toBe(t.s0);
            expect(tree.nodeItems[2].node).toBe(t.c0);
            expect(tree.nodeItems[3].node).toBe(t.c1);

            // Level 1 should have level 0 as child scope
            expect(tree.children).toHaveLength(1);
            expect(tree.children[0].scope).toBe(t.level0);
          });
        });

        describe('with all customers and suppliers', () => {
          it('when customerDepth == -1 and suppliersDepth == -1', () => {
            // Create tree
            const tree = t.graph.treeForNode({
              node: t.x,
              customerDepth: -1,
              supplierDepth: -1,
            });

            // ..........
            // Check tree
            expect(tree.children).toHaveLength(1);

            // First we expect level 3
            expect(tree.scope).toBe(t.level3);
            expect(tree.nodeItems).toHaveLength(2);
            expect(tree.nodeItems[0].node).toBe(t.s111);
            expect(tree.nodeItems[1].node).toBe(t.c111);

            // It should have a child of level 2
            expect(tree.children).toHaveLength(1);
            const l2 = tree.children[0];

            expect(l2.nodeItems).toHaveLength(8);
            expect(l2.nodeItems[0].node).toBe(t.s11);
            expect(l2.nodeItems[1].node).toBe(t.s10);
            expect(l2.nodeItems[2].node).toBe(t.s01);
            expect(l2.nodeItems[3].node).toBe(t.s00);
            expect(l2.nodeItems[4].node).toBe(t.c00);
            expect(l2.nodeItems[5].node).toBe(t.c01);
            expect(l2.nodeItems[6].node).toBe(t.c10);
            expect(l2.nodeItems[7].node).toBe(t.c11);

            // Level 2 should have a child of level 1
            expect(l2.children).toHaveLength(1);
            const l1 = l2.children[0];
            expect(l1.nodeItems).toHaveLength(4);
            expect(l1.nodeItems[0].node).toBe(t.s1);
            expect(l1.nodeItems[1].node).toBe(t.s0);
            expect(l1.nodeItems[2].node).toBe(t.c0);
            expect(l1.nodeItems[3].node).toBe(t.c1);

            // Level 1 should have level 0 as child scope
            expect(l1.children).toHaveLength(1);
            const l0 = l1.children[0];
            expect(l0.children).toHaveLength(0);
            expect(l0.nodeItems).toHaveLength(1);
            expect(l0.nodeItems[0].node).toBe(t.x);
          });
        });

        describe('with highlighted', () => {
          it('nodes', () => {
            const highlightedNodes: Node<any>[] = [t.s01, t.c1, t.c111];

            // Create a tree
            const tree = t.graph.treeForNode({
              node: t.x,
              customerDepth: -1,
              supplierDepth: -1,
              highlightedNodes,
            });

            // ..........
            // Check tree
            for (const node of t.allNodes) {
              const isHighlighted = highlightedNodes.includes(node);
              expect(tree.findNodeItem(node)?.isHighlighted).toBe(
                isHighlighted,
              );
            }

            // .........
          });

          it('scopes', () => {
            const highlightedScopes: Scope[] = [t.level0, t.level2];

            // Create a tree
            const tree = t.graph.treeForNode({
              node: t.x,
              customerDepth: -1,
              supplierDepth: -1,
              highlightedScopes,
            });

            // ..........
            // Check tree
            for (const scope of t.allScopes) {
              const isHighlighted = highlightedScopes.includes(scope);
              expect(tree.findScopeItem(scope)?.isHighlighted ?? false).toBe(
                isHighlighted,
              );
            }
          });
        });
      });
    });

    describe('treeForScope', () => {
      describe('should print a scope', () => {
        describe('with no additional scopes', () => {
          it('when parentScopeDepth == 0 and childScopeDepth == 0', () => {
            // Create the tree
            const tree = t.graph.treeForScope({ scope: t.x.scope });

            // Check tree
            expect(tree.scope).toBe(t.level0);
            expect(tree.children).toHaveLength(0);

            expect(tree.nodeItems).toHaveLength(1);
            expect(tree.nodeItems[0].node).toBe(t.x);

            //
          });
        });

        describe('with one parent scope', () => {
          it('when parentScopeDepth == 1', () => {
            // Create the tree
            const l1 = t.graph.treeForScope({
              scope: t.level0,
              parentScopeDepth: 1,
            });

            // Check tree
            expect(l1.scope).toBe(t.level1);
            expect(l1.children).toHaveLength(1);
            expect(l1.nodeItems).toHaveLength(4);
            expect(l1.nodeItems.map((e) => e.node)).toEqual([
              t.s1,
              t.s0,
              t.c0,
              t.c1,
            ]);

            const l0 = l1.children[0];
            expect(l0.scope).toBe(t.level0);
            expect(l0.children).toHaveLength(0);
            expect(l0.nodeItems).toHaveLength(1);
            expect(l0.nodeItems.map((e) => e.node)).toEqual([t.x]);
          });
        });

        describe('with one child scope', () => {
          it('when childScopeDepth == 1', () => {
            // Create the tree
            const l1 = t.graph.treeForScope({
              scope: t.level1,
              childScopeDepth: 1,
            });

            // Check tree
            expect(l1.scope).toBe(t.level1);
            expect(l1.children).toHaveLength(1);
            expect(l1.nodeItems).toHaveLength(4);
            expect(l1.nodeItems.map((e) => e.node)).toEqual([
              t.s1,
              t.s0,
              t.c0,
              t.c1,
            ]);

            const l0 = l1.children[0];
            expect(l0.scope).toBe(t.level0);
            expect(l0.children).toHaveLength(0);
            expect(l0.nodeItems).toHaveLength(1);
            expect(l0.nodeItems.map((e) => e.node)).toEqual([t.x]);
          });
        });

        describe('with all parent scopes', () => {
          it('when parentScopeDepth == -1', () => {
            // Create the tree
            const root = t.graph.treeForScope({
              scope: t.level0,
              parentScopeDepth: -1,
            });

            // Check tree
            expect(root.scope).toBe(t.level0.root);
            expect(root.children).toHaveLength(1);
            expect(root.nodeItems).toHaveLength(0);

            const butterFly = root.children[0];

            const l3 = butterFly.children[0];
            expect(l3.scope).toBe(t.level3);
            expect(l3.children).toHaveLength(1);
            expect(l3.nodeItems).toHaveLength(2);
            expect(l3.nodeItems.map((e) => e.node)).toEqual([t.s111, t.c111]);

            const l2 = l3.children[0];
            expect(l2.scope).toBe(t.level2);

            const l1 = l2.children[0];
            expect(l1.scope).toBe(t.level1);

            const l0 = l1.children[0];
            expect(l0.scope).toBe(t.level0);

            //
          });
        });

        describe('with all child scopes', () => {
          it('when childScopeDepth == -1', () => {
            const start = t.level0.root.children[0];

            // Create the tree
            const root = t.graph.treeForScope({
              scope: start,
              childScopeDepth: -1,
            });

            // Check tree
            expect(root.scope).toBe(start);
            expect(root.children).toHaveLength(1);
            expect(root.nodeItems).toHaveLength(0);

            const l3 = root.children[0];
            expect(l3.scope).toBe(t.level3);
            expect(l3.children).toHaveLength(1);
            expect(l3.nodeItems).toHaveLength(2);
            expect(l3.nodeItems.map((e) => e.node)).toEqual([t.s111, t.c111]);

            const l2 = l3.children[0];
            expect(l2.scope).toBe(t.level2);

            const l1 = l2.children[0];
            expect(l1.scope).toBe(t.level1);

            const l0 = l1.children[0];
            expect(l0.scope).toBe(t.level0);

            //
          });
        });
      });

      describe('should print shells of child scope', () => {
        describe('when the child scopes would exceed the childScopeDepth', () => {
          describe('with scope shells', () => {
            it('when a scope exceeds the level', () => {
              const start = t.level1;

              // Create the tree with a childScopeDepth of 0.
              const graphNode = t.graph.treeForScope({
                scope: start,
                childScopeDepth: 0,
              });

              // The nodes of the graphNode should be shown
              expect(graphNode.nodeItems).toHaveLength(4);

              // But also the direct child node should be shown.
              expect(graphNode.children).toHaveLength(1);

              // But the child node should be shown without and children.
              const firstChild = graphNode.children[0];
              expect(firstChild.children).toHaveLength(0);
              expect(firstChild.nodeItems).toHaveLength(0);
            });
          });
        });

        it('when the scopes are empty', () => {
          // Create a scope hierarchy without nodes

          const scopesWithoutNodes = Scope.example();
          scopesWithoutNodes.mockContent({
            a: {
              b: { c: {} },
            },
          });

          // Create a graph
          const graphNode = t.graph.treeForScope({
            scope: scopesWithoutNodes,
            childScopeDepth: 2,
          });

          // The graph should contain the scopes
          expect(graphNode.children).toHaveLength(1);
          expect(graphNode.children[0].children).toHaveLength(1);
        });
      });

      describe('special cases', () => {
        describe('triangle', () => {
          // Create the tree
          const triangle = new TriangleExample();

          const {
            leftNode,
            rightNode,
            topNode,
            leftScope,
            rightScope,
            topScope,
          } = triangle;

          it('complete', () => {
            triangle.triangle.scm.flush();

            const tree = t.graph.treeForScope({
              scope: triangle.triangle,
              childScopeDepth: -1,
            });

            // Check tree
            const top = tree;
            expect(top.scope).toBe(topScope);
            expect(top.nodeItems).toHaveLength(1);
            expect(top.nodeItems[0].node).toBe(topNode);
            expect(tree.children).toHaveLength(2);

            const left = tree.children[0];
            expect(left.scope).toBe(leftScope);
            expect(left.nodeItems[0].node).toBe(leftNode);

            const right = tree.children[tree.children.length - 1];
            expect(right.scope).toBe(rightScope);
            expect(right.nodeItems[0].node).toBe(rightNode);

            expect(tree.nodeItems[0].node).toBe(topNode);
          });
        });
      });
    });
  });
});
