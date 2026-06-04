// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ArgumentError } from './internal/errors.ts';
import { Node, type Produce } from './node.ts';
import { NodeBluePrint } from './node-blue-print.ts';

import type { Scope } from './scope.ts';

/** A node that can be used as an insert node. */
export class Insert<T> extends Node<T> {
  /** The node hosting this insert node. */
  readonly host: Node<T>;

  /** From this node the insert node gets its input. */
  input!: Node<T>;

  /** To this node the insert node sends its output. */
  output!: Node<T>;

  private readonly disposeCallbacks: Array<() => void> = [];

  /**
   * Creates a new insert node based on {@link options.bluePrint} within
   * {@link options.host} and inserts it into the insert chain at
   * {@link options.index}.
   * @param options - The blue print, host, optional scope and index.
   */
  constructor(options: {
    bluePrint: NodeBluePrint<T>;
    host: Node<T>;
    scope?: Scope;
    index?: number;
  }) {
    super({
      bluePrint: options.bluePrint,
      scope: options.scope ?? options.host.scope,
      isInsert: true,
    });
    this.host = options.host;
    this.insertInsert(options.index);
    this.prepareRemoval();
  }

  override dispose(): void {
    for (const d of [...this.disposeCallbacks].reverse()) {
      d();
    }
    this.disposeCallbacks.length = 0;

    super.dispose();
  }

  /** Returns true if this insert is the last insert in the chain. */
  get isLastInsert(): boolean {
    const inserts = this.host.inserts;
    return inserts[inserts.length - 1] === (this as unknown as Insert<T>);
  }

  /**
   * This override makes produce forward the insert input's value to the
   * produce function.
   */
  override get previousProduct(): T {
    return this.input.originalProduct;
  }

  /**
   * Creates an example insert node.
   * @param options - Optional key, produce, host and index.
   */
  static example(
    options: {
      key?: string;
      produce?: Produce<number>;
      host?: Node<number>;
      index?: number;
    } = {},
  ): Insert<number> {
    const host = options.host ?? Node.example();
    const bluePrint = NodeBluePrint.example({
      key: options.key ?? 'insert',
      produce: options.produce,
    });
    return bluePrint.instantiateAsInsert({
      host,
      scope: host.scope,
      index: options.index,
    });
  }

  private insertInsert(index?: number): void {
    const inserts = this.host.inserts as unknown as Insert<T>[];

    // Check index
    const idx = index ?? inserts.length;
    if (idx < 0 || idx > inserts.length) {
      throw new ArgumentError(`Insert index ${idx} is out of range.`);
    }

    // Get the previous and following insert
    const previousInsert = idx === 0 ? undefined : inserts[idx - 1];
    const followingInsert = idx >= inserts.length ? undefined : inserts[idx];

    // Connect previous and following insert to the new insert
    if (previousInsert !== undefined) {
      previousInsert.output = this;
    }
    if (followingInsert !== undefined) {
      followingInsert.input = this;
    }

    this.input = previousInsert ?? this.host;
    this.output = followingInsert ?? this.host;

    // Add insert to the list of inserts
    this.host.addInsert(this, { index: idx });

    // Nominate the insert
    this.scm.nominate(this);
  }

  private removeInsertFromChain(): void {
    const inserts = this.host.inserts as unknown as Insert<T>[];
    const index = inserts.indexOf(this as unknown as Insert<T>);

    const previousInsert = index > 0 ? inserts[index - 1] : undefined;
    const followingInsert =
      index < inserts.length - 1 ? inserts[index + 1] : undefined;

    if (previousInsert !== undefined) {
      previousInsert.output = followingInsert ?? this.host;
    }
    if (followingInsert !== undefined) {
      followingInsert.input = previousInsert ?? this.host;
    }

    // If this insert is the last insert
    if (this.isLastInsert) {
      // customers need to be nominated
      for (const customer of this.host.customers) {
        this.scm.nominate(customer);
      }

      // The product of the newly last insert needs to be written to the host
      this.host.insertResult = previousInsert?.originalProduct;
    }
    // If this insert is not the last insert, the following insert needs to be
    // nominated
    else {
      this.scm.nominate(this.output);
    }

    this.host.removeInsert(this);
  }

  private prepareRemoval(): void {
    this.disposeCallbacks.push(() => this.removeInsertFromChain());
  }
}

// Register the Insert factory (see ./internal/registry.ts).
import { registerInsertFactory } from './internal/registry.ts';
registerInsertFactory((options) => new Insert(options));
