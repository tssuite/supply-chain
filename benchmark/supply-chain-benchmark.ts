// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Run with: npx vite-node benchmark/supply-chain-benchmark.ts
// Options:  --quick            reduce the graph sizes by a factor of 10
//           --label <label>    label stored in the JSON output
//           --out <file>       write the results as JSON to <file>

import { writeFileSync } from 'node:fs';

// NOTE(port): `Scm` is imported from its source file first (before the barrel
// `../src/index.ts`). See the note in test/scm.spec.ts.
import { Scm } from '../src/scm.ts';
import { Node, NodeBluePrint, Scope, ScopeBluePrint } from '../src/index.ts';

/** Result of one benchmark scenario */
class BenchResult {
  constructor(
    readonly name: string,
    readonly nodes: number,
    readonly setupMs: number,
    readonly updates: number,
    readonly updateTotalMs: number,
    readonly verified: boolean,
  ) {}

  get perUpdateUs(): number {
    return (this.updateTotalMs * 1000) / this.updates;
  }

  toJson(): Record<string, unknown> {
    return {
      name: this.name,
      nodes: this.nodes,
      setupMs: this.setupMs,
      updates: this.updates,
      updateTotalMs: this.updateTotalMs,
      perUpdateUs: this.perUpdateUs,
      verified: this.verified,
    };
  }
}

// .............................................................................
const source = (key: string): NodeBluePrint<number> =>
  new NodeBluePrint<number>({ key, initialProduct: 0 });

const worker = (key: string, suppliers: string[]): NodeBluePrint<number> =>
  new NodeBluePrint<number>({
    key,
    initialProduct: 0,
    suppliers,
    produce: (components) => {
      let sum = 1;
      for (const c of components) {
        sum += c as number;
      }
      return sum;
    },
  });

