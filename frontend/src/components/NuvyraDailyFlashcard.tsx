import React, { useState } from 'react';

type Flashcard = { question: string; answer: string; hint: string };
const DECK: Record<string, Flashcard[]> = {
  English: [
    { question: 'What is a personal baseline?', answer: 'Your own usual pattern, learned from repeated usable check-ins.', hint: 'Think: your history, not a population average.' },
    { question: 'Does NUVYRA diagnose a condition?', answer: 'No. It organizes observations and changes for review; it does not diagnose.', hint: 'NUVYRA supports understanding, not diagnosis.' },
    { question: 'Why repeat check-ins over time?', answer: 'Repeated observations help put a single reading into context.', hint: 'A pattern is more useful than one isolated moment.' },
    { question: 'What can a check-in include?', answer: 'Your optional self-reported context and the voice or camera signals enabled for that check-in.', hint: 'You stay in control of each check-in.' },
    { question: 'What happens when a signal is unclear?', answer: 'Low-quality or incomplete observations should be treated cautiously, not as reliable changes.', hint: 'Quality matters as much as the measurement.' },
    { question: 'Who should interpret concerning changes?', answer: 'Discuss health concerns with a qualified healthcare professional.', hint: 'The app is not a substitute for clinical advice.' }
  ],
  Hindi: [
    { question: 'व्यक्तिगत बेसलाइन क्या है?', answer: 'बार-बार के उपयोगी चेक-इन से समझा गया आपका अपना सामान्य पैटर्न।', hint: 'आपकी हिस्ट्री, किसी औसत से तुलना नहीं।' },
    { question: 'क्या NUVYRA बीमारी का निदान करता है?', answer: 'नहीं। यह समीक्षा के लिए अवलोकन और बदलाव व्यवस्थित करता है।', hint: 'यह निदान नहीं करता।' },
    { question: 'बार-बार चेक-इन क्यों करें?', answer: 'इससे एक माप को समय के संदर्भ में समझने में मदद मिलती है।', hint: 'एक रीडिंग से अधिक उपयोगी पैटर्न होता है।' },
    { question: 'चेक-इन में क्या शामिल हो सकता है?', answer: 'आपका स्वयं बताया संदर्भ और उस चेक-इन के लिए चालू आवाज़ या कैमरा संकेत।', hint: 'हर चेक-इन पर आपका नियंत्रण है।' },
    { question: 'संकेत स्पष्ट न हो तो क्या करें?', answer: 'कम गुणवत्ता वाले या अधूरे अवलोकन को सावधानी से समझना चाहिए।', hint: 'माप जितनी ही गुणवत्ता भी महत्वपूर्ण है।' },
    { question: 'चिंताजनक बदलाव पर किससे बात करें?', answer: 'स्वास्थ्य संबंधी चिंता पर योग्य स्वास्थ्य पेशेवर से बात करें।', hint: 'ऐप चिकित्सकीय सलाह का विकल्प नहीं है।' }
  ],
  French: [
    { question: 'Qu’est-ce qu’une référence personnelle ?', answer: 'Votre fonctionnement habituel, appris à partir de contrôles répétés et exploitables.', hint: 'Votre historique, pas une moyenne de population.' },
    { question: 'NUVYRA pose-t-il un diagnostic ?', answer: 'Non. Il organise les observations et les changements pour examen, sans diagnostiquer.', hint: 'NUVYRA ne pose pas de diagnostic.' },
    { question: 'Pourquoi répéter les contrôles ?', answer: 'Les observations répétées donnent du contexte à une mesure isolée.', hint: 'Une tendance vaut mieux qu’un instant isolé.' },
    { question: 'Que peut inclure un contrôle ?', answer: 'Votre contexte déclaré et les signaux vocaux ou caméra activés pour ce contrôle.', hint: 'Vous gardez le contrôle de chaque contrôle.' },
    { question: 'Que faire si un signal est peu fiable ?', answer: 'Les observations incomplètes ou de faible qualité doivent être interprétées avec prudence.', hint: 'La qualité compte autant que la mesure.' },
    { question: 'Qui doit interpréter un changement préoccupant ?', answer: 'Parlez de vos préoccupations de santé à un professionnel qualifié.', hint: 'L’application ne remplace pas un avis médical.' }
  ]
};
const UI: Record<string, { eyebrow:string; title:string; subtitle:string; reveal:string; hide:string; continue:string; skip:string; counter:string }> = {
  English:{eyebrow:'A SMALL DAILY DISCOVERY',title:'One NUVYRA idea, every time you return.',subtitle:'Tap the card to turn it over. A quick way to get familiar with your personal health timeline.',reveal:'Reveal answer',hide:'Show question',continue:'Continue to NUVYRA →',skip:'Skip for now',counter:'QUICK LEARNING CARD'},
  Hindi:{eyebrow:'आज की छोटी-सी जानकारी',title:'हर बार लौटने पर NUVYRA की एक नई बात।',subtitle:'कार्ड पलटने के लिए टैप करें। अपनी व्यक्तिगत हेल्थ टाइमलाइन को समझने का आसान तरीका।',reveal:'जवाब देखें',hide:'सवाल देखें',continue:'NUVYRA पर आगे बढ़ें →',skip:'अभी छोड़ें',counter:'सीखने का छोटा कार्ड'},
  French:{eyebrow:'UNE PETITE DÉCOUVERTE',title:'Une idée NUVYRA à chaque visite.',subtitle:'Touchez la carte pour la retourner et mieux comprendre votre historique personnel.',reveal:'Voir la réponse',hide:'Voir la question',continue:'Continuer vers NUVYRA →',skip:'Passer pour maintenant',counter:'CARTE APPRENTISSAGE'}
};

