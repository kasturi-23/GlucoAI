import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader2 } from 'lucide-react';

const DIABETES_TYPES = [
  { value: 'TYPE_1', label: 'Type 1' },
  { value: 'TYPE_2', label: 'Type 2' },
  { value: 'GESTATIONAL', label: 'Gestational' },
  { value: 'PREDIABETES', label: 'Pre-diabetes' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form, setForm]     = useState({ name: '', email: '', password: '', role: 'PATIENT', diabetesType: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  function set(f) { return (e) => setForm((v) => ({ ...v, [f]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const user = await register(form);
      navigate(user.role === 'PATIENT' ? '/' : '/doctor');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🩺</div>
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="text-gray-400 text-sm mt-1">Join GlucoAI to manage your diabetes with AI</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium mb-1">Full Name</label>
            <input id="reg-name" type="text" className="input" value={form.name} onChange={set('name')} required placeholder="Jane Doe" />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium mb-1">Email</label>
            <input id="reg-email" type="email" autoComplete="email" className="input" value={form.email} onChange={set('email')} required placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium mb-1">Password</label>
            <input id="reg-password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={set('password')} required minLength={8} placeholder="Min. 8 characters" />
          </div>
          <div>
            <label htmlFor="reg-role" className="block text-sm font-medium mb-1">I am a…</label>
            <select id="reg-role" className="input" value={form.role} onChange={set('role')}>
              <option value="PATIENT">Patient</option>
              <option value="DOCTOR">Doctor</option>
              <option value="DIETITIAN">Dietitian</option>
            </select>
          </div>
          {form.role === 'PATIENT' && (
            <div>
              <label htmlFor="reg-dtype" className="block text-sm font-medium mb-1">Diabetes Type</label>
              <select id="reg-dtype" className="input" value={form.diabetesType} onChange={set('diabetesType')}>
                <option value="">Select type…</option>
                {DIABETES_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg" role="alert">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
