# Changelog

## [0.1.0] - 2026-07-05

Ports the performance optimizations of the Dart `supply_chain` package
version 5.1.0 to TypeScript.

### Performance

Large supply chains are now orders of magnitude faster to build and update
(measured >100x on graphs with a few thousand nodes, growing with graph
size). See `benchmark/supply-chain-benchmark.ts`.

- `Scm.produce` no longer rescans all prepared nodes on every production
cycle. Ready nodes are kept in per-priority ready queues; each production
cycle now costs O(batch) instead of O(all prepared nodes). Bulk updates and
initial production of a graph with N nodes dropped from O(N²) to O(N).
- Circular dependency detection no longer enumerates every path through the
supplier graph (exponential on diamond-shaped graphs). Nodes maintain an
incrementally updated topological rank (Pearce-Kelly); connecting a supplier
created before its customer is now O(1) to check.
- `Node.initSuppliers` no longer performs Θ(S²) pairwise path matching when
connecting S suppliers.
- `Node._customers` is now a Set and suppliers are shadowed by a Set:
building and tearing down wide fan-outs is linear instead of quadratic.
- `Scope.child` uses the existing children map instead of a linear scan.
- `Scope.smartMaster` no longer recurses into the parent twice
(was O(2^depth), now O(depth)).
- `NodeBluePrint.instantiate` looks the node up in the scope's node map
instead of scanning all nodes.
- `Disposed` stores nodes and scopes in Sets; erasing many disposed items is
linear instead of quadratic.
- `Scm.addPreparedNodes` iterates its input once instead of twice.
- `Scm.nominate` evaluates the cheap fast-path conditions before scanning
suppliers.

### Fixed

- `Scm` no longer leaks one periodic timeout-check timer per production
cycle. Previously every cycle created a new periodic timer without
cancelling the old one; in non-test mode a single long chain propagation
could leak thousands of permanently firing timers.
- Preparing very deep customer chains no longer overflows the stack
(`Scm.prepareNode` is iterative now; chains of 8000+ nodes previously
crashed with a stack overflow).
- Disposed nodes are removed from the prepared sets immediately on dispose
instead of lingering until the next production cycle.

### Added

- `Scope.nodeByKey`: O(1) lookup of an own node (including inserts) by its
exact key.
- `Priority.index`: the position of a priority in `Priority.values`
(equivalent of Dart's `enum.index`).
- `benchmark/supply-chain-benchmark.ts`: reproducible performance
benchmark covering chains, fan-out, fan-in, layered DAGs, bulk updates and
the non-test (microtask driven) production mode. Run with
`npx vite-node benchmark/supply-chain-benchmark.ts`.

## [0.0.1]

Initial commit.
