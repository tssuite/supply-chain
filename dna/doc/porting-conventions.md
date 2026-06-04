# Dart → TypeScript Porting Conventions (supply_chain)

This document is the binding reference for porting the Dart library
`/Users/gatzsche/dev/ggsuite/supply_chain` to TypeScript in
`/Users/gatzsche/dev/tssuite/supply-chain`. Follow it exactly so independently
ported files integrate cleanly.

## General

- Pure reimplementation (no WASM). Keep class/type/method names **identical** to
  Dart (including the `BluePrint` capitalization). File names are kebab-case
  (`node-blue-print.ts`); Dart `snake_case` → kebab-case.
- Every file starts with this header:
  ```
  // @license
  // Copyright (c) 2025 tssuite
  //
  // Use of this source code is governed by terms that can be
  // found in the LICENSE file in the root of this package.
  ```
- All imports use an explicit `.ts` extension, e.g. `import { Scope } from './scope.ts';`.
- TSDoc doc-comments on public members (description required; `@param name - desc`
  form; `@typeParam T - desc` allowed). Do **not** add `@returns` or param type
  annotations. `tsdoc/syntax` must pass.
- Match the surrounding code style: 2-space indent, single quotes, trailing commas,
  80-col where reasonable (prettier will reformat).

## Already-ported modules (import, do not redefine)

- `./priority.ts` — `class Priority { readonly value: number; readonly name: string;
  static frame; static realtime; static structure; static values: readonly Priority[];
  static get lowest; static get highest; }`. Compare by `===` (singletons); order by `.value`.
- `./duration.ts` — `class Duration { readonly inMicroseconds; constructor(parts:{days?,hours?,
  minutes?,seconds?,milliseconds?,microseconds?}); static zero; static fromMicroseconds(n);
  static milliseconds(n); static seconds(n); get inMilliseconds; get inSeconds; plus(o); minus(o);
  compareTo(o); greaterThanOrEqualTo(o); equals(o); }`.
- `./tools.ts` — `isCamelCase(s: string): boolean`. (Add more collection helpers here if needed:
  `firstWhereOrNull`, `whereType`, `listEquals` — but prefer inline `arr.find(...) ?? undefined`.)
- `./keys.ts` — `keys: readonly string[]; nextKey(): string; testSetNextKeyCounter(n)`.
- `./owner.ts` — `class Owner<T> { readonly willDispose?,didDispose?,willUndispose?,didUndispose?,
  willErase?,didErase?: (item:T)=>void; constructor(cb?={}); static example }`.
- `./schedule-task.ts` — `type Task=()=>void; type ScheduleTask=(t:Task)=>void; exampleTask; exampleScheduleTask`.
- `./internal/errors.ts` — `class ArgumentError extends Error`, `class StateError extends Error`,
  `class AssertionError extends Error` (each `constructor(message?: string)`).
- `./internal/assert.ts` — `assert(condition: unknown, message?: string): asserts condition`
  (throws `AssertionError`). `setAssertionsEnabled(b)`, `assertionsAreEnabled()`.
- `./internal/once-per-cycle.ts` — `class OncePerCycle { constructor({task:Task, isTest?:boolean,
  scheduleTask?:ScheduleTask}); task; scheduleTask; trigger(scheduleTask?:ScheduleTask); executeNow(); dispose(); }`.
- `./internal/fake-timer.ts` — `interface TimerLike { readonly isActive:boolean; cancel():void }`;
  `class FakeTimer implements TimerLike { constructor(interval:Duration, cb:()=>void, isPeriodic:boolean);
  static periodic(d:Duration, cb:(t:FakeTimer)=>void):FakeTimer; static run(cb); elapse(p:Duration); fire();
  get tick; get isActive; get isCancelled; cancel(); readonly interval:Duration; readonly isPeriodic:boolean; }`.
- `./internal/fake-stopwatch.ts` — `interface StopwatchLike { readonly elapsed:Duration; readonly isRunning:boolean;
  start();stop();reset() }`; `class FakeStopwatch implements StopwatchLike { constructor(elapsed?:()=>Duration);
  get frequency; start;stop;reset; get elapsedTicks; elapse(p:Duration); get elapsed; get elapsedMicroseconds;
  get elapsedMilliseconds; get isRunning; }`.

## Cluster modules being ported in parallel (use these exact class names; import with `.ts`)

