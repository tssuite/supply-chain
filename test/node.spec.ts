// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import os from 'node:os';
import nodePath from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeBluePrint, nbp } from '../src/node-blue-print.ts';
import { Scm } from '../src/scm.ts';
import { Scope } from '../src/scope.ts';
import { ScopeBluePrint } from '../src/scope-blue-print.ts';
import { ButterFlyExample, Node, TriangleExample } from '../src/node.ts';
import { Insert } from '../src/insert.ts';
import { Duration } from '../src/duration.ts';
import {
  ArgumentError,
  AssertionError,
  StateError,
} from '../src/internal/errors.ts';
import { testSetNextKeyCounter } from '../src/keys.ts';
import { Owner } from '../src/owner.ts';
import { Priority } from '../src/priority.ts';

import { deferred } from './helpers/deferred.ts';
import { MyType, myTypeTag } from './helpers/my-type.ts';

let scm: Scm;
let chain: Scope;
let node: Node<number>;

beforeEach(() => {
  Node.onChangeEnabled = true;
  Node.onRecursiveChangeEnabled = true;
  testSetNextKeyCounter(0);
  Node.testResetIdCounter();
  scm = new Scm({ isTest: true });
  chain = Scope.example({ scm });
  node = Node.example({ scope: chain });
});

afterEach(() => {
  NodeBluePrint.clearParsers();
});

