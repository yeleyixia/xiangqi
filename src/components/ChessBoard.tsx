import React, { useRef, useEffect } from 'react';
import { Piece, Position, Side } from '../types';
import { PIECE_NAMES } from '../lib/chess';

interface ChessBoardProps {
  board: (Piece | null)[][];
  selectedPiece: Position | null;
  validMoves: Position[];
  currentTurn: Side;
  mySide: Side | null;
  onSquareClick: (row: number, col: number) => void;
  lastMove?: { from: Position; to: Position } | null;
  showCoordinates?: boolean;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  selectedPiece,
  validMoves,
  currentTurn,
  mySide,
  onSquareClick,
  lastMove,
  showCoordinates = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const CS = 52; // 格子大小
  const OX = 30; // X偏移
  const OY = 28; // Y偏移
  const W = OX * 2 + 8 * CS;
  const H = OY * 2 + 9 * CS;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    drawBoard(ctx);
  }, [board, selectedPiece, validMoves, lastMove]);
  
  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    // 清空画布
    ctx.fillStyle = '#e8c97a';
    ctx.fillRect(0, 0, W, H);
    
    // 棋盘底色
    ctx.fillStyle = '#d4a04a';
    ctx.fillRect(OX - 2, OY - 2, 8 * CS + 4, 9 * CS + 4);
    ctx.fillStyle = '#f0d88a';
    ctx.fillRect(OX, OY, 8 * CS, 9 * CS);
    
    // 外边框
    ctx.strokeStyle = '#5a3010';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(OX, OY, 8 * CS, 9 * CS);
    
    // 竖线（楚河汉界处断开）
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(OX + i * CS, OY);
      ctx.lineTo(OX + i * CS, OY + 4 * CS);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(OX + i * CS, OY + 5 * CS);
      ctx.lineTo(OX + i * CS, OY + 9 * CS);
      ctx.stroke();
    }
    
    // 横线
    for (let i = 1; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(OX, OY + i * CS);
      ctx.lineTo(OX + 8 * CS, OY + i * CS);
      ctx.stroke();
    }
    
    // 九宫格斜线
    drawPalace(ctx, 3, 0, 5, 2);
    drawPalace(ctx, 3, 7, 5, 9);
    
    // 楚河汉界
    ctx.fillStyle = '#5a3010';
    ctx.font = 'bold 22px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚  河', OX + 2 * CS, OY + 4.5 * CS);
    ctx.fillText('汉  界', OX + 6 * CS, OY + 4.5 * CS);
    
    // 炮位和兵位标记
    drawCrosses(ctx);
    
    // 上一步走法高亮
    if (lastMove) {
      ctx.fillStyle = 'rgba(212, 162, 78, 0.3)';
      ctx.fillRect(
        OX + lastMove.from.col * CS - CS / 2,
        OY + lastMove.from.row * CS - CS / 2,
        CS,
        CS
      );
      ctx.fillRect(
        OX + lastMove.to.col * CS - CS / 2,
        OY + lastMove.to.row * CS - CS / 2,
        CS,
        CS
      );
    }
    
    // 选中棋子高亮
    if (selectedPiece) {
      const sx = OX + selectedPiece.col * CS;
      const sy = OY + selectedPiece.row * CS;
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx - CS / 2 + 2, sy - CS / 2 + 2, CS - 4, CS - 4);
    }
    
    // 合法走法提示
    validMoves.forEach(m => {
      const mx = OX + m.col * CS;
      const my = OY + m.row * CS;
      
      if (board[m.row][m.col]) {
        // 可吃子位置
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, 20, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 可走位置
        ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // 绘制棋子
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]) {
          drawPiece(ctx, r, c, board[r][c]!);
        }
      }
    }
    
    // 坐标标注
    if (showCoordinates) {
      ctx.fillStyle = '#5a3010';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(9 - i), OX + i * CS, OY - 12);
        ctx.fillText(String(9 - i), OX + i * CS, OY + 9 * CS + 12);
      }
      
      for (let i = 0; i < 10; i++) {
        ctx.fillText(String(i + 1), OX - 12, OY + i * CS);
        ctx.fillText(String(i + 1), OX + 8 * CS + 12, OY + i * CS);
      }
    }
  };
  
  const drawPalace = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(OX + x1 * CS, OY + y1 * CS);
    ctx.lineTo(OX + x2 * CS, OY + y2 * CS);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(OX + x2 * CS, OY + y1 * CS);
    ctx.lineTo(OX + x1 * CS, OY + y2 * CS);
    ctx.stroke();
  };
  
  const drawCrosses = (ctx: CanvasRenderingContext2D) => {
    const pts: [number, number][] = [];
    
    for (let i = 0; i < 9; i += 2) {
      pts.push([i, 3], [i, 6]);
    }
    pts.push([1, 2], [7, 2], [1, 7], [7, 7]);
    
    pts.forEach(([col, row]) => drawCrossMark(ctx, col, row));
  };
  
  const drawCrossMark = (ctx: CanvasRenderingContext2D, col: number, row: number) => {
    const x = OX + col * CS;
    const y = OY + row * CS;
    const d = 5;
    const len = 10;
    
    ctx.strokeStyle = '#5a3010';
    ctx.lineWidth = 1;
    
    const dirs: [number, number][] = [];
    if (col > 0) dirs.push([-1, -1], [-1, 1]);
    if (col < 8) dirs.push([1, -1], [1, 1]);
    
    dirs.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * d, y + dy * d);
      ctx.lineTo(x + dx * (d + len), y + dy * d);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x + dx * d, y + dy * d);
      ctx.lineTo(x + dx * d, y + dy * (d + len));
      ctx.stroke();
    });
  };
  
  const drawPiece = (ctx: CanvasRenderingContext2D, row: number, col: number, piece: Piece) => {
    const x = OX + col * CS;
    const y = OY + row * CS;
    const radius = 22;
    
    // 阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5e6c8';
    ctx.fill();
    ctx.restore();
    
    // 外圈
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = piece.side === 'red' ? '#a02020' : '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 内圈
    ctx.beginPath();
    ctx.arc(x, y, radius - 4, 0, Math.PI * 2);
    ctx.strokeStyle = piece.side === 'red' ? '#a02020' : '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 棋子名称
    const name = PIECE_NAMES[piece.type][piece.side];
    ctx.fillStyle = piece.side === 'red' ? '#a02020' : '#1a1a1a';
    ctx.font = 'bold 22px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y + 1);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    
    const col = Math.round((mx - OX) / CS);
    const row = Math.round((my - OY) / CS);
    
    if (col >= 0 && col <= 8 && row >= 0 && row <= 9) {
      onSquareClick(row, col);
    }
  };
  
  return (
    <div className="board-wrapper">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        style={{ 
          display: 'block',
          cursor: 'pointer',
          maxWidth: '100%',
          height: 'auto'
        }}
      />
    </div>
  );
};
