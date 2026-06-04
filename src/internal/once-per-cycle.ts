// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import type { ScheduleTask, Task } from '../schedule-task.ts';

/** The default scheduler: a microtask. */
const defaultScheduleTask: ScheduleTask = (task: Task) => queueMicrotask(task);

/**
 * Takes a {@link task} and makes sure that {@link trigger} executes it only
 * once per run-loop cycle.
 *
 * Ported from the Dart `GgOncePerCycle`.
 */
export class OncePerCycle {
  /** The task to be triggered. */
  task: Task;

  /** Returns true if this runs in a test environment. */
  readonly isTest: boolean;

  /** The scheduler used to defer the task. */
  scheduleTask: ScheduleTask;

  private triggered = false;
  private disposed = false;

  /**
   * Creates a new once-per-cycle scheduler.
   * @param options - The task, test flag and optional scheduler.
   */
  constructor(options: {
    task: Task;
    isTest?: boolean;
    scheduleTask?: ScheduleTask;
  }) {
    this.task = options.task;
    this.isTest = options.isTest ?? false;
    this.scheduleTask = options.scheduleTask ?? defaultScheduleTask;
  }

  /**
   * Triggers the task, but only if it has not already been triggered during
   * this run-loop cycle.
   * @param scheduleTask - An optional scheduler overriding the default.
   */
  trigger(scheduleTask?: ScheduleTask): void {
    if (this.triggered) {
      return;
    }

    this.triggered = true;

    if (this.isTest) {
      return;
    }

    (scheduleTask ?? this.scheduleTask)(this.scheduledTask);
  }

  /** Executes the task immediately. Used to control execution in tests. */
  executeNow(): void {
    this.scheduledTask();
  }

  /** Prevents any further triggered task from executing. */
  dispose(): void {
    this.disposed = true;
  }

  private readonly scheduledTask = (): void => {
    this.triggered = false;
    if (!this.disposed) {
      this.task();
    }
  };
}
