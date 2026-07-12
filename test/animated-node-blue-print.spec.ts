// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

// NOTE(port): `Scm` is imported from its source file first (before the barrel
// `../src/index.ts`). See the note in test/scm.spec.ts.
import '../src/scm.ts';
import {
  AnimatedNode,
  AnimatedNodeBluePrint,
  ArgumentError,
  NodeBluePrint,
  Scope,
  StateError,
  doNothing,
  linearCurve,
} from '../src/index.ts';

import type { Produce } from '../src/index.ts';

describe('linearCurve', () => {
  it('returns its input unchanged', () => {
    expect(linearCurve(0.0)).toBe(0.0);
    expect(linearCurve(0.5)).toBe(0.5);
    expect(linearCurve(1.0)).toBe(1.0);
  });
});

describe('AnimatedNodeBluePrint', () => {
  const doubleBluePrint = (
    options: { suppliers?: string[]; totalFrames?: number } = {},
  ): AnimatedNodeBluePrint<number> =>
    new AnimatedNodeBluePrint<number>({
      key: 'smooth',
      initialProduct: 0.0,
      suppliers: options.suppliers ?? ['target'],
      totalFrames: options.totalFrames ?? 4,
      curve: linearCurve,
      lerp: (a, b, t) => a + (b - a) * t,
    });

  it('is a NodeBluePrint that enables change gating by default', () => {
    const bluePrint = doubleBluePrint({ totalFrames: 3 });
    expect(bluePrint).toBeInstanceOf(NodeBluePrint);
    expect(bluePrint.totalFrames).toBe(3);
    expect(bluePrint.propagateOnChangeOnly).toBe(true);
    expect(bluePrint.changeComparator).not.toBeUndefined();
  });

  it('uses === for change detection by default', () => {
    const bluePrint = doubleBluePrint();
    expect(bluePrint.isEqual(1.0, 1.0)).toBe(true);
    expect(bluePrint.isEqual(1.0, 2.0)).toBe(false);
  });

  it('accepts a custom equals', () => {
    const bluePrint = new AnimatedNodeBluePrint<number>({
      key: 'smooth',
      initialProduct: 0.0,
      suppliers: ['target'],
      totalFrames: 4,
      curve: linearCurve,
      lerp: (a, b, t) => a + (b - a) * t,
      equals: (a, b) => Math.abs(a - b) < 0.5,
    });
    expect(bluePrint.isEqual(1.0, 1.2)).toBe(true);
    expect(bluePrint.isEqual(1.0, 2.0)).toBe(false);
  });

  describe('check', () => {
    it('throws unless there is exactly one supplier', () => {
      expect(() => doubleBluePrint({ suppliers: [] }).check()).toThrow(
        ArgumentError,
      );
      expect(() => doubleBluePrint({ suppliers: ['a', 'b'] }).check()).toThrow(
        ArgumentError,
      );
    });

    it('throws if totalFrames < 1', () => {
      expect(() => doubleBluePrint({ totalFrames: 0 }).check()).toThrow(
        ArgumentError,
      );
    });

    it('accepts a valid configuration', () => {
      expect(() => doubleBluePrint({ totalFrames: 1 }).check()).not.toThrow();
    });
  });

  describe('createNode', () => {
    it('creates an AnimatedNode', () => {
      const scope = Scope.example();
      scope.mockContent({ target: 0.0 });
      expect(doubleBluePrint().createNode({ scope })).toBeInstanceOf(
        AnimatedNode,
      );
    });
  });

  describe('produce', () => {
    it('the installed produce function drives the animation', () => {
      const scope = Scope.example();
      const scm = scope.scm;
      scope.mockContent({
        target: 0.0,
        smooth: doubleBluePrint({ totalFrames: 2 }),
      });
      const target = scope.findNode<number>('target')!;
      const smooth = scope.findNode<number>('smooth')!;
      scm.flush();

      target.product = 1.0;
      scm.flush(); // frame 1 -> 0.5
      expect(smooth.product).toBeCloseTo(0.5, 9);
    });

    it('throws a descriptive error when attached to a plain node', () => {
      const scope = Scope.example();
      const scm = scope.scm;

      // 'smooth' is created as a PLAIN node here.
      scope.mockContent({ target: 0.0, smooth: 1.0 });
      const plain = scope.findNode<number>('smooth')!;
      expect(plain).not.toBeInstanceOf(AnimatedNode);

      plain.addBluePrint(doubleBluePrint());
      let error: unknown;
      try {
        scm.flush();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(StateError);
      expect((error as StateError).message).toContain(
        'must be instantiated as an AnimatedNode',
      );
    });
  });

  describe('copyWith', () => {
    it('preserves the animated subtype and config', () => {
      const copy = doubleBluePrint({ totalFrames: 6 }).copyWith({
        key: 'copy',
      });
      expect(copy).toBeInstanceOf(AnimatedNodeBluePrint);
      expect((copy as AnimatedNodeBluePrint<number>).totalFrames).toBe(6);

      // The copy instantiates as a working AnimatedNode.
      const scope = Scope.example();
      scope.mockContent({ target: 0.0 });
      expect(copy.instantiate({ scope })).toBeInstanceOf(AnimatedNode);
    });

    it('falls back to a plain blue print when produce is replaced', () => {
      const muted = doubleBluePrint().copyWith({
        produce: doNothing as Produce<number>,
        suppliers: [],
      });
      expect(muted).not.toBeInstanceOf(AnimatedNodeBluePrint);
      expect(muted.produce).toBe(doNothing as Produce<number>);
    });
  });

  describe('connectSupplier', () => {
    it('rewires the supplier while keeping the animation', () => {
      const connected = doubleBluePrint().connectSupplier('other.path');
      expect(connected).toBeInstanceOf(AnimatedNodeBluePrint);
      expect(connected.suppliers).toEqual(['other.path']);
    });
  });

  describe('instantiate', () => {
    it('returns the same AnimatedNode for the same key', () => {
      const scope = Scope.example();
      const bluePrint = doubleBluePrint();
      scope.mockContent({ target: 0.0, smooth: bluePrint });
      const n1 = scope.findNode<number>('smooth');
      const n2 = bluePrint.instantiate({ scope });
      expect(n1).toBe(n2);
      expect(n2).toBeInstanceOf(AnimatedNode);
    });

    it('is honored by Scope.findOrCreateNode', () => {
      const scope = Scope.example();
      scope.mockContent({ target: 0.0 });
      expect(scope.findOrCreateNode(doubleBluePrint())).toBeInstanceOf(
        AnimatedNode,
      );
    });
  });

  describe('forDouble', () => {
    it('interpolates linearly and enables gating', () => {
      const bluePrint = AnimatedNodeBluePrint.forDouble({
        key: 'smooth',
        initialProduct: 0.0,
        suppliers: ['target'],
        totalFrames: 4,
        curve: linearCurve,
      });
      expect(bluePrint.lerp(0.0, 10.0, 0.25)).toBeCloseTo(2.5, 9);
      expect(bluePrint.lerp(0.0, 10.0, 1.0)).toBeCloseTo(10.0, 9);
      expect(bluePrint.propagateOnChangeOnly).toBe(true);
    });

    it('treats NaN as equal to NaN', () => {
      const bluePrint = AnimatedNodeBluePrint.forDouble({
        key: 'smooth',
        initialProduct: 0.0,
        suppliers: ['target'],
        totalFrames: 4,
        curve: linearCurve,
      });
      expect(bluePrint.isEqual(Number.NaN, Number.NaN)).toBe(true);
      expect(bluePrint.isEqual(1.0, 1.0)).toBe(true);
      expect(bluePrint.isEqual(1.0, 2.0)).toBe(false);
    });
  });

  describe('forInt', () => {
    it('interpolates with rounding', () => {
      const bluePrint = AnimatedNodeBluePrint.forInt({
        key: 'smooth',
        initialProduct: 0,
        suppliers: ['target'],
        totalFrames: 4,
        curve: linearCurve,
      });
      expect(bluePrint.lerp(0, 10, 0.0)).toBe(0);
      expect(bluePrint.lerp(0, 10, 0.5)).toBe(5);
      expect(bluePrint.lerp(0, 10, 1.0)).toBe(10);
      expect(bluePrint.propagateOnChangeOnly).toBe(true);
    });
  });
});
