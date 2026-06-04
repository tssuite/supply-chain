// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

const microsecondsPerMillisecond = 1000;
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;

const microsecondsPerSecond =
  microsecondsPerMillisecond * millisecondsPerSecond;

/**
 * A span of time, modelled after Dart's `Duration`.
 *
 * Stores the span as an integer number of microseconds and offers the subset
 * of arithmetic and comparison the supply chain relies on.
 */
export class Duration {
  /** The total span in microseconds (integer). */
  readonly inMicroseconds: number;

  /**
   * Creates a duration from its components. All components default to zero.
   * @param parts - The individual time components.
   */
  constructor(
    parts: {
      days?: number;
      hours?: number;
      minutes?: number;
      seconds?: number;
      milliseconds?: number;
      microseconds?: number;
    } = {},
  ) {
    const {
      days = 0,
      hours = 0,
      minutes = 0,
      seconds = 0,
      milliseconds = 0,
      microseconds = 0,
    } = parts;

    this.inMicroseconds = Math.trunc(
      microsecondsPerMillisecond *
        (millisecondsPerSecond *
          (secondsPerMinute *
            (minutesPerHour * (hoursPerDay * days + hours) + minutes) +
            seconds) +
          milliseconds) +
        microseconds,
    );
  }

  /** A duration of zero length. */
  static readonly zero = new Duration();

  /**
   * Creates a duration from a raw microsecond count.
   * @param microseconds - The number of microseconds.
   */
  static fromMicroseconds(microseconds: number): Duration {
    return new Duration({ microseconds });
  }

  /**
   * Creates a duration from a number of milliseconds.
   * @param milliseconds - The number of milliseconds.
   */
  static milliseconds(milliseconds: number): Duration {
    return new Duration({ milliseconds });
  }

  /**
   * Creates a duration from a number of seconds.
   * @param seconds - The number of seconds.
   */
  static seconds(seconds: number): Duration {
    return new Duration({ seconds });
  }

  /** The total span in whole milliseconds (truncated toward zero). */
  get inMilliseconds(): number {
    return Math.trunc(this.inMicroseconds / microsecondsPerMillisecond);
  }

  /** The total span in whole seconds (truncated toward zero). */
  get inSeconds(): number {
    return Math.trunc(this.inMicroseconds / microsecondsPerSecond);
  }

  /**
   * Returns the sum of this and {@link other}.
   * @param other - The duration to add.
   */
  plus(other: Duration): Duration {
    return Duration.fromMicroseconds(
      this.inMicroseconds + other.inMicroseconds,
    );
  }

  /**
   * Returns the difference of this and {@link other}.
   * @param other - The duration to subtract.
   */
  minus(other: Duration): Duration {
    return Duration.fromMicroseconds(
      this.inMicroseconds - other.inMicroseconds,
    );
  }

  /**
   * Compares this to {@link other}: negative, zero or positive.
   * @param other - The duration to compare against.
   */
  compareTo(other: Duration): number {
    return this.inMicroseconds - other.inMicroseconds;
  }

  /**
   * Returns true if this is greater than or equal to {@link other}.
   * @param other - The duration to compare against.
   */
  greaterThanOrEqualTo(other: Duration): boolean {
    return this.inMicroseconds >= other.inMicroseconds;
  }

  /**
   * Returns true if this equals {@link other}.
   * @param other - The duration to compare against.
   */
  equals(other: Duration): boolean {
    return this.inMicroseconds === other.inMicroseconds;
  }
}
