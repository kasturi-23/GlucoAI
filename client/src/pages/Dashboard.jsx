import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar,
} from 'recharts';
import { format } from 'date-fns';
import { AlertTriangle, TrendingUp, Droplets, Apple, Plus, RefreshCw } from 'lucide-react';
import api from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ChartSkeleton, CardSkeleton } from '../components/ui/Skeleton.jsx';
import GlucoseBadge, { glucoseColor } from '../components/ui/GlucoseBadge.jsx';
import GlucoseLogModal from '../components/GlucoseLogModal.jsx';

function ReferenceLines() {
  return (
    <>
      <ReferenceLine y={180} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '180', fill: '#f59e0b', fontSize: 11 }} />
      <ReferenceLine y={70}  stroke="#ef4444" strokeDasharray="4 4" label={{ value: '70',  fill: '#ef4444', fontSize: 11 }} />
    </>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-lg text-sm">
      <p className="text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold ${glucoseColor(val)}`}>{Math.round(val)} mg/dL</p>
      {payload[0].payload.mealContext && (
        <p className="text-gray-400 text-xs mt-1">{payload[0].payload.mealContext}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [glucose, setGlucose]       = useState([]);
  const [foodLogs, setFoodLogs]     = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [mealPlan, setMealPlan]     = useState(null);
  const [hba1cTrend, setHba1cTrend] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [logOpen, setLogOpen]       = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [g, f, a, mp, h] = await Promise.all([
        api.get('/glucose?days=7'),
        api.get('/food?days=1'),
        api.get('/alerts'),
        api.get('/meal-plan/current'),
        api.get('/glucose/hba1c-trend'),
      ]);
      setGlucose(g.data.readings);
      setFoodLogs(f.data.logs);
      setAlerts(a.data.alerts.filter((x) => !x.isRead));
      setMealPlan(mp.data.plan);
      setHba1cTrend(h.data.trend);
    } finally {
      setLoading(false);
    }
  }

  // Chart data
  const chartData = glucose.map((r) => ({
    time: format(new Date(r.timestamp), 'EEE HH:mm'),
    value: r.value,
    mealContext: r.mealContext,
  }));

  // Carb intake today
  const todayCarbs = foodLogs.reduce((s, l) => s + l.totalCarbs, 0);
  const carbPct    = Math.min(100, Math.round((todayCarbs / (user?.carbTarget || 150)) * 100));
  const carbColor  = carbPct > 90 ? 'bg-red-500' : carbPct > 70 ? 'bg-amber-400' : 'bg-green-500';

  // Latest reading
  const latest = glucose[glucose.length - 1];

  // Today's meal plan
  const today = mealPlan?.planJson?.days?.[0];

  return (
    <div className="space-y-6">
      {/* Spike alert banner */}
      {alerts.filter((a) => a.type === 'SPIKE_WARNING').slice(0, 1).map((a) => (
        <div key={a.id} className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">{a.message}</p>
            {a.detail && <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">{a.detail}</p>}
          </div>
        </div>
      ))}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current Glucose"
          loading={loading}
          icon={<Droplets className="w-5 h-5 text-blue-500" />}
        >
          {latest ? (
            <div>
              <span className={`text-3xl font-bold ${glucoseColor(latest.value)}`}>
                {Math.round(latest.value)}
              </span>
              <span className="text-sm text-gray-400 ml-1">mg/dL</span>
              <div className="mt-1"><GlucoseBadge value={latest.value} /></div>
            </div>
          ) : <span className="text-gray-400 text-sm">No readings</span>}
        </StatCard>

        <StatCard
          label="Today's Carbs"
          loading={loading}
          icon={<Apple className="w-5 h-5 text-green-500" />}
        >
          <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">
            {Math.round(todayCarbs)}
            <span className="text-sm text-gray-400 font-normal">/{user?.carbTarget}g</span>
          </div>
          <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
            <div className={`${carbColor} h-2 rounded-full transition-all`} style={{ width: `${carbPct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{carbPct}% of daily target</p>
        </StatCard>

        <StatCard
          label="Latest HbA1c"
          loading={loading}
          icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
        >
          {user?.hba1c ? (
            <div>
              <span className={`text-3xl font-bold ${user.hba1c < 7 ? 'text-green-600' : user.hba1c < 8 ? 'text-amber-500' : 'text-red-500'}`}>
                {user.hba1c}%
              </span>
              <p className="text-xs text-gray-400 mt-1">
                {user.hba1c < 7 ? 'At target' : user.hba1c < 8 ? 'Slightly elevated' : 'Above target'}
              </p>
            </div>
          ) : <span className="text-gray-400 text-sm">Update in profile</span>}
        </StatCard>

        <StatCard
          label="Alerts"
          loading={loading}
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        >
          <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{alerts.length}</div>
          <p className="text-xs text-gray-400 mt-1">Unread notifications</p>
        </StatCard>
      </div>

      {/* Glucose chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Blood Glucose — Last 7 Days</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogOpen(true)}
              className="btn-primary text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Log Reading
            </button>
            <button onClick={loadAll} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Refresh">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-56 skeleton rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-gray-400">
            No glucose readings yet — log your first reading above.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[50, 250]} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLines />
              <Line
                type="monotone" dataKey="value" stroke="#3b82f6"
                strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> 70–140 Safe</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 140–180 Elevated</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &gt;180 High</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* HbA1c trend */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">HbA1c Trend</h2>
          {loading ? (
            <div className="h-32 skeleton rounded-xl" />
          ) : hba1cTrend.length === 0 ? (
            <p className="text-gray-400 text-sm">Not enough data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={128}>
              <BarChart data={hba1cTrend}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[4, 12]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, 'HbA1c']} />
                <Bar dataKey="hba1c" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-gray-400 mt-2">Target: &lt;7.0%</p>
        </div>

        {/* Today's meal plan */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Today's Meal Plan</h2>
          {loading ? (
            <CardSkeleton rows={4} />
          ) : today ? (
            <div className="space-y-2">
              {['breakfast', 'lunch', 'dinner', 'snacks'].map((meal) => {
                const item = meal === 'snacks' ? today.snacks?.[0] : today[meal];
                if (!item) return null;
                return (
                  <div key={meal} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                      <span className="text-xs text-gray-400 capitalize">{meal}</span>
                      <p className="text-sm font-medium">{item.name}</p>
                    </div>
                    <span className="text-xs font-medium text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full">
                      {item.carbs}g carbs
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm mb-3">No meal plan for this week</p>
              <a href="/meal-plan" className="btn-primary text-sm inline-block">Generate Plan</a>
            </div>
          )}
        </div>
      </div>

      <GlucoseLogModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={loadAll} />
    </div>
  );
}

function StatCard({ label, loading, icon, children }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      {loading ? <div className="skeleton h-10 w-24 rounded-lg" /> : children}
    </div>
  );
}
