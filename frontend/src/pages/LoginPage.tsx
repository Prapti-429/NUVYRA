import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NuvyraLogo } from '../components/common/NuvyraLogo';
import { warmBackend } from '../services/api';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { void warmBackend(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      // Let the account-specific first-visit redirect decide whether the user
      // needs the onboarding tour or should go directly to the dashboard.
      navigate('/', { replace: true });
    } catch (err: any) {
      const serverMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message;
      const networkFailure = err?.isNetworkError || err?.code === 'NETWORK_ERROR' || err?.code === 'ECONNABORTED';
      setErrorMsg(
        networkFailure
          ? 'NUVYRA could not reach the server. Check your internet connection and try again. If this is your first request, the server may still be waking up.'
          : typeof serverMessage === 'string' && serverMessage.trim()
            ? serverMessage
            : 'Sign-in could not be completed. Please check your details and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <NuvyraLogo size="lg" className="justify-center" />
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">
          Sign in to NUVYRA
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Access your personal longitudinal health intelligence.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#111827] py-8 px-6 sm:px-10 border border-slate-800 rounded-2xl shadow-2xl space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                placeholder="researcher@nuvyra.health"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-300">Password</label>
                <Link to="/forgot-password" className="text-xs font-semibold text-sky-400 hover:text-sky-300">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 pr-20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md disabled:opacity-50"
            >
              {loading ? 'Connecting securely…' : 'Sign In'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <span className="text-xs text-slate-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-sky-400 hover:text-sky-300 font-semibold">
                Register
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
