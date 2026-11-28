import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NuvyraLogo } from '../components/common/NuvyraLogo';
import { warmBackend } from '../services/api';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void warmBackend(); }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg(null);
    if (password.length < 12) {
      setErrorMsg('Use a password with at least 12 characters.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setErrorMsg('Your password needs an uppercase letter, a lowercase letter, a number and a special character.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('The passwords do not match. Please check them and try again.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, fullName.trim());
      navigate('/', { replace: true });
    } catch (err: any) {
      const networkFailure = err?.isNetworkError || err?.code === 'NETWORK_ERROR' || err?.code === 'ECONNABORTED';
      setErrorMsg(
        networkFailure
          ? 'NUVYRA could not reach the server. Check your internet connection and try again. Your account has not been confirmed.'
          : err?.message || 'We could not create your account. Please review your details and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex flex-col justify-center py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <NuvyraLogo size="lg" className="justify-center" />
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">Create your NUVYRA account</h2>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Create an account to begin. If you already have an account, sign in with its existing email and password instead of registering again.
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#111827] py-8 px-6 sm:px-10 border border-slate-800 rounded-2xl shadow-2xl space-y-6">
          {errorMsg && <div role="alert" aria-live="polite" className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs break-words">{errorMsg}</div>}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="register-name" className="block text-xs font-medium text-slate-300 mb-1">Full name</label>
              <input id="register-name" type="text" required maxLength={255} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="Your name" />
            </div>
            <div>
              <label htmlFor="register-email" className="block text-xs font-medium text-slate-300 mb-1">Email address</label>
              <input id="register-email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input id="register-password" type={showPassword ? 'text' : 'password'} required minLength={12} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 pr-20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="Create a strong password" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">At least 12 characters, with uppercase and lowercase letters, a number and a special character.</p>
            </div>
            <div>
              <label htmlFor="register-confirm-password" className="block text-xs font-medium text-slate-300 mb-1">Confirm password</label>
              <input id="register-confirm-password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" placeholder="Enter the password again" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-semibold py-3 rounded-xl text-sm transition-all shadow-md disabled:opacity-50">
              {loading ? 'Creating your secure account…' : 'Create account'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <span className="text-xs text-slate-400">Already have an account? <Link to="/login" className="text-sky-400 hover:text-sky-300 font-semibold">Sign in</Link></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
