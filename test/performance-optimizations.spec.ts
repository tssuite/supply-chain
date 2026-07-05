// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// NOTE(port): `Scm` is imported from its source file first (before the barrel
// `../src/index.ts`). See the note in scm.spec.ts.
import { Scm } from '../src/scm.ts';
import { Node, NodeBluePrint, Priority, Scope, nbp } from '../src/index.ts';

describe('Performance optimizations', () => {
  describe('ready queues', () => {
    // Note: the fallback scan for nodes entering preparedNodes directly
    // is tested in scm.spec.ts ('produce fallback' group).

    it('should re-bucket nodes whose priority changed while ready', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      scope.mockContent({
        supplier: 0,
        customer: nbp({
          from: ['supplier'],
          to: 'customer',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      });
      scm.flush();

      const supplier = scope.findNode<number>('supplier')!;

      // Nominate the supplier and prepare it.
      // It enters the frame priority ready queue.
      scm.nominate(supplier);
      scm.testRunFastTasks();
      expect(scm.preparedNodes).toContain(supplier);

      // Raise the priority to realtime and process the priority update
      supplier.ownPriority = Priority.realtime;
      scm.testRunFastTasks();

      // Production must pick the supplier from the realtime bucket -
      // without a tick() lowering the minimum production priority.
      scm.testRunNormalTasks();
      expect(scm.preparedNodes).not.toContain(supplier);

      scm.flush({ tick: false });
      expect(supplier.isReady).toBe(true);
    });

    it('should remove disposed nodes from preparedNodes immediately', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      scope.mockContent({
        supplier: 0,
        middle: nbp({
          from: ['supplier'],
          to: 'middle',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        customer: nbp({
          from: ['middle'],
          to: 'customer',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      });
      scm.flush();

      const middle = scope.findNode<number>('middle')!;

      // Prepare the middle node (it has a customer, so it will not be
      // erased on dispose)
      scm.nominate(middle);
      scm.testRunFastTasks();
      expect(scm.preparedNodes).toContain(middle);

      // Disposing must remove it from preparedNodes right away
      middle.dispose();
      expect(scm.preparedNodes).not.toContain(middle);

      scm.flush();
    });
  });

  describe('timeout check timer', () => {
    it('should reuse one timer across production cycles', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      scope.mockContent({
        supplier: 0,
        middle: nbp({
          from: ['supplier'],
          to: 'middle',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        customer: nbp({
          from: ['middle'],
          to: 'customer',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      });
      scm.flush();

      const supplier = scope.findNode<number>('supplier')!;
      supplier.product = 1;

      // Step through the production waves manually and make sure the
      // timeout check timer stays the same instance. Previously every
      // production cycle created (and leaked) a new periodic timer.
      let firstTimer: unknown;
      let guard = 0;
      scm.tick();
      while (
        scm.testFastTasksList.length > 0 ||
        scm.testNormalTasksList.length > 0
      ) {
        scm.testRunFastTasks();
        scm.testRunNormalTasks();

        const timer = scm.testTimer;
        if (timer !== undefined) {
          firstTimer ??= timer;
          expect(timer === firstTimer).toBe(true);
        }

        expect(++guard < 100).toBe(true);
      }

      // A timer was created and cleaned up after the pipeline drained
      expect(firstTimer).toBeDefined();
      expect(scm.testTimer).toBeUndefined();
    });
  });

  describe('topological ranks', () => {
    it('should support suppliers created after their customers', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      // The customer is created first, the supplier afterwards. The edge
      // therefore violates the creation order and triggers a local
      // topological reordering.
      const customer = new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          key: 'customer',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce: (c) => (c[0] as number) + 1,
        }),
        scope,
      });

      const supplier = new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          key: 'supplier',
          initialProduct: 5,
        }),
        scope,
      });

      scm.flush();
      expect(customer.product).toBe(6);

      supplier.product = 10;
      scm.flush();
      expect(customer.product).toBe(11);
    });

    it('should detect circular dependencies via backward edges', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          key: 'a',
          initialProduct: 0,
          suppliers: ['b'],
          produce: (c) => (c[0] as number) + 1,
        }),
        scope,
      });

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({
          key: 'b',
          initialProduct: 0,
          suppliers: ['a'],
          produce: (c) => (c[0] as number) + 1,
        }),
        scope,
      });

      expect(() => scm.flush()).toThrowError(/Circular dependency detected:/);
    });

    it('should detect circular dependencies in diamond graphs', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      // Diamond: top -> left/right -> bottom.
      // Then try to make bottom a supplier of top.
      scope.mockContent({
        top: nbp({
          from: ['bottom'],
          to: 'top',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        left: nbp({
          from: ['top'],
          to: 'left',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        right: nbp({
          from: ['top'],
          to: 'right',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        bottom: nbp({
          from: ['left', 'right'],
          to: 'bottom',
          init: 0,
          produce: (c) => (c[0] as number) + (c[c.length - 1] as number),
        }),
      });

      expect(() => scm.flush()).toThrowError(/Circular dependency detected:/);
    });

    it('should reorder diamond regions when a late supplier connects', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      // Build a diamond first: top -> left/right -> bottom
      scope.mockContent({
        top: 0,
        left: nbp({
          from: ['top'],
          to: 'left',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        right: nbp({
          from: ['top'],
          to: 'right',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
        bottom: nbp({
          from: ['left', 'right'],
          to: 'bottom',
          init: 0,
          produce: (c) => (c[0] as number) + (c[1] as number),
        }),
      });
      scm.flush();

      // Then create a late supplier chain w -> z
      scope.mockContent({
        w: 0,
        z: nbp({
          from: ['w'],
          to: 'z',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      });
      scm.flush();

      // Connect z as a supplier of top. z and w were created after the
      // diamond, so the new edge violates the creation order: the whole
      // diamond region must be reordered behind the two-node supplier
      // chain w -> z.
      const top = scope.findNode<number>('top')!;
      top.addBluePrint(
        nbp({
          from: ['z'],
          to: 'top',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      );
      scm.flush();

      const w = scope.findNode<number>('w')!;
      const bottom = scope.findNode<number>('bottom')!;

      w.product = 10;
      scm.flush();

      // w=10 -> z=11 -> top=12 -> left=13, right=13 -> bottom=26
      expect(bottom.product).toBe(26);
    });

    it('should connect a supplier only once when two paths resolve to it', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      // Both supplier paths 'a' and 'b/a' resolve to the same node.
      scope.mockContent({
        b: { a: 1 },
        customer: nbp({
          from: ['a', 'b/a'],
          to: 'customer',
          init: 0,
          produce: (c) => (c[0] as number) + 1,
        }),
      });
      scm.flush();

      const customer = scope.findNode<number>('customer')!;
      expect(customer.suppliers.length).toBe(1);
      expect(customer.product).toBe(2);
    });

    it('should handle chains of many thousand nodes', () => {
      // The previous implementation overflowed the stack when preparing
      // chains of ~8000 nodes and needed quadratic time to build them.
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });
      const n = 10000;

      new Node<number>({
        bluePrint: new NodeBluePrint<number>({ key: 'n0', initialProduct: 0 }),
        scope,
      });

      for (let i = 1; i < n; i++) {
        new Node<number>({
          bluePrint: new NodeBluePrint<number>({
            key: `n${i}`,
            initialProduct: 0,
            suppliers: [`n${i - 1}`],
            produce: (c) => (c[0] as number) + 1,
          }),
          scope,
        });
      }

      scm.flush();

      const first = scope.findNode<number>('n0')!;
      const last = scope.findNode<number>(`n${n - 1}`)!;
      expect(last.product).toBe(n - 1);

      first.product = 1;
      scm.flush();
      expect(last.product).toBe(n);
    });
  });

  describe('Scope.nodeByKey', () => {
    it('should return the node with the exact key or undefined', () => {
      const scm = new Scm({ isTest: true });
      const scope = Scope.root({ key: 'root', scm });

      scope.mockContent({ supplier: 0 });
      scm.flush();

      const supplier = scope.findNode<number>('supplier')!;
      expect(scope.nodeByKey('supplier')).toBe(supplier);
      expect(scope.nodeByKey('unknown')).toBeUndefined();
    });
  });
});
