// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it } from 'vitest';

// NOTE(port): import from the concrete leaf modules rather than
// `../src/index.ts`. The barrel re-exports `disposed.ts` before `scm.ts`,
// which makes `Scm`'s eager `static testInstance = new Scm()` initializer run
// before `Disposed`/`Scope` are defined, throwing "Disposed is not a
// constructor". This is a pre-existing src/index.ts ordering bug (see report);
// importing the modules directly - with scm.ts first, as test/smoke.spec.ts
// does - side-steps the cycle.
import { Scm } from '../src/scm.ts';
import { Duration } from '../src/duration.ts';
import { ArgumentError } from '../src/internal/errors.ts';
import { testSetNextKeyCounter } from '../src/keys.ts';
import { doNothing, nbp, NodeBluePrint } from '../src/node-blue-print.ts';
import { Node } from '../src/node.ts';
import { Scope } from '../src/scope.ts';
import { Insert } from '../src/insert.ts';
import { ScBuilder } from '../src/sc-builder.ts';
import {
  MyType,
  MyTypNoJson,
  MyTypNoJson2,
  myTypeTag,
  myTypNoJsonTag,
  myTypNoJson2Tag,
} from './helpers/my-type.ts';

// A test enum mirroring the Dart `TestEnum`. It is intentionally a *numeric*
// enum: in Dart `'b' is TestEnum` is false, so a raw json string must not match
// the type and must instead be routed through the registered string parser. A
// string enum would make the values themselves strings and defeat that.
enum TestEnum {
  a,
  b,
  c,
}

const testEnumFromString = (str: string): TestEnum => {
  switch (str) {
    case 'a':
      return TestEnum.a;
    case 'b':
      return TestEnum.b;
    case 'c':
      return TestEnum.c;
    default:
      throw new Error(`Unknown TestEnum value: ${str}`);
  }
};

const testEnumTag = {
  id: 'TestEnum',
  is: (v: unknown): v is TestEnum =>
    v === TestEnum.a || v === TestEnum.b || v === TestEnum.c,
};