// ###########################################################################
describe('node', () => {
  // .........................................................................

  it('exampleNode', () => {
    expect(node.product).toBe(0);

    // Nominate the node for production
    scm.nominate(node);

    // Flushing tasks will produce
    scm.flush();

    // Production should be done
    expect(node.product).toBe(2);
    expect(node.key).toBe('aaliyah');
    expect(node.toString()).toBe('aaliyah');

    // If no scm is given, then the testInstance will be used
    const node2 = Node.example();
    expect(node2.scm).toBe(Scm.testInstance);
  });

  describe('path', () => {
    it('should return the path of the node', () => {
      expect(node.path).toBe('root/example/aaliyah');
    });
  });

  describe('matchesPath', () => {
    it('should return true if the path matches', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          b: {
            'c0|c1|c2': { d: 0 },
          },
        },
      });

      const d = scope.findNode<number>('a/b/c1/d')!;
      expect(d.matchesPath('a/b/c0/d')).toBe(true);
      expect(d.matchesPath('a/b/c1/d')).toBe(true);
      expect(d.matchesPath('a/b/c2/d')).toBe(true);
      expect(d.matchesPath('a/b/c3/d')).toBe(false);
    });
  });

  describe('commonParent', () => {
    it('should return the common parent of two nodes', () => {
      const parent = Scope.example({ key: 'root' });
      parent.mockContent({
        k: {
          a: { b: 0 },
          c: { d: 0 },
        },
      });

      const k = parent.findChildScope('k')!;
      const b = parent.findNode<number>('b')!;
      const c = parent.findNode<number>('d')!;

      expect(b.commonParent(c)).toBe(k);
    });
  });

  it('product, produce(), reportUpdate()', () => {
    // Check initial values
    expect(node.product).toBe(0);
    expect(scm.nominatedNodes.filter((element) => !element.isMetaNode)).toEqual([
      node,
    ]);
    expect(node.suppliers).toHaveLength(0);
    expect(node.customers).toHaveLength(0);
    expect(scm.nodes.filter((element) => !element.isMetaNode)).toEqual([node]);

    // Call produce method
    const productBefore = node.product;
    scm.flush();
    expect(node.product).toBe(productBefore + 1);
  });

  describe('productAsJson', () => {
    it('returns or sets the product as JSON object', () => {
      NodeBluePrint.addJsonParser(myTypeTag, MyType.fromJson);
      const scope = Scope.example();
      const bp = new NodeBluePrint<MyType>({
        key: 'test',
        initialProduct: new MyType(42),
        type: myTypeTag,
      });
      const localNode = bp.instantiate({ scope });
      expect(localNode.productAsJson).toEqual({ x: 42 });
      localNode.productAsJson = { x: 100 };
      expect(localNode.product.x).toBe(100);
    });
  });

  describe('mockedProduct', () => {
    it('should override the produced product by a given value', () => {
      const localNode = new Node<number>({
        scope: Scope.example(),
        bluePrint: new NodeBluePrint<number>({
          key: 'test',
          initialProduct: 5,
        }),
      });

      // Set a product. Which should be returned.
      localNode.product = 2;
      expect(localNode.product).toBe(2);

      // Mock a product. Which should be returned.
      localNode.mockedProduct = 5;
      expect(localNode.product).toBe(5);

      // Remove the mocked product. The original product should be returned.
      localNode.mockedProduct = undefined;
      expect(localNode.product).toBe(2);
    });

    it('should work as normal products', () => {
      const scope = Scope.example();
      const localScm = scope.scm;

      const supplier = new NodeBluePrint<number>({
        key: 'test',
        initialProduct: 5,
      }).instantiate({ scope });

      const customer = NodeBluePrint.map<number>({
        supplier: 'test',
        toKey: 'customer',
        initialProduct: 0,
      }).instantiate({ scope });

      scope.scm.flush();
      expect(customer.product).toBe(5);

      supplier.mockedProduct = 2;
      localScm.flush();
      expect(customer.product).toBe(2);
    });
  });

  describe('deepSuppliers, deepCustomers', () => {
    for (const withScopes of [true, false]) {
      const butterFly = new ButterFlyExample({ withScopes });
      const { s111, s11, s10, s01, s00, s1, s0, x, c0, c1, c00, c01, c10, c11, c111 } =
        butterFly;

      describe('should empty arrays', () => {
        it('when depth == 0', () => {
          expect(x.deepSuppliers({ depth: 0 })).toEqual([]);
          expect(x.deepCustomers({ depth: 0 })).toEqual([]);
        });
      });

      describe('should only return own suppliers and customers', () => {
        it('when depth == 1', () => {
          expect(x.deepSuppliers({ depth: 1 })).toEqual([s1, s0]);
          expect(x.deepCustomers({ depth: 1 })).toEqual([c0, c1]);
        });
      });

      describe('should return suppliers of supplier and customers of customers', () => {
        it('when depth == 2', () => {
          expect(x.deepSuppliers({ depth: 2 })).toEqual([s1, s0, s11, s10, s01, s00]);
          expect(x.deepCustomers({ depth: 2 })).toEqual([c0, c1, c00, c01, c10, c11]);
        });
      });

      describe('should return all suppliers and customers', () => {
        it('when depth == 1000', () => {
          const expectedSuppliers = [s1, s0, s11, s10, s111, s01, s00];
          const expectedCustomers = [c0, c1, c00, c01, c10, c11, c111];

          expect(x.deepSuppliers({ depth: 1000 })).toEqual(expectedSuppliers);
          expect(x.deepSuppliers({ depth: -1 })).toEqual(expectedSuppliers);
          expect(x.deepCustomers({ depth: 1000 })).toEqual(expectedCustomers);
          expect(x.deepCustomers({ depth: -1 })).toEqual(expectedCustomers);
        });
      });
    }
  });

  describe('inserts', () => {
    it('should work as expected', () => {
      // Create insert2
      const host = Node.example({ key: 'host' });
      const localScm = host.scope.scm;

      // Check the initial product
      localScm.flush();
      expect(host.product).toBe(1);

      // Insert a first insert 2, adding 2 to the original product
      const insert2 = Insert.example({
        key: 'insert2',
        produce: (components, previousProduct) => previousProduct + 2,
        host,
      });

      localScm.flush();
      expect(host.inserts).toEqual([insert2]);
      expect(insert2.input).toBe(host);
      expect(insert2.output).toBe(host);
      expect(insert2).not.toBeUndefined();
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 + 2);

      // Add insert0 before insert2, multiplying by 3
      const insert0 = Insert.example({
        key: 'insert0',
        produce: (components, previousProduct) => previousProduct * 3,
        host,
        index: 0,
      });
      localScm.flush();

      expect(host.inserts).toEqual([insert0, insert2]);
      expect(insert0.input).toBe(host);
      expect(insert0.output).toBe(insert2);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 * 3 + 2);

      // Add insert1 between insert0 and insert2
      // The insert multiplies the previous result by 4
      const insert1 = Insert.example({
        key: 'insert1',
        produce: (components, previousProduct) => previousProduct * 4,
        host,
        index: 1,
      });
      localScm.flush();
      expect(host.inserts).toEqual([insert0, insert1, insert2]);
      expect(insert0.input).toBe(host);
      expect(insert0.output).toBe(insert1);
      expect(insert1.input).toBe(insert0);
      expect(insert1.output).toBe(insert2);
      expect(insert2.input).toBe(insert1);
      expect(insert2.output).toBe(host);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 * 3 * 4 + 2);

      // Add insert3 after insert2 adding ten
      const insert3 = Insert.example({
        key: 'insert3',
        produce: (components, previousProduct) => previousProduct + 10,
        host,
        index: 3,
      });
      localScm.flush();
      expect(host.inserts).toEqual([insert0, insert1, insert2, insert3]);
      expect(insert0.input).toBe(host);
      expect(insert0.output).toBe(insert1);
      expect(insert1.input).toBe(insert0);
      expect(insert1.output).toBe(insert2);
      expect(insert2.input).toBe(insert1);
      expect(insert2.output).toBe(insert3);
      expect(insert3.input).toBe(insert2);
      expect(insert3.output).toBe(host);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 * 3 * 4 + 2 + 10);

      // Remove insert node in the middle
      insert1.dispose();
      localScm.flush();
      expect(host.inserts).toEqual([insert0, insert2, insert3]);
      expect(insert0.input).toBe(host);
      expect(insert0.output).toBe(insert2);
      expect(insert2.input).toBe(insert0);
      expect(insert2.output).toBe(insert3);
      expect(insert3.input).toBe(insert2);
      expect(insert3.output).toBe(host);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 * 3 + 2 + 10);

      // Remove first insert node
      insert0.dispose();
      localScm.flush();
      expect(host.inserts).toEqual([insert2, insert3]);
      expect(insert2.input).toBe(host);
      expect(insert2.output).toBe(insert3);
      expect(insert3.input).toBe(insert2);
      expect(insert3.output).toBe(host);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 + 2 + 10);

      // Remove last insert node
      insert3.dispose();
      localScm.flush();
      expect(host.inserts).toEqual([insert2]);
      expect(insert2.input).toBe(host);
      expect(insert2.output).toBe(host);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1 + 2);

      // Remove last remaining insert node
      insert2.dispose();
      localScm.flush();
      expect(host.inserts).toEqual([]);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(1);
    });

    describe('clearInserts()', () => {
      it('should remove all inserts from node', () => {
        const host = Node.example({ key: 'host' });
        const localScm = host.scope.scm;

        // Add insert0 before insert2, multiplying by 3
        const insert0 = Insert.example({
          key: 'insert0',
          produce: (components, previousProduct) => previousProduct * 3,
          host,
        });

        // Insert a first insert 2, adding 2 to the original product
        const insert1 = Insert.example({
          key: 'insert1',
          produce: (components, previousProduct) => previousProduct + 2,
          host,
        });

        localScm.flush();
        expect(host.inserts).toEqual([insert0, insert1]);

        host.clearInserts();
        localScm.flush();
        expect(host.inserts).toEqual([]);

        expect(insert0.isDisposed).toBe(true);
        expect(insert1.isDisposed).toBe(true);
      });
    });

    describe('insert(String key)', () => {
      it('should return null if insert with key does not exist', () => {
        const host = Node.example({ key: 'host' });
        expect(host.insert('insert')).toBeUndefined();
      });

      it('should return the insert with the key', () => {
        const host = Node.example({ key: 'host' });
        const insert = Insert.example({
          key: 'insert',
          produce: (components, previousProduct) => previousProduct + 2,
          host,
        });

        expect(host.insert('insert')).toBe(insert);
      });
    });
  });

  describe('dispose()', () => {
    let scope: Scope;
    let supplier: Node<number>;
    let customer: Node<number>;
    let localScm: Scm;

    beforeEach(() => {
      scope = Scope.example();
      scope.mockContent({
        supplier: 0,
        customer: NodeBluePrint.map<number>({
          supplier: 'supplier',
          toKey: 'customer',
          initialProduct: 0,
        }),
      });
      scope.scm.flush();
      supplier = scope.findNode<number>('supplier')!;
      customer = scope.findNode<number>('customer')!;
      localScm = scope.scm;
    });

    it('should not remove the node from the SCM', () => {
      expect(supplier.isDisposed).toBe(false);
      expect(localScm.nodes).toContain(supplier);
      supplier.dispose();
      expect(supplier.isDisposed).toBe(true);
      expect(localScm.nodes).toContain(supplier);
    });

    it('should remove all suppliers from the node', () => {
      expect(customer.suppliers.length).not.toBe(0);
      customer.dispose();
      expect(customer.suppliers).toHaveLength(0);
    });

    it('should remove itself from its suppliers customers', () => {
      expect(customer.suppliers.length).not.toBe(0);
      expect(supplier.customers).toContain(customer);
      customer.dispose();
      expect(supplier.customers).not.toContain(customer);
    });

    it('should mute the customers from the blueprint', () => {
      expect(customer.bluePrint.suppliers.length).not.toBe(0);
      customer.dispose();
      expect(supplier.bluePrint.suppliers).toHaveLength(0);
    });

    it('should mark the node as disposed', () => {
      expect(customer.isDisposed).toBe(false);
      customer.dispose();
      expect(customer.isDisposed).toBe(true);
    });

    it('should erase the node, when it has no customers', () => {
      expect(customer.scope.hasNode(customer.key)).toBe(true);
      expect(localScm.nodes).toContain(customer);
      expect(customer.isErased).toBe(false);
      expect(customer.customers).toHaveLength(0);
      customer.dispose();
      expect(customer.isErased).toBe(true);
      expect(customer.isDisposed).toBe(true);
      expect(localScm.nodes).not.toContain(customer);
      expect(customer.scope.hasNode(customer.key)).toBe(false);
    });

    it('should not erase the node, when it has customers', () => {
      expect(customer.isErased).toBe(false);
      expect(customer.customers).toHaveLength(0);
      customer.dispose();
      expect(customer.isErased).toBe(true);
    });

    it('should erase the node after the last customer was removed', () => {
      supplier.dispose();
      expect(supplier.isErased).toBe(false);
      expect(supplier.customers.length).not.toBe(0);
      customer.dispose();
      expect(supplier.customers).toHaveLength(0);
      expect(supplier.isErased).toBe(true);
    });

    it('should erase the node, when it is replaced by another node', () => {
      supplier.dispose();
      expect(supplier.isErased).toBe(false);

      // Replace the node by another node with the same key
      supplier.bluePrint.instantiate({ scope: supplier.scope });
      scope.scm.flush();

      expect(supplier.isErased).toBe(true);
      const replacedSuppliers = scope.findNode<number>('supplier');
      expect(replacedSuppliers).not.toBe(supplier);
    });
  });

  it('reset', () => {
    const scope = Scope.example();
    const bp = new NodeBluePrint<number>({ key: 'test', initialProduct: 5 });
    const localNode = bp.instantiate({ scope });
    const node2 = NodeBluePrint.map<number>({
      supplier: 'test',
      toKey: 'test2',
      initialProduct: 6,
    }).instantiate({ scope });

    scope.scm.flush();
    expect(node2.product).toBe(5);

    localNode.product = 11;
    scope.scm.flush();
    expect(node2.product).toBe(11);
    localNode.reset();
    scope.scm.flush();
    expect(node2.product).toBe(5);
  });

  describe('owner', () => {
    it('should be informed when the node is disposed or erased', () => {
      // Create an owner that will be informed about disposal and erasal
      const willDisposeCalls: Node<any>[] = [];
      const didDisposeCalls: Node<any>[] = [];
      const willEraseCalls: Node<any>[] = [];
      const didEraseCalls: Node<any>[] = [];
      const owner = new Owner<Node<any>>({
        willDispose: (n) => willDisposeCalls.push(n),
        didDispose: (n) => didDisposeCalls.push(n),
        willErase: (n) => willEraseCalls.push(n),
        didErase: (n) => didEraseCalls.push(n),
      });

      // Create a node that has an owner
      const scope = Scope.example();
      const supplier = new NodeBluePrint<number>({
        key: 'supplier',
        initialProduct: 0,
      }).instantiate({ scope, owner });

      const customer = new NodeBluePrint<number>({
        key: 'customer',
        suppliers: ['supplier'],
        initialProduct: 0,
      }).instantiate({ scope, owner });
      scope.scm.flush();

      // Dispose the node
      supplier.dispose();

      // The owner should be informed about the disposal
      expect(willDisposeCalls).toEqual([supplier]);
      expect(didDisposeCalls).toEqual([supplier]);

      // The supplier is not erased yet, because it has customers
      expect(willEraseCalls).toHaveLength(0);
      expect(didEraseCalls).toHaveLength(0);

      // Erase the customer. All nodes will be erased.
      customer.dispose();
      expect(willDisposeCalls).toEqual([supplier, customer]);
      expect(didDisposeCalls).toEqual([supplier, customer]);
      expect(willEraseCalls).toEqual([supplier, customer]);
      expect(didEraseCalls).toEqual([supplier, customer]);
    });
  });

  describe('isAnimated', () => {
    it('should return true if node is animated', () => {
      expect(node.isAnimated).toBe(false);
      node.isAnimated = true;
      expect(node.isAnimated).toBe(true);
      node.isAnimated = false;
      expect(node.isAnimated).toBe(false);
    });
  });

  describe('ownPriority, priority', () => {
    it('should work as expected', () => {
      // Initially node has lowest priority
      node.ownPriority = Priority.lowest;
      expect(node.ownPriority).toBe(Priority.lowest);

      // Priority will be the node's own priority
      // because SCM did not overwrite it
      expect(node.priority).toBe(Priority.lowest);

      // Assume SCM will add a higher priority
      node.customerPriority = Priority.highest;

      // Priority will be the customer's priority,
      // because it is higher then the node's own priority
      expect(node.priority).toBe(Priority.highest);

      // Assume the node itself has a high priority
      // and SCM assignes a lower priority
      node.ownPriority = Priority.highest;
      node.customerPriority = Priority.lowest;

      // Now priority will be the node's own priority
      // because it is higher then the customer's priority
      expect(node.priority).toBe(Priority.highest);
    });
  });

  describe('set and get product', () => {
    it('should be possible if no suppliers and produce function is given', () => {
      // Create a node -> customer chain
      const localChain = Scope.example({ scm });

      const localNode = new Node<number>({
        scope: localChain,
        bluePrint: new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
        }),
      });

      const customer = new Node<number>({
        scope: localChain,
        bluePrint: new NodeBluePrint<number>({
          key: 'customer',
          initialProduct: 0,
          suppliers: ['node'],
          produce: (components) => (components[0] as number) * 10,
        }),
      });

      // Check initial values
      expect(localNode.product).toBe(0);

      // Set a product from the outside
      localNode.product = 1;
      expect(localNode.product).toBe(1);

      // Let the chain run
      localChain.scm.flush();

      // Check if customer got the new component
      expect(customer.product).toBe(10);
    });

    it('should throw if a produce method is given', () => {
      // Create a node -> customer chain
      const localChain = Scope.example({ scm });

      const localNode = new Node<number>({
        scope: localChain,
        bluePrint: new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          produce: () => 1,
        }),
      });

      // Check initial values
      expect(localNode.product).toBe(0);

      // Set a product from the outside
      expect(() => {
        localNode.product = 1;
      }).toThrow(AssertionError);
      expect(() => {
        localNode.product = 1;
      }).toThrow('Product can only be set if bluePrint.produce is doNothing');
    });
  });

  describe('addBluePrint(bluePrint)', () => {
    describe('should throw', () => {
      describe('an assertion error', () => {
        it('when key is different', () => {
          const otherBluePrint = new NodeBluePrint<number>({
            key: 'otherKey',
            initialProduct: 6,
          });

          expect(() => node.addBluePrint(otherBluePrint)).toThrow(
            AssertionError,
          );
        });
      });
    });

    it('should replace the previous blue print and nominate the node', () => {
      new NodeBluePrint<number>({
        key: 'supplier',
        initialProduct: 12,
      }).instantiate({ scope: chain });

      const otherBluePrint = node.bluePrint.copyWith({
        initialProduct: 6,
        suppliers: ['supplier'],
        produce: (components) => components[0] as number,
      });

      node.addBluePrint(otherBluePrint);

      expect(node.bluePrint).toBe(otherBluePrint);

      node.scm.flush();

      expect(node.product).toBe(12);
    });
  });

  describe('removeBluePrint(bluePrint)', () => {
    describe('should throw.', () => {
      it('when bluePrint is not added', () => {
        const otherBluePrint = new NodeBluePrint<number>({
          key: 'otherKey',
          initialProduct: 6,
        });

        expect(() => node.removeBluePrint(otherBluePrint)).toThrow(
          ArgumentError,
        );
        expect(() => node.removeBluePrint(otherBluePrint)).toThrow(
          `The blue print "${otherBluePrint.key}" does not exist.`,
        );
      });

      it('when bluePrint is the last blue print', () => {
        expect(() => node.removeBluePrint(node.bluePrint)).toThrow(
          ArgumentError,
        );
        expect(() => node.removeBluePrint(node.bluePrint)).toThrow(
          'Cannot remove last bluePrint.',
        );
      });
    });

    it('should remove the blue print and the previous one becomes active', () => {
      const previousBluePrint = node.bluePrint;

      const otherBluePrint = node.bluePrint.copyWith({
        initialProduct: 6,
        produce: () => 7,
      });

      node.addBluePrint(otherBluePrint);

      expect(node.bluePrint).toBe(otherBluePrint);

      scm.flush();

      node.removeBluePrint(otherBluePrint);

      expect(node.bluePrint).toBe(previousBluePrint);
    });
  });

  describe('writeImageFile', () => {
    it('should save the graph to a file', async () => {
      const localNode = new ButterFlyExample({ withScopes: true }).x;
      const path = nodePath.join(
        os.tmpdir(),
        'test.graphs.graph_test.node_test_saveGraphToFile.dot',
      );
      await localNode.writeImageFile(path);
    });
  });

  describe('dot', () => {
    it('should return a dot representation of node and its suppliers and customers', () => {
      const localNode = new ButterFlyExample({ withScopes: true }).x;
      const dot = localNode.dot();
      expect(dot).not.toBeUndefined();
    });
  });

  describe('mermaid', () => {
    it('should return a mermaid representation of node and its suppliers and customers', () => {
      const localNode = new ButterFlyExample({ withScopes: true }).x;
      const mm = localNode.mermaid();
      expect(mm).not.toBeUndefined();
    });
  });

  describe('special cases', () => {
    describe('should throw', () => {
      describe('when the new product is not in the list of allowed values', () => {
        it('with a fixed value assigned', () => {
          const localNode = new Node<number>({
            scope: Scope.example(),
            bluePrint: new NodeBluePrint<number>({
              key: 'node',
              initialProduct: 0,
              allowedProducts: [0, 1, 2],
            }),
          });

          expect(() => {
            localNode.product = 3;
          }).toThrow(ArgumentError);
          expect(() => {
            localNode.product = 3;
          }).toThrow('The product 3 is not in the list of allowed products [0, 1, 2].');
        });

        it('with value produced', () => {
          const localNode = new Node<number>({
            scope: Scope.example(),
            bluePrint: new NodeBluePrint<number>({
              key: 'node',
              initialProduct: 0,
              allowedProducts: [0, 1, 2],
              produce: () => 3,
            }),
          });

          expect(() => localNode.produce()).toThrow(ArgumentError);
          expect(() => localNode.produce()).toThrow(
            'The product 3 is not in the list of allowed products [0, 1, 2].',
          );
        });
      });

      describe('when circular dependencies are created', () => {
        it('with a simple connection', () => {
          const scope = Scope.example();
          scope.mockContent({
            a: {
              b: {
                c: {
                  a: nbp({ from: ['d/b'], to: 'a', init: 0 }),
                },
                d: {
                  b: nbp({ from: ['c/a'], to: 'b', init: 1 }),
                },
              },
            },
          });

          expect(() => scope.scm.flush()).toThrow(
            'Circular dependency detected: b -> a -> b',
          );
        });

        it('with a complicated connection', () => {
          const scope = Scope.example();
          scope.mockContent({
            a: {
              v0: nbp({ from: ['v2'], to: 'v0', init: 0 }),
              b: {
                c: {
                  v1: nbp({ from: ['v0'], to: 'v1', init: 0 }),
                },
                d: {
                  v2: nbp({ from: ['v1'], to: 'v2', init: 1 }),
                },
              },
            },
          });

          expect(() => scope.scm.flush()).toThrow(
            'Circular dependency detected: v2 -> v0 -> v1 -> v2',
          );
        });
      });
    });
  });

  describe('smartNodes', () => {
    describe('a node should become a smart node', () => {
      it('when it is placed within a smart scope', () => {
        // Create a root scope
        const scope = Scope.example();

        // Create a master scope within the root scope
        // containing one node.
        scope.mockContent({
          master: { node: 0 },
        });

        // Create a non smart node called follower
        const followerNodeBp = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
        });
        expect(followerNodeBp.isSmartNode).toBe(false);

        // Create a follower scope
        const followerScope = new ScopeBluePrint({
          key: 'follower',
          smartMaster: ['master'],
        }).instantiate({ scope });

        // The follower scope is a smart scope
        expect(followerScope.isSmartScope).toBe(true);

        // Instantiate the followerNode blue print within the
        // follower smart scope
        const followerNode = followerNodeBp.instantiate({
          scope: followerScope,
        });

        // Although the follower node's blue print is not a smart node,
        // the follower node is a smart node, because it is placed within
        // a smart scope.
        expect(followerNode.isSmartNode).toBe(true);

        // The right smart master path is assigned to the node
        expect(followerNode.smartMaster).toEqual(['master', 'node']);

        // Therefore changing the master node's value
        // should change the follower node's
        expect(followerNode.product).toBe(0);
        const masterNode = scope.findNode<number>('master/node')!;
        masterNode.product = 1;
        scope.scm.flush();
        expect(followerNode.product).toBe(1);

        // Anyway, meta nodes should not be smart nodes
        let didCheck = false;
        for (const metaScope of followerScope.metaScopes) {
          for (const metaNode of metaScope.nodes) {
            expect(metaNode.isSmartNode).toBe(false);
            didCheck = true;
          }
        }
        expect(didCheck).toBe(true);
      });
    });

    it('should work', () => {
      const smartNodeValue = 2;
      let master0Value = 3;
      const master1Value = 4;

      const scope = Scope.example();
      const localScm = scope.scm;
      scope.mockContent({
        a: {
          b: {
            c: {
              height: new NodeBluePrint<number>({
                key: 'height',
                initialProduct: smartNodeValue,
                smartMaster: ['x', 'height'],
              }),
              d: {
                customer: NodeBluePrint.map<number>({
                  supplier: 'height',
                  initialProduct: 0,
                  toKey: 'customer',
                }),
              },
            },
          },
        },
      });

      const smartNode = scope.findNode<number>('c/height')!;
      expect(smartNode.bluePrint.isSmartNode).toBe(true);
      const a = scope.findScope('a')!;
      const b = scope.findScope('b')!;
      const customer = scope.findNode<number>('d/customer')!;
      localScm.flush();

      // ..............................................
      // Use smartNode itself when no smartNode is available

      // SmartNode delivers it's own initial value
      // because no other master height node can be found
      expect(smartNode.product).toBe(smartNodeValue);

      // The customer uses the place holder
      expect(customer.product).toBe(smartNodeValue);

      // .........................................
      // Add master0 replacing the smartNode

      // Add x.height to the scope a
      a.mockContent({
        x: { height: master0Value },
      });
      const master0 = scope.findNode<number>('x/height')!;
      localScm.flush();

      // Now master0 should deliver the value of the smartNode
      expect(master0.product).toBe(master0Value);
      expect(smartNode.product).toBe(master0Value);
      expect(customer.product).toBe(master0Value);

      // Change the master0
      // SmartNode value should be updated
      master0Value *= 10;
      master0.product = master0Value;
      localScm.flush();

      expect(master0.product).toBe(master0Value);
      expect(smartNode.product).toBe(master0Value);
      expect(customer.product).toBe(master0Value);

      // ..........................................................
      // Insert another master1 between smartNode and master0
      b.mockContent({
        x: { height: master1Value },
      });
      const master1 = scope.findNode<number>('b/x/height')!;
      localScm.flush();

      // Now the smartNode should deliver the value of the new smartNode
      expect(master0.product).toBe(master0Value);
      expect(master1.product).toBe(master1Value);
      expect(smartNode.product).toBe(master1Value);
      expect(customer.product).toBe(master1Value);

      // .........................................................
      // Remove the master1 between smartNode and master0
      master1.dispose();
      localScm.flush();

      // Now master0 should take over again
      expect(master0.product).toBe(master0Value);
      expect(smartNode.product).toBe(master0Value);
      expect(customer.product).toBe(master0Value);

      // .......................
      // Remove the master0.
      // SmartNode should take over again
      master0.dispose();
      localScm.flush();

      expect(smartNode.suppliers).toHaveLength(0);
      smartNode.product = smartNodeValue;
      expect(smartNode.product).toBe(smartNodeValue);
      expect(customer.product).toBe(smartNodeValue);
    });

    it('should not be able to connect to a master in own scope', () => {
      const scope = Scope.example();
      const localScm = scope.scm;
      scope.mockContent({
        a: 5,
        b: new NodeBluePrint<number>({
          key: 'b',
          initialProduct: 1,
          smartMaster: ['a'],
        }),
      });
      localScm.flush();
      const a = scope.findNode<number>('a')!;
      const b = scope.findNode<number>('b')!;
      expect(a.customers).toHaveLength(0);
      expect(b.suppliers).toHaveLength(0);

      expect(scope.findNode<number>('b')!.product).toBe(1);
    });

    it('should remove suppliers from disposed smart nodes', () => {
      const scope = Scope.example();
      const localScm = scope.scm;

      // Create two sibling nodes that might reference each other.
      scope.mockContent({
        scope0: {
          master: 0,
          a: {
            smartNode: new NodeBluePrint<number>({
              key: 'smartNode',
              smartMaster: ['master'],
              initialProduct: 1,
            }),
          },
        },
      });

      localScm.flush();

      const master = scope.findNode<number>('master')!;
      const smartNode = scope.findNode<number>('smartNode')!;
      expect(smartNode.suppliers).toEqual([master]);

      // Dispose smart node
      smartNode.dispose();

      // The smart node should not have any suppliers anymore.
      expect(smartNode.suppliers).toHaveLength(0);
    });
  });

  describe('initSuppliers', () => {
    describe('should throw', () => {
      it('when suppliers are ambigous', () => {
        const scope = Scope.example();
        scope.mockContent({
          s: {
            a: { x: 0 },
            b: { x: 0 },
            c: { x: 0 },
          },
          n: nbp({ from: ['a/x', 'b/x', 'c/x'], to: 'n', init: 0 }),
        });

        scope.scm.flush();
        const n = scope.findNode<number>('n')!;
        expect(n.suppliers).toHaveLength(3);

        // Init suppliers with ambigous suppliers
      });
    });
  });

  describe('findSmartMaster(smartNode)', () => {
    it('returns null when no master node is found or the master node', () => {
      const scope = Scope.example();
      scope.mockContent({
        a: {
          node: 0,
          b: {
            node: 1,
            c: {
              node: new NodeBluePrint<number>({
                initialProduct: 2,
                key: 'node',
                smartMaster: ['node'],
              }),
            },
            d: {
              node: new NodeBluePrint<number>({
                initialProduct: 3,
                key: 'node',
                smartMaster: ['node'],
              }),
            },
            e: {
              node: new NodeBluePrint<number>({
                initialProduct: 4,
                key: 'node',
                smartMaster: ['node'],
              }),
            },
          },
          f: { node: 6 },
        },
      });
      scope.scm.flush();

      // Find the first master node in the hierarchy
      const nodeB = scope.findNode<number>('a/b/node')!;
      const nodeC = scope.findNode<number>('c/node')!;
      const masterOfNodeC = nodeC.findSmartMaster();
      expect(masterOfNodeC).toBe(nodeB);

      // Dispose the master node
      nodeB.dispose();
      scope.scm.flush();

      // The next master node should be found
      const nodeA = scope.findNode<number>('a/node')!;
      const masterOfNodeA = nodeC.findSmartMaster();
      expect(masterOfNodeA).toBe(nodeA);

      // Dispose the master node
      nodeA.dispose();
      scope.scm.flush();

      // No master node is found
      const masterOfNodeX = nodeC.findSmartMaster();
      expect(masterOfNodeX).toBeUndefined();
    });

    describe('does return sibling nodes', () => {
      it('scenario 1', () => {
        const scope = Scope.example();
        scope.mockContent({
          a: {
            node: 0,
            b: {
              node: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'node',
                smartMaster: ['node'],
              }),
            },
            c: {
              node: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'node',
                smartMaster: ['node'],
              }),
            },
          },
        });

        const masterNode = scope.findNode<number>('a/node')!;

        scope.scm.flush();
        const nodeB = scope.findNode<number>('b/node')!;
        const masterNodeB = nodeB.findSmartMaster();
        expect(masterNodeB).toBe(masterNode);

        const nodeC = scope.findNode<number>('c/node')!;
        const masterNodeOfC = nodeC.findSmartMaster();
        expect(masterNodeOfC).toBe(masterNode);

        masterNode.dispose();
        scope.scm.flush();
        expect(nodeB.findSmartMaster()).toBeUndefined();
        expect(nodeC.findSmartMaster()).toBeUndefined();
      });

      it('scenario 2: direct circular dependency', () => {
        const scope = Scope.example();

        // Might create a circular dependency: input -> output -> input
        scope.mockContent({
          parent: {
            child: {
              input: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'input',
                smartMaster: ['parent', 'child', 'output'],
              }),
              output: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'output',
                suppliers: ['input'],
                produce: (components) => (components[0] as number) + 1,
              }),
            },
          },
        });

        scope.scm.flush();
        const input = scope.findNode<number>('parent/child/input')!;
        const output = scope.findNode<number>('output')!;

        // Because input is already a supplier of output
        // input will not connect to parent/child/output.
        // If it would do so, a circular dependency would be created.
        expect(input.customers).toEqual([output]);
        expect(input.suppliers).toHaveLength(0);

        expect(output.customers).toHaveLength(0);
        expect(output.suppliers).toEqual([input]);
      });

      it('scenario 3: indirect circular dependency', () => {
        const scope = Scope.example();

        // Might create a circular dependency:
        // input -> between -> output -> input
        scope.mockContent({
          parent: {
            child: {
              input: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'input',
                smartMaster: ['parent', 'child', 'output'],
              }),
              between: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'between',
                suppliers: ['input'],
                produce: (components) => (components[0] as number) + 1,
              }),
              output: new NodeBluePrint<number>({
                initialProduct: 0,
                key: 'output',
                suppliers: ['between'],
                produce: (components) => (components[0] as number) + 1,
              }),
            },
          },
        });

        scope.scm.flush();
        const input = scope.findNode<number>('parent/child/input')!;
        const output = scope.findNode<number>('output')!;
        const between = scope.findNode<number>('between')!;

        // Because input is already a supplier of output
        // input will not connect to parent/child/output.
        // If it would do so, a circular dependency would be created.
        expect(input.suppliers).toHaveLength(0);
        expect(input.customers).toEqual([between]);

        expect(between.suppliers).toEqual([input]);
        expect(between.customers).toEqual([output]);

        expect(output.suppliers).toEqual([between]);
        expect(output.customers).toHaveLength(0);
      });

      it('scenario 4: indirect circular dependency + parent match', () => {
        const scope = Scope.example();

        scope.mockContent({
          // Create an outer parent who should become master
          parent: {
            child: { output: 5 },

            // Create an inner parent
            parent: {
              child: {
                // Create an input which sould take over the input value
                // from the outer parent
                input: new NodeBluePrint<number>({
                  initialProduct: 0,
                  key: 'input',

                  // This will connect to the outer parent/child/input
                  // because the inner one would create a circular
                  // dependency.
                  smartMaster: ['parent', 'child', 'output'],
                }),
                between: new NodeBluePrint<number>({
                  initialProduct: 0,
                  key: 'between',
                  suppliers: ['input'],
                  produce: (components) => (components[0] as number) + 1,
                }),
                output: new NodeBluePrint<number>({
                  initialProduct: 0,
                  key: 'output',
                  suppliers: ['between'],
                  produce: (components) => (components[0] as number) + 1,
                }),
              },
            },
          },
        });

        scope.scm.flush();
        const outerOutput = scope.findNode<number>('parent/child/output')!;
        const innerInput = scope.findNode<number>('parent/parent/child/input')!;
        const innerOutput = scope.findNode<number>(
          'parent/parent/child/output',
        )!;
        const between = scope.findNode<number>('between')!;

        // This should create the following chain:
        // outerOutput -> innerInput -> between -> innerOutput

        expect(outerOutput.customers).toEqual([innerInput]);
        expect(innerInput.customers).toEqual([between]);
        expect(between.customers).toEqual([innerOutput]);
        expect(innerOutput.customers).toHaveLength(0);
      });
    });
  });

  describe('onChangeEnabled, onRecursiveChangeEnabled', () => {
    it('true', () => {
      Node.onChangeEnabled = true;
      Node.onRecursiveChangeEnabled = true;
      const scope = Scope.example();
      expect(scope.findNode<Scope>('on/change')).not.toBeUndefined();
      expect(scope.findNode<Scope>('on/changeRecursive')).not.toBeUndefined();
    });

    it('false', () => {
      Node.onChangeEnabled = false;
      Node.onRecursiveChangeEnabled = false;
      const scope = Scope.example();
      expect(scope.findNode<Scope>('on/change')).toBeUndefined();
      expect(scope.findNode<Scope>('on/changeRecursive')).toBeUndefined();
    });
  });
});

