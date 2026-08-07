-- 中国象棋在线对弈平台数据库初始化脚本
-- 在 Supabase SQL Editor 中运行此脚本（可重复执行，脚本为幂等设计）

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(20) NOT NULL UNIQUE,
  rating INTEGER DEFAULT 1500,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  avatar VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  time_control VARCHAR(20) NOT NULL,
  red_player UUID REFERENCES profiles(id) ON DELETE SET NULL,
  black_player UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'waiting',
  board JSONB NOT NULL,
  move_history JSONB DEFAULT '[]',
  current_turn VARCHAR(10) DEFAULT 'red',
  red_time INTEGER DEFAULT 600,
  black_time INTEGER DEFAULT 600,
  last_move_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  winner VARCHAR(10),
  result_reason VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('waiting', 'playing', 'finished')),
  CONSTRAINT valid_turn CHECK (current_turn IN ('red', 'black')),
  CONSTRAINT valid_winner CHECK (winner IS NULL OR winner IN ('red', 'black')),
  -- 同一房间两个玩家不能是同一个人
  CONSTRAINT players_must_differ CHECK (red_player IS NULL OR black_player IS NULL OR red_player <> black_player)
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username VARCHAR(50) NOT NULL,
  content VARCHAR(500) NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 游戏记录表（用于回放和统计）
CREATE TABLE IF NOT EXISTS game_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  red_player UUID REFERENCES profiles(id) ON DELETE SET NULL,
  black_player UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner VARCHAR(10),
  result_reason VARCHAR(50),
  move_history JSONB NOT NULL,
  time_control VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_game_records_players ON game_records(red_player, black_player);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================================
-- RLS 策略
-- =====================================================================

-- profiles 表
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- rooms 表
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON rooms;
CREATE POLICY "Rooms are viewable by everyone"
  ON rooms FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = red_player
    AND status = 'waiting'
  );

-- 玩家只能更新自己参与的房间；走子、认输等所有写入统一经过 validate_room_move 做服务端校验
DROP POLICY IF EXISTS "Players can update their rooms" ON rooms;
CREATE POLICY "Players can update their rooms"
  ON rooms FOR UPDATE
  USING (
    auth.uid() = red_player OR
    auth.uid() = black_player
  );

-- chat_messages 表
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat messages are viewable by everyone" ON chat_messages;
CREATE POLICY "Chat messages are viewable by everyone"
  ON chat_messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can send messages" ON chat_messages;
CREATE POLICY "Authenticated users can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND char_length(content) BETWEEN 1 AND 500
  );

-- game_records 表
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Game records are viewable by everyone" ON game_records;
CREATE POLICY "Game records are viewable by everyone"
  ON game_records FOR SELECT
  USING (true);

-- game_records 只允许通过受信任的数据库函数写入（由 finish_game 服务端完成）
DROP POLICY IF EXISTS "System can insert game records" ON game_records;
CREATE POLICY "System can insert game records"
  ON game_records FOR INSERT
  WITH CHECK (true);

-- =====================================================================
-- 实时订阅（幂等：若表已在发布中则先移除再加入）
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rooms') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE rooms;
  END IF;
END;
$$;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE chat_messages;
  END IF;
END;
$$;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- =====================================================================
-- 创建新用户时自动创建 profile
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_name VARCHAR(20);
  final_name VARCHAR(20);
  suffix INTEGER := 0;
BEGIN
  base_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), '玩家' || LEFT(NEW.id::text, 6));
  -- 若用户名冲突则追加序号，保证注册不因 UNIQUE 冲突失败
  final_name := LEFT(base_name, 20);
  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username)
      VALUES (NEW.id, final_name);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      suffix := suffix + 1;
      final_name := LEFT(base_name, 20 - length(suffix::text)) || suffix::text;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 服务端对局校验与结算
-- =====================================================================

-- 走子校验函数：由数据库端校验走子合法性、轮次、归属，防止前端绕过
CREATE OR REPLACE FUNCTION public.validate_room_move(
  p_room_id UUID,
  p_from_row INT,
  p_from_col INT,
  p_to_row INT,
  p_to_col INT,
  p_red_time INT,
  p_black_time INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  board JSONB;
  piece JSONB;
  actor UUID := auth.uid();
  actor_side TEXT;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;

  IF r.status <> 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'error', '对局未在进行中');
  END IF;

  -- 只能操作自己参与的房间
  IF actor <> r.red_player AND actor <> r.black_player THEN
    RETURN jsonb_build_object('ok', false, 'error', '不是对局参与者');
  END IF;

  -- 轮次与走子方校验
  actor_side := CASE WHEN actor = r.red_player THEN 'red' WHEN actor = r.black_player THEN 'black' END;
  IF actor_side <> r.current_turn THEN
    RETURN jsonb_build_object('ok', false, 'error', '未轮到你走棋');
  END IF;

  -- 走子方棋子归属校验
  piece := r.board->p_from_row->p_from_col;
  IF piece IS NULL OR jsonb_typeof(piece) = 'null' THEN
    RETURN jsonb_build_object('ok', false, 'error', '起点无棋子');
  END IF;
  IF piece->>'side' <> actor_side THEN
    RETURN jsonb_build_object('ok', false, 'error', '只能移动自己的棋子');
  END IF;

  -- 目标格不能是己方棋子
  piece := r.board->p_to_row->p_to_col;
  IF piece IS NOT NULL AND jsonb_typeof(piece) <> 'null' AND piece->>'side' = actor_side THEN
    RETURN jsonb_build_object('ok', false, 'error', '目标格是己方棋子');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 对局结束：写入 game_records 并更新双方等级分/胜负统计
