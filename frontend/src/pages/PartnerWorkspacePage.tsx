import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/api';

type AdminUser = { id: string; full_name?: string | null; email: string; role: string; is_active: boolean; is_verified: boolean; created_at: string };
type UserResponse = { items: AdminUser[]; total: number; page: number; page_size: number; pages: number };
const Card: React.FC<{ label: string; value: string | number; note: string }> = ({ label, value, note }) =>
  <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></section>;

export const PartnerWorkspacePage: React.FC = () => {
  const [data, setData] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [brandName, setBrandName] = useState('NUVYRA');
  const [accent, setAccent] = useState('#38bdf8');

  useEffect(() => {
    let active = true;
    apiClient.get<UserResponse>('/admin/users', { params: { page: 1, page_size: 100 } })
      .then(({ data: response }) => { if (active) setData(response); })
      .catch((e: any) => { if (active) setError(e?.message || 'Platform administration data could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const users = data?.items || [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(u => !term || [u.full_name, u.email, u.role].some(v => String(v || '').toLowerCase().includes(term)));
  }, [users, search]);
  const activeCount = users.filter(u => u.is_active).length;
  const verifiedCount = users.filter(u => u.is_verified).length;
  const roles = users.reduce<Record<string, number>>((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});

  return <div className="space-y-7">
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-violet-300">NUVYRA · Partner</p><h1 className="mt-2 text-3xl font-semibold text-white">Partner administration</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A platform administration workspace for account oversight and a first-pass white-label identity preview.</p></div>
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-xs text-violet-200">Administrator access</div>
    </header>

    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-sm font-medium text-amber-100">Partner features are not yet connected to tenant infrastructure</p><p className="mt-1 text-xs leading-5 text-amber-100/70">This workspace currently uses the existing platform administrator API. Organisation-level data separation, partner invitations, billing, integration credentials and persisted white-label settings are not implemented. Do not use this prototype as a multi-tenant customer portal.</p></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Platform accounts" value={loading ? '—' : data?.total ?? 0} note="Total reported by administrator API" />
      <Card label="Active accounts" value={loading ? '—' : activeCount} note="Among the first 100 loaded accounts" />
      <Card label="Verified accounts" value={loading ? '—' : verifiedCount} note="Among the first 100 loaded accounts" />
      <Card label="Roles represented" value={loading ? '—' : Object.keys(roles).length} note="Among the first 100 loaded accounts" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Account directory</h2><p className="mt-1 text-xs text-slate-500">Read-only overview from the protected administrator endpoint.</p></div><input aria-label="Search accounts" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400" /></div>
        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error} This panel requires the administrator role.</div>}
        {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading account directory…</p> : <div className="mt-4 space-y-2">{filtered.map(u => <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-200">{u.full_name || 'Name not provided'}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div><div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{u.role}</span><span className={`rounded-full px-2 py-1 ${u.is_active ? 'bg-teal-500/10 text-teal-200' : 'bg-rose-500/10 text-rose-200'}`}>{u.is_active ? 'Active' : 'Inactive'}</span><span className="text-slate-500">{u.is_verified ? 'Verified' : 'Unverified'}</span></div></div>)}{!filtered.length && <p className="py-8 text-center text-sm text-slate-500">No matching accounts.</p>}</div>}
        {data && <p className="mt-3 text-[10px] text-slate-600">Showing {users.length} of {data.total} total accounts. Pagination is not yet exposed in this view.</p>}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-lg font-semibold text-white">Workspace identity preview</h2><p className="mt-1 text-xs leading-5 text-slate-500">Preview-only controls. Values are held in this browser session and are not published or saved to an organisation.</p>
        <label className="mt-5 block text-xs text-slate-400">Display name<input value={brandName} onChange={e => setBrandName(e.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-400" /></label>
        <label className="mt-4 block text-xs text-slate-400">Accent colour<div className="mt-2 flex items-center gap-3"><input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-11 w-14 rounded-lg border border-slate-700 bg-slate-950 p-1" /><span className="font-mono text-xs text-slate-300">{accent.toUpperCase()}</span></div></label>
        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-5"><p className="text-[10px] uppercase tracking-widest text-slate-500">Live preview</p><div className="mt-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-slate-950" style={{ backgroundColor: accent }}>{(brandName.trim()[0] || 'N').toUpperCase()}</div><div><p className="font-semibold text-white">{brandName.trim() || 'Your workspace'}</p><p className="text-xs text-slate-500">Partner workspace</p></div></div><div className="mt-4 h-1.5 rounded-full" style={{ backgroundColor: accent }} /></div>
        <p className="mt-4 text-[11px] text-slate-600">Saving branding requires a tenant model, scoped configuration API and audit trail.</p>
      </section>
    </div>

    <section className="grid gap-4 md:grid-cols-3">
      {[['Integrations','Not connected','OAuth / API integrations need partner-scoped credentials and secret storage.'],['Billing & plans','Not connected','No billing provider, subscription model or invoice endpoints are configured.'],['Partner analytics','Limited','Current metrics are platform account counts only; usage and cohort analytics are not available.']].map(([name,status,detail])=><div key={name} className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><p className="text-sm font-semibold text-white">{name}</p><p className="mt-2 text-xs font-medium text-violet-200">{status}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></div>)}
    </section>
  </div>;
};
export default PartnerWorkspacePage;