describe('NodeBluePrint', () => {
  beforeEach(() => {
    NodeBluePrint.clearParsers();
  });

  describe('nbp', () => {
    it('should create a node blue print', () => {
      const produce = (): number => 0;
      const bp = nbp<number>({ from: ['a'], to: 'b', init: 0, produce });
      expect(bp.key).toBe('b');
      expect(bp.initialProduct).toBe(0);
      expect(bp.suppliers).toEqual(['a']);
      expect(bp.produce).toBe(produce);
    });
  });

  describe('example', () => {
    it('with key', () => {
      const bluePrint = NodeBluePrint.example({ key: 'node' });
      expect(bluePrint.key).toBe('node');
      expect(bluePrint.initialProduct).toBe(0);
      expect(bluePrint.suppliers).toEqual([]);
      expect(bluePrint.produce([], 0, Node.example({ key: 'dummy' }))).toBe(1);
    });

    it('without key', () => {
      testSetNextKeyCounter(0);
      const bluePrint = NodeBluePrint.example();
      expect(bluePrint.key).toBe('aaliyah');
      expect(bluePrint.initialProduct).toBe(0);
      expect(bluePrint.suppliers).toEqual([]);
      expect(bluePrint.produce([], 0, Node.example({ key: 'dummy' }))).toBe(1);
    });
  });

  describe('map(key, supplier, initialProduct)', () => {
    it('returns a new instance', () => {
      const bluePrint = NodeBluePrint.map<number>({
        supplier: 'supplier',
        toKey: 'node',
        initialProduct: 123,
      });

      expect(bluePrint.key).toBe('node');
      expect(bluePrint.initialProduct).toBe(123);
      expect(bluePrint.suppliers).toEqual(['supplier']);

      // Should just forward the original supplier's value
      expect(bluePrint.produce([456], 0, Node.example({ key: 'dummy' }))).toBe(
        456,
      );
    });
  });

  describe('check', () => {
    it('asserts that key is not empty', () => {
      expect(() =>
        new NodeBluePrint<number>({
          key: '',
          initialProduct: 0,
          suppliers: [],
        }).check(),
      ).toThrow('The key must not be empty');
    });

    it('asserts key being camel case', () => {
      expect(() =>
        new NodeBluePrint<number>({
          key: 'HelloWorld',
          initialProduct: 0,
          suppliers: [],
        }).check(),
      ).toThrow('The key must be in CamelCase');
    });

    it('throws, when multiple suppliers have the same path', () => {
      const bluePrint = new NodeBluePrint<number>({
        key: 'node',
        initialProduct: 0,
        suppliers: ['supplier', 'supplier'],
        produce: () => 0,
      });

      expect(() => bluePrint.check()).toThrow(ArgumentError);
      expect(() => bluePrint.check()).toThrow('The suppliers must be unique.');
    });
  });

  describe('equals', () => {
    describe('should return true', () => {
      it('with same suppliers', () => {
        const produce = (
          components: unknown[],
          previousProduct: number,
        ): number => previousProduct + 1;

        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(true);
      });
    });

    describe('should return false', () => {
      const produce = (
        components: unknown[],
        previousProduct: number,
      ): number => previousProduct + 1;

      it('when key is different', () => {
        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node2',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(false);
      });

      it('when initialProduct is different', () => {
        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 1,
          suppliers: ['supplier'],
          produce,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(false);
      });

      it('when suppliers are different', () => {
        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier2'],
          produce,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(false);
      });

      it('when produce is different', () => {
        const produce1 = (
          components: unknown[],
          previousProduct: number,
        ): number => previousProduct + 1;
        const produce2 = (
          components: unknown[],
          previousProduct: number,
        ): number => previousProduct + 2;

        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce: produce1,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce: produce2,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(false);
      });

      it('when the number of suppliers is different', () => {
        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        const bluePrint2 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier', 'supplier2'],
          produce,
        });
        expect(bluePrint1.equals(bluePrint2)).toBe(false);
      });

      it('when the other is not a NodeBluePrint', () => {
        const bluePrint1 = new NodeBluePrint<number>({
          key: 'node',
          initialProduct: 0,
          suppliers: ['supplier'],
          produce,
        });
        expect(bluePrint1.equals(undefined)).toBe(false);
        expect(bluePrint1.equals({ key: 'node' })).toBe(false);
      });
    });
  });

  describe('toString()', () => {
    it('returns key', () => {
      const bluePrint = NodeBluePrint.example({ key: 'aaliyah' });
      expect(bluePrint.toString()).toBe('aaliyah');
    });
  });

  describe('toJson(val)', () => {
    describe('returns the value, if it has a trivial type', () => {
      describe('with type', () => {
        // int/double/num collapse to number in TS — the separate Dart int,
        // double and num cases are merged into a single number case.
        it('number', () => {
          expect(
            new NodeBluePrint<number>({ key: 'k', initialProduct: 0 }).toJson(
              10,
            ),
          ).toBe(10);
          expect(
            new NodeBluePrint<number>({
              key: 'k',
              initialProduct: 0,
            }).toJson(5.1),
          ).toBe(5.1);
        });

        it('String', () => {
          expect(
            new NodeBluePrint<string>({
              key: 'k',
              initialProduct: 'Hello',
            }).toJson('World'),
          ).toBe('World');
        });

        it('bool', () => {
          expect(
            new NodeBluePrint<boolean>({
              key: 'k',
              initialProduct: true,
            }).toJson(false),
          ).toBe(false);
        });

        it('Map', () => {
          expect(
            new NodeBluePrint<Record<string, unknown>>({
              key: 'k',
              initialProduct: { hello: 'world' },
            }).toJson({ hello: 'berlin' }),
          ).toEqual({ hello: 'berlin' });
        });

        it('JS Map instance', () => {
          const map = new Map<string, unknown>([['hello', 'berlin']]);
          expect(
            new NodeBluePrint<Map<string, unknown>>({
              key: 'k',
              initialProduct: new Map(),
            }).toJson(map),
          ).toBe(map);
        });

        it('List', () => {
          expect(
            new NodeBluePrint<number[]>({
              key: 'k',
              initialProduct: [5, 6],
            }).toJson([7, 8]),
          ).toEqual([7, 8]);
        });

        describe('MyType', () => {
          describe('throws', () => {
            // TODO(port): unreachable due to a src bug in node-blue-print.ts.
            // `toJson` calls `isPlainObjectOrMap(product)` first, which returns
            // true for any class instance, so it returns the instance unchanged
            // and never reaches the "no serializer registered" error path.
            it('when MyTypNoJson has no toJson(...) method', () => {
              let message: string[] = [];

              try {
                new NodeBluePrint<MyTypNoJson>({
                  key: 'k',
                  initialProduct: new MyTypNoJson(10),
                  type: myTypNoJsonTag,
                }).toJson(new MyTypNoJson(11));
              } catch (e) {
                message = (e as Error).message.split('\n');
              }

              expect(message).toEqual([
                'No serializer registered for type MyTypNoJson.',
                'Either:',
                ' - implement a toJson method on the product or',
                ' - register a json serializer using ' +
                  'NodeBluePrint.addJsonSerializer(tag, serializer)',
              ]);
            });

            it('when no type tag is set falls back to typeof in message', () => {
              NodeBluePrint.clearParsers();
              let message: string[] = [];

              try {
                new NodeBluePrint<MyTypNoJson>({
                  key: 'k',
                  initialProduct: new MyTypNoJson(10),
                }).toJson(new MyTypNoJson(11));
              } catch (e) {
                message = (e as Error).message.split('\n');
              }

              expect(message[0]).toBe('No serializer registered for type object.');
            });
          });

          describe('converts to json', () => {
            describe('via toJson()', () => {
              it('with Map', () => {
                expect(
                  new NodeBluePrint<MyType>({
                    key: 'k',
                    initialProduct: new MyType(0),
                    type: myTypeTag,
                  }).toJson(new MyType(13)),
                ).toEqual({ x: 13 });
              });

              it('with List', () => {
                expect(
                  new NodeBluePrint<number[]>({
                    key: 'k',
                    initialProduct: [0],
                  }).toJson([1, 2, 3]),
                ).toEqual([1, 2, 3]);
              });
            });

            // TODO(port): unreachable due to a src bug in node-blue-print.ts.
            // `toJson` returns any class instance unchanged (see above), so the
            // registered serializer is never consulted - it returns the
            // MyTypNoJson instance instead of { k: 13 }.
            it('registered json serializer', () => {
              NodeBluePrint.addJsonSerializer<MyTypNoJson>(
                myTypNoJsonTag,
                (data) => {
                  return { k: data.x };
                },
              );

              expect(
                new NodeBluePrint<MyTypNoJson>({
                  key: 'k',
                  initialProduct: new MyTypNoJson(0),
                  type: myTypNoJsonTag,
                }).toJson(new MyTypNoJson(13)),
              ).toEqual({ k: 13 });
            });
          });
        });
      });
    });
  });

  describe('fromJson(val)', () => {
    describe('returns value itself if the type of the value matches T', () => {
      // int/double/num collapse to number in TS — the separate Dart int,
      // double and num cases are merged into a single number case.
      it('number', () => {
        expect(
          new NodeBluePrint<number>({ key: 'k', initialProduct: 0 }).fromJson(
            10,
          ),
        ).toBe(10);
        expect(
          new NodeBluePrint<number>({
            key: 'k',
            initialProduct: 0,
          }).fromJson(5.1),
        ).toBe(5.1);
      });

      it('String', () => {
        expect(
          new NodeBluePrint<string>({
            key: 'k',
            initialProduct: 'Hello',
          }).fromJson('World'),
        ).toBe('World');
      });

      it('bool', () => {
        expect(
          new NodeBluePrint<boolean>({
            key: 'k',
            initialProduct: true,
          }).fromJson(false),
        ).toBe(false);
      });

      it('T', () => {
        const val = new MyType(13);
        expect(
          new NodeBluePrint<MyType>({
            key: 'k',
            initialProduct: new MyType(0),
            type: myTypeTag,
          }).fromJson(val),
        ).toBe(val);
      });

      // TODO(port): unreachable due to a src bug in node-blue-print.ts.
      // `fromJson` handles primitives and plain-object maps but not arrays:
      // `matchesType` rejects arrays and `isPlainObjectOrMap` is false for
      // arrays, so it falls through and throws "Value ... is of type object"
      // instead of returning the list. (`toJson` does handle arrays.)
      it('List', () => {
        expect(
          new NodeBluePrint<number[]>({
            key: 'k',
            initialProduct: [5, 6],
          }).fromJson([7, 8]),
        ).toEqual([7, 8]);
      });

      describe('Map', () => {
        it('with map matching node type', () => {
          const map: Record<string, unknown> = { hello: 'berlin' };

          expect(
            new NodeBluePrint<Record<string, unknown>>({
              key: 'k',
              initialProduct: { hello: 'world' },
            }).fromJson(map),
          ).toEqual({ hello: 'berlin' });
        });

        // int/double/num collapse to number, so a map cast no longer changes
        // numeric values — the value is returned as-is.
        it('with a map to be casted', () => {
          const map: Record<string, number> = { a: 1, b: 2 };

          expect(
            new NodeBluePrint<Record<string, number>>({
              key: 'k',
              initialProduct: { a: 0 },
            }).fromJson(map),
          ).toEqual({ a: 1, b: 2 });
        });
      });
    });

    describe('parses json on custom classes', () => {
      it('Map', () => {
        NodeBluePrint.addJsonParser(myTypeTag, MyType.fromJson);

        expect(
          (
            new NodeBluePrint<MyType>({
              key: 'k',
              initialProduct: new MyType(0),
              type: myTypeTag,
            }).fromJson({ x: 11 }) as MyType
          ).x,
        ).toBe(11);
      });
    });

    describe('parses enum strings on custom classes', () => {
      it('Map', () => {
        NodeBluePrint.addStringParser<TestEnum>(testEnumTag, testEnumFromString);

        expect(
          new NodeBluePrint<TestEnum>({
            key: 'k',
            initialProduct: TestEnum.a,
            type: testEnumTag,
          }).fromJson('b'),
        ).toBe(TestEnum.b);
      });
    });

    describe('throws', () => {
      it('when the value is not either a primitive type or a Map', () => {
        let message: string[] = [];

        try {
          // A bigint is neither a primitive (number/string/boolean) nor a map,
          // standing in for Dart's DateTime instance.
          new NodeBluePrint<MyTypNoJson>({
            key: 'k',
            initialProduct: new MyTypNoJson(0),
            type: myTypNoJsonTag,
          }).fromJson(10n);
        } catch (e) {
          message = (e as Error).message.split('\n');
        }

        expect(message).toEqual([
          'Value "10" is of type bigint.',
          'But it must be either a primitive or a map.',
        ]);
      });

      // TODO(port): unreachable due to a src bug in node-blue-print.ts.
      // `initialProduct` is a class instance, so `isPlainObjectOrMap(
      // this.initialProduct)` is true and `fromJson` of a plain-object value
      // takes the `castMap` branch (returning the raw object) instead of the
      // json-parser branch, so the "Please register a json parser" error is
      // never thrown.
      it('when no json parser is registered for the type', () => {
        expect(() =>
          new NodeBluePrint<MyTypNoJson>({
            key: 'k',
            initialProduct: new MyTypNoJson(0),
            type: myTypNoJsonTag,
          }).fromJson({ x: 11 }),
        ).toThrow(
          'Please register a json parser using ' +
            'NodeBluePrint.addJsonParser(tag, parser).',
        );
      });

      it('when no string parser is registered for the type', () => {
        let message: string[] = [];
        try {
          new NodeBluePrint<TestEnum>({
            key: 'k',
            initialProduct: TestEnum.a,
            type: testEnumTag,
          }).fromJson('c');
        } catch (e) {
          message = (e as Error).message.split('\n');
        }

        expect(message).toEqual([
          'Please register a string parser using ' +
            'NodeBluePrint.addStringParser(tag, parser).',
        ]);
      });

      it('when a map value has no type and no json parser', () => {
        NodeBluePrint.clearParsers();
        // initialProduct is a class instance (not a plain map) and no type tag
        // is set, so fromJson reaches the json-parser branch with type undefined.
        expect(() =>
          new NodeBluePrint<MyTypNoJson>({
            key: 'k',
            initialProduct: new MyTypNoJson(0),
          }).fromJson({ x: 11 }),
        ).toThrow(
          'Please register a json parser using ' +
            'NodeBluePrint.addJsonParser(tag, parser).',
        );
      });

      it('when a string value has no type and no string parser', () => {
        NodeBluePrint.clearParsers();
        // initialProduct is a class instance and no type tag is set, so a string
        // value reaches the string-parser branch with type undefined.
        expect(() =>
          new NodeBluePrint<MyTypNoJson>({
            key: 'k',
            initialProduct: new MyTypNoJson(0),
          }).fromJson('some-string'),
        ).toThrow(
          'Please register a string parser using ' +
            'NodeBluePrint.addStringParser(tag, parser).',
        );
      });
    });
  });

  describe('instantiate(scope)', () => {
    it('returns existing node', () => {
      testSetNextKeyCounter(0);
      const bluePrint = NodeBluePrint.example();
      const scope = Scope.example();
      const node = new Node<number>({ bluePrint, scope });
      expect(bluePrint.instantiate({ scope })).toBe(node);
    });

    it('creates new node', () => {
      const scope = Scope.example();
      const node = new Node<number>({
        bluePrint: NodeBluePrint.example(),
        scope,
      });
      expect(
        NodeBluePrint.example({ key: 'node2' }).instantiate({ scope }),
      ).not.toBe(node);
    });

    it('does not apply builders when applyScBuilders is false', () => {
      const builder = ScBuilder.example();
      const scope = builder.scope;
      const newNode = new NodeBluePrint<number>({
        key: 'hostNoBuilders',
        initialProduct: 0,
      }).instantiate({ scope, applyScBuilders: false });
      expect(newNode.inserts.length).toBe(0);
    });
  });

  describe('instantiateAsInsert(host, index)', () => {
    it('returns a new instance', () => {
      const insert = Insert.example();
      expect(insert).not.toBeUndefined();
    });
  });

  describe('copyWith()', () => {
    describe('returns the same instance', () => {
      it('when all parameters are null', () => {
        const bluePrint = NodeBluePrint.example();
        const newBluePrint = bluePrint.copyWith({});
        expect(newBluePrint).toBe(bluePrint);
      });

      it('when no parameter has changed', () => {
        const bluePrint = NodeBluePrint.example();
        const newBluePrint = bluePrint.copyWith({
          initialProduct: bluePrint.initialProduct,
          key: bluePrint.key,
          suppliers: bluePrint.suppliers,
          produce: bluePrint.produce,
          canBeSmart: bluePrint.canBeSmart,
          smartMaster: bluePrint.smartMaster,
        });
        expect(newBluePrint).toBe(bluePrint);
      });

      it('when smart master list does not change', () => {
        const bluePrint = NodeBluePrint.example().copyWith({
          smartMaster: ['a', 'b', 'c'],
        });
        const newBluePrint = bluePrint.copyWith({ smartMaster: ['a', 'b', 'c'] });
        expect(newBluePrint).toBe(bluePrint);
      });

      it('when production timeout does not change', () => {
        const bluePrint = NodeBluePrint.example().copyWith({
          productionTimeout: new Duration({ seconds: 1 }),
        });
        const newBluePrint = bluePrint.copyWith({
          productionTimeout: new Duration({ seconds: 1 }),
        });
        expect(newBluePrint).toBe(bluePrint);
      });

      it('when propagateOnChangeOnly does not change', () => {
        const bluePrint = NodeBluePrint.example().copyWith({
          propagateOnChangeOnly: true,
        });
        const newBluePrint = bluePrint.copyWith({
          propagateOnChangeOnly: true,
        });
        expect(newBluePrint).toBe(bluePrint);
      });

      it('when change comparator does not change', () => {
        const cmp = (a: number, b: number): boolean => a === b;
        const bluePrint = NodeBluePrint.example().copyWith({
          changeComparator: cmp,
        });
        const newBluePrint = bluePrint.copyWith({ changeComparator: cmp });
        expect(newBluePrint).toBe(bluePrint);
      });
    });

    describe('returns a modified instance', () => {
      it('when parameters have different values', () => {
        const bluePrint = NodeBluePrint.example();
        const newBluePrint = bluePrint.copyWith({
          initialProduct: 1,
          key: 'node2',
          suppliers: ['supplier2'],
          produce: () => 2,
          canBeSmart: !bluePrint.canBeSmart,
          smartMaster: ['other'],
        });
        expect(newBluePrint.initialProduct).toBe(1);
        expect(newBluePrint.key).toBe('node2');
        expect(newBluePrint.suppliers).toEqual(['supplier2']);
        expect(newBluePrint.produce([], 0, Node.example({ key: 'dummy' }))).toBe(
          2,
        );
        expect(newBluePrint.canBeSmart).toBe(!bluePrint.canBeSmart);
        expect(newBluePrint.copyWith({ canBeSmart: true }).smartMaster).toEqual([
          'other',
        ]);
      });

      it('when the production timeout changes', () => {
        const bluePrint = NodeBluePrint.example();
        const newBluePrint = bluePrint.copyWith({
          productionTimeout: new Duration({ seconds: 5 }),
        });
        expect(
          newBluePrint.productionTimeout?.equals(new Duration({ seconds: 5 })),
        ).toBe(true);
      });

      it('when smart master changes by a single element of equal length', () => {
        const bluePrint = NodeBluePrint.example().copyWith({
          smartMaster: ['a', 'b', 'c'],
        });
        const newBluePrint = bluePrint.copyWith({
          smartMaster: ['a', 'b', 'x'],
        });
        expect(newBluePrint).not.toBe(bluePrint);
        expect(newBluePrint.smartMaster).toEqual(['a', 'b', 'x']);
      });

      it('when smart master is cleared to an empty list', () => {
        const bluePrint = NodeBluePrint.example().copyWith({
          smartMaster: ['a', 'b'],
        });
        const newBluePrint = bluePrint.copyWith({ smartMaster: [] });
        expect(newBluePrint).not.toBe(bluePrint);
        expect(newBluePrint.smartMaster).toEqual([]);
      });
    });

    it('should apply builders', () => {
      const builder = ScBuilder.example();
      const scope = builder.scope;
      const newNode = new NodeBluePrint<number>({
        key: 'hostX',
        initialProduct: 0,
      }).instantiate({ scope });
      expect(newNode.inserts.length).toBeGreaterThan(0);
    });
  });

  describe('forwardTo(key)', () => {
    it('should forward the supplier to this node', () => {
      const a = new NodeBluePrint<number>({ key: 'a', initialProduct: 5 });
      const b = a.forwardTo('b');
      const scope = Scope.example();
      const nodeA = a.instantiate({ scope });
      const nodeB = b.instantiate({ scope });
      scope.scm.flush();

      expect(b.key).toBe('b');
      expect(b.initialProduct).toBe(a.initialProduct);
      expect(b.suppliers).toEqual(['a']);
      expect(nodeA.product).toBe(nodeB.product);

      // A change of a should be forwarded to b
      nodeA.product = 12;
      scope.scm.flush();
      expect(nodeB.product).toBe(12);
    });
  });

  describe('switchSupplier(supplier)', () => {
    it('should forward the suppliers value to this node', () => {
      const scope = Scope.example();
      const scm = scope.scm;
      scope.mockContent({
        a: {
          b: {
            n0: new NodeBluePrint<number>({ key: 'n0', initialProduct: 618 }),
          },
          c: {
            // Here we are forwarding the value from b.n0 to c.n1
            n1: new NodeBluePrint<number>({
              key: 'n1',
              initialProduct: 374,
            }).connectSupplier('b/n0'),
          },
        },
      });

      const n0 = scope.findNode<number>('n0')!;
      const n1 = scope.findNode<number>('n1')!;

      scm.flush();

      // The value of n0 should be forwarded to n1
      expect(n0.product).toBe(618);
      expect(n1.product).toBe(618);

      // Change value of n0
      n0.product = 123;
      scm.flush();
      expect(n1.product).toBe(123);
    });
  });

  it('initSuppliers', () => {
    const scope = Scope.example();
    const scm = scope.scm;
    expect(scm).toBeInstanceOf(Scm);
    scope.mockContent({
      a: {
        b: {
          n0: new NodeBluePrint<number>({ key: 'n0', initialProduct: 618 }),
          n2: new NodeBluePrint<number>({ key: 'n2', initialProduct: 618 }),
        },
        c: {
          n1: nbp<number>({
            from: ['b/n0', 'b/n2'],
            to: 'n1',
            init: 0,
            produce: () => 0,
          }),
        },
      },
    });
    scm.flush();

    const n1 = scope.findNode<number>('n1')!;
    const suppliers = n1.suppliers;
    expect(suppliers).toHaveLength(2);

    const supplierMap = new Map<string, Node<any>>();
    for (let i = 0; i < suppliers.length; i++) {
      const key = n1.bluePrint.suppliers[i];
      supplierMap.set(key, suppliers[i]);
    }

    n1.initSuppliers(supplierMap);
  });

  describe('smart nodes', () => {
    const node = new NodeBluePrint<number>({ key: 'node', initialProduct: 0 });

    const smartNode = new NodeBluePrint<number>({
      key: 'node',
      initialProduct: 0,
      smartMaster: ['x', 'y'],
    });

    describe('smartMaster', () => {
      describe('returns an empty list', () => {
        it('by default', () => {
          expect(node.smartMaster).toEqual([]);
        });
      });
      it('returns the smart master path handed over in constructor', () => {
        expect(smartNode.smartMaster).toEqual(['x', 'y']);
      });
    });

    describe('isSmartNode', () => {
      it('returns false by default', () => {
        expect(node.isSmartNode).toBe(false);
      });

      it('returns true when smartMaster is not empty', () => {
        expect(smartNode.isSmartNode).toBe(true);
      });

      describe('returns false when canBeSmart is set to false', () => {
        it('anyway if a smart master is set or not', () => {
          expect(node.copyWith({ canBeSmart: false }).isSmartNode).toBe(false);
          expect(smartNode.copyWith({ canBeSmart: false }).isSmartNode).toBe(
            false,
          );
        });
      });
    });

    describe('canBeSmart', () => {
      it('make a node never be a smart node', () => {
        const n = node.copyWith({ canBeSmart: false });
        const s = smartNode.copyWith({ canBeSmart: false });

        expect(n.canBeSmart).toBe(false);
        expect(n.isSmartNode).toBe(false);
        expect(n.smartMaster).toHaveLength(0);

        expect(s.canBeSmart).toBe(false);
        expect(s.isSmartNode).toBe(false);
        expect(s.smartMaster).toHaveLength(0);
      });
    });
  });

  describe('addJsonParser, removeJsonParser, clearJsonParsers', () => {
    it('should add a json parser for a type', () => {
      NodeBluePrint.addJsonParser<MyType>(myTypeTag, MyType.fromJson);
      const n = new NodeBluePrint<MyType>({
        key: 'n',
        initialProduct: new MyType(0),
        type: myTypeTag,
      });
      expect((n.fromJson({ x: 42 }) as MyType).x).toBe(42);
      NodeBluePrint.clearParsers();
      NodeBluePrint.removeJsonParser<MyType>(myTypeTag);
    });

    it('should throw if a parser for the type is already registered', () => {
      NodeBluePrint.addJsonParser<MyType>(myTypeTag, (json) =>
        MyType.fromJson(json),
      );
      expect(() =>
        NodeBluePrint.addJsonParser<MyType>(myTypeTag, (json) =>
          MyType.fromJson(json),
        ),
      ).toThrow('A different json parser for type MyType is already registered.');

      NodeBluePrint.clearParsers();
    });

    // TODO(port): unreachable due to a src bug in node-blue-print.ts. The node
    // here has a class-instance `initialProduct`, so `fromJson` of a plain
    // object goes through `castMap` and returns the raw object rather than
    // throwing once the parser is removed (same root cause as the
    // "no json parser registered" case above).
    it('removeJsonParser actually removes the registered parser', () => {
      NodeBluePrint.clearParsers();
      NodeBluePrint.addJsonParser<MyType>(myTypeTag, MyType.fromJson);
      NodeBluePrint.removeJsonParser<MyType>(myTypeTag);

      const n = new NodeBluePrint<MyType>({
        key: 'n',
        initialProduct: new MyType(0),
        type: myTypeTag,
      });
      expect(() => n.fromJson({ x: 42 })).toThrow();

      NodeBluePrint.clearParsers();
    });
  });

  describe('addJsonSerializer', () => {
    // TODO(port): unreachable due to a src bug in node-blue-print.ts. `toJson`
    // returns any class instance unchanged (isPlainObjectOrMap short-circuits),
    // so the registered serializers are never consulted and the products come
    // back as MyTypNoJson / MyTypNoJson2 instances instead of {a:1} / {b:2}.
    it('keys serializers by type so multiple types stay independent', () => {
      NodeBluePrint.clearParsers();
      NodeBluePrint.addJsonSerializer<MyTypNoJson>(myTypNoJsonTag, (d) => ({
        a: d.x,
      }));
      NodeBluePrint.addJsonSerializer<MyTypNoJson2>(myTypNoJson2Tag, (d) => ({
        b: d.x,
      }));

      expect(
        new NodeBluePrint<MyTypNoJson>({
          key: 'k',
          initialProduct: new MyTypNoJson(0),
          type: myTypNoJsonTag,
        }).toJson(new MyTypNoJson(1)),
      ).toEqual({ a: 1 });
      expect(
        new NodeBluePrint<MyTypNoJson2>({
          key: 'k',
          initialProduct: new MyTypNoJson2(0),
          type: myTypNoJson2Tag,
        }).toJson(new MyTypNoJson2(2)),
      ).toEqual({ b: 2 });

      NodeBluePrint.clearParsers();
    });

    it('keeps the first serializer when registering the same type twice', () => {
      NodeBluePrint.clearParsers();
      const first = (d: MyTypNoJson): unknown => ({ a: d.x });
      const second = (d: MyTypNoJson): unknown => ({ a: d.x + 100 });

      NodeBluePrint.addJsonSerializer<MyTypNoJson>(myTypNoJsonTag, first);
      // Second registration is a no-op (the map already has the type id).
      NodeBluePrint.addJsonSerializer<MyTypNoJson>(myTypNoJsonTag, second);

      expect(
        new NodeBluePrint<MyTypNoJson>({
          key: 'k',
          initialProduct: new MyTypNoJson(0),
          type: myTypNoJsonTag,
        }).toJson(new MyTypNoJson(1)),
      ).toEqual({ a: 1 });

      NodeBluePrint.clearParsers();
    });
  });

  describe('addStringParser, removeStringParser, clearStringParsers', () => {
    it('should add a json parser for a type', () => {
      NodeBluePrint.addStringParser<TestEnum>(testEnumTag, testEnumFromString);
      const n = new NodeBluePrint<TestEnum>({
        key: 'n',
        initialProduct: TestEnum.a,
        type: testEnumTag,
      });
      expect(n.fromJson('a')).toBe(TestEnum.a);
    });

    it('should throw if a parser for the type is already registered', () => {
      NodeBluePrint.addStringParser<TestEnum>(testEnumTag, testEnumFromString);
      expect(() =>
        NodeBluePrint.addStringParser<TestEnum>(testEnumTag, (x) =>
          testEnumFromString(x),
        ),
      ).toThrow(
        'A different string parser for type TestEnum is already registered.',
      );

      NodeBluePrint.clearParsers();
    });
  });
});

describe('doNothing', () => {
  it('returns previousProduct', () => {
    expect(doNothing([], 11, Node.example({ key: 'dummy' }))).toBe(11);
  });
});

describe('castMap(map)', () => {
  // int/double/num collapse to number, so the Dart numeric-cast matrix (int,
  // double, num conversions and their throw cases) no longer applies. Only the
  // _hash-removal and pass-through cases survive.
  const dynamicNode = new NodeBluePrint<Record<string, unknown>>({
    initialProduct: { a: 1, s: 'str' },
    key: 'dynamicMap',
  });

  describe('removes _hashes on casting', () => {
    it('from a map with _hashes', () => {
      const mapWithHashes: Record<string, unknown> = { a: 1, _hash: '#HASH' };
      const casted = dynamicNode.castMap(mapWithHashes);
      expect(casted).toEqual({ a: 1 });
    });
  });

  describe('casts into a node', () => {
    it('returns the map back when there is no _hash', () => {
      const map: Record<string, unknown> = { a: 1, s: 'str' };
      const casted = dynamicNode.castMap(map);
      expect(casted).toBe(map);
      expect(casted).toEqual({ a: 1, s: 'str' });
    });
  });
});
