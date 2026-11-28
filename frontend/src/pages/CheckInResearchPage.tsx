import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, AIAnalysisResponse } from '../services/aiService';
import { InfoButton } from '../components/common/InfoButton';
import { useLanguage, AppLanguage } from '../contexts/LanguageContext';

const PHYSICAL: Record<AppLanguage, string[]> = {
  English: ['Comfortable', 'Muscle stiffness', 'Tremor sensation', 'Physical weakness', 'Pain/discomfort', 'Shortness of breath', 'Other'],
  Hindi: ['आरामदायक', 'मांसपेशियों में जकड़न', 'कंपन जैसा महसूस होना', 'शारीरिक कमजोरी', 'दर्द/असहजता', 'सांस लेने में तकलीफ', 'अन्य'],
  French: ['À l’aise', 'Raideur musculaire', 'Sensation de tremblement', 'Faiblesse physique', 'Douleur/inconfort', 'Essoufflement', 'Autre'],
  Bengali: ['স্বস্তিতে', 'পেশিতে শক্তভাব', 'কাঁপার অনুভূতি', 'শারীরিক দুর্বলতা', 'ব্যথা/অস্বস্তি', 'শ্বাসকষ্ট', 'অন্যান্য'],
  Marathi: ['आरामदायक', 'स्नायूंमध्ये कडकपणा', 'कंप जाणवणे', 'शारीरिक अशक्तपणा', 'वेदना/अस्वस्थता', 'श्वास घेण्यास त्रास', 'इतर'],
  Telugu: ['సౌకర్యంగా ఉంది', 'కండరాల బిగుతు', 'వణుకు అనుభూతి', 'శారీరక బలహీనత', 'నొప్పి/అసౌకర్యం', 'శ్వాస తీసుకోవడంలో ఇబ్బంది', 'ఇతర']
};
const PHYSICAL_OPTIONS_EN = ['Comfortable', 'Muscle stiffness', 'Tremor sensation', 'Physical weakness', 'Pain/discomfort', 'Shortness of breath', 'Other'];
const OBS: Record<AppLanguage, string[]> = {
  English: ['Vocal strain', 'Muscle stiffness', 'Tremor sensation', 'Brain fog', 'Sleep disruption'],
  Hindi: ['आवाज़ में खिंचाव', 'मांसपेशियों में जकड़न', 'कंपन जैसा महसूस होना', 'मानसिक धुंधलापन', 'नींद में बदलाव'],
  French: ['Fatigue vocale', 'Raideur musculaire', 'Sensation de tremblement', 'Brouillard mental', 'Perturbation du sommeil'],
  Bengali: ['কণ্ঠে চাপ', 'পেশিতে শক্তভাব', 'কাঁপার অনুভূতি', 'মনোযোগে ঝাপসাভাব', 'ঘুমের ব্যাঘাত'],
  Marathi: ['आवाजात ताण', 'स्नायूंमध्ये कडकपणा', 'कंप जाणवणे', 'विचारांत धूसरपणा', 'झोपेत बदल'],
  Telugu: ['గొంతులో ఒత్తిడి', 'కండరాల బిగుతు', 'వణుకు అనుభూతి', 'మనసు మబ్బుగా ఉండటం', 'నిద్రలో మార్పు']
};
const MOODS = [
  { key: 'better', title: 'Better than usual', icon: '↗', hint: 'Today feels easier' },
  { key: 'same', title: 'About the same', icon: '○', hint: 'Much like a usual day' },
  { key: 'different', title: 'A little different', icon: '◌', hint: 'Some things feel changed' },
  { key: 'significant', title: 'Noticeably different', icon: '✳', hint: 'A clear change for you' }
];
const MOOD_DEVIATION: Record<string, number> = { better: 0.1, same: 0, different: 0.5, significant: 1 };
const PHYSICAL_INDEX: Record<string, number> = {
  Comfortable: 1, 'Muscle stiffness': 2, 'Tremor sensation': 3,
  'Physical weakness': 4, 'Pain/discomfort': 5, 'Shortness of breath': 6, Other: 7
};

