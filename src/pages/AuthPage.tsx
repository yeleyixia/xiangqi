import React, { useState } from 'react';
import { AuthModal } from '../components/AuthModal';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  return (
    <>
      <div className="bg-pattern"></div>
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <AuthModal 
          onClose={() => window.history.back()} 
          initialMode={mode}
        />
      </div>
    </>
  );
};
