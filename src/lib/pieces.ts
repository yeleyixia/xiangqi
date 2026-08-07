import type { Piece } from '../types';

export const PIECE_SPRITE_URL = '/pieces.webp';

// 木质棋子素材在精灵图中的源矩形（基于 红上黑下透明.png）
// 布局：7 列 x 2 行；第 0 行黑方 R,N,B,A,K,C,P；第 1 行红方 R,N,B,A,K,C,P
// 方向约定：素材中所有棋子文字均正立（红黑统一）。
// 执黑视角时棋盘整盘旋转 180°，棋子通过 upright 选项反向旋转 180° 保持文字正立。
export const PIECE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'black-R': { x: 6, y: 8, w: 213, h: 238 },   // 車（倒置）
  'black-N': { x: 231, y: 9, w: 211, h: 237 },  // 馬（倒置）
  'black-B': { x: 455, y: 9, w: 211, h: 237 },  // 象（倒置）
  'black-A': { x: 677, y: 7, w: 215, h: 240 },  // 士（倒置）
  'black-K': { x: 904, y: 8, w: 209, h: 238 },  // 將（倒置）
  'black-C': { x: 1127, y: 10, w: 210, h: 234 }, // 砲（倒置）
  'black-P': { x: 1350, y: 9, w: 213, h: 237 },  // 卒（倒置）
  'red-R': { x: 6, y: 264, w: 212, h: 234 },     // 車
  'red-N': { x: 231, y: 263, w: 211, h: 236 },   // 馬
  'red-B': { x: 455, y: 263, w: 211, h: 236 },   // 相
  'red-A': { x: 677, y: 263, w: 215, h: 237 },   // 仕
  'red-K': { x: 903, y: 263, w: 210, h: 236 },   // 帥
  'red-C': { x: 1128, y: 265, w: 209, h: 233 },  // 炮
  'red-P': { x: 1351, y: 267, w: 211, h: 229 },  // 兵
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

export interface DrawPieceOptions {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  upright?: boolean;
}

export function drawPieceSprite(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  x: number,
  y: number,
  size: number,
  image: HTMLImageElement,
  options?: DrawPieceOptions
) {
  const rect = PIECE_RECTS[getPieceKey(piece)];
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

  // 棋盘旋转 180° 时，棋子文字会倒立；upright=true 绕棋子中心反向旋转 180° 保持正立
  if (options?.upright) {
    ctx.translate(x, y);
    ctx.rotate(Math.PI);
    ctx.drawImage(
      image,
      rect.x, rect.y, rect.w, rect.h,
      -dw / 2, -dh / 2, dw, dh
    );
  } else {
    ctx.drawImage(
      image,
      rect.x, rect.y, rect.w, rect.h,
      x - dw / 2, y - dh / 2, dw, dh
    );
  }

  ctx.restore();
}
