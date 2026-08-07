import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useLobbyStore } from '../store';
import { initBoard } from '../lib/chess';
import { loadPiecesImage, drawPieceSprite, getPieceRects } from '../lib/pieces';

export const HomePage: React.FC = () => {
  const { rooms, fetchRooms, onlineCount } = useLobbyStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    fetchRooms();
    
    // 绘制迷你棋盘
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width, h = canvas.height;
    // 根据 board.png 的实际网格位置计算缩放后的画布坐标
    // 源图网格：横向 9 条线位于 x=67..870，纵向 10 条线位于 y=65..963.5
    const sx = w / 941;
    const sy = h / 1044;
    const ox = 67 * sx;
    const oy = 65 * sy;
    const csx = ((870 - 67) / 8) * sx;
    const csy = ((963.5 - 65) / 9) * sy;
    const pieceSize = Math.round(((csx + csy) / 2) * 0.88);
    let piecesImg: HTMLImageElement | null = null;

    const drawMiniBoard = () => {
      ctx.clearRect(0, 0, w, h);

      // 背景图
      if (boardImg.complete && boardImg.naturalWidth > 0) {
        ctx.drawImage(boardImg, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#f5deb3';
        ctx.fillRect(0, 0, w, h);
      }

      // 棋子
      if (piecesImg) {
        const board = initBoard();
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 9; c++) {
            const piece = board[r][c];
            if (piece) {
              const px = ox + c * csx;
              const py = oy + r * csy;
              drawPieceSprite(ctx, piece, px, py, pieceSize, piecesImg, getPieceRects(null));
            }
          }
        }
      }
    };
    
    const boardImg = new Image();
    boardImg.src = '/board.webp';
    boardImg.onload = drawMiniBoard;
    boardImg.onerror = drawMiniBoard;
    
    loadPiecesImage()
      .then((img) => {
        piecesImg = img;
        drawMiniBoard();
      })
      .catch(() => {
        drawMiniBoard();
      });
  }, []);
  
  return (
    <>
      <div className="bg-pattern"></div>
      
      <main className="hero">
        <div className="hero-content">
          <div className="hero-badge">经典国粹 · 智慧对弈</div>
          <h1 className="hero-title">
            <span className="title-line">纵横九宫</span>
            <span className="title-line accent">楚河汉界</span>
          </h1>
          <p className="hero-desc">
            在线中国象棋对弈平台，与天下棋友切磋棋艺。
          </p>
          <div className="hero-actions">
            <Link to="/lobby" className="btn btn-primary btn-lg">
              <span className="btn-icon">⚔</span>
              进入大厅
            </Link>
          </div>
        </div>
        
        <div className="hero-board">
          <div className="mini-board">
            <canvas ref={canvasRef} width={320} height={356}></canvas>
          </div>
          <div className="board-glow"></div>
        </div>
      </main>
      
      <section className="rooms-preview">
        <div className="container">
          <h2 className="section-title">热门房间</h2>
          <div className="room-table">
            <div className="room-header">
              <span className="room-col-id">房间名称</span>
              <span className="room-col-time">时间</span>
              <span className="room-col-red">红方</span>
              <span className="room-col-black">黑方</span>
              <span className="room-col-action">操作</span>
            </div>
            {rooms.slice(0, 5).map(room => (
              <div key={room.id} className="room-row">
                <span className="room-col-id">
                  <span className="room-name">{room.name || '未命名房间'}</span>
                  <small className="room-id-small">#{room.id.slice(-3)}</small>
                </span>
                <span className="room-col-time">{room.time_control}</span>
                <span className="room-col-red">
                  {room.red_player ? '玩家' : '—'}
                </span>
                <span className="room-col-black">
                  {room.black_player ? '玩家' : '—'}
                </span>
                <span className="room-col-action">
                  <Link to={`/game/${room.id}`} className="btn btn-primary btn-xs">
                    {room.status === 'waiting' ? '加入' : '观战'}
                  </Link>
                </span>
              </div>
            ))}
            {rooms.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🏠</div>
                <div className="empty-title">暂无房间</div>
                <div className="empty-desc">快去创建一个房间吧！</div>
              </div>
            )}
          </div>
          <div className="rooms-more">
            <Link to="/lobby" className="btn btn-outline">查看全部房间 →</Link>
          </div>
        </div>
      </section>
      
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand">中国象棋在线对弈平台</span>
            <span className="footer-copy">以棋会友 乐在棋中</span>
          </div>
        </div>
      </footer>
    </>
  );
};
