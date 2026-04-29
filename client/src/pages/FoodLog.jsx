import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Camera, Search, Plus, Loader2, X, AlertTriangle, CheckCircle, Utensils, ScanLine, BookOpen } from 'lucide-react';
import api from '../utils/api.js';
import { CardSkeleton } from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import FoodLabelScanner from '../components/FoodLabelScanner.jsx';
import RAGRecommendation from '../components/RAGRecommendation.jsx';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

export default function FoodLog() {
  const { user } = useAuth();
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [searchResults, setResults]   = useState([]);
  const [selectedFoods, setSelected]  = useState([]);
  const [mealType, setMealType]       = useState('BREAKFAST');
  const [saving, setSaving]           = useState(false);
  const [analyzing, setAnalyzing]     = useState(false);
  const [prediction, setPrediction]   = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [aiAnalysis, setAiAnalysis]   = useState(null);
  const [tab, setTab]                 = useState('log');
  const [ragQuery, setRagQuery]       = useState('');
  const [ragResult, setRagResult]     = useState(null);
  const [ragLoading, setRagLoading]   = useState(false);
  const fileRef                       = useRef(null);
  const searchTimer                   = useRef(null);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    const r = await api.get('/food?days=7').catch(() => ({ data: { logs: [] } }));
    setLogs(r.data.logs);
    setLoading(false);
  }

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchQ.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const r = await api.get(`/food/search?q=${encodeURIComponent(searchQ)}`).catch(() => ({ data: { results: [] } }));
      setResults(r.data.results);
    }, 300);
  }, [searchQ]);

  function addFood(food) {
    setSelected((prev) => [...prev, { ...food, quantity: 1 }]);
    setSearchQ('');
    setResults([]);
  }

  function removeFood(i) {
    setSelected((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateQty(i, qty) {
    setSelected((prev) => prev.map((f, idx) => idx === i ? { ...f, quantity: Math.max(0.5, qty) } : f));
  }

  const totalCarbs    = selectedFoods.reduce((s, f) => s + f.carbs * f.quantity, 0);
  const totalCalories = selectedFoods.reduce((s, f) => s + f.calories * f.quantity, 0);
  const avgGl         = selectedFoods.reduce((s, f) => s + (f.gl ?? 0) * f.quantity, 0);

  async function predictSpike() {
    if (!selectedFoods.length) return;
    const foods = selectedFoods.map((f) => ({ name: f.name, carbs: f.carbs * f.quantity, gi: f.gi ?? 50 }));
    const r = await api.post('/food/predict-spike', { foods }).catch(() => null);
    if (r) setPrediction(r.data.prediction);
  }

  async function saveLog() {
    if (!selectedFoods.length) return;
    setSaving(true);
    await api.post('/food', {
      mealType,
      foodsJson: selectedFoods,
      totalCarbs: Math.round(totalCarbs),
      totalCalories: Math.round(totalCalories),
      glycemicLoad: Math.round(avgGl),
    }).catch(() => {});
    setSelected([]);
    setPrediction(null);
    setSaving(false);
    loadLogs();
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setAnalyzing(true);
    setAiAnalysis(null);

    const formData = new FormData();
    formData.append('image', file);

    const r = await fetch('/api/food/analyze-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('glucoai_token')}` },
      body: formData,
    }).then((res) => res.json()).catch(() => null);

    setAnalyzing(false);
    if (r?.analysis) {
      setAiAnalysis(r.analysis);
      if (r.analysis.foods) {
        setSelected(r.analysis.foods.map((f) => ({ ...f, quantity: 1 })));
      }
    }
  }

  async function checkFoodWithRAG(e) {
    e.preventDefault();
    const q = ragQuery.trim();
    if (!q) return;
    setRagLoading(true);
    setRagResult(null);
    const r = await api.post('/rag/food-check', { food_name: q }).catch(() => null);
    setRagResult(r?.data ?? null);
    setRagLoading(false);
  }

  // Group logs by date
  const grouped = logs.reduce((acc, log) => {
    const d = format(new Date(log.timestamp), 'yyyy-MM-dd');
    if (!acc[d]) acc[d] = [];
    acc[d].push(log);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Food Log</h1>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'log',     label: 'Log Meal'   },
            { key: 'scanner', label: '🔍 Label Scanner' },
            { key: 'history', label: 'History'    },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === key ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'scanner' && (
        <div className="max-w-2xl space-y-6">

          {/* ── RAG food-check ──────────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">ADA 2026 Food Check</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Ask whether a food is safe based on official ADA Standards of Care in Diabetes 2026. Every recommendation cites specific ADA guideline numbers.
            </p>
            <form onSubmit={checkFoodWithRAG} className="flex gap-2">
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="e.g. white rice, orange juice, dark chocolate…"
                className="input flex-1 text-sm"
                aria-label="Food name for ADA guideline check"
              />
              <button
                type="submit"
                disabled={!ragQuery.trim() || ragLoading}
                className="btn-primary text-sm px-4 flex items-center gap-1.5 disabled:opacity-50"
              >
                {ragLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Check
              </button>
            </form>

            {(ragLoading || ragResult) && (
              <div className="mt-4">
                <RAGRecommendation
                  data={ragResult?.recommendation}
                  isLoading={ragLoading}
                  foodName={ragResult ? ragResult.food_name : ragQuery}
                />
              </div>
            )}
          </div>

          {/* ── Label scanner ────────────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <ScanLine className="w-5 h-5 text-brand-500" />
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Food Label Scanner</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Photograph or upload a product's nutrition label. Claude will assess whether it's safe for your diabetes profile, recommend a portion based on your remaining carb budget, and flag any health concerns.
            </p>
            <FoodLabelScanner />
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Add food panel */}
          <div className="card space-y-4">
            <div className="flex gap-2">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMealType(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mealType === m ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                >
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Photo upload */}
            <div>
              <p className="text-sm font-medium mb-2">Photo Recognition</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-brand-400 transition-colors text-gray-400"
              >
                {analyzing ? (
                  <><Loader2 className="w-6 h-6 animate-spin text-brand-500" /><span className="text-xs">Analyzing with Claude AI…</span></>
                ) : imagePreview ? (
                  <img src={imagePreview} alt="Food" className="h-24 object-contain rounded-lg" />
                ) : (
                  <><Camera className="w-6 h-6" /><span className="text-xs">Upload food photo for AI analysis</span></>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} aria-label="Upload food photo" />
            </div>

            {aiAnalysis?.diabeticWarnings?.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl p-3 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Warnings
                </p>
                {aiAnalysis.diabeticWarnings.map((w, i) => <p key={i} className="text-amber-600 text-xs mt-1">{w}</p>)}
              </div>
            )}

            {/* Manual search */}
            <div className="relative">
              <p className="text-sm font-medium mb-2">Search Foods</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="e.g. brown rice, chicken breast…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  aria-label="Search food database"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
                  {searchResults.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => addFood(f)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{f.name}</p>
                        <p className="text-xs text-gray-400">{f.per}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-brand-600">{f.carbs}g carbs</p>
                        <p className="text-xs text-gray-400">GI {f.gi}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected foods */}
            {selectedFoods.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Foods</p>
                {selectedFoods.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-gray-400">{Math.round(f.carbs * f.quantity)}g carbs · {Math.round(f.calories * f.quantity)} kcal</p>
                    </div>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={f.quantity}
                      onChange={(e) => updateQty(i, parseFloat(e.target.value))}
                      className="w-14 text-center input py-1 text-xs"
                      aria-label={`Quantity of ${f.name}`}
                    />
                    <button onClick={() => removeFood(i)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${f.name}`}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary + actions */}
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Meal Summary</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Carbs', value: `${Math.round(totalCarbs)}g`, warn: totalCarbs > (user?.carbTarget || 150) / 3 },
                  { label: 'Calories', value: `${Math.round(totalCalories)} kcal`, warn: false },
                  { label: 'Glycemic Load', value: Math.round(avgGl), warn: avgGl > 20 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`rounded-xl p-3 text-center ${warn ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                    <p className={`text-xl font-bold ${warn ? 'text-amber-600' : 'text-gray-800 dark:text-gray-100'}`}>{value}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={predictSpike} className="btn-secondary flex-1 text-sm" disabled={!selectedFoods.length}>
                  Predict Spike
                </button>
                <button onClick={saveLog} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1" disabled={!selectedFoods.length || saving}>
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Log Meal</>}
                </button>
              </div>
            </div>

            {prediction && (
              <div className={`card border-l-4 ${prediction.willSpike ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-green-400 bg-green-50 dark:bg-green-900/20'}`}>
                <div className="flex items-start gap-2">
                  {prediction.willSpike
                    ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    : <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  }
                  <div>
                    <p className="font-medium text-sm">
                      {prediction.willSpike ? `⚠ Spike predicted — ~${prediction.predictedPeak} mg/dL` : '✓ Looks safe'}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{prediction.reason}</p>
                    {prediction.recommendation && (
                      <p className="text-xs text-brand-600 mt-1 font-medium">{prediction.recommendation}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {loading ? (
            <CardSkeleton rows={4} />
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card text-center py-10">
              <Utensils className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No food logs yet — start logging your meals!</p>
            </div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([date, dayLogs]) => (
              <div key={date}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  {format(new Date(date), 'EEEE, MMM d')}
                </p>
                <div className="space-y-2">
                  {dayLogs.map((log) => (
                    <div key={log.id} className="card flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center shrink-0">
                        <Utensils className="w-5 h-5 text-brand-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{log.mealType.charAt(0) + log.mealType.slice(1).toLowerCase()}</p>
                          <span className="text-xs text-gray-400">{format(new Date(log.timestamp), 'h:mm a')}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {Array.isArray(log.foodsJson) ? log.foodsJson.map((f) => f.name).join(', ') : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm text-brand-600">{Math.round(log.totalCarbs)}g</p>
                        <p className="text-xs text-gray-400">{Math.round(log.totalCalories)} kcal</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
