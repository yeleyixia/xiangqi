import { Piece, PieceType, Side, Position, Move } from '../types';

// 棋子名称映射
export const PIECE_NAMES: Record<PieceType, Record<Side, string>> = {
  K: { red: '帥', black: '將' },
  A: { red: '仕', black: '士' },
  B: { red: '相', black: '象' },
  N: { red: '馬', black: '馬' },
  R: { red: '車', black: '車' },
  C: { red: '炮', black: '砲' },
  P: { red: '兵', black: '卒' }
};

// 初始化棋盘
export function initBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: 10 }, () => Array(9).fill(null));
  
  // 后排
  const backRow: PieceType[] = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
  for (let i = 0; i < 9; i++) {
    board[0][i] = { type: backRow[i], side: 'black' };
    board[9][i] = { type: backRow[i], side: 'red' };
  }
  
  // 炮
  board[2][1] = { type: 'C', side: 'black' };
  board[2][7] = { type: 'C', side: 'black' };
  board[7][1] = { type: 'C', side: 'red' };
  board[7][7] = { type: 'C', side: 'red' };
  
  // 兵/卒
  for (let i = 0; i < 9; i += 2) {
    board[3][i] = { type: 'P', side: 'black' };
    board[6][i] = { type: 'P', side: 'red' };
  }
  
  return board;
}

// 获取合法走法（不考虑将军）
function getRawMoves(board: (Piece | null)[][], row: number, col: number): Position[] {
  const piece = board[row][col];
  if (!piece) return [];
  
  const moves: Position[] = [];
  const side = piece.side;
  
  switch (piece.type) {
    case 'K': // 将/帅
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (nr >= (side === 'red' ? 7 : 0) && nr <= (side === 'red' ? 9 : 2) && nc >= 3 && nc <= 5) {
          if (!board[nr][nc] || board[nr][nc]!.side !== side) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;
      
    case 'A': // 士/仕
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (nr >= (side === 'red' ? 7 : 0) && nr <= (side === 'red' ? 9 : 2) && nc >= 3 && nc <= 5) {
          if (!board[nr][nc] || board[nr][nc]!.side !== side) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;
      
    case 'B': // 象/相
      [[-2, -2], [-2, 2], [2, -2], [2, 2]].forEach(([dr, dc], i) => {
        const nr = row + dr, nc = col + dc;
        const br = row + [-1, -1, 1, 1][i], bc = col + [-1, 1, -1, 1][i];
        if (nr >= (side === 'red' ? 5 : 0) && nr <= (side === 'red' ? 9 : 4) && nc >= 0 && nc <= 8) {
          if (!board[br][bc] && (!board[nr][nc] || board[nr][nc]!.side !== side)) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;
      
    case 'N': // 马
      [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ].forEach(([dr, dc], i) => {
        const nr = row + dr, nc = col + dc;
        const lr = row + [-1, -1, 0, 0, 0, 0, 1, 1][i];
        const lc = col + [0, 0, -1, 1, -1, 1, 0, 0][i];
        if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
          if (!board[lr][lc] && (!board[nr][nc] || board[nr][nc]!.side !== side)) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;
      
    case 'R': // 车
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        for (let i = 1; i < 10; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) break;
          if (board[nr][nc]) {
            if (board[nr][nc]!.side !== side) moves.push({ row: nr, col: nc });
            break;
          }
          moves.push({ row: nr, col: nc });
        }
      });
      break;
      
    case 'C': // 炮
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        let jumped = false;
        for (let i = 1; i < 10; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) break;
          if (!jumped) {
            if (board[nr][nc]) jumped = true;
            else moves.push({ row: nr, col: nc });
          } else {
            if (board[nr][nc]) {
              if (board[nr][nc]!.side !== side) moves.push({ row: nr, col: nc });
              break;
            }
          }
        }
      });
      break;
      
    case 'P': // 兵/卒
      if (side === 'red') {
        if (row - 1 >= 0 && (!board[row - 1][col] || board[row - 1][col]!.side !== side)) {
          moves.push({ row: row - 1, col });
        }
        if (row <= 4) {
          if (col - 1 >= 0 && (!board[row][col - 1] || board[row][col - 1]!.side !== side)) {
            moves.push({ row, col: col - 1 });
          }
          if (col + 1 <= 8 && (!board[row][col + 1] || board[row][col + 1]!.side !== side)) {
            moves.push({ row, col: col + 1 });
          }
        }
      } else {
        if (row + 1 <= 9 && (!board[row + 1][col] || board[row + 1][col]!.side !== side)) {
          moves.push({ row: row + 1, col });
        }
        if (row >= 5) {
          if (col - 1 >= 0 && (!board[row][col - 1] || board[row][col - 1]!.side !== side)) {
            moves.push({ row, col: col - 1 });
          }
          if (col + 1 <= 8 && (!board[row][col + 1] || board[row][col + 1]!.side !== side)) {
            moves.push({ row, col: col + 1 });
          }
        }
      }
      break;
  }
  
  return moves;
}

// 找到将/帅的位置
function findKing(board: (Piece | null)[][], side: Side): Position | null {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] && board[r][c]!.type === 'K' && board[r][c]!.side === side) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