- `./node-blue-print.ts` — `class NodeBluePrint<T>`; `type Produce<T> = (components: any[],
  previousProduct: T, node: Node<T>) => T | Promise<T>`; `doNothing<T>`; `type FromJson<T>`,
  `FromString<T>`, `ToJson<T>`; `nbp<T>({from,to,init,produce?})`.
  Key members: `key:string`, `initialProduct:T`, `documentation:string`,
  `suppliers: readonly string[]`, `allowedProducts: T[]`, `produce: Produce<T>`,
  `productionTimeout?: Duration`, `canBeSmart:boolean`, `get smartMaster: string[]`,
  `get isSmartNode`, `instantiate({scope:Scope, applyScBuilders?:boolean, owner?:Owner<Node<any>>}): Node<T>`,
  `instantiateAsInsert({host:Node<T>, scope?:Scope, index?:number}): Insert<T>`,
  `copyWith({...}): NodeBluePrint<T>`, `forwardTo(k)`, `connectSupplier(s)`,
  static `map({supplier,toKey,initialProduct,fromJson?})`, static `example({key?,produce?})`,
  `equals(other):boolean`, `toJson(product):unknown`, `fromJson(value):T`, `castMap(map):T`,
  static `addJsonParser<T>(fn)`, `removeJsonParser<T>()`, `addStringParser<T>(fn)`,
  `addJsonSerializer<T>(fn)`, `clearParsers()`, `check()`.
- `./scope-blue-print.ts` — `class ScopeBluePrint`; plus `ExampleScopeBluePrint`, `ExampleScopeBluePrintSimple`.
  Key members: `key:string`, `get aliases`, `matchesKey(k)`, `get nodes: NodeBluePrint<any>[]`,
  `get children: ScopeBluePrint[]`, `child(k)`, `get connections: Map<string,string>`,
  `get builders: ScBuilderBluePrint[]`, `node<T>(k)`, `findItem(path):[unknown, string|undefined]`,
  `findNode<T>(path)`, `absoluteNodePath(path)`, `allNodePathes({appendRootScopeKey?})`,
  `instantiate({scope:Scope, connect?, initScBuilders?, owner?}): Scope`, `copyWith({...})`,
  `get smartMaster`, `get isSmartScope`, `canBeSmart`, `willInstantiate()`, `onInstantiate(scope)`,
  `onDispose(scope)`, `buildNodes()/buildScopes()/buildScBuilders()/buildAliases()/buildConnections()`,
  static `fromJson(json, {connect?})`, static `example({key?})`, static `mergeNodes({original,overrides})`,
  static `mergeScopes({original,overrides})`.
  NOTE: Dart record `(dynamic, String?)` from `findItem` → TS tuple `[unknown, string | undefined]`.
- `./scope-blue-print-factory.ts` — `class ScopeBluePrintFactory extends NodeBluePrint<ScopeBluePrint[]>`.
- `./node.ts` — `class Node<T>`. Constructor: `new Node<T>({bluePrint:NodeBluePrint<T>, scope:Scope,
  owner?:Owner<Node<any>>, isInsert?:boolean})`. Has `isInsert:boolean` getter/field (set true by Insert).
- `./scope.ts` — `class Scope`. Static factories `Scope.root({key,scm})`, `Scope.metaScope({key,parent})`,
  `Scope.example({...})`; main creation `new Scope({parent, bluePrint, owner?, isMetaScope?})`.
- `./scm.ts` — `class Scm`. `new Scm({isTest?})`; `static testInstance`; `static example({isTest?})`.
- `./insert.ts` — `class Insert<T> extends Node<T>`. `new Insert<T>({bluePrint, host:Node<T>, scope?, index?})`.
- `./disposed.ts` — `class Disposed`. `new Disposed({scm:Scm})`.
- `./sc-builder.ts` — `class ScBuilder`. `./sc-builder-blue-print.ts` — `class ScBuilderBluePrint`.
  `./sc-builder-node-adder.ts`, `./sc-builder-node-replacer.ts`, `./sc-builder-scope-adder.ts`,
  `./sc-builder-inserts.ts`.

## Translation rules

- **Iterables**: Dart `Iterable<X>` getters → return `readonly X[]` (eager). `sync*`/`yield*` → build and
  return an array. Dart `Set<X>` → JS `Set<X>` (insertion-ordered, like LinkedHashSet). `Map<K,V>` → JS `Map`.
  `List<X>` → `X[]`.
