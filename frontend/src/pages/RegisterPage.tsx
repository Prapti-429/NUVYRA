import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NuvyraLogo } from '../components/common/NuvyraLogo';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (
      password.length < 12 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      setErrorMsg('Use at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a special character.');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, fullName);
      navigate('/login-flashcard', { replace: true });
    } catch (err: any) {
      if (err.response) {
        const detail = err.response.data?.detail;
        if (Array.isArray(detail)) {
          setErrorMsg(detail.map((d: any) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(', '));
        } else if (typeof detail === 'string') {
          setErrorMsg(detail);
        } else {
          setErrorMsg(`Server returned status ${err.response.status}: ${err.response.statusText}`);
        }
      } else if (err.request) {
        setErrorMsg('Unable to reach the backend. Please wait a moment and try again.');
      } else {
        setErrorMsg(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <NuvyraLogo size="lg" className="justify-center" />
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">
          Create NUVYRA Account
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          New here? Create your account. Returning participant? Use the same email and password to continue your existing NUVYRA record.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#111827] py-8 px-6 sm:px-10 border border-slate-800 rounded-2xl shadow-2xl space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs break-words">
              {errorMsg}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name <span className="text-slate-500">(new accounts)</span></label>
              <input type="text" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="Alex Morgan" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="researcher@nuvyra.health" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 pr-20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">At least 12 characters, with uppercase and lowercase letters, a number, and a special character. If this email already exists, your account is resumed only after your password is verified.</p>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md disabled:opacity-50">
              {loading ? 'Checking account...' : 'Continue'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <span className="text-xs text-slate-400">
              Returning to NUVYRA?{' '}
              <Link to="/login" className="text-sky-400 hover:text-sky-300 font-semibold">Sign In</Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
