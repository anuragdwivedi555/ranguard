import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Lightbulb,
  Search,
  X,
} from 'lucide-react';
import { MATHEMATICAL_MODELS, MathModelDoc } from './modelRegistry';
import { MathView } from './MathView';

interface ModelInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  initialModelId?: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  'RF & Propagation': '#60a5fa',
  'Energy & Physics': '#4ade80',
  'Safety & Guardrails': '#f87171',
  'Shadow Simulation': '#ff9a3d',
  Interference: '#c084fc',
  'Stability & Hysteresis': '#2dd4bf',
  'Predictive Intelligence': '#f472b6',
};
const colorOf = (c: string) => CATEGORY_COLOR[c] ?? '#ff9a3d';

const SECTIONS = [
  { id: 'formula', label: 'Formula' },
  { id: 'variables', label: 'Variables' },
  { id: 'example', label: 'Worked example' },
  { id: 'takeaway', label: 'Takeaway' },
] as const;

export const ModelInspector: React.FC<ModelInspectorProps> = ({ isOpen, onClose, initialModelId = 'dbm-to-watt' }) => {
  const [selectedId, setSelectedId] = useState<string>(initialModelId);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const scroller = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // jump to the model the caller asked for whenever the inspector is (re)opened
  useEffect(() => {
    if (isOpen) setSelectedId(initialModelId);
  }, [isOpen, initialModelId]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(MATHEMATICAL_MODELS.map((m) => m.category)))], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MATHEMATICAL_MODELS.filter(
      (m) =>
        (category === 'All' || m.category === category) &&
        (!q || m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.shortDescription.toLowerCase().includes(q)),
    );
  }, [query, category]);

  const index = Math.max(0, MATHEMATICAL_MODELS.findIndex((m) => m.id === selectedId));
  const current: MathModelDoc = MATHEMATICAL_MODELS[index];
  const accent = colorOf(current.category);
  const prev = MATHEMATICAL_MODELS[(index - 1 + MATHEMATICAL_MODELS.length) % MATHEMATICAL_MODELS.length];
  const next = MATHEMATICAL_MODELS[(index + 1) % MATHEMATICAL_MODELS.length];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setCopied(false);
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // keyboard: Esc closes, ←/→ step through the algorithms
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!typing && e.key === 'ArrowRight') select(next.id);
      if (!typing && e.key === 'ArrowLeft') select(prev.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, select, next.id, prev.id]);

  if (!isOpen) return null;

  const copy = () => {
    navigator.clipboard?.writeText(current.formulaLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const jump = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0a0814]/80 backdrop-blur-md cr-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Mathematical and algorithmic inspector"
    >
      <div className="relative w-full max-w-6xl h-[90vh] bg-[#16132b] border border-orange-300/20 rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-slate-100">
        {/* ───── header ───── */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/[0.08] bg-gradient-to-r from-orange-400/[0.08] via-transparent to-transparent">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-sky-400/15 border border-sky-300/35 text-sky-300 grid place-items-center">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-[19px] font-bold tracking-tight text-white">Math &amp; algorithm inspector</h2>
                <span className="text-[12px] font-semibold px-2 py-0.5 rounded-md bg-emerald-400/10 border border-emerald-400/30 text-emerald-300">KaTeX verified</span>
              </div>
              <p className="text-[13.5px] text-slate-300 truncate">The real formulas, variable meanings and worked numbers behind every RANGUARD decision.</p>
            </div>
          </div>
          <button onClick={onClose} className="cr-lift shrink-0 w-9 h-9 grid place-items-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 border border-white/10" title="Close (Esc)" aria-label="Close inspector">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* ───── sidebar ───── */}
          <aside className="md:w-[310px] shrink-0 md:border-r border-b md:border-b-0 border-white/[0.08] bg-black/20 flex flex-col min-h-0">
            <div className="md:hidden p-3">
              <select
                value={current.id}
                onChange={(e) => select(e.target.value)}
                aria-label="Choose algorithm"
                className="w-full bg-white/[0.06] border border-white/15 rounded-lg px-3 py-2.5 text-[14.5px] text-slate-100 focus:outline-none focus:border-orange-300/60"
              >
                {MATHEMATICAL_MODELS.map((m, i) => (
                  <option key={m.id} value={m.id} className="bg-[#1a1730]">
                    {String(i + 1).padStart(2, '0')} · {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="hidden md:block p-3 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search algorithms…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-[14px] text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-300/60 focus:bg-white/[0.07] transition-colors"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {categories.map((c) => {
                  const on = c === category;
                  const col = c === 'All' ? '#ff9a3d' : colorOf(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className="shrink-0 text-[12.5px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
                      style={{ color: on ? '#20120a' : '#d3cbe4', background: on ? col : 'transparent', borderColor: on ? col : 'rgba(255,255,255,0.14)' }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden md:block flex-1 min-h-0 overflow-y-auto px-2.5 pb-3 space-y-1.5">
              {filtered.length === 0 && <div className="text-[14px] text-slate-400 px-3 py-6">No algorithm matches “{query}”.</div>}
              {filtered.map((m) => {
                const active = m.id === current.id;
                const col = colorOf(m.category);
                return (
                  <button
                    key={m.id}
                    onClick={() => select(m.id)}
                    className={`cr-lift w-full text-left p-3 rounded-xl border relative overflow-hidden ${
                      active ? 'bg-orange-400/[0.1] border-orange-300/50' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: col, opacity: active ? 1 : 0.55 }} />
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: col }}>
                        {m.category}
                      </span>
                      <span className="ml-auto text-[12px] cr-mono text-slate-500">{String(MATHEMATICAL_MODELS.indexOf(m) + 1).padStart(2, '0')}</span>
                    </div>
                    <div className={`pl-1 mt-1 text-[14.5px] font-semibold leading-snug ${active ? 'text-white' : 'text-slate-100'}`}>{m.title}</div>
                    <div className="pl-1 mt-1 text-[12.5px] text-slate-400 line-clamp-2 leading-snug">{m.shortDescription}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ───── main ───── */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {/* section tabs */}
            <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-white/[0.08] overflow-x-auto">
              {SECTIONS.map((s) => (
                <button key={s.id} onClick={() => jump(s.id)} className="px-3 py-2 text-[13.5px] font-semibold text-slate-300 hover:text-white border-b-2 border-transparent hover:border-orange-300/70 transition-colors whitespace-nowrap">
                  {s.label}
                </button>
              ))}
            </div>

            <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-6 space-y-7 scroll-smooth">
              <div key={current.id} className="cr-fade-in space-y-7">
                {/* title */}
                <header className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[12.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border" style={{ color: accent, background: `${accent}1a`, borderColor: `${accent}55` }}>
                      {current.category}
                    </span>
                    <span className="text-[13px] text-slate-400 cr-mono">spec #{current.id}</span>
                  </div>
                  <h3 className="text-[28px] leading-tight font-extrabold tracking-tight text-white">{current.title}</h3>
                  <p className="text-[16px] text-slate-200 leading-relaxed max-w-[78ch]">{current.shortDescription}</p>
                </header>

                {/* implementation */}
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2 text-[13.5px] text-slate-300 shrink-0">
                    <Code2 className="w-4 h-4 text-sky-300" />
                    Implemented in
                  </div>
                  <code className="cr-mono text-[13px] text-sky-200 bg-sky-400/10 border border-sky-300/25 rounded-md px-2 py-1 w-fit">{current.implementationFile}</code>
                  <code className="cr-mono text-[12.5px] text-slate-400 break-all lg:ml-auto">{current.functionSignature}</code>
                </div>

                {/* formula */}
                <section ref={(el) => (sectionRefs.current.formula = el)} className="scroll-mt-4">
                  <div className="rounded-2xl border border-orange-300/25 bg-gradient-to-b from-[#241c3c] to-[#1a1630] p-5 sm:p-6 relative overflow-hidden">
                    <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-[0.13] blur-3xl" style={{ background: accent }} />
                    <div className="relative flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 text-[14px] font-bold text-sky-200">
                        <BookOpen className="w-4 h-4" />
                        Governing formulation
                      </div>
                      <button
                        onClick={copy}
                        className={`cr-lift flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] font-semibold ${copied ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300' : 'bg-white/[0.06] border-white/15 text-slate-100 hover:border-orange-300/60'}`}
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied LaTeX' : 'Copy LaTeX'}
                      </button>
                    </div>
                    <div className="relative overflow-x-auto py-3 text-slate-50 [&_.katex]:text-[1.18em]">
                      <MathView math={current.formulaLatex} block />
                    </div>
                    <div className="relative text-[12.5px] text-slate-400 mt-1">Scroll sideways if a line is wider than the panel.</div>
                  </div>
                </section>

                {/* variables */}
                <section ref={(el) => (sectionRefs.current.variables = el)} className="scroll-mt-4 space-y-3">
                  <div className="flex items-baseline gap-2.5">
                    <h4 className="text-[18px] font-bold text-white">Variables &amp; units</h4>
                    <span className="text-[13px] text-slate-400">{current.variables.length} parameters</span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {current.variables.map((v, i) => (
                      <div key={i} className="cr-lift rounded-xl border border-white/[0.09] bg-white/[0.03] hover:border-orange-300/35 p-3.5 flex gap-3.5">
                        <div className="shrink-0 min-w-[54px] h-[54px] px-2 rounded-lg grid place-items-center text-[1.15em] text-sky-200 bg-sky-400/10 border border-sky-300/25">
                          <MathView math={v.latex} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[15px] font-semibold text-slate-100">{v.name}</span>
                            <span className="cr-mono text-[12px] text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded px-1.5 py-0.5">{v.unit}</span>
                          </div>
                          <p className="text-[13.5px] text-slate-300 leading-snug mt-1">{v.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* worked example */}
                <section ref={(el) => (sectionRefs.current.example = el)} className="scroll-mt-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-[18px] font-bold text-white">Worked example</h4>
                    <span className="text-[13.5px] text-slate-300">{current.workedExample.scenario}</span>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-300">Inputs</span>
                      {Object.entries(current.workedExample.inputs).map(([k, v]) => (
                        <span key={k} className="cr-mono text-[13px] px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/10">
                          <span className="text-slate-400">{k} = </span>
                          <span className="text-sky-200 font-semibold">{v}</span>
                        </span>
                      ))}
                    </div>

                    <ol className="relative space-y-3">
                      {current.workedExample.steps.map((st, idx) => (
                        <li key={idx} className="relative pl-11">
                          {idx < current.workedExample.steps.length - 1 && <span className="absolute left-[15px] top-9 bottom-[-12px] w-px bg-white/15" />}
                          <span className="absolute left-0 top-0.5 w-8 h-8 rounded-full bg-sky-400 text-slate-900 font-bold text-[14px] grid place-items-center">{idx + 1}</span>
                          <div className="rounded-xl border border-white/[0.09] bg-white/[0.03] p-3.5 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[15px] font-semibold text-slate-100">{st.stepTitle}</span>
                              <span className="cr-mono text-[13px] font-bold text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded-md">{st.stepResult}</span>
                            </div>
                            <div className="overflow-x-auto py-1 text-slate-50">
                              <MathView math={st.stepFormula} />
                            </div>
                            <p className="text-[13.5px] text-slate-300 leading-relaxed">{st.stepExplanation}</p>
                          </div>
                        </li>
                      ))}
                    </ol>

                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/35 bg-emerald-400/[0.08] px-4 py-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[13px] font-semibold text-emerald-200">Calculated outcome</div>
                        <div className="text-[15.5px] font-semibold text-white leading-snug">{current.workedExample.finalResult}</div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* takeaway */}
                <section ref={(el) => (sectionRefs.current.takeaway = el)} className="scroll-mt-4">
                  <div className="rounded-2xl border border-orange-300/30 bg-orange-400/[0.07] p-4 sm:p-5 flex gap-3.5">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-sky-400 text-slate-900 grid place-items-center">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-bold text-sky-200">Engineering takeaway</div>
                      <p className="text-[15.5px] text-slate-50 leading-relaxed mt-1">{current.keyTakeaway}</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* ───── footer ───── */}
        <div className="px-4 sm:px-6 py-3 border-t border-white/[0.08] bg-black/25 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => select(prev.id)} className="cr-lift flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:border-orange-300/50 text-[13.5px] text-slate-200 max-w-[210px]" title={`Previous: ${prev.title}`}>
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="truncate hidden sm:inline">{prev.title}</span>
              <span className="sm:hidden">Prev</span>
            </button>
            <span className="text-[13px] text-slate-400 cr-mono px-1">
              {index + 1} / {MATHEMATICAL_MODELS.length}
            </span>
            <button onClick={() => select(next.id)} className="cr-lift flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:border-orange-300/50 text-[13.5px] text-slate-200 max-w-[210px]" title={`Next: ${next.title}`}>
              <span className="truncate hidden sm:inline">{next.title}</span>
              <span className="sm:hidden">Next</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-[12.5px] text-slate-400">← → switch algorithm · Esc close</span>
            <button onClick={onClose} className="cr-lift px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-900 font-semibold text-[14px]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
