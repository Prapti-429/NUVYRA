import React, { useState } from 'react';
import { InfoButton } from '../components/common/InfoButton';
import { APP_LANGUAGES, useLanguage } from '../contexts/LanguageContext';

export const SettingsPage: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const [dailyReminder, setDailyReminder] = useState(() => localStorage.getItem('nuvyra-daily-reminder') !== 'off');

  const reminderChange = (enabled: boolean) => {
    setDailyReminder(enabled);
    localStorage.setItem('nuvyra-daily-reminder', enabled ? 'on' : 'off');
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Privacy & System Preferences</h1>
        <p className="text-slate-400 text-sm mt-1">Choose how NUVYRA communicates with you and review how your research data is handled.</p>
      </div>
      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">Interface language</h2>
          <InfoButton title="Interface language">Your selection is shared across the application and saved on this device. Changing it does not delete your account, check-ins, or saved progress. Some specialist screens and AI-generated content may still have limited language coverage while translations are completed.</InfoButton>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {APP_LANGUAGES.map((item) => (
            <button key={item.value} type="button" aria-pressed={language === item.value} onClick={() => setLanguage(item.value)}
              className={`group min-h-[88px] rounded-2xl border p-4 text-left transition-all duration-200 ${language === item.value ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/30' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/80'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-xl font-semibold text-white">{item.native}</span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${language === item.value ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-slate-600 text-transparent'}`}>✓</span>
              </span>
              <span className="mt-2 block text-xs text-slate-400">{item.label}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="rounded-2xl bg-gradient-to-br from-[#121B2B] to-[#0E1524] border border-sky-500/20 p-6 space-y-4">
        <div className="flex items-center gap-2"><h2 className="text-base font-bold text-white">Privacy-First Architecture</h2><InfoButton title="Privacy-first design">NUVYRA is a research prototype. Where possible, media is converted into numerical features locally before analysis. The system is not a medical device and does not diagnose disease.</InfoButton></div>
        <p className="text-xs text-slate-300 leading-relaxed">Acoustic and camera telemetry is processed as measurement features for longitudinal pattern monitoring. Raw media is not intentionally stored by the check-in workflow.</p>
      </div>
      <div className="rounded-2xl bg-[#111827] border border-slate-800 p-6 space-y-6 divide-y divide-slate-800">
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2"><div><h3 className="text-sm font-medium text-white">Anonymized Telemetry Identifier</h3><p className="text-xs text-slate-500">Unique subject code used in research data exports</p></div><InfoButton title="Telemetry identifier">This is a project identifier used to connect your longitudinal measurements. It is not a medical diagnosis or score.</InfoButton></div>
          <span className="text-xs font-mono text-sky-400 bg-sky-500/10 px-3 py-1 rounded-lg border border-sky-500/20">NV-88219-BETA</span>
        </div>
        <div className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-2"><div><h3 className="text-sm font-medium text-white">Daily Check-in Reminder</h3><p className="text-xs text-slate-500">Keep the daily reminder preference on this device</p></div><InfoButton title="Daily reminder">A reminder helps you collect measurements consistently. It does not mean you need to complete a check-in at a particular medical interval.</InfoButton></div>
          <input type="checkbox" checked={dailyReminder} onChange={(e) => reminderChange(e.target.checked)} className="accent-sky-500 w-4 h-4 rounded cursor-pointer" />
        </div>
      </div>
      <section className="rounded-2xl bg-[#111827] border border-slate-800 p-6">
        <div className="flex items-center gap-2"><h2 className="text-base font-bold text-white">About NUVYRA</h2><InfoButton title="About the software">NUVYRA combines several everyday-device signals over time to look for changes from a person's own usual pattern. It is a research prototype, not a diagnostic tool.</InfoButton></div>
        <p className="mt-2 text-sm leading-6 text-slate-400">NUVYRA uses multimodal digital-biomarker features, personal baselines, data-quality checks and longitudinal AI analysis to help users understand changes in their own recorded patterns.</p>
      </section>
    </div>
  );
};
