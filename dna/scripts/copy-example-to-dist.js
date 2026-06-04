/*
 * @license
 * Copyright (c) 2025 tssuite
 *
 * Use of this source code is governed by terms that can be
 * found in the LICENSE file in the root of this package.
 */

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const copyFile = async (src, dest) => {
  await fs.copyFile(src, dest);
};

const createDir = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
};

const main = async () => {
  const srcExample = join(__dirname, '..', '..', 'src', 'example.ts');
  const destExampleDir = join(__dirname, '..', '..', 'dist', 'src');
  const destExample = join(destExampleDir, 'example.ts');

  await createDir(destExampleDir);
  await copyFile(srcExample, destExample);

  console.log('Copied example successfully.');
};

main().catch(console.error);
