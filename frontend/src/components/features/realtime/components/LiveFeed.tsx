import { useEffect, useRef, useState } from 'react';
import { Activity, Wifi, WifiOff, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../../../../lib/api';

interface LiveFeedItem {
  emp_code: string;
  machine: string;
  time: string;
  status?: string;
}

interface LiveFeedProps {
  autoConnect?: boolean;
  maxItems?: number;
  onNewItem?: (item: LiveFeedItem) => void;
}

interface FeedStats {
  last_10_minutes: number;
  last_30_minutes: number;
  last_1_hour: number;
  by_machine: Array<{ machine_code: string; count: number }>;
}

export function LiveFeed({ autoConnect = true, maxItems = 50, onNewItem }: LiveFeedProps) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveFeedItem[]>([]);
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback: Polling fetch for latest scans
  const fetchLatestScans = async () => {
    try {
      const response = await api<{
        success: boolean;
        data: { count: number; latestId: number; scans: any[] };
      }>('/api/realtime/latest-scans');

      if (response.success && response.data?.scans) {
        const newItems: LiveFeedItem[] = response.data.scans.map((scan) => ({
          emp_code: scan.parsed_employee_code || scan.raw_device_user_id,
          machine: scan.machine_code,
          time: scan.scan_time,
          status: scan.mapping_status === 'MAPPED' ? 'mapped' : 'unmapped',
        }));

        setEvents((prev) => {
          const combined = [...newItems, ...prev];
          const unique = combined.filter(
            (item, index, self) =>
              index === self.findIndex((t) => t.emp_code === item.emp_code && t.time === item.time)
          );
          return unique.slice(0, maxItems);
        });

        setStats({
          last_10_minutes: response.data.count,
          last_30_minutes: response.data.count,
          last_1_hour: response.data.count,
          by_machine: [],
        });
      }
    } catch (err) {
      console.error('[LiveFeed] Polling fetch failed:', err);
    }
  };

  // SSE connection
  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/realtime/live-feed');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (e) => {
      console.log('[LiveFeed] SSE connected:', e.data);
      setConnected(true);
      setError(null);
      try {
        const data = JSON.parse(e.data);
        if (data.stats) setStats(data.stats);
      } catch {}
    });

    eventSource.addEventListener('attendance.new', (e) => {
      try {
        const item = JSON.parse(e.data) as LiveFeedItem;
        setEvents((prev) => [item, ...prev].slice(0, maxItems));
        onNewItem?.(item);
      } catch {}
    });

    eventSource.addEventListener('ping', () => {
      // Keep-alive received
    });

    eventSource.onerror = (e) => {
      console.error('[LiveFeed] SSE error:', e);
      setConnected(false);
      eventSource.close();
      // Fallback to polling
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(fetchLatestScans, 5000);
      }
    };

    eventSource.onopen = () => {
      setConnected(true);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  };

  useEffect(() => {
    if (autoConnect) {
      connectSSE();
      // Initial fetch
      fetchLatestScans();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [autoConnect]);

  const formatTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const getStatusIcon = (status?: string) => {
    if (status === 'mapped') {
      return <CheckCircle size={12} className="feed-item-icon mapped" />;
    }
    return <AlertCircle size={12} className="feed-item-icon unmapped" />;
  };

  return (
    <div className="live-feed">
      <div className="live-feed-header">
        <div className="live-feed-status">
          {connected ? (
            <>
              <Wifi size={14} className="status-icon connected" />
              <span className="status-text connected">Live</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="status-icon disconnected" />
              <span className="status-text disconnected">Polling</span>
            </>
          )}
        </div>
        {stats && (
          <div className="live-feed-stats">
            <span className="stat-item">
              <Activity size={12} />
              {stats.last_10_minutes} scan/10m
            </span>
            <span className="stat-item">
              <Clock size={12} />
              {stats.last_1_hour} scan/j
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="live-feed-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="live-feed-list">
        {events.length === 0 ? (
          <div className="live-feed-empty">
            <Activity size={24} />
            <p>Menunggu data scan...</p>
          </div>
        ) : (
          events.map((item, index) => (
            <div key={`${item.emp_code}-${item.time}-${index}`} className="feed-item">
              {getStatusIcon(item.status)}
              <span className="feed-item-time">{formatTime(item.time)}</span>
              <span className="feed-item-emp">{item.emp_code}</span>
              <span className="feed-item-machine">{item.machine}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
