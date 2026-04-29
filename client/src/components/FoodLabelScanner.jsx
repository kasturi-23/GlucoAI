import { useState, useRef, useCallback } from 'react';
import {
  Camera, Upload, X, CheckCircle, AlertTriangle, XCircle,
  Zap, ShieldAlert, Lightbulb, ChevronDown, ChevronUp,
  Plus, Trash2, Loader2, RotateCcw, BookOpen,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../utils/api.js';

// ── Colour helpers ─────────────────────────────────────────────────────────────
const SAFETY = {
  SAFE:    { bg: 'bg-green-50 dark:bg-green-900/20',    border: 'border-green-200 dark:border-green-700',    icon: CheckCircle,     iconColor: 'text-green-500',  badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',  label: 'SAFE'    },
  CAUTION: { bg: 'bg-amber-50 dark:bg-amber-900/20',    border: 'border-amber-200 dark:border-amber-700',    icon: AlertTriangle,   iconColor: 'text-amber-500',  badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',  label: 'CAUTION' },
  AVOID:   { bg: 'bg-red-50   dark:bg-red-900/20',      border: 'border-red-200   dark:border-red-700',      icon: XCircle,         iconColor: 'text-red-500',    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',          label: 'AVOID'   },
};

const SPIKE = {
  LOW:    { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  MEDIUM: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  HIGH:   { color: 'text-red-600   dark:text-red-400',   bg: 'bg-red-50   dark:bg-red-900/20'   },
};

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

// ── Verdict Card ───────────────────────────────────────────────────────────────
function VerdictCard({ result, scanId, onLogFood, onReset }) {
  const [logOpen, setLogOpen]     = useState(false);
  const [mealType, setMealType]   = useState('SNACK');
  const [servings, setServings]   = useState(1);
  const [logging, setLogging]     = useState(false);
  const [logged, setLogged]       = useState(false);
  const [nutrOpen, setNutrOpen]   = useState(false);

  const style   = SAFETY[result.safety_level] ?? SAFETY.CAUTION;
  const spikeS  = SPIKE[result.spike_risk]    ?? SPIKE.MEDIUM;
  const Icon    = style.icon;

  const nutri   = result.nutrition_extracted ?? {};

  async function handleLog() {
    setLogging(true);
    try {
      await api.post(`/food/scan-label/${scanId}/log`, { mealType, servings });
      setLogged(true);
      onLogFood?.();
    } finally {
      setLogging(false);
      setLogOpen(false);
    }
  }

  return (
    <div className={`rounded-2xl border-2 ${style.border} ${style.bg} overflow-hidden`}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-start gap-3">
        <Icon className={`w-7 h-7 shrink-0 mt-0.5 ${style.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${style.badge}`}>
              {style.label}
            </span>
            <span className="font-bold text-gray-800 dark:text-gray-100 truncate">
              {result.verdict}
            </span>
          </div>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mt-0.5">
            {result.product_name}
          </p>
        </div>
        <button onClick={onReset} aria-label="Scan again" className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700/60 text-gray-400 shrink-0">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="border-t border-current/10 divide-y divide-current/10" style={{ borderColor: 'inherit' }}>

        {/* Portion & carb budget */}
        <div className="px-5 py-3 bg-white/50 dark:bg-gray-800/50">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Safe Portion for You Today
          </p>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
            <span className="text-base">👉</span>
            {result.recommended_portion ?? '1 serving'}
          </p>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-gray-500">Net carbs used: <strong className="text-gray-800 dark:text-gray-200">{result.net_carbs_per_serving ?? result.nutrition_extracted?.net_carbs ?? '?'}g</strong></span>
            <span className="text-gray-500">Budget left: <strong className={result.carbBudgetRemaining < 30 ? 'text-red-600' : 'text-green-600'}>{Math.round(result.carbBudgetRemaining ?? 0)}g</strong></span>
          </div>
          {/* mini budget bar */}
          {typeof result.carbBudgetRemaining === 'number' && typeof result.net_carbs_per_serving === 'number' && (
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${result.safety_level === 'SAFE' ? 'bg-green-500' : result.safety_level === 'CAUTION' ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, (result.net_carbs_per_serving / (result.carbBudgetRemaining + result.net_carbs_per_serving)) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Spike risk */}
        <div className={`px-5 py-3 ${spikeS.bg}`}>
          <div className="flex items-center gap-2 mb-1">
            <Zap className={`w-4 h-4 ${spikeS.color}`} />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Spike Risk</span>
            <span className={`font-bold text-sm ${spikeS.color}`}>{result.spike_risk}</span>
          </div>
          {result.spike_explanation && (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{result.spike_explanation}</p>
          )}
        </div>

        {/* Health concerns */}
        {result.health_concerns?.length > 0 && (
          <div className="px-5 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Watch out for</span>
            </div>
            <ul className="space-y-1">
              {result.health_concerns.map((c, i) => (
                <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                  <span className="text-red-400 font-bold shrink-0">•</span>{c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Reasoning */}
        {result.reasoning && (
          <div className="px-5 py-3 bg-white/40 dark:bg-gray-800/40">
            <p className="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">{result.reasoning}</p>
          </div>
        )}

        {/* Tips */}
        {result.tips?.length > 0 && (
          <div className="px-5 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tips</span>
            </div>
            <ul className="space-y-1">
              {result.tips.map((t, i) => (
                <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                  <span className="text-yellow-400 font-bold shrink-0">•</span>{t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Nutrition facts collapsible */}
        {Object.keys(nutri).length > 0 && (
          <div className="px-5 py-2">
            <button
              onClick={() => setNutrOpen(!nutrOpen)}
              className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-1"
            >
              <span className="font-semibold uppercase tracking-wide">Nutrition Facts (extracted)</span>
              {nutrOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {nutrOpen && (
              <div className="grid grid-cols-2 gap-1 mt-2 pb-1">
                {[
                  ['Serving', nutri.serving_size],
                  ['Calories', nutri.calories ? `${nutri.calories} kcal` : null],
                  ['Total Carbs', nutri.total_carbs ? `${nutri.total_carbs}g` : null],
                  ['Fiber', nutri.fiber ? `${nutri.fiber}g` : null],
                  ['Net Carbs', nutri.net_carbs ? `${nutri.net_carbs}g` : null],
                  ['Sugars', nutri.sugars !== null && nutri.sugars !== undefined ? `${nutri.sugars}g` : null],
                  ['Sat Fat', nutri.saturated_fat ? `${nutri.saturated_fat}g` : null],
                  ['Sodium', nutri.sodium ? `${nutri.sodium}mg` : null],
                  ['Protein', nutri.protein ? `${nutri.protein}g` : null],
                ].filter(([, v]) => v !== null && v !== undefined).map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs border-b border-gray-100 dark:border-gray-700 py-0.5">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="px-5 py-3 bg-white/50 dark:bg-gray-800/50 flex gap-2">
          {!logged ? (
            <>
              {!logOpen ? (
                <button
                  onClick={() => setLogOpen(true)}
                  className="btn-primary text-sm flex items-center gap-1.5 flex-1 justify-center"
                >
                  <Plus className="w-4 h-4" /> Log this food
                </button>
              ) : (
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <select className="input text-xs flex-1" value={mealType} onChange={(e) => setMealType(e.target.value)} aria-label="Meal type">
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 whitespace-nowrap">× servings</label>
                      <input type="number" min="0.5" step="0.5" value={servings} onChange={(e) => setServings(parseFloat(e.target.value) || 1)} className="input text-xs w-16 text-center" aria-label="Number of servings" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setLogOpen(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                    <button onClick={handleLog} disabled={logging} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
                      {logging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Added to food diary
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── History list item ─────────────────────────────────────────────────────────
function HistoryItem({ scan, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const style = SAFETY[scan.safetyLevel] ?? SAFETY.CAUTION;
  const Icon  = style.icon;

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Icon className={`w-5 h-5 shrink-0 ${style.iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{scan.productName}</p>
          <p className="text-xs text-gray-400">{format(new Date(scan.scannedAt), 'MMM d, h:mm a')} · {scan.netCarbs ? `${scan.netCarbs}g net carbs` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>{scan.verdict}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-current/10">
          {scan.reasoning && <p className="text-xs text-gray-600 dark:text-gray-400 pt-2 italic">{scan.reasoning}</p>}
          {scan.tips?.length > 0 && (
            <ul className="space-y-0.5">
              {scan.tips.map((t, i) => <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1.5"><span className="text-yellow-400">•</span>{t}</li>)}
            </ul>
          )}
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-gray-400">Budget at scan: {Math.round(scan.carbBudgetRemaining ?? 0)}g remaining</span>
            <button onClick={() => onDelete(scan.id)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1" aria-label="Delete scan">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FoodLabelScanner() {
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [result, setResult]       = useState(null);
  const [scanId, setScanId]       = useState(null);
  const [error, setError]         = useState('');
  const [history, setHistory]     = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded, setHistLoaded]   = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef                   = useRef(null);

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) { setError('Please upload a valid image file'); return; }
    if (f.size > 5 * 1024 * 1024)          { setError('Image must be smaller than 5MB');  return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError('');
  }

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  async function scan() {
    if (!file) return;
    setScanning(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/food/scan-label', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('glucoai_token')}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setResult(data.analysis);
      setScanId(data.scanId);
      if (histLoaded) loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setScanId(null);
    setError('');
    if (preview) URL.revokeObjectURL(preview);
  }

  async function loadHistory() {
    setHistLoading(true);
    setHistLoaded(true);
    const r = await api.get('/food/scan-label/history').catch(() => ({ data: { scans: [] } }));
    setHistory(r.data.scans);
    setHistLoading(false);
  }

  async function deleteHistoryItem(id) {
    await api.delete(`/food/scan-label/${id}`).catch(() => {});
    setHistory((h) => h.filter((s) => s.id !== id));
  }

  function toggleHistory() {
    setShowHistory(!showHistory);
    if (!histLoaded && !showHistory) loadHistory();
  }

  return (
    <div className="space-y-5">
      {/* Upload zone (hidden when result is showing) */}
      {!result && (
        <div className="space-y-4">
          <div
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all select-none
              ${dragOver
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !preview && fileRef.current?.click()}
            aria-label="Drop food label image here"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          >
            {preview ? (
              <div className="relative inline-block">
                <img src={preview} alt="Food label preview" className="max-h-52 mx-auto rounded-xl object-contain shadow" />
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center shadow"
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-brand-50 dark:bg-brand-900/20 rounded-2xl flex items-center justify-center mx-auto">
                  <Upload className="w-7 h-7 text-brand-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700 dark:text-gray-200">Drop food label photo here</p>
                  <p className="text-sm text-gray-400 mt-1">or click to browse · JPEG, PNG, HEIC · max 5 MB</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              aria-label="Upload food label image"
            />
          </div>

          {/* Camera / upload buttons when no preview */}
          {!preview && (
            <div className="flex gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
              >
                <Camera className="w-4 h-4" /> Take Photo
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
              >
                <Upload className="w-4 h-4" /> Upload Image
              </button>
            </div>
          )}

          {preview && (
            <button
              onClick={scan}
              disabled={scanning}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {scanning
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with Claude AI…</>
                : <><Zap className="w-4 h-4" /> Analyze Label</>
              }
            </button>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-xl flex items-center gap-2" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </p>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {scanning && (
        <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 skeleton rounded-full" />
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          </div>
          {[80, 60, 90, 70, 55].map((w, i) => (
            <div key={i} className={`skeleton h-3 rounded`} style={{ width: `${w}%` }} />
          ))}
          <div className="skeleton h-8 w-full rounded-xl" />
          <p className="text-center text-xs text-gray-400 animate-pulse">Claude is analyzing the label…</p>
        </div>
      )}

      {/* Result card */}
      {result && !scanning && (
        <VerdictCard
          result={result}
          scanId={scanId}
          onLogFood={() => {}}
          onReset={reset}
        />
      )}

      {/* History section */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
        <button
          onClick={toggleHistory}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          aria-expanded={showHistory}
        >
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Scanned Foods History
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {histLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            )}
            {!histLoading && history.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No scanned labels yet</p>
            )}
            {!histLoading && history.map((s) => (
              <HistoryItem key={s.id} scan={s} onDelete={deleteHistoryItem} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
