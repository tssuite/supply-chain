# Changelog

## [0.2.0] - 2026-07-12

Ports the improvements of the Dart `supply_chain` package versions 5.2.0 to
5.4.2 to TypeScript: animation nodes, change-gating, mermaid markdown export,
further performance optimizations, a rename and updated dependencies.

### Added

- `AnimatedNode` / `AnimatedNodeBluePrint`: a node that eases its output from
its current value toward a new input value over a fixed number of frames,
producing one intermediate value per `Scm.tick()`. Supply an animation curve
(`(t: number) => number` mapping normalized time to eased progress) and a
`lerp`; the convenience factories `AnimatedNodeBluePrint.forDouble` and
`.forInt` cover the common cases. The node manages `isAnimated` itself, snaps
the first input, retargets smoothly mid-animation, and exposes an `onComplete`
callback and an `isAnimating` getter.
- `NodeBluePrint.propagateOnChangeOnly` (with an optional `changeComparator`):
when enabled, a node only schedules its customers when its freshly produced
product differs from the previous one, so a high-frequency or jittery input
does not cascade redundant recomputations through the graph. `AnimatedNode`
enables this by default.
- `NodeBluePrint.createNode`: the single overridable node-construction hook,
routed through by both `instantiate` and `Scope.findOrCreateNode`, so
`NodeBluePrint` subtypes are honored on every creation path.
- `Scm.tickCount`: monotonic counter of the ticks that nominated the
animated nodes.
- `Scm.drainMode` (opt-in): process all production waves within a single
scheduled cycle instead of one readiness wave per event-loop cycle - deep
chains then propagate within a single cycle.
- `Scope.mermaid` accepts a `markdownFormat` option to print the mermaid
graph wrapped as GitHub or Azure markdown.
- `Node.deepSuppliers` / `Node.deepCustomers` with a negative depth return
ALL transitive suppliers/customers, each exactly once (previously the
enumeration was exponential on diamond-shaped graphs).
- `benchmark/supply-chain-benchmark.ts`: new `nestedScopes` and `drainChain`
scenarios.

### Changed

- `Scope.testRestIdCounter` was renamed to `testResetIdCounter`. The old,
misspelled name is kept as a deprecated forwarding alias.
- `Scope.findOrCreateNodes` honors its `applyScBuilders` option (it was
hardcoded to `true` before).
- Updated dev dependencies.

### Performance

- `Scm` indexes nodes by key: `nodesWithKey` is O(1) and `Scope.findNode`
fails fast via the new `Scm.hasNodesWithKey` when no node with the searched
key exists at all.
- Smart nodes are additionally indexed by the last segment of their master
path; creating a new node only evaluates the smart nodes that can actually
connect to it.
- The ready queues are only revalidated when an event occurred that can
invalidate queue entries (staging, priority changes, disposals, removals,
supplier re-initializations).
- Priority updates are incremental: only the supplier cone of the nodes
whose priority changed is invalidated and recomputed, iteratively (no
recursion, no stack overflow on deep chains).
- The 'on' meta scope is created lazily on first access; constructing it
eagerly doubled the cost of every scope instantiation.
- `ScopeBluePrint.instantiate` applies parent builders only once for the
outermost scope of an instantiation instead of once per subtree.

### Fixed

- Change-gating (`propagateOnChangeOnly`) no longer strands the staged
customer cone when a production is gated. Previously a customer with a
second supplier could never become ready again, deadlocking the whole
pipeline (`Scm.flush()` spun forever and all animations froze).
- The change gate compares against the product the customers last received
instead of the freshly overwritten one. Previously every external
`product =` write on a writable gated node and every un-mocking transition
was silently swallowed, and a tolerance-based `changeComparator` re-based
its baseline on every gated production so unbounded drift never propagated.
- `AnimatedNode` frames are tick-aware (via the new `Scm.tickCount`): a
supplier re-emitting the same value between ticks no longer fast-forwards
the animation, and a target changing on every tick no longer freezes the
output - the node keeps easing toward the latest target, consuming at most
one frame per tick.
- A retarget to the current output value (snap) settles the frame counter;
previously later same-value writes advanced a phantom animation and fired
`onComplete` spuriously.
- `onComplete` fires after the final product is applied and the production
is finalized - the callback observes the settled value and may safely
mutate the graph (e.g. dispose the node).
- The `AnimatedNodeBluePrint` default `equals` treats NaN as equal to NaN; a
NaN target no longer restarts the animation on every tick forever.
- Output gating of animated nodes always uses exact equality. A
user-supplied tolerance `equals` cannot swallow intermediate animation
frames.
- `AnimatedNodeBluePrint.copyWith` and `connectSupplier` preserve the
animated subtype, so deriving or rewiring an animated blue print (e.g. via
`ScopeBluePrint` connections or smart masters) keeps the animation. Pairing
the blue print with a non-animated node (e.g. as an insert or via
`addBluePrint` on a plain node) throws a descriptive `StateError`.
- `AnimatedNode` reads its animation config live from the blue print, so
replacing the blue print on a live node takes effect. Overlaying a
non-animated blue print or setting `mockedProduct` stops the animation
instead of leaving the node in the SCM's animated set producing on every
tick forever.
- Disposing any node clears `isAnimated`, so a node disposed while animated
(kept alive by remaining customers) no longer stalls its remaining
customers.
- Nodes disposed while their production batch is running are skipped and
removed from the prepared sets instead of keeping the pipeline open.
- `Scope.findOrCreateNode` validates the blue print (`check()`) before
creating the node, so misconfigured blue prints fail with a clear
`ArgumentError` instead of failing later during production.
- The mermaid markdown goldens are written to unique files per graph.

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
