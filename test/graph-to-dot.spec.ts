// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { writeGolden } from '@tssuite/golden';
import { beforeEach, describe, expect, it } from 'vitest';

// NOTE(port): `../src/index.ts` re-exports `disposed.ts` before `scm.ts`. Loading
// `disposed.ts` first triggers an ESM cycle where `scm.ts`'s static
// `testInstance` initializer dereferences `Disposed` before it is defined
// ("Disposed is not a constructor"). Importing `scm.ts` first fixes the module
// evaluation order. See src/ issue reported with this port.
import '../src/scm.ts';

import {
  ArgumentError,
  Graph,
  GraphNodeItem,
  GraphScopeItem,
  GraphToDot,
  Scope,
  TriangleExample,
} from '../src/index.ts';

import type { Node } from '../src/index.ts';

import { TestGraphs } from './helpers/test-graphs.ts';

describe('GraphToDot', () => {
  let t: TestGraphs;

  beforeEach(() => {
    t = new TestGraphs();
  });

  const expectNodes = (result: string, nodes: Node<any>[]): void => {
    for (const k of t.allNodeKeys) {
      const keys = nodes.map((n) => n.key);
      if (keys.includes(k)) {
        expect(result).toContain(`label = "${k}"; // node`);
      } else {
        expect(result).not.toContain(`label = "${k}"; // node`);
      }
    }
  };

  const expectScopes = (dot: string, scopes: Scope[]): void => {
    const expectedScopeKeys = scopes.map((s) => s.key);
    for (const k of t.allScopeKeys) {
      if (expectedScopeKeys.includes(k)) {
        expect(dot).toContain(`label = "${k}"; // scope`);
      } else {
        expect(dot).not.toContain(`label = "${k}"; // scope`);
      }
    }
  };

  const expectEdgeCount = (dot: string, edgeCount: number): void => {
    const edges = dot.split('->');
    expect(edges.length - 1).toBe(edgeCount);
  };

  const expectEdge = (dot: string, from: Node<any>, to: Node<any>): void => {
    expect(dot).toMatch(new RegExp(`"${from.key}_\\d+" -> "${to.key}_\\d+";`));
  };

  const expectHighlightedNodes = (
    dot: string,
    highlightedNodes: Node<any>[],
  ): void => {
    const expectedKeys = highlightedNodes.map((n) => n.key);

    const regExp = (key: string): RegExp =>
      new RegExp(
        [
          // t.s0_3 [
          `\\s+${key}_\\d+ \\[\n`,
          // label = "s01" // node
          `\\s+label = "${key}"; // node\n`,
          // style = filled;
          '\\s+style = filled;\n',
          // fillcolor = "#FFFFAA";
          '\\s+fillcolor = "#FFFFAA";\n',
        ].join(''),
      );

    for (const key of t.allNodeKeys) {
      if (expectedKeys.includes(key)) {
        expect(dot).toMatch(regExp(key));
      } else {
        expect(dot).not.toMatch(regExp(key));
      }
    }
  };

  const expectHighlightedScopes = (
    dot: string,
    highlightedScopes: Scope[],
  ): void => {
    const expectedKeys = highlightedScopes.map((n) => n.key);

    const regExp = (key: string): RegExp =>
      new RegExp(
        [
          // t.s0_3 [
          `\\s+subgraph cluster_${key}_\\d+ \\{\n`,
          // label = "s01" // node
          `\\s+label = "${key}"; // scope\n`,
          // style = filled;
          '\\s+style = filled;\n',
          // fillcolor = "#AAFFFF88";
          '\\s+fillcolor = "#AAFFFF88";\n',
        ].join(''),
      );

    for (const key of t.allScopeKeys) {
      if (expectedKeys.includes(key)) {
        expect(dot).toMatch(regExp(key));
      } else {
        expect(dot).not.toMatch(regExp(key));
      }
    }
  };

  const expectEmptyScope = (dot: string, scope: Scope): void => {
    expect(dot).toMatch(
      new RegExp(
        `invisible[0-9]+ \\[label = "", shape = point, style=invis\\]; // ${scope.key}`,
      ),
    );
  };

  const writeDotFile = async (dot: string, postfix: string): Promise<void> => {
    // The svg/png export path is guarded by the static flag
    // GraphToDot.testSvgAndPngExport (false by default), so it is skipped.
    if (GraphToDot.testSvgAndPngExport) {
      await GraphToDot.writeImageFile({
        dot,
        path: `test/graphs/graph_test_${postfix}.svg`,
      });
    }

    await writeGolden(`graph_test_${postfix}.dot`, dot);
  };

  describe('GraphScopeItem', () => {
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
    describe('toString', () => {
      it('should return the node.key', () => {
        const item = new GraphNodeItem({ node: t.x, shownCustomers: [] });
        expect(item.toString()).toBe(t.x.key);
      });
    });
  });

  describe('Graph', () => {
    describe('tree, dot', () => {
      describe('treeForNode', () => {
        describe('should print a node', () => {
          it('with no suppliers and customers', async () => {
            // Create the tree
            const tree = t.graph.treeForNode({ node: t.x });

            // Create dot
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '01');

            // Check dot
            expectNodes(dot, [t.x]);
            expectScopes(dot, [t.level0]);
            expectEdgeCount(dot, 0);
          });

          describe('with direct suppliers', () => {
            it('when supplierDepth == 1', async () => {
              // Create tree
              const tree = t.graph.treeForNode({ node: t.x, supplierDepth: 1 });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '02');

              // .........
              // Check dot
              expectNodes(dot, [t.x, t.s0, t.s1]);
              expectEdgeCount(dot, 2);
              expectEdge(dot, t.s1, t.x);
              expectEdge(dot, t.s0, t.x);
              expectScopes(dot, [t.level0, t.level1]);
            });
          });

          describe('with direct customers', () => {
            it('when customerDepth == 1', async () => {
              // Create tree
              const tree = t.graph.treeForNode({ node: t.x, customerDepth: 1 });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '03');

              // .........
              // Check dot
              expectNodes(dot, [t.x, t.c0, t.c1]);
              expectEdgeCount(dot, 2);
              expectEdge(dot, t.x, t.c0);
              expectEdge(dot, t.x, t.c1);
              expectScopes(dot, [t.level0, t.level1]);
            });
          });

          describe('with direct customers and suppliers', () => {
            it('when customerDepth == 1 and suppliersDepth == 1', async () => {
              // Create tree
              const tree = t.graph.treeForNode({
                node: t.x,
                customerDepth: 1,
                supplierDepth: 1,
              });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '05');

              // .........
              // Check dot
              expectNodes(dot, [t.x, t.s1, t.s0, t.c0, t.c1]);
              expectEdgeCount(dot, 4);
              expectEdge(dot, t.s1, t.x);
              expectEdge(dot, t.s0, t.x);
              expectEdge(dot, t.x, t.c0);
              expectEdge(dot, t.x, t.c1);
              expectScopes(dot, [t.level0, t.level1]);
            });
          });

          describe('with all customers and suppliers', () => {
            it('when customerDepth == -1 and suppliersDepth == -1', async () => {
              // Create tree
              const tree = t.graph.treeForNode({
                node: t.x,
                customerDepth: -1,
                supplierDepth: -1,
              });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '04');

              // .........
              // Check dot
              expectNodes(dot, t.butterFly.allNodes);
              expectEdgeCount(dot, 14);

              expectEdge(dot, t.s111, t.s11);
              expectEdge(dot, t.s11, t.s1);
              expectEdge(dot, t.s10, t.s1);
              expectEdge(dot, t.s01, t.s0);
              expectEdge(dot, t.s00, t.s0);
              expectEdge(dot, t.c11, t.c111);
              expectEdge(dot, t.s1, t.x);
              expectEdge(dot, t.s0, t.x);
              expectEdge(dot, t.c0, t.c00);
              expectEdge(dot, t.c0, t.c01);
              expectEdge(dot, t.c1, t.c10);
              expectEdge(dot, t.c1, t.c11);
              expectEdge(dot, t.x, t.c0);
              expectEdge(dot, t.x, t.c1);

              expectScopes(dot, [t.level0, t.level1, t.level2, t.level3]);
            });
          });

          describe('with highlighted', () => {
            it('nodes', async () => {
              const highlightedNodes = [t.s01, t.c1, t.c111];

              // Create a tree
              const tree = t.graph.treeForNode({
                node: t.x,
                customerDepth: -1,
                supplierDepth: -1,
                highlightedNodes,
              });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '06');

              // .........
              // Check dot
              expectHighlightedNodes(dot, highlightedNodes);
            });

            it('scopes', async () => {
              const highlightedScopes = [t.level0, t.level2];

              // Create a tree
              const tree = t.graph.treeForNode({
                node: t.x,
                customerDepth: -1,
                supplierDepth: -1,
                highlightedScopes,
              });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '07');

              // .........
              // Check dot
              expectHighlightedScopes(dot, highlightedScopes);
            });
          });
        });
      });

      describe('treeForScope', () => {
        describe('should print a scope', () => {
          describe('with no additional scopes', () => {
            it('when parentScopeDepth == 0 and childScopeDepth == 0', async () => {
              // Create the tree
              const tree = t.graph.treeForScope({ scope: t.x.scope });

              // Create dot
              const dot = Graph.dot({ graph: tree });
              await writeDotFile(dot, '08');

              //// Check dot
              expectNodes(dot, [t.x]);
              expectScopes(dot, [t.level0]);
              expectEdgeCount(dot, 0);
            });
          });

          describe('with one parent scope', () => {
            it('when parentScopeDepth == 1', async () => {
              // Create the tree
              const l1 = t.graph.treeForScope({
                scope: t.level0,
                parentScopeDepth: 1,
              });

              // Create dot
              const dot = Graph.dot({ graph: l1 });
              await writeDotFile(dot, '09');

              // Check dot
              expectNodes(dot, [t.x, t.s1, t.s0, t.c0, t.c1]);
              expectScopes(dot, [t.level0, t.level1]);
              expectEdgeCount(dot, 4);
              expectEdge(dot, t.s1, t.x);
              expectEdge(dot, t.s0, t.x);
              expectEdge(dot, t.x, t.c0);
              expectEdge(dot, t.x, t.c1);
            });
          });

          describe('with one child scope', () => {
            it('when childScopeDepth == 1', async () => {
              // Create the tree
              const l1 = t.graph.treeForScope({
                scope: t.level1,
                childScopeDepth: 1,
              });

              // Create dot
              const dot = Graph.dot({ graph: l1 });
              await writeDotFile(dot, '10');

              // Check dot
              expectNodes(dot, [t.x, t.s1, t.s0, t.c0, t.c1]);
              expectScopes(dot, [t.level0, t.level1]);
              expectEdgeCount(dot, 4);
              expectEdge(dot, t.s1, t.x);
              expectEdge(dot, t.s0, t.x);
              expectEdge(dot, t.x, t.c0);
              expectEdge(dot, t.x, t.c1);
            });
          });

          describe('with all parent scopes', () => {
            it('when parentScopeDepth == -1', async () => {
              // Create the tree
              const root = t.graph.treeForScope({
                scope: t.level0,
                parentScopeDepth: -1,
              });

              // Create dot
              const dot = Graph.dot({ graph: root });
              await writeDotFile(dot, '11');

              //// Check dot
              expectNodes(dot, t.allNodes);
              expectScopes(dot, [...t.allScopes, t.level0.root]);
              expectEdgeCount(dot, 14);
            });
          });

          describe('with all child scopes', () => {
            it('when childScopeDepth == -1', async () => {
              const start = t.level0.root.children[0];

              // Create the tree
              const root = t.graph.treeForScope({
                scope: start,
                childScopeDepth: -1,
              });

              // Create dot
              const dot = Graph.dot({ graph: root });
              await writeDotFile(dot, '12');

              //// Check dot
              expectNodes(dot, t.allNodes);
              expectScopes(dot, t.allScopes);
              expectEdgeCount(dot, 14);
            });
          });
        });

        describe('should print shells of child scope', () => {
          describe('when the child scopes would exceed the childScopeDepth', () => {
            describe('with scope shells', () => {
              it('when a scope exceeds the level', async () => {
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

                // Print the dot graph
                const dot = Graph.dot({ graph: graphNode });
                await writeDotFile(dot, '18');
              });
            });
          });

          it('when the scopes are empty', async () => {
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

            // Print the dot graph
            const dot = Graph.dot({ graph: graphNode });
            await writeDotFile(dot, '19');
          });
        });
      });

      describe('special cases', () => {
        describe('empty scopes', () => {
          it('single', async () => {
            const emptyScope = Scope.example({ key: 'empty' });
            const tree = t.graph.treeForScope({
              scope: emptyScope,
              childScopeDepth: -1,
            });
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '13');
            expectEmptyScope(dot, emptyScope);
          });

          it('multiple', async () => {
            const a = Scope.example({ key: 'a' });
            a.mockContent({
              b: { c: {} },
            });

            const b = a.findChildScope('b')!;
            const c = b.findChildScope('c')!;

            const tree = t.graph.treeForScope({
              scope: a,
              childScopeDepth: -1,
            });
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '14');
            expectEmptyScope(dot, a);
            expectEmptyScope(dot, b);
            expectEmptyScope(dot, c);
          });
        });

        describe('triangle', () => {
          // Create the tree
          const triangle = new TriangleExample();

          const { leftNode, rightNode, topNode } = triangle;

          it('complete', async () => {
            triangle.triangle.scm.flush();

            const tree = t.graph.treeForScope({
              scope: triangle.triangle,
              childScopeDepth: -1,
            });

            // Create dot
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '15');

            // Check dot
            expectNodes(dot, triangle.allNodes);
            expectScopes(dot, triangle.allScopes);
            expectEdgeCount(dot, 3);
            expectEdge(dot, topNode, leftNode);
            expectEdge(dot, topNode, rightNode);
            expectEdge(dot, leftNode, rightNode);
          });

          it('sibling node as customer', async () => {
            const tree = t.graph.treeForNode({
              node: leftNode,
              customerDepth: 1,
            });

            // Create dot
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '16');
          });

          it('sibling node as supplier', async () => {
            const tree = t.graph.treeForNode({
              node: rightNode,
              supplierDepth: 1,
            });

            // Create dot
            const dot = Graph.dot({ graph: tree });
            await writeDotFile(dot, '17');
          });
        });
      });
    });

    describe('fixViewBox', () => {
      it('should write width and height to the view box', () => {
        const svg =
          '<svg width="98pt" height="103pt" viewBox="0.00 0.00 94.00 99.00"';
        const fixed = GraphToDot.fixSvgViewBox(svg);
        expect(fixed).toContain('viewBox="0.00 0.00 98 103"');
      });

      it('returns the content unchanged when width/height are missing', () => {
        const svg = '<svg viewBox="0.00 0.00 94.00 99.00"';
        const fixed = GraphToDot.fixSvgViewBox(svg);
        expect(fixed).toBe(svg);
      });
    });
  });
});
