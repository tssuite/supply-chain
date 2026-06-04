// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { version } from '../src/version.ts';

describe('version', () => {
  it('is a semver-like string', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
