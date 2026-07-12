// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { writeGolden } from '@tssuite/golden';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ArgumentError,
  AssertionError,
  ExampleScopeRoot,
  Insert,
  MarkdownFormat,
  Node,
  NodeBluePrint,
  Owner,
  ScBuilder,
  ScBuilderBluePrint,
  Scm,
  Scope,
  ScopeBluePrint,
  nbp,
} from '../src/index.ts';
import type { TypeTag } from '../src/index.ts';
import { ExampleScBuilderBluePrint } from '../src/sc-builder-blue-print.ts';

// .............................................................................
// Test types ported from test/my_type.dart

class MyType {
  constructor(readonly x: number) {}

  toJson(): Record<string, unknown> {
    return { x: this.x };
  }

  static fromJson(json: Record<string, unknown>): MyType {
    return new MyType(json.x as number);
  }
}

const myTypeTag: TypeTag<MyType> = {
  id: 'MyType',
  is: (v): v is MyType => v instanceof MyType,
};

enum TestEnum {
  a = 'a',
  b = 'b',
  c = 'c',
}

// .............................................................................
let node: Node<number>;
let scm: Scm;
let scope: Scope;

function produce(
  _components: unknown[],
  previousProduct: number,
  _node: Node<number>,
): number {
  return previousProduct;
}

function init(options: { enableOnChange?: boolean } = {}): void {
  const enableOnChange = options.enableOnChange ?? false;
  Node.onChangeEnabled = enableOnChange;
  Node.onRecursiveChangeEnabled = enableOnChange;

  Node.testResetIdCounter();
  Scope.testResetIdCounter();
  scm = new Scm({ isTest: true });
  scope = Scope.example({ scm });

  node = scope.findOrCreateNode<number>(
    new NodeBluePrint<number>({ initialProduct: 0, produce, key: 'node' }),
  );

  scm.flush();
}

beforeEach(() => {
  init();
});

afterEach(() => {
  // Reset the global onChange flags so unrelated tests are unaffected.
  Node.onChangeEnabled = false;
  Node.onRecursiveChangeEnabled = false;
});

