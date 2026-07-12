// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it } from 'vitest';

// NOTE(port): `Scm` is imported from its source file first (before the barrel
// `../src/index.ts`). See the note in test/scm.spec.ts.
import { Scm } from '../src/scm.ts';
import {
  AnimatedNode,
  AnimatedNodeBluePrint,
  Node,
  NodeBluePrint,
  Priority,
  Scope,
  linearCurve,
  nbp,
} from '../src/index.ts';

let scope: Scope;
let scm: Scm;
let target: Node<number>;
let smooth: AnimatedNode<number>;

// .............................................................................
function build(
  options: { totalFrames?: number; curve?: (t: number) => number } = {},
): void {
  const totalFrames = options.totalFrames ?? 4;
  scope = Scope.example();
  scm = scope.scm;
  scope.mockContent({
    target: 0.0,
    smooth: AnimatedNodeBluePrint.forDouble({
      key: 'smooth',
      initialProduct: 0.0,
      suppliers: ['target'],
      totalFrames,
      curve: options.curve ?? linearCurve,
    }),
  });
  target = scope.findNode<number>('target')!;
  smooth = scope.findNode<number>('smooth')! as AnimatedNode<number>;
  scm.flush();
}

describe('AnimatedNode', () => {
  beforeEach(() => {
    Node.onChangeEnabled = false;
    Node.onRecursiveChangeEnabled = false;
  });

  describe('example', () => {
    it('creates a settled animated node', () => {
      const node = AnimatedNode.example();
      expect(node).toBeInstanceOf(AnimatedNode);
      expect(node.isAnimating).toBe(false);
    });
  });

  describe('startup', () => {
    it('snaps the first input without animating', () => {
      build();
      expect(smooth.product).toBe(0.0);
      expect(smooth.isAnimating).toBe(false);
      expect(scm.animatedNodes).not.toContain(smooth);
    });
  });

  describe('basic animation', () => {
    it(
      'ramps from the current output to the new input over the ' +
        'frames, one step per tick',
      () => {
        build({ totalFrames: 4 });

        target.product = 1.0;

        // The tick that delivers the new target already advances the first
        // frame - the animation starts moving immediately.
        scm.flush();
        expect(smooth.product).toBeCloseTo(0.25, 9);
        expect(smooth.isAnimating).toBe(true);
        expect(smooth.frame).toBe(1);

        // Each tick advances exactly one frame.
        scm.flush();
        expect(smooth.product).toBeCloseTo(0.5, 9);
        scm.flush();
        expect(smooth.product).toBeCloseTo(0.75, 9);

        // Final frame settles on the exact endpoint and stops animating.
        scm.flush();
        expect(smooth.product).toBeCloseTo(1.0, 9);
        expect(smooth.isAnimating).toBe(false);

        // Once settled, further ticks are no-ops.
        scm.flush();
        expect(smooth.product).toBeCloseTo(1.0, 9);
        expect(scm.animatedNodes).not.toContain(smooth);
      },
    );
  });

  describe('retargeting', () => {
    it('mid-animation retarget rebases from the current visible value', () => {
      build({ totalFrames: 4 });

      target.product = 1.0;
      scm.flush(); // 0.25
      scm.flush(); // 0.5
      expect(smooth.product).toBeCloseTo(0.5, 9);

      target.product = 3.0;
      scm.flush(); // rebase from 0.5 towards 3.0, first frame consumed
      expect(smooth.from).toBeCloseTo(0.5, 9);
      expect(smooth.to).toBeCloseTo(3.0, 9);
      expect(smooth.frame).toBe(1);
      expect(smooth.product).toBeCloseTo(1.125, 9); // 0.5 + 2.5 * 0.25

      scm.flush(); // 0.5 + 2.5 * 0.5 = 1.75
      expect(smooth.product).toBeCloseTo(1.75, 9);
    });

    it(
      'a target changing on every tick keeps easing toward the ' +
        'latest value',
      () => {
        build({ totalFrames: 4 });

        // Before the fix the restart branch never consumed a frame, so a
        // continuously moving target froze the output at 0.0 forever.
        for (let i = 1; i <= 8; i++) {
          target.product = i;
          scm.flush();
        }
        expect(smooth.product).toBeGreaterThan(0.0);
        expect(smooth.isAnimating).toBe(true);

        // Once the target stops moving, the animation settles on it.
        for (let i = 0; i < 4; i++) {
          scm.flush();
        }
        expect(smooth.product).toBeCloseTo(8.0, 9);
        expect(smooth.isAnimating).toBe(false);
      },
    );

    it('rewriting the same target does not restart the animation', () => {
      build({ totalFrames: 4 });

      target.product = 1.0;
      scm.flush(); // frame 1
      expect(smooth.frame).toBe(1);

      target.product = 1.0; // same value -> no retarget
      scm.flush();
      expect(smooth.isAnimating).toBe(true);
      expect(smooth.frame).toBe(2);
    });

    it(
      'a supplier re-emission between ticks does not consume a ' + 'frame',
      () => {
        build({ totalFrames: 4 });
        smooth.ownPriority = Priority.realtime;

        target.product = 1.0;
        scm.flush();
        const frameAfterTick = smooth.frame;

        // Re-emit the same value without a tick: realtime nodes produce
        // between ticks, but no frame may be consumed.
        target.product = 1.0;
        scm.flush({ tick: false });
        expect(smooth.frame).toBe(frameAfterTick);
        expect(smooth.isAnimating).toBe(true);
      },
    );

    it('retargeting between ticks restarts without consuming a frame', () => {
      build({ totalFrames: 4 });
      smooth.ownPriority = Priority.realtime;

      target.product = 1.0;
      scm.flush(); // frame 1 -> 0.25
      expect(smooth.product).toBeCloseTo(0.25, 9);

      // Retarget WITHOUT a tick: the animation rebases from the current
      // output but must not consume a frame yet.
      target.product = 2.0;
      scm.flush({ tick: false });
      expect(smooth.frame).toBe(0);
      expect(smooth.product).toBeCloseTo(0.25, 9);
      expect(smooth.isAnimating).toBe(true);

      // The next tick consumes the first frame toward the new target.
      scm.flush();
      expect(smooth.frame).toBe(1);
      expect(smooth.product).toBeCloseTo(0.25 + 1.75 * 0.25, 9);
    });

    it('retargeting to the current output value snaps and stops', () => {
      build({ totalFrames: 4 });

      let completeCount = 0;
      smooth.onComplete = () => completeCount++;

      target.product = 1.0;
      scm.flush(); // 0.25
      scm.flush(); // 0.5
      expect(smooth.product).toBeCloseTo(0.5, 9);

      // Retarget to the value currently on the output: from == to -> snap.
      target.product = 0.5;
      scm.flush();
      expect(smooth.isAnimating).toBe(false);
      expect(smooth.product).toBeCloseTo(0.5, 9);

      // The snap settles the frame counter: later same-value rewrites must
      // not advance a phantom animation or fire onComplete spuriously.
      for (let i = 0; i < 6; i++) {
        target.product = 0.5;
        scm.flush();
      }
      expect(completeCount).toBe(0);
      expect(smooth.isAnimating).toBe(false);
      expect(smooth.product).toBeCloseTo(0.5, 9);
    });
  });

  describe('settled', () => {
    it('an unchanged input on a settled node keeps the settled value', () => {
      build({ totalFrames: 4 });

      target.product = 1.0;
      for (let i = 0; i < 6; i++) {
        scm.flush();
      }
      expect(smooth.isAnimating).toBe(false);
      expect(smooth.product).toBeCloseTo(1.0, 9);

      // Rewriting the same target re-produces the node while it is settled.
      target.product = 1.0;
      scm.flush();
      expect(smooth.product).toBeCloseTo(1.0, 9);
      expect(smooth.isAnimating).toBe(false);
    });
  });

  describe('curve', () => {
    it('applies the animation curve', () => {
      build({ totalFrames: 4, curve: (t) => t * t });

      target.product = 1.0;
      scm.flush(); // frame 1: t = 0.25, curve = 0.0625
      expect(smooth.product).toBeCloseTo(0.0625, 9);
    });
  });

  describe('NaN safety', () => {
    it('two identical NaN inputs do not restart on every tick', () => {
      build({ totalFrames: 4 });

      target.product = Number.NaN;
      scm.flush();
      expect(smooth.frame).toBe(1);

      // NaN === NaN is false; the NaN-aware comparator must treat it as
      // unchanged so the animation advances instead of restarting.
      scm.flush();
      expect(smooth.frame).toBe(2);
    });
  });

  describe('completion', () => {
    it('onComplete fires exactly once when the animation settles', () => {
      build({ totalFrames: 4 });

      let completeCount = 0;
      smooth.onComplete = () => completeCount++;

      target.product = 1.0;
      for (let i = 0; i < 10; i++) {
        scm.flush();
      }

      expect(smooth.product).toBeCloseTo(1.0, 9);
      expect(completeCount).toBe(1);
    });

    it(
      'onComplete observes the settled product and may dispose the ' + 'node',
      () => {
        build({ totalFrames: 4 });

        let productSeenInCallback: number | undefined;
        smooth.onComplete = () => {
          productSeenInCallback = smooth.product;
          smooth.dispose();
        };

        target.product = 1.0;
        for (let i = 0; i < 10; i++) {
          scm.flush();
        }

        // The callback ran after the final product was applied and the
        // production was finalized - disposing did not crash the pipeline.
        expect(productSeenInCallback).toBeCloseTo(1.0, 9);
        expect(smooth.isDisposed).toBe(true);
      },
    );
  });

  describe('disposal', () => {
    it('a disposed animating node is removed from the animated set', () => {
      build({ totalFrames: 4 });

      // Give smooth a customer so dispose parks it (does not erase it).
      scope.mockContent({
        downstream: nbp({
          from: ['smooth'],
          to: 'downstream',
          init: 0.0,
          produce: (c) => c[0] as number,
        }),
      });
      scm.flush();

      target.product = 1.0;
      scm.flush();
      expect(smooth.isAnimating).toBe(true);
      expect(scm.animatedNodes).toContain(smooth);

      smooth.dispose();
      expect(scm.animatedNodes).not.toContain(smooth);

      // Ticking must not resurrect it or stall the pipeline.
      for (let i = 0; i < 20; i++) {
        scm.flush();
      }
      expect(scm.animatedNodes).not.toContain(smooth);
    });
  });

  describe('independent instances', () => {
    it('the same blue print animates independently in two scopes', () => {
      const bluePrint = AnimatedNodeBluePrint.forDouble({
        key: 'smooth',
        initialProduct: 0.0,
        suppliers: ['target'],
        totalFrames: 4,
        curve: linearCurve,
      });

      const scopeA = Scope.example();
      scopeA.mockContent({ target: 0.0, smooth: bluePrint });
      const scopeB = Scope.example();
      scopeB.mockContent({ target: 0.0, smooth: bluePrint });

      const targetA = scopeA.findNode<number>('target')!;
      const targetB = scopeB.findNode<number>('target')!;
      const smoothA = scopeA.findNode<number>('smooth')! as AnimatedNode<number>;
      const smoothB = scopeB.findNode<number>('smooth')! as AnimatedNode<number>;
      scopeA.scm.flush();
      scopeB.scm.flush();

      targetA.product = 1.0;
      targetB.product = 10.0;
      scopeA.scm.flush(); // frame 1
      scopeB.scm.flush();

      expect(smoothA.product).toBeCloseTo(0.25, 9);
      expect(smoothB.product).toBeCloseTo(2.5, 9);
    });
  });

  describe('live blue print replacement', () => {
    it('a replacement animated blue print applies its config', () => {
      build({ totalFrames: 4 });

      // Overlay the same node with a longer animation.
      smooth.addBluePrint(
        AnimatedNodeBluePrint.forDouble({
          key: 'smooth',
          initialProduct: 0.0,
          suppliers: ['target'],
          totalFrames: 12,
          curve: linearCurve,
        }),
      );
      scm.flush();

      target.product = 1.0;
      scm.flush();
      expect(smooth.product).toBeCloseTo(1.0 / 12.0, 9);
    });

    it('mockedProduct stops the animation', () => {
      build({ totalFrames: 4 });

      target.product = 1.0;
      scm.flush();
      expect(smooth.isAnimating).toBe(true);

      smooth.mockedProduct = 9.0;
      scm.flush();
      expect(smooth.isAnimating).toBe(false);
      expect(scm.animatedNodes).not.toContain(smooth);
      expect(smooth.product).toBe(9.0);
      expect(smooth.mockedProduct).toBe(9.0);

      // Un-mocking leaves the settled state untouched.
      smooth.mockedProduct = undefined;
      scm.flush();
      expect(smooth.isAnimating).toBe(false);
      expect(smooth.mockedProduct).toBeUndefined();
    });

    it('overlaying a non-animated blue print stops the animation', () => {
      build({ totalFrames: 4 });

      target.product = 1.0;
      scm.flush();
      expect(smooth.isAnimating).toBe(true);

      const overlay = nbp({
        from: ['target'],
        to: 'smooth',
        init: 0.0,
        produce: (c) => c[0] as number,
      });
      smooth.addBluePrint(overlay);
      scm.flush();
      expect(smooth.isAnimating).toBe(false);
      expect(scm.animatedNodes).not.toContain(smooth);

      // Removing the overlay restores the animated blue print; the next
      // target change animates again.
      smooth.removeBluePrint(overlay);
      scm.flush();
      target.product = 2.0;
      scm.flush();
      expect(smooth.isAnimating).toBe(true);
    });
  });

  describe('generic types', () => {
    it('animates an int with rounded interpolation', () => {
      const scope = Scope.example();
      const scm = scope.scm;
      scope.mockContent({
        target: 0,
        smooth: AnimatedNodeBluePrint.forInt({
          key: 'smooth',
          initialProduct: 0,
          suppliers: ['target'],
          totalFrames: 4,
          curve: linearCurve,
        }),
      });
      const target = scope.findNode<number>('target')!;
      const smooth = scope.findNode<number>('smooth')! as AnimatedNode<number>;
      scm.flush();

      target.product = 8;
      scm.flush(); // round(8 * 0.25) = 2
      expect(smooth.product).toBe(2);
      scm.flush(); // round(8 * 0.5) = 4
      expect(smooth.product).toBe(4);
      scm.flush(); // round(8 * 0.75) = 6
      scm.flush(); // settle
      expect(smooth.product).toBe(8);
    });
  });

  describe('downstream propagation', () => {
    it(
      'customers observe every intermediate frame, but the redundant ' +
        'restart frame is gated',
      () => {
        const scope = Scope.example();
        const scm = scope.scm;
        const recorded: number[] = [];
        scope.mockContent({
          target: 0.0,
          smooth: AnimatedNodeBluePrint.forDouble({
            key: 'smooth',
            initialProduct: 0.0,
            suppliers: ['target'],
            totalFrames: 4,
            curve: linearCurve,
          }),
          recorder: nbp({
            from: ['smooth'],
            to: 'recorder',
            init: 0.0,
            produce: (c) => {
              recorded.push(c[0] as number);
              return c[0] as number;
            },
          }),
        });
        const target = scope.findNode<number>('target')!;
        scm.flush();

        recorded.length = 0;
        target.product = 1.0;
        for (let i = 0; i < 6; i++) {
          scm.flush();
        }

        // The recorder sees exactly the four value-changing frames - no
        // redundant restart emission.
        expect(recorded).toHaveLength(4);
        expect(recorded[0]).toBeCloseTo(0.25, 9);
        expect(recorded[1]).toBeCloseTo(0.5, 9);
        expect(recorded[2]).toBeCloseTo(0.75, 9);
        expect(recorded[3]).toBeCloseTo(1.0, 9);
      },
    );
  });
});

