// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Disposed } from './disposed.ts';
import { Duration } from './duration.ts';
import { assert } from './internal/assert.ts';
import { ArgumentError, StateError } from './internal/errors.ts';
import { FakeStopwatch, type StopwatchLike } from './internal/fake-stopwatch.ts';
import { FakeTimer, type TimerLike } from './internal/fake-timer.ts';
import { OncePerCycle } from './internal/once-per-cycle.ts';
import { Priority } from './priority.ts';
import { Scope } from './scope.ts';

import type { Insert } from './insert.ts';
import type { Node } from './node.ts';
import type { ScheduleTask, Task } from './schedule-task.ts';

// .............................................................................
/* v8 ignore start -- production-only real stopwatch; tests use FakeStopwatch */
/** A real (performance-based) stopwatch used outside of tests. */
class RealStopwatch implements StopwatchLike {
  private accumulatedMicros = 0;
  private startMicros = 0;
  private running = false;

  private now(): number {
    return performance.now() * 1000;
  }

  get elapsed(): Duration {
    const micros =
      this.accumulatedMicros +
      (this.running ? this.now() - this.startMicros : 0);
    return Duration.fromMicroseconds(Math.round(micros));
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.startMicros = this.now();
    this.running = true;
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.accumulatedMicros += this.now() - this.startMicros;
    this.running = false;
  }

  reset(): void {
    this.accumulatedMicros = 0;
    this.startMicros = this.now();
  }
}
/* v8 ignore stop */

// .............................................................................
/* v8 ignore start -- production-only real timer; tests use FakeTimer */
/** A real periodic timer used outside of tests. */
class RealTimer implements TimerLike {
  private handle: ReturnType<typeof setInterval> | undefined;
  private active = true;

