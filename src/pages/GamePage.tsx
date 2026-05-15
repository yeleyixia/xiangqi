import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChessBoard } from '../components/ChessBoard';
import { useAuthStore, useGameStore, useToastStore } from '../store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { initBoard, getValidMoves, posToNotation, parseTimeControl, isInCheck, isCheckmated } from '../lib/chess';
import type { Position, Side, ChatMessage, Move, Piece } from '../types';

export const GamePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  
  const { user } = useAuthStore();
  const { 
    room, setRoom, mySide, setMySide, 
    selectedPiece, selectPiece, validMoves, setValidMoves,
    settings, updateSettings,
    chatMessages, addChatMessage, setChatMessages,
    subscribeToRoom
  } = useGameStore();
  const { addToast } = useToastStore();
  
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'settings'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redTime, setRedTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [localBoard, setLocalBoard] = useState<(Piece | null)[][]>(initBoard());
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [currentTurn, setCurrentTurn] = useState<Side>('red');
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [winner, setWinner] = useState<Side | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // 加载房间数据
  useEffect(() => {
    if (!roomId) {
      // 没有房间ID，创建本地对弈
      setLocalBoard(initBoard());
      setMoveHistory([]);
      setCurrentTurn('red');
      setGameStatus('playing');
      setLoading(false);
      return;
    }
    
    if (!isSupabaseConfigured()) {
      // Supabase 未配置，使用本地模式
      setLocalBoard(initBoard());
      setMoveHistory([]);
      setCurrentTurn('red');
      setGameStatus('playing');
      setLoading(false);
      addToast('本地对弈模式', 'info');
      return;
    }
    
    loadRoom();
    
    // 订阅房间更新
    const unsubscribe = subscribeToRoom(roomId);
    
    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [roomId]);
  
  // 加载房间
  const loadRoom = async () => {
    if (!roomId) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (error || !data) {
      setError('房间不存在');
      setLoading(false);
      return;
    }
    
    setRoom(data);
    setLocalBoard(data.board);
    setMoveHistory(data.move_history || []);
    setCurrentTurn(data.current_turn);
    setGameStatus(data.status);
    setWinner(data.winner);
    
    // 设置时间
    const { minutes } = parseTimeControl(data.time_control);
    setRedTime(data.red_time || minutes * 60);
    setBlackTime(data.black_time || minutes * 60);
    
    // 确定玩家方
    if (user) {
      if (data.red_player === user.id) setMySide('red');
      else if (data.black_player === user.id) setMySide('black');
    }
    
    setLoading(false);
  };
  
  // 计时器
  useEffect(() => {
    if (gameStatus !== 'playing') return;
    
    timerRef.current = setInterval(() => {
      if (currentTurn === 'red') {
        setRedTime(t => Math.max(0, t - 1));
      } else {
        setBlackTime(t => Math.max(0, t - 1));
      }
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentTurn, gameStatus]);
  
  // 检查超时
  useEffect(() => {
    if (redTime === 0) {
      setGameStatus('finished');
      setWinner('black');
      addToast('红方超时，黑方获胜！', 'info');
    } else if (blackTime === 0) {
      setGameStatus('finished');
      setWinner('red');
      addToast('黑方超时，红方获胜！', 'info');
    }
  }, [redTime, blackTime]);
  
  // 滚动聊天到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // 点击棋盘格子
  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameStatus === 'finished') return;
    
    const piece = localBoard[row][col];
    
    // 如果已选中棋子
    if (selectedPiece) {
      // 检查是否是合法走法
      const isValidMove = validMoves.some(m => m.row === row && m.col === col);
      
      if (isValidMove) {
        // 执行走子
        const from = selectedPiece;
        const to = { row, col };
        
        // 更新本地棋盘
        const newBoard = localBoard.map(r => [...r]);
        const movingPiece = newBoard[from.row][from.col];
        const captured = newBoard[to.row][to.col];
        
        newBoard[to.row][to.col] = movingPiece;
        newBoard[from.row][from.col] = null;
        
        // 添加到历史
        const move: Move = {
          from,
          to,
          piece: movingPiece!,
          captured,
          timestamp: Date.now()
        };
        
        setLocalBoard(newBoard);
        setMoveHistory([...moveHistory, move]);
        
        // 检查将军和将死
        const nextTurn = currentTurn === 'red' ? 'black' : 'red';
        setCurrentTurn(nextTurn);
        
        if (isInCheck(newBoard, nextTurn)) {
          if (isCheckmated(newBoard, nextTurn)) {
            setGameStatus('finished');
            setWinner(currentTurn);
            addToast(`${currentTurn === 'red' ? '红方' : '黑方'}获胜！将杀！`, 'success');
          } else {
            addToast('将军！', 'info');
          }
        }
        
        selectPiece(null);
        setValidMoves([]);
      } else if (piece && piece.side === currentTurn) {
        // 选择新棋子
        selectPiece({ row, col });
        setValidMoves(getValidMoves(localBoard, row, col));
      } else {
        // 取消选择
        selectPiece(null);
        setValidMoves([]);
      }
    } else {
      // 选择棋子
      if (piece && piece.side === currentTurn) {
        selectPiece({ row, col });
        setValidMoves(getValidMoves(localBoard, row, col));
      }
    }
  }, [localBoard, selectedPiece, validMoves, currentTurn, gameStatus, moveHistory]);
  
  // 发送聊天消息
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    
    const msg: ChatMessage = {
      id: Date.now().toString(),
      room_id: roomId || 'local',
      user_id: user?.id || 'guest',
      username: user?.username || '游客',
      content: chatInput.trim(),
      created_at: new Date().toISOString()
    };
    
    addChatMessage(msg);
    setChatInput('');
  };
  
  // 悔棋
  const handleUndo = () => {
    if (moveHistory.length < 2) return;
    
    const newHistory = [...moveHistory];
    newHistory.pop(); // 移除最后一步
    const lastMove = newHistory.pop(); // 移除倒数第二步
    
    // 重建棋盘
    const newBoard = initBoard();
    for (const move of newHistory) {
      newBoard[move.to.row][move.to.col] = move.piece;
      newBoard[move.from.row][move.from.col] = null;
    }
    
    setLocalBoard(newBoard);
    setMoveHistory(newHistory);
    setCurrentTurn(prev => prev === 'red' ? 'black' : 'red');
    addToast('已悔棋', 'info');
  };
  
  // 认输
  const handleResign = () => {
    if (!confirm('确定要认输吗？')) return;
    
    setGameStatus('finished');
    setWinner(currentTurn === 'red' ? 'black' : 'red');
    addToast(`${currentTurn === 'red' ? '红方' : '黑方'}认输`, 'info');
  };
  
  // 格式化时间
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  // 获取最后一步
  const lastMove = moveHistory.length > 0 
    ? { from: moveHistory[moveHistory.length - 1].from, to: moveHistory[moveHistory.length - 1].to }
    : null;
  
  if (loading) {
    return (
      <>
        <div className="bg-pattern"></div>
        <div className="loading" style={{ minHeight: '100vh' }}>
          <div className="loading-spinner"></div>
          <div className="loading-text">加载中...</div>
        </div>
      </>
    );
  }
  
  if (error) {
    return (
      <>
        <div className="bg-pattern"></div>
        <div className="empty-state" style={{ minHeight: '100vh' }}>
          <div className="empty-icon">😢</div>
          <div className="empty-title">{error}</div>
          <button className="btn btn-primary" onClick={() => navigate('/lobby')}>
            返回大厅
          </button>
        </div>
      </>
    );
  }
  
  return (
    <>
      <div className="bg-pattern"></div>
      
      <main className="game-main">
        <div className="game-layout">
          <div className="game-board-area">
            {/* 黑方信息 */}
            <div className="player-bar top-bar">
              <div className="player-info">
                <span className="player-avatar black-avatar">將</span>
                <div className="player-detail">
                  <span className="player-name">{mySide === 'black' ? (user?.username || '你') : '对手'}</span>
                  <span className="player-rating-text">
                    {isInCheck(localBoard, 'black') && currentTurn === 'black' ? '被将军！' : '黑方'}
                  </span>
                </div>
              </div>
              <div className={`timer ${currentTurn === 'black' ? 'timer-active' : ''} ${blackTime < 30 ? 'timer-danger' : ''}`}>
                {formatTime(blackTime)}
              </div>
            </div>
            
            {/* 棋盘 */}
            <ChessBoard
              board={localBoard}
              selectedPiece={selectedPiece}
              validMoves={settings.showHints ? validMoves : []}
              currentTurn={currentTurn}
              mySide={mySide}
              onSquareClick={handleSquareClick}
              lastMove={lastMove}
              showCoordinates={settings.showCoordinates}
            />
            
            {/* 红方信息 */}
            <div className="player-bar bottom-bar">
              <div className="player-info">
                <span className="player-avatar red-avatar">帥</span>
                <div className="player-detail">
                  <span className="player-name">{mySide === 'red' ? (user?.username || '你') : '对手'}</span>
                  <span className="player-rating-text">
                    {isInCheck(localBoard, 'red') && currentTurn === 'red' ? '被将军！' : '红方'}
                  </span>
                </div>
              </div>
              <div className={`timer ${currentTurn === 'red' ? 'timer-active' : ''} ${redTime < 30 ? 'timer-danger' : ''}`}>
                {formatTime(redTime)}
              </div>
            </div>
          </div>
          
          {/* 侧边栏 */}
          <div className="game-sidebar">
            {/* 游戏控制 */}
            <div className="game-controls">
              <button className="btn btn-danger btn-sm" onClick={handleResign} disabled={gameStatus === 'finished'}>
                认输
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => addToast('求和请求已发送', 'info')} disabled={gameStatus === 'finished'}>
                求和
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleUndo} disabled={moveHistory.length < 2 || gameStatus === 'finished'}>
                悔棋
              </button>
            </div>
            
            {/* 标签页 */}
            <div className="game-tabs">
              <button 
                className={`game-tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                聊天
              </button>
              <button 
                className={`game-tab ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                记录
              </button>
              <button 
                className={`game-tab ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                设置
              </button>
            </div>
            
            {/* 聊天 */}
            <div className={`tab-content ${activeTab !== 'chat' ? 'hidden' : ''}`}>
              <div className="chat-messages">
                <div className="chat-msg system">系统：对弈开始，红方先行</div>
                {chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`chat-msg ${msg.user_id === user?.id ? 'self' : 'other'}`}
                  >
                    {msg.content}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-wrap">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="输入消息..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  maxLength={100}
                />
                <button className="btn btn-primary btn-xs" onClick={handleSendChat}>
                  发送
                </button>
              </div>
            </div>
            
            {/* 走法记录 */}
            <div className={`tab-content ${activeTab !== 'history' ? 'hidden' : ''}`}>
              <div className="move-list">
                {moveHistory.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>
                    暂无走法记录
                  </div>
                ) : (
                  moveHistory.reduce<{ rows: React.ReactNode[]; current: React.ReactNode[] }>((acc, move, i) => {
                    const notation = posToNotation(move);
                    if (i % 2 === 0) {
                      if (acc.current.length > 0) acc.rows.push(
                        <div key={acc.rows.length} className="move-row">{acc.current}</div>
                      );
                      acc.current = [
                        <span key="num" className="move-num">{Math.floor(i / 2) + 1}.</span>,
                        <span key="red" className="move-red">{notation}</span>
                      ];
                    } else {
                      acc.current.push(<span key="black" className="move-black">{notation}</span>);
                    }
                    return acc;
                  }, { rows: [], current: [] }).rows
                )}
              </div>
            </div>
            
            {/* 设置 */}
            <div className={`tab-content ${activeTab !== 'settings' ? 'hidden' : ''}`}>
              <div className="settings-group">
                <label className="setting-label">音效</label>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={settings.soundEnabled}
                    onChange={e => updateSettings({ soundEnabled: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <div className="settings-group">
                <label className="setting-label">走子提示</label>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={settings.showHints}
                    onChange={e => updateSettings({ showHints: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <div className="settings-group">
                <label className="setting-label">棋盘坐标</label>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={settings.showCoordinates}
                    onChange={e => updateSettings({ showCoordinates: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
            
            {/* 游戏结束提示 */}
            {gameStatus === 'finished' && (
              <div style={{ 
                marginTop: '12px', 
                padding: '16px', 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', color: 'var(--gold)', marginBottom: '8px' }}>
                  {winner === 'red' ? '红方获胜！' : '黑方获胜！'}
                </div>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setLocalBoard(initBoard());
                    setMoveHistory([]);
                    setCurrentTurn('red');
                    setGameStatus('playing');
                    setWinner(null);
                    const { minutes } = parseTimeControl('10+0');
                    setRedTime(minutes * 60);
                    setBlackTime(minutes * 60);
                  }}
                >
                  再来一局
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};
