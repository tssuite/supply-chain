// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it, vi } from 'vitest';

import { Duration } from '../src/duration.ts';
import { FakeTimer } from '../src/internal/fake-timer.ts';

const ms = (n: number): Duration => Duration.milliseconds(n);

describe('FakeTimer', () => {
  it('fires a single-shot timer once when the interval elapses', () => {
    const cb = vi.fn();
    const timer = new FakeTimer(ms(10), cb, false);

    timer.elapse(ms(5));
    expect(cb).not.toHaveBeenCalled(); // 5ms < 10ms

    timer.elapse(ms(5));
    expect(cb).toHaveBeenCalledTimes(1); // 10ms >= 10ms
    expect(timer.isCancelled).toBe(true);
    expect(timer.isActive).toBe(false);

    // Once cancelled, further elapse is a no-op.
    timer.elapse(ms(100));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires a periodic timer repeatedly and passes itself', () => {
    const seen: FakeTimer[] = [];
    const timer = FakeTimer.periodic(ms(10), (t) => seen.push(t));

    timer.elapse(ms(10));
    timer.elapse(ms(10));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(timer);
    expect(timer.isActive).toBe(true);
  });

  it('fire() advances by one interval', () => {
    const cb = vi.fn();
    const timer = FakeTimer.periodic(ms(10), cb);
    timer.fire();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('run() executes the callback immediately', () => {
    const cb = vi.fn();
    FakeTimer.run(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('exposes tick, interval and isPeriodic', () => {
    const timer = new FakeTimer(ms(10), () => {}, false);
    expect(timer.interval.inMilliseconds).toBe(10);
    expect(timer.isPeriodic).toBe(false);
    expect(timer.tick).toBe(ms(10).inMicroseconds * 10);
  });

  it('can be cancelled', () => {
    const cb = vi.fn();
    const timer = new FakeTimer(ms(10), cb, true);
    timer.cancel();
    expect(timer.isActive).toBe(false);
    timer.elapse(ms(100));
    expect(cb).not.toHaveBeenCalled();
  });
});
