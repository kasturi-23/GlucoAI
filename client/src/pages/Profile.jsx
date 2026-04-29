import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Save, User, Pill, Apple, Target, Loader2 } from 'lucide-react';
import api from '../utils/api.js';

const DIABETES_TYPES = [
  { value: 'TYPE_1', label: 'Type 1' },
  { value: 'TYPE_2', label: 'Type 2' },
  { value: 'GESTATIONAL', label: 'Gestational' },
  { value: 'PREDIABETES', label: 'Pre-diabetes' },
];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('personal');

  const [form, setForm] = useState({
    name:           user?.name ?? '',
    diabetesType:   user?.diabetesType ?? '',
    weight:         user?.weight ?? '',
    height:         user?.height ?? '',
    hba1c:          user?.hba1c ?? '',
    carbTarget:     user?.carbTarget ?? 150,
    calorieGoal:    user?.calorieGoal ?? 2000,
    allergies:      (user?.allergies ?? []).join(', '),
    foodPreferences:(user?.foodPreferences ?? []).join(', '),
    medications:    JSON.stringify(user?.medications ?? [], null, 2),
  });

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      let medications;
      try { medications = JSON.parse(form.medications); } catch { medications = user?.medications; }

      const { data } = await api.patch('/profile', {
        name: form.name,
        diabetesType: form.diabetesType || undefined,
        weight:       form.weight ? parseFloat(form.weight) : undefined,
        height:       form.height ? parseFloat(form.height) : undefined,
        hba1c:        form.hba1c  ? parseFloat(form.hba1c)  : undefined,
        carbTarget:   parseInt(form.carbTarget),
        calorieGoal:  parseInt(form.calorieGoal),
        allergies:    form.allergies.split(',').map((s) => s.trim()).filter(Boolean),
        foodPreferences: form.foodPreferences.split(',').map((s) => s.trim()).filter(Boolean),
        medications,
      });
      updateUser(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: 'personal', label: 'Personal', icon: User },
    { key: 'health', label: 'Health', icon: Target },
    { key: 'meds', label: 'Medications', icon: Pill },
    { key: 'diet', label: 'Diet Prefs', icon: Apple },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile & Settings</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-xl" role="alert">{error}</p>}

      {/* Avatar display */}
      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 text-2xl font-bold">
          {user?.name?.charAt(0) ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-lg">{user?.name}</p>
          <p className="text-sm text-gray-400">{user?.email}</p>
          <span className="mt-1 inline-block badge-safe">{user?.role}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Personal Information</h2>
          <Field label="Full Name" id="name">
            <input id="name" type="text" className="input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Diabetes Type" id="dtype">
            <select id="dtype" className="input" value={form.diabetesType} onChange={set('diabetesType')}>
              <option value="">Select type…</option>
              {DIABETES_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Weight (kg)" id="weight">
              <input id="weight" type="number" step="0.1" className="input" value={form.weight} onChange={set('weight')} placeholder="e.g. 72" />
            </Field>
            <Field label="Height (cm)" id="height">
              <input id="height" type="number" className="input" value={form.height} onChange={set('height')} placeholder="e.g. 165" />
            </Field>
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Health Targets</h2>
          <Field label="Current HbA1c (%)" id="hba1c">
            <input id="hba1c" type="number" step="0.1" min="3" max="20" className="input" value={form.hba1c} onChange={set('hba1c')} placeholder="e.g. 7.2" />
            <p className="text-xs text-gray-400 mt-1">Target: below 7.0% for most adults</p>
          </Field>
          <Field label="Daily Carb Target (g)" id="carbTarget">
            <input id="carbTarget" type="number" min="20" max="500" className="input" value={form.carbTarget} onChange={set('carbTarget')} />
            <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
              <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (form.carbTarget / 300) * 100)}%` }} />
            </div>
          </Field>
          <Field label="Daily Calorie Goal (kcal)" id="calorieGoal">
            <input id="calorieGoal" type="number" min="500" max="5000" className="input" value={form.calorieGoal} onChange={set('calorieGoal')} />
          </Field>
        </div>
      )}

      {tab === 'meds' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Medications</h2>
          <p className="text-xs text-gray-400">Enter as JSON array. Claude uses this to personalize advice.</p>
          <textarea
            className="input font-mono text-xs resize-none"
            rows={8}
            value={form.medications}
            onChange={set('medications')}
            aria-label="Medications JSON"
            spellCheck={false}
          />
          <p className="text-xs text-gray-400">
            Format: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{`[{"name": "Metformin", "dosage": "500mg", "frequency": "twice daily"}]`}</code>
          </p>
        </div>
      )}

      {tab === 'diet' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Diet Preferences</h2>
          <Field label="Food Allergies" id="allergies">
            <input id="allergies" type="text" className="input" value={form.allergies} onChange={set('allergies')} placeholder="e.g. shellfish, peanuts, dairy" />
            <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
          </Field>
          <Field label="Food Preferences / Dietary Style" id="prefs">
            <input id="prefs" type="text" className="input" value={form.foodPreferences} onChange={set('foodPreferences')} placeholder="e.g. vegetarian, low-sodium, Mediterranean" />
            <p className="text-xs text-gray-400 mt-1">Claude uses this when generating meal plans</p>
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
