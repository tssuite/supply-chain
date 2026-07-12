// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Node } from './node.ts';
import { Scope } from './scope.ts';
import {
  AnimatedNodeBluePrint,
  linearCurve,
} from './animated-node-blue-print.ts';

import type { NodeBluePrint } from './node-blue-print.ts';
import type { Owner } from './owner.ts';

// .............................................................................
/**
 * A node that eases its output toward a new input value.
 *
 * An AnimatedNode has exactly one supplier: the target (input) value. When
 * the target changes, the node animates its own output from its current value
 * toward the new target over {@link AnimatedNodeBluePrint.totalFrames} frames,
 * producing one intermediate value per Scm.tick. The shape of the easing is
 * given by {@link AnimatedNodeBluePrint.curve}; the interpolation between two
 * values by {@link AnimatedNodeBluePrint.lerp}.
 *
 * The node manages {@link Node.isAnimated} itself: it starts animating when
 * the input changes and stops when the animation settles. The very first
 * input is snapped without animation (there is no previous value to animate
 * from).
 *
 * Frames advance with Scm.tick's: every production consumes at most one
 * frame, and only when a tick happened since the previous production. A
 * target change rebases the animation from the current output - and when the
 * production was tick-driven the animation still advances one frame, so a
 * target that changes on every tick keeps easing toward its latest value
 * instead of freezing at its old one.
 */
export class AnimatedNode<T> extends Node<T> {
  // ...........................................................................
  /**
   * Creates an animated node from the blue print within the scope.
   * @param p - The node configuration.
   */
  constructor(p: {
    bluePrint: AnimatedNodeBluePrint<T>;
    scope: Scope;
    owner?: Owner<Node<any>>;
  }) {
    super({ bluePrint: p.bluePrint, scope: p.scope, owner: p.owner });
    this._from = p.bluePrint.initialProduct;
    this._to = p.bluePrint.initialProduct;
    this._lastSeenInput = p.bluePrint.initialProduct;
    this._frame = p.bluePrint.totalFrames;
  }

  // ...........................................................................
  /** Returns true while an animation is in progress. */
  get isAnimating(): boolean {
    return this.isAnimated;
  }

  /**
   * Called once when an animation reaches its final frame.
   *
   * Invoked after the final product has been applied and the production has
   * been finalized - the callback observes the settled value and may safely
   * mutate the graph.
   */
  onComplete?: () => void;

  // ...........................................................................
  /** The current animation frame. Visible for testing. */
  get frame(): number {
    return this._frame;
  }

  /** The value the current animation started from. Visible for testing. */
  get from(): T {
    return this._from;
  }

  /** The value the current animation is heading toward. Visible for testing. */
  get to(): T {
    return this._to;
  }

  // ...........................................................................
  /**
   * Advances the animation and returns this production's value.
   *
   * Called by {@link AnimatedNodeBluePrint} on every production. A changed
   * input (re)starts the animation from the current output. At most one frame
   * is consumed per production, and only when a Scm.tick happened since the
   * previous production - a supplier re-emission between ticks returns the
   * current output unchanged.
   *
   * Internal - only meant to be called by AnimatedNodeBluePrint's produce.
   * @param components - The supplier products (exactly one: the target).
   * @param previousOutput - The previously produced output.
   */
  advance(components: unknown[], previousOutput: T): T {
    const input = components[0] as T;
    const config = this._config;
    const equals = config.isEqual;

    // Did a tick happen since the previous production? Only then a frame
    // may be consumed.
    const tick = this.scm.tickCount;
    const tickElapsed = tick !== this._lastSeenTick;
    this._lastSeenTick = tick;

    // First production: snap to the input, no animation.
    if (!this._initialized) {
      this._initialized = true;
      this._from = input;
      this._to = input;
      this._lastSeenInput = input;
      this._frame = config.totalFrames;
      return input;
    }

    // Input changed -> (re)start the animation from the current output.
    if (!equals(input, this._lastSeenInput)) {
      this._from = previousOutput;
      this._to = input;
      this._lastSeenInput = input;

      // Nothing to animate: snap and settle.
      if (equals(this._from, this._to)) {
        this._frame = config.totalFrames;
        this.isAnimated = false;
        return this._to;
      }

      this._frame = 0;
      this.isAnimated = true;

      // A tick-driven production still advances one frame - otherwise a
      // target changing on every tick would freeze the output forever.
      return tickElapsed ? this._advanceFrame(config) : this._from;
    }

    // Input unchanged and already settled: keep the settled value.
    if (this._frame >= config.totalFrames) {
      this.isAnimated = false;
      return this._to;
    }

    // No tick since the previous production (the supplier re-emitted the
    // same value): don't consume a frame.
    if (!tickElapsed) {
      return previousOutput;
    }

    return this._advanceFrame(config);
  }

