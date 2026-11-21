import React from 'react';
import { Power, Activity, Shuffle, ShieldAlert } from 'lucide-react';

interface ScenarioControlsProps {
  onRunScenario: (scenario: 'CELL_SHUTDOWN' | 'TRAFFIC_SPIKE' | 'PING_PONG') => void;
  isLoading: boolean;
}

export const ScenarioControls: React.FC<ScenarioControlsProps> = ({
  onRunScenario,
  isLoading,
}) => {
  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-3">
        <ShieldAlert className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
          MANDATORY SCENARIOS (HACKATHON DEMO)
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Scenario 2: Cell Shutdown (Primary Demo) */}
        <div className="p-3.5 rounded-lg border border-cyan-500/40 bg-cyan-950/20 flex flex-col justify-between relative group hover:border-cyan-400 transition">
          <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded bg-cyan-500 text-slate-950 text-[10px] font-mono font-bold">
            PRIMARY DEMO
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300 mb-1">
              <Power className="w-4 h-4 text-cyan-400" />
              1. CELL SHUTDOWN SCENARIO
            </div>
            <p className="text-[12px] text-slate-300 leading-relaxed mb-3">
              Energy Controller attempts to shut down CELL_03. RANGUARD simulates alternatives, blocks unsafe full shutdown (&lt;95% coverage), and modifies to partial power reduction.
            </p>
          </div>
          <button
            onClick={() => onRunScenario('CELL_SHUTDOWN')}
            disabled={isLoading}
            className="w-full py-1.5 px-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold shadow transition active:scale-95 disabled:opacity-50"
          >
            Run Cell Shutdown Demo
          </button>
        </div>

        {/* Scenario 1: Traffic Spike */}
        <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/50 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300 mb-1">
              <Activity className="w-4 h-4 text-amber-400" />
              2. TRAFFIC SPIKE SCENARIO
            </div>
            <p className="text-[12px] text-slate-300 leading-relaxed mb-3">
              Sudden user surge causes simultaneous coverage collapse and interference spikes. Coverage, Interference, and Energy controllers issue competing actions.
            </p>
          </div>
          <button
            onClick={() => onRunScenario('TRAFFIC_SPIKE')}
            disabled={isLoading}
            className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-semibold transition active:scale-95 border border-slate-700 disabled:opacity-50"
          >
            Run Traffic Spike Demo
          </button>
        </div>

        {/* Scenario 3: Ping-Pong Control */}
        <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/50 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-300 mb-1">
              <Shuffle className="w-4 h-4 text-purple-400" />
              3. PING-PONG STABILITY DEMO
            </div>
            <p className="text-[12px] text-slate-300 leading-relaxed mb-3">
              Alternating opposite power adjustments across 6 cycles. Demonstrates Cooldown, Hysteresis, and Reversal suppression versus raw baseline thrashing.
            </p>
          </div>
          <button
            onClick={() => onRunScenario('PING_PONG')}
            disabled={isLoading}
            className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-semibold transition active:scale-95 border border-slate-700 disabled:opacity-50"
          >
            Run Ping-Pong Demo
          </button>
        </div>
      </div>
    </div>
  );
};
