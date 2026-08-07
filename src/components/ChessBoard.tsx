import React, { useRef, useEffect } from 'react';
import { Piece, Position, Side } from '../types';
import { loadPiecesImage, drawPieceSprite, getPieceRects, getPiecesSpriteUrl } from '../lib/pieces';
import { screenRowLabel, screenColLabel, flipPosition } from '../lib/chess';

interface ChessBoardProps {
  board: (Piece | null)[][];
  selectedPiece: Position | null;
  validMoves: Position[];
  mySide: Side | null;
  onSquareClick: (row: number, col: number) => void;
  lastMove?: { from: Position; to: Position } | null;
  showCoordinates?: boolean;
}

// 棋盘基准坐标系（与 board.webp 内部网格对齐）
const BASE_CS = 52; // 格子大小
const BASE_OX = 30; // X偏移
const BASE_OY = 28; // Y偏移
const BASE_W = BASE_OX * 2 + 8 * BASE_CS;
const BASE_H = BASE_OY * 2 + 9 * BASE_CS;
const BASE_PIECE_SIZE = Math.round(BASE_CS * 0.88); // 棋子占格子比例

// 画布垂直内边距：确保顶部/底部边缘棋子不被 board-wrapper 圆角(overflow:hidden)裁剪
const BOARD_PAD_Y = 14;
const OY = BASE_OY + BOARD_PAD_Y; // 实际Y偏移 = 基准偏移 + 画布内边距
const CANVAS_H = BASE_H + 2 * BOARD_PAD_Y; // 含内边距的画布总高

