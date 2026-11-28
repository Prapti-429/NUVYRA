import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/common/StatusBadge';
import { TrendChart } from '../components/common/TrendChart';
import { aiService, AIAnalysisResponse, AIHistoryResponse, BiomarkerFeature } from '../services/aiService';
import { apiClient } from '../services/api';

const signalName = (raw: string) => {
  const k = raw.toLowerCase();
  if (k === 'survey' || /fatigue|mood|energy|sleep|stress|concentration|physical_comfort|symptom_burden/.test(k)) return 'Daily reflection';
  if (/voice|speech|acoustic|pitch|rms|zero.?cross|pause/.test(k)) return 'Voice & speech';
  if (/face|facial|luminance/.test(k)) return 'Facial movement';
  if (/blink|eye/.test(k)) return 'Eyes & blinking';
  if (/gait|movement/.test(k)) return 'Movement';
  if (/breath|resp/.test(k)) return 'Breathing pattern';
  if (/head/.test(k)) return 'Head movement';
  return 'Research signal';
};

const parameterInfo = (raw: string) => {
  const k = raw.toLowerCase();
  if (k.includes('fatigue')) return ['Fatigue', 'self-reported 1–5', 'How tired you felt today. This is your own reflection, not a sensor measurement.'];
  if (k.includes('mood_deviation')) return ['Change from usual', 'self-reported', 'How different today felt compared with your own usual experience.'];
  if (k.includes('symptom_burden')) return ['Selected observations', 'self-reported', 'A count of optional observations you selected. It is not a clinical symptom-severity score.'];
  if (k.includes('energy_level')) return ['Energy', 'self-reported 1–5', 'How your energy felt today, based on your own answer.'];
  if (k.includes('sleep_quality')) return ['Sleep quality', 'self-reported 1–5', 'How restful your sleep felt to you. It is not a sleep-lab measurement.'];
  if (k.includes('stress_level')) return ['Stress', 'self-reported 1–5', 'Your own rating of how stressed you felt today.'];
  if (k.includes('concentration_level')) return ['Concentration', 'self-reported 1–5', 'Your own rating of how easy it felt to focus today.'];
  if (k.includes('physical_comfort')) return ['Physical comfort', 'self-reported choice', 'The comfort option you selected. It is not an examination.'];
  if (k.includes('pitch')) return ['Voice pitch', 'Hz', 'The average frequency of the recorded voice. It describes the sound of the voice; it is not a diagnosis.'];
  if (k.includes('rms')) return ['Voice energy', 'relative audio level', 'An estimate of the strength of the recorded speech signal. Microphone distance and room noise can affect it.'];
  if (k.includes('zero') || k.includes('cross')) return ['Speech sound pattern', 'rate', 'How often the audio waveform crosses its middle level. It describes characteristics of the recorded sound.'];
  if (k.includes('speech_activity')) return ['Speaking activity', '% of recording', 'The estimated portion of the recording containing active speech.'];
  if (k.includes('speech_rate')) return ['Speech rate', 'estimated rate', 'An estimate of how quickly speech was produced during the recording.'];
  if (k.includes('pause')) return ['Pause pattern', '% of recording', 'An estimate of how much of the recording contained pauses or non-speech.'];
  if (k.includes('blink')) return ['Blinking pattern', 'estimated rate', 'A computer-vision estimate of blinking during the camera check. It is not an eye examination.'];
  if (k.includes('eye_open')) return ['Eye-opening pattern', 'relative estimate', 'A computer-vision estimate of how open the eyes appeared during the check.'];
  if (k.includes('luminance')) return ['Facial lighting variation', 'relative estimate', 'How much visible brightness across the face changed. Lighting can strongly affect this feature.'];
  if (k.includes('face_motion')) return ['Facial movement', 'relative estimate', 'An estimate of visible facial movement during the camera check.'];
  if (k.includes('gait_symmetry')) return ['Movement balance', 'relative estimate', 'An estimate of how balanced visible movement was between sides during the movement check.'];
  if (k.includes('gait_variability')) return ['Movement consistency', 'relative estimate', 'An estimate of how much visible movement varied during the check.'];
  if (k.includes('gait_motion')) return ['Movement level', 'relative estimate', 'An estimate of the amount of visible movement captured during the check.'];
  if (k.includes('breathing_rate')) return ['Breathing rhythm', 'estimated breaths/min', 'A camera-based estimate of visible rhythmic changes that may relate to breathing. It is not a respiratory test.'];
  if (k.includes('breathing_variability')) return ['Breathing variability', 'relative estimate', 'An estimate of how much the visible breathing-related rhythm changed during the recording.'];
  if (k.includes('head_motion_variability')) return ['Head movement consistency', 'relative estimate', 'An estimate of how much head movement varied during the check.'];
  if (k.includes('head_motion')) return ['Head movement', 'relative estimate', 'An estimate of visible head movement during the camera check.'];
  return [raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 'research feature value', 'A numerical feature extracted by the research pipeline. Its exact meaning is defined by the feature name shown here.'];
};

