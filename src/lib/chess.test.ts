import { describe, it, expect } from 'vitest';
import {
  initBoard,
  cloneBoard,
  getValidMoves,
  makeMove,
  undoMove,
  isInCheck,
  isCheckmated,
  flipPosition,
  screenRowLabel,
  screenColLabel,
  posToNotation
} from './chess';
import type { Piece, Position } from '../types';

// 在棋盘指定位置放一枚棋子（返回新棋盘，避免污染）
function withPiece(board: (Piece | null)[][], row: number, col: number, piece: Piece): (Piece | null)[][] {
  const b = cloneBoard(board);
  b[row][col] = piece;
  return b;
}

// 判断某个走法是否在合法走法列表中
function hasMove(moves: Position[], row: number, col: number): boolean {
  return moves.some(m => m.row === row && m.col === col);
}

describe('规则引擎', () => {
  it('初始棋盘：黑方在上(0~4行)、红方在下(5~9行)，双方将帅齐全', () => {
    const board = initBoard();
    // 黑方底线在第 0 行
    expect(board[0][0]).toEqual({ type: 'R', side: 'black' });
    expect(board[0][4]).toEqual({ type: 'K', side: 'black' });
    // 红方底线在第 9 行
    expect(board[9][0]).toEqual({ type: 'R', side: 'red' });
    expect(board[9][4]).toEqual({ type: 'K', side: 'red' });
    // 黑炮在第 2 行、红炮在第 7 行
    expect(board[2][1]).toEqual({ type: 'C', side: 'black' });
    expect(board[7][1]).toEqual({ type: 'C', side: 'red' });
    // 双方各 16 子
    let red = 0, black = 0;
    for (const row of board) {
      for (const p of row) {
        if (p?.side === 'red') red++;
        else if (p?.side === 'black') black++;
      }
    }
    expect(red).toBe(16);
    expect(black).toBe(16);
  });

  it('马走日，蹩马腿时被限制', () => {
    const board = initBoard();
    // 初始位置(0,1)的马：右跳会被(0,2)的象蹩腿
    const moves = getValidMoves(board, 0, 1);
    // (2,0) 可跳
    expect(hasMove(moves, 2, 0)).toBe(true);
    // (2,2) 被 (1,2) 蹩腿？初始 (1,2) 为空，但(0,2)在正右方，不影响纵向跳
    expect(hasMove(moves, 2, 2)).toBe(true);
    // 向上/向下超出或蹩腿的不可达
    expect(hasMove(moves, -1, 2)).toBe(false);

    // 在 (4,4) 放一红马，正前方(3,4)放一枚棋子蹩腿，(2,3)/(2,5) 均不可达
    let b = initBoard();
    b[4][4] = { type: 'N', side: 'red' };
    b[3][4] = { type: 'P', side: 'red' };
    const m2 = getValidMoves(b, 4, 4);
    expect(hasMove(m2, 2, 3)).toBe(false);
    expect(hasMove(m2, 2, 5)).toBe(false);
    expect(hasMove(m2, 6, 3)).toBe(true);
  });

  it('象走田，塞象眼时被限制，且不能过河', () => {
    const board = initBoard();
    // 黑象 (0,2) 可飞到 (2,0)/(2,4)；初始象眼(1,1)/(1,3)为空
    const moves = getValidMoves(board, 0, 2);
    expect(hasMove(moves, 2, 0)).toBe(true);
    expect(hasMove(moves, 2, 4)).toBe(true);

    // 塞象眼：在(1,3)放子，(0,2)黑象不能飞(2,4)
    let b = withPiece(initBoard(), 1, 3, { type: 'P', side: 'black' });
    const m2 = getValidMoves(b, 0, 2);
    expect(hasMove(m2, 2, 4)).toBe(false);

    // 象不能过河：红象在第5行以下，不能跳到第3行
    b = withPiece(initBoard(), 5, 2, { type: 'B', side: 'red' });
    const m3 = getValidMoves(b, 5, 2);
    expect(hasMove(m3, 3, 0)).toBe(false);
    expect(hasMove(m3, 3, 4)).toBe(false);
  });

  it('炮隔子吃、无炮架不能吃', () => {
    let b = initBoard();
    // 构造干净的一列：红炮(7,0)，黑炮(2,0)作炮架，黑车(0,0)为目标
    b[7][0] = { type: 'C', side: 'red' };
    b[9][0] = null;   // 清红车
    b[6][0] = null;   // 清红兵，避免多一个炮架
    b[3][0] = null;   // 清黑卒
    b[2][0] = { type: 'C', side: 'black' }; // 黑炮作炮架
    b[0][0] = { type: 'R', side: 'black' }; // 黑车目标
    const moves = getValidMoves(b, 7, 0);
    // 隔着一个子(黑炮)可以吃(0,0)黑车
    expect(hasMove(moves, 0, 0)).toBe(true);
    // 炮架位置不可落
    expect(hasMove(moves, 2, 0)).toBe(false);

    // 无炮架：撤掉黑炮，则炮不能隔空吃(0,0)黑车，但可平移
    b[2][0] = null;
    // 清空第 7 行其余子，确保 (7,0) 可自由平移（红相/马/仕等会挡住路径）
    for (let c = 0; c < 9; c++) {
      if (c !== 0) b[7][c] = null;
    }
    const m2 = getValidMoves(b, 7, 0);
    expect(hasMove(m2, 0, 0)).toBe(false);
    expect(hasMove(m2, 7, 4)).toBe(true);
  });

  it('车直线走子与吃子', () => {
    let b = initBoard();
    // 清空(0,0)黑车竖线一路上的障碍：黑卒(3,0)、红兵(6,0)、红炮(7,0)
    b[3][0] = null;
    b[6][0] = null;
    b[7][0] = null;
    const moves = getValidMoves(b, 0, 0);
    expect(hasMove(moves, 9, 0)).toBe(true); // 可一路下到底吃掉红车
    expect(hasMove(moves, 0, 1)).toBe(false); // 横向被(0,1)马挡住
  });

  it('兵过河后可左右横走，未过河不能横走', () => {
    const board = initBoard();
    // 红兵在(6,0)（未过河）：只能前进(5,0)，不能横走
    let moves = getValidMoves(board, 6, 0);
    expect(hasMove(moves, 5, 0)).toBe(true);
    expect(hasMove(moves, 6, 1)).toBe(false);
    expect(hasMove(moves, 6, -1)).toBe(false);

    // 红兵在(4,2)（已过河）：可前进 + 左右横走
    let b = withPiece(initBoard(), 4, 2, { type: 'P', side: 'red' });
    moves = getValidMoves(b, 4, 2);
    expect(hasMove(moves, 3, 2)).toBe(true);
    expect(hasMove(moves, 4, 1)).toBe(true);
    expect(hasMove(moves, 4, 3)).toBe(true);

    // 黑卒在(5,2)（已过河）：可前进 + 左右横走
    b = withPiece(initBoard(), 5, 2, { type: 'P', side: 'black' });
    moves = getValidMoves(b, 5, 2);
    expect(hasMove(moves, 6, 2)).toBe(true);
    expect(hasMove(moves, 5, 1)).toBe(true);
    expect(hasMove(moves, 5, 3)).toBe(true);
  });

  it('将帅限制在九宫，且不能吃掉对方将/帅', () => {
    let b = initBoard();
    // 红帅(9,4)：清掉两侧红仕(9,3)/(9,5)后，可上下左右走一步，但斜走不允许
    b[9][3] = null;
    b[9][5] = null;
    let moves = getValidMoves(b, 9, 4);
    expect(hasMove(moves, 8, 4)).toBe(true);
    expect(hasMove(moves, 9, 3)).toBe(true);
    expect(hasMove(moves, 9, 5)).toBe(true);
    expect(hasMove(moves, 8, 3)).toBe(false); // 斜走不允许

    // 构造"红帅可直接吃黑将"的场景：规则引擎应排除"吃将"走法
    b = initBoard();
    b[9][4] = { type: 'K', side: 'red' };   // 红帅(9,4)
    b[9][5] = { type: 'K', side: 'black' }; // 黑将放在红帅右侧（仅测试用）
    b[9][3] = null;  // 清红仕
    b[8][4] = null;  // 清空上方
    moves = getValidMoves(b, 9, 4);
    expect(hasMove(moves, 9, 5)).toBe(false); // 不能直接吃将
    expect(hasMove(moves, 9, 3)).toBe(true);  // 可左移
    expect(hasMove(moves, 8, 4)).toBe(true);  // 可上移
  });

  it('将帅对脸（飞将）判负，不能走成对脸', () => {
    // 构造将帅同列且中间无子：黑将(0,4)、红帅(9,4)
    let b = initBoard();
    b[0][4] = { type: 'K', side: 'black' };
    b[9][4] = { type: 'K', side: 'red' };
    // 清空中间列所有子
    for (let r = 1; r < 9; r++) b[r][4] = null;
    // 清掉黑将两侧的士，便于黑将左右移动
    b[0][3] = null;
    b[0][5] = null;

    // 黑将不能走到(1,4)（会继续与红帅对脸）
    const moves = getValidMoves(b, 0, 4);
    expect(hasMove(moves, 1, 4)).toBe(false);
    // 黑将可左右平移避开对脸
    expect(hasMove(moves, 0, 3)).toBe(true);
    expect(hasMove(moves, 0, 5)).toBe(true);
  });

  it('将军与将死判定', () => {
    let b = initBoard();
    // 初始局面无将军
    expect(isInCheck(b, 'red')).toBe(false);
    expect(isInCheck(b, 'black')).toBe(false);
    expect(isCheckmated(b, 'red')).toBe(false);

    // 构造闷杀：双车一横一底封死红帅，红帅无处可走
    b = initBoard();
    // 清空红方阵营用于构造
    for (let r = 5; r < 10; r++) {
      for (let c = 0; c < 9; c++) b[r][c] = null;
    }
    b[9][4] = { type: 'K', side: 'red' }; // 红帅居中
    // 第8行横线双车封死上行，(9,0)/(9,8)底线车将军并互相保护
    b[8][0] = { type: 'R', side: 'black' };
    b[8][8] = { type: 'R', side: 'black' };
    b[9][0] = { type: 'R', side: 'black' };
    b[9][8] = { type: 'R', side: 'black' };
    // (9,0)车横向将军(9,4)，红帅被将
    expect(isInCheck(b, 'red')).toBe(true);
    // 红帅：上(8,4)被第8行双车威胁，左(9,3)被(9,0)车威胁，右(9,5)被(9,8)车威胁 → 将死
    expect(isCheckmated(b, 'red')).toBe(true);
  });

  it('makeMove / undoMove / cloneBoard 深拷贝不污染原棋盘', () => {
    const board = initBoard();
    const snapshot = JSON.stringify(board);

    const res = makeMove(board, { row: 6, col: 0 }, { row: 5, col: 0 }, []);
    expect(res.captured).toBeNull();
    expect(res.board[5][0]).toEqual({ type: 'P', side: 'red' });
    expect(res.board[6][0]).toBeNull();
    expect(res.moveHistory).toHaveLength(1);
    // 原棋盘未被修改
    expect(JSON.stringify(board)).toBe(snapshot);
    // 深拷贝：修改返回棋盘的行数组不影响原棋盘
    res.board[5][0] = null;
    expect(board[5][0]).toBeNull(); // 原本就空
    expect(board[6][0]).toEqual({ type: 'P', side: 'red' });

    // 吃子
    let b = initBoard();
    b[6][4] = { type: 'P', side: 'red' };
    b[5][4] = { type: 'P', side: 'black' };
    const cap = makeMove(b, { row: 6, col: 4 }, { row: 5, col: 4 }, []);
    expect(cap.captured).toEqual({ type: 'P', side: 'black' });

    // 悔棋还原
    const undone = undoMove(cap.board, cap.moveHistory);
    expect(undone).not.toBeNull();
    expect(undone!.board[6][4]).toEqual({ type: 'P', side: 'red' });
    expect(undone!.board[5][4]).toEqual({ type: 'P', side: 'black' });
  });

  it('记谱：兵七进一 / 车一平二 等基本记谱', () => {
    const mk = (from: Position, to: Position, piece: Piece) => ({ from, to, piece, captured: null, timestamp: 0 });

    // 红方视角：col 0→九路、col 2→七路、col 8→一路
    // 红兵从七路(6,2)进一 → "兵七进一"
    expect(posToNotation(mk({ row: 6, col: 2 }, { row: 5, col: 2 }, { type: 'P', side: 'red' }))).toBe('兵七进一');
    // 红车从一路(9,8)平到二路(9,7) → "車一平二"（引擎输出繁体車）
    expect(posToNotation(mk({ row: 9, col: 8 }, { row: 9, col: 7 }, { type: 'R', side: 'red' }))).toBe('車一平二');
    // 黑方视角：col 0→1路、col 1→2路；黑炮从(2,1)进到(3,1) → "砲2进1"（引擎黑方用半角数字）
    expect(posToNotation(mk({ row: 2, col: 1 }, { row: 3, col: 1 }, { type: 'C', side: 'black' }))).toBe('砲2进1');
  });
});

