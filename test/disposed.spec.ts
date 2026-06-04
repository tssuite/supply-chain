// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it } from 'vitest';

// NOTE: `Scm` must be imported (evaluated) before `Disposed`. `disposed.ts`
// imports `scm.ts`, and `Scm`'s static initializer (`Scm.testInstance`) calls
// `new Disposed(...)`. Importing the barrel `../src/index.ts` evaluates
// `disposed.ts` before `scm.ts` and crashes with "Disposed is not a
// constructor". See the final report's src/ issue note on index.ts ordering.
// NOTE: `Scm` must be imported (evaluated) before `Disposed`. `disposed.ts`
// imports `scm.ts`, and `Scm`'s static initializer (`Scm.testInstance`) calls
// `new Disposed(...)`. Importing the barrel `../src/index.ts` first evaluates
// `disposed.ts` before `scm.ts` and crashes with "Disposed is not a
// constructor". Importing `scm.ts` here first fixes the evaluation order; the
// remaining symbols then come from the barrel (which resolves the sc-builder
// cycle). See the final report's src/ issue note on index.ts ordering.
import { Scm } from '../src/scm.ts';
import {
  Disposed,
  Node,
  NodeBluePrint,
  ScBuilderBluePrint,
  Scope,
  ScopeBluePrint,
} from '../src/index.ts';