- **Collection methods**: `firstWhereOrNull(p)` → `arr.find(p) ?? undefined`. `whereType<X>()` →
  `arr.filter((e): e is X => e instanceof X)` (or by a discriminator). `.where(p)` → `.filter(p)`.
  `.map(f)` → `.map(f)`. `.fold(init,(a,e)=>...)` → `.reduce((a,e)=>..., init)`. `.firstWhere(p)` →
  `arr.find(p)` (throw if needed). `.elementAt(i)` → `arr[i]`. `.first/.last` → `arr[0]/arr[arr.length-1]`.
  `.toSet()` → `new Set(arr)`. `.sublist(i)` → `arr.slice(i)`. `.indexWhere(p)` → `arr.findIndex(p)`.
  `.any(p)` → `.some(p)`. `.contains(x)` → `.includes(x)` (arrays) / `.has(x)` (Set/Map).
- **Named/factory constructors** → `static` factory methods + a constructor. When Dart's *main* constructor
  is a `factory` doing work, make a `static create({...})` or keep a constructor that does the work; match
  call sites in sibling files (see API contracts above for the chosen shape).
- **`late final X`** → declare `private x!: T` (definite assignment) or assign in constructor.
- **Nullability**: Dart `T?` → `T | undefined` (prefer `undefined`; map Dart `null` → `undefined`).
  `x == null` works for both; `??`, `?.`, `!` as in Dart. `x ??= y` → `x ??= y`.
- **Errors**: `throw ArgumentError(m)` → `throw new ArgumentError(m)`; `StateError` likewise;
  `throw Exception(m)` → `throw new Error(m)`. `assert(c, m)` → `assert(c, m)` (import from `./internal/assert.ts`).
  Catch `on NoSuchMethodError` → feature-detect instead (e.g. `typeof (x as any).toJson === 'function'`).
- **Equality**: Dart `identical(a,b)` → `a === b`. Dart `==` on objects that define `equals()` → `a.equals(b)`.
  Dart `==` on primitives/strings/enums → `===`. Do not override JS `==`.
- **`copyWith` returning `this` when unchanged**: preserve the early-return guard exactly.
- **Generics / runtime types**: TS erases generics. **int/double/num all collapse to `number`** — no
  numberKind, no int-vs-double distinction. `switch (value.runtimeType) { int|double|num => ...; String => ...;
  bool => ... }` → `switch (typeof value) { 'number': ...; 'string': ...; 'boolean': ... }`.
  `value is T` where T is generic → cannot check at runtime; for primitives use `typeof`; for the JSON
  registries key by a string type-id carried on the blueprint (handled in node-blue-print.ts).
  `node.runtimeType != Node<dynamic>` style asserts → drop or replace with a boolean flag the subclass sets.
- **`node is Insert` / `scope is X` cross-cycle checks**: do NOT use `instanceof` across the Node↔Insert
  cycle. `node.ts` must NOT runtime-import `insert.ts` (use `import type { Insert }`). Use the boolean
  `node.isInsert` (and cast `node as unknown as Insert<T>`) instead of `node instanceof Insert`.
- **Async (FutureOr)**: `Produce<T>` returns `T | Promise<T>`. Detect async via `result instanceof Promise`.
  `Future<T>` → `Promise<T>`. `scheduleMicrotask(f)` → `queueMicrotask(f)`. `Future.microtask(f)` →
  `(t) => { void Promise.resolve().then(t); }`. `Timer.periodic(d, cb)` (production) → wrap `setInterval`
  in a `TimerLike`; in test mode use `FakeTimer.periodic`. The timeout `Timer?` field type → `TimerLike | undefined`.
  `Future.wait(list).catchError(...)` → `Promise.allSettled(list)`. `Future.delayed(Duration.zero)` →
  `new Promise<void>((r) => setTimeout(r, 0))`. `Zone.current.handleUncaughtError(e)` (no TS Zone) →
  `queueMicrotask(() => { throw e; })`.
- **Stopwatch / Timer in Scm**: production uses a real stopwatch (`performance.now()`-based, implementing
  `StopwatchLike`) and real `setInterval`; test mode (`isTest`) uses `FakeStopwatch`/`FakeTimer`.
- **`toString()`** → `toString(): string`. Dart string interpolation `'$x'` → template literals `` `${x}` ``.

## Output rules for porting agents

- Read the assigned Dart source file in full, then output **only** the complete TypeScript file content for
  the target `src/<name>.ts` — no markdown fences, no commentary, no explanation.
- Faithfully reproduce behavior. Where a referenced sibling method/getter exists, use the Dart name verbatim
  (camelCase preserved). Prefer correctness and parity over cleverness.
- Add concise TSDoc descriptions to every public member (port the Dart doc comments).
