// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { NodeBluePrint, Scope, ScopeBluePrint } from '../../src/index.ts';

describe('Debugging Tutorial', () => {
  it('lists node paths to set a conditional breakpoint', () => {
    // Create a supply chain
    const main = Scope.example();
    const scm = main.scm;

    // Create a supplier that delivers a number
    const supplier = new NodeBluePrint<number>({
      key: 'supplier',
      initialProduct: 1,
    }).instantiate({ scope: main });

    // A producer blue print which doubles the value provided by supplier
    const producer = new NodeBluePrint<number>({
      key: 'producer',
      initialProduct: 0,
      suppliers: ['supplier'],
      produce: (components) => (components[0] as number) * 2,
    });

    // Create three child scopes within main
    const child0 = new ScopeBluePrint({ key: 'child0' }).instantiate({
      scope: main,
    });
    const child1 = new ScopeBluePrint({ key: 'child1' }).instantiate({
      scope: main,
    });
    const child2 = new ScopeBluePrint({ key: 'child2' }).instantiate({
      scope: main,
    });

    // Within each child scope, instantiate a producer
    const producer0 = producer.instantiate({ scope: child0 });
    const producer1 = producer.instantiate({ scope: child1 });
    const producer2 = producer.instantiate({ scope: child2 });

    scm.flush();

    expect(supplier.product).toBe(1);
    expect(producer0.product).toBe(2);
    expect(producer1.product).toBe(2);
    expect(producer2.product).toBe(2);

    // List all node paths of the supply chain.
    expect(main.ls()).toEqual([
      'child0',
      'child0/producer',
      'child1',
      'child1/producer',
      'child2',
      'child2/producer',
      'supplier',
    ]);
  });
});
