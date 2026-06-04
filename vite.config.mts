// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { builtinModules } from 'module';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import pkg from './package.json';

export default defineConfig({
  plugins: [dts({ include: ['src/**/*'] })],

  // Comment in the following files when this package should run in node.js only
  //
  // resolve: {
  //   mainFields: ['module', 'jsnext:main', 'main'], // Do not run in browser
  //   conditions: ['node', 'import'], // node-spezifische Exports
  // },

  build: {
    copyPublicDir: false,
    minify: false,
    // sourcemap: 'inline',

    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        ...builtinModules, // 'fs', 'path', ...
        ...builtinModules.map((m) => `node:${m}`), // 'node:fs', 'node:path', ...
        ...Object.keys((pkg as any).dependencies ?? {}),
        ...Object.keys((pkg as any).peerDependencies ?? {}),
      ],
      output: {
        globals: {},
      },
    },
  },
});
