// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import type { TypeTag } from '../../src/node-blue-print.ts';

/** A type without json support. */
export class MyTypNoJson {
  constructor(readonly x: number) {}
}

/** Another type without json support. */
export class MyTypNoJson2 {
  constructor(readonly x: number) {}
}

/** A type with json support. */
export class MyType {
  constructor(readonly x: number) {}

  /** Serializes to json. */
  toJson(): Record<string, unknown> {
    return { x: this.x };
  }

  /**
   * Creates an instance from json.
   * @param json - The json object.
   */
  static fromJson(json: Record<string, unknown>): MyType {
    return new MyType(json.x as number);
  }
}

/** Type tag for {@link MyType}. */
export const myTypeTag: TypeTag<MyType> = {
  id: 'MyType',
  is: (v): v is MyType => v instanceof MyType,
};

/** Type tag for {@link MyTypNoJson}. */
export const myTypNoJsonTag: TypeTag<MyTypNoJson> = {
  id: 'MyTypNoJson',
  is: (v): v is MyTypNoJson => v instanceof MyTypNoJson,
};

/** Type tag for {@link MyTypNoJson2}. */
export const myTypNoJson2Tag: TypeTag<MyTypNoJson2> = {
  id: 'MyTypNoJson2',
  is: (v): v is MyTypNoJson2 => v instanceof MyTypNoJson2,
};
