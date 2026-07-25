import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/Toast';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { AuthPage } from './pages/AuthPage';
import { useAuthStore } from './store';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { useOnlinePresence } from './hooks/useOnlinePresence';

const App: React.FC = () => {
  const { setUser, setLoading, setGuest } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  
  useOnlinePresence();
  
  useEffect(() => {
    // 初始化认证状态
    const initAuth = async () => {
      if (!isSupabaseConfigured()) {
        // Supabase 未配置，使用本地模式
        setGuest(true);
        setInitialized(true);
        return;
      }
      
      // 检查当前会话
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // 获取用户资料
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        setUser(profile);
      } else {
        setLoading(false);
      }
      
      setInitialized(true);
      
      // 监听认证状态变化
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          setUser(profile);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
      
      return () => {
        subscription.unsubscribe();
      };
    };
    
    initAuth();
  }, []);
  
  if (!initialized) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="loading-spinner"></div>
        <div className="loading-text">加载中...</div>
      </div>
    );
  }
  
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/game/:roomId" element={<GamePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
};

export default App;