  constructor(interval: Duration, callback: (timer: RealTimer) => void) {
    this.handle = setInterval(
      () => callback(this),
      Math.max(0, interval.inMilliseconds),
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  cancel(): void {
    this.active = false;
    if (this.handle !== undefined) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
  }
}
/* v8 ignore stop */

/** SCM - Supply Chain Manager: Controls the data flow in the supply chain. */
export class Scm {
  /** Is used for testing. */
  isTest: boolean;

  /** Disable additional checks. */
  static extraChecks = true;

  /** The root supply chain. */
  rootScope!: Scope;

  /** Manages disposed nodes and scopes. */
  disposedItems!: Disposed;

  /** Set to true if production timeouts should block. */
  shouldTimeOut = true;

  /** Timeout interval: nodes must not use more than 5ms for production. */
  readonly timeout = Duration.milliseconds(5);

  /**
   * Optional hook invoked when an asynchronous production rejects. When unset,
   * the error is rethrown on a microtask (the TS replacement for Dart's
   * `Zone.current.handleUncaughtError`).
   */
  onProductionError?: (node: Node<any>, error: unknown) => void;

  // Nodes
  private readonly nodesSet = new Set<Node<any>>();
  private readonly animatedNodesSet = new Set<Node<any>>();
  private readonly nodesNeedingSupplierUpdate = new Set<Node<any>>();
  private readonly nodesWithMissedSuppliers = new Set<Node<any>>();
  private readonly smartNodesSet = new Set<Node<any>>();

  // Processing stages
  private readonly nominatedNodesSet = new Set<Node<any>>();
  private readonly preparedNodesSet = new Set<Node<any>>();
  private readonly preparedInsertNodesSet = new Set<Node<any>>();
  private readonly preparedRealtimeNodesSet = new Set<Node<any>>();
  private readonly producingNodesSet = new Set<Node<any>>();

  // Ready-node queues, indexed by Priority.index.
  //
  // These queues are an acceleration index over the prepared sets above:
  // whenever a node enters the prepared sets and is ready to produce, it is
  // also added to the queue matching its priority. produce() then picks the
  // next batch from these queues in O(batch) instead of rescanning all
  // prepared nodes on every cycle. The prepared sets remain the source of
  // truth: queue entries are hints that are re-validated (and re-bucketed
  // when a node's priority changed) before production.
  private readonly readyNodes: Set<Node<any>>[] = Priority.values.map(
    () => new Set<Node<any>>(),
  );
  private readonly readyInsertNodes: Set<Node<any>>[] = Priority.values.map(
    () => new Set<Node<any>>(),
  );

  // In-flight asynchronous productions, keyed by node (one per node).
  private readonly asyncProductions = new Map<
    Node<any>,
    Promise<unknown>
  >();

  private schedulePreparation!: OncePerCycle;
  private scheduleProductionDebouncer!: OncePerCycle;
  private schedulePriorityUpdate!: OncePerCycle;

  private minProductionPriorityInner: Priority = Priority.realtime;

  private stopwatch!: StopwatchLike;
  private timeoutCheckTimer?: TimerLike;
  private testTimerInner?: FakeTimer;
  private testStopwatchInner!: FakeStopwatch;

  private readonly testNormalTasks: Task[] = [];
  private readonly testFastTasks: Task[] = [];

  /**
   * Supply chain manager constructor.
   * @param options - Whether this is a test instance.
   */
  constructor(options: { isTest?: boolean } = {}) {
    this.isTest = options.isTest ?? false;
    this.init();
  }

  private static _testInstance?: Scm;

  /**
   * Default supply chain manager for tests. Lazily created on first access
   * (matching Dart's lazy `static final`) to avoid running `new Scm()` during
   * module evaluation, which would break the ESM import cycle.
   */
  static get testInstance(): Scm {
    return (Scm._testInstance ??= new Scm({ isTest: true }));
  }

  /**
   * Example supply chain manager for test purposes.
   * @param options - Whether this is a test instance.
   */
  static example(options: { isTest?: boolean } = {}): Scm {
    return new Scm({ isTest: options.isTest ?? true });
  }

  /** Initializes suppliers. */
  initSuppliers(): void {
    this.initSuppliersInternal();
  }

  /** Returns an iterable of all nodes. */
  get nodes(): readonly Node<any>[] {
    return [...this.nodesSet];
  }

  /**
   * Returns all nodes having a given key.
   * @param key - The node key.
   */
  nodesWithKey<T>(key: string): readonly Node<T>[] {
    return [...this.nodesSet].filter((n) => n.key === key) as Node<T>[];
  }

  /**
   * Adds a node to scm.
   * @param node - The node to add.
   */
  addNode(node: Node<any>): void {
    this.assertNodeIsNotErased(node);
    this.nodesSet.add(node);
    this.nominate(node);
  }

  /**
   * Removes the node from scm.
   * @param node - The node to remove.
   */
  removeNode(node: Node<any>): void {
    this.nodesSet.delete(node);
    this.animatedNodesSet.delete(node);
    this.nominatedNodesSet.delete(node);
    this.removePreparedNode(node);
    this.producingNodesSet.delete(node);
    this.smartNodesSet.delete(node);
    this.nodesWithMissedSuppliers.delete(node);
    this.nodesNeedingSupplierUpdate.delete(node);
    this.asyncProductions.delete(node);
  }

  /**
   * Called by Node.dispose: removes the node from the prepared sets so
   * that disposed nodes do not keep the production pipeline open.
   * @param node - The disposed node.
   */
  removeDisposedNode(node: Node<any>): void {
    this.removePreparedNode(node);
  }

  /**
   * Adds node for initialization of suppliers.
   * @param node - The node needing supplier init.
   */
  needsInitSuppliers(node: Node<any>): void {
    this.nodesNeedingSupplierUpdate.add(node);
  }

  /**
   * Nominate node for production.
   * @param node - The node to nominate.
   */
  nominate(node: Node<any>): void {
    // If the node has no customers, it is more efficient to produce it
    // directly. Check the cheap O(1) conditions first; isReadyToProduce
    // scans the suppliers and is evaluated last.
    if (
      node.suppliers.length === 0 &&
      node.customers.length === 0 &&
      node.inserts.length === 0 &&
      node.isInitialized &&
      !node.isInsert &&
      !node.isDisposed &&
      node.isReadyToProduce
    ) {
      node.produce({ announce: false, triggerOnChange: true });

      // For asynchronous productions the node finalizes itself once its future
      // resolves (see Node._onAsyncResult). Only finalize synchronous ones.
      if (!node.isProducingAsync) {
        node.finalizeProduction();
      }
      return;
    }

    this.assertNodeIsNotErased(node);
    this.nominatedNodesSet.add(node);
    this.schedulePreparation.trigger();
  }

  /**
   * Inform scm about an update.
   * @param node - The node with a new product.
   * @param options - Optional extra-checks override.
   */
  hasNewProduct(node: Node<any>, options: { extraChecks?: boolean } = {}): void {
    const check = options.extraChecks ?? Scm.extraChecks;
    if (check && !this.producingNodesSet.has(node)) {
      throw new StateError(
        `Node "${node}" did call "hasNewProduct()" ` +
          'without being nominated before.',
      );
    }
    this.finalizeProduction(node);
  }

  // ...........................................................................
  // Asynchronous production

  /** The futures of all currently in-flight asynchronous productions. */
  get pendingAsyncProductions(): readonly Promise<unknown>[] {
    return [...this.asyncProductions.values()];
  }

  /**
   * Registers an in-flight asynchronous production. Called by Node.produce.
   * @param node - The producing node.
   * @param future - The production promise.
   */
  registerAsyncProduction(node: Node<any>, future: Promise<unknown>): void {
    this.asyncProductions.set(node, future);
  }

  /**
   * Unregisters an in-flight asynchronous production.
   * @param node - The node whose production completed.
   */
  unregisterAsyncProduction(node: Node<any>): void {
    this.asyncProductions.delete(node);
  }

  /**
   * Applies an asynchronous result that resolved after the node had already
   * been finalized with its previous product (its production timeout elapsed).
   * @param node - The node whose late result should propagate.
   */
  applyLateAsyncResult(node: Node<any>): void {
    this.producingNodesSet.add(node);
    this.finalizeProduction(node);
  }

  /**
   * Reports an asynchronous production error. Called by Node.
   * @param node - The failing node.
   * @param error - The error.
   */
  reportProductionError(node: Node<any>, error: unknown): void {
    const handler = this.onProductionError;
    if (handler !== undefined) {
      handler(node, error);
    } else {
      queueMicrotask(() => {
        throw error;
      });
    }
  }

  // ...........................................................................
  // Animation

  /** Returns currently animated nodes. */
  get animatedNodes(): readonly Node<any>[] {
    return [...this.animatedNodesSet];
  }

  /**
   * Starts to animate node.
   * @param node - The node to animate.
   */
  animateNode(node: Node<any>): void {
    this.animatedNodesSet.add(node);
  }

  /**
   * Stops to animate node.
   * @param node - The node to stop animating.
   */
  deanimateNode(node: Node<any>): void {
    this.animatedNodesSet.delete(node);
  }

  /** Call this method to trigger animation frame calculation. */
  tick(): void {
    this.tickInternal();
  }

  // ...........................................................................
  // Product life cycle

  /** List of nodes nominated for production. */
  get nominatedNodes(): readonly Node<any>[] {
    return [...this.nominatedNodesSet];
  }

  /** List of nodes prepared for production. */
  get preparedNodes(): readonly Node<any>[] {
    return [...this.preparedNodesSet];
  }

  /** List of nodes currently in production. */
  get producingNodes(): readonly Node<any>[] {
    return [...this.producingNodesSet];
  }

  // ...........................................................................
  // Priority

  /**
   * Inform the scm that a node's priority has changed.
   * @param node - The node whose priority changed.
   */
  priorityHasChanged(node: Node<any>): void {
    void node;
    this.schedulePriorityUpdate.trigger();
  }

  /** Nodes with a priority below this priority are not processed. */
  get minProductionPriority(): Priority {
    return this.minProductionPriorityInner;
  }

  /** Cleanup. */
  clear(): void {
    this.nominatedNodesSet.clear();
    this.preparedNodesSet.clear();
    this.preparedInsertNodesSet.clear();
    this.producingNodesSet.clear();
    this.asyncProductions.clear();

    for (const queue of this.readyNodes) {
      queue.clear();
    }
    for (const queue of this.readyInsertNodes) {
      queue.clear();
    }
  }

  /**
   * Hands out monotonically increasing topological ranks for new nodes.
   *
   * Nodes keep their rank a valid topological order of the supplier graph
   * (suppliers before customers). This makes cycle detection cheap: adding
   * an edge from a lower to a higher rank can never close a cycle.
   */
  nextTopoRank(): number {
    return this.nextTopoRankCounter++;
  }

  private nextTopoRankCounter = 0;

  // ...........................................................................
  // SmartNodes

  /**
   * Update smartNodes.
   * @param node - The node to update.
   */
  updateSmartNodes(node: Node<any>): void {
    this.updateSmartNodesInternal(node);
  }

  // ######################
  // Testing
  // ######################

  /** Runs scheduled normal tasks. */
  testRunNormalTasks(): void {
    const tasksCopy = [...this.testNormalTasks];
    this.testNormalTasks.length = 0;
    for (const task of tasksCopy) {
      task();
    }
  }

  /** Runs scheduled fast tasks. */
  testRunFastTasks(): void {
    const tasksCopy = [...this.testFastTasks];
    this.testFastTasks.length = 0;
    for (const task of tasksCopy) {
      task();
    }
  }

  /** Returns currently scheduled fast tasks. */
  get testFastTasksList(): readonly Task[] {
    return this.testFastTasks;
  }

  /** Returns currently scheduled normal tasks. */
  get testNormalTasksList(): readonly Task[] {
    return this.testNormalTasks;
  }

  /**
   * Runs all synchronous tasks until they are done.
   * @param options - Whether to tick.
   */
  flush(options: { tick?: boolean } = {}): void {
    const tick = options.tick ?? true;
    if (tick) {
      this.tickInternal();
    }

    while (
      this.testFastTasks.length > 0 ||
      this.testNormalTasks.length > 0 ||
      this.nodesNeedingSupplierUpdate.size > 0
    ) {
      if (this.nodesNeedingSupplierUpdate.size > 0) {
        this.initSuppliers();
      }

      this.testRunNormalTasks();
      this.testRunFastTasks();

      if (tick && !this.preparedNodesAreEmpty) {
        this.tickInternal();
      }
    }

    this.initMissedSuppliers();
  }

  /**
   * Like {@link flush}, but also awaits in-flight asynchronous productions
   * until the supply chain is quiescent.
   * @param options - Whether to tick.
   */
  async settle(options: { tick?: boolean } = {}): Promise<void> {
    const tick = options.tick ?? true;
    let guard = 0;
    for (;;) {
      this.flush({ tick });

      const quiescent =
        this.asyncProductions.size === 0 &&
        this.testFastTasks.length === 0 &&
        this.testNormalTasks.length === 0 &&
        this.nodesNeedingSupplierUpdate.size === 0 &&
        this.preparedNodesAreEmpty &&
        this.producingNodesSet.size === 0;
      if (quiescent) {
        break;
      }

      /* v8 ignore next -- settle is only re-entered while async productions are in flight */
      if (this.asyncProductions.size > 0) {
        await Promise.allSettled([...this.asyncProductions.values()]);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      /* v8 ignore start -- defensive convergence guard; unreachable unless circular async re-nomination */
      if (++guard > 10000) {
        throw new StateError(
          'settle() did not converge - possible circular async re-nomination.',
        );
      }
      /* v8 ignore stop */
    }
  }

  /**
   * Alias for {@link settle}.
   * @param options - Whether to tick.
   */
  flushAsync(options: { tick?: boolean } = {}): Promise<void> {
    return this.settle(options);
  }

  /** Clears all scheduled tasks. */
  testClearScheduledTasks(): void {
    this.testNormalTasks.length = 0;
    this.testFastTasks.length = 0;
  }

  /** Returns the test timer. */
  get testTimer(): FakeTimer | undefined {
    return this.testTimerInner;
  }

  /** Returns the test stopwatch. */
  get testStopwatch(): FakeStopwatch {
    return this.testStopwatchInner;
  }

  // ######################
  // Private
  // ######################

  private init(): void {
    this.initStopWatch();
    this.initDisposed();
    this.initSchedulePreparation();
    this.initScheduleProduction();
    this.initSchedulePriorityUpdate();
    this.initRootScope();
  }

  private get scheduleFast(): ScheduleTask {
    return this.isTest
      ? this.testScheduleFast
      : (task: Task) => queueMicrotask(task);
  }

  private get scheduleNormal(): ScheduleTask {
    return this.isTest
      ? this.testScheduleNormal
      : (task: Task) => {
          void Promise.resolve().then(task);
        };
  }

  private readonly testScheduleFast: ScheduleTask = (task: Task) => {
    this.testFastTasks.push(task);
  };

  private readonly testScheduleNormal: ScheduleTask = (task: Task) => {
    this.testNormalTasks.push(task);
  };

  private initSchedulePreparation(): void {
    this.schedulePreparation = new OncePerCycle({
      task: () => this.prepare(),
      scheduleTask: this.scheduleFast,
    });
  }

  private initScheduleProduction(): void {
    this.scheduleProductionDebouncer = new OncePerCycle({
      task: () => this.produce(),
      scheduleTask: this.scheduleNormal,
    });
  }

  private initSchedulePriorityUpdate(): void {
    this.schedulePriorityUpdate = new OncePerCycle({
      task: () => this.updatePriorities(),
      scheduleTask: this.scheduleFast,
    });
  }

  private initRootScope(): void {
    this.rootScope = Scope.root({ key: 'root', scm: this });
  }

  private initDisposed(): void {
    this.disposedItems = new Disposed({ scm: this });
  }

  private get preparedNodesAreEmpty(): boolean {
    return (
      this.preparedNodesSet.size === 0 && this.preparedInsertNodesSet.size === 0
    );
  }

  private tickInternal(): void {
    // Process also nodes with frame priority
    this.minProductionPriorityInner = Priority.frame;

    // Don't produce new frames if old items are still producing
    if (!this.preparedNodesAreEmpty) {
      const isNotProducing = this.producingNodesSet.size === 0;
      if (isNotProducing) {
        this.scheduleProduction();
      }
      return;
    }

    // Nominate all animated nodes
    for (const node of this.animatedNodesSet) {
      this.nominatedNodesSet.add(node);
    }

    // Start preparation
    this.schedulePreparation.trigger();
  }

  private initSuppliersInternal(): void {
    for (const node of this.nodesNeedingSupplierUpdate) {
      this.addSuppliers(node, { throwIfNotThere: false });
    }
    this.nodesNeedingSupplierUpdate.clear();
  }

  private initMissedSuppliers(): void {
    for (const node of this.nodesWithMissedSuppliers) {
      this.addSuppliers(node, { throwIfNotThere: true });
    }
    this.addPreparedNodes([...this.nodesWithMissedSuppliers]);
    this.nodesWithMissedSuppliers.clear();
  }

  private addSuppliers(
    node: Node<any>,
    options: { throwIfNotThere: boolean },
  ): void {
    const suppliers = new Map<string, Node<any>>();
    for (const supplierPath of node.bluePrint.suppliers) {
      const supplier = node.scope.findNode<any>(supplierPath, {
        excludedNodes: [node],
      });

      if (supplier === undefined) {
        if (options.throwIfNotThere) {
          throw new ArgumentError(
            `Node "${node.path}": ` +
              `Supplier with key "${supplierPath}" not found.`,
          );
        } else {
          this.nodesWithMissedSuppliers.add(node);
          this.removePreparedNode(node);
          this.nominatedNodesSet.delete(node);
          return;
        }
      }

      const supplierPathWithoutDots = supplierPath.startsWith('../')
        ? supplierPath.substring(3)
        : supplierPath;

      suppliers.set(supplierPathWithoutDots, supplier);
    }

    node.initSuppliers(suppliers);
  }

  // ...........................................................................
  // Preparation

  private prepare(): void {
    if (
      this.nodesNeedingSupplierUpdate.size > 0 ||
      this.nodesWithMissedSuppliers.size > 0
    ) {
      this.initSuppliers();
    }

    for (const node of [...this.nominatedNodesSet]) {
      this.prepareNode(node);
    }

    this.addPreparedNodes([...this.nominatedNodesSet]);
    this.nominatedNodesSet.clear();
    this.scheduleProduction();
  }

  /**
   * Prepares a node and its customers.
   *
   * Implemented iteratively with an explicit stack: the customer graph can
   * be deeper than the call stack allows (a recursive implementation
   * overflows on chains of a few thousand nodes).
   * @param node - The node to prepare.
   */
  private prepareNode(node: Node<any>): void {
    const stack: Node<any>[] = [node];

    while (stack.length > 0) {
      const current = stack.pop()!;

      // Node is already prepared?
      const isAlreadyPrepared = !current.needsPreparation();
      if (isAlreadyPrepared) {
        continue;
      }

      // Nodes needs preparation? Prepare.
      current.prepare();

      // Prepare all inserts
      for (const insert of current.inserts) {
        stack.push(insert);
      }

      // If node is a insert
      if (current.isInsert) {
        this.prepareInsert(current as unknown as Insert<any>, stack);
      }

      // Prepare also all customers
      for (const customer of current.customers) {
        stack.push(customer);
      }
    }
  }

  private prepareInsert(node: Insert<any>, stack: Node<any>[]): void {
    // Last insert? Prepare also host's customers
    if (node.isLastInsert) {
      for (const customer of node.host.customers) {
        stack.push(customer);
      }
    }
    // Not last insert? Prepare the following inserts
    else {
      let isLaterInsert = false;
      for (const insert of node.host.inserts) {
        if (insert === (node as unknown)) {
          isLaterInsert = true;
          continue;
        }
        if (isLaterInsert) {
          stack.push(insert);
        }
      }
    }
  }

  private get preparedRealtimeNodesExist(): boolean {
    return this.preparedRealtimeNodesSet.size > 0;
  }

  private scheduleProduction(): void {
    const schedule = this.preparedRealtimeNodesExist
      ? this.scheduleFast
      : this.scheduleNormal;
    this.scheduleProductionDebouncer.trigger(schedule);
  }

  // ...........................................................................
  // Production

  private produce(): void {
    if (this.preparedNodesAreEmpty) {
      return;
    }

    // Start timeout timer
    if (this.shouldTimeOut) {
      this.startTimeoutCheck();
    }

    // Drop stale queue entries and move nodes whose priority has changed
    // since they became ready into the right queue.
    this.revalidateReadyQueues();

    // Process nodes grouped by priority
    for (const priority of [...Priority.values].reverse()) {
      // Don't process priorities below minimum production priority
      if (priority.value < this.minProductionPriorityInner.value) {
        continue;
      }

      // Get nodes that have the desired priority
      // Process inserts first
      const insertQueue = this.readyInsertNodes[priority.index];
      const queue =
        insertQueue.size > 0 ? insertQueue : this.readyNodes[priority.index];

      // Continue if no such nodes are available
      if (queue.size === 0) {
        continue;
      }

      const batch = [...queue];
      queue.clear();
      this.produceBatch(batch);

      // We process only nodes of one priority level in a cycle.
      // Thus we are making sure that all nodes of a given priority are
      // processed before the others start.
      return;
    }

    // Fallback: The queues are empty, but prepared nodes exist. This happens
    // e.g. when nodes were put into the prepared sets from outside without
    // going through addPreparedNodes. Fall back to scanning the prepared
    // sets like the queues never existed. Ready nodes found here are rare;
    // the scan keeps the queue optimization safe without changing behavior.
    for (const priority of [...Priority.values].reverse()) {
      if (priority.value < this.minProductionPriorityInner.value) {
        continue;
      }

      const insertsReadyToProduce = this.readyNodesOfPriority(
        this.preparedInsertNodesSet,
        priority,
      );

      const nodesOfPriority =
        insertsReadyToProduce.length > 0
          ? insertsReadyToProduce
          : this.readyNodesOfPriority(this.preparedNodesSet, priority);

      if (nodesOfPriority.length === 0) {
        continue;
      }

      this.produceBatch(nodesOfPriority);
      return;
    }
  }

  /**
   * Returns the nodes of the given set that are ready to produce with the
   * given priority.
   * @param nodes - The set of nodes to scan.
   * @param priority - The priority to filter for.
   */
  private readyNodesOfPriority(
    nodes: Set<Node<any>>,
    priority: Priority,
  ): Node<any>[] {
    return [...nodes].filter(
      (n) => n.isReadyToProduce && n.priority === priority,
    );
  }

  /**
   * Produces a batch of nodes of one priority level.
   * @param batch - The nodes to produce.
   */
  private produceBatch(batch: readonly Node<any>[]): void {
    for (const node of batch) {
      // Remove node from preparedNodes
      this.removePreparedNode(node);

      // Reset timeout state
      node.isTimedOut = false;
      node.productionStartTime = this.stopwatch.elapsed;

      assert(node.isReadyToProduce);

      // Produce
      /* v8 ignore next -- defensive guard: a prepared node asserted ready is never disposed here */
      if (!node.isDisposed) {
        // Add node to producing nodes
        this.producingNodesSet.add(node);
        node.produce();
      }
    }
  }

  /**
   * Removes stale entries from the ready queues and moves entries whose
   * priority changed since enqueueing into the queue of their current
   * priority.
   *
   * A queue entry is stale when the node was disposed, left the prepared
   * sets, or is no longer ready to produce (e.g. because a supplier was
   * re-nominated). Nodes becoming ready again are re-enqueued by
   * addPreparedNodes when their supplier finalizes.
   */
  private revalidateReadyQueues(): void {
    this.revalidateReadyQueuesOfKind(
      this.readyInsertNodes,
      this.preparedInsertNodesSet,
    );
    this.revalidateReadyQueuesOfKind(this.readyNodes, this.preparedNodesSet);
  }

  private revalidateReadyQueuesOfKind(
    queues: Set<Node<any>>[],
    preparedNodes: Set<Node<any>>,
  ): void {
    for (let i = 0; i < queues.length; i++) {
      const queue = queues[i];
      if (queue.size === 0) {
        continue;
      }

      let movedNodes: Node<any>[] | undefined;

      for (const node of [...queue]) {
        if (
          node.isDisposed ||
          !preparedNodes.has(node) ||
          !node.isReadyToProduce
        ) {
          queue.delete(node);
          continue;
        }

        if (node.priority.index !== i) {
          (movedNodes ??= []).push(node);
          queue.delete(node);
        }
      }

      if (movedNodes !== undefined) {
        for (const node of movedNodes) {
          queues[node.priority.index].add(node);
        }
      }
    }
  }

  private addPreparedNodes(nodes: readonly Node<any>[]): void {
    for (const node of nodes) {
      if (node.isInsert) {
        this.preparedInsertNodesSet.add(node);
      } else {
        this.preparedNodesSet.add(node);
      }

      const priority = node.priority;

      if (priority === Priority.realtime) {
        this.preparedRealtimeNodesSet.add(node);
      }

      // Nodes that are ready to produce are added to the matching ready
      // queue. Nodes that are not ready yet will be re-added when their
      // supplier finalizes production (finalizeProduction).
      if (node.isReadyToProduce) {
        const queues = node.isInsert ? this.readyInsertNodes : this.readyNodes;
        queues[priority.index].add(node);
      }
    }
  }

  private removePreparedNode(node: Node<any>): void {
    if (node.isInsert) {
      this.preparedInsertNodesSet.delete(node);
    } else {
      this.preparedNodesSet.delete(node);
    }

    if (node.priority === Priority.realtime) {
      this.preparedRealtimeNodesSet.delete(node);
    }
  }

  private finalizeProduction(node: Node<any>): void {
    this.producingNodesSet.delete(node);
    node.finalizeProduction();
    this.addPreparedNodes(node.inserts);
    this.addPreparedNodes(node.customers);
    this.finalizeInsert(node);
    this.scheduleProduction();

    if (this.preparedNodesAreEmpty) {
      this.initMissedSuppliers();
    }

    if (this.preparedNodesAreEmpty) {
      this.resetMinimumProductionPriority();
      this.stopTimeoutCheck();
    }
  }

  private finalizeInsert(node: Node<any>): void {
    if (node.isInsert) {
      const insert = node as unknown as Insert<any>;
      if (insert.isLastInsert) {
        this.addPreparedNodes(insert.host.customers);
      } else {
        this.addPreparedNodes([insert.output]);
      }
    }
  }

  // ...........................................................................
  // Priority handling

  private resetMinimumProductionPriority(): void {
    this.minProductionPriorityInner = Priority.realtime;
  }

  private updatePriorities(): void {
    this.resetPriorities();
    for (const node of this.nodesSet) {
      this.updatePriorityForNode(node);
    }
  }

  private resetPriorities(): void {
    for (const node of this.nodesSet) {
      node.customerPriority = undefined;
    }
  }

  private updatePriorityForNode(node: Node<any>): void {
    if (node.customerPriority !== undefined) {
      return;
    }

    let highestChildPriority = Priority.lowest;

    for (const customer of node.customers) {
      this.updatePriorityForNode(customer);
      if (customer.priority.value > highestChildPriority.value) {
        highestChildPriority = customer.priority;
      }
    }

    node.customerPriority = highestChildPriority;
  }

  // ...........................................................................
  // Handle timeouts

  private initStopWatch(): void {
    this.stopwatch = this.isTest
      ? this.testCreateStopWatch()
      : /* v8 ignore next -- production-only real stopwatch */ new RealStopwatch();
    this.stopwatch.start();
  }

  private testCreateStopWatch(): StopwatchLike {
    this.testStopwatchInner = new FakeStopwatch();
    return this.testStopwatchInner;
  }

  /**
   * Starts an interval timer checking for production timeouts.
   *
   * If a check timer is already running it is reused. Previously a new
   * periodic timer was created on every production cycle without
   * cancelling the old one, leaking one timer per cycle.
   */
  private startTimeoutCheck(): void {
    if (this.timeoutCheckTimer !== undefined) {
      return;
    }

    const interval = Duration.milliseconds(
      Math.trunc(this.timeout.inMilliseconds / 2),
    );

    if (this.isTest) {
      this.testTimerInner = FakeTimer.periodic(interval, (t) =>
        this.checkForTimeouts(t),
      );
      this.timeoutCheckTimer = this.testTimerInner;
    } else {
      /* v8 ignore start -- production-only real timer branch */
      this.timeoutCheckTimer = new RealTimer(interval, (t) =>
        this.checkForTimeouts(t),
      );
      this.testTimerInner = undefined;
      /* v8 ignore stop */
    }
  }

  private stopTimeoutCheck(): void {
    this.timeoutCheckTimer?.cancel();
    this.timeoutCheckTimer = undefined;
    this.testTimerInner = undefined;
  }

  private checkForTimeouts(timer: TimerLike): void {
    void timer;
    /* v8 ignore start -- guard: the timer only fires while nodes are producing */
    if (this.producingNodesSet.size === 0) {
      this.stopTimeoutCheck();
    }
    /* v8 ignore stop */

    for (const node of [...this.producingNodesSet]) {
      const currentTime = this.stopwatch.elapsed;
      const isTimeout = currentTime
        .minus(node.productionStartTime)
        .greaterThanOrEqualTo(node.productionTimeout);

      if (isTimeout) {
        node.isTimedOut = true;
        this.finalizeProduction(node);
      }
    }
  }

  private assertNodeIsNotErased(node: Node<any>): void {
    if (!Scm.extraChecks) {
      return;
    }
    assert(
      !node.isErased,
      `${node.scope}/${node.key} with id ${node.id} is disposed.`,
    );
  }

  // ...........................................................................
  // Smart nodes

  private connectNewSmartNodeToPotentialMasters(
    smartNode: Node<any>,
    options: { newPotentialMaster?: Node<any> } = {},
  ): void {
    const newPotentialMaster = options.newPotentialMaster;

    if (newPotentialMaster !== undefined) {
      const couldBeMaster = newPotentialMaster.couldBeMasterOf(smartNode);
      if (!couldBeMaster) {
        return;
      }

      if (
        !newPotentialMaster.isDisposed &&
        smartNode.suppliers.includes(newPotentialMaster)
      ) {
        return;
      }
    }

    const masterNode = smartNode.findSmartMaster();

    if (masterNode === undefined || masterNode.isDisposed) {
      smartNode.needsInitSuppliers();
      smartNode.resetSmartNodeReplacements();
      return;
    }

    if (smartNode.suppliers.includes(masterNode)) {
      return;
    }

    smartNode.resetSmartNodeReplacements();
    smartNode.addSmartNodeReplacement(
      smartNode.bluePrint.connectSupplier(masterNode.path),
    );
    smartNode.needsInitSuppliers();
  }

  private connectNewMasterNodeToPotentialSmartNodes(
    newMaster: Node<any>,
  ): void {
    for (const smartNode of this.smartNodesSet) {
      this.connectNewSmartNodeToPotentialMasters(smartNode, {
        newPotentialMaster: newMaster,
      });
    }
  }

  private updateSmartNodesInternal(node: Node<any>): void {
    if (node.isSmartNode) {
      if (node.isDisposed) {
        this.smartNodesSet.delete(node);
        return;
      }

      this.smartNodesSet.add(node);
      this.connectNewSmartNodeToPotentialMasters(node);
      return;
    }

    this.connectNewMasterNodeToPotentialSmartNodes(node);
  }
}
