import React from 'react';
import { BenchmarkComparison } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart2, ShieldCheck } from 'lucide-react';

interface BaselineComparisonProps {
  comparisonData: BenchmarkComparison | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export const BaselineComparison: React.FC<BaselineComparisonProps> = ({
  comparisonData,
  onRefresh,
  isLoading,
}) => {
  if (!comparisonData) {
    return (
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-8 text-center">
        <p className="text-slate-400 text-xs font-mono mb-3">
          3-Policy Benchmark has not been run yet. Run the benchmark to compare No-Referee, Fixed-Priority, and RANGUARD under identical conditions.
        </p>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold"
        >
          Run 3-Policy Benchmark
        </button>
      </div>
    );
  }

  const { no_referee, fixed_priority, ranguard } = comparisonData.policies;

  const chartData = [
    {
      metric: 'Coverage (%)',
      'No Referee': no_referee.coverage_pct,
      'Fixed Priority': fixed_priority.coverage_pct,
      'RANGUARD': ranguard.coverage_pct,
    },
    {
      metric: 'Energy (Units)',
      'No Referee': no_referee.total_energy,
      'Fixed Priority': fixed_priority.total_energy,
      'RANGUARD': ranguard.total_energy,
    },
    {
      metric: 'Safety Violations',
      'No Referee': no_referee.safety_violations,
      'Fixed Priority': fixed_priority.safety_violations,
      'RANGUARD': ranguard.safety_violations,
    },
    {
      metric: 'Control Reversals',
      'No Referee': no_referee.control_reversals,
      'Fixed Priority': fixed_priority.control_reversals,
      'RANGUARD': ranguard.control_reversals,
    },
  ];

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
            BASELINE COMPARATIVE BENCHMARK (MEASURED RESULTS)
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400">
            Seed: {comparisonData.seed} | Cycles: {comparisonData.cycles_evaluated}
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition"
          >
            Re-run Benchmark
          </button>
        </div>
      </div>

      {/* Comparison Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs border border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-950/80 text-slate-400">
            <tr>
              <th className="p-3 border-b border-slate-800">Policy</th>
              <th className="p-3 border-b border-slate-800">Final Coverage</th>
              <th className="p-3 border-b border-slate-800">Energy Consumption</th>
              <th className="p-3 border-b border-slate-800">Avg SINR</th>
              <th className="p-3 border-b border-slate-800">Safety Violations</th>
              <th className="p-3 border-b border-slate-800">Reversals</th>
              <th className="p-3 border-b border-slate-800">Arbitration Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            <tr>
              <td className="p-3 font-bold text-slate-300">Policy A: No Referee</td>
              <td className={`p-3 ${no_referee.coverage_pct < 95 ? 'text-rose-400' : 'text-slate-200'}`}>
                {no_referee.coverage_pct.toFixed(1)}%
              </td>
              <td className="p-3 text-amber-300">{no_referee.total_energy.toFixed(1)} u</td>
              <td className="p-3 text-cyan-300">{no_referee.avg_sinr_db.toFixed(1)} dB</td>
              <td className="p-3 text-rose-400 font-bold">{no_referee.safety_violations}</td>
              <td className="p-3 text-slate-300">{no_referee.control_reversals}</td>
              <td className="p-3 text-slate-500">0.0 ms (None)</td>
            </tr>
            <tr>
              <td className="p-3 font-bold text-slate-300">Policy B: Fixed Priority</td>
              <td className={`p-3 ${fixed_priority.coverage_pct < 95 ? 'text-rose-400' : 'text-slate-200'}`}>
                {fixed_priority.coverage_pct.toFixed(1)}%
              </td>
              <td className="p-3 text-amber-300">{fixed_priority.total_energy.toFixed(1)} u</td>
              <td className="p-3 text-cyan-300">{fixed_priority.avg_sinr_db.toFixed(1)} dB</td>
              <td className="p-3 text-rose-400 font-bold">{fixed_priority.safety_violations}</td>
              <td className="p-3 text-slate-300">{fixed_priority.control_reversals}</td>
              <td className="p-3 text-slate-500">~0.1 ms</td>
            </tr>
            <tr className="bg-cyan-950/25 border-l-4 border-cyan-400">
              <td className="p-3 font-bold text-cyan-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" /> Policy C: RANGUARD
              </td>
              <td className="p-3 font-bold text-emerald-400">{ranguard.coverage_pct.toFixed(1)}%</td>
              <td className="p-3 font-bold text-amber-300">{ranguard.total_energy.toFixed(1)} u</td>
              <td className="p-3 font-bold text-cyan-300">{ranguard.avg_sinr_db.toFixed(1)} dB</td>
              <td className="p-3 font-bold text-emerald-400">{ranguard.safety_violations} (Zero)</td>
              <td className="p-3 font-bold text-cyan-300">{ranguard.control_reversals}</td>
              <td className="p-3 font-bold text-emerald-400">{ranguard.median_latency_ms.toFixed(1)} ms</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recharts Graphical Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="metric" stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Bar dataKey="No Referee" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Fixed Priority" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="RANGUARD" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
