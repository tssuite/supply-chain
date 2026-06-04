// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { writeGolden } from '@tssuite/golden';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ArgumentError,
  Graph,
  GraphNodeItem,
  GraphScopeItem,
  GraphToMermaid,
  MarkdownFormat,
  Scope,
  TriangleExample,
} from '../src/index.ts';
import type { Node } from '../src/index.ts';
import { TestGraphs } from './helpers/test-graphs.ts';

describe('GraphScopeItem', () => {
  let t: TestGraphs;

  beforeEach(() => {
    t = new TestGraphs();
  });

  describe('writeImageFile', () => {
    it('generates dot graphs and writes image files', async () => {
      // Create the tree
      const graph = t.graph.treeForNode({ node: t.x });

      // Write image file
      expect(Graph.mermaid({ graph })).not.toBe('');
      await writeGolden(
        'graph_to_mermaid_test.mmd',
        new GraphToMermaid({ graph }).mermaid,
      );
    });
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

  // ...........................................................................
  const writeFile = async (
    graph: GraphScopeItem,
    postfix: string,
  ): Promise<void> => {
    const fileName = `graph_test_${postfix}`;
    await writeGolden(
      `${fileName}.github.md`,
      new GraphToMermaid({ graph }).markdown({
        markdownFormat: MarkdownFormat.gitHub,
      }),
    );
    await writeGolden(
      `${fileName}.azure.md`,
      new GraphToMermaid({ graph }).markdown({
        markdownFormat: MarkdownFormat.azure,
      }),
    );
  };

  // ...........................................................................
  const expectNodes = (result: string, nodes: Node<any>[]): void => {
    for (const k of t.allNodeKeys) {
      const keys = nodes.map((n) => n.key);
      if (keys.includes(k)) {
        expect(result).toContain(`["${k}"]`);
      } else {
        expect(result).not.toContain(`["${k}"]`);
      }
    }
  };

  // ...........................................................................
  const expectScopes = (mermaid: string, scopes: Scope[]): void => {
    const expectedScopeKeys = scopes.map((s) => s.key);
    for (const k of t.allScopeKeys) {
      if (expectedScopeKeys.includes(k)) {
        expect(mermaid).toContain(`["${k}"]`);
      } else {
        expect(mermaid).not.toContain(`["${k}"]`);
      }
    }
  };

  // ...........................................................................
  const expectEdgeCount = (mermaid: string, edgeCount: number): void => {
    const edges = mermaid.split('->');
    expect(edges.length - 1).toBe(edgeCount);
  };

  // ...........................................................................
  const expectEdge = (
    mermaid: string,
    from: Node<any>,
    to: Node<any>,
  ): void => {
    expect(mermaid).toMatch(new RegExp(`${from.key}_\\d+ --> ${to.key}_\\d+;`));
  };

  // ...........................................................................
  const expectHighlightedNodes = (
    mermaid: string,
    highlightedNodes: Node<any>[],
  ): void => {
    const expectedKeys = highlightedNodes.map((n) => n.key);

    const regExp = (key: string): RegExp =>
      new RegExp(`\\s+${key}_\\d+\\["${key}"\\]:::highlight`);

    for (const key of t.allNodeKeys) {
      if (expectedKeys.includes(key)) {
        expect(mermaid).toMatch(regExp(key));
      } else {
        expect(mermaid).not.toMatch(regExp(key));
      }
    }
  };

  describe('markdown', () => {
    describe('with markdownFormat', () => {
      describe('gitHub', () => {
        it('wraps the mermaid into ```... ```', () => {
          // Create the tree
          const tree = t.graph.treeForNode({ node: t.x });
          const markdown = new GraphToMermaid({ graph: tree }).markdown({
            markdownFormat: MarkdownFormat.gitHub,
          });
          expect(markdown.startsWith('```mermaid\n')).toBe(true);
          expect(markdown.endsWith('\n```')).toBe(true);
        });
      });

      describe('azure', () => {
        it('wraps the mermaid into :::... :::', () => {
          // Create the tree
          const tree = t.graph.treeForNode({ node: t.x });
          const markdown = new GraphToMermaid({ graph: tree }).markdown({
            markdownFormat: MarkdownFormat.azure,
          });
          expect(markdown.startsWith(':::mermaid\n')).toBe(true);
          expect(markdown.endsWith('\n:::')).toBe(true);
        });
      });
    });

    describe('without markdownFormat', () => {
      it('defaults to gitHub', () => {
        const tree = t.graph.treeForNode({ node: t.x });
        const markdown = new GraphToMermaid({ graph: tree }).markdown();
        expect(markdown.startsWith('```mermaid\n')).toBe(true);
        expect(markdown.endsWith('\n```')).toBe(true);
      });
    });
  });

  describe('tree, mermaid', () => {
    describe('treeForNode', () => {
      describe('should print a node', () => {
        it('with no suppliers and customers', async () => {
          // Create the tree
          const tree = t.graph.treeForNode({ node: t.x });

          // Create mermaid
          const mermaid = Graph.mermaid({ graph: tree });
          await writeFile(tree, '01');

          // Check mermaid
          expectNodes(mermaid, [t.x]);
          expectScopes(mermaid, [t.level0]);
          expectEdgeCount(mermaid, 0);
        });

        describe('with direct suppliers', () => {
          it('when supplierDepth == 1', async () => {
            // Create tree
            const tree = t.graph.treeForNode({ node: t.x, supplierDepth: 1 });

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '02');

            // .........
            // Check mermaid
            expectNodes(mermaid, [t.x, t.s0, t.s1]);
            expectEdgeCount(mermaid, 2);
            expectEdge(mermaid, t.s1, t.x);
            expectEdge(mermaid, t.s0, t.x);
            expectScopes(mermaid, [t.level0, t.level1]);
          });
        });

        describe('with direct customers', () => {
          it('when customerDepth == 1', async () => {
            // Create tree
            const tree = t.graph.treeForNode({ node: t.x, customerDepth: 1 });

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '03');

            // .........
            // Check mermaid
            expectNodes(mermaid, [t.x, t.c0, t.c1]);
            expectEdgeCount(mermaid, 2);
            expectEdge(mermaid, t.x, t.c0);
            expectEdge(mermaid, t.x, t.c1);
            expectScopes(mermaid, [t.level0, t.level1]);
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

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '05');

            // .........
            // Check mermaid
            expectNodes(mermaid, [t.x, t.s1, t.s0, t.c0, t.c1]);
            expectEdgeCount(mermaid, 4);
            expectEdge(mermaid, t.s1, t.x);
            expectEdge(mermaid, t.s0, t.x);
            expectEdge(mermaid, t.x, t.c0);
            expectEdge(mermaid, t.x, t.c1);
            expectScopes(mermaid, [t.level0, t.level1]);
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

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '04');

            // .........
            // Check mermaid
            expectNodes(mermaid, t.butterFly.allNodes);
            expectEdgeCount(mermaid, 14);

            expectEdge(mermaid, t.s111, t.s11);
            expectEdge(mermaid, t.s11, t.s1);
            expectEdge(mermaid, t.s10, t.s1);
            expectEdge(mermaid, t.s01, t.s0);
            expectEdge(mermaid, t.s00, t.s0);
            expectEdge(mermaid, t.c11, t.c111);
            expectEdge(mermaid, t.s1, t.x);
            expectEdge(mermaid, t.s0, t.x);
            expectEdge(mermaid, t.c0, t.c00);
            expectEdge(mermaid, t.c0, t.c01);
            expectEdge(mermaid, t.c1, t.c10);
            expectEdge(mermaid, t.c1, t.c11);
            expectEdge(mermaid, t.x, t.c0);
            expectEdge(mermaid, t.x, t.c1);

            expectScopes(mermaid, [t.level0, t.level1, t.level2, t.level3]);
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

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '06');

            // .........
            // Check mermaid
            expectHighlightedNodes(mermaid, highlightedNodes);
          });

          it('scopes', async () => {
            // Mermaid does not support highlighted subgraph
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

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: tree });
            await writeFile(tree, '08');

            //// Check mermaid
            expectNodes(mermaid, [t.x]);
            expectScopes(mermaid, [t.level0]);
            expectEdgeCount(mermaid, 0);
          });
        });

        describe('with one parent scope', () => {
          it('when parentScopeDepth == 1', async () => {
            // Create the tree
            const l1 = t.graph.treeForScope({
              scope: t.level0,
              parentScopeDepth: 1,
            });

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: l1 });
            await writeFile(l1, '09');

            // Check mermaid
            expectNodes(mermaid, [t.x, t.s1, t.s0, t.c0, t.c1]);
            expectScopes(mermaid, [t.level0, t.level1]);
            expectEdgeCount(mermaid, 4);
            expectEdge(mermaid, t.s1, t.x);
            expectEdge(mermaid, t.s0, t.x);
            expectEdge(mermaid, t.x, t.c0);
            expectEdge(mermaid, t.x, t.c1);
          });
        });

        describe('with one child scope', () => {
          it('when childScopeDepth == 1', async () => {
            // Create the tree
            const l1 = t.graph.treeForScope({
              scope: t.level1,
              childScopeDepth: 1,
            });

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: l1 });
            await writeFile(l1, '10');

            // Check mermaid
            expectNodes(mermaid, [t.x, t.s1, t.s0, t.c0, t.c1]);
            expectScopes(mermaid, [t.level0, t.level1]);
            expectEdgeCount(mermaid, 4);
            expectEdge(mermaid, t.s1, t.x);
            expectEdge(mermaid, t.s0, t.x);
            expectEdge(mermaid, t.x, t.c0);
            expectEdge(mermaid, t.x, t.c1);
          });
        });

        describe('with all parent scopes', () => {
          it('when parentScopeDepth == -1', async () => {
            // Create the tree
            const root = t.graph.treeForScope({
              scope: t.level0,
              parentScopeDepth: -1,
            });

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: root });
            await writeFile(root, '11');

            //// Check mermaid
            expectNodes(mermaid, t.allNodes);
            expectScopes(mermaid, [...t.allScopes, t.level0.root]);
            expectEdgeCount(mermaid, 14);
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

            // Create mermaid
            const mermaid = Graph.mermaid({ graph: root });
            await writeFile(root, '12');

            //// Check mermaid
            expectNodes(mermaid, t.allNodes);
            expectScopes(mermaid, t.allScopes);
            expectEdgeCount(mermaid, 14);
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
              expect(graphNode.nodeItems.length).toBe(4);

              // But also the direct child node should be shown.
              expect(graphNode.children.length).toBe(1);

              // But the child node should be shown without and children.
              const firstChild = graphNode.children[0];
              expect(firstChild.children.length).toBe(0);
              expect(firstChild.nodeItems.length).toBe(0);

              // Print the mermaid graph
              await writeFile(graphNode, '18');
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
          expect(graphNode.children.length).toBe(1);
          expect(graphNode.children[0].children.length).toBe(1);

          // Print the mermaid graph
          await writeFile(graphNode, '19');
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
          await writeFile(tree, '13');
        });

        it('multiple', async () => {
          const a = Scope.example({ key: 'a' });
          a.mockContent({
            b: { c: {} },
          });

          const tree = t.graph.treeForScope({ scope: a, childScopeDepth: -1 });
          await writeFile(tree, '14');
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

          // Create mermaid
          const mermaid = Graph.mermaid({ graph: tree });
          await writeFile(tree, '15');

          // Check mermaid
          expectNodes(mermaid, triangle.allNodes);
          expectScopes(mermaid, triangle.allScopes);
          expectEdgeCount(mermaid, 3);
          expectEdge(mermaid, topNode, leftNode);
          expectEdge(mermaid, topNode, rightNode);
          expectEdge(mermaid, leftNode, rightNode);
        });

        it('sibling node as customer', async () => {
          const tree = t.graph.treeForNode({
            node: leftNode,
            customerDepth: 1,
          });

          // Create mermaid
          await writeFile(tree, '16');
        });

        it('sibling node as supplier', async () => {
          const tree = t.graph.treeForNode({
            node: rightNode,
            supplierDepth: 1,
          });

          // Create mermaid
          await writeFile(tree, '17');
        });
      });
    });
  });
});
