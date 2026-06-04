// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { exampleScheduleTask, exampleTask } from '../src/schedule-task.ts';

describe('schedule-task', () => {
  it('should work fine', () => {
    const messages: string[] = [];

    exampleTask();

    exampleScheduleTask(() => messages.push('exampleTask'));
    expect(messages[0]).toBe('exampleTask');
  });
});
