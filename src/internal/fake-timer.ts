// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Duration } from '../duration.ts';

/**
 * A timer-like handle the supply chain can cancel and query.
 *
 * Both {@link FakeTimer} and the real (setInterval-based) timer implement it.
 */
export interface TimerLike {
  /** Returns true while the timer is still active. */
  readonly isActive: boolean;
  /** Cancels the timer. */
  cancel(): void;
}

/**
 * A fake timer whose time is advanced manually via {@link FakeTimer.elapse}.
 *
 * Ported from the Dart `GgFakeTimer`.
 */
export class FakeTimer implements TimerLike {
  /** The timer interval. */
  readonly interval: Duration;

  /** Returns true if the timer is periodic. */
  readonly isPeriodic: boolean;

  private callback: () => void;
  private cancelled = false;
  private durationAtLastFiring = Duration.zero;
  private currentDuration = Duration.zero;

  /**
   * Creates a timer.
   * @param interval - The interval after which the timer fires.
   * @param callback - The callback invoked on firing.
   * @param isPeriodic - Whether the timer fires repeatedly.
   */
  constructor(interval: Duration, callback: () => void, isPeriodic: boolean) {
    this.interval = interval;
    this.callback = callback;
    this.isPeriodic = isPeriodic;
  }

  /**
   * Creates a periodic timer. The callback receives the timer instance.
   * @param duration - The interval after which the timer fires.
   * @param callback - The callback invoked with the timer on each firing.
   */
  static periodic(
    duration: Duration,
    callback: (timer: FakeTimer) => void,
  ): FakeTimer {
    const ref: { timer?: FakeTimer } = {};
    const timer = new FakeTimer(duration, () => callback(ref.timer!), true);
    ref.timer = timer;
    return timer;
  }

  /**
   * Runs the callback immediately (single-shot helper).
   * @param callback - The callback to run.
   */
  static run(callback: () => void): void {
    callback();
  }

  /**
   * Advances fake time, firing the callback if the interval elapsed.
   * @param progress - The amount of time to advance.
   */
  elapse(progress: Duration): void {
    if (this.cancelled) {
      return;
    }

    this.currentDuration = this.currentDuration.plus(progress);
    const durationSinceLastFire = this.currentDuration.minus(
      this.durationAtLastFiring,
    );

    if (durationSinceLastFire.greaterThanOrEqualTo(this.interval)) {
      this.callback();
      this.durationAtLastFiring = this.currentDuration;

      if (!this.isPeriodic) {
        this.cancelled = true;
      }
    }
  }

  /** Advances time by one interval, triggering the next firing. */
  fire(): void {
    this.elapse(this.currentDuration.plus(this.interval));
  }

  /** Current ticks. */
  get tick(): number {
    return this.interval.inMicroseconds * 10;
  }

  /** Returns true if the timer is still active. */
  get isActive(): boolean {
    return !this.cancelled;
  }

  /** Returns true if the timer has been cancelled. */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /** Cancels the timer. */
  cancel(): void {
    this.cancelled = true;
  }
}