const Info: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return <div className="relative inline-block"><button type="button" aria-label={`Information about ${title}`} onClick={() => setOpen(v => !v)} className="w-6 h-6 rounded-full border border-slate-600 text-slate-300 text-xs hover:border-sky-400 hover:text-sky-300 transition">i</button>{open && <div className="absolute z-40 right-0 top-8 w-80 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl text-left"><div className="text-sm font-semibold text-white mb-1">{title}</div><p className="text-xs leading-5 text-slate-300">{children}</p></div>}</div>;
};

type CardData = { signal: string; parameter: string; unit: string; value: number | null; deviation: number | null | undefined; meaning: string };
const makeCard = (f: BiomarkerFeature): CardData => { const [parameter, unit, meaning] = parameterInfo(f.name || f.category || 'research signal'); return { signal: signalName(f.category || f.name), parameter, unit, value: Number.isFinite(f.value) ? f.value : null, deviation: f.deviation, meaning }; };
const localDayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const DAILY_TRIVIA = [
  { question:'Which planet is known as the Red Planet?', options:['Venus','Mars','Jupiter','Mercury'], answer:1, fact:'Mars looks reddish because iron minerals in its soil have oxidised.' },
  { question:'What is the largest ocean on Earth?', options:['Atlantic Ocean','Indian Ocean','Pacific Ocean','Arctic Ocean'], answer:2, fact:'The Pacific Ocean is the largest and deepest ocean on Earth.' },
  { question:'Which gas do plants absorb from the atmosphere during photosynthesis?', options:['Oxygen','Carbon dioxide','Nitrogen','Hydrogen'], answer:1, fact:'Plants use carbon dioxide, water and light energy to make sugars.' },
  { question:'How many sides does a hexagon have?', options:['Five','Six','Seven','Eight'], answer:1, fact:'A hexagon is a polygon with six sides and six angles.' },
  { question:'Which is the closest star to Earth?', options:['Sirius','The Sun','Proxima Centauri','Polaris'], answer:1, fact:'The Sun is our nearest star, about 150 million kilometres away on average.' },
  { question:'What is the process by which liquid water becomes water vapour?', options:['Condensation','Freezing','Evaporation','Precipitation'], answer:2, fact:'Evaporation happens when liquid water gains enough energy to become vapour.' },
  { question:'Which instrument is used to measure atmospheric pressure?', options:['Thermometer','Barometer','Hygrometer','Anemometer'], answer:1, fact:'A barometer measures air pressure, which can help with weather forecasting.' }
];

