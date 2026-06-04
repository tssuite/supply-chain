// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it, vi } from 'vitest';

import { Owner } from '../src/owner.ts';

describe('Owner', () => {
  describe('example', () => {
    it('should have only undefined callbacks', () => {
      expect(Owner.example.willDispose).toBeUndefined();
      expect(Owner.example.didDispose).toBeUndefined();
      expect(Owner.example.willErase).toBeUndefined();
      expect(Owner.example.didErase).toBeUndefined();
      expect(Owner.example.willUndispose).toBeUndefined();
      expect(Owner.example.didUndispose).toBeUndefined();
    });
  });

  describe('constructor', () => {
    it('stores the provided callbacks', () => {
      const willDispose = vi.fn();
      const didDispose = vi.fn();
      const willUndispose = vi.fn();
      const didUndispose = vi.fn();
      const willErase = vi.fn();
      const didErase = vi.fn();

      const owner = new Owner<number>({
        willDispose,
        didDispose,
        willUndispose,
        didUndispose,
        willErase,
        didErase,
      });

      owner.willDispose?.(1);
      owner.didDispose?.(2);
      owner.willUndispose?.(3);
      owner.didUndispose?.(4);
      owner.willErase?.(5);
      owner.didErase?.(6);

      expect(willDispose).toHaveBeenCalledWith(1);
      expect(didDispose).toHaveBeenCalledWith(2);
      expect(willUndispose).toHaveBeenCalledWith(3);
      expect(didUndispose).toHaveBeenCalledWith(4);
      expect(willErase).toHaveBeenCalledWith(5);
      expect(didErase).toHaveBeenCalledWith(6);
    });

    it('defaults to no callbacks', () => {
      const owner = new Owner<number>();
      expect(owner.willDispose).toBeUndefined();
    });
  });
});
