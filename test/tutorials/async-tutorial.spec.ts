// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import {
  Duration,
  NodeBluePrint,
  Scm,
  Scope,
  ScopeBluePrint,
} from '../../src/index.ts';
import { deferred } from '../helpers/deferred.ts';

describe('Async Tutorial', () => {
  it('keeps customers waiting until the async producer resolves', async () => {
    const scm = new Scm({ isTest: true });
    const rootScope = Scope.root({ key: 'root', scm });
    const scope = new ScopeBluePrint({ key: 'scope' }).instantiate({
      scope: rootScope,
    });

    // An asynchronous supplier: produce returns a Promise.
    const completer = deferred<number>();
    const supplier = new NodeBluePrint<number>({
      key: 'supplier',
      initialProduct: 0,
      produce: () => completer.promise,
    }).instantiate({ scope });

    // A customer doubling the supplier's product.
    const customer = new NodeBluePrint<number>({
      key: 'customer',
      initialProduct: 0,
      suppliers: ['supplier'],
      produce: (components) => (components[0] as number) * 2,
    }).instantiate({ scope });

    scm.flush();

    // The supplier is still producing — products keep their initial values.
    expect(supplier.product).toBe(0);
    expect(customer.product).toBe(0);

    // Resolve the asynchronous production and settle the chain.
    completer.resolve(21);
    await scm.settle();

    expect(supplier.product).toBe(21);
    expect(customer.product).toBe(42);

    // A node with a longer productionTimeout delivers in a single update.
    const slow = new NodeBluePrint<number>({
      key: 'slowSupplier',
      initialProduct: 0,
      productionTimeout: new Duration({ seconds: 10 }),
      produce: async () => 7,
    }).instantiate({ scope });
    await scm.settle();
    expect(slow.product).toBe(7);
  });
});
