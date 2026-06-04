// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// NOTE: `Scm` must be imported (evaluated) before the barrel `../src/index.ts`.
// `disposed.ts` imports `scm.ts`, and `Scm`'s static initializer
// (`Scm.testInstance`) calls `new Disposed(...)`. Importing the barrel first
// evaluates `disposed.ts` before `scm.ts` and crashes with "Disposed is not a
// constructor". See the same workaround in test/disposed.spec.ts and the
// reported src/ issue on index.ts ordering.
import { Scm } from '../src/scm.ts';
import { NodeBluePrint, ScBuilderInserts } from '../src/index.ts';

void Scm;

describe('ScBuilderInserts', () => {
  describe('should recursively iterate all nodes of the host scope', () => {
    it('and add the inserts as defined in the builder', () => {
      // Look into [ExampleScBuilderBluePrint] to see the node hierarchy
      // used for this example
      const inserts = ScBuilderInserts.example();
      const builder = inserts.builder;
      const scope = builder.scope;

      // Get the nodes out of the example hierarchy
      const hostA = scope.findNode<number>('hostA')!;
      const hostB = scope.findNode<number>('hostB')!;
      const hostC = scope.findNode<number>('hostC')!;
      const other = scope.findNode<number>('other')!;

      // All nodes having a key starting with "host" should have two inserts
      // added by ExampleScBuilderBluePrint
      expect(hostA.inserts).toHaveLength(2);
      expect(hostA.inserts[0].key).toBe('p0Add111'); // Parent
      expect(hostA.inserts[1].key).toBe('p1MultiplyByTen'); // Parent

      // ScopeB should have 1 additional insert,
      expect(hostB.inserts).toHaveLength(2 + 1);

      // Root builders a added first, followed by child builders
      expect(hostB.inserts[0].key).toBe('p0Add111'); // Parent
      expect(hostB.inserts[1].key).toBe('p1MultiplyByTen');
      expect(hostB.inserts[2].key).toBe('c0MultiplyByTwo'); // Child

      expect(hostC.inserts).toHaveLength(2 + 1);

      // Nodes not starting with 'host' should not have inserts
      expect(other.inserts).toHaveLength(0);

      // The values should be calculated correctly
      const initialA = hostA.bluePrint.initialProduct;
      const productA = hostA.product;
      expect(productA).toBe((initialA + 111) * 10);

      const initialB = hostB.bluePrint.initialProduct;
      const productB = hostB.product;
      expect(productB).toBe((initialB + 111) * 10 * 2);

      const initialC = hostC.bluePrint.initialProduct;
      const productC = hostC.product;
      expect(productC).toBe((initialC + 111) * 10 * 2);

      // Add another node to the scope
      const hostD = new NodeBluePrint<number>({
        key: 'hostD',
        initialProduct: 0,
      }).instantiate({ scope });
      expect(hostD.inserts.length).toBeGreaterThan(0);

      // Finally let's dispose the builder
      builder.dispose();
      builder.scope.scm.flush();

      // Now the inserts should be removed from all nodes
      expect(hostA.inserts).toHaveLength(0);
      expect(hostB.inserts).toHaveLength(0);
      expect(hostC.inserts).toHaveLength(0);

      // And the nodes should deliver their normal products
      expect(hostA.product).toBe(initialA);
      expect(hostB.product).toBe(initialB);
      expect(hostC.product).toBe(initialC);
    });
  });
});
