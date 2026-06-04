// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

let testValue: boolean | undefined;

/**
 * Returns true if the environment variable `GITHUB_ACTIONS` is set, or the
 * value set via {@link setTestIsGitHub}.
 *
 * Ported from the Dart `gg_is_github` package (test-only helper).
 */
export const isGitHub = (): boolean => {
  if (testValue !== undefined) {
    return testValue;
  }
  return 'GITHUB_ACTIONS' in process.env;
};

/**
 * Overrides {@link isGitHub} in tests. Pass `undefined` to reset.
 * @param value - The override value, or undefined to reset.
 */
export const setTestIsGitHub = (value: boolean | undefined): void => {
  testValue = value;
};
