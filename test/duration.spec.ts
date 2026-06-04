// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { Duration } from '../src/duration.ts';

describe('Duration', () => {
  it('zero has no microseconds', () => {
    expect(Duration.zero.inMicroseconds).toBe(0);
  });

  it('computes microseconds from all components', () => {
    const d = new Duration({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      milliseconds: 5,
      microseconds: 6,
    });
    const expected =
      (((1 * 24 + 2) * 60 + 3) * 60 + 4) * 1_000_000 + 5 * 1000 + 6;
    expect(d.inMicroseconds).toBe(expected);
  });

  it('creates from raw microseconds, milliseconds and seconds', () => {
    expect(Duration.fromMicroseconds(1500).inMicroseconds).toBe(1500);
    expect(Duration.milliseconds(5).inMicroseconds).toBe(5000);
    expect(Duration.seconds(2).inMicroseconds).toBe(2_000_000);
  });

  it('truncates inMilliseconds and inSeconds toward zero', () => {
    const d = Duration.fromMicroseconds(2_500_999);
    expect(d.inMilliseconds).toBe(2500);
    expect(d.inSeconds).toBe(2);
  });

  it('adds and subtracts', () => {
    const a = Duration.milliseconds(5);
    const b = Duration.milliseconds(3);
    expect(a.plus(b).inMilliseconds).toBe(8);
    expect(a.minus(b).inMilliseconds).toBe(2);
  });

  it('compares', () => {
    const a = Duration.milliseconds(5);
    const b = Duration.milliseconds(3);
    expect(a.compareTo(b)).toBeGreaterThan(0);
    expect(b.compareTo(a)).toBeLessThan(0);
    expect(a.compareTo(Duration.milliseconds(5))).toBe(0);

    expect(a.greaterThanOrEqualTo(b)).toBe(true);
    expect(b.greaterThanOrEqualTo(a)).toBe(false);
    expect(a.greaterThanOrEqualTo(Duration.milliseconds(5))).toBe(true);
  });

  it('checks equality', () => {
    expect(Duration.milliseconds(5).equals(Duration.milliseconds(5))).toBe(
      true,
    );
    expect(Duration.milliseconds(5).equals(Duration.milliseconds(6))).toBe(
      false,
    );
  });
});