CREATE OR REPLACE FUNCTION public.finish_game(
  p_room_id UUID,
  p_winner TEXT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  loser TEXT;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;

  IF r.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true);
  END IF;

  -- 校验参数合法性
  IF p_winner IS NOT NULL AND p_winner NOT IN ('red', 'black') THEN
    RETURN jsonb_build_object('ok', false, 'error', '非法胜负方');
  END IF;
  IF p_winner IS NOT NULL AND (r.red_player IS NULL OR r.black_player IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', '对局未完整，不能判定胜负');
  END IF;

  UPDATE rooms
  SET status = 'finished',
      winner = p_winner,
      result_reason = p_reason
  WHERE id = p_room_id;

  -- 写入对局记录并更新统计
  RETURN public.record_game_result(p_room_id, p_winner, p_reason, r.move_history, r.red_player, r.black_player);
END;
$$;

-- 写入对局记录并更新双方统计（不修改房间状态，供已落库的走子结算调用）
CREATE OR REPLACE FUNCTION public.record_game_result(
  p_room_id UUID,
  p_winner TEXT,
  p_reason TEXT,
  p_move_history JSONB,
  p_red_player UUID,
  p_black_player UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  loser TEXT;
  red_rating INT;
  black_rating INT;
BEGIN
  -- 写入对局记录
  INSERT INTO game_records (room_id, red_player, black_player, winner, result_reason, move_history, time_control)
  VALUES (p_room_id, p_red_player, p_black_player, p_winner, p_reason, p_move_history,
    (SELECT time_control FROM rooms WHERE id = p_room_id));

  -- 更新双方统计（基础 Elo 风格，胜者 +16 / 负者 -16）
  IF p_winner IS NOT NULL THEN
    loser := CASE WHEN p_winner = 'red' THEN 'black' ELSE 'red' END;
    IF p_red_player IS NOT NULL THEN
      SELECT rating INTO red_rating FROM profiles WHERE id = p_red_player;
      UPDATE profiles
      SET wins = wins + CASE WHEN p_winner = 'red' THEN 1 ELSE 0 END,
          losses = losses + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
          rating = red_rating + CASE WHEN p_winner = 'red' THEN 16 ELSE -16 END
      WHERE id = p_red_player;
    END IF;
    IF p_black_player IS NOT NULL THEN
      SELECT rating INTO black_rating FROM profiles WHERE id = p_black_player;
      UPDATE profiles
      SET wins = wins + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
          losses = losses + CASE WHEN p_winner = 'red' THEN 1 ELSE 0 END,
          rating = black_rating + CASE WHEN p_winner = 'black' THEN 16 ELSE -16 END
      WHERE id = p_black_player;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =====================================================================
-- 服务端象棋规则引擎（PL/pgSQL 移植自 src/lib/chess.ts）
-- 用于 make_move RPC 的服务端走法校验，防止前端绕过规则作弊
-- =====================================================================

-- 判断坐标是否在棋盘内
CREATE OR REPLACE FUNCTION chess_in_board(r INT, c INT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN r >= 0 AND r <= 9 AND c >= 0 AND c <= 8;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 判断是否为将/帅
CREATE OR REPLACE FUNCTION chess_is_king(piece JSONB) RETURNS BOOLEAN AS $$
BEGIN
  RETURN piece IS NOT NULL AND jsonb_typeof(piece) <> 'null' AND piece->>'type' = 'K';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 获取某位置棋子的原始走法（不考虑将军），返回 [{row, col}, ...]
CREATE OR REPLACE FUNCTION chess_raw_moves(board JSONB, r INT, c INT) RETURNS JSONB AS $$
DECLARE
  piece JSONB;
  side TEXT;
  ptype TEXT;
  moves JSONB := '[]'::JSONB;
  dr INT; dc INT; nr INT; nc INT; i INT; step INT;
  jumped BOOLEAN;
  min_r INT; max_r INT;
BEGIN
  piece := board->r->c;
  IF piece IS NULL OR jsonb_typeof(piece) = 'null' THEN RETURN moves; END IF;
  side := piece->>'side';
  ptype := piece->>'type';

  IF ptype = 'K' THEN
    -- 将/帅：九宫内走一步
    IF side = 'red' THEN min_r := 7; max_r := 9; ELSE min_r := 0; max_r := 2; END IF;
    FOR i IN 1..4 LOOP
      dr := (ARRAY[0, 0, 1, -1])[i];
      dc := (ARRAY[1, -1, 0, 0])[i];
      nr := r + dr; nc := c + dc;
      IF nr >= min_r AND nr <= max_r AND nc >= 3 AND nc <= 5
         AND (board->nr->nc IS NULL OR jsonb_typeof(board->nr->nc) = 'null'
              OR board->nr->nc->>'side' <> side) THEN
        moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
      END IF;
    END LOOP;

  ELSIF ptype = 'A' THEN
    -- 士/仕：九宫内斜走一步
    IF side = 'red' THEN min_r := 7; max_r := 9; ELSE min_r := 0; max_r := 2; END IF;
    FOR i IN 1..4 LOOP
      dr := (ARRAY[-1, -1, 1, 1])[i];
      dc := (ARRAY[-1, 1, -1, 1])[i];
      nr := r + dr; nc := c + dc;
      IF nr >= min_r AND nr <= max_r AND nc >= 3 AND nc <= 5
         AND (board->nr->nc IS NULL OR jsonb_typeof(board->nr->nc) = 'null'
              OR board->nr->nc->>'side' <> side) THEN
        moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
      END IF;
    END LOOP;

  ELSIF ptype = 'B' THEN
    -- 象/相：田字，塞象眼，不能过河
    IF side = 'red' THEN min_r := 5; max_r := 9; ELSE min_r := 0; max_r := 4; END IF;
    FOR i IN 0..3 LOOP
      dr := CASE i WHEN 0 THEN -2 WHEN 1 THEN -2 WHEN 2 THEN 2 ELSE 2 END;
      dc := CASE i WHEN 0 THEN -2 WHEN 1 THEN 2 WHEN 2 THEN -2 ELSE 2 END;
      nr := r + dr; nc := c + dc;
      IF nr >= min_r AND nr <= max_r AND nc >= 0 AND nc <= 8 THEN
        -- 象眼
        IF (board->(r + (CASE i WHEN 0 THEN -1 WHEN 1 THEN -1 WHEN 2 THEN 1 ELSE 1 END))
               ->(c + (CASE i WHEN 0 THEN -1 WHEN 1 THEN 1 WHEN 2 THEN -1 ELSE 1 END)) IS NULL
            OR jsonb_typeof(board->(r + (CASE i WHEN 0 THEN -1 WHEN 1 THEN -1 WHEN 2 THEN 1 ELSE 1 END))
               ->(c + (CASE i WHEN 0 THEN -1 WHEN 1 THEN 1 WHEN 2 THEN -1 ELSE 1 END))) = 'null')
           AND (board->nr->nc IS NULL OR jsonb_typeof(board->nr->nc) = 'null'
                OR board->nr->nc->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
        END IF;
      END IF;
    END LOOP;

  ELSIF ptype = 'N' THEN
    -- 马：日字，蹩马腿
    FOR i IN 0..7 LOOP
      dr := CASE i WHEN 0 THEN -2 WHEN 1 THEN -2 WHEN 2 THEN -1 WHEN 3 THEN -1 WHEN 4 THEN 1 WHEN 5 THEN 1 WHEN 6 THEN 2 ELSE 2 END;
      dc := CASE i WHEN 0 THEN -1 WHEN 1 THEN 1 WHEN 2 THEN -2 WHEN 3 THEN 2 WHEN 4 THEN -2 WHEN 5 THEN 2 WHEN 6 THEN -1 ELSE 1 END;
      nr := r + dr; nc := c + dc;
      IF chess_in_board(nr, nc) THEN
        -- 马腿
        IF (board->(r + (CASE i WHEN 0 THEN -1 WHEN 1 THEN -1 WHEN 2 THEN 0 WHEN 3 THEN 0 WHEN 4 THEN 0 WHEN 5 THEN 0 WHEN 6 THEN 1 ELSE 1 END))
               ->(c + (CASE i WHEN 0 THEN 0 WHEN 1 THEN 0 WHEN 2 THEN -1 WHEN 3 THEN 1 WHEN 4 THEN -1 WHEN 5 THEN 1 WHEN 6 THEN 0 ELSE 0 END)) IS NULL
            OR jsonb_typeof(board->(r + (CASE i WHEN 0 THEN -1 WHEN 1 THEN -1 WHEN 2 THEN 0 WHEN 3 THEN 0 WHEN 4 THEN 0 WHEN 5 THEN 0 WHEN 6 THEN 1 ELSE 1 END))
               ->(c + (CASE i WHEN 0 THEN 0 WHEN 1 THEN 0 WHEN 2 THEN -1 WHEN 3 THEN 1 WHEN 4 THEN -1 WHEN 5 THEN 1 WHEN 6 THEN 0 ELSE 0 END))) = 'null')
           AND (board->nr->nc IS NULL OR jsonb_typeof(board->nr->nc) = 'null'
                OR board->nr->nc->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
        END IF;
      END IF;
    END LOOP;

  ELSIF ptype = 'R' THEN
    -- 车：直线
    FOR i IN 1..4 LOOP
      dr := (ARRAY[0, 0, 1, -1])[i];
      dc := (ARRAY[1, -1, 0, 0])[i];
      step := 1;
      LOOP
        nr := r + dr * step; nc := c + dc * step;
        EXIT WHEN NOT chess_in_board(nr, nc);
        IF board->nr->nc IS NOT NULL AND jsonb_typeof(board->nr->nc) <> 'null' THEN
          IF board->nr->nc->>'side' <> side THEN
            moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
          END IF;
          EXIT;
        END IF;
        moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
        step := step + 1;
      END LOOP;
    END LOOP;

  ELSIF ptype = 'C' THEN
    -- 炮：隔子吃
    FOR i IN 1..4 LOOP
      dr := (ARRAY[0, 0, 1, -1])[i];
      dc := (ARRAY[1, -1, 0, 0])[i];
      jumped := FALSE;
      step := 1;
      LOOP
        nr := r + dr * step; nc := c + dc * step;
        EXIT WHEN NOT chess_in_board(nr, nc);
        IF NOT jumped THEN
          IF board->nr->nc IS NOT NULL AND jsonb_typeof(board->nr->nc) <> 'null' THEN
            jumped := TRUE;
          ELSE
            moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
          END IF;
        ELSE
          IF board->nr->nc IS NOT NULL AND jsonb_typeof(board->nr->nc) <> 'null' THEN
            IF board->nr->nc->>'side' <> side THEN
              moves := moves || jsonb_build_array(jsonb_build_object('row', nr, 'col', nc));
            END IF;
            EXIT;
          END IF;
        END IF;
        step := step + 1;
      END LOOP;
    END LOOP;

  ELSIF ptype = 'P' THEN
    -- 兵/卒
    IF side = 'red' THEN
      IF r - 1 >= 0 AND (board->(r-1)->c IS NULL OR jsonb_typeof(board->(r-1)->c) = 'null'
          OR board->(r-1)->c->>'side' <> side) THEN
        moves := moves || jsonb_build_array(jsonb_build_object('row', r - 1, 'col', c));
      END IF;
      IF r <= 4 THEN
        IF c - 1 >= 0 AND (board->r->(c-1) IS NULL OR jsonb_typeof(board->r->(c-1)) = 'null'
            OR board->r->(c-1)->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', r, 'col', c - 1));
        END IF;
        IF c + 1 <= 8 AND (board->r->(c+1) IS NULL OR jsonb_typeof(board->r->(c+1)) = 'null'
            OR board->r->(c+1)->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', r, 'col', c + 1));
        END IF;
      END IF;
    ELSE
      IF r + 1 <= 9 AND (board->(r+1)->c IS NULL OR jsonb_typeof(board->(r+1)->c) = 'null'
          OR board->(r+1)->c->>'side' <> side) THEN
        moves := moves || jsonb_build_array(jsonb_build_object('row', r + 1, 'col', c));
      END IF;
      IF r >= 5 THEN
        IF c - 1 >= 0 AND (board->r->(c-1) IS NULL OR jsonb_typeof(board->r->(c-1)) = 'null'
            OR board->r->(c-1)->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', r, 'col', c - 1));
        END IF;
        IF c + 1 <= 8 AND (board->r->(c+1) IS NULL OR jsonb_typeof(board->r->(c+1)) = 'null'
            OR board->r->(c+1)->>'side' <> side) THEN
          moves := moves || jsonb_build_array(jsonb_build_object('row', r, 'col', c + 1));
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN moves;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 找到某方将/帅位置，返回 jsonb {row, col} 或 null
CREATE OR REPLACE FUNCTION chess_find_king(board JSONB, side TEXT) RETURNS JSONB AS $$
DECLARE
  r INT; c INT; piece JSONB;
BEGIN
  FOR r IN 0..9 LOOP
    FOR c IN 0..8 LOOP
      piece := board->r->c;
      IF piece IS NOT NULL AND jsonb_typeof(piece) <> 'null'
         AND piece->>'type' = 'K' AND piece->>'side' = side THEN
        RETURN jsonb_build_object('row', r, 'col', c);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 模拟走子后的棋盘（不修改原棋盘）
CREATE OR REPLACE FUNCTION chess_apply_move(board JSONB, fr INT, fc INT, tr INT, tc INT) RETURNS JSONB AS $$
DECLARE
  piece JSONB;
BEGIN
  piece := board->fr->fc;
  board := jsonb_set(board, ARRAY[fr::TEXT, fc::TEXT], 'null');
  board := jsonb_set(board, ARRAY[tr::TEXT, tc::TEXT], piece);
  RETURN board;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 是否被将军
CREATE OR REPLACE FUNCTION chess_in_check(board JSONB, side TEXT) RETURNS BOOLEAN AS $$
DECLARE
  king JSONB;
  opponent TEXT;
  r INT; c INT; piece JSONB;
  moves JSONB; m JSONB;
BEGIN
  king := chess_find_king(board, side);
  IF king IS NULL THEN RETURN TRUE; END IF;
  opponent := CASE WHEN side = 'red' THEN 'black' ELSE 'red' END;

  FOR r IN 0..9 LOOP
    FOR c IN 0..8 LOOP
      piece := board->r->c;
      IF piece IS NOT NULL AND jsonb_typeof(piece) <> 'null' AND piece->>'side' = opponent THEN
        moves := chess_raw_moves(board, r, c);
        FOR m IN SELECT * FROM jsonb_array_elements(moves) LOOP
          IF (m->>'row')::INT = (king->>'row')::INT AND (m->>'col')::INT = (king->>'col')::INT THEN
            RETURN TRUE;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 将帅对脸
CREATE OR REPLACE FUNCTION chess_kings_facing(board JSONB) RETURNS BOOLEAN AS $$
DECLARE
  rk JSONB; bk JSONB;
  r INT; min_r INT; max_r INT;
BEGIN
  rk := chess_find_king(board, 'red');
  bk := chess_find_king(board, 'black');
  IF rk IS NULL OR bk IS NULL THEN RETURN FALSE; END IF;
  IF (rk->>'col')::INT <> (bk->>'col')::INT THEN RETURN FALSE; END IF;

  min_r := LEAST((rk->>'row')::INT, (bk->>'row')::INT);
  max_r := GREATEST((rk->>'row')::INT, (bk->>'row')::INT);
  FOR r IN min_r + 1 .. max_r - 1 LOOP
    IF board->r->(rk->>'col')::INT IS NOT NULL
       AND jsonb_typeof(board->r->(rk->>'col')::INT) <> 'null' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 某位置的合法走法（排除将军、对脸、吃将）
CREATE OR REPLACE FUNCTION chess_valid_moves(board JSONB, r INT, c INT) RETURNS JSONB AS $$
DECLARE
  piece JSONB;
  side TEXT;
  raw JSONB;
  result JSONB := '[]'::JSONB;
  m JSONB;
  sim_board JSONB;
  target JSONB;
BEGIN
  piece := board->r->c;
  IF piece IS NULL OR jsonb_typeof(piece) = 'null' THEN RETURN result; END IF;
  side := piece->>'side';
  raw := chess_raw_moves(board, r, c);

  FOR m IN SELECT * FROM jsonb_array_elements(raw) LOOP
    target := board->(m->>'row')::INT->(m->>'col')::INT;
    -- 不允许吃将/帅
    IF target IS NOT NULL AND jsonb_typeof(target) <> 'null'
       AND target->>'type' = 'K' AND target->>'side' <> side THEN
      CONTINUE;
    END IF;

    sim_board := chess_apply_move(board, r, c, (m->>'row')::INT, (m->>'col')::INT);
    IF NOT chess_in_check(sim_board, side) AND NOT chess_kings_facing(sim_board) THEN
      result := result || jsonb_build_array(jsonb_build_object('row', (m->>'row')::INT, 'col', (m->>'col')::INT));
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 是否被将死
CREATE OR REPLACE FUNCTION chess_is_checkmated(board JSONB, side TEXT) RETURNS BOOLEAN AS $$
DECLARE
  r INT; c INT; piece JSONB; moves JSONB;
BEGIN
  IF NOT chess_in_check(board, side) THEN RETURN FALSE; END IF;
  FOR r IN 0..9 LOOP
    FOR c IN 0..8 LOOP
      piece := board->r->c;
      IF piece IS NOT NULL AND jsonb_typeof(piece) <> 'null' AND piece->>'side' = side THEN
        moves := chess_valid_moves(board, r, c);
        IF jsonb_array_length(moves) > 0 THEN RETURN FALSE; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================================
-- 走子 RPC：服务端校验 + 落库 + 胜负/超时结算
-- =====================================================================
CREATE OR REPLACE FUNCTION public.make_move(
  p_room_id UUID,
  p_from_row INT,
  p_from_col INT,
  p_to_row INT,
  p_to_col INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  actor UUID := auth.uid();
  actor_side TEXT;
  piece JSONB;
  target JSONB;
  valid_moves JSONB;
  is_valid BOOLEAN := FALSE;
  m JSONB;
  new_board JSONB;
  new_history JSONB;
  next_turn TEXT;
  in_check BOOLEAN;
  is_mate BOOLEAN;
  elapsed INT;
  increment INT;
  calc_red_time INT;
  calc_black_time INT;
  timed_out BOOLEAN := FALSE;
  win_side TEXT;
  result JSONB;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;

  IF r.status <> 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'error', '对局未在进行中');
  END IF;

  -- 只能操作自己参与的房间
  IF actor <> r.red_player AND actor <> r.black_player THEN
    RETURN jsonb_build_object('ok', false, 'error', '不是对局参与者');
  END IF;

  -- 轮次与走子方校验
  actor_side := CASE WHEN actor = r.red_player THEN 'red' ELSE 'black' END;
  IF actor_side <> r.current_turn THEN
    RETURN jsonb_build_object('ok', false, 'error', '未轮到你走棋');
  END IF;

  -- 起点棋子归属校验
  piece := r.board->p_from_row->p_from_col;
  IF piece IS NULL OR jsonb_typeof(piece) = 'null' THEN
    RETURN jsonb_build_object('ok', false, 'error', '起点无棋子');
  END IF;
  IF piece->>'side' <> actor_side THEN
    RETURN jsonb_build_object('ok', false, 'error', '只能移动自己的棋子');
  END IF;

  -- 走法合法性校验（服务端完整规则引擎）
  valid_moves := chess_valid_moves(r.board, p_from_row, p_from_col);
  FOR m IN SELECT * FROM jsonb_array_elements(valid_moves) LOOP
    IF (m->>'row')::INT = p_to_row AND (m->>'col')::INT = p_to_col THEN
      is_valid := TRUE;
      EXIT;
    END IF;
  END LOOP;
  IF NOT is_valid THEN
    RETURN jsonb_build_object('ok', false, 'error', '非法走法');
  END IF;

  -- 应用走子
  new_board := chess_apply_move(r.board, p_from_row, p_from_col, p_to_row, p_to_col);
  target := r.board->p_to_row->p_to_col;
  new_history := r.move_history || jsonb_build_array(jsonb_build_object(
    'from', jsonb_build_object('row', p_from_row, 'col', p_from_col),
    'to', jsonb_build_object('row', p_to_row, 'col', p_to_col),
    'piece', piece,
    'captured', CASE WHEN target IS NULL OR jsonb_typeof(target) = 'null' THEN NULL ELSE target END,
    'timestamp', (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  ));

  next_turn := CASE WHEN r.current_turn = 'red' THEN 'black' ELSE 'red' END;

  -- 时间计算：走子方扣除用时，下一步方加 increment
  increment := COALESCE((regexp_split_to_array(r.time_control, '\+'))[2]::INT, 0);
  elapsed := GREATEST(1, EXTRACT(EPOCH FROM (NOW() - r.last_move_at))::INT);

  IF r.current_turn = 'red' THEN
    calc_red_time := GREATEST(0, r.red_time - elapsed);
    calc_black_time := r.black_time;
  ELSE
    calc_black_time := GREATEST(0, r.black_time - elapsed);
    calc_red_time := r.red_time;
  END IF;

  -- 超时判定：走子方超时判负
  IF (r.current_turn = 'red' AND calc_red_time <= 0) OR (r.current_turn = 'black' AND calc_black_time <= 0) THEN
    timed_out := TRUE;
  END IF;

  -- 将军/将死判定
  in_check := chess_in_check(new_board, next_turn);
  is_mate := in_check AND chess_is_checkmated(new_board, next_turn);

  IF is_mate THEN
    win_side := r.current_turn;
  ELSIF timed_out THEN
    win_side := next_turn;
  ELSE
    win_side := NULL;
  END IF;

  UPDATE rooms
  SET board = new_board,
      move_history = new_history,
      current_turn = next_turn,
      -- Fischer 加时：走子方（current_turn 方）走完后给自己加 increment
      red_time = calc_red_time + CASE WHEN r.current_turn = 'red' THEN increment ELSE 0 END,
      black_time = calc_black_time + CASE WHEN r.current_turn = 'black' THEN increment ELSE 0 END,
      last_move_at = NOW(),
      status = CASE WHEN win_side IS NOT NULL THEN 'finished' ELSE status END,
      winner = win_side,
      result_reason = CASE WHEN win_side IS NOT NULL
                           THEN CASE WHEN is_mate THEN '将死' WHEN timed_out THEN '超时' END
                           ELSE NULL END
  WHERE id = p_room_id;

  -- 对局结束：写入对局记录并更新统计（房间状态已由上方 UPDATE 置为 finished）
  IF win_side IS NOT NULL THEN
    result := public.record_game_result(p_room_id, win_side,
                CASE WHEN is_mate THEN '将死' WHEN timed_out THEN '超时' END,
                new_history, r.red_player, r.black_player);
  END IF;

  RETURN jsonb_build_object('ok', true, 'winner', win_side, 'reason',
    CASE WHEN is_mate THEN '将死' WHEN timed_out THEN '超时' ELSE NULL END);
END;
$$;

-- 认输 RPC：只允许参与者本人认输（自动写对局记录与统计）
CREATE OR REPLACE FUNCTION public.resign_game(p_room_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  actor UUID := auth.uid();
  actor_side TEXT;
  winner TEXT;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;
  IF r.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true);
  END IF;

  actor_side := CASE WHEN actor = r.red_player THEN 'red' WHEN actor = r.black_player THEN 'black' END;
  IF actor_side IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '不是对局参与者');
  END IF;

  winner := CASE WHEN actor_side = 'red' THEN 'black' ELSE 'red' END;
  RETURN public.finish_game(p_room_id, winner, '认输');
END;
$$;

-- 超时 RPC：由服务端依据 last_move_at 计算，防止客户端伪造
CREATE OR REPLACE FUNCTION public.timeout_game(p_room_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  actor UUID := auth.uid();
  actor_side TEXT;
  elapsed INT;
  loser TEXT;
  winner TEXT;
  red_time INT;
  black_time INT;
BEGIN
  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;
  IF r.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true);
  END IF;

  actor_side := CASE WHEN actor = r.red_player THEN 'red' WHEN actor = r.black_player THEN 'black' END;
  IF actor_side IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '不是对局参与者');
  END IF;

  -- 服务端根据 last_move_at 计算当前方是否超时
  elapsed := EXTRACT(EPOCH FROM (NOW() - r.last_move_at))::INT;
  IF r.current_turn = 'red' THEN
    red_time := GREATEST(0, r.red_time - elapsed);
    IF red_time <= 0 THEN loser := 'red'; END IF;
  ELSE
    black_time := GREATEST(0, r.black_time - elapsed);
    IF black_time <= 0 THEN loser := 'black'; END IF;
  END IF;

  IF loser IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '尚未超时');
  END IF;

  winner := CASE WHEN loser = 'red' THEN 'black' ELSE 'red' END;
  RETURN public.finish_game(p_room_id, winner, '超时');
END;
$$;

-- 加入房间 RPC：校验房间状态/座位空余后加入，双方到齐自动开战
CREATE OR REPLACE FUNCTION public.join_room(p_room_id UUID, p_side TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  actor UUID := auth.uid();
  field TEXT;
BEGIN
  IF p_side NOT IN ('red', 'black') THEN
    RETURN jsonb_build_object('ok', false, 'error', '非法阵营');
  END IF;

  SELECT * INTO r FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不存在');
  END IF;

  -- 自己已经是某一方则直接成功（刷新/重进房间场景）
  IF r.red_player = actor OR r.black_player = actor THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- 已结束或对局中的房间不允许新玩家加入（对局中仅可观战）
  IF r.status <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间不在等待状态');
  END IF;

  field := CASE WHEN p_side = 'red' THEN 'red_player' ELSE 'black_player' END;

  -- 房间已满则拒绝
  IF r.red_player IS NOT NULL AND r.black_player IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '房间已满');
  END IF;

  -- 校验目标座位为空
  IF (p_side = 'red' AND r.red_player IS NOT NULL)
     OR (p_side = 'black' AND r.black_player IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', '该座位已被占用');
  END IF;

  -- 更新座位；双方到齐则开始对局并重置计时
  IF p_side = 'red' THEN
    UPDATE rooms SET red_player = actor,
      status = CASE WHEN black_player IS NOT NULL THEN 'playing' ELSE status END,
      last_move_at = CASE WHEN black_player IS NOT NULL THEN NOW() ELSE last_move_at END
      WHERE id = p_room_id;
  ELSE
    UPDATE rooms SET black_player = actor,
      status = CASE WHEN red_player IS NOT NULL THEN 'playing' ELSE status END,
      last_move_at = CASE WHEN red_player IS NOT NULL THEN NOW() ELSE last_move_at END
      WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 授权：允许已登录用户调用 RPC（匿名角色不可用）
GRANT EXECUTE ON FUNCTION public.make_move(UUID, INT, INT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resign_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timeout_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(UUID, TEXT) TO authenticated;

-- 数据表访问授权（Supabase 默认已授，显式声明以增强可移植性）
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated;
GRANT SELECT, INSERT ON TABLE public.chat_messages TO authenticated;
GRANT SELECT ON TABLE public.game_records TO authenticated;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT SELECT ON TABLE public.rooms TO anon;
GRANT SELECT ON TABLE public.chat_messages TO anon;
GRANT SELECT ON TABLE public.game_records TO anon;

-- =====================================================================
-- 初始化棋盘数据的函数
-- =====================================================================
CREATE OR REPLACE FUNCTION public.init_chess_board()
RETURNS JSONB AS $$
DECLARE
  board JSONB := '[]'::JSONB;
  row_data JSONB;
BEGIN
  -- 初始化空棋盘
  FOR i IN 0..9 LOOP
    row_data := '[null, null, null, null, null, null, null, null, null]'::JSONB;
    board := board || jsonb_build_array(row_data);
  END LOOP;
  
  -- 设置黑方棋子
  board := jsonb_set(board, '{0,0}', '{"type": "R", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,1}', '{"type": "N", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,2}', '{"type": "B", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,3}', '{"type": "A", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,4}', '{"type": "K", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,5}', '{"type": "A", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,6}', '{"type": "B", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,7}', '{"type": "N", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{0,8}', '{"type": "R", "side": "black"}'::JSONB);
  
  board := jsonb_set(board, '{2,1}', '{"type": "C", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{2,7}', '{"type": "C", "side": "black"}'::JSONB);
  
  board := jsonb_set(board, '{3,0}', '{"type": "P", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{3,2}', '{"type": "P", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{3,4}', '{"type": "P", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{3,6}', '{"type": "P", "side": "black"}'::JSONB);
  board := jsonb_set(board, '{3,8}', '{"type": "P", "side": "black"}'::JSONB);
  
  -- 设置红方棋子
  board := jsonb_set(board, '{9,0}', '{"type": "R", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,1}', '{"type": "N", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,2}', '{"type": "B", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,3}', '{"type": "A", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,4}', '{"type": "K", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,5}', '{"type": "A", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,6}', '{"type": "B", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,7}', '{"type": "N", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{9,8}', '{"type": "R", "side": "red"}'::JSONB);
  
  board := jsonb_set(board, '{7,1}', '{"type": "C", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{7,7}', '{"type": "C", "side": "red"}'::JSONB);
  
  board := jsonb_set(board, '{6,0}', '{"type": "P", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{6,2}', '{"type": "P", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{6,4}', '{"type": "P", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{6,6}', '{"type": "P", "side": "red"}'::JSONB);
  board := jsonb_set(board, '{6,8}', '{"type": "P", "side": "red"}'::JSONB);
  
  RETURN board;
END;
$$ LANGUAGE plpgsql;

-- 初始化棋盘函数授权（创建房间时前端使用）
GRANT EXECUTE ON FUNCTION public.init_chess_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.init_chess_board() TO anon;

-- =====================================================================
-- 房间自动清理：根据创建时间 + 时间控制时长自动清空过期房间，释放数据与资源
-- =====================================================================

-- 清理过期房间函数：
-- 1. waiting 房间：超过 10 分钟无玩家加入则清理
-- 2. playing 房间：超过对应时间控制时长后自动清理
-- 3. finished 房间：超过 10 分钟自动清理（保留短暂结果展示）
-- 返回被清理的房间数量
CREATE OR REPLACE FUNCTION public.cleanup_stale_rooms()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned INTEGER := 0;
BEGIN
  -- 等待中的房间：创建后超过 10 分钟仍无人加入，直接清理
  DELETE FROM rooms
  WHERE status = 'waiting'
    AND created_at < NOW() - INTERVAL '10 minutes'
    AND (red_player IS NULL OR black_player IS NULL);
  cleaned := cleaned + ROW_COUNT;

  -- 对弈中的房间：从创建时间起超过对应时间控制时长自动清理
  DELETE FROM rooms
  WHERE status = 'playing'
    AND created_at < NOW() - (
      COALESCE((regexp_split_to_array(time_control, '\+'))[1]::INT, 10) * INTERVAL '1 minute'
    );
  cleaned := cleaned + ROW_COUNT;

  -- 已结束的房间：结束后超过 10 分钟自动清理
  DELETE FROM rooms
  WHERE status = 'finished'
    AND updated_at < NOW() - INTERVAL '10 minutes';
  cleaned := cleaned + ROW_COUNT;

  RETURN cleaned;
END;
$$;

-- 授权已登录用户调用（前端大厅加载时可即时触发清理）
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rooms() TO authenticated;

-- 注册到 pg_cron 定时任务（可选）：每分钟执行一次。
-- 若项目未启用 pg_cron 扩展，则跳过定时任务（由前端进入大厅时的 RPC 清理兑底）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'xiangqi-cleanup-stale-rooms') THEN
      PERFORM cron.unschedule('xiangqi-cleanup-stale-rooms');
    END IF;
    PERFORM cron.schedule('xiangqi-cleanup-stale-rooms', '* * * * *', 'SELECT public.cleanup_stale_rooms()');
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron 未启用，忽略（由前端 RPC 触发清理兑底）
  NULL;
END;
$$;
