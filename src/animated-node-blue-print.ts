// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ArgumentError, StateError } from './internal/errors.ts';
import { NodeBluePrint } from './node-blue-print.ts';
import { AnimatedNode } from './animated-node.ts';

import type { Duration } from './duration.ts';
import type { Node, Produce } from './node.ts';
import type { Owner } from './owner.ts';
import type { Scope } from './scope.ts';

// .............................................................................
/**
 * The identity (linear) animation curve.
 * @param t - The normalized time in [0, 1].
 */
export function linearCurve(t: number): number {
  return t;
}

// .............................................................................
/**
 * The blue print of an {@link AnimatedNode}.
 *
 * See {@link AnimatedNode} for the animation semantics. An animated node has
 * exactly one supplier (the target value) and eases its output toward that
 * target over {@link totalFrames} frames.
 */
export class AnimatedNodeBluePrint<T> extends NodeBluePrint<T> {
  // ...........................................................................
  /**
   * Creates a blue print for an {@link AnimatedNode}.
   *
   * - `key`: the node key (camelCase)
   * - `initialProduct`: the initial (and first snapped) output value
   * - `suppliers`: exactly one supplier path - the target value
   * - `totalFrames`: the number of Scm.tick's an animation spans (must be 1
   *   or larger)
   * - `curve`: maps normalized time t in [0, 1] to eased progress in [0, 1]
   * - `lerp`: interpolates between two values of type T
   * - `equals`: decides whether the input (target) changed between two
   *   productions (defaults to `===` with NaN treated equal to NaN). It is
   *   deliberately NOT used to gate downstream propagation: output gating
   *   always uses exact equality, so a tolerance-based `equals` cannot
   *   swallow intermediate animation frames.
   * @param params - The blue print fields.
   */
  constructor(params: {
    key: string;
    initialProduct: T;
    suppliers: readonly string[];
    totalFrames: number;
    curve: (t: number) => number;
    lerp: (a: T, b: T, t: number) => T;
    equals?: (a: T, b: T) => boolean;
    documentation?: string;
    canBeSmart?: boolean;
    smartMaster?: readonly string[];
    productionTimeout?: Duration;
  }) {
    // Fixed produce/gating arguments are passed to super.
    super({
      key: params.key,
      initialProduct: params.initialProduct,
      suppliers: params.suppliers,
      documentation: params.documentation,
      produce: produceAnimated as Produce<T>,
      canBeSmart: params.canBeSmart,
      smartMaster: params.smartMaster,
      productionTimeout: params.productionTimeout,
      propagateOnChangeOnly: true,
      changeComparator: defaultEquals<T>,
    });
    this.totalFrames = params.totalFrames;
    this.curve = params.curve;
    this.lerp = params.lerp;
    this.isEqual = params.equals ?? defaultEquals<T>;
  }

  // ...........................................................................
  /** The number of Scm.tick's an animation spans. */
  readonly totalFrames: number;

  /** Maps normalized time t in [0, 1] to eased progress in [0, 1]. */
  readonly curve: (t: number) => number;

  /** Interpolates between two values of type T at progress t in [0, 1]. */
  readonly lerp: (a: T, b: T, t: number) => T;

  /** Decides whether the input value changed between two productions. */
  readonly isEqual: (a: T, b: T) => boolean;

  // ...........................................................................
  /** Checks if the configuration is valid. */
  override check(): void {
    super.check();
    if (this.suppliers.length !== 1) {
      throw new ArgumentError(
        'An AnimatedNode must have exactly one supplier (the target value).',
      );
    }
    if (this.totalFrames < 1) {
      throw new ArgumentError('totalFrames must be >= 1.');
    }
  }

  // ...........................................................................
  /**
   * Creates the concrete node instance for this blue print.
   * @param options - The target scope and optional owner.
   */
  override createNode(options: {
    scope: Scope;
    owner?: Owner<Node<any>>;
  }): Node<T> {
    return new AnimatedNode<T>({
      bluePrint: this,
      scope: options.scope,
      owner: options.owner,
    });
  }

