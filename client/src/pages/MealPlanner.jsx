import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, ArrowRight, FileText, Loader2 } from 'lucide-react';
import { createSSEStream } from '../utils/api.js';
import api from '../utils/api.js';
import { CardSkeleton } from '../components/ui/Skeleton.jsx';
import { format } from 'date-fns';

export default function MealPlanner() {
  const [plan, setPlan]               = useState(null);
  const [generating, setGenerating]   = useState(false);
  const [streamText, setStreamText]   = useState('');
  const [expanded, setExpanded]       = useState({});
  const [report, setReport]           = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [swapsOpen, setSwapsOpen]     = useState(true);

  useEffect(() => { loadCurrent(); }, []);

  async function loadCurrent() {
    setLoading(true);
    const r = await api.get('/meal-plan/current').catch(() => ({ data: { plan: null } }));
    if (r.data.plan?.planJson && typeof r.data.plan.planJson === 'object') {
      setPlan(r.data.plan.planJson);
    }
    setLoading(false);
  }

  function generate() {
    setGenerating(true);
    setStreamText('');
    setPlan(null);

    const cancel = createSSEStream(
      '/api/meal-plan/generate',
      {},
      (chunk) => setStreamText((t) => t + chunk),
      (data) => {
        if (data.plan) setPlan(data.plan);
        setGenerating(false);
        setStreamText('');
      },
      () => { setGenerating(false); }
    );
    return cancel;
  }

  async function loadReport() {
    setLoadingReport(true);
    const r = await api.get('/meal-plan/weekly-report').catch(() => null);
    if (r?.data?.report) setReport(r.data.report);
    setLoadingReport(false);
  }

  const days = plan?.days ?? [];
  const swaps = plan?.swaps ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Meal Planner</h1>
        <div className="flex gap-2">
          <button
            onClick={loadReport}
            disabled={loadingReport}
            className="btn-secondary text-sm flex items-center gap-1"
          >
            {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Weekly Report
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating…' : plan ? 'Regenerate' : 'Generate Plan'}
          </button>
        </div>
      </div>

      {/* Weekly report */}
      {report && (
        <div className="card bg-gradient-to-br from-purple-50 to-brand-50 dark:from-purple-900/20 dark:to-brand-900/20 border-purple-100 dark:border-purple-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Weekly Insight Report</h2>
            <span className="text-2xl font-bold text-purple-600">{report.overallScore}/10</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{report.summary}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: '🏆 Wins', items: report.wins, color: 'green' },
              { title: '📈 Patterns', items: report.patterns, color: 'blue' },
              { title: '🎯 Action Items', items: report.actionItems, color: 'amber' },
            ].map(({ title, items, color }) => (
              <div key={title} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-xl p-3`}>
                <p className="font-medium text-sm mb-2">{title}</p>
                <ul className="space-y-1">
                  {(items ?? []).map((item, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1">
                      <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streaming preview */}
      {generating && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-brand-500 animate-pulse" />
            <span className="font-medium">Claude is crafting your meal plan…</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 max-h-48 overflow-y-auto font-mono text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
            {streamText || <span className="animate-pulse">Thinking…</span>}
          </div>
        </div>
      )}

      {loading && !generating && <CardSkeleton rows={5} />}

      {!loading && !generating && days.length === 0 && (
        <div className="card text-center py-16">
          <Sparkles className="w-12 h-12 text-brand-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No meal plan yet</h2>
          <p className="text-gray-400 mb-6">Let Claude generate a personalized weekly plan based on your health profile.</p>
          <button onClick={generate} className="btn-primary mx-auto">Generate My Plan</button>
        </div>
      )}

      {/* Plan summary */}
      {plan?.summary && (
        <div className="card bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-800">
          <p className="text-sm text-brand-800 dark:text-brand-200">{plan.summary}</p>
        </div>
      )}

      {/* Day cards */}
      {days.length > 0 && (
        <div className="space-y-3">
          {days.map((day, i) => (
            <div key={i} className="card">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
                aria-expanded={!!expanded[i]}
              >
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">{day.day}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {[day.breakfast, day.lunch, day.dinner, ...(day.snacks ?? [])].reduce((s, m) => s + (m?.carbs ?? 0), 0)}g carbs
                  </span>
                  {expanded[i] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expanded[i] && (
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {['breakfast', 'lunch', 'dinner'].map((meal) => {
                    const m = day[meal];
                    if (!m) return null;
                    return (
                      <MealCard key={meal} label={meal} meal={m} />
                    );
                  })}
                  {day.snacks?.map((s, si) => (
                    <MealCard key={`snack-${si}`} label="snack" meal={s} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Swaps */}
      {swaps.length > 0 && (
        <div className="card">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setSwapsOpen(!swapsOpen)}
          >
            <h2 className="font-semibold">🔄 Smart Food Swaps</h2>
            {swapsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {swapsOpen && (
            <div className="mt-4 space-y-2">
              {swaps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-500 line-through">{s.from}</span>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className="text-green-600 font-medium">{s.to}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{s.reason}</p>
                  </div>
                  {s.carbSaving > 0 && (
                    <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      −{s.carbSaving}g carbs
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hidden sugars */}
      {plan?.hiddenSugars?.length > 0 && (
        <div className="card border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <h2 className="font-semibold mb-2">⚠ Hidden Sugars to Watch</h2>
          <ul className="space-y-1">
            {plan.hiddenSugars.map((s, i) => (
              <li key={i} className="text-sm text-amber-700 dark:text-amber-300 flex gap-2">
                <span>•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MealCard({ label, meal }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
      <p className="text-xs text-gray-400 capitalize mb-1">{label}</p>
      <p className="font-medium text-sm">{meal.name}</p>
      {meal.items && (
        <p className="text-xs text-gray-400 mt-1">{meal.items.join(', ')}</p>
      )}
      <div className="flex gap-3 mt-2 text-xs font-medium text-brand-600">
        <span>{meal.carbs}g carbs</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-400">{meal.calories} kcal</span>
      </div>
      {meal.tips && <p className="text-xs text-green-600 mt-1 italic">{meal.tips}</p>}
    </div>
  );
}
