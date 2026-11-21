import React from 'react';
import { ShieldCheck, RefreshCw, Play, BarChart3, Radio, Calculator, Sparkles } from 'lucide-react';

interface HeaderProps {
  cycle: number;
  stateVersion: number;
  isBackendHealthy: boolean;
  mlEnabled?: boolean;
  onToggleML?: () => void;
  onReset: () => void;
  onStep: () => void;
  onRunBenchmark: () => void;
  isLoading: boolean;
  onSwitchToCinematic?: () => void;
  onOpenModelInspector?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cycle,
  stateVersion,
  isBackendHealthy,
  mlEnabled = true,
  onToggleML,
  onReset,
  onStep,
  onRunBenchmark,
  isLoading,
  onSwitchToCinematic,
  onOpenModelInspector,
}) => {
  return (
    <header className="bg-slate-900/95 border-b border-slate-800 px-4 sm:px-6 py-3 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-lg text-white font-mono">RANGUARD</span>
              <span className="px-2 py-0.5 text-[9px] font-semibold tracking-wide bg-cyan-950 text-cyan-400 border border-cyan-800 rounded font-mono">
                SIMULATION LAB
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans hidden sm:block">
              Autonomous Mobile Network Conflict-Resolution Referee
            </p>
          </div>
        </div>

        {/* Live Simulation Meta */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400 hidden xs:inline">STATUS:</span>
            <span className={isBackendHealthy ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
              {isBackendHealthy ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800 text-slate-300">
            <span className="text-slate-500 mr-1 hidden xs:inline">CYCLE:</span>
            <span className="text-cyan-400 font-bold">#{cycle}</span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800 text-slate-300">
            <span className="text-slate-500 mr-1 hidden xs:inline">VER:</span>
            <span className="text-indigo-400 font-bold">v{stateVersion}</span>
          </div>

          {/* ML Predictive Advisory Toggle Chip */}
          {onToggleML && (
            <button
              onClick={onToggleML}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono transition active:scale-95 disabled:opacity-50 ${
                mlEnabled
                  ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/50 shadow-sm shadow-cyan-900/30'
                  : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:bg-slate-800/60'
              }`}
              title="Toggle XGBoost predictive traffic advisory (Milan 10-min CDR activity index)"
            >
              <span className={`w-2 h-2 rounded-full ${mlEnabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-slate-400">ML ADVISOR:</span>
              <span className={`font-bold ${mlEnabled ? 'text-cyan-400' : 'text-slate-500'}`}>
                {mlEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Explore Cinematic 3D Story Button */}
          {onSwitchToCinematic && (
            <button
              onClick={onSwitchToCinematic}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 hover:text-white bg-cyan-950/70 hover:bg-cyan-900/80 active:scale-95 transition rounded-lg border border-cyan-500/40 shadow-sm"
              title="Return to the Cinematic 3D Technical Experience"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Cinematic 3D</span>
            </button>
          )}

          {/* Math Inspector Button */}
          {onOpenModelInspector && (
            <button
              onClick={onOpenModelInspector}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-lg border border-slate-700"
              title="Inspect Mathematics & Formulas"
            >
              <Calculator className="w-3.5 h-3.5 text-cyan-400" />
              <span>Math</span>
            </button>
          )}

          <button
            onClick={onReset}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-lg border border-slate-700 disabled:opacity-50"
            title="Reset network to deterministic seed=42"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={onStep}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-lg border border-slate-700 disabled:opacity-50"
            title="Advance simulation by 1 cycle"
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Step Cycle</span>
          </button>

          <button
            onClick={onRunBenchmark}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 active:scale-95 transition rounded-lg shadow-md shadow-cyan-600/30 border border-cyan-400/40 disabled:opacity-50"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3-Policy</span> Benchmark
          </button>
        </div>
      </div>
    </header>
  );
};
