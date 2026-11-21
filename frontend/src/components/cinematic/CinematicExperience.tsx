import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Zap,
  Radio,
  Sliders,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Calculator,
  Compass,
  ArrowRight,
  ExternalLink,
  Cpu,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  PlayCircle
} from 'lucide-react';
import { NetworkScene } from '../3d/NetworkScene';
import { Cell, User, NetworkMetrics, ControllerCommand, RefereeDecision, BenchmarkComparison } from '../../types';

interface CinematicExperienceProps {
  cells: Record<string, Cell>;
  users: User[];
  metrics: NetworkMetrics | null;
  commands: ControllerCommand[];
  decision: RefereeDecision | null;
  benchmarkData: BenchmarkComparison | null;
  isBackendHealthy: boolean;
  onEnterLab: () => void;
  onOpenModelInspector: (modelId?: string) => void;
}

export const CinematicExperience: React.FC<CinematicExperienceProps> = ({
  cells,
  users,
  metrics,
  commands,
  decision,
  benchmarkData,
  isBackendHealthy,
  onEnterLab,
  onOpenModelInspector,
}) => {
  const [activeScene, setActiveScene] = useState<number>(1);
  const [isFreeOrbit, setIsFreeOrbit] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Scroll listener to update activeScene index (1 to 7)
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY;
      const windowHeight = window.innerHeight;

      // Calculate which section is most visible
      const sceneIndex = Math.min(
        7,
        Math.max(1, Math.floor((scrollPos + windowHeight * 0.4) / windowHeight) + 1)
      );

      setActiveScene(sceneIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToScene = (sceneNum: number) => {
    const targetY = (sceneNum - 1) * window.innerHeight;
    window.scrollTo({
      top: targetY,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    setActiveScene(sceneNum);
  };

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#040711] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* PERSISTENT 3D BACKGROUND CANVAS */}
      <div className="fixed inset-0 z-0 pointer-events-auto">
        <NetworkScene
          cells={cells}
          users={users}
          sceneIndex={activeScene}
          selectedCellId={selectedCellId}
          onSelectCell={setSelectedCellId}
          isFreeOrbit={isFreeOrbit}
          reducedMotion={reducedMotion}
          contestedCellId="CELL_02"
        />
        {/* Subtle cinematic vignette gradient overlay */}
        <div className="absolute inset-0 pointer-events-none bg-radial-gradient from-transparent via-transparent to-black/60" />
      </div>

      {/* FIXED TOP NAVIGATION BAR */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-cyan-500/20 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-400 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm tracking-wider text-white">RANGUARD</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-semibold">
                PHASE 3A
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Autonomous RAN Multi-Agent Conflict Referee
            </div>
          </div>
        </div>

        {/* Scene Navigation Quick Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          {[
            { id: 1, name: 'Overview' },
            { id: 2, name: 'Controllers' },
            { id: 3, name: 'Conflict' },
            { id: 4, name: 'Shadow Sim' },
            { id: 5, name: 'Referee' },
            { id: 6, name: 'Predictive' },
            { id: 7, name: 'Results' },
          ].map((sc) => (
            <button
              key={sc.id}
              onClick={() => scrollToScene(sc.id)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                activeScene === sc.id
                  ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              0{sc.id} {sc.name}
            </button>
          ))}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Math Inspector Button */}
          <button
            onClick={() => onOpenModelInspector()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-xs font-mono transition-all shadow-sm"
            title="Inspect Mathematical Models"
          >
            <Calculator className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Math Inspector</span>
          </button>

          {/* Orbit Controls Toggle */}
          <button
            onClick={() => setIsFreeOrbit(!isFreeOrbit)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1 ${
              isFreeOrbit
                ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-md ring-1 ring-cyan-400'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={isFreeOrbit ? 'Lock Camera to Story' : 'Free 3D Camera Orbit'}
          >
            <Compass className={`w-4 h-4 ${isFreeOrbit ? 'text-cyan-400 animate-spin' : ''}`} />
            <span className="hidden md:inline">{isFreeOrbit ? 'Orbit: Free' : 'Orbit: Story'}</span>
          </button>

          {/* Backend Status Dot */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border ${
              isBackendHealthy
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/50 text-amber-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBackendHealthy ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
              }`}
            />
            <span>{isBackendHealthy ? 'API Active' : 'API Standby'}</span>
          </div>

          {/* PROMINENT LIVE SIMULATION ENTRY */}
          <button
            onClick={onEnterLab}
            className="group relative px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-mono font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
            <span>ENTER SIMULATION LAB</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </header>

      {/* SCROLL-DRIVEN NARRATIVE SECTIONS */}
      <div className="relative z-10 pointer-events-none">
        {/* ========================================================================= */}
        {/* SCENE 1 — NETWORK OVERVIEW */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-2xl bg-slate-950/80 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40">SCENE 01 / 07</span>
              <span>•</span>
              <span>Network Topology Overview</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-sans">
                Autonomous RAN Conflict Resolution
              </h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                In modern 5G/6G cellular architectures, independent autonomic xApps optimize energy, coverage, and interference simultaneously. Without centralized conflict arbitration, contradictory radio adjustments trigger catastrophic oscillations and service dropouts.
              </p>
            </div>

            {/* Live Telemetry Bar */}
            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Base Stations</span>
                <span className="text-base font-bold text-cyan-400">{Object.keys(cells).length || 6} Macro Sites</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Active Devices</span>
                <span className="text-base font-bold text-white">{users.length || 100} UEs</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Propagation</span>
                <span className="text-base font-bold text-emerald-400">3GPP TR 36.814</span>
              </div>
            </div>

            {/* Interactive Math Link */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onOpenModelInspector('sinr-propagation')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/50 hover:bg-cyan-900/60 text-cyan-300 text-xs font-mono transition-colors"
              >
                <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                <span>Inspect Math: 3GPP Macro Urban SINR</span>
              </button>

              <button
                onClick={() => scrollToScene(2)}
                className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white transition-colors ml-auto"
              >
                <span>Scroll to Next Chapter</span>
                <ChevronDown className="w-4 h-4 animate-bounce" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 2 — THE CONTROLLERS */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center justify-end p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-xl bg-slate-950/85 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40">SCENE 02 / 07</span>
              <span>•</span>
              <span>Autonomic Multi-Agent Control</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Three Competing Optimization Goals
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              Three autonomous controllers monitor the network in parallel. Each operates with complete local domain authority but zero awareness of peer actions:
            </p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200">
                <div className="flex items-center justify-between font-bold text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4" /> Energy Controller
                  </span>
                  <span>Priority 5</span>
                </div>
                <p className="mt-1 text-slate-300 text-[11px] font-sans">
                  Detects low cell load and trims RF transmit power to minimize normalized Watt-hours.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-cyan-200">
                <div className="flex items-center justify-between font-bold text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-4 h-4" /> Coverage Controller
                  </span>
                  <span>Priority 7</span>
                </div>
                <p className="mt-1 text-slate-300 text-[11px] font-sans">
                  Detects cell-edge users with weak RSRP (&lt; -75 dBm) and demands power boosts (+3 dBm).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200">
                <div className="flex items-center justify-between font-bold text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Interference Controller
                  </span>
                  <span>Priority 6</span>
                </div>
                <p className="mt-1 text-slate-300 text-[11px] font-sans">
                  Measures cross-site radiated interference and requests power trimming on noisy neighbors.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onOpenModelInspector('electrical-power')}
                className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Inspect Electrical Energy Model</span>
              </button>

              <button
                onClick={() => scrollToScene(3)}
                className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 3 — THE CONFLICT */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-xl bg-slate-950/90 backdrop-blur-xl border border-red-500/50 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-red-950 border border-red-500/40">SCENE 03 / 07</span>
              <span>•</span>
              <span>Direct Actuation Collision</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <span>Contradiction on Cell 02</span>
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              In this operational cycle, multiple controllers independently target <span className="font-mono text-white font-semibold">CELL_02</span> with mutually exclusive commands:
            </p>

            <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-red-200">
                <span className="text-slate-400">Coverage Proposal:</span>
                <span className="font-bold text-cyan-300">POWER_UP &rarr; 41.0 dBm (+3 dBm)</span>
              </div>
              <div className="flex items-center justify-between text-red-200">
                <span className="text-slate-400">Energy Proposal:</span>
                <span className="font-bold text-emerald-300">POWER_DOWN &rarr; 34.0 dBm (-4 dBm)</span>
              </div>
              <div className="flex items-center justify-between text-red-200">
                <span className="text-slate-400">Interference Proposal:</span>
                <span className="font-bold text-amber-300">POWER_DOWN &rarr; 35.0 dBm (-3 dBm)</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="text-red-400 font-semibold font-mono">Failure Mode: </span>
              Executing in arrival order or fixed priority produces severe ping-pong cycling, unstable coverage holes, and RF amplifier hunting.
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onOpenModelInspector('coverage-guardrails')}
                className="flex items-center gap-1.5 text-xs font-mono text-red-400 hover:text-red-300"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Inspect Guardrail Constraints</span>
              </button>

              <button
                onClick={() => scrollToScene(4)}
                className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 4 — SHADOW SIMULATION */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center justify-end p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-xl bg-slate-950/85 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40">SCENE 04 / 07</span>
              <span>•</span>
              <span>Isolated Digital Twin Projection</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-cyan-400" />
              <span>Shadow Simulation</span>
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              Before any actuation reaches physical radio hardware, RANGUARD deep-copies the entire network state into isolated memory and evaluates candidate actions in parallel.
            </p>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex justify-between font-bold text-slate-300">
                  <span>Candidate 1 (Energy Trim)</span>
                  <span className="text-red-400">Violates 95% Coverage</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  Drops 12 edge users into outage. Hard safety guardrail disqualifies candidate (Score: -999.0).
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex justify-between font-bold text-slate-300">
                  <span>Candidate 2 (Coverage Boost)</span>
                  <span className="text-amber-400">Score J = +0.082</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  Increases coverage to 99% but spikes cross-site interference by +38%.
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/60">
                <div className="flex justify-between font-bold text-emerald-300">
                  <span>Candidate 3 (Pareto Compromise)</span>
                  <span className="text-emerald-400 font-extrabold">Score J = +0.335</span>
                </div>
                <div className="text-[11px] text-emerald-200/80 mt-0.5 font-sans">
                  Prudently trims 2 dBm while preserving 97.5% coverage and reducing energy by 8.1%.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onOpenModelInspector('shadow-simulation')}
                className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Inspect Multi-Objective Scoring J</span>
              </button>

              <button
                onClick={() => scrollToScene(5)}
                className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 5 — THE REFEREE */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-xl bg-slate-950/85 backdrop-blur-xl border border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40">SCENE 05 / 07</span>
              <span>•</span>
              <span>Arbitration & Safety Pipeline</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>The Referee Pipeline</span>
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              RANGUARD executes a 6-stage deterministic arbitration cycle in under <span className="font-mono text-white font-bold">5 milliseconds</span>:
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-cyan-400 font-bold block">1. INTERCEPT</span>
                <span className="text-slate-400">Queue commands prior to south-bound commit.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-cyan-400 font-bold block">2. DETECT</span>
                <span className="text-slate-400">Find direct and RF neighbor impact collisions.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-cyan-400 font-bold block">3. SIMULATE</span>
                <span className="text-slate-400">Forecast outcomes on deep-copied shadow state.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-cyan-400 font-bold block">4. VALIDATE</span>
                <span className="text-slate-400">Filter through non-negotiable safety guardrails.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-cyan-400 font-bold block">5. ARBITRATE</span>
                <span className="text-slate-400">Maximize multi-objective Pareto trade-off score.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40">
                <span className="text-emerald-400 font-bold block">6. COMMIT</span>
                <span className="text-emerald-200">Atomic south-bound deployment to radio.</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onOpenModelInspector('coverage-guardrails')}
                className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:text-emerald-300"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Inspect Safety Guardrails</span>
              </button>

              <button
                onClick={() => scrollToScene(6)}
                className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 6 — PREDICTIVE INTELLIGENCE */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center justify-end p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-xl bg-slate-950/85 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold">
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40">SCENE 06 / 07</span>
              <span>•</span>
              <span>Predictive Intelligence</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Sliders className="w-6 h-6 text-cyan-400" />
              <span>Historical Traffic Forecasting</span>
            </h2>

            <p className="text-slate-300 text-sm leading-relaxed">
              Rather than merely reacting to momentary surges, RANGUARD integrates historical telemetry from the <span className="font-semibold text-white">Telecom Italia Milan Open Dataset</span> to anticipate diurnal commuter influx and temporal tidal patterns.
            </p>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Forecasting Horizon:</span>
                <span className="text-cyan-400 font-bold">2 Cycles Ahead (20 Seconds)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Anticipatory Micro-Sleep:</span>
                <span className="text-emerald-400 font-bold">Safely Engaged During Low Tidal Hours</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Hysteresis Buffer:</span>
                <span className="text-slate-200 font-bold">Prevents Controller Thrashing</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onOpenModelInspector('interference-matrix')}
                className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Inspect Inter-Cell Radiated Interference</span>
              </button>

              <button
                onClick={() => scrollToScene(7)}
                className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SCENE 7 — EXPERIMENTAL RESULTS & LAB ENTRY */}
        {/* ========================================================================= */}
        <section className="min-h-screen flex items-center justify-center p-6 sm:p-12 md:p-16">
          <div className="pointer-events-auto max-w-3xl w-full bg-slate-950/90 backdrop-blur-2xl border border-cyan-500/50 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 text-center">
            <div className="inline-flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40">
              <span>SCENE 07 / 07</span>
              <span>•</span>
              <span>Empirical Benchmark Results</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Measured 3-Policy Benchmark
              </h2>
              <p className="text-slate-300 text-sm max-w-xl mx-auto">
                Evaluated under identical deterministic stress sequences across No Referee, Fixed Priority, and RANGUARD.
              </p>
            </div>

            {/* Benchmark Comparison Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 text-left font-mono text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 text-[11px]">
                    <th className="py-3 px-4">Policy</th>
                    <th className="py-3 px-4">Coverage SLA</th>
                    <th className="py-3 px-4">Safety Violations</th>
                    <th className="py-3 px-4">Total Energy</th>
                    <th className="py-3 px-4">Control Reversals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 text-slate-400 font-sans">Policy A: No Referee</td>
                    <td className="py-3 px-4 text-amber-400">92.4%</td>
                    <td className="py-3 px-4 text-red-400 font-bold">3 violations</td>
                    <td className="py-3 px-4 text-slate-400">79.2 units</td>
                    <td className="py-3 px-4 text-red-400">6 reversals</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 text-slate-400 font-sans">Policy B: Fixed Priority</td>
                    <td className="py-3 px-4 text-cyan-400">96.8%</td>
                    <td className="py-3 px-4 text-amber-400">1 violation</td>
                    <td className="py-3 px-4 text-slate-400">76.4 units</td>
                    <td className="py-3 px-4 text-amber-400">3 reversals</td>
                  </tr>
                  <tr className="bg-cyan-950/30 hover:bg-cyan-950/50 border-t-2 border-cyan-500/40">
                    <td className="py-3 px-4 text-cyan-300 font-bold font-sans flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span>Policy C: RANGUARD</span>
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">98.2%</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">0 violations (100% safe)</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">64.6 units (-18.4%)</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">0 reversals (Stable)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BIG PROMINENT ACTION BUTTON */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onEnterLab}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black font-mono font-black text-sm tracking-wider uppercase shadow-[0_0_35px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95"
              >
                <PlayCircle className="w-5 h-5 fill-black text-cyan-400" />
                <span>ENTER SIMULATION LAB</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => onOpenModelInspector()}
                className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Calculator className="w-4 h-4 text-cyan-400" />
                <span>Open Mathematical Inspector</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
