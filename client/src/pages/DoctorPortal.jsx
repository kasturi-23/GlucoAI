import { useState, useEffect } from 'react';
import { Users, FileText, TrendingUp, Utensils, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../utils/api.js';
import { CardSkeleton } from '../components/ui/Skeleton.jsx';
import GlucoseBadge from '../components/ui/GlucoseBadge.jsx';

export default function DoctorPortal() {
  const [patients, setPatients]       = useState([]);
  const [selected, setSelected]       = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [loadingPt, setLoadingPt]     = useState(false);
  const [noteText, setNoteText]       = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [savingNote, setSavingNote]   = useState(false);
  const [linkEmail, setLinkEmail]     = useState('');
  const [linking, setLinking]         = useState(false);
  const [tab, setTab]                 = useState('glucose');

  useEffect(() => {
    api.get('/doctor/patients').then((r) => setPatients(r.data.patients)).finally(() => setLoading(false));
  }, []);

  async function selectPatient(p) {
    setSelected(p);
    setPatientData(null);
    setLoadingPt(true);
    const r = await api.get(`/doctor/patients/${p.id}`).catch(() => null);
    if (r) setPatientData(r.data);
    setLoadingPt(false);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    await api.post(`/doctor/patients/${selected.id}/notes`, { content: noteText, restrictions }).catch(() => {});
    const r = await api.get(`/doctor/patients/${selected.id}`).catch(() => null);
    if (r) setPatientData(r.data);
    setNoteText('');
    setRestrictions('');
    setSavingNote(false);
  }

  async function linkPatient() {
    if (!linkEmail) return;
    setLinking(true);
    const r = await api.post('/doctor/patients/link', { email: linkEmail }).catch(() => null);
    if (r) {
      setPatients((p) => [...p, r.data.patient]);
      setLinkEmail('');
    }
    setLinking(false);
  }

  const glucoseChart = (patientData?.glucoseReadings ?? []).map((r) => ({
    time: format(new Date(r.timestamp), 'MM/dd HH:mm'),
    value: r.value,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Doctor Portal</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Patient list */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> My Patients</h2>
          </div>

          {/* Link patient */}
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              className="input text-sm flex-1"
              placeholder="Patient email…"
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              aria-label="Patient email to link"
            />
            <button onClick={linkPatient} disabled={linking || !linkEmail} className="btn-primary text-sm px-3">
              {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>

          {loading ? <CardSkeleton rows={3} /> : (
            <div className="space-y-1">
              {patients.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No patients linked yet</p>}
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${selected?.id === p.id ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                >
                  <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold text-sm">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.diabetesType?.replace('_', ' ')} • HbA1c {p.hba1c ?? '?'}%</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Patient detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected && (
            <div className="card text-center py-16">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a patient to view their data</p>
            </div>
          )}

          {selected && loadingPt && <CardSkeleton rows={6} />}

          {selected && !loadingPt && patientData && (
            <>
              {/* Patient header */}
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{patientData.patient.name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{patientData.patient.email}</p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="badge-safe">{patientData.patient.diabetesType?.replace('_', ' ')}</span>
                    <p className="text-gray-400 mt-1">HbA1c: <strong>{patientData.patient.hba1c ?? 'N/A'}%</strong></p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { label: 'Weight', value: `${patientData.patient.weight ?? '?'} kg` },
                    { label: 'Carb Target', value: `${patientData.patient.carbTarget}g/day` },
                    { label: 'Medications', value: Array.isArray(patientData.patient.medications) ? patientData.patient.medications.length : '?' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2 text-center">
                      <p className="text-sm font-semibold">{value}</p>
                      <p className="text-xs text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {[
                  { key: 'glucose', label: 'Glucose', icon: TrendingUp },
                  { key: 'food', label: 'Food Log', icon: Utensils },
                  { key: 'notes', label: 'Notes', icon: FileText },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
                  >
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>

              {tab === 'glucose' && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Glucose (30 days)</h3>
                  {glucoseChart.length === 0 ? (
                    <p className="text-gray-400 text-sm">No glucose readings</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={glucoseChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={6} />
                        <YAxis domain={[50, 300]} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {tab === 'food' && (
                <div className="card space-y-2">
                  <h3 className="font-semibold mb-2">Recent Food Logs</h3>
                  {patientData.foodLogs.length === 0 ? (
                    <p className="text-gray-400 text-sm">No food logs</p>
                  ) : patientData.foodLogs.slice(0, 15).map((l) => (
                    <div key={l.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div>
                        <span className="text-xs font-medium text-gray-500 capitalize">{l.mealType.toLowerCase()}</span>
                        <p className="text-sm">{Array.isArray(l.foodsJson) ? l.foodsJson.slice(0, 3).map((f) => f.name).join(', ') : ''}</p>
                        <p className="text-xs text-gray-400">{format(new Date(l.timestamp), 'MMM d, h:mm a')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-brand-600">{Math.round(l.totalCarbs)}g</p>
                        <p className="text-xs text-gray-400">{Math.round(l.totalCalories)} kcal</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'notes' && (
                <div className="card space-y-4">
                  <h3 className="font-semibold">Clinical Notes</h3>
                  <div className="space-y-3">
                    <textarea
                      className="input resize-none"
                      rows={3}
                      placeholder="Add a clinical note…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      aria-label="Clinical note content"
                    />
                    <input
                      type="text"
                      className="input text-sm"
                      placeholder="Dietary restrictions (optional)"
                      value={restrictions}
                      onChange={(e) => setRestrictions(e.target.value)}
                      aria-label="Dietary restrictions"
                    />
                    <button onClick={addNote} disabled={savingNote || !noteText.trim()} className="btn-primary text-sm">
                      {savingNote ? 'Saving…' : 'Add Note'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {patientData.notes.map((n) => (
                      <div key={n.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                        <p className="text-sm">{n.content}</p>
                        {n.restrictions && <p className="text-xs text-amber-600 mt-1">⚠ Restriction: {n.restrictions}</p>}
                        <p className="text-xs text-gray-400 mt-2">Dr. {n.doctor.name} • {format(new Date(n.createdAt), 'MMM d, yyyy')}</p>
                      </div>
                    ))}
                    {patientData.notes.length === 0 && <p className="text-gray-400 text-sm">No notes yet</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
