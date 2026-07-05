// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/**
 * Nodes can have different update priorities.
 *
 * Ported from the Dart `Priority` enum. Implemented as a class with frozen
 * singleton instances so the values can carry a numeric {@link Priority.value}
 * and be compared by identity.
 */
export class Priority {
  private constructor(
    /** The numeric value of the priority. */
    readonly value: number,
    /** The name of the priority. */
    readonly name: string,
    /**
     * The position in {@link Priority.values} (Dart's `enum.index`).
     * Used e.g. to index the SCM's per-priority ready queues.
     */
    readonly index: number,
  ) {}

  /** Nodes with frame priority are updated once in a frame. */
  static readonly frame = new Priority(1, 'frame', 0);

  /** Nodes with realtime priority are updated immediately. */
  static readonly realtime = new Priority(2, 'realtime', 1);

  /**
   * Nodes with structure priority are updated before all others.
   * Use this priority for dynamic chain structure updates.
   */
  static readonly structure = new Priority(3, 'structure', 2);

  /** All priorities in declaration order. */
  static readonly values: readonly Priority[] = [
    Priority.frame,
    Priority.realtime,
    Priority.structure,
  ];

  /** Returns the lowest priority. */
  static get lowest(): Priority {
    return Priority.frame;
  }

  /** Returns the highest priority. */
  static get highest(): Priority {
    return Priority.realtime;
  }
}
