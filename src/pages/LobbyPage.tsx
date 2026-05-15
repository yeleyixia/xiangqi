import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Plus } from 'lucide-react';
import { useLobbyStore, useAuthStore } from '../store';
import { CreateRoomModal } from '../components/CreateRoomModal';
import type { RoomStatus } from '../types';
import { supabase } from '../lib/supabase';

export const LobbyPage: React.FC = () => {
  const { rooms, fetchRooms, isLoading, onlineCount } = useLobbyStore();
  const { user } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  useEffect(() => {
    fetchRooms();
    
    // 订阅房间更新
    const channel = supabase
      .channel('lobby')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms'
      }, () => {
        fetchRooms();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  const paginatedRooms = rooms.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(rooms.length / pageSize);
  
  const getStatusLabel = (status: RoomStatus) => {
    switch (status) {
      case 'waiting': return '等待中';
      case 'playing': return '对弈中';
      case 'finished': return '已结束';
    }
  };
  
  return (
    <>
      <div className="bg-pattern"></div>
      
      <main className="lobby-main">
        <div className="lobby-header">
          <h1>游戏大厅</h1>
          <div className="lobby-actions">
            <button 
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} />
              创建新桌
            </button>
            <button 
              className="btn btn-outline"
              onClick={fetchRooms}
              disabled={isLoading}
            >
              <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
              刷新列表
            </button>
          </div>
        </div>
        
        <div className="lobby-layout">
          <div className="lobby-rooms">
            <div className="lobby-section-title">
              <span>🎮 对弈房间</span>
              <span className="room-count">共 {rooms.length} 桌</span>
            </div>
            
            <div className="room-table lobby-table">
              <div className="room-header">
                <span className="room-col-id">房间</span>
                <span className="room-col-time">时间</span>
                <span className="room-col-red">红方</span>
                <span className="room-col-black">黑方</span>
                <span className="room-col-state">状态</span>
                <span className="room-col-action">操作</span>
              </div>
              
              {isLoading ? (
                <div className="loading">
                  <div className="loading-spinner"></div>
                  <div className="loading-text">加载中...</div>
                </div>
              ) : paginatedRooms.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🏠</div>
                  <div className="empty-title">暂无房间</div>
                  <div className="empty-desc">快去创建一个房间吧！</div>
                </div>
              ) : (
                paginatedRooms.map(room => (
                  <div key={room.id} className="room-row">
                    <span className="room-col-id">#{room.id.slice(-3)}</span>
                    <span className="room-col-time">{room.time_control}</span>
                    <span className="room-col-red">
                      {room.red_player ? '玩家' : '—'}
                    </span>
                    <span className="room-col-black">
                      {room.black_player ? '玩家' : '—'}
                    </span>
                    <span className="room-col-state">
                      <span className={`status-dot ${room.status}`}></span>
                      {getStatusLabel(room.status)}
                    </span>
                    <span className="room-col-action">
                      <Link 
                        to={`/game/${room.id}`} 
                        className={`btn btn-xs ${room.status === 'waiting' ? 'btn-primary' : 'btn-outline'}`}
                      >
                        {room.status === 'waiting' ? '加入' : '观战'}
                      </Link>
                    </span>
                  </div>
                ))
              )}
            </div>
            
            {totalPages > 1 && (
              <div className="room-pagination">
                <button 
                  className="btn btn-outline btn-xs"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  上一页
                </button>
                <span className="page-info">第 {page} / {totalPages} 页</span>
                <button 
                  className="btn btn-outline btn-xs"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
          
          <div className="lobby-sidebar">
            <div className="sidebar-section">
              <div className="lobby-section-title">👥 在线玩家</div>
              <div className="player-list">
                {user && (
                  <div className="player-item">
                    <span className="status-dot waiting"></span>
                    {user.username}
                    <span className="player-rating">{user.rating}</span>
                  </div>
                )}
                {/* 这里可以添加实时在线玩家列表 */}
              </div>
            </div>
            
            <div className="sidebar-section">
              <div className="lobby-section-title">📊 服务器信息</div>
              <div className="server-info">
                <div className="info-row">
                  <span>在线人数</span>
                  <span>{onlineCount.toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span>对弈桌数</span>
                  <span>{rooms.filter(r => r.status === 'playing').length}</span>
                </div>
                <div className="info-row">
                  <span>等待中</span>
                  <span>{rooms.filter(r => r.status === 'waiting').length}</span>
                </div>
                <div className="info-row">
                  <span>服务器状态</span>
                  <span className="text-green">正常</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand">中国象棋在线对弈平台</span>
            <span className="footer-copy">© 2026 版权所有 · 以棋会友 乐在棋中</span>
          </div>
        </div>
      </footer>
      
      {showCreateModal && <CreateRoomModal onClose={() => setShowCreateModal(false)} />}
    </>
  );
};
