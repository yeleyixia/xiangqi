// 棋子类型
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P';
export type Side = 'red' | 'black';

export interface Piece {
  type: PieceType;
  side: Side;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured: Piece | null;
  timestamp: number;
}

// 用户相关
export interface UserProfile {
  id: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  avatar?: string;
}

// 房间相关
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type TimeControl = '3+0' | '5+0' | '5+3' | '10+0' | '10+5' | '15+0' | '30+0';

export interface Room {
  id: string;
  name: string;
  time_control: TimeControl;
  red_player: string | null;
  black_player: string | null;
  status: RoomStatus;
  created_at: string;
  current_turn: Side;
  board: (Piece | null)[][];
  move_history: Move[];
  red_time: number;
  black_time: number;
  last_move_at: string;
  winner: Side | null;
  result_reason?: string;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  is_system?: boolean;
}

// 游戏设置
export interface GameSettings {
  soundEnabled: boolean;
  showHints: boolean;
  showCoordinates: boolean;
  autoDrawOffer: boolean;
  showMoveLog: boolean;
}

// 认证状态
export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
}

// 游戏状态
export interface GameState {
  room: Room | null;
  mySide: Side | null;
  selectedPiece: Position | null;
  validMoves: Position[];
  isMyTurn: boolean;
  settings: GameSettings;
  chatMessages: ChatMessage[];
}
