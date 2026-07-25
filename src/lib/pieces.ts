import type { Piece } from '../types';

export const PIECE_SPRITE_URL = '/pieces.png';

// 棋子素材在精灵图中的源矩形（基于对 qizi.png 的连通区域检测）
export const PIECE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'black-R': { x: 53, y: 48, w: 208, h: 221 },   // 車
  'black-N': { x: 266, y: 47, w: 206, h: 224 },  // 馬
  'black-B': { x: 478, y: 48, w: 205, h: 223 },  // 象
  'black-A': { x: 688, y: 48, w: 206, h: 225 },  // 士
  'black-K': { x: 900, y: 47, w: 203, h: 223 },  // 將
  'black-C': { x: 268, y: 456, w: 203, h: 221 }, // 炮
  'black-P': { x: 57, y: 667, w: 209, h: 226 },  // 卒
  'red-P': { x: 58, y: 1285, w: 207, h: 215 },   // 兵
  'red-C': { x: 268, y: 1497, w: 204, h: 221 },  // 炮
  'red-R': { x: 52, y: 1899, w: 209, h: 227 },   // 車
  'red-N': { x: 264, y: 1898, w: 206, h: 228 },  // 馬
  'red-B': { x: 474, y: 1897, w: 207, h: 227 },  // 相
  'red-A': { x: 687, y: 1899, w: 208, h: 227 },  // 仕
  'red-K': { x: 900, y: 1900, w: 205, h: 226 },  // 帥
};

export function getPieceKey(piece: Piece): string {
  return `${piece.side}-${piece.type}`;
}

export function loadPiecesImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = PIECE_SPRITE_URL;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

export function drawPieceSprite(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  x: number,
  y: number,
  size: number,
  image: HTMLImageElement
) {
  const rect = PIECE_RECTS[getPieceKey(piece)];
  if (!rect) return;

  // 保持棋子原始宽高比，等比缩放至最大边等于 size
  const scale = size / Math.max(rect.w, rect.h);
  const dw = rect.w * scale;
  const dh = rect.h * scale;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = Math.max(3, size * 0.12);
  ctx.shadowOffsetY = Math.max(1, size * 0.05);

  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    x - dw / 2,
    y - dh / 2,
    dw,
    dh
  );

  ctx.restore();
}
