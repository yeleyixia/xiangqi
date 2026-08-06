import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, Room, Side, Position, GameSettings, ChatMessage, TimeControl } from '../types';
import { initBoard, getValidMoves, makeMove as doMove, isInCheck, isCheckmated, parseTimeControl, cloneBoard } from '../lib/chess';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// 认证状态
interface AuthStore {
  user: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setGuest: (isGuest: boolean) => void;
  logout: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<UserProfile | null>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isGuest: false,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  setGuest: (isGuest) => set({ isGuest, isLoading: false }),
  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isGuest: false });
  },
  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    
    set({ user: data });
    return data;
  }
}));

// 大厅状态
interface LobbyStore {
  rooms: Room[];
  onlineCount: number;
  isLoading: boolean;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  updateRoom: (room: Room) => void;
  removeRoom: (roomId: string) => void;
  setOnlineCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  fetchRooms: () => Promise<void>;
  createRoom: (name: string, timeControl: TimeControl) => Promise<Room | null>;
  joinRoom: (roomId: string, side: Side) => Promise<boolean>;
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  rooms: [],
  onlineCount: 0,
  isLoading: false,
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set(state => ({ rooms: [room, ...state.rooms] })),
  updateRoom: (room) => set(state => ({
    rooms: state.rooms.map(r => r.id === room.id ? room : r)
  })),
  removeRoom: (roomId) => set(state => ({
    rooms: state.rooms.filter(r => r.id !== roomId)
  })),
  setOnlineCount: (count) => set({ onlineCount: count }),
  setLoading: (loading) => set({ isLoading: loading }),
  fetchRooms: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .in('status', ['waiting', 'playing'])
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      set({ rooms: data });
    }
    set({ isLoading: false });
  },
  createRoom: async (name: string, timeControl: TimeControl) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;
    
    const { minutes } = parseTimeControl(timeControl);
    const totalTime = minutes * 60;
    
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        name,
        time_control: timeControl,
        red_player: user.id,
        status: 'waiting',
        board: initBoard(),
        move_history: [],
        red_time: totalTime,
        black_time: totalTime,
        current_turn: 'red'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating room:', error);
      return null;
    }
    
    return data;
  },
  joinRoom: async (roomId: string, side: Side) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    // 通过 RPC 服务端校验：状态 waiting、座位空余、双方到齐自动开战并重置计时
    const { data, error } = await supabase
      .rpc('join_room', { p_room_id: roomId, p_side: side });
    
    if (error) {
      console.error('Error joining room:', error);
      return false;
    }
    
    return data?.ok === true;
  }
}));

// 游戏状态
interface GameStore {
  room: Room | null;
  mySide: Side | null;
  selectedPiece: Position | null;
  validMoves: Position[];
  settings: GameSettings;
  chatMessages: ChatMessage[];
  isConnecting: boolean;
  error: string | null;
  
  setRoom: (room: Room | null) => void;
  setMySide: (side: Side | null) => void;
  selectPiece: (pos: Position | null) => void;
  setValidMoves: (moves: Position[]) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  
  // 游戏操作
  startLocalGame: (timeControl?: TimeControl) => void;
  undoLocalMove: () => void;
  makeMove: (from: Position, to: Position) => Promise<boolean>;
  joinRoom: (roomId: string, side: Side) => Promise<boolean>;
  resign: () => Promise<void>;
  offerDraw: () => Promise<void>;
  requestUndo: () => Promise<void>;
  timeout: (loser: Side) => Promise<void>;
  sendChat: (content: string) => Promise<void>;
  
  // 订阅房间更新
  subscribeToRoom: (roomId: string) => () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      room: null,
      mySide: null,
      selectedPiece: null,
      validMoves: [],
      settings: {
        soundEnabled: false,
        showHints: true,
        showCoordinates: false,
        autoDrawOffer: false,
        showMoveLog: false
      },
      chatMessages: [],
      isConnecting: false,
      error: null,
      
