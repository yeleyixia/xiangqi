import type { Piece } from '../types';

export const PIECE_SPRITE_URL = '/pieces.webp';

// 木质棋子素材在精灵图中的源矩形（基于 2棋子换木质质感.png）
// 布局：7 列 x 2 行；第 0 行黑方 R,N,B,A,K,C,P；第 1 行红方 R,N,B,A,K,C,P
export const PIECE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'black-R': { x: 6, y: 8, w: 213, h: 238 },   // 車
  'black-N': { x: 231, y: 9, w: 211, h: 237 },  // 馬
  'black-B': { x: 455, y: 9, w: 211, h: 237 },  // 象
  'black-A': { x: 677, y: 7, w: 215, h: 240 },  // 士
  'black-K': { x: 904, y: 8, w: 209, h: 238 },  // 將
  'black-C': { x: 1127, y: 10, w: 210, h: 234 }, // 炮
  'black-P': { x: 1350, y: 9, w: 213, h: 237 },  // 卒
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
  // 棋盘整盘 180° 旋转（执黑视角）时置为 true：在棋子自身中心再旋转 180°
  // 抵消整盘旋转，保证棋子上的文字始终正立可读（位置不受影响）。
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

  if (options?.upright) {
    // 执黑视角：整盘已绕棋盘中心旋转 180°，这里在棋子自身中心再旋转 180°，
    // 净效果为不旋转，棋子文字保持正立可读；位置由整盘旋转负责，不受影响。
    ctx.translate(x, y);
    ctx.rotate(Math.PI);
    ctx.drawImage(
      image,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      -dw / 2,
      -dh / 2,
      dw,
      dh
    );
  } else {
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
  }

  ctx.restore();
}
