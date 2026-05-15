-- 中国象棋在线对弈平台数据库初始化脚本
-- 在 Supabase SQL Editor 中运行此脚本

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
  CONSTRAINT valid_winner CHECK (winner IS NULL OR winner IN ('red', 'black'))
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

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS 策略

-- profiles 表
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- rooms 表
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rooms are viewable by everyone"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update their rooms"
  ON rooms FOR UPDATE
  USING (
    auth.uid() = red_player OR 
    auth.uid() = black_player OR 
    auth.uid() IS NOT NULL
  );

-- chat_messages 表
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat messages are viewable by everyone"
  ON chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- game_records 表
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game records are viewable by everyone"
  ON game_records FOR SELECT
  USING (true);

CREATE POLICY "System can insert game records"
  ON game_records FOR INSERT
  WITH CHECK (true);

-- 实时订阅
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 创建新用户时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', '玩家' || LEFT(NEW.id::text, 6))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 初始化棋盘数据的函数
CREATE OR REPLACE FUNCTION init_chess_board()
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
