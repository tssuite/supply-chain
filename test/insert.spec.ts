// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// NOTE(port): These symbols are intentionally imported from their individual
// source files (in this order) rather than from '../src/index.ts'. The barrel
// in src/index.ts triggers a module-init-order cycle: Scm's eager static field
// `static readonly testInstance = new Scm(...)` constructs an Scm during module
// evaluation, which needs Disposed / Scope.root before those class bindings are
// initialized when scm.ts is pulled in first via the barrel. See the report.
import { NodeBluePrint } from '../src/node-blue-print.ts';
import '../src/scm.ts';
import { Scope } from '../src/scope.ts';
import { Node } from '../src/node.ts';
import { Insert } from '../src/insert.ts';
import { ArgumentError } from '../src/internal/errors.ts';

describe('Insert', () => {
  describe('example', () => {
    it('should work', () => {
      const insert = Insert.example({ key: 'insert' });

      const host = insert.host;

      expect(host.inserts).toEqual([insert]);
      expect(insert.input).toBe(host);
      expect(insert.output).toBe(host);
      expect(insert).not.toBeUndefined();
    });
  });

  it('should add and remove inserts correctly', () => {
    // Create insert2
    const host = Node.example({ key: 'host' });
    const scope = host.scope;
    const scm = host.scope.scm;

    const customer0 = host.bluePrint
      .forwardTo('customer0')
      .instantiate({ scope });

    const customer1 = host.bluePrint
      .forwardTo('customer1')
      .instantiate({ scope });

    // Check the initial product
    scm.flush();
    expect(host.product).toBe(1);
    expect(customer0.product).toBe(1);
    expect(customer1.product).toBe(1);

    // Insert a first insert 2, adding 2 to the original product
    const insert2 = Insert.example({
      key: 'insert2',
      produce: (components, previousProduct, node) => previousProduct + 2,
      host,
    });

    scm.flush();
    expect(host.inserts).toEqual([insert2]);
    expect(insert2.input).toBe(host);
    expect(insert2.output).toBe(host);
    expect(insert2).not.toBeUndefined();
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 + 2);
    expect(customer0.product).toBe(1 + 2);
    expect(customer1.product).toBe(1 + 2);

    // Add insert0 before insert2, multiplying by 3
    const insert0 = Insert.example({
      key: 'insert0',
      produce: (components, previousProduct, node) => previousProduct * 3,
      host,
      index: 0,
    });
    scm.flush();

    expect(host.inserts).toEqual([insert0, insert2]);
    expect(insert0.input).toBe(host);
    expect(insert0.output).toBe(insert2);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 * 3 + 2);
    expect(customer0.product).toBe(1 * 3 + 2);
    expect(customer1.product).toBe(1 * 3 + 2);

    // Add insert1 between insert0 and insert2
    // The insert multiplies the previous result by 4
    const insert1 = Insert.example({
      key: 'insert1',
      produce: (components, previousProduct, node) => previousProduct * 4,
      host,
      index: 1,
    });
    scm.flush();
    expect(host.inserts).toEqual([insert0, insert1, insert2]);
    expect(insert0.input).toBe(host);
    expect(insert0.output).toBe(insert1);
    expect(insert1.input).toBe(insert0);
    expect(insert1.output).toBe(insert2);
    expect(insert2.input).toBe(insert1);
    expect(insert2.output).toBe(host);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 * 3 * 4 + 2);
    expect(customer0.product).toBe(1 * 3 * 4 + 2);
    expect(customer1.product).toBe(1 * 3 * 4 + 2);

    // Add insert3 after insert2 adding ten
    const insert3 = Insert.example({
      key: 'insert3',
      produce: (components, previousProduct, node) => previousProduct + 10,
      host,
      index: 3,
    });
    scm.flush();
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
    expect(customer0.product).toBe(1 * 3 * 4 + 2 + 10);
    expect(customer1.product).toBe(1 * 3 * 4 + 2 + 10);

    // Remove insert node in the middle
    insert1.dispose();
    scm.flush();
    expect(host.inserts).toEqual([insert0, insert2, insert3]);
    expect(insert0.input).toBe(host);
    expect(insert0.output).toBe(insert2);
    expect(insert2.input).toBe(insert0);
    expect(insert2.output).toBe(insert3);
    expect(insert3.input).toBe(insert2);
    expect(insert3.output).toBe(host);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 * 3 + 2 + 10);
    expect(customer0.product).toBe(1 * 3 + 2 + 10);
    expect(customer1.product).toBe(1 * 3 + 2 + 10);

    // Remove first insert node
    insert0.dispose();
    scm.flush();
    expect(host.inserts).toEqual([insert2, insert3]);
    expect(insert2.input).toBe(host);
    expect(insert2.output).toBe(insert3);
    expect(insert3.input).toBe(insert2);
    expect(insert3.output).toBe(host);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 + 2 + 10);
    expect(customer0.product).toBe(1 + 2 + 10);
    expect(customer1.product).toBe(1 + 2 + 10);

    // Remove last insert node
    insert3.dispose();
    scm.flush();
    expect(host.inserts).toEqual([insert2]);
    expect(insert2.input).toBe(host);
    expect(insert2.output).toBe(host);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1 + 2);
    expect(customer0.product).toBe(1 + 2);
    expect(customer1.product).toBe(1 + 2);

    // Remove last remaining insert node
    insert2.dispose();
    scm.flush();
    expect(host.inserts).toEqual([]);
    expect(host.originalProduct).toBe(1);
    expect(host.product).toBe(1);
    expect(customer0.product).toBe(1);
    expect(customer1.product).toBe(1);
  });

  describe('should apply inserts correctly', () => {
    it('with one insert', () => {
      const scope = Scope.example();
      const scm = scope.scm;

      const host = new NodeBluePrint<number>({
        key: 'host',
        initialProduct: 1,
      }).instantiate({ scope });

      const insert = new NodeBluePrint<number>({
        key: 'insert0',
        initialProduct: 0,
        produce: (components, previousProduct, node) => {
          return previousProduct * 10;
        },
      }).instantiateAsInsert({ host });

      // The product of the host should be multiplied by 10
      scm.flush();
      expect(insert.product).toBe(10);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(10);

      // Change the host product
      host.product = 2;
      scm.flush();
      expect(insert.product).toBe(20);
      expect(host.originalProduct).toBe(2);
      expect(host.product).toBe(20);
    });

    it('with two inserts', () => {
      const scope = Scope.example();
      const scm = scope.scm;
      const host = new NodeBluePrint<number>({
        key: 'host',
        initialProduct: 1,
      }).instantiate({ scope });

      const insert0 = new NodeBluePrint<number>({
        key: 'insert0',
        initialProduct: 0,
        produce: (components, previousProduct, node) => {
          return previousProduct * 10;
        },
      }).instantiateAsInsert({ host });

      const insert1 = new NodeBluePrint<number>({
        key: 'insert1',
        initialProduct: 0,
        produce: (components, previousProduct, node) => {
          return previousProduct * 10;
        },
      }).instantiateAsInsert({ host });

      // The product of the host should be multiplied by 10
      scm.flush();
      expect(insert0.product).toBe(10);
      expect(insert1.product).toBe(100);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(100);

      // Change the host product
      host.product = 2;
      scm.flush();
      expect(insert0.product).toBe(20);
      expect(insert1.product).toBe(200);
      expect(host.originalProduct).toBe(2);
      expect(host.product).toBe(200);
    });

    it('with a insert that has suppliers', () => {
      const scope = Scope.example();
      const scm = scope.scm;

      // Create a host node
      const host = new NodeBluePrint<number>({
        key: 'host',
        initialProduct: 1,
      }).instantiate({ scope });

      // Add a customer to the host node
      const customer = host.bluePrint
        .forwardTo('customer')
        .instantiate({ scope });

      // Create a supplier that delivers a factor
      const factor = new NodeBluePrint<number>({
        key: 'factor',
        initialProduct: 10,
      }).instantiate({ scope });

      // Create a insert that multiplies the product with the factor
      const insert0 = new NodeBluePrint<number>({
        key: 'insert0',
        initialProduct: 0,
        suppliers: ['factor'],
        produce: (components, previousProduct, node) => {
          const factor = components[0] as number;
          return previousProduct * factor;
        },
      }).instantiateAsInsert({ host });

      // Initially the product of the host should be multiplied by 10
      // because the factor is 10
      scm.flush();
      expect(host.customers).toEqual([customer]);
      expect(insert0.product).toBe(10);
      expect(host.originalProduct).toBe(1);
      expect(host.product).toBe(10);
      expect(customer.product).toBe(10);

      // Change the host's original product
      host.product = 2;
      scm.flush();
      expect(insert0.product).toBe(20);
      expect(host.originalProduct).toBe(2);
      expect(host.product).toBe(20);
      expect(customer.product).toBe(20);

      // Change the factor which will modify the way, the insert calculates
      factor.product = 100;
      scm.flush();
      expect(insert0.product).toBe(200);
      expect(host.originalProduct).toBe(2);
      expect(host.product).toBe(200);
      expect(customer.product).toBe(200);
    });
  });

  describe('should throw', () => {
    it('when index is too big', () => {
      const host = Node.example();
      NodeBluePrint.example({ key: 'insert0' }).instantiateAsInsert({ host });

      let error: unknown;
      try {
        NodeBluePrint.example({ key: 'insert1' }).instantiateAsInsert({
          host,
          index: 2,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as ArgumentError).message).toBe(
        'Insert index 2 is out of range.',
      );
    });

    it('when index is too small', () => {
      const host = Node.example();

      let error: unknown;
      try {
        NodeBluePrint.example({ key: 'insert0' }).instantiateAsInsert({
          host,
          index: -1,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as ArgumentError).message).toBe(
        'Insert index -1 is out of range.',
      );
    });
  });
});
