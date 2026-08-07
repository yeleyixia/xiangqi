import React, { useState } from 'react';
import { X } from 'lucide-react';
import { TimeControl } from '../types';
import { useAuthStore, useLobbyStore, useToastStore } from '../store';
import { useNavigate } from 'react-router-dom';

interface CreateRoomModalProps {
  onClose: () => void;
}

const TIME_OPTIONS: { value: TimeControl; label: string; desc: string }[] = [
  { value: '3+0', label: '3分钟', desc: '快棋' },
  { value: '5+0', label: '5分钟', desc: '快棋' },
  { value: '5+3', label: '5分+3秒', desc: '快棋' },
  { value: '10+0', label: '10分钟', desc: '标准' },
  { value: '10+5', label: '10分+5秒', desc: '标准' },
  { value: '15+0', label: '15分钟', desc: '标准' },
  { value: '30+0', label: '30分钟', desc: '慢棋' },
];

const generateRoomName = () => {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  const number = Math.floor(Math.random() * 99) + 1; // 1-99
  return `${letter}${number}`;
};

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onClose }) => {
  const [name, setName] = useState(generateRoomName);
  const [timeControl, setTimeControl] = useState<TimeControl>('10+0');
  const [loading, setLoading] = useState(false);
  
  const { user, isGuest } = useAuthStore();
  const { createRoom } = useLobbyStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  
  const handleCreate = async () => {
    if (!user) {
      addToast(isGuest ? '游客无法创建房间，请登录或注册账号' : '请先登录', 'error');
      return;
    }
    
    const roomName = name.trim() || generateRoomName();
    
    setLoading(true);
    const { room, error } = await createRoom(roomName, timeControl);
    setLoading(false);
    
    if (room) {
      addToast('房间创建成功！', 'success');
      onClose();
      navigate(`/game/${room.id}`);
    } else {
      const msg = error?.message || '创建失败，请稍后重试';
      addToast(msg, 'error');
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">创建房间</h2>
          <p className="modal-subtitle">已为您随机生成房间名称，可直接创建</p>
        </div>
        
        <div className="form-group">
          <label className="form-label">房间名称</label>
          <input
            type="text"
            className="form-input"
            placeholder="随机生成，可直接使用"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={20}
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">时间控制</label>
          <div className="time-options">
            {TIME_OPTIONS.map(opt => (
              <div
                key={opt.value}
                className={`time-option ${timeControl === opt.value ? 'selected' : ''}`}
                onClick={() => setTimeControl(opt.value)}
              >
                <div className="time-option-label">{opt.label}</div>
                <div className="time-option-desc">{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>
        
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: '16px' }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '创建中...' : '创建房间'}
        </button>
      </div>
    </div>
  );
};
