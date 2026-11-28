import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../services/api';
import { NuvyraLogo } from '../components/common/NuvyraLogo';
import { warmBackend } from '../services/api';

export const ForgotPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => { void warmBackend(); }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (token && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (token && password.length < 12) {
      setError('Your new password must contain at least 12 characters.');
      return;
    }
    if (token && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password))) {
      setError('Use uppercase and lowercase letters, a number and a special character.');
      return;
    }

    setLoading(true);
    try {
      if (token) {
        const response = await apiClient.post('/auth/reset-password', {
          token,
          new_password: password,
        });
        setMessage(response.data?.detail || 'Your password has been reset. Please sign in.');
      } else {
        const response = await apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
        setMessage(response.data?.detail || 'If an account exists for that email, a reset link will be sent shortly.');
        setResendCountdown(15);
      }
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || requestError?.message || 'We could not complete this request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim() || resendCountdown > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setMessage(response.data?.detail || 'If an account exists for that email, a reset link will be sent shortly.');
      setResendCountdown(15);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || requestError?.message || 'We could not resend the email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <NuvyraLogo size="lg" className="justify-center" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
          {token ? 'Create a new password' : 'Reset your password'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {token ? 'Choose a new password for your NUVYRA account.' : 'Enter the email address associated with your NUVYRA account. We will send a secure reset link if an account matches.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#111827] py-8 px-6 sm:px-10 border border-slate-800 rounded-2xl shadow-2xl space-y-5">
          {message && <div role="status" className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">{message}</div>}
          {error && <div role="alert" className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{error}</div>}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!token ? (
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500" placeholder="you@example.com" />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="new-password" className="block text-xs font-medium text-slate-300 mb-1">New password</label>
                  <input id="new-password" type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500" placeholder="At least 12 characters" />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-300 mb-1">Confirm new password</label>
                  <input id="confirm-password" type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500" placeholder="Enter the new password again" />
                </div>
                <p className="text-xs leading-5 text-slate-500">Use at least 12 characters, including uppercase and lowercase letters, a number, and a special character.</p>
              </>
            )}
            <button type="submit" disabled={loading || !!message} className="w-full bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {loading ? 'Please wait…' : token ? 'Save new password' : 'Send reset link'}
            </button>
          </form>
          {!token && message && (
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-400">Didn't receive the email? Check your spam folder, or request another link.</p>
              {resendCountdown > 0 ? (
                <p className="text-sm text-slate-400" aria-live="polite">Resend available in {resendCountdown}s</p>
              ) : (
                <button type="button" onClick={handleResend} disabled={loading} className="text-sm font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50">
                  {loading ? 'Sending…' : 'Resend reset link'}
                </button>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 text-center">
            <Link to="/login" className="text-sm text-sky-400 hover:text-sky-300 font-semibold">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
