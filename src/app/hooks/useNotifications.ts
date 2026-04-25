import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface AppNotification {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  service: string;
  value: number;
  timestamp: string;
  read: boolean;
}

export function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Shown when no VPS is configured or backend is unreachable
const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'mock-cpu-1',
    type: 'critical',
    title: 'High CPU Usage',
    message: 'CPU spiked to 94.5% on nginx-proxy',
    service: 'nginx-proxy',
    value: 94.5,
    timestamp: new Date(Date.now() - 2 * 60_000).toISOString(),
    read: false,
  },
  {
    id: 'mock-mem-2',
    type: 'warning',
    title: 'Memory Warning',
    message: 'Memory at 87% on app-backend — approaching limit',
    service: 'app-backend',
    value: 87,
    timestamp: new Date(Date.now() - 8 * 60_000).toISOString(),
    read: false,
  },
  {
    id: 'mock-info-3',
    type: 'info',
    title: 'Deploy Completed',
    message: 'New deployment succeeded on production environment',
    service: 'production',
    value: 0,
    timestamp: new Date(Date.now() - 45 * 60_000).toISOString(),
    read: false,
  },
];

export function useNotifications(environment: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!environment) {
      // No VPS selected — show mock data so the UI is functional and testable
      setNotifications(MOCK_NOTIFICATIONS.map(n => ({ ...n })));
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/api/alerts/${environment}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();

      const incoming: AppNotification[] = (data.alerts ?? []).map((a: {
        id: string; type: string; title: string; message: string;
        container: string; value?: number; timestamp: string;
      }) => ({
        id:        a.id,
        type:      a.type as AppNotification['type'],
        title:     a.title,
        message:   a.message,
        service:   a.container,
        value:     a.value ?? 0,
        timestamp: a.timestamp,
        read:      false,
      }));

      setNotifications(prev => {
        // Preserve read state for already-seen notifications
        const readMap = new Map(prev.map(n => [n.id, n.read]));
        return incoming.map(n => ({ ...n, read: readMap.get(n.id) ?? false }));
      });
    } catch {
      // On error keep existing list; if empty fall back to mock
      setNotifications(prev =>
        prev.length > 0 ? prev : MOCK_NOTIFICATIONS.map(n => ({ ...n }))
      );
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(() => fetchNotifications(true), 30_000);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markOneRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAllRead, markOneRead };
}
