// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { Priority } from '../src/priority.ts';

describe('Priority', () => {
  it('should work fine', () => {
    expect(Priority.lowest).toBe(Priority.frame);
    expect(Priority.highest).toBe(Priority.realtime);
  });

  it('exposes numeric values and names', () => {
    expect(Priority.frame.value).toBe(1);
    expect(Priority.realtime.value).toBe(2);
    expect(Priority.structure.value).toBe(3);
    expect(Priority.frame.name).toBe('frame');
    expect(Priority.realtime.name).toBe('realtime');
    expect(Priority.structure.name).toBe('structure');
  });

  it('lists all values in declaration order', () => {
    expect(Priority.values).toEqual([
      Priority.frame,
      Priority.realtime,
      Priority.structure,
    ]);
  });
});
