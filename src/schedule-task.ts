// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/** A simple task delegate. */
export type Task = () => void;

/** A delegate for scheduling a task. */
export type ScheduleTask = (task: Task) => void;

/** An example task that does nothing. */
export const exampleTask: Task = () => {};

/** An example schedule task that runs the task immediately. */
export const exampleScheduleTask: ScheduleTask = (task: Task) => {
  task();
};