describe('执黑翻转坐标映射', () => {
  it('flipPosition 逻辑坐标↔屏幕坐标 180° 旋转映射', () => {
    // 黑将逻辑(0,4) → 屏幕(9,4)（屏幕底部）
    expect(flipPosition({ row: 0, col: 4 })).toEqual({ row: 9, col: 4 });
    // 红帅逻辑(9,4) → 屏幕(0,4)（屏幕顶部）
    expect(flipPosition({ row: 9, col: 4 })).toEqual({ row: 0, col: 4 });
    // 双向映射：flip(flip(p)) === p
    for (const p of [
      { row: 0, col: 0 },
      { row: 3, col: 7 },
      { row: 9, col: 8 },
      { row: 5, col: 4 }
    ]) {
      expect(flipPosition(flipPosition(p))).toEqual(p);
    }
  });

  it('点击映射与绘制共用同一翻转语义（9-r, 8-c）', () => {
    // 屏幕坐标(0,0) 在执黑视角下对应逻辑坐标(9,8)（红方底线最右）
    expect(flipPosition({ row: 0, col: 0 })).toEqual({ row: 9, col: 8 });
    // 屏幕坐标(9,8) 对应逻辑(0,0)（黑方底线最左）
    expect(flipPosition({ row: 9, col: 8 })).toEqual({ row: 0, col: 0 });
  });

  it('屏幕行标：执红顶→底 1→10，执黑顶→底 10→1（屏幕顶对应红方底线10）', () => {
    // 执红：屏幕顶(0)标 1，屏幕底(9)标 10
    expect(screenRowLabel(0, false)).toBe('1');
    expect(screenRowLabel(9, false)).toBe('10');
    // 执黑（翻转）：屏幕顶(0)标 10（红方底线），屏幕底(9)标 1（黑方底线）
    expect(screenRowLabel(0, true)).toBe('10');
    expect(screenRowLabel(9, true)).toBe('1');
    // 中间各排严格反向
    expect(screenRowLabel(4, true)).toBe('6');
    expect(screenRowLabel(5, true)).toBe('5');
  });

  it('屏幕列标：无论是否翻转，屏幕左→右固定 9→1', () => {
    expect(screenColLabel(0)).toBe('9');
    expect(screenColLabel(4)).toBe('5');
    expect(screenColLabel(8)).toBe('1');
  });

  it('执黑翻转后，黑将(0,4)应显示在屏幕底部行标 1（自己的第 1 排）', () => {
    // 黑将逻辑坐标(0,4)翻转后屏幕坐标(9,4)：屏幕底，行标应为 1
    const screenPos = flipPosition({ row: 0, col: 4 });
    expect(screenPos).toEqual({ row: 9, col: 4 });
    expect(screenRowLabel(screenPos.row, true)).toBe('1');
    // 红帅逻辑坐标(9,4)翻转后屏幕坐标(0,4)：屏幕顶，行标应为 10（红方底线）
    const redScreen = flipPosition({ row: 9, col: 4 });
    expect(redScreen).toEqual({ row: 0, col: 4 });
    expect(screenRowLabel(redScreen.row, true)).toBe('10');
  });

  it('翻转映射与行/列标完整链路组合：点击坐标经 flipPosition 后与屏幕标注一致', () => {
    // 执黑时屏幕顶部行标 10（红方底线）：点击屏幕(0,4) → 逻辑(9,4)（红帅），
    // 该逻辑坐标翻转回屏幕后应回到顶部行标 10 —— 绘制与点击共用同一套语义
    const clicked = flipPosition({ row: 0, col: 4 });
    expect(clicked).toEqual({ row: 9, col: 4 });
    expect(screenRowLabel(flipPosition(clicked).row, true)).toBe('10');
    expect(screenRowLabel(clicked.row, false)).toBe('10'); // 红方视角下行标为 10

    // 执黑时屏幕底部行标 1（黑方底线）：点击屏幕(9,4) → 逻辑(0,4)（黑将）
    const clickedBottom = flipPosition({ row: 9, col: 4 });
    expect(clickedBottom).toEqual({ row: 0, col: 4 });
    expect(screenRowLabel(flipPosition(clickedBottom).row, true)).toBe('1');

    // 屏幕左上角(0,0)在执黑视角点击 → 逻辑(9,8)，其列标应为屏幕右侧的 1
    expect(flipPosition({ row: 0, col: 0 })).toEqual({ row: 9, col: 8 });
    expect(screenColLabel(flipPosition({ row: 0, col: 0 }).col)).toBe('1');

    // 屏幕右上角(0,8)在执黑视角点击 → 逻辑(9,0)，其列标应为屏幕左侧的 9
    expect(flipPosition({ row: 0, col: 8 })).toEqual({ row: 9, col: 0 });
    expect(screenColLabel(flipPosition({ row: 0, col: 8 }).col)).toBe('9');

    // 黑将逻辑(0,4)翻转后到屏幕底部(9,4)，执黑视角行标为 1（自己的第 1 排）
    expect(screenRowLabel(flipPosition({ row: 0, col: 4 }).row, true)).toBe('1');
    // 红帅逻辑(9,4)翻转后到屏幕顶部(0,4)，执黑视角行标为 10（红方底线）
    expect(screenRowLabel(flipPosition({ row: 9, col: 4 }).row, true)).toBe('10');
  });
});