export default function NuvyraDailyFlashcard({ onComplete }: { onComplete: () => void }) {
  const language = localStorage.getItem('nuvyra_language') || 'English';
  const deck = DECK[language] || DECK.English;
  const ui = UI[language] || UI.English;
  const [index] = useState(() => {
    const previous = Number(localStorage.getItem('nuvyra_last_flashcard_index'));
    const next = Number.isInteger(previous) && previous >= 0 ? (previous + 1) % 6 : 0;
    localStorage.setItem('nuvyra_last_flashcard_index', String(next));
    return next;
  });
  const [revealed, setRevealed] = useState(false);
  const card = deck[index];

  return (
    <main className="min-h-screen bg-[#080D17] text-white flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <span className="text-[11px] tracking-[.22em] text-sky-300">{ui.eyebrow}</span>
          <span className="text-xs text-slate-500">{index + 1} / {deck.length}</span>
        </div>
        <div className="rounded-[2rem] border border-sky-400/20 bg-gradient-to-br from-[#13243A] via-[#111827] to-[#0B1220] p-7 sm:p-10 shadow-2xl shadow-sky-950/30">
          <div className="flex items-center gap-2 text-[10px] tracking-[.2em] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            {ui.counter}
          </div>
          <h1 className="mt-7 text-2xl sm:text-3xl font-semibold leading-tight">{ui.title}</h1>
          <p className="mt-3 text-sm sm:text-base leading-6 text-slate-400">{ui.subtitle}</p>
          <button
            type="button"
            onClick={() => setRevealed(value => !value)}
            aria-expanded={revealed}
            className="mt-8 w-full min-h-56 rounded-3xl border border-white/10 bg-white/[.045] p-7 text-left transition-all hover:border-sky-300/40 hover:bg-white/[.07] focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <span className="text-[10px] uppercase tracking-[.2em] text-sky-300">{revealed ? 'NUVYRA · THE IDEA' : 'YOUR QUESTION'}</span>
            <span className="block mt-5 text-xl sm:text-2xl font-medium leading-snug">{revealed ? card.answer : card.question}</span>
            <span className="block mt-6 text-xs text-slate-500">{revealed ? card.hint : ui.reveal}</span>
          </button>
          <div className="flex flex-col sm:flex-row gap-3 mt-7">
            <button type="button" onClick={() => setRevealed(value => !value)} className="flex-1 rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">{revealed ? ui.hide : ui.reveal}</button>
            <button type="button" onClick={onComplete} className="flex-1 rounded-xl bg-gradient-to-r from-sky-400 to-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:brightness-110">{ui.continue}</button>
          </div>
        </div>
        <button type="button" onClick={onComplete} className="mx-auto mt-5 block text-xs text-slate-500 hover:text-slate-300">{ui.skip}</button>
      </div>
    </main>
  );
}
