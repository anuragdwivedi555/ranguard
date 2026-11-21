import React from 'react';
import { RefereeDecision } from '../types';
import { History, Check, Edit3, Clock, X } from 'lucide-react';

interface DecisionHistoryProps {
  history: RefereeDecision[];
}

export const DecisionHistory: React.FC<DecisionHistoryProps> = ({ history }) => {
  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'APPROVE':
        return <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">APPROVE</span>;
      case 'MODIFY':
        return <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800">MODIFY</span>;
      case 'DELAY':
        return <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-950 text-amber-400 border border-amber-800">DELAY</span>;
      case 'REJECT':
        return <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-rose-950 text-rose-400 border border-rose-800">REJECT</span>;
      default:
        return <span>{verdict}</span>;
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-3">
        <History className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
          DECISION AUDIT TRAIL ({history.length} RECORDS)
        </h2>
      </div>

      <div className="overflow-x-auto max-h-[300px]">
        {history.length === 0 ? (
          <div className="p-6 text-center text-slate-500 font-mono text-xs">
            No arbitration decisions recorded yet.
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
              <tr>
                <th className="p-2.5">Cycle</th>
                <th className="p-2.5">Verdict</th>
                <th className="p-2.5">Controllers</th>
                <th className="p-2.5">Action Executed</th>
                <th className="p-2.5">Explanation</th>
                <th className="p-2.5">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((dec) => (
                <tr key={dec.decision_id} className="hover:bg-slate-800/40 transition">
                  <td className="p-2.5 text-slate-300 font-bold">#{dec.cycle}</td>
                  <td className="p-2.5">{getVerdictBadge(dec.verdict)}</td>
                  <td className="p-2.5 text-slate-300">
                    {dec.controllers_involved.join(', ') || 'NONE'}
                  </td>
                  <td className="p-2.5 text-cyan-300 font-medium">
                    {Object.keys(dec.selected_action).length > 0
                      ? Object.entries(dec.selected_action)
                          .map(([c, a]: [string, any]) => `${c}: ${a.tx_power_dbm ?? a.status}`)
                          .join(', ')
                      : 'Preserve state'}
                  </td>
                  <td className="p-2.5 text-slate-300 font-sans max-w-md truncate" title={dec.reason}>
                    {dec.reason}
                  </td>
                  <td className="p-2.5 text-slate-400 font-mono">{dec.computation_time_ms.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
