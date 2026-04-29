import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../utils/api.js';

const CONTEXTS = ['fasting', 'pre_meal', 'post_breakfast', 'post_lunch', 'post_dinner', 'bedtime', 'random'];

export default function GlucoseLogModal({ open, onClose, onSaved }) {
  const [value, setValue]     = useState('');
  const [context, setContext] = useState('random');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num) || num < 20 || num > 600) {
      setError('Value must be between 20 and 600 mg/dL');
      return;
    }
    setSaving(true);
    try {
      await api.post('/glucose', { value: num, mealContext: context, notes });
      onSaved?.();
      onClose();
      setValue(''); setContext('random'); setNotes(''); setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Log glucose reading">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Log Glucose Reading</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="glucose-value">Blood Glucose (mg/dL)</label>
            <input
              id="glucose-value"
              type="number"
              className="input"
              placeholder="e.g. 120"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              min="20"
              max="600"
              aria-describedby={error ? 'glucose-error' : undefined}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="meal-context">Context</label>
            <select id="meal-context" className="input" value={context} onChange={(e) => setContext(e.target.value)}>
              {CONTEXTS.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="glucose-notes">Notes (optional)</label>
            <input id="glucose-notes" type="text" className="input" placeholder="Any notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p id="glucose-error" className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Log Reading'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