  // ...........................................................................
  /**
   * Creates a modified copy that stays an {@link AnimatedNodeBluePrint}.
   *
   * Passing a `produce` intentionally makes the copy non-animated (e.g. the
   * muting in Node.dispose) and falls back to the base implementation.
   * `propagateOnChangeOnly` and `changeComparator` are fixed for animated
   * blue prints and cannot be overridden.
   * @param changes - The fields to override.
   */
  override copyWith(changes: {
    initialProduct?: T;
    key?: string;
    suppliers?: readonly string[];
    produce?: Produce<T>;
    canBeSmart?: boolean;
    smartMaster?: readonly string[];
    productionTimeout?: Duration;
    propagateOnChangeOnly?: boolean;
    changeComparator?: (a: T, b: T) => boolean;
  }): NodeBluePrint<T> {
    if (changes.produce !== undefined) {
      return super.copyWith(changes);
    }

    return new AnimatedNodeBluePrint<T>({
      key: changes.key ?? this.key,
      initialProduct: changes.initialProduct ?? this.initialProduct,
      suppliers: [...(changes.suppliers ?? this.suppliers)],
      totalFrames: this.totalFrames,
      curve: this.curve,
      lerp: this.lerp,
      equals: this.isEqual,
      documentation: this.documentation,
      canBeSmart: changes.canBeSmart ?? this.canBeSmart,
      smartMaster: changes.smartMaster ?? this.smartMaster,
      productionTimeout: changes.productionTimeout ?? this.productionTimeout,
    });
  }

  // ...........................................................................
  /**
   * Rewires the supplier while keeping the animation.
   *
   * Overridden so that framework paths rewiring blue prints (e.g.
   * ScopeBluePrint connections and smart-node master replacement) do not
   * silently replace the animation with hard value-forwarding.
   * @param supplier - The supplier key.
   */
  override connectSupplier(supplier: string): NodeBluePrint<T> {
    return this.copyWith({ suppliers: [supplier] });
  }

  // ...........................................................................
  /**
   * Convenience blue print for animating a floating point number with linear
   * interpolation and NaN-aware change detection.
   * @param options - Key, initial product, suppliers, frames and curve.
   */
  static forDouble(options: {
    key: string;
    initialProduct: number;
    suppliers: readonly string[];
    totalFrames: number;
    curve: (t: number) => number;
    documentation?: string;
  }): AnimatedNodeBluePrint<number> {
    return new AnimatedNodeBluePrint<number>({
      key: options.key,
      initialProduct: options.initialProduct,
      suppliers: options.suppliers,
      totalFrames: options.totalFrames,
      curve: options.curve,
      lerp: (a, b, t) => a + (b - a) * t,
      documentation: options.documentation,
    });
  }

  // ...........................................................................
  /**
   * Convenience blue print for animating an integer number with rounded
   * linear interpolation.
   * @param options - Key, initial product, suppliers, frames, curve, equals.
   */
  static forInt(options: {
    key: string;
    initialProduct: number;
    suppliers: readonly string[];
    totalFrames: number;
    curve: (t: number) => number;
    equals?: (a: number, b: number) => boolean;
    documentation?: string;
  }): AnimatedNodeBluePrint<number> {
    return new AnimatedNodeBluePrint<number>({
      key: options.key,
      initialProduct: options.initialProduct,
      suppliers: options.suppliers,
      totalFrames: options.totalFrames,
      curve: options.curve,
      lerp: (a, b, t) => Math.round(a + (b - a) * t),
      equals: options.equals,
      documentation: options.documentation,
    });
  }
}

// .............................................................................
/**
 * The produce function installed on every {@link AnimatedNode}. Drives the
 * animation by delegating to AnimatedNode.advance.
 * @param components - The supplier products.
 * @param previousProduct - The previously produced product.
 * @param node - The producing node.
 */
function produceAnimated<S>(
  components: unknown[],
  previousProduct: S,
  node: Node<S>,
): S {
  if (!(node instanceof AnimatedNode)) {
    throw new StateError(
      'An AnimatedNodeBluePrint must be instantiated as an AnimatedNode, ' +
        `but it is attached to a ${node.constructor.name} ("${node.path}"). ` +
        'This happens e.g. when the blue print is used as an insert or ' +
        'added to an existing plain node via addBluePrint.',
    );
  }
  return (node as AnimatedNode<S>).advance(components, previousProduct);
}

// .............................................................................
/**
 * Exact equality with NaN treated equal to NaN.
 *
 * NaN !== NaN would make an animated node treat an unchanged NaN input as a
 * change on every production and restart its animation forever.
 * @param a - The first value.
 * @param b - The second value.
 */
function defaultEquals<T>(a: T, b: T): boolean {
  return (
    a === b ||
    (typeof a === 'number' &&
      typeof b === 'number' &&
      Number.isNaN(a) &&
      Number.isNaN(b))
  );
}
