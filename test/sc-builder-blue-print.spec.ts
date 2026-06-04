// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import {
  ExampleScBuilderBluePrint,
  Node,
  NodeBluePrint,
  ScBuilder,
  ScBuilderBluePrint,
  Scope,
  ScopeBluePrint,
} from '../src/index.ts';

describe('ScBuilderBluePrint', () => {
  const builder = ScBuilderBluePrint.example;
  const builderBluePrint = builder.bluePrint as ExampleScBuilderBluePrint;
  const hostScope = builder.scope;

  describe('example', () => {
    it('should trigger "needsUpdate" when a.other changes', () => {
      // Check state before
      const scope = builder.scope;
      expect(builderBluePrint.needsUpdateCalls).toHaveLength(1);

      // Change a.other which is set as "needsUpdateSuppliers"
      const a = scope.findNode<number>('a/other')!;
      a.product = 2;
      scope.scm.flush();

      // Check state after
      expect(builderBluePrint.needsUpdateCalls).toHaveLength(2);
      const [s, value] =
        builderBluePrint.needsUpdateCalls[
          builderBluePrint.needsUpdateCalls.length - 1
        ];
      expect(value[0]).toBe(2);
      expect(s).toBe(scope);
    });
  });

  describe('instantiate', () => {
    it('should create  a builder and add it to scope', () => {
      const scope = Scope.example();
      const builder = ScBuilderBluePrint.example.bluePrint.instantiate({
        scope,
      });
      expect(scope.builders).toContain(builder);
    });

    it('should apply all methods handed via constructor correctly ', () => {
      let didCallNeedsUpdate = false;
      const resultScope = ScopeBluePrint.example();
      const resultNode = NodeBluePrint.example();

      const builder = new ScBuilderBluePrint({
        key: 'test',
        addScopes: ({ hostScope }) => [resultScope],
        replaceScope: ({ hostScope, scopeToBeReplaced }) => {
          return resultScope;
        },
        addNodes: ({ hostScope }) => [resultNode],
        replaceNode: ({ hostScope, nodeToBeReplaced }) => resultNode,
        inserts: ({ hostNode }) => [resultNode],
        needsUpdate: ({ hostScope, components }) => {
          didCallNeedsUpdate = true;
        },
      });

      expect(builder.addScopes({ hostScope: Scope.example() })).toEqual([
        resultScope,
      ]);

      expect(
        builder.replaceScope({
          hostScope,
          scopeToBeReplaced: resultScope,
        }),
      ).toEqual(resultScope);

      expect(builder.addNodes({ hostScope })).toEqual([resultNode]);

      expect(
        builder.replaceNode({
          hostScope,
          nodeToBeReplaced: Node.example({ scope: hostScope }),
        }),
      ).toEqual(resultNode);

      expect(
        builder.inserts({ hostNode: Node.example({ scope: hostScope }) }),
      ).toEqual([resultNode]);

      builder.needsUpdate({ hostScope, components: [1, 2, 3] });
      expect(didCallNeedsUpdate).toBe(true);
    });
  });

  describe('base class methods', () => {
    it('addScopes', () => {
      expect(
        builderBluePrint.addScopes({ hostScope: Scope.example() }),
      ).toEqual([]);
    });

    it('replaceScope', () => {
      const scopeToBeReplaced = ScopeBluePrint.example();

      const replacedScope = builderBluePrint.replaceScope({
        hostScope,
        scopeToBeReplaced,
      });

      expect(replacedScope).toEqual(scopeToBeReplaced);

      expect(builderBluePrint.addNodes({ hostScope })).toEqual([]);
    });

    it('replaceNode', () => {
      const node = Node.example();

      const replacedNode = builderBluePrint.replaceNode({
        hostScope,
        nodeToBeReplaced: node,
      });

      expect(replacedNode).toEqual(node.bluePrint);
    });

    it('inserts(hostNode)', () => {
      const hostNode = Node.example();
      expect(builderBluePrint.inserts({ hostNode })).toHaveLength(0);
    });
  });

  describe('scopes', () => {
    describe('addScopes', () => {
      describe('when instantiating the builder', () => {
        describe('should apply the builder', () => {
          it('to the scope and all existing child scopes', () => {});
        });
      });
      describe('when instantiating new scopes', () => {
        describe('should apply the builder', () => {
          it('to the new scope and all new child scopes', () => {});
        });
      });
    });
    describe('replaceScope', () => {
      describe('when instantiating the builder', () => {
        describe('should replace the scope', () => {
          it('in all existing child scopes', () => {});
        });
      });
      describe('when instantiating new scopes', () => {
        describe('should replace the scope', () => {
          it('in all new child scopes', () => {});
        });
      });
    });
    describe('bypass', () => {
      it('should bypass all inserts added by the builder', () => {});
    });
    describe('dispose', () => {
      it('should remove all added scopes and their children', () => {});
      it('should remove all added scopes and their children and customers', () => {});

      it('should re-replace all replaced nodes by its original nodes', () => {});

      describe('should throw', () => {
        it('if there are customers relying on the scope', () => {});
      });
    });
  });

  describe('nodes', () => {
    describe('addNodes', () => {
      describe('when instantiating the builder', () => {
        it('add the nodes to the host scope and its children', () => {});
      });
      describe('when instantiating a new scope', () => {
        it('should add nodes to the new scope and its children', () => {});
      });
    });
    describe('replaceNode', () => {
      describe('when instantiating the builder', () => {
        describe('should replace the node', () => {
          it('in all existing matching child scopes', () => {});
        });
      });
      describe('when instantiating a new scope', () => {
        describe('should replace the node', () => {
          it('in the new node and its children', () => {});
        });
      });
    });

    describe('bypass', () => {
      it('should re-replace all replaced nodes by the original nodes', () => {});
    });

    describe('dispose', () => {
      it('should remove all added nodes', () => {});
      it('should remove all added nodes', () => {});

      it('should re-replace all replaced nodes by its original nodes', () => {});

      describe('should throw', () => {
        it('if there are customers relying on the nodes to be removed', () => {});
      });
    });
  });
  describe('inserts', () => {
    describe('addInserts', () => {
      describe('when instantiating the builder', () => {
        it('should add the inserts to all matching existing nodes', () => {});
      });
      describe('when instantiating new scopes', () => {
        it('should add the inserts to all matching new nodes', () => {});
      });
    });
    describe('bypass', () => {
      it('should bypass the production in all insert nodes', () => {});
    });
    describe('disable', () => {
      it('should remove all inserts from the chain', () => {});
    });

    describe('enable', () => {
      it('should add all inserts to the chain again', () => {});
    });

    describe('dispose', () => {
      it('should remove all added inserts', () => {});

      it('should throw if there are customers relying on the inserts', () => {});
    });
  });

  describe('shouldProcessChildren(scope)', () => {
    describe('should throw', () => {
      it('when not derived or specified by constructor / derived class', () => {
        const builder = new ScBuilderBluePrint({ key: 'test' });
        expect(() => builder.shouldProcessChildren(hostScope)).toThrow(
          'Please either specify shouldProcessChildren ' +
            'constructor parameter or override ' +
            'shouldProcessChildren method in your ' +
            'class derived from ScBuilderBluePrint.',
        );
      });
    });
  });

  describe('shouldProcessScope(scope), shouldProcessChildren(scope)', () => {
    describe('should throw', () => {
      it(
        'when shouldProcessScope is not derived or specified ' +
          'by constructor / derived class',
        () => {
          const builder = new ScBuilderBluePrint({ key: 'test' });
          expect(() => builder.shouldProcessScope(hostScope)).toThrow(
            'Please either specify shouldProcessScope ' +
              'constructor parameter or override ' +
              'shouldProcessScope method in your ' +
              'class derived from ScBuilderBluePrint.',
          );
        },
      );

      it(
        'when shouldProcessChildren is not derived or specified ' +
          'by constructor / derived class',
        () => {
          const builder = new ScBuilderBluePrint({ key: 'test' });
          expect(() => builder.shouldProcessChildren(hostScope)).toThrow(
            'Please either specify shouldProcessChildren ' +
              'constructor parameter or override ' +
              'shouldProcessChildren method in your ' +
              'class derived from ScBuilderBluePrint.',
          );
        },
      );
    });

    describe('should only process nodes matching the specified fillter', () => {
      const t = ScBuilder.testScope.key;
      let builder: ScBuilder;
      let scope: Scope;
      const shouldProcessScopeCalls: string[] = [];
      const shouldProcessChildrenCalls: string[] = [];
      const addNodesCalls: string[] = [];
      const addScopesCalls: string[] = [];
      const replaceNodeCalls: string[] = [];
      const replaceScopeCalls: string[] = [];
      const allCalls = [
        shouldProcessScopeCalls,
        addNodesCalls,
        addScopesCalls,
        replaceNodeCalls,
        replaceScopeCalls,
      ];

      const init = ({
        shouldProcessScope,
        shouldProcessChildren,
      }: {
        shouldProcessScope: (scope: Scope) => boolean;
        shouldProcessChildren: (scope: Scope) => boolean;
      }): void => {
        for (const calls of allCalls) {
          calls.length = 0;
        }

        scope = Scope.example();
        scope.mockContent({
          n0: 0,
          c0: {
            c1: { n2: 2 },
          },
        });

        builder = new ScBuilderBluePrint({
          key: 'test',
          shouldProcessScope: (scope: Scope) => {
            shouldProcessScopeCalls.push(scope.key);
            return shouldProcessScope(scope);
          },
          shouldProcessChildren: (scope: Scope) => {
            shouldProcessChildrenCalls.push(scope.key);
            return shouldProcessChildren(scope);
          },
          addNodes: ({ hostScope }) => {
            addNodesCalls.push(hostScope.key);
            return [];
          },
          addScopes: ({ hostScope }) => {
            addScopesCalls.push(hostScope.key);
            return [];
          },
          replaceNode: ({ hostScope, nodeToBeReplaced }) => {
            replaceNodeCalls.push(nodeToBeReplaced.key);
            return nodeToBeReplaced.bluePrint;
          },
          replaceScope: ({ hostScope, scopeToBeReplaced }) => {
            replaceScopeCalls.push(hostScope.key);
            return scopeToBeReplaced;
          },
        }).instantiate({ scope });

        builder.scope.scm.flush();
      };

      describe('with shouldProcessScope and shouldProcessChildren configured', () => {
        it('to process all scopes and nodes', () => {
          init({
            shouldProcessScope: (scope) => true,
            shouldProcessChildren: (scope) => true,
          });

          expect(shouldProcessScopeCalls).toEqual(['example', 'c0', 'c1']);
          expect(addNodesCalls).toEqual([t, 'example', 'c0', 'c1']);
          expect(addScopesCalls).toEqual([t, 'example', 'c0', 'c1']);
          expect(replaceNodeCalls).toEqual(['n0', 'n2']);
          expect(replaceScopeCalls).toEqual([]); // Not yet implemented
        });

        it('to process only c1', () => {
          init({
            shouldProcessScope: (scope) => scope.key === 'c1',
            shouldProcessChildren: (scope) =>
              ['example', 'c0'].includes(scope.key),
          });

          expect(shouldProcessScopeCalls).toEqual(['example', 'c0', 'c1']);
          expect(addNodesCalls).toEqual([t, 'c1']);
          expect(addScopesCalls).toEqual([t, 'c1']);
          expect(replaceNodeCalls).toEqual(['n2']);
          expect(replaceScopeCalls).toEqual([]); // Not yet implemented
        });

        it('to process only n0', () => {
          init({
            shouldProcessChildren: (scope) => false,
            shouldProcessScope: (scope) => scope.key === 'example',
          });

          expect(shouldProcessScopeCalls).toEqual(['example']);
          expect(addNodesCalls).toEqual([t, 'example']);
          expect(addScopesCalls).toEqual([t, 'example']);
          expect(replaceNodeCalls).toEqual(['n0']);
          expect(replaceScopeCalls).toEqual([]); // Not yet implemented
        });
      });
    });
  });
});
