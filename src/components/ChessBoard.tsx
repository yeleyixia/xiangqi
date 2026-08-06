import React, { useRef, useEffect } from 'react';
import { Piece, Position, Side } from '../types';
import { loadPiecesImage, drawPieceSprite } from '../lib/pieces';
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
  // 用 ref 保存最新绘制函数，避免图片 onload 等异步回调捕获陈旧闭包
  const drawRef = useRef<((ctx: CanvasRenderingContext2D) => void) | null>(null);

  // 统一绘制入口，防抖避免 ResizeObserver 频繁触发
  const scheduleDraw = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // 始终调用最新的绘制函数（drawRef 每次渲染都更新），避免陈旧闭包
      drawRef.current?.(ctx);
    });
  };

  // 初始加载棋盘和棋子图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 加载棋盘背景图
    if (!boardImgRef.current) {
      const img = new Image();
      img.src = '/board.webp';
      img.onload = () => {
        boardLoadedRef.current = true;
        scheduleDraw();
      };
      img.onerror = () => {
        boardLoadedRef.current = false;
        scheduleDraw();
      };
      boardImgRef.current = img;
    }

    // 加载棋子精灵图
    if (!piecesImgRef.current) {
      loadPiecesImage()
        .then((img) => {
          piecesLoadedRef.current = true;
          piecesImgRef.current = img;
          scheduleDraw();
        })
        .catch(() => {
          piecesLoadedRef.current = false;
          scheduleDraw();
        });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 实时同步最新 mySide 到 ref，避免 resize / 图片加载等一次性闭包捕获过期的翻转状态
  // 渲染期直接赋值：任何异步回调（img.onload / rAF / resize）读取到的都是最新值，
  // 时序上严格优于放进 useEffect（提交后异步执行，存在旧值窗口）
  const mySideRef = useRef<Side | null>(mySide);
  mySideRef.current = mySide; // 渲染期同步，勿放进 useEffect

  // 棋盘数据变化时重绘
  useEffect(() => {
    scheduleDraw();
  }, [board, selectedPiece, validMoves, lastMove, showCoordinates, mySide]);

  // 执黑方时整盘旋转 180°，让己方棋子显示在下方（我方视角）
  // 棋盘网格本身中心对称，旋转后与 BASE_CS 坐标系依然精确对齐
  // 注意：绘制/点击均从 mySideRef 读取实时视角，避免一次性闭包捕获过期状态

  // 监听父容器(board-container)尺寸，在可用宽高内按棋盘比例缩放，保证竖屏/横屏都适配
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    // 父容器 board-container 的尺寸由 flex 布局决定，不受 canvas 影响
    const parent = wrapper.parentElement;
    if (!parent) return;

    const resize = () => {
      const parentRect = parent.getBoundingClientRect();
      const availWidth = Math.max(1, Math.floor(parentRect.width));
      const availHeight = Math.max(1, Math.floor(parentRect.height));
      const boardAspect = CANVAS_H / BASE_W; // 含内边距的高/宽比

      // 在可用空间内按棋盘比例缩放：先按宽度试算，超出高度则按高度反推
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

    // 设置变换：坐标系以 BASE 单位为准，但按显示缩放 + DPR 输出到像素
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    // 清空画布（使用含内边距的总高）
    ctx.clearRect(0, 0, BASE_W, CANVAS_H);

    // 执黑方视角：绕棋盘中心旋转 180°（棋子、棋盘图、标记、坐标一并翻转）
    // 从 ref 读取最新视角，避免 resize/图片加载等一次性闭包用过期状态重绘
    const isFlipped = mySideRef.current === 'black';
    if (isFlipped) {
      const cx = BASE_W / 2;
      const cy = BOARD_PAD_Y + BASE_H / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI);
      ctx.translate(-cx, -cy);
    }

    // 绘制棋盘背景图（向下偏移 BOARD_PAD_Y，留出顶部呼吸空间）
    if (boardLoadedRef.current && boardImgRef.current) {
      ctx.drawImage(boardImgRef.current, 0, BOARD_PAD_Y, BASE_W, BASE_H);
    } else {
      ctx.fillStyle = '#e8c97a';
      ctx.fillRect(0, 0, BASE_W, CANVAS_H);
    }

    // 上一步起始位置标记：实心小白点 + 外圈白圈，透明度 88%
    if (lastMove) {
      const fx = BASE_OX + lastMove.from.col * BASE_CS;
      const fy = OY + lastMove.from.row * BASE_CS;
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

    // 绘制棋子（先画非选中棋子，选中棋子最后画以实现上浮立体效果）
    if (piecesLoadedRef.current && piecesImgRef.current) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] && !(selectedPiece && selectedPiece.row === r && selectedPiece.col === c)) {
            const x = BASE_OX + c * BASE_CS;
            const y = OY + r * BASE_CS;
            drawPieceSprite(ctx, board[r][c]!, x, y, BASE_PIECE_SIZE, piecesImgRef.current);
          }
        }
      }
    }

    // 上一步落子位置标记：棋子外围一个白圈，透明度 88%
    if (lastMove) {
      const tx = BASE_OX + lastMove.to.col * BASE_CS;
      const ty = OY + lastMove.to.row * BASE_CS;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, BASE_PIECE_SIZE * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 合法走法提示：低饱和度黄绿色小圆点 (#a4b359，88% 透明度)
    const HINT_COLOR = '164, 179, 89';
    validMoves.forEach(m => {
      const mx = BASE_OX + m.col * BASE_CS;
      const my = OY + m.row * BASE_CS;

      if (board[m.row][m.col]) {
        // 可吃子位置：外圈 + 内部小点
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
        // 可走位置：小圆点
        ctx.save();
        ctx.fillStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(5, BASE_CS * 0.13), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // 选中棋子：上浮立体绘制（去掉绿光环，改为放大 + 上移 + 强阴影）
    if (selectedPiece && piecesLoadedRef.current && piecesImgRef.current) {
      const sx = BASE_OX + selectedPiece.col * BASE_CS;
      const sy = OY + selectedPiece.row * BASE_CS;
      const liftedSize = Math.round(BASE_PIECE_SIZE * 1.12);
      const liftOffset = -BASE_CS * 0.12;

      drawPieceSprite(
        ctx,
        board[selectedPiece.row][selectedPiece.col]!,
        sx,
        sy + liftOffset,
        liftedSize,
        piecesImgRef.current,
        {
          shadowColor: 'rgba(0, 0, 0, 0.45)',
          shadowBlur: 14,
          shadowOffsetX: 2,
          shadowOffsetY: 6
        }
      );
    }

    // 坐标标注（在屏幕坐标系下绘制，翻转时保持文字正向，编号无需变动）
    if (showCoordinates) {
      // 撤销翻转变换，坐标文字始终正向可读
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

      ctx.fillStyle = '#5a3010';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(240, 216, 138, 0.8)';
      ctx.shadowBlur = 4;

      // 坐标标注在屏幕坐标系下绘制：翻转时文字保持正向。
      // 列标固定 9→1（屏幕左→右）；行标需随视角翻转：
      // 执红屏幕顶→底为 1→10；执黑旋转 180° 后屏幕顶对应红方底线 10、屏幕底对应黑方底线 1。
      // 使用纯函数保证与规则引擎/点击映射共用同一套翻转语义，可单测。
      const isFlipped = mySideRef.current === 'black';
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

  // 每次渲染后把最新绘制函数同步到 ref，供 scheduleDraw 的异步回调读取
  drawRef.current = drawBoard;

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scaleRef.current;
    const my = (e.clientY - rect.top) / scaleRef.current;

    // 棋子绘制在网格交点上，点击应取最近的交点
    // Math.round 取最近整数即最近交点，不能改为 floor（会把交点右半区误判到左格）
    let col = Math.round((mx - BASE_OX) / BASE_CS);
    let row = Math.round((my - OY) / BASE_CS);

    // 执黑方时屏幕坐标与棋盘逻辑坐标相反，需映射回逻辑坐标（与绘制共用同一翻转语义）
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