// 检查是否被将军
export function isInCheck(board: (Piece | null)[][], side: Side): boolean {
  const king = findKing(board, side);
  if (!king) return true;
  
  const opponent: Side = side === 'red' ? 'black' : 'red';
  
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] && board[r][c]!.side === opponent) {
        const moves = getRawMoves(board, r, c);
        if (moves.some(m => m.row === king.row && m.col === king.col)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// 检查将帅对脸
export function kingsFacing(board: (Piece | null)[][]): boolean {
  const redKing = findKing(board, 'red');
  const blackKing = findKing(board, 'black');
  
  if (!redKing || !blackKing || redKing.col !== blackKing.col) return false;
  
  for (let r = Math.min(redKing.row, blackKing.row) + 1; r < Math.max(redKing.row, blackKing.row); r++) {
    if (board[r][redKing.col]) return false;
  }
  
  return true;
}

// 获取合法走法（考虑将军和对脸）
export function getValidMoves(board: (Piece | null)[][], row: number, col: number): Position[] {
  const piece = board[row][col];
  if (!piece) return [];
  
  const rawMoves = getRawMoves(board, row, col);
  const side = piece.side;
  
  return rawMoves.filter(m => {
    // 模拟走子
    const captured = board[m.row][m.col];
    board[m.row][m.col] = piece;
    board[row][col] = null;
    
    const valid = !isInCheck(board, side) && !kingsFacing(board);
    
    // 恢复
    board[row][col] = piece;
    board[m.row][m.col] = captured;
    
    return valid;
  });
}

// 执行走子
export function makeMove(
  board: (Piece | null)[][],
  from: Position,
  to: Position,
  moveHistory: Move[]
): { board: (Piece | null)[][]; moveHistory: Move[]; captured: Piece | null } {
  const newBoard = board.map(row => [...row]);
  const piece = newBoard[from.row][from.col];
  const captured = newBoard[to.row][to.col];
  
  const move: Move = {
    from,
    to,
    piece: piece!,
    captured,
    timestamp: Date.now()
  };
  
  newBoard[to.row][to.col] = piece;
  newBoard[from.row][from.col] = null;
  
  return {
    board: newBoard,
    moveHistory: [...moveHistory, move],
    captured
  };
}

// 悔棋
export function undoMove(
  board: (Piece | null)[][],
  moveHistory: Move[]
): { board: (Piece | null)[][]; moveHistory: Move[] } | null {
  if (moveHistory.length === 0) return null;
  
  const newBoard = board.map(row => [...row]);
  const newHistory = [...moveHistory];
  const lastMove = newHistory.pop()!;
  
  newBoard[lastMove.from.row][lastMove.from.col] = lastMove.piece;
  newBoard[lastMove.to.row][lastMove.to.col] = lastMove.captured;
  
  return {
    board: newBoard,
    moveHistory: newHistory
  };
}

// 检查是否被将死
export function isCheckmated(board: (Piece | null)[][], side: Side): boolean {
  // 检查是否有任何合法走法
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] && board[r][c]!.side === side) {
        const moves = getValidMoves(board, r, c);
        if (moves.length > 0) return false;
      }
    }
  }
  return true;
}

// 将位置转换为中文记谱
export function posToNotation(move: Move): string {
  const colNames: Record<Side, string[]> = {
    red: ['九', '八', '七', '六', '五', '四', '三', '二', '一'],
    black: ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  };
  
  const name = PIECE_NAMES[move.piece.type][move.piece.side];
  const side = move.piece.side;
  const fromCol = colNames[side][move.from.col];
  const toCol = colNames[side][move.to.col];
  
  let action: string;
  let dist: string | number;
  
  if (move.from.row === move.to.row) {
    action = '平';
    dist = toCol;
  } else {
    const forward = side === 'red' ? move.to.row < move.from.row : move.to.row > move.from.row;
    action = forward ? '进' : '退';
    
    if (move.from.col === move.to.col) {
      dist = Math.abs(move.to.row - move.from.row);
    } else {
      dist = toCol;
    }
  }
  
  // 数字转中文
  if (typeof dist === 'number') {
    const numNames: Record<Side, string[]> = {
      red: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
      black: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    };
    dist = numNames[side][dist] || dist.toString();
  }
  
  return name + fromCol + action + dist;
}

// 解析时间控制
export function parseTimeControl(tc: string): { minutes: number; increment: number } {
  const [minutes, increment = 0] = tc.split('+').map(Number);
  return { minutes, increment };
}