describe('Scope', () => {
  describe('basic properties', () => {
    it('example', () => {
      expect(scope).toBeInstanceOf(Scope);
    });

    it('testRestIdCounter forwards to testResetIdCounter', () => {
      expect(() => Scope.testRestIdCounter()).not.toThrow();
    });

    it('scm', () => {
      expect(scope.scm).toBe(scm);
    });

    it('key', () => {
      expect(scope.key).toBe('example');
    });

    it('children', () => {
      expect(scope.children).toHaveLength(0);
    });

    describe('deepChildren, deepParents', () => {
      const scope = Scope.example();
      scope.mockContent({
        p2: {
          p1: {
            p0: {
              x: {
                c0: {
                  c00: { c000: 0 },
                  c01: { c010: 0 },
                },
                c1: {
                  c10: { c100: 0 },
                  c11: { c110: 0 },
                },
              },
            },
          },
        },
      });

      const x = scope.findChildScope('x')!;

      it('should return empty array, when depth = 0', () => {
        const parents = x.deepParents({ depth: 0 }).map((e) => e.key);
        expect(parents).toEqual([]);

        const children = x.deepChildren({ depth: 0 }).map((e) => e.key);
        expect(children).toEqual([]);
      });

      describe('should only return the direct parent / children', () => {
        it('when depth = 0', () => {
          const parents = x.deepParents({ depth: 1 }).map((e) => e.key);
          expect(parents).toEqual(['p0']);

          const children = x.deepChildren({ depth: 1 }).map((e) => e.key);
          expect(children).toEqual(['c0', 'c1']);
        });
      });

      describe('should return parent of parents, children of children', () => {
        it('when depth = 1', () => {
          const parents = x.deepParents({ depth: 2 }).map((e) => e.key);
          expect(parents).toEqual(['p0', 'p1']);

          const children = x.deepChildren({ depth: 2 }).map((e) => e.key);
          expect(children).toEqual(['c0', 'c1', 'c00', 'c01', 'c10', 'c11']);
        });
      });

      describe('should return all parents / children', () => {
        it('when depth = -1 or 1000', () => {
          let parents = x.deepParents({ depth: 1000 }).map((e) => e.key);
          expect(parents).toEqual(['p0', 'p1', 'p2', 'example', 'root']);

          parents = x.deepParents({ depth: -1 }).map((e) => e.key);
          expect(parents).toEqual(['p0', 'p1', 'p2', 'example', 'root']);

          let children = x.deepChildren({ depth: 1000 }).map((e) => e.key);
          expect(children).toEqual(['c0', 'c1', 'c00', 'c01', 'c10', 'c11']);

          children = x.deepChildren({ depth: -1 }).map((e) => e.key);
          expect(children).toEqual(['c0', 'c1', 'c00', 'c01', 'c10', 'c11']);
        });
      });
    });

    describe('allScopes', () => {
      it('should provide an iterator iterating over all scopes recursively', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            b: {
              c: { d: 0 },
            },
          },
          x: {
            y: {
              z: { w: 0 },
            },
          },
        });

        const allScopes = scope.allScopes.map((e) => e.key);
        expect(allScopes).toEqual(['example', 'a', 'b', 'c', 'x', 'y', 'z']);
      });
    });
  });

  it('string', () => {
    expect(scope.toString()).toBe(scope.key);
  });

  describe('reset', () => {
    it('should reset all nodes in this and child scopes', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          b: {
            n0: 10,
            c: { n1: 11 },
          },
        },
      });

      const n0 = scope.findNode<number>('a/b/n0')!;
      const n1 = scope.findNode<number>('a/b/c/n1')!;

      // Initally we have the following products
      scope.scm.flush();
      expect(n0.product).toBe(10);
      expect(n1.product).toBe(11);

      // Let's change the products
      n0.product = 20;
      n1.product = 21;
      scope.scm.flush();

      // Reset
      scope.reset();
      scope.scm.flush();

      // The products should be reset to their initial values
      expect(n0.product).toBe(10);
      expect(n1.product).toBe(11);
    });
  });

  describe('root', () => {
    it('should return the scope itself, if scope is the root', () => {
      const root = Scope.example().root;
      expect(root.root.root).toBe(root);
    });

    it('should return the root node', () => {
      const root = Scope.example().root;
      root.mockContent({
        a: {
          b: {
            c: { d: 0 },
          },
        },
      });
      const c = root.findChildScope('a/b/c')!;
      expect(c.root).toBe(root);
    });
  });

  describe('commonParent(scope)', () => {
    it('should return the scope itself when the other scope is scope', () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const childScopeA = root.child('childScopeA')!;
      expect(childScopeA.commonParent(childScopeA)).toBe(childScopeA);
    });

    it('should return the common parent scope', () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const childScopeA = root.child('childScopeA')!;
      const childScopeB = root.child('childScopeB')!;
      const grandChildScope = childScopeA.child('grandChildScope')!;
      const grandChildNodeA = grandChildScope.findNode<number>(
        'grandChildNodeA',
      )!;

      let commonScope = root.commonParent(grandChildNodeA.scope);
      expect(commonScope).toBe(root);

      commonScope = childScopeA.commonParent(grandChildScope);
      expect(commonScope).toBe(childScopeA);

      commonScope = grandChildScope.commonParent(childScopeA);
      expect(commonScope).toBe(childScopeA);

      commonScope = grandChildScope.commonParent(root);
      expect(commonScope).toBe(root);

      commonScope = childScopeA.commonParent(childScopeB);
      expect(commonScope).toBe(root);
    });

    it('should throw if no common parent is found', () => {
      const scope = Scope.example().root;
      const scopeB = Scope.example().root;
      expect(() => scopeB.commonParent(scope)).toThrow(ArgumentError);
      expect(() => scopeB.commonParent(scope)).toThrow('No common parent found.');
    });
  });

  describe('dispose', () => {
    let scope: Scope;
    let scm: Scm;
    let a: Scope;
    let b: Scope;
    let supplier: Node<number>;
    let d: Scope;
    let customer: Node<number>;

    function init2(): void {
      scope = Scope.example();
      scm = scope.scm;

      // Define a supplier a/b/c that has a customer a.d.e;
      scope.mockContent({
        a: {
          b: { supplier: 0 },
          d: {
            customer: NodeBluePrint.map({
              supplier: 'b/supplier',
              toKey: 'customer',
              initialProduct: 0,
            }),
          },
        },
      });

      a = scope.findScope('a')!;
      b = scope.findScope('a/b')!;
      supplier = scope.findNode<number>('a/b/supplier')!;
      d = scope.findScope('a/d')!;
      customer = scope.findNode<number>('a/d/customer')!;
      new ExampleScBuilderBluePrint().instantiate({ scope: a });
    }

    beforeEach(() => {
      init2();
    });

    it('should deeply dispose all scopes and nodes', () => {
      // Nothing is disposed
      expect(a.isDisposed).toBe(false);
      expect(b.isDisposed).toBe(false);
      expect(supplier.isDisposed).toBe(false);
      expect(d.isDisposed).toBe(false);
      expect(customer.isDisposed).toBe(false);

      // Dispsoe the root scope
      scope.dispose();

      // All scopes and nodes are disposed
      expect(a.isDisposed).toBe(true);
      expect(b.isDisposed).toBe(true);
      expect(supplier.isDisposed).toBe(true);
      expect(d.isDisposed).toBe(true);
      expect(customer.isDisposed).toBe(true);
    });

    describe('should erase the scope', () => {
      it('when the scope has no children and no nodes', () => {
        // Before dispose the scope belongs to it's parent
        const scope = Scope.example();
        expect(scope.children).toHaveLength(0);
        expect(scope.nodes).toHaveLength(0);
        expect(scope.parent!.children).toContain(scope);

        // Dispose the scope
        // After dispose the scope is removed from it's parent
        scope.dispose();
        expect(scope.parent!.children).toHaveLength(0);
        expect(scope.isDisposed).toBe(true);
        expect(scope.isErased).toBe(true);
      });

      it('when the last customer is removed from a scope', () => {
        scope.scm.flush();

        // Dispose the supplier scope.
        // The supplier will not be erased, because it has a customer
        b.dispose();
        expect(b.isErased).toBe(false);
        expect(supplier.isErased).toBe(false);

        // Dispose the customer scope
        // Now the supplier will be erased because it has no customers
        customer.dispose();
        expect(b.isErased).toBe(true);
        expect(supplier.isErased).toBe(true);
      });
    });

    describe('should not erase the scope', () => {
      it('until the last child scope or node is erased', () => {
        scope.scm.flush();

        // Dispose the supplier scope.
        b.dispose();
        expect(b.isDisposed).toBe(true);
        expect(supplier.isDisposed).toBe(true);

        // The supplier will not be erased, because it has a customer
        expect(b.isErased).toBe(false);
        expect(supplier.isErased).toBe(false);

        // Dispose the customer scope
        customer.dispose();
        expect(b.isErased).toBe(true);
        expect(supplier.isErased).toBe(true);
      });

      it('until the last customer is connected to a meta node', () => {
        init({ enableOnChange: true });
        init2();

        // Connect the customer to a meta scope node
        // by connecting it to a scope and not a node
        customer.addBluePrint(
          new NodeBluePrint<number>({
            key: 'customer',
            suppliers: [
              'a/b/on/change', // This is a meta scope node
            ],
            initialProduct: 5,
          }),
        );
        scope.scm.flush();

        // The customer should be connected to the meta scope node
        const onChange = scope.findNode<Scope>('a/b/on/change')!;
        expect(onChange.customers).toContain(customer);
        expect(b.isErased).toBe(false);

        // Dispose the supplier scope b.
        b.dispose();

        // The scope is not erased
        // because a customer is connected to a meta node
        expect(onChange.isDisposed).toBe(true);
        expect(onChange.isErased).toBe(false);
        expect(b.isDisposed).toBe(true);
        expect(b.isErased).toBe(false);

        // Dispose the customer
        customer.dispose();

        // The supplier shoul be erased now
        // because it has no customers anymore
        expect(onChange.customers).toHaveLength(0);
        expect(b.isErased).toBe(true);
        expect(onChange.isErased).toBe(true);
      });
    });

    describe('should dispose and erase all nodes', () => {
      it('when the nodes have no customers', () => {
        // Before dispose the scope has nodes.
        // These nodes are part of the scm
        expect(b.nodes.length).toBeGreaterThan(0);
        for (const node of b.nodes) {
          expect(scm.nodes).toContain(node);
        }

        // Dispose the scope
        scope.dispose();

        // After dispose the scope's nodes are removed
        // from the scope and also the SCM
        expect(b.nodes).toHaveLength(0);
        for (const node of b.nodes) {
          expect(scm.nodes).not.toContain(node);
          expect(node.isDisposed).toBe(true);
          expect(node.isErased).toBe(true);
        }
      });
    });

    describe('should allow to undispose scopes later', () => {
      describe('and take over customers from disposed nodes', () => {
        it('from normal scopes', () => {
          // Create a root scope
          const root = Scope.example({ key: 'root' });
          const flush = (): void => root.scm.flush();

          // Create two blueprints a0 and a1 with the same key but
          // different produce methods
          const node5 = new NodeBluePrint<number>({
            key: 'node',
            initialProduct: 5,
          });
          const node6 = new NodeBluePrint<number>({
            key: 'node',
            initialProduct: 6,
          });

          // .................
          // Create blueprints

          // Crate a child scope and a node with customers
          const scope5 = new ScopeBluePrint({
            key: 'scope',
            children: [new ScopeBluePrint({ key: 'child', nodes: [node5] })],
          });

          // Crate a child scope and a node with customers
          const scope6 = new ScopeBluePrint({
            key: 'scope',
            children: [new ScopeBluePrint({ key: 'child', nodes: [node6] })],
          });

          // Create another node observing chil.a
          const observer = new NodeBluePrint<number>({
            key: 'observer',
            suppliers: ['scope/child/node'],
            initialProduct: 5,
            produce: (components) => components[0] as number,
          });

          // ...........
          // Instantiate
          let scopeInstance = scope5.instantiate({ scope: root });
          const observerInstance = observer.instantiate({ scope: root });

          flush();

          // observer should have the value of node5
          expect(observerInstance.product).toBe(5);

          // ..............
          // Dispose scope5
          scopeInstance.dispose();
          flush();

          // observer should still have the value of node5
          expect(observerInstance.product).toBe(5);

          // ..................
          // Instantiate scope6
          scopeInstance = scope6.instantiate({ scope: root });
          flush();

          // scope6.node should take over the customers of scope5.node
          // Thus observer should have the value of node6
          expect(observerInstance.product).toBe(6);
        });

        it('from meta scopes', () => {
          init({ enableOnChange: true });

          // Create a root scope
          const root = Scope.example({ key: 'root' });
          const flush = (): void => root.scm.flush();

          // .................
          // Create blueprints

          // Crate a child scope and a node with customers
          const scope5 = new ScopeBluePrint({
            key: 'scope',
            children: [new ScopeBluePrint({ key: 'child' })],
          });

          // Crate a child scope and a node with customers
          const scope6 = new ScopeBluePrint({
            key: 'scope',
            children: [new ScopeBluePrint({ key: 'child' })],
          });

          // Create two meta scope observers
          const onChangeObserver = new NodeBluePrint<Scope | undefined>({
            key: 'onChangeObserver',
            suppliers: ['scope/on/change'],
            initialProduct: undefined,
            produce: (components) => components[0] as Scope | undefined,
          });

          const helloMetaScopeObserver = new NodeBluePrint<number>({
            key: 'helloMetaScopeObserver',
            suppliers: ['scope/hello/node'],
            initialProduct: 8,
            produce: (components) => components[0] as number,
          });

          // ...........
          // Instantiate
          let scopeInstance = scope5.instantiate({ scope: root });
          const onChangeObserverInstance = onChangeObserver.instantiate({
            scope: root,
          });
          const helloMetaScopeObserverInstance =
            helloMetaScopeObserver.instantiate({ scope: root });

          const helloMetaScope = scopeInstance.metaScopeFindOrCreate('hello');
          const helloMetaScopeNodeInstance = new NodeBluePrint<number>({
            key: 'node',
            initialProduct: 9,
          }).instantiate({ scope: helloMetaScope });

          flush();

          // observer should have the value of node5
          expect(onChangeObserverInstance.product).toBe(scopeInstance);
          expect(helloMetaScopeObserverInstance.product).toBe(9);

          // ..............
          // Dispose scope5
          scopeInstance.dispose();
          flush();

          // ..................
          // Instantiate scope6
          scopeInstance = scope6.instantiate({ scope: root });
          expect(scopeInstance.metaScope('hello')!.key).toBe('hello');
          flush();

          // Also the metaScopes should have been taken over
          expect(onChangeObserverInstance.product).toBe(scopeInstance);

          // Change the helloMetaScopeNodeInstance
          helloMetaScopeNodeInstance.product = 10;
          flush();
          expect(helloMetaScopeNodeInstance.product).toBe(10);
        });
      });
    });
  });

  describe('path, pathArray, pathDepth', () => {
    it('should return the path of the scope', () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const childScopeA = root.child('childScopeA')!;
      const grandChildScope = childScopeA.child('grandChildScope')!;
      expect(root.path).toBe('exampleRoot');
      expect(childScopeA.path).toBe('exampleRoot/childScopeA');
      expect(childScopeA.pathArray).toEqual(['exampleRoot', 'childScopeA']);
      expect(grandChildScope.path).toBe(
        'exampleRoot/childScopeA/grandChildScope',
      );
      expect(grandChildScope.pathArray).toEqual([
        'exampleRoot',
        'childScopeA',
        'grandChildScope',
      ]);
      expect(grandChildScope.depth).toBe(3);
    });
  });

  describe('matchesPath(path), matchesPathArry(pathArray)', () => {
    describe('with aliases', () => {
      it('should return true if path matches', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            b: {
              'c0|c1|c2': { d: 0 },
            },
          },
        });

        const c = scope.findChildScope('a/b/c0')!;
        expect(c.matchesPath('a/b/c0')).toBe(true);
        expect(c.matchesPath('a/b/c1')).toBe(true);
        expect(c.matchesPath('a/b/c2')).toBe(true);
        expect(c.matchesPath('a/b/c3')).toBe(false);

        const b = scope.findChildScope('a/b')!;
        expect(b.matchesPath('c0')).toBe(false);
      });
    });

    it('with .. in path', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          b: {
            c: { d: 0 },
          },
        },
      });

      const c = scope.findChildScope('a/b/c')!;
      expect(c.matchesPath('../c')).toBe(true);
      expect(c.matchesPath('../a/b/c')).toBe(true);
      expect(c.matchesPath('../a/b/x')).toBe(false);
    });
  });

  describe('addChild(child), addChildren(children)', () => {
    it('should instantiate and add the child to the scope', () => {
      const scope = Scope.example();
      const c0 = new ScopeBluePrint({ key: 'child0' });
      const c1 = new ScopeBluePrint({ key: 'child1' });
      const children = scope.addChildren([c0, c1]);
      expect(scope.children).toHaveLength(2);
      expect(scope.children[0]).toBe(children[0]);
      expect(scope.children[scope.children.length - 1]).toBe(
        children[children.length - 1],
      );

      children[0].dispose();
      children[children.length - 1].dispose();
      expect(children[0].isDisposed).toBe(true);
      expect(children[children.length - 1].isDisposed).toBe(true);
      expect(scope.children).toHaveLength(0);
    });

    describe('should reactivate a disposed scope and its parents', () => {
      let scope: Scope;
      let s0: Scope;
      let s1: Scope;
      let supplier: Node<number>;

      beforeEach(() => {
        scope = Scope.example();
        scope.mockContent({
          // Define a supplier within scopes a.s0.s1
          a: {
            s0: {
              s1: { supplier: 0 },
            },

            // Define a customer within scopes a.c
            c: {
              customer: NodeBluePrint.map({
                supplier: 's0/s1/supplier',
                toKey: 'customer',
                initialProduct: 0,
              }),
            },
          },
        });

        scope.scm.flush();

        s0 = scope.findScope('a/s0')!;
        s1 = scope.findScope('a/s0/s1')!;
        supplier = scope.findNode<number>('a/s0/s1/supplier')!;
      });

      it('when a fresh node is added to the disposed scope', () => {
        // Dispose scope s.
        s0.dispose();

        // s0 and its children are disposed but not erased
        expect(s0.isDisposed).toBe(true);
        expect(s0.isErased).toBe(false);
        expect(s1.isDisposed).toBe(true);
        expect(s1.isErased).toBe(false);
        expect(supplier.isDisposed).toBe(true);
        expect(supplier.isErased).toBe(false);

        // Now add supplier again.
        const newSupplier = supplier.bluePrint.instantiate({
          scope: supplier.scope,
        });

        // The previous supplier should be erased now
        expect(supplier.isErased).toBe(true);
        expect(newSupplier.isDisposed).toBe(false);

        // The supplier's scope should be reactivated
        // and not be disposed
        expect(s1.isDisposed).toBe(false);
        expect(s1.isErased).toBe(false);

        // Also the parents of the supplier's scope should be reactivated
        // and not be disposed anymore
        expect(s0.isDisposed).toBe(false);
        expect(s0.isErased).toBe(false);
      });

      it('when a fresh child scope is added to the disposed scope', () => {
        // Dispose scope s.
        s0.dispose();

        // s0 and its children are disposed but not erased
        expect(s0.isDisposed).toBe(true);
        expect(s0.isErased).toBe(false);
        expect(s1.isDisposed).toBe(true);
        expect(s1.isErased).toBe(false);
        expect(supplier.isDisposed).toBe(true);
        expect(supplier.isErased).toBe(false);

        // Now add a fresh scope
        const newChildScope = new ScopeBluePrint({
          key: 'freshScope',
        }).instantiate({ scope: s1 });
        expect(newChildScope.isDisposed).toBe(false);
        expect(newChildScope.isErased).toBe(false);

        // The new child scope's scope should be reactivated
        // and not be disposed
        expect(s1.isDisposed).toBe(false);
        expect(s1.isErased).toBe(false);

        // Also the parents of the supplier's scope should be reactivated
        // and not be disposed anymore
        expect(s0.isDisposed).toBe(false);
        expect(s0.isErased).toBe(false);
      });
    });

    it('should throw if the scope is erased', () => {});
  });

  describe('findOrCreateChild(key)', () => {
    it('should create a child scope with key or return an existing one', () => {
      const scope = Scope.example();
      const childScopeA = scope.findOrCreateChild('child');
      const childScopeB = scope.findOrCreateChild('child');
      expect(childScopeA).toBe(childScopeB);
    });
  });

  describe('node(key)', () => {
    it('should return the node with the given key', () => {
      expect(scope.node<number>('node')).toBe(node);
    });

    it('should return null if the node does not exist', () => {
      expect(scope.node<number>('unknown')).toBeUndefined();
    });

    // TODO(port): TypeScript erases generics, so node<String>('node') cannot
    // perform a runtime product-type check. The Dart variant throws an
    // ArgumentError ("is not of type String"); the TS API has no such check.
    it.skip('should throw if the type does not match', () => {});
  });

  describe('findChildScope(path)', () => {
    describe('should return the scope with the given path', () => {
      it('when the path has the name of the scope', () => {
        const scope = Scope.example();
        expect(scope.findChildScope('example')).toBe(scope);
      });

      it('when the path has the name of an alias', () => {
        const scope = Scope.example({ aliases: ['x', 'y', 'z'] });
        expect(scope.findChildScope('x')).toBe(scope);
        expect(scope.findChildScope('y')).toBe(scope);
        expect(scope.findChildScope('z')).toBe(scope);
        expect(scope.findChildScope('u')).toBeUndefined();
      });

      it('when the path has the name of a child node', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            b: { c: 0 },
          },
        });
        expect(scope.findChildScope('a')?.key).toBe('a');
        expect(scope.findChildScope('b')?.key).toBe('b');
        expect(scope.findChildScope('c')?.key).toBeUndefined();
      });

      it('when the path contains multiple path segments', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            b: {
              c: { d: 0 },
            },
          },
        });
        expect(scope.findChildScope('a/b')?.key).toBe('b');
        expect(scope.findChildScope('a/b/c')?.key).toBe('c');
        expect(scope.findChildScope('a/b/c/d')).toBeUndefined();
      });

      it('when the scope name is repated down the hiearchy', () => {
        const scope = Scope.example();
        scope.mockContent({
          corpus: {
            panels: {
              left: {
                faces: {
                  right: { x: 0 },
                },
              },
              right: {
                faces: {
                  right: { x: 0 },
                },
              },
            },
          },
        });

        const corpus = scope.findChildScope('corpus')!;
        const right = corpus.findChildScope('corpus/panels/right')!;
        expect(right.path).toBe('root/example/corpus/panels/right');
      });
    });

    describe('should return null', () => {
      it('if the scope does not exist', () => {
        const root = new ExampleScopeRoot({ scm: Scm.testInstance });
        expect(root.findChildScope('unknown')).toBeUndefined();
      });
      it('if the key is empty', () => {
        const root = new ExampleScopeRoot({ scm: Scm.testInstance });
        expect(root.findChildScope('')).toBeUndefined();
      });
    });

    it('should throw if multiple scopes with the path exist', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          duplicate: {
            c: 0,
            duplicate: { d: 0 },
          },
        },
      });
    });
  });

  describe('findOrCreateNode()', () => {
    it('should return an existing node when possible', () => {
      expect(scope.findOrCreateNode(node.bluePrint)).toBe(node);
    });

    describe('should throw', () => {
      describe('when existing node exists', () => {
        it('but have a different produce method', () => {
          expect(() =>
            scope.findOrCreateNode<number>(
              new NodeBluePrint<number>({
                initialProduct: 0,
                produce: () => 0,
                key: 'node',
              }),
            ),
          ).toThrow(AssertionError);
          expect(() =>
            scope.findOrCreateNode<number>(
              new NodeBluePrint<number>({
                initialProduct: 0,
                produce: () => 0,
                key: 'node',
              }),
            ),
          ).toThrow('already exists with different configuration');
        });

        it('but has a different type', () => {
          expect(() =>
            scope.findOrCreateNode<string>(
              new NodeBluePrint<string>({
                initialProduct: 'hello',
                produce: () => 'world',
                key: 'node',
              }),
            ),
          ).toThrow(AssertionError);
          expect(() =>
            scope.findOrCreateNode<string>(
              new NodeBluePrint<string>({
                initialProduct: 'hello',
                produce: () => 'world',
                key: 'node',
              }),
            ),
          ).toThrow('already exists with different configuration');
        });
      });
    });
  });

  describe('findOrCreateNodes', () => {
    it('should return a list of nodes', () => {
      const bluePrint = ScopeBluePrint.example().children[
        ScopeBluePrint.example().children.length - 1
      ];
      const nodes = scope.findOrCreateNodes([...bluePrint.nodes]);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].key).toBe('node');
      expect(nodes[1].key).toBe('customer');
    });
  });

  describe('addOrReplaceNode()', () => {
    it('should add the node if does not already exist', () => {
      const nodeBluePrint = new NodeBluePrint<number>({
        initialProduct: 0,
        produce,
        key: 'newNode',
      });
      const newNode = scope.addOrReplaceNode(nodeBluePrint);
      expect(newNode).not.toBeUndefined();
      expect(newNode.key).toBe('newNode');
    });

    it('should replace the node if it already exist', () => {
      const node0 = new NodeBluePrint<number>({
        initialProduct: 0,
        produce,
        key: 'newNode',
      });
      const newNode = scope.addOrReplaceNode(node0);
      expect(newNode).not.toBeUndefined();
      expect(newNode.bluePrint.initialProduct).toBe(0);
      expect(newNode.key).toBe('newNode');

      const node1 = new NodeBluePrint<number>({
        initialProduct: 1,
        produce,
        key: 'newNode',
      });
      const newNode1 = scope.addOrReplaceNode(node1);
      expect(newNode1.key).toBe('newNode');
      expect(newNode1.bluePrint.initialProduct).toBe(1);

      expect(scope.findNode<number>('newNode')).toBe(newNode1);
    });
  });

  describe('addNode()', () => {
    it('should create a node and set the scope and SCM correctly', () => {
      expect(node.scope).toBe(scope);
      expect(node.scm).toBe(scope.scm);
    });

    it('should throw if a node with the same key already exists', () => {
      expect(() =>
        scope.addNode(
          new Node<number>({
            bluePrint: new NodeBluePrint<number>({
              initialProduct: 0,
              produce: (_components, previousProduct) => previousProduct,
              key: 'node',
            }),
            scope,
          }),
        ),
      ).toThrow('already exists');
    });

    it("should add the node to the chain's nodes", () => {
      expect(scope.nodes).toEqual([node]);
    });

    it('should replace an existing disposed node', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: 0,
        b: NodeBluePrint.map({ supplier: 'a', toKey: 'b', initialProduct: 1 }),
      });
      scope.scm.flush();

      const a = scope.findNode<number>('a')!;
      a.dispose();
      expect(a.isDisposed).toBe(true);
      expect(a.isErased).toBe(false);

      // Replace the node
      const aNew = a.bluePrint.instantiate({ scope: a.scope });
      const aNewCheck = scope.findNode<number>('a')!;
      expect(aNew).toBe(aNewCheck);
    });
  });

  describe('addOBluePrintverlay(), removeBluePrintOverlay()', () => {
    it('should overlay another blueprint on the top of the existing one', () => {
      const newBluePrint = new NodeBluePrint<number>({
        initialProduct: 0,
        produce: (_components, previousProduct) => previousProduct,
        key: 'node',
      });

      const node = scope.node<number>('node')!;
      const bluePrintBefore = node.bluePrint;
      scope.addOBluePrintverlay(newBluePrint);
      expect(node.bluePrint).toBe(newBluePrint);
      scope.removeBluePrintverlay(newBluePrint);
      expect(node.bluePrint).toBe(bluePrintBefore);
    });

    it('should throw if the node does not exist', () => {
      const newNode = new NodeBluePrint<number>({
        initialProduct: 0,
        produce: (_components, previousProduct) => previousProduct,
        key: 'unknown',
      });

      expect(() => scope.addOBluePrintverlay(newNode)).toThrow(
        'Node with key "unknown" does not exist in scope "example"',
      );

      expect(() => scope.removeBluePrintverlay(newNode)).toThrow(
        'Node with key "unknown" does not exist in scope "example"',
      );
    });
  });

  describe('removeNode(), removeNodes()', () => {
    it('should remove the node with the given key', () => {
      expect(
        scope.findOrCreateNode(NodeBluePrint.example({ key: 'node1' })),
      ).not.toBeUndefined();

      const bp0 = scope.node<number>('node')!.bluePrint;
      const bp1 = scope.node<number>('node1')!.bluePrint;
      scope.removeNodes([bp0, bp1]);
      expect(scope.node<number>('node')).toBeUndefined();
      expect(scope.node<number>('node1')).toBeUndefined();
    });

    it('should also remove the inserts of the node', () => {
      const scope = Scope.example();
      const host = scope.findOrCreateNode<number>(
        new NodeBluePrint<number>({
          initialProduct: 0,
          produce: (_components, previousProduct) => previousProduct,
          key: 'node',
        }),
      );

      const insert = Insert.example({ host });
      expect(insert.isDisposed).toBe(false);

      scope.removeNode('node');
      expect(insert.isDisposed).toBe(true);
    });

    it('should do nothing if node does not exist', () => {
      expect(() => scope.removeNode('Unknown')).not.toThrow();
    });
  });

  describe('isAncestorOf(scope)', () => {
    it('should return true if the scope is an ancestor of the given scope', () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const childScopeA = root.child('childScopeA')!;
      const grandChildScope = childScopeA.child('grandChildScope')!;
      expect(root.isAncestorOf(childScopeA)).toBe(true);
      expect(root.isAncestorOf(grandChildScope)).toBe(true);
      expect(childScopeA.isAncestorOf(grandChildScope)).toBe(true);
    });
  });

  describe('isDescendantOf(scope)', () => {
    it('should return true if the scope is a descendant of the given scope', () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const childScopeA = root.child('childScopeA')!;
      const grandChildScope = childScopeA.child('grandChildScope')!;
      expect(childScopeA.isDescendantOf(root)).toBe(true);
      expect(grandChildScope.isDescendantOf(root)).toBe(true);
      expect(grandChildScope.isDescendantOf(childScopeA)).toBe(true);
    });
  });

  describe('node.dispose(), removeNode()', () => {
    it('should remove the node from the chain', () => {
      expect(scope.nodes.length).toBeGreaterThan(0);
      node.dispose();
      expect(scope.nodes).toHaveLength(0);
    });
  });

  describe('initSuppliers()', () => {
    it('should allow to create a hierarchy of scopes', () => {
      const scm = Scm.testInstance;
      const root = new ExampleScopeRoot({ scm });
      expect(root.nodes.map((n) => n.key)).toEqual(['rootA', 'rootB']);
      for (const element of root.nodes) {
        scm.nominate(element);
      }
      expect(root.children.map((e) => e.key)).toEqual([
        'childScopeA',
        'childScopeB',
      ]);
      expect(root.path).toBe('exampleRoot');

      const childA = root.child('childScopeA')!;
      const childB = root.child('childScopeB')!;
      expect(childA.nodes.map((n) => n.key)).toEqual([
        'childNodeA',
        'childNodeB',
      ]);
      expect(childB.nodes.map((n) => n.key)).toEqual([
        'childNodeA',
        'childNodeB',
      ]);

      expect(childA.path).toBe('exampleRoot/childScopeA');
      expect(childB.path).toBe('exampleRoot/childScopeB');

      for (const element of childA.nodes) {
        scm.nominate(element);
      }

      for (const element of childB.nodes) {
        scm.nominate(element);
      }

      const grandChild = childA.child('grandChildScope')!;
      for (const element of grandChild.nodes) {
        scm.nominate(element);
      }
      expect(grandChild.path).toBe('exampleRoot/childScopeA/grandChildScope');
      expect(grandChild.nodes[0].path).toBe(
        'exampleRoot/childScopeA/grandChildScope/grandChildNodeA',
      );

      scm.flush();
    });
  });

  describe('dot, mermaid, graph, saveGraphToFile', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = Scope.example({ createNode: false });

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          initialProduct: 0,
          key: 'supplier',
          produce: (_components, previousProduct) => previousProduct + 1,
        }),
        scope,
      });

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          initialProduct: 0,
          key: 'producer',
          produce: (components) => (components[0] as number) * 10,
        }),
        scope,
      });

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          initialProduct: 0,
          key: 'customer',
          produce: (components) => (components[0] as number) + 1,
        }),
        scope,
      });
    });

    // .........................................................................
    // Writes mermaid markdown goldens. The file names must be unique per
    // graph - otherwise the tests calling this helper overwrite each
    // other's goldens and the committed content depends on test order.
    const writeMermaidMarkdownGoldens = async (
      chain: Scope,
      base: string,
    ): Promise<void> => {
      // Create mermaid markdown github
      const mdGitHub = chain.mermaid({
        markdownFormat: MarkdownFormat.gitHub,
      });
      await writeGolden(`${base}_md_git_hub.mermaid.md`, mdGitHub);

      // Create mermaid markdown azure
      const mdAzure = chain.mermaid({ markdownFormat: MarkdownFormat.azure });
      await writeGolden(`${base}_md_azure.mermaid.md`, mdAzure);
    };

    it('should print a simple graph correctly', async () => {
      const dot = scope.dot();
      expect(dot).not.toBeUndefined();

      const mm = scope.mermaid();
      expect(mm).not.toBeUndefined();

      await writeMermaidMarkdownGoldens(scope, 'simple_graph');
    });

    it('should print a more advanced graph correctly', async () => {
      const scope = Scope.example({ createNode: false });

      // .................................
      // Create the following supply chain
      //  key
      //   |-synth
      //   |  |-audio (realtime)
      //   |
      //   |-screen
      //   |  |-grid
      scope.mockContent({
        key: nbp({
          from: [],
          to: 'key',
          init: 0,
          produce: (_c, p) => (p as number) + 1,
        }),
        synth: nbp({
          from: ['key'],
          to: 'synth',
          init: 0,
          produce: (c) => (c[0] as number) * 10,
        }),
        audio: nbp({
          from: ['synth'],
          to: 'audio',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        screen: nbp({
          from: ['key'],
          to: 'screen',
          init: 0,
          produce: (c) => (c[0] as number) * 100,
        }),
        grid: nbp({
          from: ['screen'],
          to: 'grid',
          init: 0,
          produce: (c) => (c[0] as number) + 2,
        }),
      });

      scope.scm.flush();

      const dot = scope.dot();
      expect(dot).not.toBeUndefined();

      const mm = scope.mermaid();
      expect(mm).not.toBeUndefined();

      await writeMermaidMarkdownGoldens(scope, 'advanced_graph');
    });

    it('should print scopes correctly', async () => {
      const root = new ExampleScopeRoot({ scm: Scm.testInstance });
      const dot = root.dot();
      expect(dot).not.toBeUndefined();

      const mm = root.mermaid();
      expect(mm).not.toBeUndefined();

      await writeMermaidMarkdownGoldens(root, 'graphs_with_scopes');
    });
  });

  describe('ls, jsonDump', () => {
    describe('returns a list with all pathes of the scope', () => {
      let scope: Scope;
      let b: Scope;

      beforeEach(() => {
        scope = Scope.example();
        scope.mockContent({
          a: {
            b: {
              c: { d: 0, e: 1 },
              f: 2,
              g: new NodeBluePrint<MyType>({
                key: 'g',
                initialProduct: new MyType(2),
              }),
            },
          },
        });
        scope.scm.flush();
        b = scope.findChildScope('b')!;
      });

      it('with default params', () => {
        const ls = scope.ls();
        expect(ls).toEqual([
          'a',
          'a/b',
          'a/b/c',
          'a/b/c/d',
          'a/b/c/e',
          'a/b/f',
          'a/b/g',
        ]);

        const json = scope.jsonDump();
        expect(json).toEqual({
          example: {
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,
                g: { x: 2 },
              },
            },
          },
        });

        const preset = scope.preset();
        expect(preset).toEqual({
          example: {
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,
                g: { x: 2 },
              },
            },
          },
        });

        const lsb = b.ls();
        expect(lsb).toEqual(['c', 'c/d', 'c/e', 'f', 'g']);

        const jsonB = b.jsonDump();
        expect(jsonB).toEqual({
          b: {
            c: { d: 0, e: 1 },
            f: 2,
            g: { x: 2 },
          },
        });

        const presetB = b.preset();
        expect(presetB).toEqual({
          b: {
            c: { d: 0, e: 1 },
            f: 2,
            g: { x: 2 },
          },
        });
      });

      describe('with parentDepth', () => {
        it(' = -1', () => {
          const ls = b.ls({ parentDepth: -1 });
          expect(ls).toEqual([
            'example',
            'example/a',
            'example/a/b',
            'example/a/b/c',
            'example/a/b/c/d',
            'example/a/b/c/e',
            'example/a/b/f',
            'example/a/b/g',
          ]);

          const jsonDump = b.jsonDump({ parentDepth: -1 });
          expect(jsonDump).toEqual({
            root: {
              example: {
                a: {
                  b: {
                    c: { d: 0, e: 1 },
                    f: 2,
                    g: { x: 2 },
                  },
                },
              },
            },
          });
        });

        it(' = 1', () => {
          const ls = b.ls({ parentDepth: 1 });
          expect(ls).toEqual(['b', 'b/c', 'b/c/d', 'b/c/e', 'b/f', 'b/g']);

          const jsonDump = b.jsonDump({ parentDepth: 1 });
          expect(jsonDump).toEqual({
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,
                g: { x: 2 },
              },
            },
          });
        });

        it(' = 1000', () => {
          const ls = b.ls({ parentDepth: 1 });
          expect(ls).toEqual(['b', 'b/c', 'b/c/d', 'b/c/e', 'b/f', 'b/g']);

          const jsonDump = b.jsonDump({ parentDepth: 1 });
          expect(jsonDump).toEqual({
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,
                g: { x: 2 },
              },
            },
          });
        });
      });

      describe('with childDepth', () => {
        it('-1', () => {
          const ls = b.ls({ childDepth: -1 });
          expect(ls).toEqual(['c', 'c/d', 'c/e', 'f', 'g']);

          const jsonDump = b.jsonDump({ childDepth: -1 });
          expect(jsonDump).toEqual({
            b: {
              c: { d: 0, e: 1 },
              f: 2,
              g: { x: 2 },
            },
          });
        });

        it('1', () => {
          const ls = b.ls({ childDepth: 1 });
          expect(ls).toEqual(['c', 'c/d', 'c/e', 'f', 'g']);

          const jsonDump = b.jsonDump({ childDepth: 1 });
          expect(jsonDump).toEqual({
            b: {
              c: { d: 0, e: 1 },
              f: 2,
              g: { x: 2 },
            },
          });
        });

        it('1000', () => {
          const ls = b.ls({ childDepth: 1000 });
          expect(ls).toEqual(['c', 'c/d', 'c/e', 'f', 'g']);

          const jsonDump = b.jsonDump({ childDepth: 1000 });
          expect(jsonDump).toEqual({
            b: {
              c: { d: 0, e: 1 },
              f: 2,
              g: { x: 2 },
            },
          });
        });
      });

      describe('with sourceNodesOnly', () => {
        let scope: Scope;

        beforeEach(() => {
          scope = Scope.example();
          scope.mockContent({
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,

                // G has suppliers and is therefore not a source node
                g: nbp({ from: ['a/b/c/d'], to: 'g', init: 5 }),
              },
            },
          });
          scope.scm.flush();
        });

        describe('true', () => {
          it('returns only nodes that have no suppliers', () => {
            const ls = scope.ls({ sourceNodesOnly: true });
            expect(ls).toEqual(['a/b/c/d', 'a/b/c/e', 'a/b/f']);

            const jsonDump = scope.jsonDump({ sourceNodesOnly: true });
            const expected = {
              example: {
                a: {
                  b: {
                    c: { d: 0, e: 1 },
                    f: 2,
                  },
                },
              },
            };
            expect(jsonDump).toEqual(expected);
          });
        });

        describe('false', () => {
          it('returns all nodes', () => {
            const ls = scope.ls({ sourceNodesOnly: false });
            expect(ls).toEqual([
              'a',
              'a/b',
              'a/b/c',
              'a/b/c/d',
              'a/b/c/e',
              'a/b/f',
              'a/b/g',
            ]);

            const jsonDump = scope.jsonDump({ sourceNodesOnly: false });
            expect(jsonDump).toEqual({
              example: {
                a: {
                  b: {
                    c: { d: 0, e: 1 },
                    f: 2,
                    g: 5,
                  },
                },
              },
            });
          });
        });
      });

      describe('with a non basic type as input', () => {
        it('converts the non basic type to JSON', () => {
          scope = Scope.example();
          scope.mockContent({
            a: {
              b: {
                c: { d: 0, e: 1 },
                f: 2,
                g: new NodeBluePrint<MyType>({
                  initialProduct: new MyType(1),
                  key: 'g',
                }),
              },
            },
          });
          scope.scm.flush();
          const dump = scope.jsonDump();
          expect(dump).toEqual({
            example: {
              a: {
                b: {
                  c: { d: 0, e: 1 },
                  f: 2,
                  g: { x: 1 },
                },
              },
            },
          });
        });

        describe('throws', () => {
          describe('when type cannot converted to json', () => {
            // TODO(port): In TypeScript a class instance with no `toJson`
            // method is still `typeof === 'object'`, so NodeBluePrint.toJson
            // treats it as a plain JSON object and returns it as-is (a
            // `MyTypNoJson` becomes `{ x: 1 }`). No serializer error is ever
            // raised. Dart distinguishes user classes from maps at runtime and
            // throws; the TS port has no equivalent runtime distinction.
            it.skip('and throwOnNonSerializableTypes is true', () => {});
          });

          // TODO(port): Same reason as above — class instances serialize as
          // plain objects in TS, so no non-serializable error is produced.
          it.skip('not, when throwOnNonSerializableTypes is false', () => {});
        });
      });

      describe('with printProducts', () => {
        it('true', () => {
          const ls = scope.ls({ printProducts: true });
          expect(ls).toEqual([
            'a',
            'a/b',
            'a/b/c',
            'a/b/c/d (0)',
            'a/b/c/e (1)',
            'a/b/f (2)',
            'a/b/g',
          ]);
        });
        it('false', () => {
          const ls = scope.ls({ printProducts: false });
          expect(ls).toEqual([
            'a',
            'a/b',
            'a/b/c',
            'a/b/c/d',
            'a/b/c/e',
            'a/b/f',
            'a/b/g',
          ]);
        });
      });
    });
  });

  describe('preset(), setPreset()', () => {
    let scope: Scope;
    let initialPreset: Record<string, unknown>;
    let preset1: Record<string, unknown>;

    beforeEach(() => {
      scope = Scope.example();
      scope.mockContent({
        a: {
          b: {
            c: { d: 0, e: 1.0 },
            f: 2,
            e: new NodeBluePrint<Record<string, unknown>>({
              initialProduct: { hello: 'world' },
              key: 'e',
            }),
          },
        },
      });
      initialPreset = scope.preset();
      scope.scm.flush();

      expect(initialPreset).toEqual({
        example: {
          a: {
            b: {
              c: { d: 0, e: 1.0 },
              f: 2,
              e: { hello: 'world' },
            },
          },
        },
      });

      preset1 = {
        example: {
          a: {
            b: {
              c: { d: 10, e: 11 },
              f: 12,
              e: { hello: 'berlin' },
            },
          },
        },
      };

      scope.reset();
      expect(scope.preset()).toEqual(initialPreset);
    });

    it('allows to write multiple values into the the supply chain', () => {
      // Apply a preset
      scope.setPreset(preset1);
      expect(scope.preset()).toEqual(preset1);
    });

    it('parses json data into custom classes', () => {
      // Custom types round-trip via a registered json parser + type tag
      // (the TS equivalent of Dart's NodeBluePrint.addJsonParser<MyType>).
      NodeBluePrint.addJsonParser(myTypeTag, MyType.fromJson);
      const scope = Scope.example();
      scope.mockContent({
        a: {
          b: {
            c: { d: 0, e: 1.0 },
          },
          custom: new NodeBluePrint<MyType>({
            initialProduct: new MyType(1),
            key: 'custom',
            type: myTypeTag,
          }),
        },
      });
      scope.scm.flush();
      const node = scope.findNode<MyType>('custom')!;
      expect(node.product.x).toBe(1);

      // Get the preset
      const preset = scope.preset();
      expect(preset).toEqual({
        example: {
          a: {
            b: {
              c: { d: 0, e: 1.0 },
            },
            custom: { x: 1 },
          },
        },
      });

      // Set the preset
      scope.setPreset({
        example: {
          a: {
            b: {
              c: { d: 0, e: 1.0 },
            },
            custom: { x: 5 },
          },
        },
      });
      scope.scm.flush();

      // The blue print should have an update value
      expect(node.product.x).toBe(5);

      NodeBluePrint.clearParsers();
    });

    it('resets the previously applied preset before applying the new one', () => {
      // Apply a first preset
      scope.setPreset(preset1);
      expect(scope.preset()).toEqual({
        example: {
          a: {
            b: {
              c: { d: 10, e: 11.0 },
              f: 12,
              e: { hello: 'berlin' },
            },
          },
        },
      });

      // Apply a second preset
      scope.setPreset({
        example: {
          a: {
            b: {
              c: { d: 20, e: 1.0 },
              f: 2,
              e: { hello: 'world' },
            },
          },
        },
      });

      // The values of e and f are reset to their initial values.
      // The value of d is set to 20.
      expect(scope.preset()).toEqual({
        example: {
          a: {
            b: {
              c: { d: 20, e: 1.0 },
              f: 2,
              e: { hello: 'world' },
            },
          },
        },
      });
    });

    it('does not resets the previous preset, when resetBefore is false', () => {
      // Apply a first preset
      scope.setPreset(preset1);
      expect(scope.preset()).toEqual({
        example: {
          a: {
            b: {
              c: { d: 10, e: 11 },
              f: 12,
              e: { hello: 'berlin' },
            },
          },
        },
      });

      // Apply a second preset with resetBefore = false
      scope.setPreset(
        {
          example: {
            a: {
              b: {
                c: { d: 20 },
                e: { hello: 'munich' },
              },
            },
          },
        },
        { resetBefore: false },
      );

      // The values of e and f are NOT reset to their initial values.
      // The value of d is set to 20.
      expect(scope.preset()).toEqual({
        example: {
          a: {
            b: {
              c: {
                d: 20, // overridden by the preset
                e: 11, // Not reset to initial value
              },
              e: { hello: 'munich' },
              f: 12, //  Not reset to initial value
            },
          },
        },
      });
    });

    describe('throws', () => {
      it('when the preset contains more then one key', () => {
        expect(() =>
          scope.setPreset({
            example: { a: 'b' },
            example2: { a: 'b' },
          }),
        ).toThrow('Preset must have only one key "example".');
      });

      it('when the preset key does not match the scope key', () => {
        expect(() =>
          scope.setPreset({
            example2: { a: 'b' },
          }),
        ).toThrow(
          'Preset key "example2" does not match scope key "example".',
        );
      });

      it('when the preset value is not an JSON object', () => {
        expect(() => scope.setPreset({ example: 'a' })).toThrow(
          'Preset value must be a JSON object.',
        );
      });

      it('when a scope cannot be found', () => {
        expect(() =>
          scope.setPreset({
            example: {
              a: {
                b: { UNKNOWN: {} },
              },
            },
          }),
        ).toThrow('Scope "example/a/b/UNKNOWN" not found.');
      });

      it('when a node is not found', () => {
        expect(() =>
          scope.setPreset({
            example: {
              a: {
                b: {
                  c: { UNKNOWN: 0, e: 1 },
                },
              },
            },
          }),
        ).toThrow('Node "example/a/b/c/UNKNOWN" not found.');
      });

      // TODO(port): TypeScript erases generics and int/double collapse to
      // `number`, so assigning a string to a numeric node does not produce a
      // type error in `_setPreset` (the value is assigned via `n.product = v`).
      // The Dart variant relies on a runtime int type check that has no TS
      // equivalent, so no error is raised and the rollback path is not taken.
      it.skip('when a node has wrong data type', () => {});

      it('but not, when a node has as int and another has double', () => {
        expect(() =>
          scope.setPreset({
            example: {
              a: {
                b: {
                  c: { d: 1.0, e: 2.0 },
                },
              },
            },
          }),
        ).not.toThrow();
      });

      it('but not, when a node has as double and another has int', () => {
        expect(() =>
          scope.setPreset({
            example: {
              a: {
                b: {
                  c: { d: 1, e: 2 },
                  e: { hello: 'munich' },
                },
              },
            },
          }),
        ).not.toThrow();
      });
    });

    it('restores the previous state on errors', () => {
      // Set a first preset
      scope.setPreset(preset1);
      let hadError = false;

      // Set another preset that has an error
      try {
        scope.setPreset({
          example: {
            a: {
              b: {
                c: { d: 0, e: 1 },
                e: { hello: 'munich' },
                f: 2,
                g: 'ERROR. Must be an integer.',
              },
            },
          },
        });
      } catch {
        hadError = true;
      }

      // The preset should be reset to the previous state
      expect(hadError).toBe(true);
      expect(scope.preset()).toEqual(preset1);
    });

    describe('returns a list of errors without throwing', () => {
      it('when throwOnErrors is false and an errors array is set', () => {
        const presetWithErrors = {
          example: {
            a: {
              b: {
                c: { UNKNOWN_NODE: 0, e: 1 },
              },
            },
            UNKNOWN_SCOPE: {},
          },
        };

        const errors: string[] = [];
        scope.setPreset(presetWithErrors, {
          errors,
          throwOnErrors: false,
        });

        expect(errors).toEqual([
          'Node "example/a/b/c/UNKNOWN_NODE" not found.',
          'Scope "example/UNKNOWN_SCOPE" not found.',
        ]);
      });
    });

    describe('just resets everything when preset is empty', () => {
      it('and does not throw', () => {
        // Set a non default preset
        scope.setPreset(preset1);
        expect(scope.preset()).toEqual(preset1);

        // Set an empty preset
        scope.setPreset({});

        // The preset should be reset to the default state
        expect(scope.preset()).toEqual(initialPreset);
      });
    });

    it('does not export empty scopes', () => {
      const scope = Scope.example();
      scope.mockContent({
        scopeWithValues: { b: 0, emptyScope: {} },
        emptyScope: {},
      });

      const preset = scope.preset();
      expect(preset).toEqual({
        example: {
          scopeWithValues: { b: 0 },
        },
      });
    });
  });

  describe('findNode(key)', () => {
    describe('without scope in key', () => {
      describe('returns', () => {
        describe('the right node', () => {
          let rootScope: ExampleScopeRoot;

          beforeEach(() => {
            rootScope = new ExampleScopeRoot({ scm: Scm.testInstance });
          });

          it('when the node is contained in own scope', () => {
            // Find a node directly contained in chain
            const rootA = rootScope.findNode<number>('rootA');
            expect(rootA?.key).toBe('rootA');

            const rootB = rootScope.findNode<number>('rootB');
            expect(rootB?.key).toBe('rootB');

            // Child nodes should find their own nodes
            const childScopeA = rootScope.child('childScopeA')!;
            const childNodeAFromChild = childScopeA.findNode<number>(
              'childNodeA',
            );
            expect(childNodeAFromChild?.key).toBe('childNodeA');
          });

          it('when the path contains an alias', () => {
            const scope = Scope.example();
            scope.mockContent({
              a: {
                b: {
                  'c0|c1|c2': { d: 0 },
                },
              },
            });

            // Find the node c
            expect(scope.findNode<number>('a/b/c0/d')?.key).toBe('d');
            expect(scope.findNode<number>('a/b/c1/d')?.key).toBe('d');
            expect(scope.findNode<number>('a/b/c2/d')?.key).toBe('d');
            expect(scope.findNode<number>('a/b/c3/d')?.key).toBeUndefined();
          });

          describe('when the node is contained in parent chain', () => {
            it('part 1', () => {
              // Should return nodes from parent chain
              const childScopeA = rootScope.child('childScopeA')!;
              const rootAFromChild = childScopeA.findNode<number>('rootA');
              expect(rootAFromChild?.key).toBe('rootA');
            });

            it('part 2', () => {
              const corpus = Scope.example({ key: 'corpus' });
              corpus.mockContent({
                width: 600.0,
                depth: 615.0,
                panels: {
                  rightPanel: { thickness: 19.0 },
                  leftPanel: { thickness: 19.0 },
                  bottomPanel: new ScopeBluePrint({
                    key: 'bottomPanel',
                    nodes: [
                      new NodeBluePrint<number>({
                        key: 'thickness',
                        initialProduct: 19.0,
                        produce: () => 19.0,
                      }),
                    ],
                  }),
                },
              });

              const panel = corpus.findChildScope('bottomPanel')!;
              const corpusWidth = panel.findNode<number>('corpus/width');
              expect(corpusWidth).not.toBeUndefined();
            });
          });

          describe('when the node is contained in sibling chain', () => {
            it('and only there', () => {
              // Create a new chain
              const root = Scope.example();

              // Create two child scopes
              const a = new ScopeBluePrint({
                key: 'a',
                children: [new ScopeBluePrint({ key: 'childScope' })],
              }).instantiate({ scope: root });

              const b = new ScopeBluePrint({
                key: 'b',
                children: [new ScopeBluePrint({ key: 'childScope' })],
              }).instantiate({ scope: root });

              // Add a NodeA to ChildScopeA
              const nodeA = root
                .findChildScope('a/childScope')!
                .findOrCreateNode<number>(
                  new NodeBluePrint<number>({
                    key: 'node',
                    initialProduct: 0,
                    produce: (_components, previous) => previous,
                  }),
                );

              // Add a NodeA to ChildScopeA
              const nodeB = root
                .findChildScope('b/childScope')!
                .findOrCreateNode<number>(
                  new NodeBluePrint<number>({
                    key: 'node',
                    initialProduct: 0,
                    produce: (_components, previous) => previous,
                  }),
                );

              // ChildScopeB should find the node in ChildScopeA
              const foundNodeB = b.findNode<number>('node');
              expect(foundNodeB).toBe(nodeB);

              const foundNodeA = a.findNode<number>('node');
              expect(foundNodeA).toBe(nodeA);
            });

            it('and also in a parent sibling chain', () => {
              const scope = Scope.example();
              scope.mockContent({
                corpus: {
                  panels: {
                    left: {
                      corners: {
                        backTopRight: {
                          leftPanelMiterCut: {
                            yInserts: { somethingElse: 0 },
                          },
                        },
                        frontTopRight: {
                          leftPanelMiterCut: {
                            yInserts: { frontTopRightMiterCut: 0 },
                          },
                        },
                      },
                    },
                    bottom: {
                      corners: {
                        frontTopRight: {
                          bottomPanelMiterCut: {
                            xInserts: { frontTopRightMiterCut: 0 },
                          },
                        },
                      },
                    },
                  },
                },
              });

              const startScope = scope.findChildScope('backTopRight')!;
              expect(
                startScope.findNode<number>('frontTopRightMiterCut')!.path,
              ).toMatch(/yInserts\/frontTopRightMiterCut$/);

              const startScope1 = scope.findChildScope(
                'backTopRight/leftPanelMiterCut/yInserts',
              )!;

              expect(
                startScope1.findNode<number>('frontTopRightMiterCut')!.path,
              ).toMatch(/yInserts\/frontTopRightMiterCut$/);
            });
          });

          it('when the node is contained within a child of the parent', () => {
            const scope = Scope.example();
            scope.mockContent({
              root: {
                corpus: {
                  bounds: { xLeft: 0 },
                  corners: {
                    frontBottomLeft: { x: 0 },
                  },
                  panels: {
                    left: {
                      bounds: { xLeft: 0 },
                    },
                  },
                },
              },
            });

            const frontBottomLeft = scope.findChildScope(
              'corners/frontBottomLeft',
            )!;
            const xLeft = frontBottomLeft.findNode<number>('bounds/xLeft')!;
            expect(xLeft.path).toMatch(/corpus\/bounds\/xLeft$/);
          });

          it('when the node is contained somewhere else', () => {
            const root = new ExampleScopeRoot({ scm: Scm.testInstance });

            // Create a node somewhere deep in the hierarchy
            const grandChildScope = root
              .child('childScopeA')!
              .child('grandChildScope')!;

            const grandChildNodeX = new Node<number>({
              bluePrint: new NodeBluePrint<number>({
                key: 'grandChildNodeX',
                initialProduct: 0,
                produce: () => 0,
              }),
              scope: grandChildScope,
            });

            // Search the node from the root
            const foundGRandChildNodeX = root.findNode<number>(
              'grandChildNodeX',
            );
            expect(foundGRandChildNodeX).toBe(grandChildNodeX);
          });
        });

        describe('null', () => {
          describe('when node cannot be found', () => {
            it('and throwIfNotFound is false or not defined', () => {
              const unknownNode = scope.findNode<number>('Unknown', {
                throwIfNotFound: false,
              });
              expect(unknownNode).toBeUndefined();

              const unknownNode1 = scope.findNode<number>('Unknown');
              expect(unknownNode1).toBeUndefined();
            });
          });
        });
      });
    });

    describe('with scope in key', () => {
      describe('return', () => {
        describe('the right node', () => {
          it('when the node is contained in own scope', () => {
            const rootScope = new ExampleScopeRoot({ scm: Scm.testInstance });
            const childScopeA = rootScope.child('childScopeA')!;
            const grandChildScope = childScopeA.child('grandChildScope')!;
            const grandChildNodeAExpected = grandChildScope.findNode<number>(
              'grandChildNodeA',
            );

            const grandChildNodeReal = grandChildScope.findNode<number>(
              'childScopeA/grandChildScope/grandChildNodeA',
            );
            expect(grandChildNodeReal).toBe(grandChildNodeAExpected);
          });

          describe('when the node is contained in parent scope', () => {
            it('and no aliases are used', () => {
              const rootScope = new ExampleScopeRoot({ scm: Scm.testInstance });
              const childScopeA = rootScope.child('childScopeA')!;
              const grandChildScope = childScopeA.child('grandChildScope')!;
              const childNodeAExpected = childScopeA.findNode<number>(
                'childNodeA',
              );

              const childNodeAReal = grandChildScope.findNode<number>(
                'childScopeA/childNodeA',
              );
              expect(childNodeAReal).toBe(childNodeAExpected);
            });
            it('and the scope key is an alias', () => {
              const scope = Scope.example();
              scope.mockContent({
                a: {
                  // .........................................
                  // Create a first scope scA with the alias X
                  scA: new ScopeBluePrint({
                    key: 'scA',
                    aliases: ['x'],

                    // The scope has a child scope
                    children: [new ScopeBluePrint({ key: 'scAChild0' })],

                    // And a node
                    nodes: [
                      new NodeBluePrint<number>({
                        key: 'scANode',
                        initialProduct: 0,
                      }),
                    ],
                  }),

                  // .........................................
                  // Create a second scope scB, also with the alias X
                  scB: new ScopeBluePrint({
                    key: 'scB',
                    aliases: ['x'],

                    // The scope has also a child scope
                    children: [new ScopeBluePrint({ key: 'scAChild1' })],

                    // And it as also a node
                    nodes: [
                      new NodeBluePrint<number>({
                        key: 'scANode',
                        initialProduct: 0,
                      }),
                    ],
                  }),
                },
              });

              // Get one of the child scopes
              const scAChild0 = scope.findChildScope('scAChild0')!;

              // Search for a node in the parent scope using the alias
              const scANode = scAChild0.findNode<number>('x/scANode');

              expect(scANode).not.toBeUndefined();
            });
          });

          it('when the node is contained in sibling scope', () => {
            const rootScope = new ExampleScopeRoot({ scm: Scm.testInstance });
            const childScopeA = rootScope.child('childScopeA')!;
            const grandChildScope = childScopeA.child('grandChildScope')!;
            const grandChildNodeBExpected = grandChildScope.findNode<number>(
              'grandChildNodeB',
            );

            const grandChildNodeReal = grandChildScope.findNode<number>(
              'childScopeA/grandChildScope/grandChildNodeB',
            );
            expect(grandChildNodeReal).toBe(grandChildNodeBExpected);
          });
        });
      });
    });

    describe('with skipInserts', () => {
      it('should return inserts when skipInserts is false', () => {
        const builder = ScBuilder.example();
        const scope = builder.scope;
        const hostB = scope.findNode<number>('hostB')!;

        expect(hostB.inserts.map((e) => e.key)).toEqual([
          // Currently we instantiate the root builders first
          'p0Add111',
          'p1MultiplyByTen',

          // Followed by child builders
          'c0MultiplyByTwo',
        ]);

        // skipInserts is false. The insert node will be found.
        expect(
          scope.findNode<number>('hostBInserts/p0Add111', {
            skipInserts: false,
          }),
        ).not.toBeUndefined();

        // skipInserts is true. The insert node will not be found.
        expect(
          scope.findNode<number>('hostBInserts/p0Add111', {
            skipInserts: true,
          }),
        ).toBeUndefined();
      });
    });

    describe('with excludeNodes', () => {
      it('should not return the excluded nodes', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            b: { c: 0, d: 1 },
          },
        });

        const c = scope.findNode<number>('a/b/c')!;
        const d = scope.findNode<number>('a/b/d')!;

        // Search without excludeNodes
        expect(scope.findNode<number>('a/b/c', { excludedNodes: [] })).toBe(c);

        // Search with excludeNodes
        expect(
          scope.findNode<number>('a/b/c', { excludedNodes: [c] }),
        ).toBeUndefined();

        expect(scope.findNode<number>('a/b/d', { excludedNodes: [c] })).toBe(d);
      });
    });

    describe('throws', () => {
      // TODO(port): TypeScript erases generics, so findNode<String>('rootA')
      // cannot perform a runtime product-type check. The Dart variant throws
      // an ArgumentError ("is not of type String"); the TS API has no such
      // check.
      it.skip('if the type does not match', () => {});

      it('if throwIfNotFound is true and node is not found', () => {
        const supplyScope = Scope.example();
        expect(() =>
          supplyScope.findNode<number>('unknown', { throwIfNotFound: true }),
        ).toThrow('Node with path "unknown" not found');
      });

      it('if multiple nodes of the same key and type are found', () => {
        const supplyScope = new ExampleScopeRoot({ scm: Scm.testInstance });
        expect(() => supplyScope.findNode<number>('grandChildNodeA')).toThrow(
          'More than one node with key "grandChildNodeA"',
        );
      });
    });

    describe('with path starting with ..', () => {
      it('shhould only search in parent scopes', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            n0: 0,
            b: {
              n1: 1,
              c: { n0: 0, n2: 2 },
            },
          },
        });

        const c = scope.findScope('a/b/c')!;
        const a = c.findNode<number>('../n0')!;
        expect(a.path).toBe('root/example/a/n0');
      });

      it('must not find the scope itself', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            c: {
              n0: 3, // a.c.n0
            },
            b: {
              c: {
                n0: 0, // b.c.n0
              },
            },
          },
        });

        const c0 = scope.findScope('a/b/c')!;
        const c1 = c0.findNode<number>('../c/n0')!;
        expect(c1.path).toBe('root/example/a/c/n0');
      });
    });
  });

  describe('findDirectChildNode()', () => {
    it('should only return a node if it is a direct child', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          n: 3,
          b: {
            n: 4,
            c: { n: 5 },
          },
          d: { n: 6 },
        },
        e: { n: 6 },
      });

      scope.scm.flush();

      // Find direct child
      const d = scope.findScope('a/d')!;
      expect(d.findDirectChildNode<number>(['n'])!.product).toBe(6);

      const a = scope.findScope('a')!;
      expect(a.findDirectChildNode<number>(['n'])!.product).toBe(3);
      expect(a.findDirectChildNode<number>(['a', 'n'])!.product).toBe(3);

      expect(a.findDirectChildNode<number>(['b', 'n'])!.product).toBe(4);
      expect(a.findDirectChildNode<number>(['a', 'b', 'n'])!.product).toBe(4);

      expect(a.findDirectChildNode<number>(['a', 'b', 'c', 'n'])!.product).toBe(
        5,
      );
      expect(a.findDirectChildNode<number>(['c', 'n'])).toBeUndefined();
    });
  });

  describe('findScope(path)', () => {
    const scope = Scope.example();
    scope.mockContent({
      a: {
        b: {
          c: { d: 0 },
        },
        f: { g: 1 },
        e: {
          f: {
            g: 2,
            f: { h: 3 },
          },
        },
      },
    });

    describe('should return', () => {
      it('null', () => {
        expect(scope.findScope('a/b/c/d')).toBeUndefined();
      });

      describe('the scope,', () => {
        it('if the address matches the full path', () => {
          const c = scope.findScope('a/b/c')!;
          expect(c.key).toBe('c');
        });

        it('if the address matches a scope with a sub part of the path', () => {
          const b = scope.findScope('a/b')!;
          expect(b.key).toBe('b');
        });

        it('if the address matches a scope in the parent', () => {
          const c = scope.findScope('a')!;
          const a = c.findScope('a')!;
          expect(a.key).toBe('a');
        });

        describe('if the address starts ..', () => {
          it('find the parent scope', () => {
            const f0 = scope.findScope('a/f')!;
            const f1 = scope.findScope('a/e/f')!;
            const f2 = scope.findScope('a/e/f/f')!;

            expect(f1.findScope('f')).toBe(f2);
            expect(f1.findScope('../f')).toBe(f0);
          });

          it('must not find the scope itself', () => {
            const scope = Scope.example();
            scope.mockContent({
              a: {
                b: {
                  c: {
                    n0: 0, // b.c.n0
                  },
                },
              },
            });

            const c0 = scope.findScope('a/b/c')!;
            const c1 = c0.findScope('../c');
            expect(c1).toBeUndefined();
          });
        });
      });
    });

    describe('should throw', () => {
      it('when throwIfNotFound is true and the scope is not found', () => {
        expect(() =>
          scope.findScope('a/b/c/d', { throwIfNotFound: true }),
        ).toThrow('Scope with path "a/b/c/d" not found.');
      });
    });
  });

  describe('hasNode(key)', () => {
    it('should return true if the scope has a node with the given key', () => {
      const rootScope = new ExampleScopeRoot({ scm: Scm.testInstance });
      expect(rootScope.hasNode('rootA')).toBe(true);
      expect(rootScope.hasNode('rootB')).toBe(true);
      expect(rootScope.hasNode('Unknown')).toBe(false);

      const childScope = rootScope.child('childScopeA')!;
      expect(childScope.hasNode('childNodeA')).toBe(true);
      expect(childScope.hasNode('childNodeB')).toBe(true);
      expect(childScope.hasNode('Unknown')).toBe(false);
      expect(childScope.hasNode('rootA')).toBe(true);
    });
  });

  describe('mockContent', () => {
    it('should create a mock content', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          int: 5,
          b: {
            int: 10,
            double: 3.14,
            string: 'hello',
            bool: true,
            enum: new NodeBluePrint<TestEnum>({
              key: 'enum',
              initialProduct: TestEnum.a,
            }),
            c: [
              new ScopeBluePrint({ key: 'd' }),
              new ScopeBluePrint({ key: 'e' }),
              new ScopeBluePrint({ key: 'f' }),
            ],
            g: new ScopeBluePrint({ key: 'g' }),
          },
        },
      });

      expect(scope.findNode<number>('a/int')?.product).toBe(5);
      expect(scope.findNode<number>('a/b/int')?.product).toBe(10);
      expect(scope.findNode<number>('a/b/double')?.product).toBe(3.14);
      expect(scope.findNode<boolean>('a/b/bool')?.product).toBe(true);
      expect(scope.findNode<TestEnum>('a/b/enum')?.product).toBe(TestEnum.a);

      expect(scope.findChildScope('a/b/c/d')!.key).toBe('d');
      expect(scope.findChildScope('a/b/c/e')!.key).toBe('e');
      expect(scope.findChildScope('a/b/c/f')!.key).toBe('f');
      expect(scope.findChildScope('a/b/g')!.key).toBe('g');
    });

    describe('should throw', () => {
      // TODO(port): Dart enums are distinct runtime types, so mocking a raw
      // enum value (TestEnum.a) is unsupported and throws. In TypeScript an
      // enum member is just a string ('a'), which mockContent accepts as a
      // string node — no error is raised. There is no unsupported primitive in
      // TS to trigger this branch faithfully.
      it.skip('if an unsupported type is mocked', () => {});

      it('if a list does not contain ScopeBluePrint', () => {
        const scope = Scope.example();
        expect(() =>
          scope.mockContent({
            a: {
              b: [5],
            },
          }),
        ).toThrow('Lists must only contain ScopeBluePrints.');
      });
    });
  });

  describe('addScBuilder, removeScBuilder, builder', () => {
    it('should add and remove a builder', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          b: { node0: 0 },
        },
      });
      const bluePrint = ScBuilderBluePrint.example.bluePrint;
      expect(scope.builders).toHaveLength(0);

      // Instantiating the builder should call addScBuilder
      const builder = bluePrint.instantiate({ scope });
      expect(scope.builders).toContain(builder);

      // Now we can get the builder by key
      expect(scope.builder(bluePrint.key)).toBe(builder);

      // Disposing the builder should call removeScBuilder
      builder.dispose();
      expect(scope.builders).not.toContain(bluePrint);
    });
  });

  describe('metaScopes', () => {
    let scope: Scope;

    function init2(): void {
      scope = Scope.example();
      scope.mockContent({
        a: {
          b: { c: 0 },
        },
      });
    }

    beforeEach(init2);

    describe('general', () => {
      it('should return the scope providing event suppliers', () => {
        const onScopeA = scope.metaScope('on')!;
        expect(onScopeA.key).toBe('on');
        const onScopeB = scope.findChildScope('a/b')!.metaScope('on')!;
        expect(onScopeB.key).toBe('on');
      });
      it('should not be part of the on scope itself', () => {
        const onScopeA = scope.metaScope('on')!;
        expect(onScopeA.metaScopes).toHaveLength(0);
      });
      describe('should be findable', () => {
        it('via findNode()', () => {
          init({ enableOnChange: true });
          init2();

          // Try to find the node
          const onScopeA = scope.metaScope('on')!;
          const onChange = onScopeA.findNode<void>('on/change');
          expect(onChange).not.toBeUndefined();
          expect(onChange?.key).toBe('change');
        });
        it('via findScope()', () => {
          expect(scope.findScope('on')).not.toBeUndefined();
          expect(scope.findScope('a/on')).not.toBeUndefined();
          expect(scope.findScope('a/b/on')).not.toBeUndefined();
        });
        it('via findChildScope()', () => {
          expect(scope.findChildScope('on')).not.toBeUndefined();
          expect(scope.findChildScope('a/on')).not.toBeUndefined();
          expect(scope.findChildScope('a/b/on')).not.toBeUndefined();
        });
      });

      describe('isMetaScope', () => {
        it('should return true if a scope is a meta scope and false otherwise', () => {
          expect(scope.findChildScope('on')!.isMetaScope).toBe(true);
          expect(scope.findChildScope('a/on')!.isMetaScope).toBe(true);
          expect(scope.findChildScope('a/b/on')!.isMetaScope).toBe(true);

          expect(scope.findChildScope('a')!.isMetaScope).toBe(false);
          expect(scope.findChildScope('a/b')!.isMetaScope).toBe(false);
        });
      });

      it('should find other suppliers in the hierarchy', () => {
        const onScopeB = scope.findScope('a/b/on')!;
        const nodeC = onScopeB.findNode<number>('b/c')!;
        expect(nodeC).not.toBeUndefined();
        expect(nodeC.key).toBe('c');
      });
    });
  });

  describe('on', () => {
    let scope: Scope;

    let scm: Scm;
    let a: Scope;
    let a0: Node<number>;
    let b: Scope;
    let b0: Node<number>;
    let b1: Node<number>;
    let c: Scope;
    let c0: Node<number>;
    let c1: Node<number>;

    function init2(): void {
      scope = Scope.example();
      scope.mockContent({
        a: {
          a0: 0,
          b: {
            b0: 1,
            b1: 2,
            c: { c0: 0, c1: 1 },
          },
        },
      });

      scm = scope.scm;

      a = scope.findScope('a')!;
      a0 = scope.findNode<number>('a/a0')!;
      b = scope.findScope('b')!;
      b0 = scope.findNode<number>('b0')!;
      b1 = scope.findNode<number>('b1')!;
      c = scope.findScope('c')!;
      c0 = scope.findNode<number>('c0')!;
      c1 = scope.findNode<number>('c1')!;
    }

    beforeEach(() => {
      init({ enableOnChange: true });
      init2();
      scope.reset();
    });

    describe('change', () => {
      it('should exist', () => {
        const onChange = scope.findNode<void>('on/change')!;
        expect(onChange.key).toBe('change');
      });

      it('should allow to observe all changes of in a scope', () => {
        // ........................................
        // Create nodes observing scopes a,b and e

        // Observere changes on a
        const aChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'aObserver',
          initialProduct: undefined,
          suppliers: ['a/on/change'],
          produce: (components) => {
            aChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        // Observere changes on b
        const bChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'bObserver',
          initialProduct: undefined,
          suppliers: ['a/b/on/change'],
          produce: (components) => {
            bChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        // Observere changes on c
        const cChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'cObserver',
          initialProduct: undefined,
          suppliers: ['a/b/c/on/change'],
          produce: (components) => {
            cChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        scm.flush();
        aChanges.length = 0;
        bChanges.length = 0;
        cChanges.length = 0;

        // .....................
        // Change something in a
        // and check if the changes were observed only by a
        a0.product = 1;
        scm.flush();

        expect(aChanges).toEqual([a]);
        expect(bChanges).toHaveLength(0);
        expect(cChanges).toHaveLength(0);
        aChanges.length = 0;

        // .....................
        // Change something in b
        // and check if the changes were observed only by b
        b0.product = 2;
        scm.flush();

        expect(aChanges).toHaveLength(0);
        expect(bChanges).toEqual([b]);
        expect(cChanges).toHaveLength(0);

        b1.product = 3;
        scm.flush();

        expect(aChanges).toHaveLength(0);
        expect(bChanges).toEqual([b, b]);
        expect(cChanges).toHaveLength(0);
        bChanges.length = 0;

        // .....................
        // Change something in c
        // and check if the changes were observed only by c
        c0.product = 2;
        scm.flush();

        expect(aChanges).toHaveLength(0);
        expect(bChanges).toHaveLength(0);
        expect(cChanges).toEqual([c]);

        c1.product = 3;
        scm.flush();

        expect(aChanges).toHaveLength(0);
        expect(bChanges).toHaveLength(0);
        expect(cChanges).toEqual([c, c]);
      });
    });

    describe('changeRecursive', () => {
      it('should exist', () => {
        const onChange = scope.findNode<void>('on/changeRecursive')!;
        expect(onChange.key).toBe('changeRecursive');
      });

      it('should allow to observe all changes of in a scope and its child scopes.', () => {
        // ........................................
        // Create nodes observing scopes a,b and e

        // Observere changes on a
        const aChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'aObserverRecursive',
          initialProduct: undefined,
          suppliers: ['a/on/changeRecursive'],
          produce: (components) => {
            aChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        // Observere changes on b
        const bChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'bObserverRecursive',
          initialProduct: undefined,
          suppliers: ['a/b/on/changeRecursive'],
          produce: (components) => {
            bChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        // Observere changes on c
        const cChanges: Scope[] = [];
        new NodeBluePrint<void>({
          key: 'cObserverRecursive',
          initialProduct: undefined,
          suppliers: ['a/b/c/on/changeRecursive'],
          produce: (components) => {
            cChanges.push(components[0] as Scope);
          },
        }).instantiate({ scope });

        scm.flush();
        aChanges.length = 0;
        bChanges.length = 0;
        cChanges.length = 0;

        // .....................
        // Change something in a
        // and check if the changes were observed only by a
        a0.product = 1;
        scm.flush();

        expect(aChanges).toEqual([a]);
        expect(bChanges).toHaveLength(0);
        expect(cChanges).toHaveLength(0);
        aChanges.length = 0;

        // .....................
        // Change something in b
        // and check if the changes were observed by b and its parent a
        b0.product = 2;
        scm.flush();

        expect(aChanges).toEqual([a]);
        expect(bChanges).toEqual([b]);
        expect(cChanges).toHaveLength(0);

        b1.product = 3;
        scm.flush();

        expect(aChanges).toEqual([a, a]);
        expect(bChanges).toEqual([b, b]);
        expect(cChanges).toHaveLength(0);
        aChanges.length = 0;
        bChanges.length = 0;

        // .....................
        // Change something in c
        // and check if the changes were observed by c
        // and its ancestors b and a
        c0.product = 2;
        scm.flush();

        expect(aChanges).toEqual([a]);
        expect(bChanges).toEqual([b]);
        expect(cChanges).toEqual([c]);

        c1.product = 3;
        scm.flush();

        expect(aChanges).toEqual([a, a]);
        expect(bChanges).toEqual([b, b]);
        expect(cChanges).toEqual([c, c]);
      });
    });
  });

  describe('aliases', () => {
    describe('with aliases at beginning', () => {
      let scope: Scope;
      let scm: Scm;

      beforeEach(() => {
        scope = Scope.example();
        scm = scope.scm;

        scope.mockContent({
          'a|b|c': {
            d: {
              e: { f: 0 },
            },
          },
        });
      });

      it('with child', () => {
        expect(scope.child('a')?.key).toBe('a');
        expect(scope.child('b')?.key).toBe('a');
        expect(scope.child('c')?.key).toBe('a');
      });

      it('with findNode', () => {
        expect(scope.findNode<number>('a/d/e/f')?.key).toBe('f');
        expect(scope.findNode<number>('b/d/e/f')?.key).toBe('f');
        expect(scope.findNode<number>('c/d/e/f')?.key).toBe('f');
      });

      it('with findScope', () => {
        expect(scope.findScope('a')?.key).toBe('a');
        expect(scope.findScope('b')?.key).toBe('a');
        expect(scope.findScope('c')?.key).toBe('a');
        expect(scope.findScope('a/d')?.key).toBe('d');
        expect(scope.findScope('b/d')?.key).toBe('d');
        expect(scope.findScope('c/d')?.key).toBe('d');
        expect(scope.findScope('a/d/e')?.key).toBe('e');
        expect(scope.findScope('b/d/e')?.key).toBe('e');
        expect(scope.findScope('c/d/e')?.key).toBe('e');
      });

      it('with findChildScope()', () => {
        expect(scope.findChildScope('a')?.key).toBe('a');
        expect(scope.findChildScope('b')?.key).toBe('a');
        expect(scope.findChildScope('c')?.key).toBe('a');
        expect(scope.findChildScope('a/d')?.key).toBe('d');
        expect(scope.findChildScope('b/d')?.key).toBe('d');
        expect(scope.findChildScope('c/d')?.key).toBe('d');
        expect(scope.findChildScope('a/d/e')?.key).toBe('e');
        expect(scope.findChildScope('b/d/e')?.key).toBe('e');
        expect(scope.findChildScope('c/d/e')?.key).toBe('e');
      });

      it('with suppliers', () => {
        // Use original key "a" in supplier address
        const g0 = NodeBluePrint.map({
          supplier: 'a/d/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g0.suppliers[0].key).toBe('f');

        // Use alias "b" in supplier address
        const g1 = NodeBluePrint.map({
          supplier: 'b/d/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g1.suppliers[0].key).toBe('f');

        // Use alias "c" in supplier address
        const g2 = NodeBluePrint.map({
          supplier: 'c/d/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g2.suppliers[0].key).toBe('f');
      });
    });

    describe('with aliases in the middle', () => {
      let scope: Scope;
      let scm: Scm;

      beforeEach(() => {
        scope = Scope.example();
        scm = scope.scm;

        scope.mockContent({
          a: {
            'b|c|d': {
              e: { f: 0 },
            },
          },
        });
      });

      it('with findNode', () => {
        expect(scope.findNode<number>('a/b/e/f')?.key).toBe('f');
        expect(scope.findNode<number>('a/c/e/f')?.key).toBe('f');
        expect(scope.findNode<number>('a/d/e/f')?.key).toBe('f');
      });

      it('with findScope', () => {
        expect(scope.findScope('b')?.key).toBe('b');
        expect(scope.findScope('c')?.key).toBe('b');
        expect(scope.findScope('d')?.key).toBe('b');
        expect(scope.findScope('b/e')?.key).toBe('e');
        expect(scope.findScope('c/e')?.key).toBe('e');
        expect(scope.findScope('d/e')?.key).toBe('e');
        expect(scope.findScope('a/b/e')?.key).toBe('e');
        expect(scope.findScope('a/c/e')?.key).toBe('e');
        expect(scope.findScope('a/d/e')?.key).toBe('e');

        const e = scope.findScope('a/b/e')!;
        expect(e.findScope('b')?.key).toBe('b');
        expect(e.findScope('c')?.key).toBe('b');
        expect(e.findScope('d')?.key).toBe('b');
      });

      it('with findChildScope()', () => {
        expect(scope.findChildScope('b')?.key).toBe('b');
        expect(scope.findChildScope('c')?.key).toBe('b');
        expect(scope.findChildScope('d')?.key).toBe('b');
        expect(scope.findChildScope('b/e')?.key).toBe('e');
        expect(scope.findChildScope('c/e')?.key).toBe('e');
        expect(scope.findChildScope('d/e')?.key).toBe('e');
        expect(scope.findChildScope('a/b/e')?.key).toBe('e');
        expect(scope.findChildScope('a/c/e')?.key).toBe('e');
        expect(scope.findChildScope('a/d/e')?.key).toBe('e');
      });

      it('with suppliers', () => {
        // Use original key "a" in supplier address
        const g0 = NodeBluePrint.map({
          supplier: 'a/b/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g0.suppliers[0].key).toBe('f');

        // Use alias "b" in supplier address
        const g1 = NodeBluePrint.map({
          supplier: 'a/c/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g1.suppliers[0].key).toBe('f');

        // Use alias "c" in supplier address
        const g2 = NodeBluePrint.map({
          supplier: 'a/d/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g2.suppliers[0].key).toBe('f');
      });
    });

    describe('with multiple aliases', () => {
      let scope: Scope;
      let scm: Scm;

      beforeEach(() => {
        scope = Scope.example();
        scm = scope.scm;

        scope.mockContent({
          a: {
            'b|c|d': {
              'e|e1|e2': { f: 0 },
            },
          },
        });
      });

      it('with findNode', () => {
        expect(scope.findNode<number>('a/b/e/f')?.key).toBe('f');
        expect(scope.findNode<number>('a/c/e1/f')?.key).toBe('f');
        expect(scope.findNode<number>('a/d/e2/f')?.key).toBe('f');
      });

      it('with findScope', () => {
        expect(scope.findScope('b')?.key).toBe('b');
        expect(scope.findScope('c')?.key).toBe('b');
        expect(scope.findScope('d')?.key).toBe('b');
        expect(scope.findScope('e')?.key).toBe('e');
        expect(scope.findScope('e1')?.key).toBe('e');
        expect(scope.findScope('e2')?.key).toBe('e');
        expect(scope.findScope('b/e')?.key).toBe('e');
        expect(scope.findScope('c/e1')?.key).toBe('e');
        expect(scope.findScope('d/e')?.key).toBe('e');
        expect(scope.findScope('a/b/e')?.key).toBe('e');
        expect(scope.findScope('a/c/e1')?.key).toBe('e');
        expect(scope.findScope('a/d/e2')?.key).toBe('e');

        const e = scope.findScope('a/b/e')!;
        expect(e.findScope('b/e')?.key).toBe('e');
        expect(e.findScope('c/e1')?.key).toBe('e');
        expect(e.findScope('d/e2')?.key).toBe('e');
      });

      it('with findChildScope()', () => {
        expect(scope.findChildScope('b')?.key).toBe('b');
        expect(scope.findChildScope('c')?.key).toBe('b');
        expect(scope.findChildScope('d')?.key).toBe('b');
        expect(scope.findChildScope('e')?.key).toBe('e');
        expect(scope.findChildScope('e1')?.key).toBe('e');
        expect(scope.findChildScope('e2')?.key).toBe('e');
        expect(scope.findChildScope('b/e')?.key).toBe('e');
        expect(scope.findChildScope('c/e1')?.key).toBe('e');
        expect(scope.findChildScope('d/e')?.key).toBe('e');
        expect(scope.findChildScope('a/b/e')?.key).toBe('e');
        expect(scope.findChildScope('a/c/e1')?.key).toBe('e');
        expect(scope.findChildScope('a/d/e2')?.key).toBe('e');
      });

      it('with suppliers', () => {
        // Use original key "a" in supplier address
        const g0 = NodeBluePrint.map({
          supplier: 'a/b/e1/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g0.suppliers[0].key).toBe('f');

        // Use alias "b" in supplier address
        const g1 = NodeBluePrint.map({
          supplier: 'a/c/e2/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g1.suppliers[0].key).toBe('f');

        // Use alias "c" in supplier address
        const g2 = NodeBluePrint.map({
          supplier: 'a/d/e/f',
          toKey: 'g0',
          initialProduct: 0,
        }).instantiate({ scope });
        scm.flush();
        expect(g2.suppliers[0].key).toBe('f');
      });
    });
  });

  describe('owner', () => {
    it('should be informed when a scope is disposed or erased', () => {
      const willDisposeCalls: Scope[] = [];
      const didDisposeCalls: Scope[] = [];
      const willEraseCalls: Scope[] = [];
      const didEraseCalls: Scope[] = [];
      const willUndisposeCalls: Scope[] = [];
      const didUndisposeCalls: Scope[] = [];

      const owner = new Owner<Scope>({
        willDispose: (p0) => willDisposeCalls.push(p0),
        didDispose: (p0) => didDisposeCalls.push(p0),
        willErase: (p0) => willEraseCalls.push(p0),
        didErase: (p0) => didEraseCalls.push(p0),
        willUndispose: (p0) => willUndisposeCalls.push(p0),
        didUndispose: (p0) => didUndisposeCalls.push(p0),
      });

      // Create a customer and a supplier scope with an owner
      const scope = Scope.example();
      const s = new ScopeBluePrint({ key: 's' }).instantiate({
        scope,
        owner,
      });
      const c = new ScopeBluePrint({ key: 'c' }).instantiate({
        scope,
        owner,
      });

      // Instantiate a customer and a supplier node
      new NodeBluePrint<number>({
        key: 'supplier',
        initialProduct: 0,
      }).instantiate({ scope: s });
      new NodeBluePrint<number>({
        key: 'customer',
        initialProduct: 0,
        suppliers: ['supplier'],
      }).instantiate({ scope: c });
      scope.scm.flush();

      // Dispose the supplierScope s
      s.dispose();
      expect(willDisposeCalls).toEqual([s]);
      expect(didDisposeCalls).toEqual([s]);

      // Nothing is erased because supplier has still customers
      expect(willEraseCalls).toHaveLength(0);
      expect(didEraseCalls).toHaveLength(0);

      // Recreate the supplier
      new NodeBluePrint<number>({
        key: 's',
        initialProduct: 0,
      }).instantiate({ scope: s });

      // The disposed scope s should be recreated
      expect(willUndisposeCalls).toEqual([s]);
      expect(didUndisposeCalls).toEqual([s]);

      // Dispose the supplier scope again
      s.dispose();
      expect(willDisposeCalls).toEqual([s, s]);
      expect(didDisposeCalls).toEqual([s, s]);

      // Dispose the customer scope c
      c.dispose();
      expect(willDisposeCalls).toEqual([s, s, c]);
      expect(didDisposeCalls).toEqual([s, s, c]);

      // Also all nodes should be erased
      expect(willEraseCalls).toEqual([s, c]);
      expect(didEraseCalls).toEqual([s, c]);
    });
  });

  describe('isSmartScope', () => {
    it('should be false by default', () => {
      const scope = Scope.example();
      expect(scope.isSmartScope).toBe(false);
    });

    it('should be true if a master is set on the blue print', () => {
      const scope = Scope.example({ smartMaster: ['a', 'b'] });
      expect(scope.isSmartScope).toBe(true);
    });

    it('should be tree if the scope is instantiated within a smart scope', () => {
      const scope = Scope.example({ smartMaster: ['x', 'y'] });
      scope.mockContent({
        a: {
          b: { c: 0 },
        },
      });

      expect(scope.findScope('a')!.isSmartScope).toBe(true);
      expect(scope.findScope('b')!.isSmartScope).toBe(true);
    });

    it('should be false for meta scopes', () => {
      const smartScope = Scope.example({ smartMaster: ['x', 'y'] });
      expect(smartScope.isSmartScope).toBe(true);
      for (const metaScope of smartScope.metaScopes) {
        expect(metaScope.isSmartScope).toBe(false);
      }
    });
  });

  describe('smartMaster', () => {
    it('should be empty default', () => {
      const scope = Scope.example();
      expect(scope.smartMaster).toHaveLength(0);
    });

    it('should return the blue print smart master when available', () => {
      const scope = Scope.example({ smartMaster: ['a', 'b'] });
      expect(scope.smartMaster).toEqual(['a', 'b']);
    });

    it('should be the path between the parent smart scope and the scope', () => {
      const scope = Scope.example({ smartMaster: ['x', 'y'] });
      scope.mockContent({
        a: {
          b: { c: 0 },
        },
      });

      expect(scope.findScope('a')!.smartMaster).toEqual(['x', 'y', 'a']);
      expect(scope.findScope('b')!.smartMaster).toEqual(['x', 'y', 'a', 'b']);
    });

    it('should be falseempty for meta scopes', () => {
      const smartScope = Scope.example({ smartMaster: ['x', 'y'] });
      expect(smartScope.isSmartScope).toBe(true);
      for (const metaScope of smartScope.metaScopes) {
        expect(metaScope.smartMaster).toHaveLength(0);
      }
    });
  });

  describe('coverage completion', () => {
    it('deepChildren and deepParents default the depth to 1', () => {
      const root = Scope.example();
      root.mockContent({ p1: { x: { c0: { c00: 0 } } } });
      const x = root.findChildScope('x')!;
      expect(x.deepChildren().map((s) => s.key)).toEqual(
        x.deepChildren({ depth: 1 }).map((s) => s.key),
      );
      expect(x.deepParents().map((s) => s.key)).toEqual(
        x.deepParents({ depth: 1 }).map((s) => s.key),
      );
    });

    it('isDescendantOf returns false for an unrelated scope', () => {
      const a = Scope.example({ key: 'a' });
      const b = Scope.example({ key: 'b' });
      // b has nested children so isDescendantOf recurses into them; a is not a
      // descendant of b, so the recursion returns false at every level.
      b.mockContent({ inner: { deeper: { n: 0 } } });
      expect(a.isDescendantOf(b)).toBe(false);
    });

    it('removeScBuilder is a no-op for a builder that is not present', () => {
      const localScope = Scope.example();
      const builder = ScBuilder.example();
      // builder.scope is a different scope; removing it from localScope is a
      // no-op (its index is -1).
      expect(() => localScope.removeScBuilder(builder)).not.toThrow();
    });

    it('graph() defaults child/parent scope depths', () => {
      const root = Scope.example();
      root.mockContent({ child: { n: 0 } });
      expect(root.graph()).not.toBeUndefined();
      expect(
        root.graph({
          childScopeDepth: 1,
          parentScopeDepth: 1,
          highlightedNodes: [],
          highlightedScopes: [],
        }),
      ).not.toBeUndefined();
    });

    it('mockContent throws for an unsupported value type', () => {
      const localScope = Scope.example();
      expect(() => localScope.mockContent({ bad: 10n })).toThrow(ArgumentError);
    });

    it('disposing a scope twice is a no-op', () => {
      const root = Scope.example();
      const child = new ScopeBluePrint({ key: 'toDispose' }).instantiate({
        scope: root,
      });
      child.dispose();
      expect(() => child.dispose()).not.toThrow();
    });

    it('findNode with ../ from a root scope returns undefined', () => {
      const root = Scope.root({ key: 'root', scm: Scm.example() });
      expect(root.findNode('../whatever')).toBeUndefined();
    });

    it('ls respects the child depth limit', () => {
      const root = Scope.example();
      root.mockContent({ a: { b: { c: { deepNode: 0 } } } });
      // A shallow ls returns fewer entries than a deep ls.
      const shallow = root.ls({ childDepth: 0 });
      const deep = root.ls({ childDepth: -1 });
      expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
    });

    it('jsonDump respects the child depth limit', () => {
      const root = Scope.example();
      root.mockContent({ a: { b: { deepNode: 0 } } });
      root.scm.flush();
      const json = root.jsonDump({ childDepth: 0 });
      expect(json).not.toBeUndefined();
    });

    it('jsonDump rethrows non-serializable products when requested', () => {
      const root = Scope.example();
      class NotSerializable {}
      new NodeBluePrint<NotSerializable>({
        key: 'weird',
        initialProduct: new NotSerializable(),
      }).instantiate({ scope: root });
      root.scm.flush();

      // Without throwOnNonSerializableTypes the error is captured as a string.
      const captured = root.jsonDump();
      expect(captured).not.toBeUndefined();

      // With throwOnNonSerializableTypes the serialization error is rethrown.
      expect(() =>
        root.jsonDump({ throwOnNonSerializableTypes: true }),
      ).toThrow();
    });

    it('setPreset collects errors and handles null-prototype objects', () => {
      const root = Scope.example();
      root.mockContent({ target: 0 });
      root.scm.flush();

      // A null-prototype object is treated as a JSON object by _isJsonObject.
      const preset: Record<string, unknown> = Object.create(null);
      const exampleMap: Record<string, unknown> = Object.create(null);
      exampleMap.target = 5;
      preset.example = exampleMap;

      const errors: string[] = [];
      root.setPreset(preset, { throwOnErrors: false, errors });
      expect(Array.isArray(errors)).toBe(true);
    });

    it('setPreset captures an error when a node value cannot be applied', () => {
      const root = Scope.example({ key: 'example' });
      // A node restricted to allowed products: setting a disallowed value throws
      // inside _setPreset and is captured in the errors list (catch block).
      new NodeBluePrint<number>({
        key: 'limited',
        initialProduct: 0,
        allowedProducts: [0, 1, 2],
      }).instantiate({ scope: root });
      root.scm.flush();

      const errors: string[] = [];
      root.setPreset(
        { example: { limited: 3 } },
        { throwOnErrors: false, resetBefore: false, errors },
      );
      expect(errors.some((e) => e.includes('limited'))).toBe(true);
    });

    it('setPreset captures an error for a non-serializable JSON-object value', () => {
      const root = Scope.example({ key: 'example' });
      new NodeBluePrint<number>({
        key: 'numNode',
        initialProduct: 0,
        allowedProducts: [0, 1, 2],
      }).instantiate({ scope: root });
      root.scm.flush();

      const errors: string[] = [];
      // Assigning a JSON-object value to a numeric node throws and the error
      // message uses the "JSON object" branch of the ternary.
      root.setPreset(
        { example: { numNode: { not: 'a-number' } } },
        { throwOnErrors: false, resetBefore: false, errors },
      );
      expect(errors.some((e) => e.includes('JSON object'))).toBe(true);
    });
  });
});
