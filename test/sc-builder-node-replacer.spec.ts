// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// TODO(port): src module-init-order bug in the disposed<->scm cycle. When
// `disposed.ts` is evaluated before `scm.ts` (which happens when entering
// through `../src/index.ts`, since the barrel exports disposed.ts before
// scm.ts), `scm.ts`'s static `testInstance = new Scm(...)` initializer runs
// `new Disposed(...)` while disposed.ts's class declaration has not executed
// yet -> "Disposed is not a constructor". Forcing `scm.ts` to evaluate first
// (as this side-effect import does) makes the cycle resolve correctly. The
// real fix belongs in src (e.g. make disposed.ts's `Scm` import type-only, or
// make `Scm.testInstance` lazy), which must not be edited here.
import '../src/scm.ts';
import { NodeBluePrint, ScBuilderNodeReplacer } from '../src/index.ts';

describe('ScBuilderNodeReplacer', () => {
  describe('example', () => {
    it('should work', () => {
      const builderNodeReplacer = ScBuilderNodeReplacer.example;
      const builder = builderNodeReplacer.builder;
      const scope = builder.scope;
      scope.scm.flush();

      // Get the nodes a,b and d, e out of the hierarchy
      const a = scope.findNode<number>('a')!;
      const b = scope.findNode<number>('b')!;
      const c = scope.findChildScope('c')!;
      const d = scope.findNode<number>('d')!;
      const e = scope.findNode<number>('e')!;
      const f = scope.findNode<string>('f')!;

      // Because of ExampleScBuilderReplacingIntNodes,
      // the nodes a, b, d, and e should be deliver 42
      expect(a.product).toBe(42);
      expect(b.product).toBe(42);
      expect(d.product).toBe(42);
      expect(e.product).toBe(42);
      expect(f.product).toBe('f');

      // ScBuilders should also be applied to nodes and scopes,
      // added after the builder was instantiated.
      // Lets add another two int nodes to scope  and c:
      // Both nodes should deliver 42 because the customer is applied
      const g = new NodeBluePrint<number>({
        key: 'g',
        initialProduct: 7,
      }).instantiate({ scope });

      const h = new NodeBluePrint<number>({
        key: 'h',
        initialProduct: 8,
      }).instantiate({ scope: c });

      scope.scm.flush();
      expect(g.product).toBe(42);
      expect(h.product).toBe(42);

      // Lets dispose the builder.
      // The nodes a, b, d, and e should be deliver 1, 2, 4, and 5 again
      builder.dispose();
      scope.scm.flush();

      expect(a.product).toBe(1);
      expect(b.product).toBe(2);
      expect(d.product).toBe(4);
      expect(e.product).toBe(5);
      expect(f.product).toBe('f');

      expect(builderNodeReplacer).not.toBeUndefined();
    });
  });
});