const SignalCard: React.FC<{ card: CardData; baselineReady: boolean }> = ({ card, baselineReady }) => {
  const different = card.deviation != null && Math.abs(card.deviation) > 2;
  const comparison = !baselineReady ? 'Your self-reported answer' : card.deviation == null ? 'Personal comparison unavailable' : different ? 'Different from your usual' : 'Close to your usual';
  const displayValue = card.value == null ? '—' : card.parameter === 'Physical comfort'
    ? (['Comfortable','Muscle stiffness','Tremor sensation','Physical weakness','Pain/discomfort','Shortness of breath','Other'][Math.round(card.value)-1] || 'Needs review')
    : card.parameter === 'Change from usual'
      ? card.value <= .1 ? 'About the same / better' : card.value < .75 ? 'A little different' : 'Noticeably different'
      : card.parameter === 'Selected observations' ? `${Math.round(card.value * 5)} selected` : `${Math.round(card.value)} / 5`;
  return <div className="rounded-3xl bg-[#111827] border border-slate-800 p-5 hover:border-slate-700 transition">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-wider text-sky-400">{card.signal}</p><h3 className="text-base font-semibold text-white mt-1">{card.parameter}</h3></div><Info title={card.parameter}>{card.meaning} This is a personal reflection, not a medical test.</Info></div>
    <div className="mt-5 rounded-2xl bg-slate-950/60 border border-slate-800 p-4"><div className="text-[11px] text-slate-500">Your answer today</div><div className="mt-1 text-xl font-semibold text-white">{displayValue}</div></div>
    <div className="mt-4 text-xs font-medium text-slate-400">{comparison}</div>
  </div>;
};

