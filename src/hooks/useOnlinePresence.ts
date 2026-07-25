import { useEffect, useRef } from 'react';
import { useLobbyStore } from '../store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const PRESENCE_CHANNEL = 'online-users';
const STORAGE_KEY = 'xiangqi_online_tabs';
const HEARTBEAT_INTERVAL = 5000;
const TAB_TIMEOUT = 10000;

function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getClientId(): string {
  let id = sessionStorage.getItem('xiangqi_client_id');
  if (!id) {
    id = generateClientId();
    sessionStorage.setItem('xiangqi_client_id', id);
  }
  return id;
}

function countLocalTabs(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tabs: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const active: Record<string, number> = {};
    Object.entries(tabs).forEach(([key, ts]) => {
      if (now - ts < TAB_TIMEOUT) {
        active[key] = ts;
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    return Object.keys(active).length;
  } catch {
    return 1;
  }
}

function registerTab(clientId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tabs: Record<string, number> = raw ? JSON.parse(raw) : {};
    tabs[clientId] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore
  }
}

function unregisterTab(clientId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tabs: Record<string, number> = raw ? JSON.parse(raw) : {};
    delete tabs[clientId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore
  }
}

export function useOnlinePresence() {
  const { setOnlineCount } = useLobbyStore();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      const clientId = getClientId();
      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: {
          presence: {
            key: clientId,
          },
        },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const count = Object.keys(state).length;
          setOnlineCount(count);
        })
        .on('presence', { event: 'join' }, () => {
          const state = channel.presenceState();
          const count = Object.keys(state).length;
          setOnlineCount(count);
        })
        .on('presence', { event: 'leave' }, () => {
          const state = channel.presenceState();
          const count = Object.keys(state).length;
          setOnlineCount(count);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      cleanupRef.current = () => {
        channel.untrack();
        supabase.removeChannel(channel);
      };
    } else {
      // 本地模式：统计当前浏览器内活跃标签页数量
      const clientId = getClientId();
      registerTab(clientId);
      setOnlineCount(countLocalTabs());

      const heartbeat = setInterval(() => {
        registerTab(clientId);
        setOnlineCount(countLocalTabs());
      }, HEARTBEAT_INTERVAL);

      const handleStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) {
          setOnlineCount(countLocalTabs());
        }
      };

      window.addEventListener('storage', handleStorage);
      window.addEventListener('beforeunload', () => unregisterTab(clientId));

      cleanupRef.current = () => {
        clearInterval(heartbeat);
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('beforeunload', () => unregisterTab(clientId));
        unregisterTab(clientId);
      };
    }

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [setOnlineCount]);
}
