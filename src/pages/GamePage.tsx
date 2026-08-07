import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChessBoard } from '../components/ChessBoard';
import { useAuthStore, useGameStore, useToastStore } from '../store';
import { supabase } from '../lib/supabase';
import { getValidMoves, posToNotation, parseTimeControl, isInCheck, isCheckmated } from '../lib/chess';
import type { Side } from '../types';

export const GamePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  
  const { user } = useAuthStore();
  const { 
    room, setRoom, mySide, setMySide, 
    selectedPiece, selectPiece, validMoves, setValidMoves,
    settings, updateSettings,
    chatMessages, roomDeleted,
    subscribeToRoom, makeMove: storeMakeMove, joinRoom, resign, timeout, sendChat
  } = useGameStore();
  const { addToast } = useToastStore();
  
  const [chatInput, setChatInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [fxEffect, setFxEffect] = useState<{ type: 'opening' | 'centerCannon' | 'capture' | 'check' | 'checkmate'; show: boolean } | null>(null);
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMoveCountRef = useRef(0);
  const openingShownRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redTime, setRedTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 清理特效定时器
  useEffect(() => {
    return () => {
      if (fxTimerRef.current) {
        clearTimeout(fxTimerRef.current);
      }
    };
  }, []);

  // 触发棋盘中央特效图（开局/当头炮/吃子/将军/绝杀）
  const FX_DURATION: Record<string, number> = {
    opening: 2500,
    centerCannon: 2000,
    capture: 1500,
    check: 2500,
    checkmate: 4000
  };
  const triggerFx = (type: 'opening' | 'centerCannon' | 'capture' | 'check' | 'checkmate') => {
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
      setError('房间ID缺失');
      setLoading(false);
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
  
  // 房间状态变化时同步计时显示与玩家方
  useEffect(() => {
    if (!room) return;
    
    setRedTime(room.red_time ?? 0);
    setBlackTime(room.black_time ?? 0);
    
    // 重新确认玩家方（避免加入后仍无我方阵营）
    if (user) {
      if (room.red_player === user.id) setMySide('red');
      else if (room.black_player === user.id) setMySide('black');
    }
  }, [room, user]);
  
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
    
    // 设置时间
    const { minutes } = parseTimeControl(data.time_control);
    setRedTime(data.red_time || minutes * 60);
    setBlackTime(data.black_time || minutes * 60);
    
    // 确定玩家方
    if (user) {
      if (data.red_player === user.id) setMySide('red');
      else if (data.black_player === user.id) setMySide('black');
    }
    
    // 进入房间时自动加入空闲一方（只有存在空位且当前用户尚未加入时才加入）
    if (user && data.status !== 'finished') {
      const isRed = data.red_player === user.id;
      const isBlack = data.black_player === user.id;
      if (!isRed && !isBlack) {
        if (!data.red_player) {
          const ok = await joinRoom(roomId, 'red');
          if (ok) setMySide('red');
        } else if (!data.black_player) {
          const ok = await joinRoom(roomId, 'black');
          if (ok) setMySide('black');
        }
      }
    }
    
    // 开局特效：玩家进入棋盘时各自触发（尚无走子时）
    if (data.move_history?.length === 0 && !openingShownRef.current) {
      openingShownRef.current = true;
      triggerFx('opening');
    }
    
    // 初始化已处理步数，避免进入中途对局时误触发上一步特效
    lastMoveCountRef.current = data.move_history?.length || 0;
    
    setLoading(false);
  };
  
  // 当前显示用的棋盘/回合/状态（以 store 为单一数据源）
  const board = room?.board || [];
  const moveHistory = room?.move_history || [];
  const currentTurn: Side = room?.current_turn || 'red';
  const gameStatus = room?.status || 'waiting';
  const winner = room?.winner || null;
  
  // 走子特效检测：监听走子历史变化，双方实时看到
  useEffect(() => {
    const moveCount = moveHistory.length;
    if (moveCount <= lastMoveCountRef.current) {
      lastMoveCountRef.current = moveCount;
      return;
    }

    const lastMove = moveHistory[moveCount - 1];
    if (!lastMove) {
      lastMoveCountRef.current = moveCount;
      return;
    }

    lastMoveCountRef.current = moveCount;

    // 检测将军/绝杀（优先级最高）
    const nextTurn: Side = lastMove.piece.side === 'red' ? 'black' : 'red';
    const inCheck = isInCheck(board, nextTurn);
    const isMate = inCheck && isCheckmated(board, nextTurn);

    if (isMate) {
      triggerFx('checkmate');
      addToast(`${lastMove.piece.side === 'red' ? '红方' : '黑方'}获胜！将杀！`, 'success');
      return;
    }
    if (inCheck) {
      triggerFx('check');
      addToast('将军！', 'info');
      return;
    }

    // 当头炮特效：炮移动到中路（col 4）
    if (lastMove.piece.type === 'C' && lastMove.to.col === 4) {
      triggerFx('centerCannon');
      return;
    }

    // 吃子特效
    if (lastMove.captured) {
      triggerFx('capture');
    }
  }, [moveHistory]);

  // 计时器：每秒递减，超时回写服务器
  useEffect(() => {
    if (gameStatus !== 'playing') return;
    
    timerRef.current = setInterval(() => {
      if (currentTurn === 'red') {
        setRedTime(t => {
          const next = Math.max(0, t - 1);
          if (next === 0 && roomId) {
            timeout('red');
          }
          return next;
        });
      } else {
        setBlackTime(t => {
          const next = Math.max(0, t - 1);
          if (next === 0 && roomId) {
            timeout('black');
          }
          return next;
        });
      }
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentTurn, gameStatus]);
  
  // 滚动聊天到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // 点击棋盘格子
  const handleSquareClick = useCallback(async (row: number, col: number) => {
    if (gameStatus === 'finished') return;
    
    // 尚未开始对局（等待对手加入）时不可走子
    if (gameStatus === 'waiting') {
      addToast('等待对手加入，对局开始后方可走子', 'info');
      return;
    }
    
    // 观战者不可走子
    if (!mySide) {
      addToast('你正在观战，无法走子', 'info');
      return;
    }
    
    // 只能走自己的棋子（服务端也会校验）
    if (mySide && currentTurn !== mySide) {
      addToast('还没轮到你走棋', 'info');
      return;
    }
    
    const piece = board[row]?.[col];
    
    // 未选中棋子时，只能选择己方棋子
    // 注意：若已选中棋子，点击敌方棋子是"吃子"动作，不能被这里拦截
    if (piece && mySide && piece.side !== mySide && !selectedPiece) {
      addToast('只能移动自己的棋子', 'info');
      return;
    }
    
    // 如果已选中棋子
    if (selectedPiece) {
      // 检查是否是合法走法
      const isValidMove = validMoves.some(m => m.row === row && m.col === col);
      
      if (isValidMove) {
        // 执行走子（统一走 store，联网落库 / 本地直接更新）
        const from = selectedPiece;
        const to = { row, col };
        
        selectPiece(null);
        setValidMoves([]);
        
        const ok = await storeMakeMove(from, to);
        if (!ok) {
          addToast('走子失败，请重试', 'error');
          return;
        }
        
        // 特效由 useEffect 监听 moveHistory 变化统一触发，双方都能看到
      } else if (piece) {
        // 选择新棋子
        if (piece.side === currentTurn && piece.side === mySide) {
          selectPiece({ row, col });
          setValidMoves(getValidMoves(board, row, col));
        } else {
          // 取消选择
          selectPiece(null);
          setValidMoves([]);
        }
      } else {
        // 取消选择
        selectPiece(null);
        setValidMoves([]);
      }
    } else {
      // 选择棋子
      if (piece && piece.side === currentTurn && piece.side === mySide) {
        selectPiece({ row, col });
        setValidMoves(getValidMoves(board, row, col));
      }
    }
  }, [board, selectedPiece, validMoves, currentTurn, gameStatus, mySide]);
  
  // 发送聊天消息
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    await sendChat(chatInput.trim());
    setChatInput('');
  };
  
  // 悔棋（联网对局走请求制，经聊天广播给对手）
  const handleUndo = () => {
    if (moveHistory.length < 1) return;
    addToast('悔棋请求已发送给对手', 'info');
    useGameStore.getState().requestUndo();
  };
  
  // 认输
  const handleResign = async () => {
    if (!confirm('确定要认输吗？')) return;
    if (!mySide) {
      addToast('观战者不能认输', 'info');
      return;
    }
    await resign();
  };
  
  // 求和
  const handleDraw = () => {
    addToast('求和请求已发送', 'info');
    useGameStore.getState().offerDraw();
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

  // 己方视角：执黑时棋盘 180° 翻转（黑子在下），顶/底玩家栏随视角联动，保证信息与棋子方向一致
  const viewFlipped = mySide === 'black';
  
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
  
  // 房间因超时被自动清空：提示玩家并引导返回大厅
  if (roomDeleted) {
    return (
      <>
        <div className="bg-pattern"></div>
        <div className="empty-state" style={{ minHeight: '100vh' }}>
          <div className="empty-icon">⏳</div>
          <div className="empty-title">房间已清空</div>
          <div className="empty-desc">该对弈房间已超时被自动清空，数据已释放。</div>
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
            {/* 棋盘上方玩家栏（执黑视角为红方/对手，否则为黑方/对手） */}
            <div className="player-bar top-bar">
              <div className="player-info">
                <span className={`player-avatar ${viewFlipped ? 'red-avatar' : 'black-avatar'}`}>{viewFlipped ? '帥' : '將'}</span>
                <div className="player-detail">
                  <span className="player-name">对手</span>
                  <span className="player-rating-text">
                    {viewFlipped
                      ? (isInCheck(board, 'red') && currentTurn === 'red' ? '被将军！' : '红方')
                      : (isInCheck(board, 'black') && currentTurn === 'black' ? '被将军！' : '黑方')}
                  </span>
                </div>
              </div>
              <div className={`timer ${currentTurn === (viewFlipped ? 'red' : 'black') ? 'timer-active' : ''} ${(viewFlipped ? redTime : blackTime) < 30 ? 'timer-danger' : ''}`}>
                {formatTime(viewFlipped ? redTime : blackTime)}
              </div>
            </div>
            
            {/* 棋盘 */}
            <div className="board-container">
              <ChessBoard
                board={board}
                selectedPiece={selectedPiece}
                validMoves={settings.showHints ? validMoves : []}
                mySide={mySide}
                onSquareClick={handleSquareClick}
                lastMove={lastMove}
                showCoordinates={settings.showCoordinates}
              />
              {fxEffect?.show && (
                <img
                  className="fx-effect-img"
                  src={
                    fxEffect.type === 'opening'
                      ? '/kaiju.webp'
                      : fxEffect.type === 'centerCannon'
                      ? '/dangtoupo.webp'
                      : fxEffect.type === 'capture'
                      ? '/capture.webp'
                      : fxEffect.type === 'check'
                      ? '/check.webp'
                      : '/checkmate.webp'
                  }
                  alt={
                    fxEffect.type === 'opening'
                      ? '开局'
                      : fxEffect.type === 'centerCannon'
                      ? '当头炮'
                      : fxEffect.type === 'capture'
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
                  <span className={`player-avatar ${viewFlipped ? 'black-avatar' : 'red-avatar'}`}>{viewFlipped ? '將' : '帥'}</span>
                  <div className="player-detail">
                    <span className="player-name">{viewFlipped ? (user?.username || '') : (mySide === 'red' ? (user?.username || '') : '对手')}</span>
                    <span className="player-rating-text">
                      {viewFlipped
                        ? (isInCheck(board, 'black') && currentTurn === 'black' ? '被将军！' : '黑方')
                        : (isInCheck(board, 'red') && currentTurn === 'red' ? '被将军！' : '红方')}
                    </span>
                  </div>
                </div>
                <div className={`timer ${currentTurn === (viewFlipped ? 'black' : 'red') ? 'timer-active' : ''} ${(viewFlipped ? blackTime : redTime) < 30 ? 'timer-danger' : ''}`}>
                  {formatTime(viewFlipped ? blackTime : redTime)}
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
            <button className="mobile-menu-btn" onClick={() => { handleDraw(); setMobileMenuOpen(false); }} disabled={gameStatus === 'finished'}>求和</button>
            <button className="mobile-menu-btn" onClick={() => { handleUndo(); setMobileMenuOpen(false); }} disabled={moveHistory.length < 1 || gameStatus === 'finished'}>悔棋</button>
            <button className="mobile-menu-btn" onClick={() => { setMobileMenuOpen(false); setMobileSettingsOpen(true); }}>设置</button>
            {gameStatus === 'finished' && (
              <>
                <div className="mobile-gameover-divider" />
                <div className="mobile-menu-result">{winner === 'red' ? '红方获胜！' : winner === 'black' ? '黑方获胜！' : '对局结束'}</div>
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
