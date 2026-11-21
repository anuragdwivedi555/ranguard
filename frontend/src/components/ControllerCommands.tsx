import React from 'react';
import { ControllerCommand } from '../types';
import { Zap, Wifi, Radio, ArrowUpRight, ArrowDownRight, Power, Clock } from 'lucide-react';

interface ControllerCommandsProps {
  commands: ControllerCommand[];
  onEvaluate: () => void;
  isLoading: boolean;
}

export const ControllerCommands: React.FC<ControllerCommandsProps> = ({
  commands,
  onEvaluate,
  isLoading,
}) => {
  const getControllerBadge = (ctrl: string) => {
    switch (ctrl) {
      case 'ENERGY':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800">
            <Zap className="w-3 h-3" /> ENERGY CONTROLLER
          </span>
        );
      case 'COVERAGE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <Wifi className="w-3 h-3" /> COVERAGE CONTROLLER
          </span>
        );
      case 'INTERFERENCE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-400 border border-purple-800">
            <Radio className="w-3 h-3" /> INTERFERENCE CONTROLLER
          </span>
        );
      default:
        return <span>{ctrl}</span>;
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
            CONTROLLER PROPOSALS ({commands.length})
          </h2>
        </div>
        <button
          onClick={onEvaluate}
          disabled={isLoading || commands.length === 0}
          className="px-3 py-1 text-xs font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50"
        >
          Arbitrate Proposals
        </button>
      </div>

      <div className="space-y-2.5 overflow-y-auto max-h-[280px] pr-1">
        {commands.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs font-mono">
            No active proposals submitted for this cycle. All controllers satisfied.
          </div>
        ) : (
          commands.map((cmd) => {
            const isPowerUp = cmd.delta > 0;
            const isShutdown = cmd.action_type === 'SHUTDOWN';

            return (
              <div
                key={cmd.command_id}
                className="bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 rounded-lg p-3 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {getControllerBadge(cmd.controller_id)}
                    <span className="text-xs font-mono font-bold text-slate-200">
                      → {cmd.target_cell}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-mono font-bold">
                    {isShutdown ? (
                      <span className="flex items-center gap-0.5 text-rose-400">
                        <Power className="w-3.5 h-3.5" /> SHUTDOWN
                      </span>
                    ) : isPowerUp ? (
                      <span className="flex items-center gap-0.5 text-emerald-400">
                        <ArrowUpRight className="w-3.5 h-3.5" /> +{cmd.delta.toFixed(1)} dBm ({cmd.proposed_value} dBm)
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-amber-400">
                        <ArrowDownRight className="w-3.5 h-3.5" /> {cmd.delta.toFixed(1)} dBm ({cmd.proposed_value} dBm)
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[12px] text-slate-300 font-sans leading-relaxed">
                  {cmd.reason}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
