import React, { useEffect, useMemo, useState } from 'react';
import { TrendChart } from '../components/common/TrendChart';
import { InfoButton } from '../components/common/InfoButton';
import { aiService, AIAnalysisResponse, AIHistoryPoint } from '../services/aiService';

const explain: Record<string, string> = {
  voice_pitch_hz: 'How high or low the voice sounds. NUVYRA looks mainly for change from your own usual pattern.',
  voice_rms: 'A simple measure of sound strength. It is affected by distance from the microphone and background noise.',
  voice_speech_activity: 'An estimate of how much of the recording contained active speech.',
  face_motion: 'How much visible image movement was detected between camera frames. It is not a clinical facial test.',
  face_luminance_variability: 'How much brightness changed in the camera image. Lighting can affect this value.',
  blink_rate_per_minute: 'A camera-based estimate of blinking. It is not an eye examination.',
  eye_opening_proxy: 'An estimate of visible eye opening from the camera. It can be affected by lighting and camera position.',
  gait_motion: 'An estimate of visible movement during a movement check. It is not a clinical gait test.',
  gait_variability: 'How much the visible movement changed during the sample.',
  breathing_rate_per_minute: 'A visual estimate of breathing-related rhythm. It is not a medical breathing measurement.',
  breathing_variability: 'How much the estimated breathing-related pattern varied during the sample.',
  head_motion: 'An estimate of visible head movement across camera frames.',
  head_motion_variability: 'How much visible head movement changed during the sample.',
};

const label = (name: string) => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(' Hz','');

function personalRange(values: number[]) {
  if (values.length < 5) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { min: Math.max(0, mean - 1.5 * sd), max: Math.min(100, mean + 1.5 * sd) };
}

