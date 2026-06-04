// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { NodeBluePrint } from './node-blue-print.ts';
import { ScopeBluePrint } from './scope-blue-print.ts';

import type { Produce } from './node.ts';

/**
 * A node producing scope blue prints depending on components provided by
 * suppliers.
 */
export class ScopeBluePrintFactory extends NodeBluePrint<ScopeBluePrint[]> {
  /**
   * Constructor.
   * @param params - Key, suppliers, optional initial product and produce.
   */
  constructor(params: {
    key: string;
    suppliers: readonly string[];
    initialProduct?: ScopeBluePrint[];
    produce: Produce<ScopeBluePrint[]>;
  }) {
    super({
      key: params.key,
      suppliers: params.suppliers,
      initialProduct: params.initialProduct ?? [],
      produce: params.produce,
    });
  }

  /**
   * Example instance for test purposes: a factory that turns a list of row
   * heights into a list of scopes, one per row.
   */
  static example(): ScopeBluePrintFactory {
    return new ScopeBluePrintFactory({
      key: 'scopeFactory',
      suppliers: ['rowHeights'],
      produce: (components: unknown[]) => {
        const rowHeights = components[0] as number[];
        const resultScopes: ScopeBluePrint[] = [];

        let i = 0;
        for (const rowHeight of rowHeights) {
          const iCopy = i;

          const rowHeightNode = new NodeBluePrint<number>({
            key: 'rowHeight',
            initialProduct: rowHeight,
            suppliers: ['rowHeights'],
            produce: (innerComponents: unknown[]) =>
              (innerComponents[0] as number[])[iCopy],
          });

          const scope = new ScopeBluePrint({
            key: `row${iCopy}`,
            nodes: [rowHeightNode],
          });

          resultScopes.push(scope);
          i++;
        }

        return resultScopes;
      },
    });
  }
}
