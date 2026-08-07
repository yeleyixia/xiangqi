import type { Piece } from '../types';
import type { Side } from '../types';

// 两张精灵图：
// - pieces-red-bottom.webp：黑方在顶行(y≈8)、红方在底行(y≈263) → 执红视角用
// - pieces-black-bottom.webp：红方在顶行(y≈8)、黑方在底行(y≈263) → 执黑视角用
// 不做 180° 旋转，改用坐标翻转 + 对应精灵图，所有文字天然正立。

// 执红视角的精灵图（红方在底行）
const RED_BOTTOM_SPRITE = '/pieces-red-bottom.webp';
// 执黑视角的精灵图（黑方在底行）
const BLACK_BOTTOM_SPRITE = '/pieces-black-bottom.webp';

// 精灵图源矩形：7 列 x 2 行
// 顶行 y≈8（黑方 或 红方，取决于用哪张图）
// 底行 y≈263（红方 或 黑方，取决于用哪张图）
interface Rect { x: number; y: number; w: number; h: number; }

const COLS: Record<string, number> = {
  R: 0, N: 1, B: 2, A: 3, K: 4, C: 5, P: 6
};

// 每列的 x 偏移（基于原始精灵图像素测量）
const COL_X: number[] = [6, 231, 455, 677, 904, 1127, 1350];
const TOP_Y = 8;    // 顶行 y
const BOTTOM_Y = 263; // 底行 y
const RECT_W = 213;
const RECT_H = 238;

// 根据精灵图类型生成 PIECE_RECTS
function buildRects(playerOnBottom: Side): Record<string, Rect> {
  const bottomSide = playerOnBottom; // 底行是这个方
  const topSide: Side = bottomSide === 'red' ? 'black' : 'red';

  const rects: Record<string, Rect> = {};

  // 底行棋子
  for (const [type, col] of Object.entries(COLS)) {
    rects[`${bottomSide}-${type}`] = {
      x: COL_X[col], y: BOTTOM_Y, w: RECT_W, h: RECT_H
    };
  }
  // 顶行棋子
  for (const [type, col] of Object.entries(COLS)) {
    rects[`${topSide}-${type}`] = {
      x: COL_X[col], y: TOP_Y, w: RECT_W, h: RECT_H
    };
  }

  return rects;
}

// 预生成两组 PIECE_RECTS
export const PIECE_RECTS_RED_BOTTOM = buildRects('red');   // 执红用
export const PIECE_RECTS_BLACK_BOTTOM = buildRects('black'); // 执黑用

export function getPieceRects(mySide: Side | null): Record<string, Rect> {
  return mySide === 'black' ? PIECE_RECTS_BLACK_BOTTOM : PIECE_RECTS_RED_BOTTOM;
}

export function getPiecesSpriteUrl(mySide: Side | null): string {
  return mySide === 'black' ? BLACK_BOTTOM_SPRITE : RED_BOTTOM_SPRITE;
}

export function getPieceKey(piece: Piece): string {
  return `${piece.side}-${piece.type}`;
}

export function loadPiecesImage(mySide: Side | null = null): Promise<HTMLImageElement> {
  const url = getPiecesSpriteUrl(mySide);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

export interface DrawPieceOptions {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export function drawPieceSprite(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  x: number,
  y: number,
  size: number,
  image: HTMLImageElement,
  rects: Record<string, Rect>,
  options?: DrawPieceOptions
) {
  const rect = rects[getPieceKey(piece)];
  if (!rect) return;

  // 保持棋子原始宽高比，等比缩放至最大边等于 size
  const scale = size / Math.max(rect.w, rect.h);
  const dw = rect.w * scale;
  const dh = rect.h * scale;

  ctx.save();
  ctx.shadowColor = options?.shadowColor ?? 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = options?.shadowBlur ?? Math.max(3, size * 0.12);
  ctx.shadowOffsetX = options?.shadowOffsetX ?? 0;
  ctx.shadowOffsetY = options?.shadowOffsetY ?? Math.max(1, size * 0.05);

  ctx.drawImage(
    image,
    rect.x, rect.y, rect.w, rect.h,
    x - dw / 2, y - dh / 2, dw, dh
  );

  ctx.restore();
}
