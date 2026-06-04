// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ButterFlyExample, Graph } from '../../src/index.ts';

import type { Node, Scope } from '../../src/index.ts';

/** A bundle of nodes/scopes built from {@link ButterFlyExample} for tests. */
export class TestGraphs {
  butterFly: ButterFlyExample;
  allScopeKeys: string[];

  allNodes: Node<any>[];
  allScopes: Scope[];
  allNodeKeys: string[];

  graph: Graph;

  s111: Node<string>;
  s11: Node<string>;
  s10: Node<string>;
  s01: Node<string>;
  s00: Node<string>;
  s1: Node<string>;
  s0: Node<string>;
  x: Node<string>;
  c0: Node<string>;
  c1: Node<string>;
  c00: Node<string>;
  c01: Node<string>;
  c10: Node<string>;
  c11: Node<string>;
  c111: Node<string>;
  level0: Scope;
  level1: Scope;
  level2: Scope;
  level3: Scope;

  constructor() {
    this.butterFly = new ButterFlyExample({ withScopes: true });

    this.allScopeKeys = this.butterFly.x.scope.pathArray;

    this.s111 = this.butterFly.s111;
    this.s11 = this.butterFly.s11;
    this.s10 = this.butterFly.s10;
    this.s01 = this.butterFly.s01;
    this.s00 = this.butterFly.s00;
    this.s1 = this.butterFly.s1;
    this.s0 = this.butterFly.s0;
    this.x = this.butterFly.x;
    this.c0 = this.butterFly.c0;
    this.c1 = this.butterFly.c1;
    this.c00 = this.butterFly.c00;
    this.c01 = this.butterFly.c01;
    this.c10 = this.butterFly.c10;
    this.c11 = this.butterFly.c11;
    this.c111 = this.butterFly.c111;
    this.level0 = this.butterFly.level0;
    this.level1 = this.butterFly.level1;
    this.level2 = this.butterFly.level2;
    this.level3 = this.butterFly.level3;

    this.allNodes = this.x.scope.scm.nodes.filter((n) => !n.scope.isMetaScope);
    this.allScopes = this.butterFly.allScopes;
    this.allNodeKeys = this.allNodes.map((n) => n.key);

    this.graph = new Graph();

    this.x.scm.flush();
  }
}
