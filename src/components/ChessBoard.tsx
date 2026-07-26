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
    
    // 上一步起始位置标记：实心小白点 + 外圈白圈，透明度 88%
    if (lastMove) {
      const fx = OX + lastMove.from.col * CS;
      const fy = OY + lastMove.from.row * CS;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(3, CS * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fx, fy, CS * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 绘制棋子（先画非选中棋子，选中棋子最后画以实现上浮立体效果）
    if (piecesLoadedRef.current && piecesImgRef.current) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] && !(selectedPiece && selectedPiece.row === r && selectedPiece.col === c)) {
            const x = OX + c * CS;
            const y = OY + r * CS;
            drawPieceSprite(ctx, board[r][c]!, x, y, PIECE_SIZE, piecesImgRef.current);
          }
        }
      }
    }

    // 上一步落子位置标记：棋子外围一个白圈，透明度 88%
    if (lastMove) {
      const tx = OX + lastMove.to.col * CS;
      const ty = OY + lastMove.to.row * CS;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, PIECE_SIZE * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 合法走法提示：低饱和度黄绿色小圆点 (#a4b359，88% 透明度)
    const HINT_COLOR = '164, 179, 89';
    validMoves.forEach(m => {
      const mx = OX + m.col * CS;
      const my = OY + m.row * CS;

      if (board[m.row][m.col]) {
        // 可吃子位置：外圈 + 内部小点
        ctx.save();
        ctx.strokeStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, PIECE_SIZE * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.beginPath();
        ctx.arc(mx, my, PIECE_SIZE * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // 可走位置：小圆点
        ctx.save();
        ctx.fillStyle = `rgba(${HINT_COLOR}, 0.88)`;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(5, CS * 0.13), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // 选中棋子：上浮立体绘制（去掉绿光环，改为放大 + 上移 + 强阴影）
    if (selectedPiece && piecesLoadedRef.current && piecesImgRef.current) {
      const sx = OX + selectedPiece.col * CS;
      const sy = OY + selectedPiece.row * CS;
      const liftedSize = Math.round(PIECE_SIZE * 1.12);
      const liftOffset = -CS * 0.12;

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