export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  selectedPiece,
  validMoves,
  mySide,
  onSquareClick,
  lastMove,
  showCoordinates = false
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardImgRef = useRef<HTMLImageElement | null>(null);
  const piecesImgRef = useRef<HTMLImageElement | null>(null);
  const boardLoadedRef = useRef(false);
  const piecesLoadedRef = useRef(false);
  const scaleRef = useRef(1);
  const dprRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<((ctx: CanvasRenderingContext2D) => void) | null>(null);

  // 实时同步 mySide 到 ref
  const mySideRef = useRef<Side | null>(mySide);
  mySideRef.current = mySide;

  // 统一绘制入口
  const scheduleDraw = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawRef.current?.(ctx);
    });
  };

  // 初始加载棋盘背景图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!boardImgRef.current) {
      const img = new Image();
      img.src = '/board.webp';
      img.onload = () => { boardLoadedRef.current = true; scheduleDraw(); };
      img.onerror = () => { boardLoadedRef.current = false; scheduleDraw(); };
      boardImgRef.current = img;
    }

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // 棋子精灵图：根据 mySide 加载对应图片
  useEffect(() => {
    const url = getPiecesSpriteUrl(mySide);
    // 如果已加载的图片 URL 不同，重新加载
    if (piecesImgRef.current && piecesImgRef.current.src.endsWith(url)) {
      return; // 已加载正确的图
    }
    piecesLoadedRef.current = false;
    loadPiecesImage(mySide)
      .then((img) => {
        piecesLoadedRef.current = true;
        piecesImgRef.current = img;
        scheduleDraw();
      })
      .catch(() => {
        piecesLoadedRef.current = false;
        scheduleDraw();
      });
  }, [mySide]);

  // 棋盘数据变化时重绘
  useEffect(() => {
    scheduleDraw();
  }, [board, selectedPiece, validMoves, lastMove, showCoordinates, mySide]);

  // 监听父容器尺寸
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const parent = wrapper.parentElement;
    if (!parent) return;

    const resize = () => {
      const parentRect = parent.getBoundingClientRect();
      const availWidth = Math.max(1, Math.floor(parentRect.width));
      const availHeight = Math.max(1, Math.floor(parentRect.height));
      const boardAspect = CANVAS_H / BASE_W;

      let displayWidth = availWidth;
      let displayHeight = displayWidth * boardAspect;
      if (displayHeight > availHeight) {
        displayHeight = availHeight;
        displayWidth = displayHeight / boardAspect;
      }

      displayWidth = Math.max(1, Math.floor(displayWidth));
      displayHeight = Math.max(1, Math.floor(displayHeight));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      scaleRef.current = displayWidth / BASE_W;

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;

      scheduleDraw();
    };

    resize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(parent);
    } else {
      window.addEventListener('resize', resize);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
    };
  }, []);

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scale = scaleRef.current;
    const dpr = dprRef.current;
    const isFlipped = mySideRef.current === 'black';

    // 坐标翻转函数：执黑时行列翻转，不做 180° 旋转
    const screenCol = (c: number) => isFlipped ? 8 - c : c;
    const screenRow = (r: number) => isFlipped ? 9 - r : r;
    const colX = (c: number) => BASE_OX + screenCol(c) * BASE_CS;
    const rowY = (r: number) => OY + screenRow(r) * BASE_CS;

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, BASE_W, CANVAS_H);

    // 绘制棋盘背景图
    if (boardLoadedRef.current && boardImgRef.current) {
      ctx.drawImage(boardImgRef.current, 0, BOARD_PAD_Y, BASE_W, BASE_H);
    } else {
      ctx.fillStyle = '#e8c97a';
      ctx.fillRect(0, 0, BASE_W, CANVAS_H);
    }

    // 上一步起始位置标记
    if (lastMove) {
      const fx = colX(lastMove.from.col);
      const fy = rowY(lastMove.from.row);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(3, BASE_CS * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fx, fy, BASE_CS * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 绘制棋子（不用 upright，文字天然正立）
    const rects = getPieceRects(mySideRef.current);
    if (piecesLoadedRef.current && piecesImgRef.current) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] && !(selectedPiece && selectedPiece.row === r && selectedPiece.col === c)) {
            drawPieceSprite(ctx, board[r][c]!, colX(c), rowY(r), BASE_PIECE_SIZE, piecesImgRef.current, rects);
          }
        }
      }
    }

    // 上一步落子位置标记
    if (lastMove) {
      const tx = colX(lastMove.to.col);
      const ty = rowY(lastMove.to.row);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, BASE_PIECE_SIZE * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 合法走法提示
    const HINT_COLOR = '164, 179, 89';
    validMoves.forEach(m => {
      const mx = colX(m.col);
      const my = rowY(m.row);

      if (board[m.row][m.col]) {
        ctx.save();
        ctx.strokeStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, BASE_PIECE_SIZE * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.beginPath();
        ctx.arc(mx, my, BASE_PIECE_SIZE * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(5, BASE_CS * 0.13), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // 选中棋子：上浮立体绘制
    if (selectedPiece && piecesLoadedRef.current && piecesImgRef.current) {
      const sx = colX(selectedPiece.col);
      const sy = rowY(selectedPiece.row);
      const liftedSize = Math.round(BASE_PIECE_SIZE * 1.12);
      const liftOffset = -BASE_CS * 0.12;

      drawPieceSprite(
        ctx,
        board[selectedPiece.row][selectedPiece.col]!,
        sx,
        sy + liftOffset,
        liftedSize,
        piecesImgRef.current,
        rects,
        {
          shadowColor: 'rgba(0, 0, 0, 0.45)',
          shadowBlur: 14,
          shadowOffsetX: 2,
          shadowOffsetY: 6
        }
      );
    }

    // 坐标标注
    if (showCoordinates) {
      ctx.fillStyle = '#5a3010';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(240, 216, 138, 0.8)';
      ctx.shadowBlur = 4;

      const colLabel = (i: number) => screenColLabel(i);
      const rowLabel = (i: number) => screenRowLabel(i, isFlipped);

      for (let i = 0; i < 9; i++) {
        ctx.fillText(colLabel(i), BASE_OX + i * BASE_CS, OY - 12);
        ctx.fillText(colLabel(i), BASE_OX + i * BASE_CS, OY + 9 * BASE_CS + 12);
      }

      for (let i = 0; i < 10; i++) {
        ctx.fillText(rowLabel(i), BASE_OX - 12, OY + i * BASE_CS);
        ctx.fillText(rowLabel(i), BASE_OX + 8 * BASE_CS + 12, OY + i * BASE_CS);
      }

      ctx.shadowBlur = 0;
    }
  };

  drawRef.current = drawBoard;

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scaleRef.current;
    const my = (e.clientY - rect.top) / scaleRef.current;

    let col = Math.round((mx - BASE_OX) / BASE_CS);
    let row = Math.round((my - OY) / BASE_CS);

    // 执黑方时屏幕坐标与逻辑坐标相反，映射回逻辑坐标
    if (mySideRef.current === 'black') {
      const logical = flipPosition({ row, col });
      row = logical.row;
      col = logical.col;
    }

    if (col >= 0 && col <= 8 && row >= 0 && row <= 9) {
      onSquareClick(row, col);
    }
  };

  return (
    <div className="board-wrapper" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          display: 'block',
          cursor: 'pointer'
        }}
      />
    </div>
  );
};
