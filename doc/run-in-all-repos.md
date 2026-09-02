<!--
@license
Copyright (c) 2025 tssuite

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# Apply a task to all tssuite repos

First make sure that all repos are clean.

```bash
node dna/scripts/run-in-all-repos.js .. node `pwd`/dna/scripts/is-clean-repo.js
```

Assume you want to execute `ls -la` in all cloned tssuite repos

```bash
node dna/scripts/run-in-all-repos.js ../ ls -la
```
