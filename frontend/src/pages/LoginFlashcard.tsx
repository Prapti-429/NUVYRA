import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const CARDS = [
  {
    question: 'What makes your NUVYRA baseline personal?',
    answer: 'It is built from your own repeated, usable check-ins over time—not from a population average.',
    tag: 'YOUR BASELINE',
  },
  {
    question: 'What happens during a daily check-in?',
    answer: 'You add context and, when available, voice or camera observations. NUVYRA checks data quality before showing patterns.',
    tag: 'DAILY CHECK-IN',
  },
  {
    question: 'Does NUVYRA diagnose a health condition?',
    answer: 'No. It organizes observations and changes over time for you and appropriate professionals to review.',
    tag: 'IMPORTANT TO KNOW',
  },
  {
    question: 'Why does NUVYRA look at patterns over time?',
    answer: 'A single observation can be affected by many factors. Repeated observations help put changes in context.',
    tag: 'LONGITUDINAL VIEW',
  },
  {
    question: 'What should you do if a reading looks unusual?',
    answer: 'Check the recording conditions and context. Do not use a NUVYRA score as a substitute for professional medical advice.',
    tag: 'USING NUVYRA',
  },
];

export default function LoginFlashcard() {
  const navigate = useNavigate();
  const card = useMemo(() => CARDS[Math.floor(Math.random() * CARDS.length)], []);
  const [revealed, setRevealed] = useState(false);

  return (
    <main className="min-h-screen bg-[#080D17] text-white flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-7">
          <div>
            <p className="text-[11px] tracking-[.28em] uppercase text-sky-300">NUVYRA · A QUICK MOMENT</p>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-2">One thing worth knowing</h1>
          </div>
          <span className="text-2xl" aria-hidden="true">✦</span>
        </div>

        <button
          type="button"
          onClick={() => setRevealed(value => !value)}
          aria-expanded={revealed}
          className="w-full min-h-[280px] sm:min-h-[320px] rounded-[2rem] border border-sky-300/20 bg-gradient-to-br from-[#14253A] via-[#101B2B] to-[#102C31] p-7 sm:p-10 text-left shadow-2xl transition duration-300 hover:border-teal-300/50 focus:outline-none focus:ring-2 focus:ring-teal-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[.25em] uppercase text-teal-200">{card.tag}</span>
            <span className="text-xs text-slate-400">{revealed ? 'ANSWER' : 'TAP TO REVEAL'}</span>
          </div>
          <div className="mt-12 sm:mt-16">
            <p className="text-xs uppercase tracking-widest text-slate-400">{revealed ? 'THE NUVYRA NOTE' : 'YOUR FLASHCARD'}</p>
            <p className="text-2xl sm:text-3xl leading-snug font-semibold mt-4">
              {revealed ? card.answer : card.question}
            </p>
          </div>
          <div className="mt-10 flex items-center gap-2 text-sm text-teal-200">
            <span>{revealed ? 'Tap to see the question again' : 'Reveal the answer'}</span>
            <span aria-hidden="true">↗</span>
          </div>
        </button>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-slate-500">A small daily reminder. You can explore the full guide any time.</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="rounded-xl px-6 py-3 bg-gradient-to-r from-sky-400 to-teal-300 text-slate-950 font-semibold text-sm hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Continue to NUVYRA →
          </button>
        </div>
      </section>
    </main>
  );
}
