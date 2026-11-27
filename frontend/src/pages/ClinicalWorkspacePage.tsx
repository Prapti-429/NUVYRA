import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/api';

type Patient = {
  id: string; user_id: string; first_name: string; last_name: string;
  medical_record_number?: string | null; primary_diagnosis?: string;
  disease_phase?: string | null; current_disease_status?: string | null;
  hospital_affinity?: string | null; age?: number; is_active: boolean;
  created_at: string;
};
type RosterResponse = { items: Patient[]; total: number; page: number; pages: number };

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) =>
  <section className={`rounded-2xl border border-slate-800 bg-[#111827] p-5 ${className}`}>{children}</section>;

export const ClinicalWorkspacePage: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Patient | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.get<RosterResponse>('/patients', { params: { page: 1, page_size: 100, is_active: true } })
      .then(({ data }) => { if (active) { setPatients(data.items || []); setTotal(data.total || 0); } })
      .catch((e: any) => { if (active) setError(e?.message || 'The patient roster could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(p => [p.first_name, p.last_name, p.medical_record_number, p.primary_diagnosis, p.hospital_affinity]
      .some(v => String(v || '').toLowerCase().includes(term)));
  }, [patients, query]);

  return <div className="space-y-7">
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-teal-300">NUVYRA · Clinical</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Clinical workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review the authorised patient roster and open structured patient profiles. Observations are presented as context for professional review, not as automated diagnoses.</p>
      </div>
      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-3 text-xs text-teal-200">Clinician / researcher access</div>
    </header>

    <div className="grid gap-4 sm:grid-cols-3">
      <Panel><p className="text-xs text-slate-500">Active roster</p><p className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : total}</p><p className="mt-1 text-xs text-slate-500">Records returned by the authorised roster API</p></Panel>
      <Panel><p className="text-xs text-slate-500">Loaded in this view</p><p className="mt-2 text-3xl font-semibold text-white">{loading ? '—' : patients.length}</p><p className="mt-1 text-xs text-slate-500">Up to 100 records per page</p></Panel>
      <Panel><p className="text-xs text-slate-500">Workspace status</p><p className="mt-2 text-lg font-semibold text-teal-300">Connected</p><p className="mt-1 text-xs text-slate-500">Roster access is controlled by backend roles</p></Panel>
    </div>

    <Panel>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-white">Patient roster</h2><p className="mt-1 text-xs text-slate-500">Search by name, record number, diagnosis or organisation.</p></div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patients…" aria-label="Search patients" className="w-full sm:w-72 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-teal-400" />
      </div>
      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error} Confirm that this account has clinician, researcher or administrator permissions.</div>}
      {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading authorised patient roster…</p>
        : !filtered.length ? <div className="py-12 text-center"><p className="text-sm text-slate-300">{patients.length ? 'No patients match this search.' : 'No patient profiles are available to this account.'}</p><p className="mt-2 text-xs text-slate-500">The workspace does not create sample patient records.</p></div>
        : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3">Patient</th><th className="px-3 py-3">Record ID</th><th className="px-3 py-3">Clinical context</th><th className="px-3 py-3">Organisation</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead>
          <tbody>{filtered.map(p => <tr key={p.id} className="border-b border-slate-800/70 hover:bg-slate-900/50">
            <td className="px-3 py-4"><p className="font-medium text-white">{p.first_name} {p.last_name}</p><p className="mt-1 text-[11px] text-slate-500">{p.age != null ? `Age ${p.age}` : 'Age not available'}</p></td>
            <td className="px-3 py-4 font-mono text-xs text-slate-400">{p.medical_record_number || p.id.slice(0, 8)}</td>
            <td className="px-3 py-4"><p className="text-slate-200">{p.primary_diagnosis || 'Not recorded'}</p><p className="mt-1 text-[11px] text-slate-500">{p.disease_phase || 'Phase not recorded'}</p></td>
            <td className="px-3 py-4 text-xs text-slate-400">{p.hospital_affinity || 'Not assigned'}</td>
            <td className="px-3 py-4"><span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-1 text-[10px] text-teal-200">{p.current_disease_status || 'Active profile'}</span></td>
            <td className="px-3 py-4"><button type="button" onClick={() => setSelected(p)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-teal-400 hover:text-teal-200">Review profile</button></td>
          </tr>)}</tbody>
        </table></div>}
    </Panel>

    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="patient-profile-title">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-widest text-teal-300">Patient profile</p><h2 id="patient-profile-title" className="mt-2 text-2xl font-semibold text-white">{selected.first_name} {selected.last_name}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">Close</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Record number', selected.medical_record_number || 'Not recorded'],['Age', selected.age ?? 'Not recorded'],['Primary diagnosis', selected.primary_diagnosis || 'Not recorded'],['Disease phase', selected.disease_phase || 'Not recorded'],['Current status', selected.current_disease_status || 'Not recorded'],['Organisation', selected.hospital_affinity || 'Not assigned'],['Profile created', new Date(selected.created_at).toLocaleDateString()],['Profile status', selected.is_active ? 'Active' : 'Inactive']].map(([k,v])=><div key={String(k)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] uppercase text-slate-500">{k}</p><p className="mt-1 text-sm text-slate-200">{String(v)}</p></div>)}</div>
        <p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">This panel displays profile fields returned by the patient roster API. Patient-specific reports, notes and longitudinal observations require a dedicated assigned-care relationship and scoped review endpoints; they are not simulated here.</p>
      </div>
    </div>}
  </div>;
};
export default ClinicalWorkspacePage;
