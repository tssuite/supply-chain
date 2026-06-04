// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Duration } from '../duration.ts';
import { ArgumentError } from './errors.ts';

/**
 * A stopwatch-like handle the supply chain uses to measure elapsed time.
 *
 * Both {@link FakeStopwatch} and the real (performance-based) stopwatch
 * implement it.
 */
export interface StopwatchLike {
  /** Returns the elapsed time. */
  readonly elapsed: Duration;
  /** Returns true while the stopwatch is running. */
  readonly isRunning: boolean;
  /** Starts the stopwatch. */
  start(): void;
  /** Stops the stopwatch. */
  stop(): void;
  /** Resets the elapsed time. */
  reset(): void;
}

/**
 * A stopwatch driven by manual time advancement via
 * {@link FakeStopwatch.elapse}.
 *
 * Ported from the Dart `GgFakeStopwatch`.
 */
export class FakeStopwatch implements StopwatchLike {
  private readonly elapsedExternal?: () => Duration;
  private elapsedInternal = Duration.zero;
  private running = false;
  private startDuration = Duration.zero;
  private stopDuration = Duration.zero;

  /**
   * Creates a fake stopwatch.
   * @param elapsed - Optional callback delivering the elapsed time. When set,
   *   {@link FakeStopwatch.elapse} must not be used.
   */
  constructor(elapsed?: () => Duration) {
    this.elapsedExternal = elapsed;
  }

  /** The frequency of the (fake) stopwatch in Hz. */
  get frequency(): number {
    return 10 * 1000 * 1000;
  }

  /** Starts the stopwatch. */
  start(): void {
    if (this.running) {
      return;
    }
    this.startDuration = this.internalElapsed;
    this.running = true;
  }

  /** Stops the stopwatch. */
  stop(): void {
    this.running = false;
    this.stopDuration = this.internalElapsed.minus(this.startDuration);
  }

  /** Resets the elapsed time. */
  reset(): void {
    this.stopDuration = Duration.zero;
    this.startDuration = this.internalElapsed;
  }

  /** The elapsed time in ticks. */
  get elapsedTicks(): number {
    return this.elapsed.inMicroseconds * 10;
  }

  /**
   * Advances the fake elapsed time while the stopwatch is running.
   * @param progress - The amount of time to advance.
   */
  elapse(progress: Duration): void {
    if (this.elapsedExternal != null) {
      throw new ArgumentError(
        'Don\'t call elapse when "elapsed()" callback is set.',
      );
    }

    if (!this.running) {
      return;
    }

    this.elapsedInternal = this.elapsedInternal.plus(progress);
  }

  /** The elapsed time. */
  get elapsed(): Duration {
    if (!this.running) {
      return this.stopDuration;
    }
    return this.internalElapsed.minus(this.startDuration).plus(this.stopDuration);
  }

  /** The elapsed time in whole microseconds. */
  get elapsedMicroseconds(): number {
    return this.elapsed.inMicroseconds;
  }

  /** The elapsed time in whole milliseconds. */
  get elapsedMilliseconds(): number {
    return this.elapsed.inMilliseconds;
  }

  /** Returns true while the stopwatch is running. */
  get isRunning(): boolean {
    return this.running;
  }

  private get internalElapsed(): Duration {
    return this.elapsedExternal?.() ?? this.elapsedInternal;
  }
}
