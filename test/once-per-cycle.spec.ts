// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it, vi } from 'vitest';

import { OncePerCycle } from '../src/internal/once-per-cycle.ts';
import type { Task } from '../src/schedule-task.ts';

describe('OncePerCycle', () => {
  it('executes the task only once per cycle (custom scheduler)', () => {
    const tasks: Task[] = [];
    const schedule = (task: Task): void => {
      tasks.push(task);
    };
    const task = vi.fn();
    const opc = new OncePerCycle({ task, scheduleTask: schedule });

    opc.trigger();
    opc.trigger(); // second trigger is ignored within the same cycle
    expect(tasks).toHaveLength(1);

    // Run the scheduled task — it resets the trigger and runs the task.
    tasks[0]();
    expect(task).toHaveBeenCalledTimes(1);

    // After execution it can be triggered again.
    opc.trigger();
    expect(tasks).toHaveLength(2);
  });

  it('supports an override scheduler passed to trigger', () => {
    const task = vi.fn();
    const opc = new OncePerCycle({
      task,
      scheduleTask: () => {
        throw new Error('default scheduler must not be used');
      },
    });

    const captured: Task[] = [];
    opc.trigger((t) => captured.push(t));
    expect(captured).toHaveLength(1);
  });

  it('does not schedule in test mode but runs via executeNow', () => {
    const task = vi.fn();
    const schedule = vi.fn();
    const opc = new OncePerCycle({ task, isTest: true, scheduleTask: schedule });

    opc.trigger();
    expect(schedule).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();

    opc.executeNow();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not run the task after dispose', () => {
    const task = vi.fn();
    const opc = new OncePerCycle({ task, isTest: true });
    opc.dispose();
    opc.executeNow();
    expect(task).not.toHaveBeenCalled();
  });

  it('uses queueMicrotask by default', async () => {
    const task = vi.fn();
    const opc = new OncePerCycle({ task });
    opc.trigger();
    expect(task).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
