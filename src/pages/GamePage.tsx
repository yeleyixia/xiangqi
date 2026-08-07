import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChessBoard } from '../components/ChessBoard';
import { useAuthStore, useGameStore, useLobbyStore, useToastStore } from '../store';
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
  
  const [chatInput, setChatInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [fxEffect, setFxEffect] = useState<{ type: 'capture' | 'check' | 'checkmate'; show: boolean } | null>(null);
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redTime, setRedTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [localBoard, setLocalBoard] = useState<(Piece | null)[][]>(initBoard());
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [currentTurn, setCurrentTurn] = useState<Side>('red');
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [winner, setWinner] = useState<Side | null>(null);
  const [playerNames, setPlayerNames] = useState<{ red: string; black: string }>({ red: '', black: '' });
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const justMovedRef = useRef(false);        // 跳过我方走子回显
  const initialLoadDoneRef = useRef(false);   // 首屏加载完成后才监听服务端同步

  // 清理特效定时器
  useEffect(() => {
    return () => {
      if (fxTimerRef.current) {
        clearTimeout(fxTimerRef.current);
      }
    };
  }, []);

  // 触发棋盘中央特效图（吃子/将军/绝杀）
  // 吃子：3 秒；将军/绝杀：3.8 秒；同一手只显示一种特效（将军/绝杀优先）
  const FX_DURATION: Record<'capture' | 'check' | 'checkmate', number> = {
    capture: 3000,
    check: 3800,
    checkmate: 3800
  };
  const triggerFx = (type: 'capture' | 'check' | 'checkmate') => {
    if (fxTimerRef.current) {
      clearTimeout(fxTimerRef.current);
    }
    setFxEffect({ type, show: true });
    fxTimerRef.current = setTimeout(() => {
      setFxEffect(null);
      fxTimerRef.current = null;
    }, FX_DURATION[type]);
  };
  
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
      setInitialLoadDoneRef.current = true;
      return;
    }
    
    // 自动加入逻辑：房间等待中 + 有空位 + 我不是房主 → 自动加入
    if (data.status === 'waiting' && user && isSupabaseConfigured()) {
      const isRedPlayer = data.red_player === user.id;
      const isBlackPlayer = data.black_player === user.id;
      
      if (!isRedPlayer && !isBlackPlayer) {
        const joinResult = await useLobbyStore.getState().autoJoinRoom(roomId);
        if (joinResult.success && joinResult.side) {
          setMySide(joinResult.side);
          // 刷新房间数据
          const { data: updatedData } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();
          if (updatedData) {
            Object.assign(data, updatedData);
          }
        }
      }
    }
    
    setRoom(data);
    setLocalBoard(data.board);
    setMoveHistory(data.move_history || []);
    setCurrentTurn(data.current_turn);
    setGameStatus(data.status);
    setWinner(data.winner || null);
    
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
    initialLoadDoneRef.current = true;
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
  
  // 获取玩家用户名
  useEffect(() => {
    if (!roomId || !isSupabaseConfigured()) return;
    
    const fetchNames = async () => {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('red_player, black_player')
        .eq('id', roomId)
        .single();
      
      if (!roomData) return;
      
      const ids = [roomData.red_player, roomData.black_player].filter(Boolean) as string[];
      if (ids.length === 0) return;
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', ids);
      
      if (profiles) {
        const names = { red: '', black: '' };
        profiles.forEach(p => {
          if (p.id === roomData.red_player) names.red = p.username;
          if (p.id === roomData.black_player) names.black = p.username;
        });
        setPlayerNames(names);
      }
    };
    
    fetchNames();
  }, [roomId, gameStatus]);
  
  // 监听服务端房间变更 → 同步对手走子
  useEffect(() => {
    if (!roomId || !initialLoadDoneRef.current) return;
    if (!room) return; // room from store, updated by subscribeToRoom
    
    // 我方刚走的子，回显跳过
    if (justMovedRef.current) {
      justMovedRef.current = false;
      return;
    }
    
    // 同步棋盘状态
    setLocalBoard(room.board);
    setMoveHistory(room.move_history || []);
    setCurrentTurn(room.current_turn);
    setGameStatus(room.status);
    setWinner(room.winner || null);
    if (typeof room.red_time === 'number') setRedTime(room.red_time);
    if (typeof room.black_time === 'number') setBlackTime(room.black_time);
    
    // 对手走子后检查特效
    const lastMv = room.move_history?.[room.move_history?.length - 1];
    const oppTurn = room.current_turn;
    if (lastMv) {
      const board = room.board;
      const inCheck = isInCheck(board, oppTurn);
      const isMate = inCheck && isCheckmated(board, oppTurn);
      if (isMate) {
        triggerFx('checkmate');
      } else if (inCheck) {
        triggerFx('check');
      } else if (lastMv.captured) {
        triggerFx('capture');
      }
    }
    
    // 房间结束或删除
    if (room.status === 'finished') {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    if (!room && gameStatus !== 'waiting') {
      addToast('房间已关闭', 'error');
      navigate('/lobby');
    }
  }, [room]);
  
  // 房间被删除检测
  useEffect(() => {
    if (loading || !roomId || !isSupabaseConfigured()) return;
    if (!room && initialLoadDoneRef.current) {
      addToast('房间不存在或已被删除', 'error');
      setTimeout(() => navigate('/lobby'), 1500);
    }
  }, [room, loading]);
  
  // 点击棋盘格子
  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameStatus === 'finished') return;
    
    // 在线模式：轮到自己才能操作
    const isOnline = !!(roomId && isSupabaseConfigured() && mySide);
    if (isOnline && mySide !== currentTurn) return;
    
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

        const inCheck = isInCheck(newBoard, nextTurn);
        const hasCapture = captured !== null;
        const isMate = inCheck && isCheckmated(newBoard, nextTurn);

        // 吃子/将军/绝杀特效：将军/绝杀优先，同一手只显示一种
        if (isMate) {
          triggerFx('checkmate');
          setGameStatus('finished');
          setWinner(currentTurn);
          addToast(`${currentTurn === 'red' ? '红方' : '黑方'}获胜！将杀！`, 'success');
        } else if (inCheck) {
          triggerFx('check');
          addToast('将军！', 'info');
        } else if (hasCapture) {
          triggerFx('capture');
        }
        
        selectPiece(null);
        setValidMoves([]);
        
        // 在线模式：同步走子到服务器
        if (isOnline) {
          justMovedRef.current = true;
          useGameStore.getState().makeMove(from, to).then(success => {
            if (!success) {
              console.warn('Move sync to server failed');
            }
          });
        }
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
      // 选择棋子：只能选自己方的棋子
      if (piece && piece.side === currentTurn) {
        selectPiece({ row, col });
        setValidMoves(getValidMoves(localBoard, row, col));
      }
    }
  }, [localBoard, selectedPiece, validMoves, currentTurn, gameStatus, moveHistory, mySide, roomId]);
  
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
    
    // 在线模式：同步到服务器
    if (roomId && isSupabaseConfigured()) {
      useGameStore.getState().resign();
    }
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
      
      <main className={`game-main${settings.showMoveLog ? ' has-move-log' : ''}`}>
        <div className="game-layout">
          <div className="game-board-area">
            {/* 黑方信息 */}
            <div className="player-bar top-bar">
              <div className="player-info">
                <span className="player-avatar black-avatar">將</span>
                <div className="player-detail">
                  <span className="player-name">{mySide === 'black' ? (user?.username || '黑方') : (playerNames.black || '黑方（等待中）')}</span>
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
            <div className="board-container">
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
              {fxEffect?.show && (
                <img
                  className="fx-effect-img"
                  src={
                    fxEffect.type === 'capture'
                      ? '/capture.webp'
                      : fxEffect.type === 'check'
                      ? '/check.webp'
                      : '/checkmate.webp'
                  }
                  alt={
                    fxEffect.type === 'capture'
                      ? '吃'
                      : fxEffect.type === 'check'
                      ? '将军'
                      : '绝杀'
                  }
                />
              )}
            </div>
            
            {/* 底部控制条：左下角按钮 + 右下角红方信息 */}
            <div className="game-bottom-bar">
              <div className="mobile-controls">
                <button 
                  className={`mobile-fab chat-fab ${mobileChatOpen ? 'active' : ''}`} 
                  onClick={() => { setMobileChatOpen(v => !v); setMobileMenuOpen(false); setMobileSettingsOpen(false); }}
                  aria-label="聊天"
                  aria-pressed={mobileChatOpen}
                >
                  💬
                </button>
                <button 
                  className={`mobile-fab menu-fab ${mobileMenuOpen || mobileSettingsOpen ? 'active' : ''}`} 
                  onClick={() => { setMobileMenuOpen(v => !v); setMobileChatOpen(false); setMobileSettingsOpen(false); }}
                  aria-label="菜单"
                  aria-pressed={mobileMenuOpen || mobileSettingsOpen}
                >
                  ▲
                </button>
              </div>
              <div className="player-bar bottom-bar">
                <div className="player-info">
                  <span className="player-avatar red-avatar">帥</span>
                  <div className="player-detail">
                    <span className="player-name">{mySide === 'red' ? (user?.username || '红方') : (playerNames.red || '红方（等待中）')}</span>
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
          </div>
          
        </div>

        {/* 移动端聊天面板 */}
        {mobileChatOpen && (
          <div className="mobile-panel mobile-chat-panel">
            <div className="mobile-panel-header">
              <span>聊天</span>
            </div>
            <div className="mobile-chat-messages">
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
            <div className="mobile-chat-input">
              <input
                type="text"
                className="chat-input"
                placeholder="输入消息..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                maxLength={100}
              />
              <button className="chat-send-btn" onClick={handleSendChat} aria-label="发送">➤</button>
            </div>
          </div>
        )}
        
        {/* 移动端操作菜单 */}
        {mobileMenuOpen && (
          <div className="mobile-panel mobile-menu-panel">
            <button className="mobile-menu-btn" onClick={() => { handleResign(); setMobileMenuOpen(false); }} disabled={gameStatus === 'finished'}>认输</button>
            <button className="mobile-menu-btn" onClick={() => { addToast('求和请求已发送', 'info'); setMobileMenuOpen(false); }} disabled={gameStatus === 'finished'}>求和</button>
            <button className="mobile-menu-btn" onClick={() => { handleUndo(); setMobileMenuOpen(false); }} disabled={moveHistory.length < 2 || gameStatus === 'finished'}>悔棋</button>
            <button className="mobile-menu-btn" onClick={() => { setMobileMenuOpen(false); setMobileSettingsOpen(true); }}>设置</button>
            {gameStatus === 'finished' && (
              <>
                <div className="mobile-gameover-divider" />
                <div className="mobile-menu-result">{winner === 'red' ? '红方获胜！' : '黑方获胜！'}</div>
                <button
                  className="mobile-menu-btn mobile-menu-restart"
                  onClick={() => {
                    if (roomId && isSupabaseConfigured()) {
                      navigate('/lobby');
                    } else {
                      setLocalBoard(initBoard());
                      setMoveHistory([]);
                      setCurrentTurn('red');
                      setGameStatus('playing');
                      setWinner(null);
                      const { minutes } = parseTimeControl('10+0');
                      setRedTime(minutes * 60);
                      setBlackTime(minutes * 60);
                    }
                    setMobileMenuOpen(false);
                  }}
                >
                  {roomId && isSupabaseConfigured() ? '返回大厅' : '再来一局'}
                </button>
              </>
            )}
          </div>
        )}
        
        {/* 移动端设置面板 */}
        {mobileSettingsOpen && (
          <div className="mobile-panel mobile-settings-panel">
            <div className="mobile-panel-header">
              <span>设置</span>
            </div>
            <div className="mobile-settings-group">
              <span>音效</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.soundEnabled}
                  onChange={e => updateSettings({ soundEnabled: e.target.checked })}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="mobile-settings-group">
              <span>走子提示</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.showHints}
                  onChange={e => updateSettings({ showHints: e.target.checked })}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="mobile-settings-group">
              <span>棋盘坐标</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.showCoordinates}
                  onChange={e => updateSettings({ showCoordinates: e.target.checked })}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="mobile-settings-group">
              <span>记录</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.showMoveLog}
                  onChange={e => updateSettings({ showMoveLog: e.target.checked })}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        )}
        
        {/* 移动端底部记录条 */}
        {settings.showMoveLog && (
          <div className="mobile-move-log">
            {moveHistory.length === 0 ? (
              <span className="mobile-move-log-empty">暂无走法</span>
            ) : (
              moveHistory.map((move, i) => (
                <span key={i} className={`mobile-move-log-item ${move.piece.side === 'red' ? 'red-move' : 'black-move'}`}>
                  {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''}{posToNotation(move)}
                </span>
              ))
            )}
          </div>
        )}
        
      </main>
    </>
  );
};