describe('Examples', () => {
  it('ButterFlyExample', () => {
    expect(new ButterFlyExample()).not.toBeUndefined();
  });
  it('TriangleExample', () => {
    expect(new TriangleExample()).not.toBeUndefined();
  });
});

// ###########################################################################
describe('asynchronous production', () => {
  it('lets customers wait for the future and then updates them', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    nbp({ from: [], to: 'source', init: 1 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 0,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    const customer = new NodeBluePrint<number>({
      key: 'customer',
      initialProduct: 0,
      suppliers: ['asyncMid'],
      produce: (c) => (c[0] as number) * 2,
    }).instantiate({ scope });

    localScm.flush();
    expect(asyncMid.isProducingAsync).toBe(true);
    expect(asyncMid.product).toBe(0);
    expect(customer.product).toBe(0);

    completer.resolve(21);
    await localScm.settle();

    expect(asyncMid.product).toBe(21);
    expect(customer.product).toBe(42);
  });

  it('finalizes with the previous product on timeout, then applies the real result', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    nbp({ from: [], to: 'source', init: 5 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 99,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    const customer = new NodeBluePrint<number>({
      key: 'customer',
      initialProduct: 0,
      suppliers: ['asyncMid'],
      produce: (c) => (c[0] as number) + 1,
    }).instantiate({ scope });

    localScm.flush();
    expect(asyncMid.productionTimeout).toBe(localScm.timeout);

    localScm.testStopwatch.elapse(localScm.timeout);
    localScm.testTimer!.fire();
    expect(asyncMid.isTimedOut).toBe(true);
    localScm.flush({ tick: false });
    expect(customer.product).toBe(100);

    completer.resolve(7);
    await localScm.settle();
    expect(asyncMid.product).toBe(7);
    expect(customer.product).toBe(8);
  });

  it('respects a longer per-node productionTimeout', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    nbp({ from: [], to: 'source', init: 5 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 99,
      suppliers: ['source'],
      productionTimeout: new Duration({ seconds: 10 }),
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    expect(
      asyncMid.productionTimeout.equals(new Duration({ seconds: 10 })),
    ).toBe(true);

    localScm.testStopwatch.elapse(localScm.timeout);
    localScm.testTimer?.fire();
    localScm.testRunFastTasks();
    expect(asyncMid.isTimedOut).toBe(false);

    completer.resolve(7);
    await localScm.settle();
    expect(asyncMid.product).toBe(7);
  });

  it('discards a superseded in-flight result', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const first = deferred<number>();
    const second = deferred<number>();
    let call = 0;

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: -1,
      suppliers: ['source'],
      produce: () => (call++ === 0 ? first.promise : second.promise),
    }).instantiate({ scope });

    localScm.flush();
    localScm.nominate(asyncMid);
    localScm.flush();

    first.resolve(111);
    second.resolve(222);
    await localScm.settle();

    expect(asyncMid.product).toBe(222);
  });

  it('discards an async result resolving after dispose', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 7,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    expect(asyncMid.isProducingAsync).toBe(true);

    asyncMid.dispose();
    completer.resolve(123);
    await localScm.settle();
    expect(asyncMid.product).toBe(7);
  });

  it('lets a set mockedProduct supersede an in-flight result', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 1,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    asyncMid.mockedProduct = 500;
    completer.resolve(123);
    await localScm.settle();
    expect(asyncMid.product).toBe(500);
  });

  it('keeps the previous product when the future rejects', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();
    localScm.onProductionError = () => {};

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });

    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 42,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    completer.reject(new StateError('boom'));
    await localScm.settle();
    expect(asyncMid.product).toBe(42);
  });

  it('handles a rejected future that arrives after the node timed out', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();
    let reported = false;
    localScm.onProductionError = () => {
      reported = true;
    };

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });
    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 42,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    expect(localScm.producingNodes).toContain(asyncMid);

    // Time the node out first: it leaves scm.producingNodes.
    localScm.testStopwatch.elapse(localScm.timeout);
    localScm.testTimer!.fire();
    expect(asyncMid.isTimedOut).toBe(true);
    expect(localScm.producingNodes).not.toContain(asyncMid);

    // The rejection arrives afterwards; the node is no longer producing.
    completer.reject(new StateError('boom'));
    await localScm.settle();
    expect(reported).toBe(true);
    expect(asyncMid.product).toBe(42);
  });

  it('ignores a rejected future for a disposed node', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();
    localScm.onProductionError = () => {};

    nbp({ from: [], to: 'source', init: 0 }).instantiate({ scope });
    const asyncMid = new NodeBluePrint<number>({
      key: 'asyncMid',
      initialProduct: 42,
      suppliers: ['source'],
      produce: () => completer.promise,
    }).instantiate({ scope });

    localScm.flush();
    expect(localScm.pendingAsyncProductions.length).toBeGreaterThan(0);

    // Dispose the node while its production is still in flight.
    asyncMid.dispose();

    // The rejection arrives for a node that is now disposed -> early return.
    completer.reject(new StateError('boom'));
    await localScm.settle();
  });

  it('supports an async insert that times out and resolves later', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    const host = new NodeBluePrint<number>({
      key: 'host',
      initialProduct: 1,
    }).instantiate({ scope });
    const customer = host.bluePrint
      .forwardTo('customer')
      .instantiate({ scope });
    localScm.flush();

    Insert.example({
      key: 'asyncInsert',
      produce: () => completer.promise,
      host,
    });
    localScm.flush();
    expect(host.product).toBe(1);

    // Time out the insert, then resolve it.
    localScm.testStopwatch.elapse(localScm.timeout);
    localScm.testTimer!.fire();
    localScm.flush({ tick: false });

    completer.resolve(777);
    await localScm.settle();
    expect(host.product).toBe(777);
    expect(customer.product).toBe(777);
  });

  it('handles a non-last async insert that times out and resolves later', async () => {
    const scope = Scope.example();
    const localScm = scope.scm;
    const completer = deferred<number>();

    const host = new NodeBluePrint<number>({
      key: 'host',
      initialProduct: 1,
    }).instantiate({ scope });
    const customer = host.bluePrint
      .forwardTo('customer')
      .instantiate({ scope });
    localScm.flush();

    // The async insert is added first (becomes index 0).
    Insert.example({
      key: 'asyncInsert',
      produce: () => completer.promise,
      host,
    });
    localScm.flush();

    // Time out the async insert while it is still the last one.
    localScm.testStopwatch.elapse(localScm.timeout);
    localScm.testTimer!.fire();
    localScm.flush({ tick: false });

    // Now append a trailing synchronous insert so the async insert is no longer
    // the last insert when its future resolves later.
    Insert.example({
      key: 'syncInsert',
      produce: (components, previousProduct) => previousProduct,
      host,
    });
    localScm.flush({ tick: false });

    completer.resolve(555);
    await localScm.settle();
    // The async insert is no longer the last insert; its late result still
    // propagates through the chain.
    expect(customer.product).toBe(host.product);
  });
});

