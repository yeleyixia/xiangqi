import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuthStore } from '../store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface GameRecordRow {
  id: string;
  room_id: string;
  red_player: string | null;
  black_player: string | null;
  winner: string | null;
  result_reason: string | null;
  move_history: unknown[];
  time_control: string;
  created_at: string;
}

export const ProfilePage: React.FC = () => {
  const { user, isGuest, fetchProfile } = useAuthStore();
  const [records, setRecords] = useState<GameRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    // 拉取对局记录
    const loadRecords = async () => {
      const { data, error } = await supabase
        .from('game_records')
        .select('*')
        .or(`red_player.eq.${user.id},black_player.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) {
        setError('对局记录加载失败');
      } else if (data) {
        setRecords(data as GameRecordRow[]);
      }
      setLoading(false);
    };
    
    loadRecords();
  }, [user?.id]);
  
  if (isGuest || !isSupabaseConfigured()) {
    return (
      <>
        <div className="bg-pattern"></div>
        <main className="lobby-main">
          <div className="empty-state" style={{ minHeight: '60vh' }}>
            <div className="empty-icon">👤</div>
            <div className="empty-title">游客模式</div>
            <div className="empty-desc">登录后可查看个人资料与对局记录</div>
            <Link to="/auth" className="btn btn-primary">登录/注册</Link>
          </div>
        </main>
      </>
    );
  }
  
  if (!user) {
    return (
      <>
        <div className="bg-pattern"></div>
        <main className="lobby-main">
          <div className="empty-state" style={{ minHeight: '60vh' }}>
            <div className="empty-icon">👤</div>
            <div className="empty-title">请先登录</div>
            <div className="empty-desc">登录后查看个人资料</div>
            <Link to="/auth" className="btn btn-primary">登录/注册</Link>
          </div>
        </main>
      </>
    );
  }
  
  return (
    <>
      <div className="bg-pattern"></div>
      <main className="lobby-main">
        <div className="lobby-header">
          <h1>个人中心</h1>
        </div>
        
        <div className="lobby-layout">
          <div className="lobby-rooms">
            <div className="sidebar-section">
              <div className="lobby-section-title">
                <span>👤 基本信息</span>
              </div>
              <div className="server-info">
                <div className="info-row">
                  <span>用户名</span>
                  <span>{user.username}</span>
                </div>
                <div className="info-row">
                  <span>等级分</span>
                  <span style={{ color: 'var(--gold)' }}>{user.rating}</span>
                </div>
                <div className="info-row">
                  <span>胜 / 负 / 和</span>
                  <span>{user.wins} / {user.losses} / {user.draws}</span>
                </div>
                <div className="info-row">
                  <span>注册时间</span>
                  <span>{new Date(user.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
            
            <div className="sidebar-section">
              <div className="lobby-section-title">
                <span>📋 对局记录</span>
              </div>
              
              {loading ? (
                <div className="loading">
                  <div className="loading-spinner"></div>
                  <div className="loading-text">加载中...</div>
                </div>
              ) : error ? (
                <div className="empty-state">
                  <div className="empty-desc">{error}</div>
                </div>
              ) : records.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">♟</div>
                  <div className="empty-desc">暂无对局记录，快去下一盘吧！</div>
                </div>
              ) : (
                <div className="room-table">
                  <div className="room-header" style={{ gridTemplateColumns: '1fr 80px 80px 90px 100px' }}>
                    <span>时间</span>
                    <span>时间制</span>
                    <span>红方</span>
                    <span>黑方</span>
                    <span>结果</span>
                  </div>
                  {records.map(r => {
                    const redWin = r.winner === 'red';
                    const blackWin = r.winner === 'black';
                    return (
                      <div key={r.id} className="room-row" style={{ gridTemplateColumns: '1fr 80px 80px 90px 100px' }}>
                        <span className="room-col-id">
                          <span className="room-name" style={{ fontSize: '12px' }}>
                            {new Date(r.created_at).toLocaleString('zh-CN')}
                          </span>
                          <small className="room-id-small">#{r.room_id.slice(-4)}</small>
                        </span>
                        <span className="room-col-time">{r.time_control}</span>
                        <span className="room-col-red">
                          <span style={{ color: redWin ? 'var(--gold)' : undefined }}>
                            {redWin ? '胜' : r.winner ? '负' : '—'}
                          </span>
                        </span>
                        <span className="room-col-black">
                          <span style={{ color: blackWin ? 'var(--gold)' : undefined }}>
                            {blackWin ? '胜' : r.winner ? '负' : '—'}
                          </span>
                        </span>
                        <span className="room-col-state">
                          {r.winner ? `${r.winner === 'red' ? '红' : '黑'}胜${r.result_reason ? `（${r.result_reason}）` : ''}` : '和棋'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default ProfilePage;
