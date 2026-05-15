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

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onClose }) => {
  const [name, setName] = useState('');
  const [timeControl, setTimeControl] = useState<TimeControl>('10+0');
  const [loading, setLoading] = useState(false);
  
  const { user, isGuest } = useAuthStore();
  const { createRoom } = useLobbyStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  
  const handleCreate = async () => {
    if (!user && !isGuest) {
      addToast('请先登录', 'error');
      return;
    }
    
    if (!name.trim()) {
      addToast('请输入房间名称', 'error');
      return;
    }
    
    setLoading(true);
    const room = await createRoom(name.trim(), timeControl);
    setLoading(false);
    
    if (room) {
      addToast('房间创建成功！', 'success');
      onClose();
      navigate(`/game/${room.id}`);
    } else {
      addToast('创建失败，请重试', 'error');
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
          <p className="modal-subtitle">设置房间名称和时间控制</p>
        </div>
        
        <div className="form-group">
          <label className="form-label">房间名称</label>
          <input
            type="text"
            className="form-input"
            placeholder="例如：高手过招"
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
