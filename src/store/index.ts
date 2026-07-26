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
      return null;
    }
    
    return data;
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
        
        // 验证走法
        const validMoves = getValidMoves(room.board, from.row, from.col);
        if (!validMoves.some(m => m.row === to.row && m.col === to.col)) {
          return false;
        }
        
        // 发送到服务器
        const { error } = await supabase
          .from('rooms')
          .update({
            board: doMove(room.board, from, to, room.move_history).board,
            move_history: doMove(room.board, from, to, room.move_history).moveHistory,
            current_turn: room.current_turn === 'red' ? 'black' : 'red'
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