describe('NodeBluePrint.propagateOnChangeOnly', () => {
  it('an unchanged product does not schedule the node customers', () => {
    const scope = Scope.example();
    const scm = scope.scm;
    scope.mockContent({
      a: 5,
      gated: new NodeBluePrint<number>({
        key: 'gated',
        initialProduct: 0,
        suppliers: ['a'],
        produce: (c) => ((c[0] as number) < 10 ? 7 : 99),
        propagateOnChangeOnly: true,
      }),
      counter: nbp({
        from: ['gated'],
        to: 'counter',
        init: 0,
        produce: (_c, p: number) => p + 1,
      }),
    });
    const a = scope.findNode<number>('a')!;
    const counter = scope.findNode<number>('counter')!;
    scm.flush();
    const produced = counter.product;

    // 'gated' stays 7 -> customer must not be scheduled again.
    a.product = 6;
    scm.flush();
    expect(counter.product).toBe(produced);

    // 'gated' changes to 99 -> customer is scheduled.
    a.product = 15;
    scm.flush();
    expect(counter.product).toBe(produced + 1);
  });

  it(
    'the first production always propagates, even if it equals the ' +
      'initial product',
    () => {
      const scope = Scope.example();
      const scm = scope.scm;
      scope.mockContent({
        a: 0,
        gated: new NodeBluePrint<number>({
          key: 'gated',
          initialProduct: 7,
          suppliers: ['a'],
          produce: () => 7,
          propagateOnChangeOnly: true,
        }),
        sink: nbp({
          from: ['gated'],
          to: 'sink',
          init: -1,
          produce: (c) => c[0] as number,
        }),
      });
      const sink = scope.findNode<number>('sink')!;
      scm.flush();
      expect(sink.product).toBe(7);
    },
  );
});
