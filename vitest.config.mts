// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/// <reference types="vitest" />

import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./test/setup/test-setup.ts'],
      include: ['**/test/**/*.spec.ts'],

      reporters: ['default'],
      coverage: {
        enabled: true,
        provider: 'v8', // "istanbul" or "v8"
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.ts'],
        // index.ts is a barrel; graph-io.node.ts is node-only IO (graphviz/mmdc
        // subprocess) exercised only with external tools — excluded like Dart's
        // coverage:ignore on the same code.
        exclude: ['src/index.ts', 'src/graph-io.node.ts'],
        all: true,
        // Target is 100% (tssuite convention). The port meets full coverage
        // across all ported suites; genuinely test-unreachable production/IO and
        // defensive code is excluded with `/* v8 ignore ... */` markers.
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        checkCoverage: true,
      },
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
