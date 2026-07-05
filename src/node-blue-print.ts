// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Duration } from './duration.ts';
import { assert } from './internal/assert.ts';
import { ArgumentError } from './internal/errors.ts';
import { createInsert, createNode } from './internal/registry.ts';
import { nextKey } from './keys.ts';
import { isCamelCase } from './tools.ts';

import type { Insert } from './insert.ts';
import type { Node, Produce } from './node.ts';
import type { Owner } from './owner.ts';
import type { Scope } from './scope.ts';

/**
 * Produce delegate that does nothing — returns the previous product.
 * @param components - The supplier products (unused).
 * @param previousProduct - The previous product, returned unchanged.
 * @param context - The producing node (unused).
 */
export function doNothing<T>(
  components: unknown[],
  previousProduct: T,
  context: Node<T>,
): T {
  void components;
  void context;
  return previousProduct;
}

/**
 * A function that parses a json map into a product of type T.
 * @typeParam T - The product type.
 */
export type FromJson<T> = (json: Record<string, unknown>) => T;

/**
 * A function that parses a string into a product of type T.
 * @typeParam T - The product type.
 */
export type FromString<T> = (str: string) => T;

/**
 * A function that serializes a product of type T into a json value.
 * @typeParam T - The product type.
 */
export type ToJson<T> = (data: T) => unknown;

/**
 * A runtime type tag — TypeScript erases generics, so json parsers and
 * serializers for custom product types are keyed by a string id instead of a
 * Dart `Type`. Primitives (number/string/boolean) are handled via `typeof` and
 * do not need a tag.
 * @typeParam T - The product type the tag identifies.
 */
export interface TypeTag<T> {
  /** A unique id for the product type. */
  readonly id: string;
  /**
   * Returns true if the value is of type T.
   * @param value - The value to test.
   */
  is(value: unknown): value is T;
}

