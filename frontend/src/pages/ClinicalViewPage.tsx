import React, { useEffect, useMemo, useState } from 'react';
import { InfoButton } from '../components/common/InfoButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { aiService, AIAnalysisResponse } from '../services/aiService';
import { clinicalService } from '../services/clinicalService';
import { LabResult, MedicationRegimen, Patient, SymptomLog, VitalSigns } from '../types/clinical';

const fmt = (value?: number | string | null, suffix = '') => value === undefined || value === null || value === '' ? 'Not recorded' : `${value}${suffix}`;
const dateTime = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
const titleCase = (value: string) => value.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const signalCatalog: Record<string, { domain: string; observed: string; acquisition: string; factors: string; meaning: string; limitation: string }> = {


const fallbackCatalog = (name: string) => ({ domain: 'Derived feature', observed: titleCase(name), acquisition: 'Daily check-in answer', factors: 'Device, environment, task conditions and individual variability', meaning: 'A self-reported observation intended for within-person review', limitation: 'Experimental research feature; not independently validated for clinical diagnosis' });

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-800 bg-[#111827] overflow-hidden">
    <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
      <div><h2 className="text-base font-semibold text-white">{title}</h2>{subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}</div>
    </div>
    <div className="p-5 sm:p-6">{children}</div>
  </section>
);

export const ClinicalViewPage: React.FC = () => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<VitalSigns[]>([]);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [medications, setMedications] = useState<MedicationRegimen[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const profile = await clinicalService.getMyPatientProfile();
        if (!active) return;
        setPatient(profile);
        const [v, l, s, m, a] = await Promise.all([
          clinicalService.getPatientVitals(profile.id, 1, 50).catch(() => ({ items: [] as VitalSigns[] })),
          clinicalService.getPatientLabs(profile.id, undefined, 1, 50).catch(() => ({ items: [] as LabResult[] })),
          clinicalService.getPatientSymptoms(profile.id, 1, 50).catch(() => ({ items: [] as SymptomLog[] })),
          clinicalService.getPatientMedications(profile.id, false).catch(() => [] as MedicationRegimen[]),
          aiService.latest().catch(() => null),
        ]);
        if (!active) return;
        setVitals(v.items || []); setLabs(l.items || []); setSymptoms(s.items || []); setMedications(m || []); setAnalysis(a);
      } catch (e: any) {
        if (active) setError(e?.message || 'Clinical profile data is not available for this account.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const latestVitals = vitals[0];
  const latestSymptoms = symptoms.slice(0, 6);
  const latestLabs = labs.slice(0, 8);
  const activeMeds = medications.filter(m => m.is_active);
  const features = analysis?.features || [];
  const present = analysis?.modalities_present || [];
  const missing = analysis?.missing_modalities || [];
  const quality = analysis?.data_quality_score;
  const observationCount = analysis?.baseline_observations ?? 0;

  const baselineReady = observationCount >= 5;
  const modalityRows = useMemo(() => [
    ['Daily check-in answers', present.includes('survey'), 'Self-reported mood, fatigue, energy, sleep, stress, concentration and physical comfort', 'Answers entered by the user'],
  ], [present]);

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-[#111827] to-[#111827] p-5 sm:p-7">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2"><span className="px-2 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-[10px] font-semibold uppercase tracking-wider text-sky-300">Research clinical view</span><InfoButton title="Clinical View">This view organises patient-entered check-in answers, saved history and structured clinical records. The current personal-pattern index uses self-reported answers only. It does not diagnose, triage or replace clinical judgement.</InfoButton></div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Clinical View</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-3xl leading-6">A longitudinal workspace for what the person reported, what records are available, and what still needs review.</p>
          </div>
          <button type="button" onClick={() => setShowGuide(v => !v)} className="shrink-0 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-sky-500/40">{showGuide ? 'Hide interpretation guide' : 'How to read this view'}</button>
        </div>
        {showGuide && <div className="mt-5 grid md:grid-cols-4 gap-3 text-xs"><div className="rounded-xl bg-slate-950/50 border border-slate-800 p-4"><b className="text-white">Observed</b><p className="text-slate-400 mt-1">The computational or reported quantity actually recorded.</p></div><div className="rounded-xl bg-slate-950/50 border border-slate-800 p-4"><b className="text-white">How</b><p className="text-slate-400 mt-1">The sensor, task or data source used to obtain it.</p></div><div className="rounded-xl bg-slate-950/50 border border-slate-800 p-4"><b className="text-white">Factors</b><p className="text-slate-400 mt-1">Conditions that can change the measurement without representing disease.</p></div><div className="rounded-xl bg-slate-950/50 border border-slate-800 p-4"><b className="text-white">Meaning</b><p className="text-slate-400 mt-1">The appropriate longitudinal interpretation—not a diagnosis.</p></div></div>}
      </div>

      {error && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">{error} The page will still show the full interpretation framework and any available research analysis.</div>}

      <Section title="Patient / record context" subtitle="Saved clinical context is separate from the personal check-in index. Uploaded document summaries are background information, not numeric score inputs.">
        {loading ? <div className="text-sm text-slate-500">Loading clinical record…</div> : <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[['Patient', patient ? `${patient.first_name} ${patient.last_name}` : 'Not available'], ['Age / sex', patient ? `${patient.age} · ${patient.sex}` : 'Not available'], ['Primary diagnosis', patient?.primary_diagnosis || 'Not recorded'], ['Disease phase', patient?.disease_phase || 'Not recorded'], ['Disease status', patient?.current_disease_status || 'Not recorded'], ['Treatment phase', patient?.treatment_phase || 'Not recorded'], ['Diagnosis date', patient?.date_of_diagnosis || 'Not recorded'], ['Last profile update', dateTime(patient?.updated_at)]].map(([k,v]) => <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4"><span className="text-[10px] uppercase tracking-wider text-slate-500">{k}</span><p className="text-sm font-medium text-slate-200 mt-1 break-words">{v}</p></div>)}
        </div>}
      </Section>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><span className="text-[10px] uppercase text-slate-500">Personal pattern index</span><p className="text-3xl font-bold text-white mt-1">{analysis ? (baselineReady ? Math.round(analysis.overall_score) : 'Building') : '—'}</p><p className="text-xs text-slate-500 mt-1">Shown after five check-ins; not a medical score</p></div>
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><span className="text-[10px] uppercase text-slate-500">Trend</span><p className="text-lg font-semibold text-white mt-2">{analysis ? (baselineReady ? analysis.trend : 'Building') : 'Not available'}</p><p className="text-xs text-slate-500 mt-1">Compared with personal history</p></div>
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><span className="text-[10px] uppercase text-slate-500">Data quality</span><p className="text-3xl font-bold text-white mt-1">{quality !== undefined ? `${Math.round(quality * 100)}%` : '—'}</p><p className="text-xs text-slate-500 mt-1">Required answers complete; not accuracy</p></div>
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><span className="text-[10px] uppercase text-slate-500">Baseline observations</span><p className="text-3xl font-bold text-white mt-1">{observationCount || '—'}</p><p className="text-xs text-slate-500 mt-1">Repeated observations available</p></div>
      </div>

      <Section title="What was observed and how" subtitle="Only the daily check-in answers contribute to the current personal-pattern index. Audio and video measurements are not collected in the standard check-in.">
        <div className="overflow-x-auto"><table className="w-full text-left min-w-[760px]"><thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500"><th className="pb-3 pr-4">Modality</th><th className="pb-3 pr-4">Status</th><th className="pb-3 pr-4">Observed information</th><th className="pb-3">Acquisition</th></tr></thead><tbody>{modalityRows.map(([name, ok, observed, acquisition]) => <tr key={String(name)} className="border-b border-slate-800/60"><td className="py-4 pr-4 text-sm font-medium text-white">{name}</td><td className="py-4 pr-4"><StatusBadge status={ok ? 'stable' : 'neutral'} label={ok ? 'Available' : 'Not available'} size="sm" /></td><td className="py-4 pr-4 text-xs text-slate-300">{observed}</td><td className="py-4 text-xs text-slate-500">{acquisition}</td></tr>)}</tbody></table></div>
        {missing.length > 0 && <p className="mt-4 text-xs text-amber-300">Missing modalities in the latest analysis: {missing.join(', ')}. Missing data reduces interpretability and should not be treated as a normal result.</p>}
      </Section>

      <Section title="Daily check-in detail" subtitle="Each answer is shown with a plain-language explanation and its limitations.">
        {features.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No saved check-in answers are available yet. Complete a daily check-in to see your recorded reflections here.</div> : <div className="space-y-3">{features.map((feature, index) => { const c = signalCatalog[feature.name] || fallbackCatalog(feature.name); return <details key={`${feature.name}-${index}`} className="group rounded-xl border border-slate-800 bg-slate-950/30 open:bg-slate-950/50"><summary className="list-none cursor-pointer p-4"><div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-white">{titleCase(feature.name)}</h3><InfoButton title={c.observed}>{c.meaning}</InfoButton></div><p className="text-[11px] text-slate-500 mt-1">{c.domain} · {c.observed}</p></div><div className="flex items-center gap-4"><div><span className="text-[9px] uppercase text-slate-600">Observed value</span><p className="text-sm font-mono text-sky-300">{fmt(feature.value)}</p></div>{feature.deviation !== null && feature.deviation !== undefined && <div><span className="text-[9px] uppercase text-slate-600">vs personal baseline</span><p className="text-sm font-mono text-slate-300">{feature.deviation > 0 ? '+' : ''}{feature.deviation.toFixed(3)}</p></div>}<span className="text-slate-600 group-open:rotate-180 transition-transform">⌄</span></div></div></summary><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 px-4 pb-4"><div className="rounded-lg bg-slate-900/70 p-3"><b className="text-[10px] uppercase tracking-wider text-slate-500">What is observed</b><p className="text-xs text-slate-300 mt-1 leading-5">{c.observed}</p></div><div className="rounded-lg bg-slate-900/70 p-3"><b className="text-[10px] uppercase tracking-wider text-slate-500">How it is measured</b><p className="text-xs text-slate-300 mt-1 leading-5">{c.acquisition}</p></div><div className="rounded-lg bg-slate-900/70 p-3"><b className="text-[10px] uppercase tracking-wider text-slate-500">Factors / confounders</b><p className="text-xs text-slate-300 mt-1 leading-5">{c.factors}</p></div><div className="rounded-lg bg-slate-900/70 p-3"><b className="text-[10px] uppercase tracking-wider text-slate-500">What it means</b><p className="text-xs text-slate-300 mt-1 leading-5">{c.meaning}</p></div><div className="md:col-span-2 xl:col-span-4 rounded-lg border border-amber-500/10 bg-amber-500/5 p-3"><b className="text-[10px] uppercase tracking-wider text-amber-300/80">Clinical / research limitation</b><p className="text-xs text-slate-400 mt-1 leading-5">{c.limitation}. Do not use this feature as an isolated diagnostic threshold.</p></div></div></details>; })}</div>}
      </Section>

      <div className="grid xl:grid-cols-2 gap-6">
        <Section title="Clinical telemetry" subtitle="Structured vitals recorded outside the digital-biomarker inference layer.">
          {latestVitals ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[['Blood pressure', latestVitals.systolic_bp !== undefined ? `${latestVitals.systolic_bp}/${latestVitals.diastolic_bp ?? '—'} mmHg` : undefined], ['Heart rate', fmt(latestVitals.heart_rate_bpm, ' bpm')], ['Respiratory rate', fmt(latestVitals.respiratory_rate, ' /min')], ['Temperature', fmt(latestVitals.temperature_celsius, ' °C')], ['SpO₂', fmt(latestVitals.spo2_percentage, '%')], ['Pain', fmt(latestVitals.pain_score, ' /10')], ['Fatigue', fmt(latestVitals.fatigue_score, ' /10')], ['Weight', fmt(latestVitals.weight_kg, ' kg')], ['Source', latestVitals.measurement_source]].map(([k,v]) => <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><span className="text-[9px] uppercase text-slate-600">{k}</span><p className="text-sm text-slate-200 mt-1">{v || 'Not recorded'}</p></div>)}<p className="col-span-full text-[11px] text-slate-500">Recorded {dateTime(latestVitals.recorded_at)}. Values are shown as recorded; NUVYRA does not silently apply clinical reference thresholds here.</p></div> : <p className="text-sm text-slate-500">No structured vital signs have been recorded.</p>}
        </Section>

        <Section title="Laboratory results" subtitle="Verified clinical results remain distinct from experimental digital biomarkers.">
          {latestLabs.length ? <div className="space-y-2">{latestLabs.map(l => <div key={l.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div><p className="text-sm font-medium text-white">{l.test_name}</p><p className="text-[11px] text-slate-500">{l.test_category} · {l.collection_date} · {l.verification_status}</p></div><div className="text-right"><p className={`text-sm font-mono ${l.is_abnormal ? 'text-amber-300' : 'text-slate-200'}`}>{l.numerical_value !== undefined ? `${l.numerical_value} ${l.unit || ''}` : l.text_value || '—'}</p>{l.reference_range && <p className="text-[10px] text-slate-600">Ref: {l.reference_range}</p>}</div></div>)}</div> : <p className="text-sm text-slate-500">No laboratory results available.</p>}
        </Section>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <Section title="Symptoms & patient-reported context" subtitle="Reports are preserved as reported and should be interpreted with timing and clinical context.">
          {latestSymptoms.length ? <div className="space-y-2">{latestSymptoms.map(s => <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{s.symptom_name}</p><span className="text-xs text-slate-300">Severity {s.severity}</span></div><p className="text-[11px] text-slate-500 mt-1">{s.frequency || 'Frequency not recorded'} · {s.duration || 'Duration not recorded'} · {s.progression || 'Progression not recorded'}</p>{s.patient_notes && <p className="text-xs text-slate-400 mt-2">{s.patient_notes}</p>}</div>)}</div> : <p className="text-sm text-slate-500">No symptom logs available.</p>}
        </Section>
        <Section title="Medication & adherence context" subtitle="Medication information helps contextualise longitudinal changes; it does not imply causation.">
          {activeMeds.length ? <div className="space-y-2">{activeMeds.map(m => <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{m.medication_name}</p><span className="text-xs text-teal-300">{Math.round(m.adherence_percentage)}% adherence</span></div><p className="text-[11px] text-slate-500 mt-1">{m.dose} · {m.frequency} · {m.route} · {m.drug_class}</p>{m.side_effects_noted && <p className="text-xs text-slate-400 mt-2">Reported side effects: {m.side_effects_noted}</p>}</div>)}</div> : <p className="text-sm text-slate-500">No active medication regimens available.</p>}
        </Section>
      </div>

      <Section title="Saved patient history & document context" subtitle="This section shows what was actually saved or extracted from prior records and what is available as context for the current review.">
        {analysis?.context ? <div className="space-y-5">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><span className="text-[9px] uppercase text-slate-600">Past history records</span><p className="text-sm text-slate-200 mt-1">{analysis.context.past_history_count}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><span className="text-[9px] uppercase text-slate-600">Uploaded documents</span><p className="text-sm text-slate-200 mt-1">{analysis.context.document_count}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><span className="text-[9px] uppercase text-slate-600">Pending reminders</span><p className="text-sm text-slate-200 mt-1">{analysis.context.pending_reminder_count}</p></div>
          </div>
          {analysis.context.history_items?.length ? <div><h3 className="text-sm font-semibold text-white">Saved patient history</h3><div className="mt-2 space-y-2">{analysis.context.history_items.slice(0,10).map((item,i)=><div key={i} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-300">{item}</div>)}</div></div> : null}
          {analysis.context.analyzed_documents?.length ? <div><h3 className="text-sm font-semibold text-white">What was extracted from uploaded documents</h3><div className="mt-2 space-y-3">{analysis.context.analyzed_documents.slice(0,10).map((doc,i)=><div key={i} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium text-white">{doc.filename}</p><span className="text-[10px] text-slate-500">{doc.document_type} · {doc.text_extracted ? 'readable text extracted' : 'no readable text'}</span></div>{doc.summary && <p className="text-xs text-slate-400 mt-2 leading-5">{doc.summary}</p>}<div className="mt-3 grid md:grid-cols-2 gap-2 text-[11px] text-slate-500"><div>Tests: {doc.tests?.length ? doc.tests.join(', ') : 'None identified'}</div><div>Medications: {doc.medications?.length ? doc.medications.join(', ') : 'None identified'}</div><div>Dates: {doc.dates?.length ? doc.dates.join(', ') : 'None identified'}</div><div>Follow-up: {doc.follow_up_mentions?.length ? doc.follow_up_mentions.join('; ') : 'None identified'}</div></div></div>)}</div></div> : <p className="text-sm text-slate-500">No uploaded document analysis is currently available.</p>}
          <p className="text-[11px] text-slate-600">Document findings are contextual information only. NUVYRA does not convert extracted text into a diagnosis or silently assume missing information.</p>
        </div> : <p className="text-sm text-slate-500">No saved patient context is available for the latest observation.</p>}
      </Section>

      <Section title="Personal check-in summary" subtitle="The current pattern index uses self-reported check-in answers only. Audio and video measurements are not included. This is an observational summary, not a clinical diagnosis.">
        <div className="grid lg:grid-cols-2 gap-5">
          <div><h3 className="text-sm font-semibold text-white mb-2">Observed pattern</h3><p className="text-sm leading-6 text-slate-300">{analysis?.explanation || 'No model explanation is available for the latest observation.'}</p></div>
          <div><h3 className="text-sm font-semibold text-white mb-2">Top contributing signals</h3>{analysis?.top_drivers?.length ? <ul className="space-y-2">{analysis.top_drivers.map(x => <li key={x} className="text-sm text-slate-300 flex gap-2"><span className="text-sky-400">•</span>{x}</li>)}</ul> : <p className="text-sm text-slate-500">No contributing signals reported.</p>}</div>
          <div><h3 className="text-sm font-semibold text-white mb-2">Persistence / longitudinal signal</h3><p className="text-sm text-slate-300 leading-6">{analysis?.persistence_signal || 'Not available. Repeated observations are required before a persistent pattern can be evaluated.'}</p></div>
          <div><h3 className="text-sm font-semibold text-white mb-2">Model metadata</h3><p className="text-xs text-slate-400 leading-6">{analysis ? `${analysis.model_name} · ${analysis.model_version} · confidence ${Math.round(analysis.confidence)}% · generated ${dateTime(analysis.generated_at)}` : 'Not available'}</p></div>
        </div>
        {analysis?.recommendations?.length ? <div className="mt-5 rounded-xl border border-sky-500/10 bg-sky-500/5 p-4"><h3 className="text-sm font-semibold text-sky-200">Research follow-up considerations</h3><ul className="mt-2 space-y-1">{analysis.recommendations.map(r => <li key={r} className="text-xs text-slate-300">• {r}</li>)}</ul></div> : null}
        {analysis?.limitations?.length ? <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/5 p-4"><h3 className="text-sm font-semibold text-amber-200">Known limitations for this observation</h3><ul className="mt-2 space-y-1">{analysis.limitations.map(l => <li key={l} className="text-xs text-slate-400">• {l}</li>)}</ul></div> : null}
      </Section>

      <Section title="Interpretation safeguards" subtitle="These rules are part of the clinical-view design, not optional decoration.">
        <div className="grid md:grid-cols-3 gap-4"><div className="rounded-xl border border-slate-800 p-4"><h3 className="text-sm font-semibold text-white">Personal baseline first</h3><p className="text-xs text-slate-400 mt-2 leading-5">Signals are primarily compared with the participant’s repeated observations. A deviation is not automatically abnormal.</p></div><div className="rounded-xl border border-slate-800 p-4"><h3 className="text-sm font-semibold text-white">Context before interpretation</h3><p className="text-xs text-slate-400 mt-2 leading-5">Sleep, stress, illness, medications, environment, device quality and task differences can alter measurements.</p></div><div className="rounded-xl border border-slate-800 p-4"><h3 className="text-sm font-semibold text-white">No isolated diagnosis</h3><p className="text-xs text-slate-400 mt-2 leading-5">NUVYRA’s experimental signals are not validated diagnostic tests and should not replace examination, laboratory testing or clinician judgement.</p></div></div>
      </Section>
    </div>
  );
};

export default ClinicalViewPage;
