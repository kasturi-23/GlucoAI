import { useState } from 'react';

const VERDICT_STYLES = {
  Safe:        { border: 'border-green-500',  bg: 'bg-green-50',  text: 'text-green-800',  badge: 'bg-green-100 text-green-800'  },
  Recommended: { border: 'border-green-500',  bg: 'bg-green-50',  text: 'text-green-800',  badge: 'bg-green-100 text-green-800'  },
  Caution:     { border: 'border-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-800' },
  Modify:      { border: 'border-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-800' },
  Avoid:       { border: 'border-red-500',    bg: 'bg-red-50',    text: 'text-red-800',    badge: 'bg-red-100 text-red-800'      },
};

const SPIKE_BADGE = {
  Low:    'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High:   'bg-red-100 text-red-700',
};

const VERDICT_ICON = {
  Safe:        '✓',
  Recommended: '✓',
  Caution:     '⚠',
  Modify:      '↕',
  Avoid:       '✕',
};

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-8 w-24 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200" />
      </div>
      <div className="h-3 w-full rounded bg-gray-100" />
      <div className="h-3 w-5/6 rounded bg-gray-100" />
      <div className="h-3 w-4/6 rounded bg-gray-100" />
      <p className="text-xs text-gray-400 text-center pt-1">Checking ADA 2026 guidelines…</p>
    </div>
  );
}

export default function RAGRecommendation({ data, isLoading, foodName }) {
  const [showSources, setShowSources] = useState(false);

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return null;

  const style   = VERDICT_STYLES[data.verdict] ?? VERDICT_STYLES.Caution;
  const icon    = VERDICT_ICON[data.verdict] ?? '⚠';
  const glucose = data.glucose ?? null;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} overflow-hidden`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${style.badge}`}>
            <span className="text-base leading-none">{icon}</span>
            {data.verdict}
          </span>
          {data.spike_risk && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SPIKE_BADGE[data.spike_risk] ?? 'bg-gray-100 text-gray-600'}`}>
              Spike risk: {data.spike_risk}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-gray-500">Grounded in</p>
          <p className="text-xs text-gray-700 font-semibold">ADA Standards of Care 2026</p>
        </div>
      </div>

      {/* food name + glucose context */}
      {(foodName || glucose) && (
        <div className="px-5 pb-2 flex flex-wrap gap-2 text-xs text-gray-500">
          {foodName && <span>Food: <strong className="text-gray-700">{foodName}</strong></span>}
          {glucose  && (
            <span>
              Glucose: <strong className="text-gray-700">{glucose.value} mg/dL</strong>
              {glucose.classification && ` (${glucose.classification})`}
            </span>
          )}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="px-5 pb-4 space-y-3">

        {/* Recommendation text */}
        <p className={`text-sm leading-relaxed ${style.text}`}>
          {data.recommendation}
        </p>

        {/* Portion advice inset */}
        {data.portion_advice && (
          <div className="rounded-lg border border-current/20 bg-white/60 px-4 py-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Portion advice</p>
            <p className="text-sm text-gray-800">{data.portion_advice}</p>
          </div>
        )}

        {/* GI note */}
        {data.gi_note && (
          <p className="text-xs text-gray-500 italic">{data.gi_note}</p>
        )}

        {/* Health concerns */}
        {data.health_concerns?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Health concerns</p>
            <ul className="space-y-1">
              {data.health_concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-red-400 flex-shrink-0">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tips */}
        {data.tips?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tips</p>
            <ul className="space-y-1">
              {data.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-blue-400 flex-shrink-0">→</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Expandable ADA 2026 sources ─────────────────────────────── */}
        <button
          onClick={() => setShowSources((s) => !s)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span>{showSources ? '▾' : '▸'}</span>
          {showSources ? 'Hide' : 'View'} ADA 2026 sources
          {data.retrieved_chunks?.length > 0 && (
            <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5">
              {data.retrieved_chunks.length}
            </span>
          )}
        </button>

        {showSources && (
          <div className="rounded-lg border border-blue-100 bg-white/80 p-3 space-y-3">

            {/* Cited sources */}
            {data.cited_sources?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Citations</p>
                <ul className="space-y-1">
                  {data.cited_sources.map((s, i) => (
                    <li key={i} className="text-xs text-gray-700 leading-relaxed">
                      <span className="font-medium text-blue-700">[{i + 1}]</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Retrieved chunks */}
            {data.retrieved_chunks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Retrieved passages</p>
                <div className="space-y-2">
                  {data.retrieved_chunks.map((chunk, i) => (
                    <div key={i} className="rounded border border-gray-100 bg-gray-50 p-2.5">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-blue-700">{chunk.ref}</span>
                        {chunk.section && (
                          <span className="text-xs text-gray-500">{chunk.section}</span>
                        )}
                        {chunk.similarity != null && (
                          <span className="text-xs text-gray-400">{chunk.similarity}% match</span>
                        )}
                      </div>
                      {chunk.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {(Array.isArray(chunk.tags) ? chunk.tags : [chunk.tags]).map((tag, ti) => (
                            <span key={ti} className="rounded-full bg-blue-50 text-blue-600 px-1.5 py-0.5 text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {chunk.excerpt && (
                        <p className="text-xs text-gray-600 leading-relaxed">{chunk.excerpt}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <p className="text-xs text-gray-400 text-center">
              Diabetes Care 2026;49(Suppl. 1) — ADA Standards of Care in Diabetes 2026
            </p>
          </div>
        )}
      </div>

      {/* ── Disclaimer bar ──────────────────────────────────────────────── */}
      {data.disclaimer && (
        <div className="border-t border-current/10 bg-white/40 px-5 py-2">
          <p className="text-xs text-gray-400">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