describe('Disposed', () => {
  let disposed: Disposed;
  let scm: Scm;
  let scope: Scope;

  let sSingle: Scope;
  let sA: Scope;
  let sB: Scope;

  let s0: Scope;
  let s1: Scope;
  let s2: Scope;

  let i0: Scope;
  let i1: Scope;
  let i2: Scope;

  let c0: Scope;
  let c1: Scope;
  let c2: Scope;

  let supplier: Node<number>;
  let intermediate: Node<number>;
  let customer: Node<number>;

  let single: Node<number>;
  let a: Node<number>;
  let b: Node<number>;

  beforeEach(() => {
    disposed = Disposed.example;
    scm = disposed.scm;
    scope = Scope.example({ scm });
    scope.mockContent({
      // .........................
      // Single node
      sSingle: { single: 0 },

      // .........................
      // Single connection a -> b
      sA: { a: 0 },
      sB: {
        b: NodeBluePrint.map({
          supplier: 'sA/a',
          toKey: 'b',
          initialProduct: 0,
        }),
      },

      // ...............................................
      // connection supplier -> intermediate -> customer
      // Create a supplier node
      s0: {
        s1: {
          s2: { supplier: 0 },
        },
      },

      // Create a intermeidate node with a supplier
      // forwarding its product to the customer node.
      i0: {
        i1: {
          i2: {
            intermediate: NodeBluePrint.map({
              supplier: 's0/s1/s2/supplier',
              toKey: 'intermediate',
              initialProduct: 0,
            }),
          },
        },
      },

      // Create a customer node that receives the product from the
      // intermediate node.
      c0: {
        c1: {
          c2: {
            customer: NodeBluePrint.map({
              supplier: 'i0/i1/i2/intermediate',
              toKey: 'customer',
              initialProduct: 0,
            }),
          },
        },
      },
    });

    scm.flush();
    s0 = scope.findScope('s0')!;
    s1 = scope.findScope('s1')!;
    s2 = scope.findScope('s2')!;
    sA = scope.findScope('sA')!;
    sSingle = scope.findScope('sSingle')!;

    i0 = scope.findScope('i0')!;
    i1 = scope.findScope('i1')!;
    i2 = scope.findScope('i2')!;
    sB = scope.findScope('sB')!;

    c0 = scope.findScope('c0')!;
    c1 = scope.findScope('c1')!;
    c2 = scope.findScope('c2')!;

    single = scope.findNode<number>('single')!;
    a = scope.findNode<number>('sA/a')!;
    b = scope.findNode<number>('sB/b')!;

    supplier = s2.findNode<number>('supplier')!;
    intermediate = i2.findNode<number>('intermediate')!;
    customer = c2.findNode<number>('customer')!;

    expect(supplier.suppliers).toHaveLength(0);
    expect(supplier.customers.length).toBeGreaterThan(0);
    expect(intermediate.suppliers.length).toBeGreaterThan(0);
    expect(intermediate.customers.length).toBeGreaterThan(0);
    expect(customer.customers).toHaveLength(0);
    expect(customer.suppliers.length).toBeGreaterThan(0);

    // Silence unused-variable warnings for scopes only referenced for setup.
    void s0;
    void s1;
    void sSingle;
    void i0;
    void i1;
    void i2;
    void c0;
    void c1;
  });

  describe('scm', () => {
    it('should return related supply chain manager', () => {
      expect(disposed.scm).toBeInstanceOf(Scm);
    });
  });

  describe('scopes', () => {
    it('should return the disposed scopes', () => {
      expect(Array.isArray(disposed.scopes)).toBe(true);
      expect(disposed.scopes).toHaveLength(0);
    });
  });

  describe('nodes', () => {
    it('should return the disposed nodes', () => {
      expect(Array.isArray(disposed.nodes)).toBe(true);
      expect(disposed.nodes).toHaveLength(0);
    });
  });

  describe('addNode', () => {
    it('should be called when a node is disposed', () => {
      // Dispose the supplier node
      // It should be added to disposed.nodes
      supplier.dispose();
      expect(supplier.isDisposed).toBe(true);
      expect(supplier.isErased).toBe(false);
      expect(disposed.nodes).toEqual([supplier]);
    });
  });

  describe('removeNode', () => {
    it('should be called when a node is erased', () => {
      // Dispose the supplier node
      // It should be added to disposed.nodes
      supplier.dispose();
      expect(disposed.nodes).toEqual([supplier]);

      // Dispose intermediate and customer
      // supplier will be erased too and removed from disposed nodes
      intermediate.dispose();
      customer.dispose();

      // supplier should be removed from disposed.nodes
      expect(disposed.nodes).toHaveLength(0);
    });
  });

  describe('addScope', () => {
    it('should be called when a scope is disposed', () => {
      // Dispose the supplier scope.
      // The scope will not be erased because
      // supplier has still customers
      s2.dispose();

      // The scope should be added to disposed.scopes
      expect(disposed.scopes).toEqual([s2]);
    });
  });

  describe('removeScope', () => {
    it('should be called when a scope is erased', () => {
      // Dispose the supplier scope.
      // The scope will not be erased because
      // supplier has still customers
      s2.dispose();

      // The scope should be added to disposed.scopes
      expect(disposed.scopes).toEqual([s2]);

      // Dispose intermediate and customer
      // supplier will be erased too and removed from disposed nodes
      intermediate.dispose();
      customer.dispose();

      // supplier scope should be removed from disposed.scopes
      expect(disposed.scopes).toHaveLength(0);
    });

    it('should be called when a scope is undisposed', () => {
      // Dispose the supplier scope.
      // The scope will not be erased because
      // supplier has still customers
      s2.dispose();

      // The scope should be added to disposed.scopes
      expect(disposed.scopes).toEqual([s2]);

      // Readd a fresh node to s2 which will undispose the scope
      supplier.bluePrint.instantiate({ scope: supplier.scope });

      // supplier scope should be removed from disposed.scopes
      expect(disposed.scopes).toHaveLength(0);
    });
  });

  describe('scenarios', () => {
    describe('single scope & node', () => {
      describe('dispose single node without customers and suppliers ', () => {
        it('erases the node immediately', () => {
          single.dispose();
          expect(single.isDisposed).toBe(true);
          expect(single.isErased).toBe(true);
          expect(disposed.nodes).toHaveLength(0);
        });
      });

      describe(
        'dispose scope containing single node ' +
          'without customers and suppliers',
        () => {
          it('erases the scope and the node immediately', () => {
            c2.dispose();
            expect(c2.isDisposed).toBe(true);
            expect(c2.isErased).toBe(true);
            expect(disposed.scopes).toHaveLength(0);
            expect(customer.isDisposed).toBe(true);
            expect(customer.isErased).toBe(true);
          });
        },
      );
    });

    describe('single connection a -> b', () => {
      describe('dispose node a', () => {
        it('does not erase b because a is supplier of b', () => {
          a.dispose();
          expect(a.isDisposed).toBe(true);
          expect(a.isErased).toBe(false);
          expect(b.isDisposed).toBe(false);
          expect(b.isErased).toBe(false);
          expect(disposed.nodes).toEqual([a]);
        });
      });

      describe('recreate node a', () => {
        describe('after disposing node a', () => {
          it('should undispose containing scopeA', () => {
            sA.dispose();
            expect(disposed.nodes).toEqual([a]);
            expect(disposed.scopes).toEqual([sA]);
            expect(sA.isDisposed).toBe(true);
            a.bluePrint.instantiate({ scope: sA });
            expect(sA.isDisposed).toBe(false);
            expect(disposed.nodes).toHaveLength(0);
            expect(disposed.scopes).toHaveLength(0);
          });
        });
      });

      describe('dispose node b', () => {
        it('does erase b because b has no customers', () => {
          b.dispose();
          expect(b.isDisposed).toBe(true);
          expect(b.isErased).toBe(true);
          expect(disposed.nodes).toHaveLength(0);
        });

        it('does not erase the containing scope sB', () => {
          b.dispose();
          expect(sB.isDisposed).toBe(false);
        });
      });

      describe('dispose scope sA', () => {
        describe('will dispose but not erase both scope sA as well node a', () => {
          it('because a has customers', () => {
            sA.dispose();
            expect(sA.isDisposed).toBe(true);
            expect(sA.isErased).toBe(false);
            expect(a.isDisposed).toBe(true);
            expect(a.isErased).toBe(false);
            expect(disposed.scopes).toEqual([sA]);
            expect(disposed.nodes).toEqual([a]);
          });
        });

        describe('and recreate scope node a', () => {
          it(
            'should undispose scope sA ' +
              'and remove old node a from disposed nodes',
            () => {
              sA.dispose();
              expect(disposed.scopes).toEqual([sA]);
              expect(disposed.nodes).toEqual([a]);
              expect(sA.isDisposed).toBe(true);
              a.bluePrint.instantiate({ scope: sA });
              expect(sA.isDisposed).toBe(false);
              expect(disposed.scopes).toHaveLength(0);
              expect(disposed.nodes).toHaveLength(0);
            },
          );
        });
      });

      describe('dispose scope sB', () => {
        describe('should erase both scope sB as well node b', () => {
          it('because b has no customers', () => {
            sB.dispose();
            expect(sB.isDisposed).toBe(true);
            expect(sB.isErased).toBe(true);
            expect(b.isDisposed).toBe(true);
            expect(b.isErased).toBe(true);
            expect(disposed.scopes).toHaveLength(0);
            expect(disposed.nodes).toHaveLength(0);
          });
        });
      });
    });

    describe('connection supplier -> intermediate -> customer', () => {
      describe('dispose supplier', () => {
        it(
          'does not erase supplier ' +
            'because supplier is supplier of intermediate',
          () => {
            supplier.dispose();
            expect(supplier.isDisposed).toBe(true);
            expect(supplier.isErased).toBe(false);
            expect(intermediate.isDisposed).toBe(false);
            expect(intermediate.isErased).toBe(false);
            expect(disposed.nodes).toEqual([supplier]);
          },
        );
      });

      describe('recreate supplier after disposing', () => {
        it('should move the customers from old to new supplier', () => {
          supplier.dispose();
          expect(intermediate.suppliers[0]).toBe(supplier);
          const newSupplier = supplier.bluePrint.instantiate({ scope: s2 });
          expect(intermediate.suppliers[0]).toBe(newSupplier);
        });
      });

      describe('dispose intermediate', () => {
        it(
          'does not erase customer ' +
            'because intermediate is supplier of customer',
          () => {
            intermediate.dispose();
            expect(intermediate.isDisposed).toBe(true);
            expect(intermediate.isErased).toBe(false);
            expect(customer.isDisposed).toBe(false);
            expect(customer.isErased).toBe(false);
            expect(disposed.nodes).toEqual([intermediate]);
          },
        );
      });

      describe('recreate intermediate after disposing', () => {
        it('should move the customers from old to new intermediate', () => {
          const bluePrint = intermediate.bluePrint;
          intermediate.dispose();
          expect(customer.suppliers[0]).toBe(intermediate);
          const newIntermediate = bluePrint.instantiate({ scope: i2 });
          scm.flush();
          expect(customer.suppliers[0]).toBe(newIntermediate);
          expect(newIntermediate.suppliers[0]).toBe(supplier);
        });
      });

      describe('dispose customer', () => {
        it('does erase customer because customer has no customers', () => {
          customer.dispose();
          expect(customer.isDisposed).toBe(true);
          expect(customer.isErased).toBe(true);
          expect(disposed.nodes).toHaveLength(0);
        });
      });
    });

    describe('deletion of scopes that are referenced in scope blue prints', () => {
      let panel: Scope;
      let cornerCount: Node<number>;

      beforeEach(() => {
        // Create a panels scope
        // The scope contains a number of corners node
        panel = Scope.example({ key: 'panel' });
        cornerCount = new NodeBluePrint<number>({
          key: 'cornerCount',
          initialProduct: 2,
        }).instantiate({ scope: panel });

        // Create a first builder that adds a corners scope to the panel
        // scope containing one corner scope and node for each corner.
        new ScBuilderBluePrint({
          key: 'corners',
          shouldProcessChildren: (s) => s !== panel,
          shouldProcessScope: () => true,
          needsUpdateSuppliers: ['cornerCount'],
          needsUpdate: ({ components, hostScope }) => {
            // Remove old corners scope
            hostScope.child('corners')?.dispose();

            // Add a new corners scope
            const cornersScope = new ScopeBluePrint({
              key: 'corners',
            }).instantiate({ scope: hostScope });

            // Add a subscope and a node for each corner
            const cornerCountValue = components[0] as number;
            for (let i = 0; i < cornerCountValue; i++) {
              const cornerScope = new ScopeBluePrint({
                key: `corner${i}`,
              }).instantiate({ scope: cornersScope });
              new NodeBluePrint<number>({
                key: 'cValue',
                initialProduct: i,
              }).instantiate({ scope: cornerScope });
            }
          },
        }).instantiate({ scope: panel });

        // Create a second builder that adds a faces scope to the panel
        // scope containing one face for each corner.
        // Each face has a node referencing to the corner node.
        new ScBuilderBluePrint({
          key: 'panel',
          shouldProcessChildren: (s) => s !== panel,
          shouldProcessScope: () => true,
          needsUpdateSuppliers: ['cornerCount'],
          needsUpdate: ({ components, hostScope }) => {
            // Remove old faces scope
            hostScope.child('faces')?.dispose();

            // Add a new faces scope
            const facesScope = new ScopeBluePrint({
              key: 'faces',
            }).instantiate({ scope: hostScope });

            // Add a subscope and a node for each face
            const cornerCountValue = components[0] as number;
            for (let i = 0; i < cornerCountValue; i++) {
              const faceScope = new ScopeBluePrint({
                key: `face${i}`,
              }).instantiate({ scope: facesScope });
              NodeBluePrint.map<number>({
                supplier: `corners/corner${i}/cValue`,
                toKey: 'fValue',
                initialProduct: 0,
              }).instantiate({ scope: faceScope });
            }
          },
        }).instantiate({ scope: panel });

        panel.scm.flush();
      });

      it('should work', () => {
        // Check the initial configuration
        expect(
          panel.findNode<number>('panel/corners/corner0/cValue')!.product,
        ).toBe(0);
        expect(
          panel.findNode<number>('panel/corners/corner1/cValue')!.product,
        ).toBe(1);

        expect(
          panel.findNode<number>('panel/faces/face0/fValue')!.product,
        ).toBe(0);
        expect(
          panel.findNode<number>('panel/faces/face1/fValue')!.product,
        ).toBe(1);

        // Decrease the number of corners.
        cornerCount.product = 1;
        panel.scm.flush();
        expect(
          panel.findNode<number>('panel/corners/corner0/cValue'),
        ).not.toBeUndefined();
      });
    });
  });
});
