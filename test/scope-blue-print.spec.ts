// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import * as os from 'node:os';
import * as nodePath from 'node:path';

import { describe, expect, it } from 'vitest';

// NOTE(port): These symbols are intentionally imported from their individual
// source files (in this order) rather than from '../src/index.ts'. The barrel
// in src/index.ts triggers a module-init-order cycle: Scm's eager static field
// `static readonly testInstance = new Scm(...)` constructs an Scm during module
// evaluation, which needs Disposed before its class binding is initialized when
// scm.ts is pulled in first via the barrel ("Disposed is not a constructor").
import { NodeBluePrint } from '../src/node-blue-print.ts';
import '../src/scm.ts';
import { Scope } from '../src/scope.ts';
import { Scm } from '../src/scm.ts';
import {
  ExampleScopeBluePrint,
  ScopeBluePrint,
} from '../src/scope-blue-print.ts';
import { ScBuilder } from '../src/sc-builder.ts';
import { ScBuilderBluePrint } from '../src/sc-builder-blue-print.ts';
// Imported for its side effect: registers the Insert factory in the registry,
// needed by ScBuilder.example() which adds inserts.
import '../src/insert.ts';
import { ArgumentError, AssertionError } from '../src/internal/errors.ts';

describe('ScopeBluePrint', () => {
  describe('example', () => {
    it('should provide a blue print with to nodes and one dependency', () => {
      const rootScope = Scope.root({ key: 'root', scm: Scm.example() });
      const scopeBluePrint = ScopeBluePrint.example();
      const scope = scopeBluePrint.instantiate({ scope: rootScope });
      const builtNode = scopeBluePrint.nodes[0];
      const dependency = scopeBluePrint.nodes[1];
      const builtScope = scopeBluePrint.children[0];
      const subScope = scopeBluePrint.children[scopeBluePrint.children.length - 1];
      const node = subScope.nodes[0] as NodeBluePrint<number>;
      const nodeInstance = scope.findNode<number>('node')!;
      const customer = subScope.nodes[subScope.nodes.length - 1] as NodeBluePrint<number>;
      const customerNode = scope.findNode<number>('customer')!;
      expect(scopeBluePrint.toString()).toEqual(scopeBluePrint.key);
      expect(builtNode.key).toEqual('builtNode');
      expect(dependency.key).toEqual('dependency');
      expect(builtScope.key).toEqual('builtScope');
      expect(node.key).toEqual('node');
      expect(customer.key).toEqual('customer');
      expect(node.produce([5], 0, nodeInstance)).toEqual(6);
      expect(customer.produce([6], 0, customerNode)).toEqual(7);
    });
  });

  describe('fromJson', () => {
    it('should create a scope blue print from a JSON map', () => {
      const json = {
        a: {
          int: 5,
          double: 6.0,
          string: 'Hello',
          bool: true,
          bluePrint: new NodeBluePrint<number>({
            key: 'bluePrint',
            initialProduct: 8,
          }),
          b: {
            c: { x: 123 },
          },
          c: new ScopeBluePrint({ key: 'c' }),
          numInt: 7,
          numDouble: 7.0,
        },
      };

      const scopeBluePrint = ScopeBluePrint.fromJson(json);
      expect(scopeBluePrint.key).toEqual('a');

      const expectNode = (i: number, key: string, value: unknown): void => {
        expect(scopeBluePrint.nodes[i].key).toEqual(key);
        expect(scopeBluePrint.nodes[i].initialProduct).toEqual(value);
      };

      // int/double/num collapse to number, so '6.0' and '7.0' are '6' and '7'.
      expectNode(0, 'int', 5);
      expectNode(1, 'double', 6.0);
      expectNode(2, 'string', 'Hello');
      expectNode(3, 'bool', true);
      expectNode(4, 'bluePrint', 8);
      expectNode(5, 'numInt', 7);
      expectNode(6, 'numDouble', 7.0);

      expect(scopeBluePrint.children.length).toEqual(2);
      expect(scopeBluePrint.children[0].key).toEqual('b');
      expect(scopeBluePrint.children[0].children.length).toEqual(1);
      expect(scopeBluePrint.children[0].children[0].key).toEqual('c');
      expect(
        scopeBluePrint.children[scopeBluePrint.children.length - 1].key,
      ).toEqual('c');

      expect(scopeBluePrint.children[0].children[0].nodes[0].key).toEqual('x');

      expect(
        scopeBluePrint.children[0].children[0].nodes[0].initialProduct,
      ).toEqual(123);
    });

    it('should assert that the key of a node and JSON are equal', () => {
      const json = {
        a: {
          int: new NodeBluePrint<number>({ key: 'otherKey', initialProduct: 5 }),
        },
      };

      expect(() => ScopeBluePrint.fromJson(json)).toThrow(AssertionError);
      expect(() => ScopeBluePrint.fromJson(json)).toThrow(
        'The key of the node "otherKey" must be "int".',
      );
    });

    it('should throw when in invalid type is provided', () => {
      const json = {
        a: { invalid: [] as number[] },
      };

      expect(() => ScopeBluePrint.fromJson(json)).toThrow(ArgumentError);
      expect(() => ScopeBluePrint.fromJson(json)).toThrow('not supported.');
    });

    it('should assert that the key of a scope and JSON are equal', () => {
      const json = {
        a: { key: new ScopeBluePrint({ key: 'otherKey' }) },
      };

      expect(() => ScopeBluePrint.fromJson(json)).toThrow(AssertionError);
      expect(() => ScopeBluePrint.fromJson(json)).toThrow(
        'The key of the node "otherKey" must be "key".',
      );
    });
  });

  describe('instantiate(scope)', () => {
    describe('should instantiate scopes and nodes returned in build()', () => {
      it('when build() returns a list of scope and node overrides', async () => {
        // Create a scope blue print
        // which overrides the with key nodeConstructedByChildScope
        const overridenScope = new ScopeBluePrint({
          key: 'childScopeConstructedByParent',
          nodes: [
            new NodeBluePrint<number>({
              key: 'nodeConstructedByChildScope',
              initialProduct: 6,
            }),
          ],
        });

        // Instantiate ExampleScopeBluePrint
        // and override the childScopeConstructedByParent
        const bluePrint = new ExampleScopeBluePrint({
          children: [overridenScope],
        });

        // Instantiate the scope blue print
        const rootScope = Scope.root({ key: 'root', scm: Scm.example() });
        const scope = bluePrint.instantiate({ scope: rootScope });

        // Check if all nodes were instantiated
        expect(scope.findNode<number>('parentScope/nodeBuiltByParent')).not.toBe(
          undefined,
        );

        expect(
          scope.findChildScope('childScopeConstructedByParent')!.bluePrint,
        ).toBe(overridenScope);

        expect(
          scope.findNode<number>('parentScope/nodeConstructedByParent'),
        ).not.toBe(undefined);

        // Find nodeBuiltByChildScope
        expect(
          scope.findNode<number>(
            'parentScope/childScopeBuiltByParent/nodeBuiltByChildScope',
          ),
        ).not.toBe(undefined);

        // Find childScopeConstructedByParent
        expect(
          scope.findNode<number>(
            'parentScope/childScopeConstructedByParent/' +
              'nodeConstructedByChildScope',
          ),
        ).not.toBe(undefined);

        // Write image
        await scope.writeImageFile(
          nodePath.join(
            os.tmpdir(),
            'test.graphs.example_scope_blue_print.dot',
          ),
        );
      });

      it('and apply nodesFromConstructor when provided', () => {
        const replacedBluePrint = new NodeBluePrint<number>({
          key: 'nodeBuiltByParent',
          initialProduct: 111,
        });

        const rootScope = Scope.example();
        const scope = new ExampleScopeBluePrint({
          nodes: [replacedBluePrint],
        }).instantiate({ scope: rootScope });

        expect(
          scope.findNode<number>('parentScope/nodeBuiltByParent')!.bluePrint,
        ).toBe(replacedBluePrint);
      });
    });

    describe('should throw if blueprints contain nodes with the same key', () => {
      it('when the keys are the same', () => {
        const bluePrint = new ScopeBluePrint({
          key: 'root',
          nodes: [
            new NodeBluePrint<number>({ key: 'node', initialProduct: 5 }),
            new NodeBluePrint<number>({ key: 'node', initialProduct: 6 }),
            new NodeBluePrint<number>({ key: 'node1', initialProduct: 5 }),
            new NodeBluePrint<number>({ key: 'node1', initialProduct: 6 }),
            new NodeBluePrint<number>({ key: 'node2', initialProduct: 6 }),
          ],
        });

        // A fresh root scope is used per call because `instantiate` mutates
        // the parent scope before the duplicate-key check throws.
        const run = (): void => {
          const rootScope = Scope.root({ key: 'root', scm: Scm.example() });
          bluePrint.instantiate({ scope: rootScope });
        };
        expect(run).toThrow(ArgumentError);
        expect(run).toThrow('Duplicate keys found: node, node1');
      });
    });

    describe('should apply connections', () => {
      it('and connect direct children to specified suppliers', () => {
        // Create a scope providing a width and a height
        const wh0Bp = ScopeBluePrint.fromJson({
          wh0: {
            w: 100,
            h: 200,
            d: 250, // Not connected
          },
        });

        // Create a second scope also providing a width2 and the height2
        const wh1Bp = ScopeBluePrint.fromJson({
          wh1: { w: 300, h: 400, d: 450 },
        });

        // Instantiate the second scope and connect the width2 and height2
        // to the width and height of the first scope.
        const root = Scope.example();
        const wh0 = wh0Bp.instantiate({ scope: root });
        const wh1 = wh1Bp.instantiate({
          scope: root,
          connect: new Map<string, string>([
            ['w', 'wh0/w'],
            ['h', 'wh0/h'],
            // ['d', 'wh0/d'], // Not connected
          ]),
        });

        // Changing width and height should change width2 and height2 too
        const scm = root.scm;
        scm.flush();
        const wh0Width = wh0.node<number>('w')!;
        const wh0Height = wh0.node<number>('h')!;
        const wh0Depth = wh0.node<number>('d')!;
        const wh1Width = wh1.node<number>('w')!;
        const wh1Height = wh1.node<number>('h')!;
        const wh1Depth = wh1.node<number>('d')!;

        expect(wh0Width.product).toEqual(100);
        expect(wh0Height.product).toEqual(200);
        expect(wh0Depth.product).toEqual(250);
        expect(wh1Width.product).toEqual(100);
        expect(wh1Height.product).toEqual(200);
        expect(wh1Depth.product).toEqual(450); // Not changed: not connected

        // Change the width and height of the first scope
        wh0Width.product = 101;
        wh0Height.product = 201;
        scm.flush();

        // Check if the width and height of the second scope changed
        expect(wh1Width.product).toEqual(101);
        expect(wh1Height.product).toEqual(201);
      });

      it('and connect deep children to specified suppliers', () => {
        // Create a scope providing a width and a height
        const wh0Bp = ScopeBluePrint.fromJson({
          wh0: {
            child: {
              w: 100,
              h: 200,
              d: 250, // Not connected
            },
          },
        });

        // Create a second scope also providing a width2 and the height2
        const wh1Bp = ScopeBluePrint.fromJson({
          wh1: { w: 300, h: 400, d: 450 },
        });

        // Instantiate the second scope and connect the width2 and height2
        // to the width and height of the first scope.
        const root = Scope.example();
        const wh0 = wh0Bp.instantiate({ scope: root });
        const wh1 = wh1Bp.instantiate({
          scope: root,
          connect: new Map<string, string>([
            ['w', 'wh0/child/w'],
            ['h', 'wh0/child/h'],
            // ['child/d', 'wh0/child/d'], // Not connected
          ]),
        });

        // Changing width and height should change width2 and height2 too
        const scm = root.scm;
        scm.flush();
        const wh0Width = wh0.findNode<number>('child/w')!;
        const wh0Height = wh0.findNode<number>('child/h')!;
        const wh0Depth = wh0.findNode<number>('child/d')!;
        const wh1Width = wh1.findNode<number>('w')!;
        const wh1Height = wh1.findNode<number>('h')!;
        const wh1Depth = wh1.findNode<number>('d')!;

        expect(wh0Width.product).toEqual(100);
        expect(wh0Height.product).toEqual(200);
        expect(wh0Depth.product).toEqual(250);
        expect(wh1Width.product).toEqual(100);
        expect(wh1Height.product).toEqual(200);
        expect(wh1Depth.product).toEqual(450); // Not changed: not connected

        // Change the width and height of the first scope
        wh0Width.product = 101;
        wh0Height.product = 201;
        scm.flush();

        // Check if the width and height of the second scope changed
        expect(wh1Width.product).toEqual(101);
        expect(wh1Height.product).toEqual(201);
      });

      it('and connect a complete scope', () => {
        // Create a scope providing a width and a height
        const parentBp = ScopeBluePrint.fromJson({
          parent: {
            wh0: {
              child: { w: 300, h: 400 },
            },
          },
        });

        // Create another scope providing a width2 and the height2
        const wh1Bp = ScopeBluePrint.fromJson({
          wh1: {
            child: { w: 700, h: 800 },
          },
        });

        // Instantiate the second scope and connect the width2 and height2
        // to the width and height of the first scope.
        const root = Scope.example();
        const parent = parentBp.instantiate({ scope: root });

        const wh1 = wh1Bp.instantiate({
          scope: root,
          connect: new Map<string, string>([
            ['wh1', 'parent/wh0'], // The complete scope is connected
          ]),
        });
        const wh0 = parent.findChildScope('wh0')!;

        // Changing width and height should change width2 and height2 too
        const scm = root.scm;
        scm.flush();
        const wh0Width = wh0.findNode<number>('child/w')!;
        const wh0Height = wh0.findNode<number>('child/h')!;
        const wh1Width = wh1.findNode<number>('child/w')!;
        const wh1Height = wh1.findNode<number>('child/h')!;

        expect(wh0Width.product).toEqual(300);
        expect(wh0Height.product).toEqual(400);

        expect(wh1Width.product).toEqual(300);
        expect(wh1Height.product).toEqual(400);

        // Change the width and height of the first scope
        wh0Width.product = 101;
        wh0Height.product = 201;
        scm.flush();

        // Check if the width and height of the second scope changed
        expect(wh1Width.product).toEqual(101);
        expect(wh1Height.product).toEqual(201);
      });

      it('and connect complete child scopes', () => {
        // Create a scope providing a width and a height
        const wh0Bp = ScopeBluePrint.fromJson({
          wh0: {
            child: { w: 300, h: 400 },
          },
        });

        // Create another scope providing a width2 and the height2
        const wh1Bp = ScopeBluePrint.fromJson({
          wh1: {
            child: { w: 700, h: 800 },
          },
        });

        // Instantiate the second scope and connect the width2 and height2
        // to the width and height of the first scope.
        const root = Scope.example();
        const wh0 = wh0Bp.instantiate({ scope: root });

        const wh1 = wh1Bp.instantiate({
          scope: root,
          connect: new Map<string, string>([['child', 'wh0/child']]),
        });

        // Changing width and height should change width2 and height2 too
        const scm = root.scm;
        scm.flush();
        const wh0Width = wh0.findNode<number>('child/w')!;
        const wh0Height = wh0.findNode<number>('child/h')!;
        const wh1Width = wh1.findNode<number>('child/w')!;
        const wh1Height = wh1.findNode<number>('child/h')!;

        expect(wh0Width.product).toEqual(300);
        expect(wh0Height.product).toEqual(400);

        expect(wh1Width.product).toEqual(300);
        expect(wh1Height.product).toEqual(400);

        // Change the width and height of the first scope
        wh0Width.product = 101;
        wh0Height.product = 201;
        scm.flush();

        // Check if the width and height of the second scope changed
        expect(wh1Width.product).toEqual(101);
        expect(wh1Height.product).toEqual(201);
      });

      it('and connect deeper child nodes to specified suppliers', () => {
        // Create a deeper scope providing a width and a height
        const wh0Bp = ScopeBluePrint.fromJson({
          wh0: {
            w: 100,
            h: 200,
            child: { w: 300, h: 400 },
          },
        });

        // Create another deeper scope providing a width2 and the height2
        const wh1Bp = ScopeBluePrint.fromJson({
          wh1: {
            w: 500,
            h: 600,
            child: { w: 700, h: 800 },
          },
        });

        // Instantiate the second scope and connect the width2 and height2
        // to the width and height of the first scope.
        const root = Scope.example();
        const wh0 = wh0Bp.instantiate({ scope: root });
        const wh1 = wh1Bp.instantiate({
          scope: root,
          connect: new Map<string, string>([
            ['child/w', 'wh0/child/w'],
            ['child/h', 'wh0/child/h'],
          ]),
        });

        // Changing width and height should change width2 and height2 too
        const scm = root.scm;
        scm.flush();
        const wh0Width = wh0.findNode<number>('child/w')!;
        const wh0Height = wh0.findNode<number>('child/h')!;
        const wh1Width = wh1.findNode<number>('child/w')!;
        const wh1Height = wh1.findNode<number>('child/h')!;

        expect(wh0Width.product).toEqual(300);
        expect(wh0Height.product).toEqual(400);

        expect(wh1Width.product).toEqual(300);
        expect(wh1Height.product).toEqual(400);

        // Change the width and height of the first scope
        wh0Width.product = 101;
        wh0Height.product = 201;
        scm.flush();

        // Check if the width and height of the second scope changed
        expect(wh1Width.product).toEqual(101);
        expect(wh1Height.product).toEqual(201);
      });

      it('and throw if a connection could not be established', () => {
        const wh0Bp = ScopeBluePrint.fromJson({
          wh0: {
            w: 100,
            h: 200,
            child: { w: 300, h: 400 },
          },
        });

        expect(() =>
          wh0Bp.instantiate({
            scope: Scope.example(),
            connect: new Map<string, string>([['x', 'y']]),
          }),
        ).toThrow(ArgumentError);
        expect(() =>
          wh0Bp.instantiate({
            scope: Scope.example(),
            connect: new Map<string, string>([['x', 'y']]),
          }),
        ).toThrow('The following connections could not be applied: {x: y}');
      });
    });

    it('should apply builders', () => {
      const builder = ScBuilder.example();
      const scope = builder.scope;
      expect(scope.builders[0]).toBe(builder);

      // See ScBuilder tests for more details
    });

    describe('should throw', () => {
      it('when a smart scope is instantiated in a smart scope', () => {
        const host = Scope.example({ smartMaster: ['x', 'y'] });
        const smartScope = new ScopeBluePrint({
          key: 'smartScope',
          smartMaster: ['x', 'y'],
        });
        expect(() => smartScope.instantiate({ scope: host })).toThrow(
          ArgumentError,
        );
        expect(() => smartScope.instantiate({ scope: host })).toThrow(
          'Smart scopes must not be instantiated in smart scopes.',
        );
      });
    });
  });

  describe('saveGraphToFile', () => {
    it('should print a simple graph correctly', async () => {
      const bluePrint = ScopeBluePrint.example();
      const parentScope = Scope.root({ key: 'outer', scm: Scm.example() });
      bluePrint.instantiate({ scope: parentScope });

      await parentScope.writeImageFile(
        nodePath.join(os.tmpdir(), 'scope_blue_print.dot'),
      );
    });
  });

  describe('node(key)', () => {
    it('should return null if no key with node is found', () => {
      const bluePrint = ScopeBluePrint.example();
      const node = bluePrint.node<number>('Unknown');
      expect(node).toBeUndefined();
    });

    it('should return the node with the given key', () => {
      const bluePrint =
        ScopeBluePrint.example().children[
          ScopeBluePrint.example().children.length - 1
        ];
      const node = bluePrint.node<number>('node');
      expect(node).not.toBeUndefined();
    });

    // TODO(port): src/scope-blue-print.ts `node<T>(key)` cannot perform a
    // runtime type check because TypeScript erases generics. Dart throws
    // `ArgumentError('Node with key "node" is not of type String.')`; the TS
    // `nodeWithKey` has no equivalent runtime check, so this cannot pass.
    it.skip('should throw if the type does not match', () => {
      const bluePrint =
        ScopeBluePrint.example().children[
          ScopeBluePrint.example().children.length - 1
        ];

      expect(() => bluePrint.node<string>('node')).toThrow(ArgumentError);
      expect(() => bluePrint.node<string>('node')).toThrow(
        'Node with key "node" is not of type String.',
      );
    });
  });

  describe('findItem(path), findNode(path), findPath(path)', () => {
    const bluePrint = ScopeBluePrint.fromJson({
      a: {
        n: 0,
        b: {
          c: { d: 5 },
        },
      },
    });
    describe('with path containing only one segment', () => {
      describe('should return null', () => {
        it('when no node with the given key is found at all', () => {
          const [node, path] = bluePrint.findItem('x');
          expect(node).toBeUndefined();
          expect(path).toBeUndefined();

          const node2 = bluePrint.findNode<number>('x');
          const path2 = bluePrint.absoluteNodePath('x');
          expect(node2).toBeUndefined();
          expect(path2).toBeUndefined();
        });
      });

      describe('should return the node', () => {
        it('when it exists directly in the root', () => {
          const [node, path] = bluePrint.findItem('n');
          expect((node as NodeBluePrint<number>).key).toEqual('n');
          expect(path).toEqual('a/n');

          const node2 = bluePrint.findNode<number>('n');
          const path2 = bluePrint.absoluteNodePath('n');
          expect(node2?.key).toEqual('n');
          expect(path2).toEqual('a/n');
        });
        it('when it exists somewhere deeper', () => {
          const [node, path] = bluePrint.findItem('d');
          expect((node as NodeBluePrint<number>).key).toEqual('d');
          expect(path).toEqual('a/b/c/d');

          const node2 = bluePrint.findNode<number>('d');
          const path2 = bluePrint.absoluteNodePath('d');
          expect(node2?.key).toEqual('d');
          expect(path2).toEqual('a/b/c/d');
        });
      });

      describe('should return the scope', () => {
        it('when the path segment matches a scope', () => {
          let [item, path] = bluePrint.findItem('a');
          expect(item).not.toBeUndefined();
          expect(path).toEqual('a');
          expect(item).toBeInstanceOf(ScopeBluePrint);
          expect((item as ScopeBluePrint).key).toEqual('a');

          [item, path] = bluePrint.findItem('b');
          expect(path).toEqual('a/b');
          expect(item).toBeInstanceOf(ScopeBluePrint);
          expect((item as ScopeBluePrint).key).toEqual('b');

          [item, path] = bluePrint.findItem('c');
          expect(path).toEqual('a/b/c');
          expect(item).toBeInstanceOf(ScopeBluePrint);
          expect((item as ScopeBluePrint).key).toEqual('c');
        });
      });

      describe('should throw', () => {
        it('when multiple nodes with the same path exist', () => {
          const bluePrint = ScopeBluePrint.fromJson({
            a: {
              k: 0,
              b: { n: 1 },
              c: { n: 1 },
            },
          });

          expect(() => bluePrint.findItem('n')).toThrow(ArgumentError);
          expect(() => bluePrint.findItem('n')).toThrow(
            'Multiple nodes with path "n" found.',
          );

          expect(() => bluePrint.findNode<number>('n')).toThrow(ArgumentError);
          expect(() => bluePrint.findNode<number>('n')).toThrow(
            'Multiple nodes with path "n" found.',
          );
        });
      });
    });

    describe('with path containing multiple segments', () => {
      describe('should return null', () => {
        it('when no node matches the given path', () => {
          const [node, path] = bluePrint.findItem('b/c/x');
          expect(node).toBeUndefined();
          expect(path).toBeUndefined();

          const node2 = bluePrint.findNode<number>('b/c/x');
          expect(node2).toBeUndefined();
        });

        it('when a path segment is missed', () => {
          const [node, path] = bluePrint.findItem('b/d');
          expect(node).toBeUndefined();
          expect(path).toBeUndefined();

          const node2 = bluePrint.findNode<number>('b/d');
          expect(node2).toBeUndefined();
        });
      });
      describe('should return the node', () => {
        it('when the path matches', () => {
          const [node, path] = bluePrint.findItem('b/c/d');
          expect(node).not.toBeUndefined();
          expect(path).toEqual('a/b/c/d');

          const node2 = bluePrint.findNode<number>('b/c/d');
          const path2 = bluePrint.absoluteNodePath('b/c/d');
          expect(node2).not.toBeUndefined();
          expect(path2).toEqual('a/b/c/d');
        });

        it('when the path contains the name of the root node', () => {
          const [node, path] = bluePrint.findItem('a/b/c/d');
          expect(node).not.toBeUndefined();
          expect(path).toEqual('a/b/c/d');

          const node2 = bluePrint.findNode<number>('a/b/c/d');
          const path2 = bluePrint.absoluteNodePath('a/b/c/d');
          expect(node2).not.toBeUndefined();
          expect(path2).toEqual('a/b/c/d');
        });
      });
    });
  });

  describe('allNodePathes', () => {
    const bluePrint = ScopeBluePrint.fromJson({
      a: {
        n: 0,
        b: {
          c: { d: 5 },
        },
      },
    });

    describe('with appendRootScopeKey == true', () => {
      it('should return all node pathes', () => {
        const pathes = bluePrint.allNodePathes({ appendRootScopeKey: true });
        expect(pathes).toEqual(['a/n', 'a/b/c/d']);
      });
    });

    describe('with appendRootScopeKey == fale', () => {
      it('should return all node pathes without root scope', () => {
        const pathes = bluePrint.allNodePathes({ appendRootScopeKey: false });
        expect(pathes).toEqual(['n', 'b/c/d']);
      });
    });

    describe('without options', () => {
      it('defaults appendRootScopeKey to false', () => {
        const pathes = bluePrint.allNodePathes();
        expect(pathes).toEqual(['n', 'b/c/d']);
      });
    });
  });

  describe('copyWith', () => {
    describe('returns the same instance', () => {
      it('when no parameter is provided', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({});
        expect(copy).toBe(bluePrint);
      });

      // TODO(port): Relies on Dart `const` canonicalization. In src/
      // scope-blue-print.ts, `ExampleScopeBluePrintSimple.buildNodes()` /
      // `buildScopes()` build a fresh array of freshly-constructed
      // NodeBluePrint/ScopeBluePrint instances on every `.nodes`/`.children`
      // access. `copyWith`'s early-return guard uses `listsAreEqual(...,
      // this.nodes)` which compares elements by `===`. In Dart the example's
      // `const` blue prints are canonicalized (identical across calls) so the
      // guard holds and `this` is returned; in TS each access yields new
      // instances, so the guard fails and a copy is returned. This is a real
      // src behavior difference (no const canonicalization in TS).
      it.skip('when given parameters are not changes', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({
          key: bluePrint.key,
          modifiedNodes: bluePrint.nodes,
          modifiedScopes: bluePrint.children,
          builders: bluePrint.builders,
          aliases: bluePrint.aliases,
          connections: bluePrint.connections,
          smartMaster: bluePrint.smartMaster,
          canBeSmart: bluePrint.canBeSmart,
        });
        expect(copy).toBe(bluePrint);
      });

      it('when modifiedNodes and scopes are empty', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({
          modifiedNodes: [],
          modifiedScopes: [],
          connections: new Map<string, string>(),
        });
        expect(copy).toBe(bluePrint);
      });

      it('when modifiedNodes/scopes equal the current ones (stable arrays)', () => {
        // A plain ScopeBluePrint exposes stable node/child/builder/alias arrays,
        // so the listsAreEqual(...) and ===-guards in copyWith all hold and
        // `this` is returned.
        const nodeBp = new NodeBluePrint<number>({
          key: 'n',
          initialProduct: 0,
        });
        const childBp = new ScopeBluePrint({ key: 'child' });
        const builderBp = new ScBuilderBluePrint({ key: 'builder' });
        const bluePrint = new ScopeBluePrint({
          key: 'stable',
          nodes: [nodeBp],
          children: [childBp],
          builders: [builderBp],
          aliases: ['alias'],
        });

        const copy = bluePrint.copyWith({
          modifiedNodes: bluePrint.nodes,
          modifiedScopes: bluePrint.children,
          builders: bluePrint.builders,
          aliases: bluePrint.aliases,
        });
        expect(copy).toBe(bluePrint);
      });
    });

    describe('returns a modified instance', () => {
      it('with overridden properties', () => {
        const bluePrint = ScopeBluePrint.example();
        const node = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 5,
        });
        const scope = ScopeBluePrint.example({ key: 'scope' });
        const builders = [new ScBuilderBluePrint({ key: 'builder' })];
        const aliases = ['alias'];
        const connections = new Map<string, string>([['a', 'b']]);
        const smartMaster = ['a', 'b', 'c'];
        const canBeSmart = false;

        const copy = bluePrint.copyWith({
          key: 'copy',
          modifiedNodes: [node],
          modifiedScopes: [scope],
          builders,
          aliases,
          connections,
          smartMaster,
          canBeSmart,
        });

        expect(copy.key).toEqual('copy');
        expect(copy.node<number>('node')).toBe(node);
        expect(copy.children[copy.children.length - 1]).toBe(scope);
        expect(copy.builders).toBe(builders);
        expect(copy.aliases).toBe(aliases);
        expect(copy.connections).toEqual(connections);
        expect(copy.copyWith({ canBeSmart: true }).smartMaster).toEqual(
          smartMaster,
        );
        expect(copy.canBeSmart).toEqual(canBeSmart);
      });
    });

    describe('should return a copy of the ScopeBluePrint', () => {
      it('with the given key', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({ key: 'copy' });
        expect(copy.key).toEqual('copy');
      });

      it('with the given nodes', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({ modifiedNodes: [] });
        expect(copy.nodes).toEqual(bluePrint.nodes);
      });

      it('with the given subScopes', () => {
        const bluePrint = ScopeBluePrint.example();
        const otherSubScopes: ScopeBluePrint[] = [];
        const copy = bluePrint.copyWith({ modifiedScopes: otherSubScopes });
        expect(copy.children).toEqual(bluePrint.children);
      });

      it('with the given overrides', () => {
        const bluePrint = ScopeBluePrint.example().children[0];
        const overriddenNode = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 5,
        });
        const copy = bluePrint.copyWith({ modifiedNodes: [overriddenNode] });
        expect(copy.node<number>('node')).toBe(overriddenNode);
      });

      it('with given smartMaster', () => {
        const bluePrint = ScopeBluePrint.example();
        const copy = bluePrint.copyWith({ smartMaster: ['a', 'b', 'c'] });
        expect(copy.smartMaster).toEqual(['a', 'b', 'c']);
      });

      it('when modifiedNodes differ by a single element of equal length', () => {
        const n1 = new NodeBluePrint<number>({ key: 'n', initialProduct: 0 });
        const n2 = new NodeBluePrint<number>({ key: 'n', initialProduct: 1 });
        const bluePrint = new ScopeBluePrint({ key: 'eq', nodes: [n1] });

        const copy = bluePrint.copyWith({ modifiedNodes: [n2] });
        expect(copy).not.toBe(bluePrint);
        expect(copy.node<number>('n')).toBe(n2);
      });
    });
  });

  describe('aliases', () => {
    it('should return the aliases of the scope', () => {
      const bluePrint = new ScopeBluePrintWithBuildAliases({
        key: 'test',
        aliases: ['hello'],
      });
      expect(bluePrint.aliases).toEqual(['extraAlias', 'hello']);
      expect(bluePrint.buildAliases()).toEqual(['extraAlias', 'hello']);
      expect(bluePrint.matchesKey('extraAlias')).toBe(true);
      expect(bluePrint.matchesKey('hello')).toBe(true);
    });
  });

  describe('connections', () => {
    it('should return the connections of the scope', () => {
      const bluePrint = new ScopeBluePrint({
        key: 'test',
        connect: new Map<string, string>([['a', 'b']]),
      });
      expect(bluePrint.connections).toEqual(new Map([['a', 'b']]));
      expect(bluePrint.buildConnections()).toEqual(new Map([['a', 'b']]));
    });
  });

  describe('mergeNodes(original, overrides)', () => {
    const a0 = NodeBluePrint.example({ key: 'a' });
    const a1 = NodeBluePrint.example({ key: 'a' });
    const b0 = NodeBluePrint.example({ key: 'b' });
    const b1 = NodeBluePrint.example({ key: 'b' });
    const c = NodeBluePrint.example({ key: 'c' });

    const all0 = [a0, b0];
    const all1 = [a1, b1];

    it('should return the original when overrides is null', () => {
      expect(
        ScopeBluePrint.mergeNodes({ original: all0, overrides: undefined }),
      ).toBe(all0);

      expect(
        ScopeBluePrint.mergeNodes({ original: all1, overrides: undefined }),
      ).toBe(all1);
    });

    it('should return the original, when overrides is empty', () => {
      expect(
        ScopeBluePrint.mergeNodes({ original: all0, overrides: [] }),
      ).toBe(all0);

      expect(
        ScopeBluePrint.mergeNodes({ original: all1, overrides: [] }),
      ).toBe(all1);
    });

    it('should replace the original with the overrides', () => {
      const result = ScopeBluePrint.mergeNodes({
        original: all0,
        overrides: all1,
      });
      expect(result).toEqual(all1);

      const result1 = ScopeBluePrint.mergeNodes({
        original: all0,
        overrides: [b1],
      });
      expect(result1).toEqual([a0, b1]);
    });

    it('should add overrides that are not part of the original', () => {
      const result = ScopeBluePrint.mergeNodes({
        original: all0,
        overrides: [c],
      });
      expect(result).toEqual([a0, b0, c]);
    });

    it('should return the overrides when the original is empty', () => {
      const overrides = [a0, b0];
      expect(
        ScopeBluePrint.mergeNodes({ original: [], overrides }),
      ).toBe(overrides);
    });
  });

  describe('mergeScopes(original, overrides)', () => {
    const a0 = ScopeBluePrint.example({ key: 'a' });
    const a1 = ScopeBluePrint.example({ key: 'a' });
    const b0 = ScopeBluePrint.example({ key: 'b' });
    const b1 = ScopeBluePrint.example({ key: 'b' });
    const c = ScopeBluePrint.example({ key: 'c' });

    const all0 = [a0, b0];
    const all1 = [a1, b1];

    it('should return the original when overrides is null', () => {
      expect(
        ScopeBluePrint.mergeScopes({ original: all0, overrides: undefined }),
      ).toBe(all0);

      expect(
        ScopeBluePrint.mergeScopes({ original: all1, overrides: undefined }),
      ).toBe(all1);
    });

    it('should return the original, when overrides is empty', () => {
      expect(
        ScopeBluePrint.mergeScopes({ original: all0, overrides: [] }),
      ).toBe(all0);

      expect(
        ScopeBluePrint.mergeScopes({ original: all1, overrides: [] }),
      ).toBe(all1);
    });

    it('should replace the original with the overrides', () => {
      const result = ScopeBluePrint.mergeScopes({
        original: all0,
        overrides: all1,
      });
      expect(result).toEqual(all1);

      const result1 = ScopeBluePrint.mergeScopes({
        original: all0,
        overrides: [b1],
      });
      expect(result1).toEqual([a0, b1]);
    });

    it('should add overrides that are not part of the original', () => {
      const result = ScopeBluePrint.mergeScopes({
        original: all0,
        overrides: [c],
      });
      expect(result).toEqual([a0, b0, c]);
    });

    it('should return the overrides when the original is empty', () => {
      const overrides = [a0, b0];
      expect(
        ScopeBluePrint.mergeScopes({ original: [], overrides }),
      ).toBe(overrides);
    });
  });

  describe('onInstantiate, onDispose', () => {
    it('is called when scope is instantiated and disposed', () => {
      let onInstantiateCalled: Scope | undefined;
      let onDisposeCalled: Scope | undefined;

      const bluePrint = new ScopeBluePrint({
        key: 'test',
        onInstantiate: (scope) => {
          onInstantiateCalled = scope;
        },
        onDispose: (scope) => {
          onDisposeCalled = scope;
        },
      });

      const rootScope = Scope.root({ key: 'root', scm: Scm.example() });
      const scope = bluePrint.instantiate({ scope: rootScope });
      expect(onInstantiateCalled).toBe(scope);

      scope.dispose();
      expect(onDisposeCalled).toBe(scope);
    });
  });

  describe('isSmartScope', () => {
    const bluePrint = ScopeBluePrint.example().copyWith({
      smartMaster: ['a', 'b'],
    });

    describe('returns true', () => {
      it('if a smartMaster is set', () => {
        expect(bluePrint.isSmartScope).toBe(true);
        expect(bluePrint.smartMaster).toEqual(['a', 'b']);
      });
    });

    describe('returns false', () => {
      it('if node is not a smart scope', () => {
        expect(bluePrint.copyWith({ smartMaster: [] }).isSmartScope).toBe(
          false,
        );
      });

      it('if not is a smart node but canBeSmart is set to false', () => {
        expect(bluePrint.copyWith({ canBeSmart: false }).isSmartScope).toBe(
          false,
        );
      });
    });
  });
});

// #############################################################################
class ScopeBluePrintWithBuildAliases extends ScopeBluePrint {
  override buildAliases(): readonly string[] {
    return ['extraAlias', ...super.buildAliases()];
  }
}
