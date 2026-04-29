import { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCheck, AlertTriangle, Clock, TrendingUp, Info } from 'lucide-react';
import { format } from 'date-fns';
import api from '../utils/api.js';
import { CardSkeleton } from '../components/ui/Skeleton.jsx';

const ICONS = {
  SPIKE_WARNING:    <AlertTriangle className="w-5 h-5 text-amber-500" />,
  LOW_GLUCOSE:      <AlertTriangle className="w-5 h-5 text-red-500" />,
  MEDICATION_REMINDER: <Clock className="w-5 h-5 text-blue-500" />,
  MEAL_REMINDER:    <Clock className="w-5 h-5 text-green-500" />,
  WEEKLY_PATTERN:   <TrendingUp className="w-5 h-5 text-purple-500" />,
};

const LABELS = {
  SPIKE_WARNING:    'Glucose Spike Warning',
  LOW_GLUCOSE:      'Low Glucose Alert',
  MEDICATION_REMINDER: 'Medication Reminder',
  MEAL_REMINDER:    'Meal Reminder',
  WEEKLY_PATTERN:   'Weekly Pattern',
};

export default function Alerts() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const r = await api.get('/alerts').catch(() => ({ data: { alerts: [] } }));
    setAlerts(r.data.alerts);
    setLoading(false);
  }

  async function markRead(id) {
    await api.patch(`/alerts/${id}/read`).catch(() => {});
    setAlerts((a) => a.map((x) => x.id === id ? { ...x, isRead: true } : x));
  }

  async function markAllRead() {
    await api.patch('/alerts/read-all').catch(() => {});
    setAlerts((a) => a.map((x) => ({ ...x, isRead: true })));
  }

  const filtered = filter === 'all' ? alerts : filter === 'unread' ? alerts.filter((a) => !a.isRead) : alerts.filter((a) => a.type === filter);
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm flex items-center gap-1">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
          { key: 'SPIKE_WARNING', label: 'Spikes' },
          { key: 'WEEKLY_PATTERN', label: 'Patterns' },
          { key: 'MEDICATION_REMINDER', label: 'Medications' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === key ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <CardSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <BellOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">{filter === 'unread' ? 'All caught up!' : 'No alerts to show'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`card flex items-start gap-4 transition-all ${!alert.isRead ? 'border-l-4 border-l-brand-500 bg-brand-50/30 dark:bg-brand-900/10' : ''}`}
            >
              <div className="shrink-0 mt-0.5">{ICONS[alert.type] ?? <Info className="w-5 h-5 text-gray-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{LABELS[alert.type]}</p>
                    <p className="font-medium text-sm mt-0.5">{alert.message}</p>
                    {alert.detail && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{alert.detail}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                    {format(new Date(alert.timestamp), 'MMM d, h:mm a')}
                  </span>
                </div>
              </div>
              {!alert.isRead && (
                <button
                  onClick={() => markRead(alert.id)}
                  aria-label="Mark as read"
                  className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-brand-600 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
