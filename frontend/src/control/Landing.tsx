import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { HeroScene } from './HeroScene';

/** Full-screen welcome page: hero photo, a short explanation of RANGUARD, one button to the dashboard. */
export const Landing: React.FC<{ onEnter: () => void }> = ({ onEnter }) => (
  <div className="cr-root relative min-h-screen overflow-hidden text-slate-100 flex flex-col">
    {/* background photo + readability overlays */}
    <HeroScene className="absolute inset-0 w-full h-full" />
    <div className="absolute inset-0 bg-gradient-to-r from-[#0f0d1c]/95 via-[#0f0d1c]/70 to-transparent md:via-[#0f0d1c]/35" />
    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0f0d1c]/90 to-transparent" />

    <header className="relative z-10 px-6 md:px-12 pt-6">
      <Logo height={56} />
    </header>

    <main className="relative z-10 flex-1 flex items-center px-6 md:px-12 py-10">
      <div className="max-w-[620px] cr-fade-in">
        <div className="inline-flex items-center gap-2 text-[13.5px] font-medium text-sky-200 bg-sky-400/10 border border-sky-300/25 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-300" /> Autonomous conflict-resolution referee for mobile networks
        </div>

        <h1 className="mt-5 text-[38px] sm:text-[48px] md:text-[56px] font-extrabold tracking-tight leading-[1.05]">
          When network controllers disagree, <span className="text-sky-300">RANGUARD decides.</span>
        </h1>

        <p className="mt-5 text-[16px] md:text-[17px] leading-relaxed text-slate-200/90">
          Modern mobile networks run several automatic controllers at once: one saves energy, one boosts coverage, one cuts interference. Left alone, they send contradictory power
          commands to the same tower, causing dropped users and wasteful flip-flopping. RANGUARD sits between them and the network. It intercepts every proposal, tests each option on a
          safe shadow copy of the network, blocks anything that breaks the safety limits, recommends the best action, and lets an operator approve it, so the network gets the smallest safe
          change instead of a winner-takes-all fight.
        </p>

        <button
          onClick={onEnter}
          className="group mt-8 h-14 px-8 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-900 font-bold text-[16px] inline-flex items-center gap-3 shadow-[0_12px_40px_-12px_rgba(56,189,248,0.7)] transition-all hover:-translate-y-0.5"
        >
          Go to main page
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </main>

    <footer className="relative z-10 px-6 md:px-12 pb-5 text-[13px] text-slate-400">Team Arigato Algorithms · Problem statement SW-31</footer>
  </div>
);
