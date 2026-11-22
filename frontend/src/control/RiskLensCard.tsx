import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Brain, Check, X } from 'lucide-react';
import { api } from '../services/api';
import { DecisionIntelligenceAudit } from '../types';
import { fmt } from './model';

/**
 * Compact AI Risk Lens card (right column). Shows whether AI screening is on, the latest
 * prediction-vs-digital-twin audit in a few numbers, and opens the full audit view.
 */
export const RiskLensCard: React.FC<{ onOpen: () => void; refreshKey?: unknown }> = ({ onOpen, refreshKey }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [audit, setAudit] = useState<DecisionIntelligenceAudit | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const st = await api.getDecisionIntelligenceStatus();
      setEnabled(!!st.enabled);
      setOffline(false);
      try {
        const a = await api.getLatestIntelligenceAudit();
        setAudit(a && a.cycle !== undefined ? a : null);
      } catch {
        setAudit(null);
      }
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const toggle = async () => {
    if (enabled === null || busy) return;
    setBusy(true);
    try {
      const r = await api.toggleDecisionIntelligence(!enabled);
      setEnabled(!!r.enabled);
    } catch {
      setOffline(true);
    } finally {
      setBusy(false);
    }
  };

  const stats = audit
    ? [
        { k: 'Options screened', v: `${audit.total_candidates_screened}`, tone: 'neutral' as const },
        { k: 'AI and twin agree on best', v: audit.ranking_concordance ? 'Yes' : 'No', tone: audit.ranking_concordance ? ('good' as const) : ('warn' as const) },
        { k: 'Avg coverage error', v: `${fmt(audit.mean_coverage_error, 2)} pts`, tone: 'neutral' as const },
        { k: 'Unsafe flagged / missed', v: `${audit.unsafe_candidates_flagged} / ${audit.false_negatives_count}`, tone: audit.false_negatives_count === 0 ? ('good' as const) : ('warn' as const) },
      ]
    : [];
  const color = { neutral: 'text-slate-100', good: 'text-emerald-300', warn: 'text-amber-300' };

  return (
    <div className="cr-panel p-4 cr-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-sky-400/15 border border-sky-300/30 text-sky-300 grid place-items-center">
            <Brain className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-slate-100 leading-tight">AI Risk Lens</h2>
            <p className="text-[13px] text-slate-400 leading-snug">AI predicts → digital twin verifies → referee decides</p>
          </div>
        </div>
        <span
          className={`shrink-0 text-[12px] font-bold cr-mono px-2 py-1 rounded-md border ${
            offline ? 'text-slate-300 border-white/15 bg-white/[0.04]' : enabled ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-slate-300 border-white/15 bg-white/[0.04]'
          }`}
        >
          {offline ? 'OFFLINE' : enabled ? 'ACTIVE' : 'STANDBY'}
        </span>
      </div>

      {offline ? (
        <p className="mt-3 text-[13.5px] text-slate-300 leading-snug">The AI Risk Lens needs the live engine. Start the backend to use it.</p>
      ) : (
        <>
          <button
            onClick={toggle}
            disabled={enabled === null || busy}
            className="cr-lift mt-3 w-full flex items-center justify-between gap-3 rounded-lg border border-white/12 bg-white/[0.03] hover:border-orange-300/45 px-3 py-2.5 text-left disabled:opacity-60"
            aria-pressed={!!enabled}
          >
            <span className="text-[14px] text-slate-200 leading-snug">Screen every option with the AI model before the twin checks it</span>
            <span className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-sky-400' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>

          {audit ? (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-2">
                {stats.map((s) => (
                  <div key={s.k} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                    <div className="text-[12px] text-slate-400 leading-tight">{s.k}</div>
                    <div className={`text-[18px] font-bold cr-mono mt-0.5 flex items-center gap-1 ${color[s.tone]}`}>
                      {s.v === 'Yes' && <Check className="w-4 h-4" strokeWidth={3} />}
                      {s.v === 'No' && <X className="w-4 h-4" strokeWidth={3} />}
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[12.5px] text-slate-400 cr-mono">
                AI {fmt(audit.ml_inference_total_ms, 1)} ms · twin {fmt(audit.twin_verification_total_ms, 1)} ms · cycle {audit.cycle}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[13.5px] text-slate-300 leading-snug">No audit yet. Turn the lens on, then run a scenario to see how closely the AI’s predictions match the digital twin.</p>
          )}
        </>
      )}

      <button onClick={onOpen} className="cr-lift mt-3 w-full h-10 rounded-lg border border-orange-300/40 bg-orange-400/10 hover:bg-orange-400/20 text-sky-200 font-semibold text-[14px] flex items-center justify-center gap-2">
        Open full audit <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};
