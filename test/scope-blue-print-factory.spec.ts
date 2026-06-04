// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import {
  Node,
  Scope,
  ScopeBluePrint,
  ScopeBluePrintFactory,
} from '../src/index.ts';

describe('ScopeBluePrintFactory', () => {
  // A manager creating a row scope for each row
  const factory = ScopeBluePrintFactory.example();

  describe('example', () => {
    describe('produce()', () => {
      it('should turn components into a list of Scopes', () => {
        const scope = Scope.example();
        const factoryInstance = factory.instantiate({ scope });

        // produce returns FutureOr; the example is synchronous.
        const rowHeights = [10, 20, 30];
        const rowScopes = factory.produce(
          [rowHeights],
          [],
          factoryInstance,
        ) as ScopeBluePrint[];
        expect(rowScopes).toHaveLength(3);

        // Each scope should have a "rowHeight" node producing the row height.
        let i = 0;
        for (const rowScope of rowScopes) {
          const rowHeightNode = rowScope.node<number>('rowHeight')!;
          const dummy = Node.example();
          expect(rowHeightNode.produce([rowHeights], 0, dummy)).toBe(
            rowHeights[i],
          );
          i++;
        }
      });
    });
  });
});