// .............................................................................
/** Builds a linear chain: n0 -> n1 -> ... -> n(n-1) */
function chain(n: number, updates: number): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  const scope = Scope.root({ key: 'bench', scm });

  new Node<number>({ bluePrint: source('n0'), scope });
  for (let i = 1; i < n; i++) {
    new Node<number>({ bluePrint: worker(`n${i}`, [`n${i - 1}`]), scope });
  }
  scm.flush();
  const setupMs = performance.now() - start;

  const first = scope.findNode<number>('n0')!;
  const last = scope.findNode<number>(`n${n - 1}`)!;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    first.product = u;
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  // Each hop adds 1 to the sum of its single supplier.
  const verified = last.product === updates + n - 1;

  return new BenchResult(
    `chain(n=${n})`,
    n,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/** One root supplying n customers */
function fanOut(n: number, updates: number): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  const scope = Scope.root({ key: 'bench', scm });

  new Node<number>({ bluePrint: source('root'), scope });
  for (let i = 0; i < n; i++) {
    new Node<number>({ bluePrint: worker(`c${i}`, ['root']), scope });
  }
  scm.flush();
  const setupMs = performance.now() - start;

  const root = scope.findNode<number>('root')!;
  const lastLeaf = scope.findNode<number>(`c${n - 1}`)!;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    root.product = u;
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  const verified = lastLeaf.product === updates + 1;

  return new BenchResult(
    `fanOut(n=${n})`,
    n + 1,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/** n sources supplying one sink */
function fanIn(n: number, updates: number): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  const scope = Scope.root({ key: 'bench', scm });

  const supplierKeys: string[] = [];
  for (let i = 0; i < n; i++) {
    new Node<number>({ bluePrint: source(`s${i}`), scope });
    supplierKeys.push(`s${i}`);
  }
  new Node<number>({ bluePrint: worker('sink', supplierKeys), scope });
  scm.flush();
  const setupMs = performance.now() - start;

  const s0 = scope.findNode<number>('s0')!;
  const sink = scope.findNode<number>('sink')!;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    s0.product = u;
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  const verified = sink.product === updates + 1;

  return new BenchResult(
    `fanIn(n=${n})`,
    n + 1,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/**
 * Layered DAG: `width` sources, `depth` layers; every node of layer l
 * depends on two nodes of layer l-1 (diamond-heavy).
 */
function layered(width: number, depth: number, updates: number): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  const scope = Scope.root({ key: 'bench', scm });

  for (let i = 0; i < width; i++) {
    new Node<number>({ bluePrint: source(`l0x${i}`), scope });
  }
  for (let l = 1; l < depth; l++) {
    for (let i = 0; i < width; i++) {
      new Node<number>({
        bluePrint: worker(`l${l}x${i}`, [
          `l${l - 1}x${i}`,
          `l${l - 1}x${(i + 1) % width}`,
        ]),
        scope,
      });
    }
  }
  scm.flush();
  const setupMs = performance.now() - start;

  const sourceNode = scope.findNode<number>('l0x0')!;
  const sink = scope.findNode<number>(`l${depth - 1}x0`)!;
  const sinkBefore = sink.product;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    sourceNode.product = u;
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  const verified = sink.product !== sinkBefore;

  return new BenchResult(
    `layered(w=${width},d=${depth})`,
    width * depth,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/**
 * Updates all sources of a layered DAG at once and flushes - measures bulk
 * invalidation where many nodes are prepared at the same time.
 */
function bulkUpdate(
  width: number,
  depth: number,
  updates: number,
): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  const scope = Scope.root({ key: 'bench', scm });

  for (let i = 0; i < width; i++) {
    new Node<number>({ bluePrint: source(`l0x${i}`), scope });
  }
  for (let l = 1; l < depth; l++) {
    for (let i = 0; i < width; i++) {
      new Node<number>({
        bluePrint: worker(`l${l}x${i}`, [
          `l${l - 1}x${i}`,
          `l${l - 1}x${(i + 1) % width}`,
        ]),
        scope,
      });
    }
  }
  scm.flush();
  const setupMs = performance.now() - start;

  const sources: Node<number>[] = [];
  for (let i = 0; i < width; i++) {
    sources.push(scope.findNode<number>(`l0x${i}`)!);
  }
  const sink = scope.findNode<number>(`l${depth - 1}x0`)!;
  const sinkBefore = sink.product;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    for (const sourceNode of sources) {
      sourceNode.product = u;
    }
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  const verified = sink.product !== sinkBefore;

  return new BenchResult(
    `bulkUpdate(w=${width},d=${depth})`,
    width * depth,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/**
 * Instantiates a chain of nested ScopeBluePrints - measures scope and
 * builder machinery during blueprint driven construction.
 */
function nestedScopes(depth: number, nodesPerScope: number): BenchResult {
  const start = performance.now();
  const scm = new Scm({ isTest: true });
  const root = Scope.root({ key: 'bench', scm });

  const makeNodes = (): NodeBluePrint<number>[] => {
    const nodes: NodeBluePrint<number>[] = [];
    for (let i = 0; i < nodesPerScope; i++) {
      nodes.push(new NodeBluePrint<number>({ key: `n${i}`, initialProduct: 0 }));
    }
    return nodes;
  };

  let bp = new ScopeBluePrint({ key: 'level0', nodes: makeNodes() });
  for (let d = 1; d < depth; d++) {
    bp = new ScopeBluePrint({
      key: `level${d}`,
      nodes: makeNodes(),
      children: [bp],
    });
  }

  const scope = bp.instantiate({ scope: root });
  scm.flush();
  const setupMs = performance.now() - start;

  const verified = scope.findNode<number>('level0/n0') !== undefined;

  return new BenchResult(
    `nestedScopes(d=${depth},n=${nodesPerScope})`,
    depth * nodesPerScope,
    setupMs,
    1,
    0,
    verified,
  );
}

// .............................................................................
/**
 * Linear chain like chain(), but with drainMode enabled: all waves of an
 * update are processed within a single production cycle.
 */
function drainChain(n: number, updates: number): BenchResult {
  let start = performance.now();
  const scm = new Scm({ isTest: true });
  scm.drainMode = true;
  const scope = Scope.root({ key: 'bench', scm });

  new Node<number>({ bluePrint: source('n0'), scope });
  for (let i = 1; i < n; i++) {
    new Node<number>({ bluePrint: worker(`n${i}`, [`n${i - 1}`]), scope });
  }
  scm.flush();
  const setupMs = performance.now() - start;

  const first = scope.findNode<number>('n0')!;
  const last = scope.findNode<number>(`n${n - 1}`)!;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    first.product = u;
    scm.flush();
  }
  const updateTotalMs = performance.now() - start;

  const verified = last.product === updates + n - 1;

  return new BenchResult(
    `drainChain(n=${n})`,
    n,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
/**
 * Linear chain driven in non-test mode (microtasks + real timers) - the
 * production configuration of the scm.
 */
async function chainProductionMode(
  n: number,
  updates: number,
): Promise<BenchResult> {
  let start = performance.now();
  const scm = new Scm({ isTest: false });
  const scope = Scope.root({ key: 'bench', scm });

  new Node<number>({ bluePrint: source('n0'), scope });
  for (let i = 1; i < n; i++) {
    new Node<number>({ bluePrint: worker(`n${i}`, [`n${i - 1}`]), scope });
  }

  const first = scope.findNode<number>('n0')!;
  const last = scope.findNode<number>(`n${n - 1}`)!;

  // Wait for initial production to settle
  while (last.product !== n - 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    scm.tick();
  }
  const setupMs = performance.now() - start;

  start = performance.now();
  for (let u = 1; u <= updates; u++) {
    first.product = u;
    while (last.product !== u + n - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      scm.tick();
    }
  }
  const updateTotalMs = performance.now() - start;

  const verified = last.product === updates + n - 1;

  return new BenchResult(
    `chainProductionMode(n=${n})`,
    n,
    setupMs,
    updates,
    updateTotalMs,
    verified,
  );
}

// .............................................................................
async function main(args: string[]): Promise<void> {
  let out: string | undefined;
  let label = 'run';
  let quick = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && i + 1 < args.length) out = args[i + 1];
    if (args[i] === '--label' && i + 1 < args.length) label = args[i + 1];
    if (args[i] === '--quick') quick = true;
  }

  const f = quick ? 10 : 1;

  // Warmup (JIT)
  chain(50, 10);
  fanOut(50, 10);
  fanIn(50, 10);
  layered(4, 4, 10);

  const results: BenchResult[] = [
    chain(100, 100),
    chain(Math.trunc(1000 / f), 100),
    chain(Math.trunc(3000 / f), 10),
    fanOut(100, 100),
    fanOut(Math.trunc(1000 / f), 100),
    fanIn(100, 100),
    fanIn(Math.trunc(1000 / f), 100),
    layered(10, 10, 100),
    layered(32, Math.trunc(16 / (quick ? 2 : 1)), 50),
    bulkUpdate(64, 8, 50),
    nestedScopes(Math.trunc(150 / f), 10),
    drainChain(Math.trunc(1000 / f), 100),
    await chainProductionMode(Math.trunc(500 / f), 20),
  ];

  console.log(
    '| scenario | nodes | setup ms | updates | total ms | per update µs |' +
      ' ok |',
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.nodes} | ${r.setupMs.toFixed(1)} ` +
        `| ${r.updates} | ${r.updateTotalMs.toFixed(1)} ` +
        `| ${r.perUpdateUs.toFixed(1)} ` +
        `| ${r.verified ? '✓' : '✗ FAILED'} |`,
    );
  }

  if (out !== undefined) {
    writeFileSync(
      out,
      JSON.stringify(
        { label, results: results.map((r) => r.toJson()) },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${out}`);
  }

  const allVerified = results.every((r) => r.verified);
  if (!allVerified) {
    console.log('\nERROR: some scenarios produced wrong results!');
    process.exitCode = 1;
  }
}

await main(process.argv.slice(2));
