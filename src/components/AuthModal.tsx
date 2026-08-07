import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore, useToastStore } from '../store';

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
  
  const { setUser } = useAuthStore();
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
      // 获取用户资料
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      
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
      // 创建用户资料
      const { data: profile } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          username,
          rating: 1500,
          wins: 0,
          losses: 0,
          draws: 0
        })
        .select()
        .single();
      
      setUser(profile);
      addToast('注册成功！', 'success');
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