  // ...........................................................................
  /** Finalizes production. */
  override finalizeProduction(): void {
    super.finalizeProduction();

    // Deferred from _advanceFrame: at this point the final product has been
    // applied and the node has left the production pipeline, so onComplete
    // observes the settled value and may safely mutate the graph.
    if (this._completePending) {
      this._completePending = false;
      this.onComplete?.();
    }
  }

  // ...........................................................................
  /** Returns the mocked product or undefined. */
  override get mockedProduct(): T | undefined {
    return super.mockedProduct;
  }

  /** If mocked product is set, this product is returned. */
  override set mockedProduct(t: T | undefined) {
    // Mocking bypasses advance(). Stop the animation so the node does not
    // stay in the SCM's animated set and produce on every tick forever.
    if (t != null) {
      this.isAnimated = false;
      this._completePending = false;
      this._frame = this._config.totalFrames;
    }
    super.mockedProduct = t;
  }

  // ...........................................................................
  /**
   * ScBuilders use this method to replace the present blue print.
   * @param bluePrint - The blue print to add.
   */
  override addBluePrint(bluePrint: NodeBluePrint<T>): void {
    super.addBluePrint(bluePrint);
    this._stopAnimationIfProduceWasRerouted();
  }

  /**
   * ScBuilders use this method to remove a formerly added blue print.
   * @param bp - The blue print to remove.
   */
  override removeBluePrint(bp: NodeBluePrint<T>): void {
    super.removeBluePrint(bp);
    this._stopAnimationIfProduceWasRerouted();
  }

  // ...........................................................................
  /**
   * Creates an example animated node for test purposes.
   * @param p - The key and total frames.
   */
  static example(
    p: { key?: string; totalFrames?: number } = {},
  ): AnimatedNode<number> {
    const key = p.key ?? 'animated';
    const totalFrames = p.totalFrames ?? 4;
    const scope = Scope.example();
    scope.mockContent({
      target: 0,
      [key]: AnimatedNodeBluePrint.forDouble({
        key,
        initialProduct: 0,
        suppliers: ['target'],
        totalFrames,
        curve: linearCurve,
      }),
    });
    scope.scm.flush();
    return scope.findNode<number>(key)! as AnimatedNode<number>;
  }

  // ######################
  // Private
  // ######################

  /**
   * The animation config is read live from the blue print, so replacing the
   * blue print on a live node (e.g. via Node.addBluePrint) takes effect.
   */
  private get _config(): AnimatedNodeBluePrint<T> {
    return this.bluePrint as AnimatedNodeBluePrint<T>;
  }

  /** Consumes one frame and returns its value. Settles on the final frame. */
  private _advanceFrame(config: AnimatedNodeBluePrint<T>): T {
    this._frame++;
    if (this._frame >= config.totalFrames) {
      this.isAnimated = false;
      this._completePending = true;
      return this._to;
    }
    return config.lerp(
      this._from,
      this._to,
      config.curve(this._frame / config.totalFrames),
    );
  }

  /**
   * A blue print that routes production away from advance() must not leave
   * the node in the SCM's animated set - it would be re-produced on every
   * tick forever.
   */
  private _stopAnimationIfProduceWasRerouted(): void {
    if (!(this.bluePrint instanceof AnimatedNodeBluePrint)) {
      this.isAnimated = false;
      this._completePending = false;
    }
  }

  private _from: T;
  private _to: T;
  private _lastSeenInput: T;
  private _frame: number;
  private _lastSeenTick = -1;
  private _initialized = false;
  private _completePending = false;
}
