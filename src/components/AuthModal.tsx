import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore, useToastStore } from '../store';
import type { UserProfile } from '../types';

interface AuthModalProps {
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { setUser, fetchProfile } = useAuthStore();
  const { addToast } = useToastStore();
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    
    if (data.user) {
      // 获取用户资料（注册时由数据库触发器 handle_new_user 自动创建）
      const profile = await fetchProfile(data.user.id);
      if (!profile) {
        setError('用户资料加载失败，请刷新重试');
        setLoading(false);
        return;
      }
      
      setUser(profile);
      addToast('登录成功！', 'success');
      onClose();
    }
    
    setLoading(false);
  };
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (password.length < 6) {
      setError('密码至少6位');
      setLoading(false);
      return;
    }
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });
    
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    
    if (data.user) {
      // profile 由数据库触发器 handle_new_user 自动创建，这里不再重复 insert
      // 触发器创建可能异步完成，稍等后拉取
      let profile: UserProfile | null = null;
      for (let i = 0; i < 5; i++) {
        profile = await fetchProfile(data.user.id);
        if (profile) break;
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (!profile) {
        setError('注册成功，但资料初始化失败，请重新登录');
        setLoading(false);
        return;
      }
      
      setUser(profile);
      addToast('注册成功！', 'success');
      onClose();
    } else {
      // 部分邮箱需验证后才可登录
      addToast('注册成功！请前往邮箱验证', 'success');
      onClose();
    }
    
    setLoading(false);
  };
  
  const handleGuestLogin = () => {
    useAuthStore.getState().setGuest(true);
    addToast('以游客身份进入', 'success');
    onClose();
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <p className="modal-subtitle">
            {mode === 'login' ? '登录后开始对弈' : '创建账号，与天下棋友切磋'}
          </p>
        </div>
        
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">用户名</label>
              <input
                type="text"
                className="form-input"
                placeholder="请输入用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                minLength={2}
                maxLength={20}
              />
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label">邮箱</label>
            <input
              type="email"
              className="form-input"
              placeholder="请输入邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              type="password"
              className="form-input"
              placeholder="请输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          {error && <div className="form-error">{error}</div>}
          
          <button 
            type="submit" 
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '16px' }}
            disabled={loading}
          >
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>
        
        <div className="form-footer" style={{ marginTop: '16px' }}>
          <button 
            className="form-link"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录'}
          </button>
        </div>
        
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button className="btn btn-outline" onClick={handleGuestLogin}>
            游客进入
          </button>
        </div>
      </div>
    </div>
  );
};