const isPlainObjectOrMap = (value: unknown): boolean => {
  if (value instanceof Map) {
    return true;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  // Only plain JSON objects count — class instances (which may carry a custom
  // toJson or need a registered serializer) must not be treated as maps.
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Forwards a node from one or more suppliers.
 * @param options - `from` suppliers, `to` key, `init` initial product, optional `produce`.
 */
export function nbp<T>(options: {
  from: string[];
  to: string;
  init: T;
  produce?: Produce<T>;
}): NodeBluePrint<T> {
  return new NodeBluePrint<T>({
    key: options.to,
    initialProduct: options.init,
    suppliers: options.from,
    produce: options.produce ?? (doNothing as Produce<T>),
  });
}

/** The blue print of a node. */
export class NodeBluePrint<T> {
  /** The key of this node. */
  readonly key: string;

  /** The initial product of the node. */
  readonly initialProduct: T;

  /** The documentation of the node. */
  readonly documentation: string;

  /** A list of supplier keys. */
  readonly suppliers: readonly string[];

  /** A list of allowed values. */
  readonly allowedProducts: readonly T[];

  /** The produce function. */
  readonly produce: Produce<T>;

  /** Overrides the SCM's default production timeout for this node. */
  readonly productionTimeout?: Duration;

  /**
   * If `canBeSmart` is false this node will not be a smart node, even within a
   * smart scope or with a smart master path set.
   */
  readonly canBeSmart: boolean;

  /** An optional runtime type tag used by the json/string registries. */
  readonly type?: TypeTag<T>;

  private readonly innerSmartMaster: readonly string[];

  /**
   * Constructor of the node blue print.
   * @param params - The blue print fields.
   */
  constructor(params: {
    key: string;
    initialProduct: T;
    documentation?: string;
    suppliers?: readonly string[];
    allowedProducts?: readonly T[];
    produce?: Produce<T>;
    smartMaster?: readonly string[];
    canBeSmart?: boolean;
    productionTimeout?: Duration;
    type?: TypeTag<T>;
    fromJson?: FromJson<T>;
  }) {
    this.key = params.key;
    this.initialProduct = params.initialProduct;
    this.documentation = params.documentation ?? '';
    this.suppliers = params.suppliers ?? [];
    this.allowedProducts = params.allowedProducts ?? [];
    this.produce = params.produce ?? (doNothing as Produce<T>);
    this.innerSmartMaster = params.smartMaster ?? [];
    this.canBeSmart = params.canBeSmart ?? true;
    this.productionTimeout = params.productionTimeout;
    this.type = params.type;
    // `fromJson` is accepted for API compatibility but, as in Dart, not stored.
    void params.fromJson;
  }

  /**
   * Maps a supplier to a different key.
   * @param options - `supplier` source key, `toKey` target key, `initialProduct`, optional `fromJson`.
   */
  static map<T>(options: {
    supplier: string;
    toKey: string;
    initialProduct: T;
    fromJson?: FromJson<T>;
  }): NodeBluePrint<T> {
    return new NodeBluePrint<T>({
      key: options.toKey,
      initialProduct: options.initialProduct,
      suppliers: [options.supplier],
      produce: (components: unknown[]) => components[0] as T,
      fromJson: options.fromJson,
    });
  }

  /** Checks if the configuration is valid. */
  check(): void {
    assert(this.key.length > 0, 'The key must not be empty');
    assert(isCamelCase(this.key), 'The key must be in CamelCase');

    if (new Set(this.suppliers).size !== this.suppliers.length) {
      throw new ArgumentError('The suppliers must be unique.');
    }
  }

  /** Returns true if this node is a smart node, i.e. it has a smartMaster. */
  get isSmartNode(): boolean {
    return this.smartMaster.length > 0;
  }

  /**
   * If `smartMaster` is set this node automatically connects to the smart
   * master and takes over its values once available.
   */
  get smartMaster(): readonly string[] {
    return this.canBeSmart ? this.innerSmartMaster : [];
  }

  /**
   * An example instance for test purposes.
   * @param options - Optional key and produce.
   */
  static example(
    options: { key?: string; produce?: Produce<number> } = {},
  ): NodeBluePrint<any> {
    return new NodeBluePrint<number>({
      key: options.key ?? nextKey(),
      initialProduct: 0,
      suppliers: [],
      produce:
        options.produce ??
        ((components: unknown[], previousProduct: number) =>
          previousProduct + 1),
    });
  }

  /**
   * Instantiates the blue print in the given scope.
   * @param options - The target scope, whether to apply builders, optional owner.
   */
  instantiate(options: {
    scope: Scope;
    applyScBuilders?: boolean;
    owner?: Owner<Node<any>>;
  }): Node<T> {
    const applyScBuilders = options.applyScBuilders ?? true;
    this.check();
    const existing = options.scope.nodeByKey(this.key);

    if (existing !== undefined && !existing.isDisposed) {
      return existing as Node<T>;
    }

    const result = createNode<T>({
      bluePrint: this,
      scope: options.scope,
      owner: options.owner,
    });

    if (applyScBuilders) {
      this.applyScBuilders(result);
    }

    return result;
  }

  /**
   * Instantiates the blue print as an insert in the given host.
   * @param options - The host node, optional scope and index.
   */
  instantiateAsInsert(options: {
    host: Node<T>;
    scope?: Scope;
    index?: number;
  }): Insert<T> {
    return createInsert<T>({
      bluePrint: this,
      host: options.host,
      index: options.index,
      scope: options.scope,
    });
  }

  /**
   * Creates a modified copy of the blue print.
   * @param changes - The fields to override.
   */
  copyWith(changes: {
    initialProduct?: T;
    key?: string;
    suppliers?: readonly string[];
    produce?: Produce<T>;
    canBeSmart?: boolean;
    smartMaster?: readonly string[];
    productionTimeout?: Duration;
  }): NodeBluePrint<T> {
    if (
      (changes.initialProduct === undefined ||
        changes.initialProduct === this.initialProduct) &&
      (changes.key === undefined || changes.key === this.key) &&
      (changes.suppliers === undefined ||
        changes.suppliers === this.suppliers) &&
      (changes.produce === undefined || changes.produce === this.produce) &&
      (changes.canBeSmart === undefined ||
        changes.canBeSmart === this.canBeSmart) &&
      (changes.productionTimeout === undefined ||
        (this.productionTimeout !== undefined &&
          changes.productionTimeout.equals(this.productionTimeout))) &&
      (changes.smartMaster === undefined ||
        changes.smartMaster === this.smartMaster ||
        listEquals(changes.smartMaster, this.smartMaster) ||
        (changes.smartMaster.length === 0 &&
          this.smartMaster.length === 0))
    ) {
      return this;
    }

    return new NodeBluePrint<T>({
      initialProduct: changes.initialProduct ?? this.initialProduct,
      key: changes.key ?? this.key,
      suppliers: changes.suppliers ?? this.suppliers,
      produce: changes.produce ?? this.produce,
      canBeSmart: changes.canBeSmart ?? this.canBeSmart,
      smartMaster: changes.smartMaster ?? this.innerSmartMaster,
      productionTimeout: changes.productionTimeout ?? this.productionTimeout,
      type: this.type,
    });
  }

  /**
   * Maps the key of the blue print to another key.
   * @param toKey - The new key.
   */
  forwardTo(toKey: string): NodeBluePrint<T> {
    return NodeBluePrint.map<T>({
      supplier: this.key,
      toKey,
      initialProduct: this.initialProduct,
    });
  }

  /**
   * Makes the node forward the value of the supplier.
   * @param supplier - The supplier key.
   */
  connectSupplier(supplier: string): NodeBluePrint<T> {
    return NodeBluePrint.map<T>({
      supplier,
      toKey: this.key,
      initialProduct: this.initialProduct,
    });
  }

  /**
   * Value equality, equivalent to Dart's `equals`.
   * @param other - The other blue print.
   */
  equals(other: unknown): boolean {
    if (other instanceof NodeBluePrint) {
      if (this.key !== other.key) {
        return false;
      }
      if (this.initialProduct !== other.initialProduct) {
        return false;
      }
      if (this.suppliers.length !== other.suppliers.length) {
        return false;
      }
      if (this.produce !== other.produce) {
        return false;
      }
      for (let i = 0; i < this.suppliers.length; i++) {
        if (this.suppliers[i] !== other.suppliers[i]) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  /** Returns the key. */
  toString(): string {
    return this.key;
  }

  /**
   * Converts the product into a json value.
   * @param product - The product to serialize.
   */
  toJson(product: T): unknown {
    if (
      typeof product === 'number' ||
      typeof product === 'string' ||
      typeof product === 'boolean' ||
      product === null ||
      Array.isArray(product) ||
      isPlainObjectOrMap(product)
    ) {
      return product;
    }

    const maybe = product as { toJson?: () => unknown };
    if (typeof maybe.toJson === 'function') {
      return maybe.toJson();
    }

    const serializer = this.type ? jsonSerializers.get(this.type.id) : undefined;
    if (serializer !== undefined) {
      return serializer(product);
    }

    throw new Error(
      [
        `No serializer registered for type ${this.type?.id ?? typeof product}.`,
        'Either:',
        ' - implement a toJson method on the product or',
        ' - register a json serializer using ' +
          'NodeBluePrint.addJsonSerializer(tag, serializer)',
      ].join('\n'),
    );
  }

  /**
   * Registers a json parser for the given type tag.
   * @param tag - The type tag.
   * @param parseJson - The parser.
   */
  static addJsonParser<T>(tag: TypeTag<T>, parseJson: FromJson<T>): void {
    const existing = jsonParsers.get(tag.id);
    if (existing !== undefined && existing !== parseJson) {
      throw new Error(
        `A different json parser for type ${tag.id} is already registered.`,
      );
    }
    jsonParsers.set(tag.id, parseJson as FromJson<unknown>);
  }

  /**
   * Removes a json parser for the given type tag.
   * @param tag - The type tag.
   */
  static removeJsonParser<T>(tag: TypeTag<T>): void {
    jsonParsers.delete(tag.id);
  }

  /**
   * Registers a string parser for the given type tag.
   * @param tag - The type tag.
   * @param parseString - The parser.
   */
  static addStringParser<T>(tag: TypeTag<T>, parseString: FromString<T>): void {
    const existing = stringParsers.get(tag.id);
    if (existing !== undefined && existing !== parseString) {
      throw new Error(
        `A different string parser for type ${tag.id} is already registered.`,
      );
    }
    stringParsers.set(tag.id, parseString as FromString<unknown>);
  }

  /** Clears all json/string parsers and serializers. Useful for testing. */
  static clearParsers(): void {
    jsonParsers.clear();
    stringParsers.clear();
    jsonSerializers.clear();
  }

  /**
   * Registers a json serializer for the given type tag.
   * @param tag - The type tag.
   * @param toJson - The serializer.
   */
  static addJsonSerializer<T>(tag: TypeTag<T>, toJson: ToJson<T>): void {
    if (!jsonSerializers.has(tag.id)) {
      jsonSerializers.set(tag.id, toJson as ToJson<unknown>);
    }
  }

  /**
   * Converts json into the product.
   * @param value - The json value.
   */
  fromJson(value: unknown): T {
    // value matches the type T
    if (this.matchesType(value)) {
      return value as T;
    }

    // Value is a list and the initial product is a list
    if (Array.isArray(value) && Array.isArray(this.initialProduct)) {
      return value as T;
    }

    // Value is a map and the initial product is a map
    if (isPlainObjectOrMap(value) && isPlainObjectOrMap(this.initialProduct)) {
      return this.castMap(value as Record<string, unknown>);
    }

    if (isPlainObjectOrMap(value)) {
      const parseJson = this.type ? jsonParsers.get(this.type.id) : undefined;
      if (parseJson !== undefined) {
        return parseJson(value as Record<string, unknown>) as T;
      }
      throw new Error(
        'Please register a json parser using ' +
          'NodeBluePrint.addJsonParser(tag, parser).',
      );
    }

    if (typeof value === 'string') {
      const parseString = this.type
        ? stringParsers.get(this.type.id)
        : undefined;
      if (parseString !== undefined) {
        return parseString(value) as T;
      }
      throw new Error(
        'Please register a string parser using ' +
          'NodeBluePrint.addStringParser(tag, parser).',
      );
    }

    throw new Error(
      `Value "${String(value)}" is of type ${typeof value}.\n` +
        'But it must be either a primitive or a map.',
    );
  }

  /**
   * Casts a map to the product type. With int/double collapsed to `number`,
   * the Dart numeric-map casts are no longer needed.
   * @param map - The map to cast.
   */
  castMap(map: Record<string, unknown>): T {
    assert(isPlainObjectOrMap(this.initialProduct));

    // Remove hash
    if ('_hash' in map) {
      const copy = { ...map };
      delete copy._hash;
      return copy as T;
    }

    return map as T;
  }

  private matchesType(value: unknown): boolean {
    if (this.type !== undefined) {
      return this.type.is(value);
    }
    const valueType = typeof value;
    return (
      valueType === typeof this.initialProduct &&
      valueType !== 'object' &&
      valueType !== 'function'
    );
  }

  private applyScBuilders(node: Node<any>, scope?: Scope): void {
    const target = scope ?? node.scope;

    for (const builder of target.builders) {
      builder.applyToNode(node);
    }

    if (target.parent !== undefined) {
      this.applyScBuilders(node, target.parent);
    }
  }
}

const stringParsers = new Map<string, FromString<unknown>>();
const jsonParsers = new Map<string, FromJson<unknown>>();
const jsonSerializers = new Map<string, ToJson<unknown>>();

function listEquals<E>(a: readonly E[], b: readonly E[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
