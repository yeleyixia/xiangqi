import { describe, it, expect } from 'vitest';
import { PIECE_RECTS, getPieceKey } from './pieces';
import type { Piece } from '../types';

describe('棋子素材配置（红上黑下透明.png）', () => {
  it('每个棋子类型都有对应的源矩形', () => {
    const sides = ['red', 'black'] as const;
    const types = ['R', 'N', 'B', 'A', 'K', 'C', 'P'] as const;
    for (const side of sides) {
      for (const type of types) {
        const key = `${side}-${type}`;
        expect(PIECE_RECTS[key], `缺少 ${key} 的源矩形`).toBeDefined();
        const r = PIECE_RECTS[key];
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('黑方/红方同类型棋子使用相近尺寸（同一套模板，允许素材边缘差异）', () => {
    const types = ['R', 'N', 'B', 'A', 'K', 'C', 'P'] as const;
    for (const type of types) {
      const black = PIECE_RECTS[`black-${type}`];
      const red = PIECE_RECTS[`red-${type}`];
      // 允许 ±10px 的微小偏差（素材边缘差异）
      expect(Math.abs(black.w - red.w)).toBeLessThanOrEqual(10);
      expect(Math.abs(black.h - red.h)).toBeLessThanOrEqual(10);
    }
  });

  it('getPieceKey 按 边-类型 生成 key，与 PIECE_RECTS 一致', () => {
    const piece: Piece = { type: 'K', side: 'black' };
    expect(getPieceKey(piece)).toBe('black-K');
    expect(PIECE_RECTS[getPieceKey(piece)]).toBeDefined();
  });

  it('素材方向约定：红子在第 1 行（正立），黑子在第 0 行（红方视角倒置）', () => {
    // 红方棋子统一在 y≈264 的下半区，黑方棋子统一在 y≈8 的上半区
    for (const type of ['R', 'N', 'B', 'A', 'K', 'C', 'P'] as const) {
      const red = PIECE_RECTS[`red-${type}`];
      const black = PIECE_RECTS[`black-${type}`];
      expect(red.y).toBeGreaterThan(200);
      expect(black.y).toBeLessThan(100);
    }
  });
});
