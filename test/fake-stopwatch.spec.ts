// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { Duration } from '../src/duration.ts';
import { FakeStopwatch } from '../src/internal/fake-stopwatch.ts';
import { ArgumentError } from '../src/internal/errors.ts';

const ms = (n: number): Duration => Duration.milliseconds(n);

describe('FakeStopwatch', () => {
  it('reports zero and frequency before starting', () => {
    const sw = new FakeStopwatch();
    expect(sw.isRunning).toBe(false);
    expect(sw.elapsed.inMilliseconds).toBe(0);
    expect(sw.frequency).toBe(10 * 1000 * 1000);
  });

  it('elapse is a no-op while not running', () => {
    const sw = new FakeStopwatch();
    sw.elapse(ms(5));
    expect(sw.elapsed.inMilliseconds).toBe(0);
  });

  it('accumulates elapsed time while running', () => {
    const sw = new FakeStopwatch();
    sw.start();
    sw.start(); // second start is a no-op
    sw.elapse(ms(5));
    expect(sw.isRunning).toBe(true);
    expect(sw.elapsed.inMilliseconds).toBe(5);
    expect(sw.elapsedMilliseconds).toBe(5);
    expect(sw.elapsedMicroseconds).toBe(5000);
    expect(sw.elapsedTicks).toBe(5000 * 10);
  });

  it('keeps elapsed after stop and clears after reset', () => {
    const sw = new FakeStopwatch();
    sw.start();
    sw.elapse(ms(5));
    sw.stop();
    expect(sw.isRunning).toBe(false);
    expect(sw.elapsed.inMilliseconds).toBe(5);

    sw.reset();
    expect(sw.elapsed.inMilliseconds).toBe(0);
  });

  it('uses an external elapsed callback and forbids elapse', () => {
    const sw = new FakeStopwatch(() => ms(7));
    sw.start();
    expect(sw.isRunning).toBe(true);
    // elapsed reads the external source (running: external - start + stop).
    expect(sw.elapsed.inMilliseconds).toBe(0);
    expect(() => sw.elapse(Duration.zero)).toThrow(ArgumentError);
  });
});