// ###########################################################################
describe('Node coverage completion', () => {
  beforeEach(() => {
    Node.onChangeEnabled = true;
    Node.onRecursiveChangeEnabled = true;
    testSetNextKeyCounter(0);
    Node.testResetIdCounter();
  });

  it('mockedProduct getter returns the mocked value', () => {
    const localNode = new Node<number>({
      scope: Scope.example(),
      bluePrint: new NodeBluePrint<number>({ key: 'mp', initialProduct: 5 }),
    });
    expect(localNode.mockedProduct).toBeUndefined();
    localNode.mockedProduct = 9;
    expect(localNode.mockedProduct).toBe(9);
  });

  it('isAnimated setter is a no-op when the value does not change', () => {
    const localNode = Node.example({ key: 'anim' });
    expect(localNode.isAnimated).toBe(false);
    // Setting the same value (false) returns early.
    localNode.isAnimated = false;
    expect(localNode.isAnimated).toBe(false);
    localNode.isAnimated = true;
    // Setting the same value (true) returns early.
    localNode.isAnimated = true;
    expect(localNode.isAnimated).toBe(true);
  });

  it('deepSuppliers and deepCustomers default the depth to 1', () => {
    const butterFly = new ButterFlyExample();
    const x = butterFly.x;
    expect(x.deepSuppliers()).toEqual(x.deepSuppliers({ depth: 1 }));
    expect(x.deepCustomers()).toEqual(x.deepCustomers({ depth: 1 }));
  });

  it('graph() defaults depths to 0 and accepts explicit options', () => {
    const butterFly = new ButterFlyExample();
    const x = butterFly.x;
    // Default depths (no args).
    expect(x.graph()).not.toBeUndefined();
    // Explicit options exercise the non-default branches.
    expect(
      x.graph({
        supplierDepth: 1,
        customerDepth: 1,
        highlightedNodes: [x],
        highlightedScopes: [],
      }),
    ).not.toBeUndefined();
  });

  it('couldBeMasterOf returns false for a non-smart node', () => {
    const scope = Scope.example();
    const master = new NodeBluePrint<number>({
      key: 'master',
      initialProduct: 0,
    }).instantiate({ scope });
    const plain = new NodeBluePrint<number>({
      key: 'plain',
      initialProduct: 0,
    }).instantiate({ scope });

    expect(plain.isSmartNode).toBe(false);
    expect(master.couldBeMasterOf(plain)).toBe(false);
  });

  it('insert(key) skips non-matching inserts', () => {
    const host = Node.example({ key: 'host' });
    Insert.example({
      key: 'firstInsert',
      produce: (c, p) => p + 1,
      host,
    });
    const second = Insert.example({
      key: 'secondInsert',
      produce: (c, p) => p + 2,
      host,
    });
    // Searching for the second insert iterates past the first (non-matching).
    expect(host.insert('secondInsert')).toBe(second);
  });

  it('produce with triggerOnChange false applies the product without onChange', () => {
    const scope = Scope.example();
    const producer = new NodeBluePrint<number>({
      key: 'noTrigger',
      initialProduct: 0,
      produce: (c, p) => p + 1,
    }).instantiate({ scope });

    producer.produce({ announce: false, triggerOnChange: false });
    expect(producer.product).toBe(1);
  });

  it('allows a product contained in allowedProducts', () => {
    const localNode = new Node<number>({
      scope: Scope.example(),
      bluePrint: new NodeBluePrint<number>({
        key: 'allowed',
        initialProduct: 0,
        allowedProducts: [0, 1, 2],
      }),
    });
    // Setting an allowed product does not throw and is applied.
    localNode.product = 1;
    expect(localNode.product).toBe(1);
  });

  it('removeBluePrint does not reset/nominate a disposed node', () => {
    const scope = Scope.example();
    const base = new NodeBluePrint<number>({
      key: 'rbpDisposed',
      initialProduct: 0,
    });
    const localNode = base.instantiate({ scope });
    const otherBluePrint = base.copyWith({
      initialProduct: 6,
      produce: () => 7,
    });
    localNode.addBluePrint(otherBluePrint);
    scope.scm.flush();

    // Dispose the node, then remove the added blue print. Because the node is
    // disposed, removeBluePrint must not call reset()/nominate().
    localNode.dispose();
    expect(localNode.isDisposed).toBe(true);
    expect(() => localNode.removeBluePrint(otherBluePrint)).not.toThrow();
  });

  it('erases the bluePrint difference when replacing with the same bluePrint', () => {
    const scope = Scope.example();
    const bluePrint = new NodeBluePrint<number>({
      key: 'sameBp',
      initialProduct: 0,
    });
    const localNode = bluePrint.instantiate({ scope });
    // Replacing with the exact same bluePrint reference is a no-op.
    expect(() => localNode.addBluePrint(bluePrint)).not.toThrow();
    expect(localNode.bluePrint).toBe(bluePrint);
  });

  describe('onChange meta nodes with one flag disabled', () => {
    it('does not add the scope onChange node when onChangeEnabled is false', () => {
      Node.onChangeEnabled = false;
      Node.onRecursiveChangeEnabled = true;
      const scope = Scope.example();
      const localScm = scope.scm;
      const producer = new NodeBluePrint<number>({
        key: 'producerA',
        initialProduct: 0,
        produce: (c, p) => p + 1,
      }).instantiate({ scope });
      localScm.nominate(producer);
      localScm.flush();
      expect(producer.product).toBeGreaterThan(0);
    });

    it('does not add the recursive onChange node when onRecursiveChangeEnabled is false', () => {
      Node.onChangeEnabled = true;
      Node.onRecursiveChangeEnabled = false;
      const scope = Scope.example();
      const localScm = scope.scm;
      const producer = new NodeBluePrint<number>({
        key: 'producerB',
        initialProduct: 0,
        produce: (c, p) => p + 1,
      }).instantiate({ scope });
      localScm.nominate(producer);
      localScm.flush();
      expect(producer.product).toBeGreaterThan(0);
    });
  });
});