      setRoom: (room) => set({ room }),
      setMySide: (side) => set({ mySide: side }),
      selectPiece: (pos) => set({ selectedPiece: pos }),
      setValidMoves: (moves) => set({ validMoves: moves }),
      updateSettings: (settings) => set(state => ({
        settings: { ...state.settings, ...settings }
      })),
      addChatMessage: (msg) => set(state => ({
        chatMessages: [...state.chatMessages, msg]
      })),
      setChatMessages: (msgs) => set({ chatMessages: msgs }),
      setConnecting: (connecting) => set({ isConnecting: connecting }),
      setError: (error) => set({ error }),
      
      startLocalGame: (timeControl: TimeControl = '10+0') => {
        const { minutes } = parseTimeControl(timeControl);
        const totalTime = minutes * 60;
        set({
          room: {
            id: 'local',
            name: '本地对弈',
            time_control: timeControl,
            red_player: null,
            black_player: null,
            status: 'playing',
            board: initBoard(),
            move_history: [],
            current_turn: 'red',
            red_time: totalTime,
            black_time: totalTime,
            last_move_at: new Date().toISOString(),
            winner: null,
            created_at: new Date().toISOString()
          },
          mySide: null,
          selectedPiece: null,
          validMoves: [],
          chatMessages: []
        });
      },
      
      // 本地对弈悔棋：撤销最后一步（仅本地模式可用）
      undoLocalMove: () => {
        const { room } = get();
        if (!room || room.id !== 'local') return;
        const history = room.move_history || [];
        if (history.length === 0) return;
        
        const newBoard = cloneBoard(room.board);
        const newHistory = [...history];
        const lastMove = newHistory.pop()!;
        
        newBoard[lastMove.from.row][lastMove.from.col] = lastMove.piece;
        newBoard[lastMove.to.row][lastMove.to.col] = lastMove.captured;
        
        set({
          room: {
            ...room,
            board: newBoard,
            move_history: newHistory,
            current_turn: (room.current_turn === 'red' ? 'black' : 'red') as Side
          }
        });
      },
      
      makeMove: async (from: Position, to: Position) => {
        const { room, mySide } = get();
        if (!room) return false;
        
        // 对局未开始或已结束不允许走子
        if (room.status !== 'playing') return false;
        
        const isLocal = room.id === 'local';
        
        // 联网对局：只能走自己回合、自己的棋子
        if (!isLocal) {
          if (!mySide) return false;
          if (room.current_turn !== mySide) return false;
          const piece = room.board[from.row]?.[from.col];
          if (!piece || piece.side !== mySide) return false;
        } else {
          // 本地对弈：只能走当前回合方的棋子
          const piece = room.board[from.row]?.[from.col];
          if (!piece || piece.side !== room.current_turn) return false;
        }
        
        // 验证走法（前端规则引擎预校验）
        const validMoves = getValidMoves(room.board, from.row, from.col);
        if (!validMoves.some(m => m.row === to.row && m.col === to.col)) {
          return false;
        }
        
        // 本地对弈：直接本地结算
        if (isLocal) {
          const { board, moveHistory } = doMove(room.board, from, to, room.move_history);
          const nextTurn: Side = room.current_turn === 'red' ? 'black' : 'red';
          const inCheck = isInCheck(board, nextTurn);
          const isMate = inCheck && isCheckmated(board, nextTurn);
          
          const patch: Record<string, unknown> = {
            board,
            move_history: moveHistory,
            current_turn: nextTurn,
            last_move_at: new Date().toISOString()
          };
          
          if (isMate) {
            patch.status = 'finished';
            patch.winner = room.current_turn;
            patch.result_reason = '将死';
          }
          
          set({ room: { ...room, ...patch } as Room });
          return true;
        }
        
        // 联网对局：调用服务端 RPC（服务端完整规则校验 + 落库 + 胜负/超时结算）
        const { data, error } = await supabase.rpc('make_move', {
          p_room_id: room.id,
          p_from_row: from.row,
          p_from_col: from.col,
          p_to_row: to.row,
          p_to_col: to.col
        });
        
        if (error) {
          console.error('make_move RPC error:', error);
          return false;
        }
        
        if (data?.ok !== true) {
          console.error('make_move rejected:', data?.error);
          return false;
        }
        
        return true;
      },
      
