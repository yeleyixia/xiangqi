import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, LogOut, LogIn } from 'lucide-react';
import { useAuthStore, useLobbyStore } from '../store';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { user, isGuest, logout } = useAuthStore();
  const { onlineCount } = useLobbyStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link to="/" className="logo">
          <span className="logo-text">中国象棋</span>
        </Link>
        
        <div className="nav-links">
          <Link to="/" className={isActive('/') ? 'active' : ''}>首页</Link>
          <Link to="/lobby" className={isActive('/lobby') ? 'active' : ''}>游戏大厅</Link>
          <Link to="/game" className={isActive('/game') ? 'active' : ''}>快速对弈</Link>
        </div>
        
        <div className="nav-right">
          <span className="online-count">
            <span className="pulse-dot"></span>
            <span>{onlineCount.toLocaleString()}</span> 人在线
          </span>
          
          {user ? (
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <User size={16} />
                <span>{user.username}</span>
                <span style={{ color: 'var(--gold-dim)', fontSize: '12px' }}>{user.rating}</span>
              </button>
              
              {showUserMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '8px',
                  minWidth: '150px',
                  zIndex: 100
                }}>
                  <Link 
                    to="/profile" 
                    className="btn btn-outline btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => setShowUserMenu(false)}
                  >
                    个人中心
                  </Link>
                  <button 
                    className="btn btn-outline btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', marginTop: '4px', color: 'var(--red-bright)' }}
                    onClick={() => { logout(); setShowUserMenu(false); }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : isGuest ? (
            <Link to="/auth" className="btn btn-primary btn-sm">
              <LogIn size={16} />
              登录/注册
            </Link>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-sm">
              <LogIn size={16} />
              登录/注册
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};
