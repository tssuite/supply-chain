// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { writeGolden } from '@tssuite/golden';
import { describe, expect, it } from 'vitest';

import {
  NodeBluePrint,
  Scm,
  Scope,
  ScopeBluePrint,
} from '../../src/index.ts';

describe('Basic Tutorial', () => {
  it('runs the basics tutorial', async () => {
    // Create a supply chain manager. With isTest, changes apply on flush().
    const scm = new Scm({ isTest: true });

    // Create a root scope
    const rootScope = Scope.root({ key: 'root', scm });

    // Create a main scope
    const scopeBp = new ScopeBluePrint({ key: 'scope' });
    const scope = scopeBp.instantiate({ scope: rootScope });

    // Create a supplier node from a blue print
    const supplierBp = new NodeBluePrint<number>({
      initialProduct: 1,
      key: 'supplier',
    });
    const supplier = supplierBp.instantiate({ scope });

    // Create a customer node doubling the supplier's product
    const customerBp = new NodeBluePrint<number>({
      key: 'customer',
      initialProduct: 1,
      suppliers: ['supplier'],
      produce: (components) => (components[0] as number) * 2,
    });
    const customer = customerBp.instantiate({ scope });

    scm.flush();

    expect(supplier.product).toBe(1);
    expect(customer.product).toBe(1 * 2);

    // Change the supplier value and apply
    supplier.product = 5;
    scm.flush();

    expect(supplier.product).toBe(5);
    expect(customer.product).toBe(5 * 2);

    // Search a node just using the key. The first found scope is returned.
    expect(rootScope.findNode<number>('customer')).toBe(customer);
    expect(rootScope.findNode<number>('scope/customer')).toBe(customer);
    expect(rootScope.findNode<number>('root/scope/customer')).toBe(customer);
    expect(rootScope.findNode<number>('xyz')).toBeUndefined();

    // Scopes can be searched the same way.
    expect(customer.scope.findScope('scope')).toBe(scope);

    // Print node and scope graph
    const graph = scope.mermaid();
    await writeGolden('basic_01.mmd', graph);

    // Show all node paths of a scope
    const allNodePathes = rootScope.ls();
    await writeGolden('all_node_pathes.json', allNodePathes);
    expect(allNodePathes).toEqual(['scope', 'scope/supplier', 'scope/customer']);
  });
});