      joinRoom: async (roomId: string, side: Side) => {
        return useLobbyStore.getState().joinRoom(roomId, side);
      },
      
      resign: async () => {
        const { room, mySide } = get();
        if (!room || room.status === 'finished') return;
        
        // 本地对弈：直接结束
        if (room.id === 'local') {
          const winner = room.current_turn === 'red' ? 'black' : 'red';
          set({ room: { ...room, status: 'finished', winner, result_reason: '认输' } as Room });
          return;
        }
        
        if (!mySide) return;
        
        // 联网对局：调用服务端 RPC（服务端校验参与者 + 写对局记录/统计）
        const { data, error } = await supabase.rpc('resign_game', {
          p_room_id: room.id
        });
        
        if (error || data?.ok !== true) {
          console.error('resign_game RPC error:', error, data);
          return;
        }
      },
      
      timeout: async (loser: Side) => {
        const { room } = get();
        if (!room || room.status !== 'playing') return;
        
        const winner: Side = loser === 'red' ? 'black' : 'red';
        
        if (room.id === 'local') {
          set({ room: { ...room, status: 'finished', winner, result_reason: '超时' } as Room });
          return;
        }
        
        // 联网对局：调用服务端 RPC，由服务端依据 last_move_at 计算是否超时
        const { data, error } = await supabase.rpc('timeout_game', {
          p_room_id: room.id
        });
        
        if (error || data?.ok !== true) {
          console.error('timeout_game RPC error:', error, data);
          return;
        }
      },
      
      offerDraw: async () => {
        const { room, mySide } = get();
        if (!room || !mySide || room.status !== 'playing') return;
        
        // 通过聊天消息广播求和请求（由 sendChat 落库，实时回推给对手）
        await get().sendChat(`请求和棋`);
      },
      
      requestUndo: async () => {
        const { room, mySide } = get();
        if (!room || !mySide || room.status !== 'playing') return;
        
        // 通过聊天消息广播悔棋请求
        await get().sendChat(`请求悔棋`);
      },
      
      sendChat: async (content: string) => {
        const { room } = get();
        const user = useAuthStore.getState().user;
        const userId = user?.id || 'guest';
        const username = user?.username || '游客';
        
        const msg: ChatMessage = {
          id: Date.now().toString(),
          room_id: room?.id || 'local',
          user_id: userId,
          username,
          content,
          created_at: new Date().toISOString()
        };
        
        // 本地先行追加，保证发送者即时看到
        get().addChatMessage(msg);
        
        // 联网对局：写入 chat_messages，经实时通道回推给对手
        if (room && room.id !== 'local' && isSupabaseConfigured()) {
          await supabase
            .from('chat_messages')
            .insert({
              room_id: room.id,
              user_id: userId === 'guest' ? null : userId,
              username,
              content,
              is_system: false
            });
        }
      },
      
      subscribeToRoom: (roomId: string) => {
        const channel = supabase
          .channel(`room:${roomId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'rooms',
              filter: `id=eq.${roomId}`
            },
            (payload) => {
              set({ room: payload.new as Room });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_messages',
              filter: `room_id=eq.${roomId}`
            },
            (payload) => {
              get().addChatMessage(payload.new as ChatMessage);
            }
          )
          .subscribe();
        
        return () => {
          supabase.removeChannel(channel);
        };
      }
    }),
    {
      name: 'xiangqi-game-settings',
      partialize: (state) => ({ settings: state.settings })
    }
  )
);

// Toast 通知
interface ToastStore {
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now().toString();
    set(state => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    setTimeout(() => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }));
    }, 3000);
  },
  removeToast: (id) => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  }))
}));

