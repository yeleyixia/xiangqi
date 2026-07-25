import React, { useRef, useEffect } from 'react';
import { Piece, Position, Side } from '../types';
import { loadPiecesImage, drawPieceSprite } from '../lib/pieces';

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
  const boardImgRef = useRef<HTMLImageElement | null>(null);
  const piecesImgRef = useRef<HTMLImageElement | null>(null);
  const boardLoadedRef = useRef(false);
  const piecesLoadedRef = useRef(false);
  
  const CS = 52; // 格子大小
  const OX = 30; // X偏移
  const OY = 28; // Y偏移
  const W = OX * 2 + 8 * CS;
  const H = OY * 2 + 9 * CS;
  const PIECE_SIZE = Math.round(CS * 0.88); // 棋子占格子比例
  
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
        drawBoard(ctx);
      };
      img.onerror = () => {
        boardLoadedRef.current = false;
        drawBoard(ctx);
      };
      boardImgRef.current = img;
    }
    
    // 加载棋子精灵图
    if (!piecesImgRef.current) {
      loadPiecesImage()
        .then((img) => {
          piecesLoadedRef.current = true;
          piecesImgRef.current = img;
          drawBoard(ctx);
        })
        .catch(() => {
          piecesLoadedRef.current = false;
          drawBoard(ctx);
        });
    }
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx);
  }, [board, selectedPiece, validMoves, lastMove]);
  
  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    // 清空画布
    ctx.clearRect(0, 0, W, H);
    
    // 绘制棋盘背景图
    if (boardLoadedRef.current && boardImgRef.current) {
      ctx.drawImage(boardImgRef.current, 0, 0, W, H);
    } else {
      // 加载失败前的兜底背景
      ctx.fillStyle = '#e8c97a';
      ctx.fillRect(0, 0, W, H);
    }
    
    // 上一步走法高亮
    if (lastMove) {
      ctx.fillStyle = 'rgba(212, 162, 78, 0.35)';
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
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, 20, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 可走位置
        ctx.fillStyle = 'rgba(231, 76, 60, 0.5)';
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // 绘制棋子
    if (piecesLoadedRef.current && piecesImgRef.current) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c]) {
            const x = OX + c * CS;
            const y = OY + r * CS;
            drawPieceSprite(ctx, board[r][c]!, x, y, PIECE_SIZE, piecesImgRef.current);
          }
        }
      }
    }
    
    // 坐标标注
    if (showCoordinates) {
      ctx.fillStyle = '#5a3010';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(240, 216, 138, 0.8)';
      ctx.shadowBlur = 4;
      
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(9 - i), OX + i * CS, OY - 12);
        ctx.fillText(String(9 - i), OX + i * CS, OY + 9 * CS + 12);
      }
      
      for (let i = 0; i < 10; i++) {
        ctx.fillText(String(i + 1), OX - 12, OY + i * CS);
        ctx.fillText(String(i + 1), OX + 8 * CS + 12, OY + i * CS);
      }
      
      ctx.shadowBlur = 0;
    }
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
