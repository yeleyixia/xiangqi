import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, Room, Side, Position, GameSettings, ChatMessage, TimeControl } from '../types';
import { initBoard, getValidMoves, makeMove as doMove } from '../lib/chess';
import { supabase } from '../lib/supabase';

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
  createRoom: (name: string, timeControl: TimeControl) => Promise<{ room: Room | null; error: any }>;
  joinRoom: (roomId: string, side: Side) => Promise<boolean>;
  autoJoinRoom: (roomId: string) => Promise<{ side: Side | null; success: boolean }>;
  quickMatch: () => Promise<{ roomId: string; side: Side } | null>;
  cleanupExpiredRooms: () => Promise<void>;
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
    if (!user) return { room: null, error: { message: '请先登录' } };
    
    const minutes = parseInt(timeControl.split('+')[0]);
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
      return { room: null, error };
    }
    
    return { room: data, error: null };
  },
  joinRoom: async (roomId: string, side: Side) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    const field = side === 'red' ? 'red_player' : 'black_player';
    
    const { error } = await supabase
      .from('rooms')
      .update({ [field]: user.id })
      .eq('id', roomId);
    
    return !error;
  },
  autoJoinRoom: async (roomId: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { side: null, success: false };
    
    // 获取房间最新状态
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (error || !room) return { side: null, success: false };
    
    // 如果已经有人在等，我是第二个人 -> 加入空位
    if (room.status === 'waiting') {
      if (room.red_player && !room.black_player && room.red_player !== user.id) {
        // 加入黑方
        const { error: joinErr } = await supabase
          .from('rooms')
          .update({
            black_player: user.id,
            status: 'playing',
            last_move_at: new Date().toISOString()
          })
          .eq('id', roomId)
          .eq('status', 'waiting');
        return { side: 'black', success: !joinErr };
      }
      if (room.black_player && !room.red_player && room.black_player !== user.id) {
        // 加入红方（极少情况：创建者离开后房间还在）
        const { error: joinErr } = await supabase
          .from('rooms')
          .update({
            red_player: user.id,
            status: 'playing',
            last_move_at: new Date().toISOString()
          })
          .eq('id', roomId)
          .eq('status', 'waiting');
        return { side: 'red', success: !joinErr };
      }
    }
    
    // 已经在对弈中，我是观战者
    if (room.red_player === user.id) return { side: 'red', success: true };
    if (room.black_player === user.id) return { side: 'black', success: true };
    
    return { side: null, success: true }; // 观战
  },
  quickMatch: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return null;
    
    // 先查找状态为 waiting 的房间（按创建时间升序，优先加入最早创建的）
    const { data: waitingRooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(5);
    
    if (!error && waitingRooms && waitingRooms.length > 0) {
      // 尝试加入第一个有空位的等待房间
      for (const room of waitingRooms) {
        if (!room.black_player && room.red_player !== user.id) {
          const { error: joinErr } = await supabase
            .from('rooms')
            .update({
              black_player: user.id,
              status: 'playing',
              last_move_at: new Date().toISOString()
            })
            .eq('id', room.id)
            .eq('status', 'waiting');
          if (!joinErr) return { roomId: room.id, side: 'black' };
        }
        if (!room.red_player && room.black_player !== user.id) {
          const { error: joinErr } = await supabase
            .from('rooms')
            .update({
              red_player: user.id,
              status: 'playing',
              last_move_at: new Date().toISOString()
            })
            .eq('id', room.id)
            .eq('status', 'waiting');
          if (!joinErr) return { roomId: room.id, side: 'red' };
        }
      }
    }
    
    // 没有可加入的房间，创建新房间
    const tc: TimeControl = '10+0';
    const minutes = parseInt(tc.split('+')[0]);
    const totalTime = minutes * 60;
    
    const { data: newRoom, error: createErr } = await supabase
      .from('rooms')
      .insert({
        name: `${user.username || '棋友'}的房间`,
        time_control: tc,
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
    
    if (createErr || !newRoom) return null;
    return { roomId: newRoom.id, side: 'red' };
  },
  cleanupExpiredRooms: async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('status', 'waiting')
      .lt('created_at', fiveMinutesAgo);
    
    if (!error) {
      // 同时清理本地缓存
      const { rooms } = get();
      const filtered = rooms.filter(
        r => !(r.status === 'waiting' && new Date(r.created_at) < new Date(fiveMinutesAgo))
      );
      set({ rooms: filtered });
    }
    
    return !error;
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
  makeMove: (from: Position, to: Position) => Promise<boolean>;
  resign: () => Promise<void>;
  offerDraw: () => Promise<void>;
  requestUndo: () => Promise<void>;
  
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
      
      makeMove: async (from: Position, to: Position) => {
        const { room, mySide } = get();
        if (!room || !mySide) return false;
        
        // 校验：是否是自己的回合
        if (mySide !== room.current_turn) {
          console.warn('Not your turn');
          return false;
        }
        
        // 校验：是否移动自己的棋子
        const piece = room.board[from.row][from.col];
        if (!piece || piece.side !== mySide) {
          console.warn('Not your piece');
          return false;
        }
        
        // 验证走法合法性
        const validMoves = getValidMoves(room.board, from.row, from.col);
        if (!validMoves.some(m => m.row === to.row && m.col === to.col)) {
          console.warn('Invalid move');
          return false;
        }
        
        // 执行走子（只调用一次 doMove）
        const result = doMove(room.board, from, to, room.move_history);
        const nextTurn = room.current_turn === 'red' ? 'black' : 'red';
        
        // 同步到服务器
        const { error } = await supabase
          .from('rooms')
          .update({
            board: result.board,
            move_history: result.moveHistory,
            current_turn: nextTurn,
            last_move_at: new Date().toISOString()
          })
          .eq('id', room.id);
        
        return !error;
      },
      
      resign: async () => {
        const { room, mySide } = get();
        if (!room || !mySide) return;
        
        await supabase
          .from('rooms')
          .update({
            status: 'finished',
            winner: mySide === 'red' ? 'black' : 'red',
            result_reason: '认输'
          })
          .eq('id', room.id);
      },
      
      offerDraw: async () => {
        // TODO: 实现求和逻辑
        console.log('Offer draw');
      },
      
      requestUndo: async () => {
        // TODO: 实现悔棋逻辑
        console.log('Request undo');
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
