// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import type { Insert } from '../insert.ts';
import type { Node } from '../node.ts';
import type { NodeBluePrint } from '../node-blue-print.ts';
import type { Owner } from '../owner.ts';
import type { ScBuilder } from '../sc-builder.ts';
import type { ScBuilderBluePrint } from '../sc-builder-blue-print.ts';
import type { Scope } from '../scope.ts';

/**
 * Breaks the ESM runtime cycle between `node-blue-print.ts` and
 * `node.ts`/`insert.ts`. `node.ts` and `insert.ts` register their constructors
 * here at module-eval time; `NodeBluePrint.instantiate` /
 * `instantiateAsInsert` look them up at call time instead of importing the
 * classes at runtime.
 */

/** Options accepted by the registered node factory. */
export interface NodeFactoryOptions<T> {
  /** The blue print to instantiate. */
  bluePrint: NodeBluePrint<T>;
  /** The owning scope. */
  scope: Scope;
  /** An optional owner. */
  owner?: Owner<Node<any>>;
}

/** Options accepted by the registered insert factory. */
export interface InsertFactoryOptions<T> {
  /** The blue print to instantiate. */
  bluePrint: NodeBluePrint<T>;
  /** The hosting node. */
  host: Node<T>;
  /** An optional scope. */
  scope?: Scope;
  /** The insert index. */
  index?: number;
}

/** Options accepted by the registered sc-builder factory. */
export interface ScBuilderFactoryOptions {
  /** The builder blue print to instantiate. */
  bluePrint: ScBuilderBluePrint;
  /** The scope the builder is instantiated in. */
  scope: Scope;
  /** An optional parent builder. */
  parent?: ScBuilder;
}

type NodeFactory = (options: NodeFactoryOptions<any>) => Node<any>;
type InsertFactory = (options: InsertFactoryOptions<any>) => Insert<any>;
type ScBuilderFactory = (options: ScBuilderFactoryOptions) => ScBuilder;

let nodeFactory: NodeFactory | undefined;
let insertFactory: InsertFactory | undefined;
let scBuilderFactory: ScBuilderFactory | undefined;

/**
 * Registers the {@link Node} constructor. Called by `node.ts`.
 * @param factory - Creates a node from the given options.
 */
export const registerNodeFactory = (factory: NodeFactory): void => {
  nodeFactory = factory;
};

/**
 * Registers the {@link Insert} constructor. Called by `insert.ts`.
 * @param factory - Creates an insert from the given options.
 */
export const registerInsertFactory = (factory: InsertFactory): void => {
  insertFactory = factory;
};

/**
 * Creates a node via the registered factory.
 * @param options - The node factory options.
 */
export const createNode = <T>(options: NodeFactoryOptions<T>): Node<T> => {
  /* v8 ignore start -- defensive guard: factory is always registered once the library entry is imported */
  if (nodeFactory === undefined) {
    throw new Error('Node factory not registered. Import the library entry.');
  }
  /* v8 ignore stop */
  return nodeFactory(options);
};

/**
 * Creates an insert via the registered factory.
 * @param options - The insert factory options.
 */
export const createInsert = <T>(
  options: InsertFactoryOptions<T>,
): Insert<T> => {
  /* v8 ignore start -- defensive guard: factory is always registered once the library entry is imported */
  if (insertFactory === undefined) {
    throw new Error('Insert factory not registered. Import the library entry.');
  }
  /* v8 ignore stop */
  return insertFactory(options);
};

/**
 * Registers the {@link ScBuilder} constructor. Called by `sc-builder.ts`.
 * @param factory - Creates a builder from the given options.
 */
export const registerScBuilderFactory = (factory: ScBuilderFactory): void => {
  scBuilderFactory = factory;
};

/**
 * Creates a builder via the registered factory.
 * @param options - The sc-builder factory options.
 */
export const createScBuilder = (
  options: ScBuilderFactoryOptions,
): ScBuilder => {
  /* v8 ignore start -- defensive guard: factory is always registered once the library entry is imported */
  if (scBuilderFactory === undefined) {
    throw new Error(
      'ScBuilder factory not registered. Import the library entry.',
    );
  }
  /* v8 ignore stop */
  return scBuilderFactory(options);
};
