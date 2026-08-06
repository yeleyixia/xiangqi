import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/Toast';
import { HomePage } from './pages/HomePage';
const LobbyPage = lazy(() => import('./pages/LobbyPage').then(m => ({ default: m.LobbyPage })));
const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
import { useAuthStore } from './store';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { useOnlinePresence } from './hooks/useOnlinePresence';

const App: React.FC = () => {
  const { setUser, setLoading, setGuest, fetchProfile } = useAuthStore();
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
        // 统一复用 fetchProfile
        const profile = await fetchProfile(session.user.id);
        if (!profile) {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
      
      setInitialized(true);
      
      // 监听认证状态变化
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await fetchProfile(session.user.id);
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
        <Suspense fallback={<div className="loading"><div className="loading-spinner"></div><div className="loading-text">加载中...</div></div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/game/:roomId" element={<GamePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
};

export default App;