export const TrendsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'7d'|'30d'|'90d'>('30d');
  const [history, setHistory] = useState<AIHistoryPoint[]>([]);
  const [latest, setLatest] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true; setLoading(true);
    Promise.all([aiService.history(90), aiService.latest().catch(() => null)]).then(([h, l]) => { if (active) { setHistory(h.items || []); setLatest(l); } }).catch((e: any) => { if (active) setError(e?.message || 'Unable to load your longitudinal data.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => history.slice(-(timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90)), [history, timeRange]);
  const scores = visible.map(p => p.score);
  const range = personalRange(scores);
  const current = visible[visible.length - 1];
  const chartData = visible.map(p => ({ date: new Date(p.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: Number(p.score.toFixed(1)), baselineMin: range?.min, baselineMax: range?.max }));
  const inRange = current && range ? current.score >= range.min && current.score <= range.max : null;
  const features = latest?.features || [];

  return <div className="space-y-8">
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Data & Trends</h1><p className="text-slate-400 text-sm mt-1">A graphical view of your recorded patterns and how they compare with your own history.</p></div><div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1">{(['7d','30d','90d'] as const).map(r => <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 text-xs rounded-lg ${timeRange===r?'bg-sky-500 text-slate-950 font-bold':'text-slate-400'}`}>{r.toUpperCase()}</button>)}</div></header>
    {error && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}
    {loading ? <div className="rounded-2xl bg-[#111827] border border-slate-800 p-10 text-center text-sm text-slate-400">Loading your longitudinal data…</div> : <>
      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6"><div className="flex items-center gap-2"><h2 className="text-base font-bold text-white">Your current pattern vs your usual frame</h2><InfoButton title="How to read this">The shaded frame is your personal recent range when enough history exists. It is not a universal medical ideal. NUVYRA mainly asks whether today's pattern is different from your own usual pattern.</InfoButton></div>
        {current ? <div className="mt-6 space-y-5"><div className="grid md:grid-cols-3 gap-4">{[['Today', current.score.toFixed(1), 'Latest saved multimodal AI score.'],['Your usual frame', range ? `${range.min.toFixed(1)}–${range.max.toFixed(1)}` : 'Building', 'Your own recent score range, shown only after enough usable history exists.'],['Pattern', inRange===null?'Need more history':inRange?'Within your usual pattern':'Different from your usual pattern','One different reading does not prove that something is wrong. Repeated change matters more.'],['Check-ins', `${history.length}`, 'The pattern is compared with your own recorded check-ins, not a universal medical range.']].map(([t,v,h])=><div key={t} className="rounded-xl bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs text-slate-400">{t}<InfoButton title={t}>{h}</InfoButton></div><strong className="mt-2 block text-lg text-white">{v}</strong></div>)}</div><div className="rounded-xl border border-slate-700 bg-slate-950 p-5"><div className="text-xs text-slate-400 mb-3">Personal reference frame</div><div className="relative h-12 rounded-full border border-slate-700 bg-slate-900 overflow-hidden">{range ? <div className="absolute inset-y-0" style={{left:`${range.min}%`,right:`${100-range.max}%`}}><div className="h-full bg-sky-500/20 border-x border-sky-400/40" /></div> : <div className="h-full flex items-center justify-center text-xs text-slate-500">More check-ins are needed to build your personal frame</div>}{range && <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-sky-400" style={{left:`${Math.min(98,Math.max(2,current.score))}%`}} title={`Today: ${current.score.toFixed(1)}`} />}</div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Lower</span><span>Your recent usual range</span><span>Higher</span></div></div></div> : <p className="mt-5 text-sm text-slate-400">Complete a daily check-in to begin your personal frame.</p>}
      </section>

      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6 sm:p-8"><div className="flex items-center gap-2 mb-3"><h2 className="text-base font-bold text-white">Longitudinal graphical history</h2><InfoButton title="Graph">Each point is from a saved AI check-in. The frame is based on your own recent history when enough data exists.</InfoButton></div>{chartData.length ? <TrendChart data={chartData} height={320} label="Multimodal AI trajectory" metricUnit="score" /> : <div className="h-60 flex items-center justify-center rounded-xl bg-slate-900/40 border border-slate-800 text-sm text-slate-400">No longitudinal trend data recorded yet.</div>}</section>

      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6"><div className="flex items-center gap-2 mb-4"><h2 className="text-base font-bold text-white">Latest measured parameters</h2><InfoButton title="Parameters">These are numerical measurements produced from available check-in signals. They are not medical diagnoses. A missing parameter means that usable data was not available.</InfoButton></div>{features.length ? <div className="grid md:grid-cols-2 gap-3">{features.map(f => <div key={`${f.category}-${f.name}`} className="rounded-xl bg-slate-900 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-white">{label(f.name)}</p><p className="text-[11px] text-slate-500 mt-1">{f.category}</p></div><InfoButton title={label(f.name)}>{explain[f.name] || 'This is a numerical signal used by the NUVYRA AI pipeline. It is interpreted mainly against your personal history and data quality.'}</InfoButton></div><div className="mt-3 flex items-end justify-between"><strong className="text-xl text-white">{Number(f.value).toFixed(3)}</strong>{f.deviation !== null && f.deviation !== undefined && <span className="text-xs text-slate-400">change: {Number(f.deviation).toFixed(2)}</span>}</div></div>)}</div> : <p className="text-sm text-slate-500">The latest feature details will appear after a completed AI check-in.</p>}</section>

      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6"><div className="flex items-center gap-2"><h2 className="text-base font-bold text-white">How NUVYRA assesses your data</h2><InfoButton title="AI assessment">NUVYRA checks data quality, handles missing or weak signals, compares usable measurements with your personal baseline, looks for repeated changes and combines available modalities. It produces an observational research signal, not a diagnosis.</InfoButton></div><div className="mt-5 grid md:grid-cols-4 gap-3">{[['1','Quality','Checks whether data is usable.'],['2','Baseline','Learns your own usual pattern.'],['3','Change','Looks for meaningful deviation and persistence.'],['4','Fusion','Combines available signals without pretending missing data exists.']].map(([n,t,d])=><div key={t} className="rounded-xl bg-slate-900 p-4"><span className="text-sky-300 font-semibold">{n}</span><p className="mt-1 font-medium text-white">{t}</p><p className="mt-1 text-xs leading-5 text-slate-500">{d}</p></div>)}</div></section>
    </>}
  </div>;
};