export const DashboardPage: React.FC = () => {
  const [latest, setLatest] = useState<AIAnalysisResponse | null>(null);
  const [history, setHistory] = useState<AIHistoryResponse | null>(null);
  const [rewards, setRewards] = useState<{ coins: number; streak: number; last_check_in_date?: string | null } | null>(null);
  const [flippedGuideCard, setFlippedGuideCard] = useState<number | null>(null);
  const triviaDay = localDayKey();
  const trivia = DAILY_TRIVIA[Math.floor(Date.now()/86400000)%DAILY_TRIVIA.length];
  const [triviaPoints,setTriviaPoints] = useState<number>(()=>Number(localStorage.getItem('nuvyra_trivia_points')||0));
  const [triviaAnswered,setTriviaAnswered] = useState<boolean>(()=>localStorage.getItem('nuvyra_trivia_answered_day')===localDayKey());
  const [triviaChoice,setTriviaChoice] = useState<number|null>(null);
  const [triviaFeedback,setTriviaFeedback] = useState('');
  const answerTrivia = () => {
    if(triviaAnswered||triviaChoice===null)return;
    if(triviaChoice===trivia.answer){
      const next=triviaPoints+5;
      setTriviaPoints(next);localStorage.setItem('nuvyra_trivia_points',String(next));
      localStorage.setItem('nuvyra_trivia_answered_day',triviaDay);
      setTriviaAnswered(true);setTriviaFeedback(`Correct! +5 knowledge points. ${trivia.fact}`);
    }else setTriviaFeedback('Not quite. Have another try — you can answer again today.');
  };
  useEffect(() => { let active = true; Promise.allSettled([aiService.latest(), aiService.history(30), apiClient.get('/past-history/rewards')]).then(([a,b,c]) => { if (!active) return; if (a.status === 'fulfilled') setLatest(a.value); if (b.status === 'fulfilled') setHistory(b.value); if (c.status === 'fulfilled') setRewards(c.value.data); }); return () => { active = false; }; }, []);
  const score = latest?.overall_score ?? 0;
  const baselineReady = (latest?.baseline_observations ?? 0) >= 5;
  const trend = latest?.trend ?? 'INITIAL';
  const status = !baselineReady ? 'neutral' : score >= 80 ? 'stable' : score >= 60 ? 'improving' : 'variation';
  const cards = latest?.features?.slice(0, 6).map(makeCard) ?? [];
  const fallback: CardData[] = [
    { signal:'Daily reflection', parameter:'Your energy pattern', unit:'self-report', value:null, deviation:null, meaning:'Your own check-in answers help build a personal picture over time.' },
    { signal:'Daily reflection', parameter:'Your sleep pattern', unit:'self-report', value:null, deviation:null, meaning:'Sleep information is based on what you report, not a sensor-based sleep test.' },
    { signal:'Daily reflection', parameter:'Your stress and focus', unit:'self-report', value:null, deviation:null, meaning:'These are personal reflections, not medical measurements.' },
  ];
  const visibleCards = cards.length ? cards : fallback;
  const trendData = useMemo(() => history?.items?.map(item => ({ date:new Date(item.generated_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}), value:Math.round(item.score) })) ?? [], [history]);
  const statusLabel = !latest ? 'Waiting for your first check-in' : !baselineReady ? 'Building your personal reference' : trend === 'IMPROVING' ? 'Moving closer to usual' : trend === 'DEGRADING' ? 'Some changes noticed' : 'Close to usual';
  return <div className="space-y-8 pb-8">
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.2em] text-sky-400 font-semibold">Your NUVYRA space</p><h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mt-2">Your pattern today ✦</h1><p className="text-slate-400 mt-2 max-w-2xl">A simple view of today's research measurements and what each number actually represents.</p></div><Link to="/check-in" className="inline-flex items-center justify-center bg-gradient-to-r from-sky-500 to-teal-500 text-slate-950 font-semibold px-5 py-3 rounded-2xl text-sm">Today's check-in →</Link></div>
    <section aria-label="Explore NUVYRA features" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-sky-400 font-semibold">Your navigation, at a glance</p>
        <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Where would you like to go?</h2>
        <p className="text-sm text-slate-400 mt-1">Tap a card to discover what each space does, then open it when you are ready.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {[
          { title:'Daily Check-in', icon:'◉', description:'Record how you feel and, when you choose, add voice or camera observations.', to:'/check-in', accent:'text-sky-300' },
          { title:'Biomarkers', icon:'⌁', description:'Explore the research signals collected during your completed check-ins.', to:'/biomarkers', accent:'text-teal-300' },
          { title:'Trends', icon:'↗', description:'See how your recorded observations change across days and weeks.', to:'/trends', accent:'text-indigo-300' },
          { title:'Timeline', icon:'◷', description:'Review completed check-ins in the order they happened.', to:'/timeline', accent:'text-cyan-300' },
          { title:'Clinical View', icon:'▤', description:'Organize available observations and clinical context for review.', to:'/clinical-view', accent:'text-violet-300' },
          { title:'Past History', icon:'▣', description:'Keep relevant history and uploaded documents together.', to:'/past-history', accent:'text-amber-300' },
          { title:'Reports', icon:'▧', description:'View and export summaries of your longitudinal observations.', to:'/reports', accent:'text-emerald-300' },
          { title:'Notifications', icon:'♧', description:'Check reminders and important updates from NUVYRA.', to:'/notifications', accent:'text-rose-300' },
          { title:'Profile', icon:'◎', description:'Review your account details and session settings.', to:'/profile', accent:'text-blue-300' },
          { title:'Dashboard', icon:'⌂', description:'Return to your personal overview and latest activity.', to:'/dashboard', accent:'text-sky-300' },
        ].map((feature) => (
          <div key={feature.title} className="group min-h-[178px] rounded-[1.6rem] border border-slate-800 bg-gradient-to-br from-[#172235] via-[#111827] to-slate-950 p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:border-sky-500/50 hover:shadow-xl hover:shadow-sky-950/20">
            <div className="flex items-start justify-between gap-2">
              <span className={`text-2xl ${feature.accent}`} aria-hidden="true">{feature.icon}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-600">Explore</span>
            </div>
            <h3 className="mt-5 text-sm sm:text-base font-semibold text-white">{feature.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{feature.description}</p>
            <Link to={feature.to} className="inline-flex mt-4 text-xs font-semibold text-sky-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 rounded">Open {feature.title} <span aria-hidden="true" className="ml-1">→</span></Link>
          </div>
        ))}
      </div>
    </section>
    <section aria-label="NUVYRA quick guide flashcards" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-teal-300 font-semibold">A 30-second NUVYRA refresh</p>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">A few things worth knowing ✦</h2>
          <p className="text-sm text-slate-400 mt-1">Tap a card to turn it over. A quick reminder whenever you sign in.</p>
        </div>
        <span className="text-xs text-slate-500">4 quick cards · tap to reveal</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { front:'What is NUVYRA looking for?', back:'Patterns and changes across repeated observations — not a diagnosis.' },
          { front:'What is my personal baseline?', back:'A picture of your own usual pattern, built from repeated usable check-ins.' },
          { front:'What can a check-in include?', back:'Your reported context and, when you choose, available voice and camera signals.' },
          { front:'Can one unusual result tell me I am unwell?', back:'No. Individual readings can vary. Discuss health concerns with a qualified professional.' },
        ].map((card, index) => (
          <button
            key={card.front}
            type="button"
            aria-pressed={flippedGuideCard === index}
            onClick={() => setFlippedGuideCard(current => current === index ? null : index)}
            className={`min-h-[150px] rounded-2xl border p-4 sm:p-5 text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${flippedGuideCard === index ? 'border-teal-400/50 bg-teal-400/10' : 'border-slate-800 bg-[#111827] hover:border-sky-500/40'}`}
          >
            <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300">{flippedGuideCard === index ? 'The short answer' : `Quick card 0${index + 1}`}</span>
            <span className="block mt-3 text-sm font-semibold leading-5 text-white">{flippedGuideCard === index ? card.back : card.front}</span>
            <span className="block mt-4 text-[11px] text-slate-500">{flippedGuideCard === index ? 'Tap to turn back' : 'Tap to reveal ↗'}</span>
          </button>
        ))}
      </div>
    </section>
    <section aria-label="Daily trivia" className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-[#111827] to-slate-950 p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.18em] text-sky-300 font-semibold">A little curiosity, every day</p><h2 className="mt-1 text-2xl font-bold text-white">Trivia of the day ✦</h2><p className="mt-2 text-sm text-slate-400">One quick general-knowledge question. Correct answers earn 5 knowledge points — never tied to health data.</p></div>
        <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center"><div className="text-xl">⭐</div><strong className="block text-xl text-white">{triviaPoints}</strong><span className="text-[10px] text-slate-500">knowledge points</span></div>
      </div>
      <h3 className="mt-5 text-base font-semibold text-white">{trivia.question}</h3>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">{trivia.options.map((option,index)=><button key={option} type="button" disabled={triviaAnswered} aria-pressed={triviaChoice===index} onClick={()=>{setTriviaChoice(index);setTriviaFeedback('');}} className={`rounded-xl border p-3 text-left text-sm transition ${triviaChoice===index?'border-sky-400 bg-sky-500/10 text-white':'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-sky-500/50'} disabled:cursor-not-allowed disabled:opacity-60`}>{option}</button>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={triviaAnswered||triviaChoice===null} onClick={answerTrivia} className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{triviaAnswered?'Answered today':'Submit answer'}</button>{triviaAnswered&&<span className="text-xs text-emerald-300">Come back tomorrow for a new question.</span>}</div>
      {triviaFeedback&&<p role="status" className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">{triviaFeedback}</p>}
      <p className="mt-3 text-[10px] text-slate-500">Knowledge points are currently saved on this device and browser. They are separate from NUVYRA health-monitoring rewards.</p>
    </section>
    <section className="rounded-3xl bg-gradient-to-br from-amber-500/10 via-[#111827] to-slate-950 border border-amber-400/20 p-6 sm:p-7 shadow-xl shadow-black/10"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.18em] text-amber-300 font-semibold">NUVYRA continuity rewards</p><h2 className="text-2xl font-bold text-white mt-1">Keep your monitoring streak going ✦</h2><p className="text-sm text-slate-400 mt-2 max-w-xl">Complete a NUVYRA daily check-in consistently to collect coins and build a streak. These rewards recognize participation only — they never depend on symptoms, scores, medicines, or test results.</p></div><div className="flex gap-3"><div className="min-w-[110px] rounded-2xl bg-slate-950 border border-slate-800 p-4 text-center"><div className="text-2xl">🪙</div><strong className="block text-2xl text-white mt-1">{rewards?.coins ?? 0}</strong><span className="text-[11px] text-slate-500">coins</span></div><div className="min-w-[110px] rounded-2xl bg-slate-950 border border-slate-800 p-4 text-center"><div className="text-2xl">🔥</div><strong className="block text-2xl text-white mt-1">{rewards?.streak ?? 0}</strong><span className="text-[11px] text-slate-500">day streak</span></div></div></div><div className="mt-4 text-xs text-slate-500">Daily check-in: +10 coins · Every 7-day streak milestone: +25 bonus coins</div></section>
    <div className="rounded-3xl bg-gradient-to-br from-sky-950/50 via-[#111b2d] to-[#0d1523] border border-sky-500/20 p-6 sm:p-8 shadow-xl"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold text-white">How familiar is today?</h2><Info title="Your personal pattern">NUVYRA learns your usual pattern from previous check-ins. There is no single universal healthy number that applies to everyone.</Info></div><p className="text-sm text-slate-400 mt-2">Your personal reference is more useful than a one-size-fits-all target.</p></div><StatusBadge status={latest ? status : 'neutral'} label={statusLabel} /></div><div className="mt-8 grid lg:grid-cols-3 gap-6 items-center"><div><div className="text-xs text-slate-500 uppercase tracking-wider">Personal pattern index</div><div className="text-6xl font-extrabold text-white mt-1">{latest ? (baselineReady ? Math.round(score) : 'Building') : '—'}</div><p className="text-xs text-slate-400 mt-2">An experimental comparison of your own answers over time. It is not a medical score or a diagnosis.</p></div><div className="lg:col-span-2 rounded-2xl bg-black/20 border border-white/5 p-5"><p className="text-xs uppercase tracking-wider text-slate-400">Your personal reference</p><p className="mt-3 text-sm leading-6 text-slate-300">{baselineReady ? "Your personal comparison is ready. It uses your own recent check-ins, not a universal medical range." : `${latest?.baseline_observations ?? 0} of 5 check-ins recorded for this version. Your personal reference is still building.`}</p></div></div></div>
    <section><div className="flex items-end justify-between mb-4"><div><h2 className="text-xl font-bold text-white">Your signals</h2><p className="text-sm text-slate-400 mt-1">These cards show the answers you shared. They are personal reflections, not sensor measurements or medical results.</p></div><Link to="/biomarkers" className="text-xs text-sky-400">Explore details →</Link></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{visibleCards.map((card,i)=><SignalCard key={`${card.signal}-${card.parameter}-${i}`} card={card} baselineReady={baselineReady}/>)}</div></section>
    <div className="rounded-3xl bg-[#111827] border border-slate-800 p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-white">Your journey</h2><p className="text-xs text-slate-400 mt-1">Repeated observations matter more than one unusual value.</p></div><Info title="Why trends matter">NUVYRA looks for changes that persist over time instead of treating one different measurement as a diagnosis.</Info></div><div className="mt-5">{baselineReady ? <TrendChart data={trendData} label="Personal pattern index" /> : <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">Your journey graph will appear after five check-ins. For now, focus on recording how each day feels.</div>}</div></div>
    <div className="grid lg:grid-cols-2 gap-5"><div className="rounded-3xl bg-[#111827] border border-slate-800 p-6"><div className="flex items-center gap-2"><h2 className="text-lg font-bold text-white">What NUVYRA noticed</h2><Info title="Explainable AI">The experimental AI combines available signals, checks their quality, compares them with your personal history and explains the result. It has not been clinically validated.</Info></div><p className="text-sm text-slate-300 mt-4 leading-7">{latest?.explanation ?? 'Your first check-in will give NUVYRA the information needed to begin learning your personal pattern.'}</p></div><div className="rounded-3xl bg-[#111827] border border-slate-800 p-6"><h2 className="text-lg font-bold text-white">ⓘ Why numbers can change</h2><p className="text-sm text-slate-400 mt-4 leading-7">These are research feature values, not universal “healthy” numbers. Camera position, lighting, microphone quality, language, environment and normal day-to-day variation can affect them. NUVYRA therefore compares them mainly with your own history.</p></div></div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"><h3 className="text-sm font-semibold text-white">🔒 Privacy & research use</h3><p className="text-xs leading-6 text-slate-400 mt-2">NUVYRA is a privacy-sensitive research prototype. Authentication and backend protections are present, but the project has not undergone an independent privacy/security audit. Its computer-vision and speech features are research proxies, its stability index is experimental, and its AI explanations are exploratory. It does not diagnose disease or replace professional medical assessment.</p></div>
  </div>;
};