export const CheckInResearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [step, setStep] = useState(1);
  const [mood, setMood] = useState('');
  const [moodLevel, setMoodLevel] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState(8);
  const [awakenings, setAwakenings] = useState(0);
  const [concentration, setConcentration] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [physical, setPhysical] = useState('');
  const [physicalNotes, setPhysicalNotes] = useState('');
  const [observations, setObservations] = useState<string[]>([]);
  const [result, setResult] = useState<AIAnalysisResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const physicalLabels = PHYSICAL[language] || PHYSICAL.English;
  const observationLabels = OBS[language] || OBS.English;

  const toggleObservation = (item: string) => {
    setObservations(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item]);
  };

  const coreAnswered = [energy, fatigue, sleep, concentration, stress].filter(value => value !== null).length;
  const validateSurvey = () => {
    if (coreAnswered < 4) {
      setError('Please choose an answer for at least 4 of the 5 core reflections. You can select “Not sure today” for the one you cannot answer.');
      return false;
    }
    if (![energy, fatigue, sleep, concentration, stress, moodLevel].every(value => value === null || (Number.isFinite(value) && value >= 1 && value <= 5))) {
      setError('Please check your selected ratings. Each rating must be between 1 and 5.');
      return false;
    }
    if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24 || !Number.isInteger(awakenings) || awakenings < 0 || awakenings > 30) {
      setError('Please check your sleep hours and number of awakenings.');
      return false;
    }
    setError('');
    return true;
  };

  const analyze = async () => {
    if (!validateSurvey()) {
      setStep(1);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await aiService.analyze({
        ...(fatigue !== null ? { fatigue } : {}),
        ...(energy !== null ? { energy_level: energy } : {}),
        ...(sleep !== null ? { sleep_quality: sleep } : {}),
        ...(stress !== null ? { stress_level: stress } : {}),
        ...(concentration !== null ? { concentration_level: concentration } : {}),
        ...(moodLevel !== null ? { mood_level: moodLevel } : {}),
        ...(mood ? { mood_deviation: MOOD_DEVIATION[mood] ?? 0 } : {}),
        ...(physical ? { physical_comfort: PHYSICAL_INDEX[physical], physical_comfort_observation: physical } : {}),
        sleep_hours: sleepHours,
        sleep_awakenings: awakenings,
        physical_comfort_notes: [physicalNotes, observations.length ? `Other observations selected: ${observations.join(', ')}` : ''].filter(Boolean).join('\n'),
        source_duration_seconds: 0
      });
      setResult(response);
    } catch (e: any) {
      if (e?.status === 401) navigate('/login');
      else setError(e?.message || 'NUVYRA could not save this check-in. Please review your answers and try again.');
    } finally {
      setLoading(false);
    }
  };

  const ratingLabels = [
    ['Energy', energy, setEnergy, ['Very low', 'Low', 'Usual', 'Good', 'High']],
    ['Fatigue', fatigue, setFatigue, ['None', 'A little', 'Some', 'A lot', 'Extreme']],
    ['Sleep quality', sleep, setSleep, ['Very poor', 'Poor', 'Okay', 'Good', 'Very good']],
    ['Concentration', concentration, setConcentration, ['Very difficult', 'Difficult', 'Okay', 'Good', 'Very easy']],
    ['Stress', stress, setStress, ['Very low', 'Low', 'Moderate', 'High', 'Very high']],
    ['Mood (optional)', moodLevel, setMoodLevel, ['Very low', 'Low', 'Okay', 'Good', 'Very good']]
  ] as Array<[string, number | null, React.Dispatch<React.SetStateAction<number | null>>, string[]]>;

  return <main className="mx-auto max-w-4xl space-y-6 py-5 text-white">
    <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#17233a] via-[#111827] to-[#0d1320] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">NUVYRA · DAILY CHECK-IN</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold">A little check-in with yourself</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">A few thoughtful answers help you notice how your days change over time. There are no right or wrong answers.</p>
        </div>
        <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-2xl text-sky-200">✦</div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700"><div className={`h-full rounded-full bg-gradient-to-r from-sky-400 to-teal-300 transition-all ${step === 1 ? 'w-1/2' : 'w-full'}`} /></div>
        <span className="text-xs tabular-nums text-slate-400">Step {step} of 2</span>
      </div>
    </header>

    {error && <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}

    {step === 1 && !result && <section className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7">
        <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">How has today felt?</h2><p className="mt-1 text-xs text-slate-400">Optional context — choose only if it feels useful.</p><InfoButton title="About this question">This is your own description of today compared with your usual experience. It is not a medical assessment.</InfoButton></div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MOODS.map(option => <button key={option.key} type="button" aria-pressed={mood === option.key} onClick={() => setMood(option.key)} className={`rounded-2xl border p-4 text-left transition-all ${mood === option.key ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/20' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'}`}>
            <span className="flex items-center justify-between"><span className="text-2xl text-sky-300">{option.icon}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${mood === option.key ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-600 text-transparent'}`}>✓</span></span>
            <b className="mt-3 block text-sm text-white">{option.title}</b><span className="mt-1 block text-xs text-slate-400">{option.hint}</span>
          </button>)}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7">
        <div className="mb-5"><h2 className="text-lg font-semibold">A few quick reflections</h2><p className="mt-1 text-xs text-slate-400">Choose the tile that feels closest. No need to overthink it; one core reflection may be left as “Not sure today”.</p><div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3"><div className="flex items-center justify-between text-xs"><span className="text-slate-300">Core reflections answered</span><strong className="text-sky-300">{coreAnswered} / 5</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-teal-300 transition-all" style={{ width: `${coreAnswered / 5 * 100}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">At least 4 are needed to save. This checks completeness, not accuracy.</p></div></div>
        <div className="grid sm:grid-cols-2 gap-x-7 gap-y-5">
          {ratingLabels.map(([label, value, setter, words], index) => {
            const isCore = index < 5;
            return <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-200">{label}</span>{isCore && <span className="text-[9px] uppercase tracking-wider text-slate-500">Core</span>}</div>
              <div className="mt-3 grid grid-cols-5 gap-1">
                {words.map((word, optionIndex) => <button key={word} type="button" aria-pressed={value === optionIndex + 1} onClick={() => setter(optionIndex + 1)} className={`min-w-0 rounded-xl border px-1 py-2 text-center transition ${value === optionIndex + 1 ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600'}`}><span className="block text-sm font-semibold">{optionIndex + 1}</span><span className="mt-1 block truncate text-[9px]">{word}</span></button>)}
              </div>
              <button type="button" onClick={() => setter(null)} className={`mt-2 text-[11px] underline underline-offset-2 ${value === null ? 'text-sky-300' : 'text-slate-500 hover:text-slate-300'}`}>{isCore ? 'Not sure today' : 'Skip this'}</button>
            </div>;
          })}
        </div>
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm text-slate-300">Hours slept</span><input aria-label="Hours slept" className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white" type="number" min="0" max="24" step="0.5" value={sleepHours} onChange={event => setSleepHours(Number(event.target.value))} /></label>
          <label className="block"><span className="text-sm text-slate-300">Times you woke up</span><input aria-label="Times you woke up" className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-white" type="number" min="0" max="30" value={awakenings} onChange={event => setAwakenings(Number(event.target.value))} /></label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Anything else about how you feel?</h2>
        <p className="mt-1 text-xs text-slate-400">Optional context. Skip it if you are unsure or would rather not answer.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {physicalLabels.map((label, index) => <button key={PHYSICAL_OPTIONS_EN[index]} type="button" aria-pressed={physical === PHYSICAL_OPTIONS_EN[index]} onClick={() => setPhysical(PHYSICAL_OPTIONS_EN[index])} className={`min-h-20 rounded-2xl border p-3 text-left text-xs transition-all ${physical === PHYSICAL_OPTIONS_EN[index] ? 'border-teal-300 bg-teal-400/10 text-teal-100' : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-600'}`}>
            <span className="mb-2 block text-lg text-teal-300">{['✓', '⌁', '≈', '↘', '◇', '≋', '+'][index]}</span>{label}
          </button>)}
        </div>
        <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">Add extra context <span className="text-xs text-slate-500">(optional)</span></summary>
          <textarea aria-label="Additional context" value={physicalNotes} onChange={event => setPhysicalNotes(event.target.value)} placeholder="Anything else you would like NUVYRA to know?" className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" rows={2} />
          <div className="mt-4"><p className="mb-2 text-xs text-slate-400">Anything else you noticed?</p><div className="flex flex-wrap gap-2">{observationLabels.map((label, index) => <button key={label} type="button" aria-pressed={observations.includes(OBS.English[index])} onClick={() => toggleObservation(OBS.English[index])} className={`rounded-full border px-3 py-2 text-xs ${observations.includes(OBS.English[index]) ? 'border-sky-400 bg-sky-500/10 text-sky-200' : 'border-slate-800 text-slate-400'}`}>{label}</button>)}</div></div>
        </details>
      </div>

      <button type="button" onClick={() => validateSurvey() && setStep(2)} className="w-full rounded-2xl bg-gradient-to-r from-sky-400 to-teal-300 py-4 font-semibold text-slate-950 shadow-lg shadow-sky-950/20 transition hover:brightness-105">Review my check-in <span className="ml-1">→</span></button>
    </section>}

    {step === 2 && !result && <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7 space-y-5">
      <div><p className="text-[11px] uppercase tracking-[0.18em] text-teal-300">Almost there</p><h2 className="mt-2 text-xl font-semibold">Your check-in, at a glance</h2><p className="mt-1 text-sm text-slate-400">Take a quick look before saving. You can go back and change anything.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[['Today felt', MOODS.find(item => item.key === mood)?.title || 'Not provided'], ['Energy', energy === null ? 'Not answered' : `${energy}/5`], ['Fatigue', fatigue === null ? 'Not answered' : `${fatigue}/5`], ['Sleep', `${sleep === null ? 'Not answered' : `${sleep}/5`} · ${sleepHours}h`], ['Stress', stress === null ? 'Not answered' : `${stress}/5`], ['Physical comfort', physical]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-sm font-medium text-white">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4"><p className="text-sm text-slate-200">NUVYRA compares the answers you choose to share with your own earlier check-ins. At least 4 of 5 core reflections must be supplied. This is a completeness check, not a measure of truth or medical accuracy. No microphone or camera recording is used in this version.</p></div>
      <div className="grid sm:grid-cols-2 gap-3"><button type="button" onClick={() => setStep(1)} className="rounded-2xl border border-slate-700 py-3 text-sm font-semibold text-slate-200">Back to edit</button><button type="button" disabled={loading} onClick={analyze} className="rounded-2xl bg-gradient-to-r from-sky-400 to-teal-300 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Saving your check-in…' : 'Save check-in'}</button></div>
    </section>}

    {result && <section className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7">
        <h3 className="font-semibold text-white">What you shared today</h3>
        <p className="mt-1 text-xs text-slate-400">Your overall feeling and physical-comfort choice are kept as context. They are not turned into numeric index inputs.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[['Overall feeling',MOODS.find(item=>item.key===mood)?.title||'Not provided'],['Fatigue',fatigue===null?'Not answered':`${fatigue}/5`],['Energy',energy===null?'Not answered':`${energy}/5`],['Sleep',`${sleep===null?'Not answered':`${sleep}/5`} · ${sleepHours}h`],['Stress',stress===null?'Not answered':`${stress}/5`],['Concentration',concentration===null?'Not answered':`${concentration}/5`],['Physical comfort',physical||'Not provided'],['Waking during night',String(awakenings)]].map(([label,value])=><div key={label} className="rounded-2xl bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-sm font-medium text-white">{value}</p></div>)}
        </div>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7">
        <p className="text-[11px] uppercase tracking-[0.18em] text-teal-300">Check-in saved</p>
        <h2 className="mt-2 text-xl font-semibold">Your personal picture</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{result.explanation}</p>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-950/60 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Personal reference</p><b className="mt-2 block text-lg text-white">{result.baseline_observations >= 5 ? 'Ready' : 'Building'}</b></div>
          <div className="rounded-2xl bg-slate-950/60 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Core reflections supplied</p><b className="mt-2 block text-lg text-white">{Math.round(result.data_quality_score * 5)} of 5</b><p className="mt-1 text-[10px] text-slate-500">Completeness only — not accuracy</p></div>
          {result.baseline_observations >= 5 && <div className="rounded-2xl bg-slate-950/60 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Personal pattern index</p><b className="mt-2 block text-lg text-white">{result.overall_score.toFixed(0)} / 100</b></div>}
        </div>
        {result.baseline_observations < 5 && <p className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-slate-300">Your personal reference is still taking shape. NUVYRA will show comparisons after at least five check-ins using this version of the method.</p>}
      </div>

      {result.context?.document_count > 0 && <div className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
        <div><h3 className="font-semibold text-white">Your saved records</h3><p className="mt-1 text-xs leading-5 text-slate-400">NUVYRA found {result.context.document_count} uploaded document(s). These summaries are background context only. Their laboratory values are not used in the personal pattern index.</p></div>
        {(result.context.analyzed_documents || []).slice(0, 5).map((doc, index) => <div key={doc.filename + index} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-slate-200">{doc.filename}</b><span className="text-[10px] text-slate-500">{doc.document_type}</span></div>{doc.summary && <p className="mt-2 text-xs leading-5 text-slate-300">{doc.summary}</p>}<p className="mt-2 text-[11px] text-slate-500">Tests mentioned: {doc.tests?.length ? doc.tests.join(', ') : 'Not identified'} · Dates found: {doc.dates?.length ? doc.dates.join(', ') : 'Not identified'}</p></div>)}
      </div>}

      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 sm:p-7"><h3 className="font-semibold">What to keep in mind</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">{(result.limitations || []).map(item => <li key={item}>• {item}</li>)}</ul></div>
      <div className="grid sm:grid-cols-2 gap-3"><button type="button" onClick={() => navigate('/trends')} className="rounded-2xl bg-teal-400 py-3 font-semibold text-slate-950">View my trends</button><button type="button" onClick={() => navigate('/dashboard')} className="rounded-2xl border border-slate-700 py-3 font-semibold text-slate-200">Back to home</button></div>
    </section>}
  </main>;
};
