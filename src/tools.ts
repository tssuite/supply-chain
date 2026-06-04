// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

const camelCase = /^[_§]?[a-z][a-z0-9]*([A-Z0-9][a-z0-9]*)*$/;

/**
 * Returns true if the string is lower camel case.
 *
 * Ported from the Dart `IsCamelCaseExtension`. A leading `_` or `§` is allowed.
 * @param value - The string to test.
 */
export const isCamelCase = (value: string): boolean => camelCase.test(value);
