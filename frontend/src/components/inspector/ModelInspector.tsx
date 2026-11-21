import React, { useState } from 'react';
import { X, BookOpen, Code2, Calculator, CheckCircle2, Copy, Check, Search, ShieldCheck } from 'lucide-react';
import { MATHEMATICAL_MODELS, MathModelDoc } from './modelRegistry';
import { MathView } from './MathView';

interface ModelInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  initialModelId?: string;
}

export const ModelInspector: React.FC<ModelInspectorProps> = ({
  isOpen,
  onClose,
  initialModelId = 'dbm-to-watt',
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialModelId);
  const [copiedFormula, setCopiedFormula] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const currentModel: MathModelDoc =
    MATHEMATICAL_MODELS.find((m) => m.id === selectedId) || MATHEMATICAL_MODELS[0];

  const filteredModels = MATHEMATICAL_MODELS.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.shortDescription.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyFormula = () => {
    navigator.clipboard.writeText(currentModel.formulaLatex);
    setCopiedFormula(true);
    setTimeout(() => setCopiedFormula(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-[#0c111d] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono tracking-wide text-white uppercase">
                  Mathematical & Algorithmic Inspector
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  KaTeX Verified
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Inspect actual mathematical formulas, variable semantics, and numerical audits directly from the backend.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Inspector (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar: Model Selector */}
          <div className="w-72 border-r border-slate-800 bg-slate-950/40 flex flex-col">
            <div className="p-3 border-b border-slate-800/80">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter algorithms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredModels.map((model) => {
                const isActive = model.id === currentModel.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedId(model.id);
                      setCopiedFormula(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1 border ${
                      isActive
                        ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200 shadow-sm'
                        : 'border-transparent hover:bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 uppercase">
                        {model.category}
                      </span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                    </div>
                    <div className="text-xs font-semibold font-mono text-slate-200 leading-tight">
                      {model.title}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {model.shortDescription}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main Panel: Formula, Variables, Worked Example, Implementation */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Title & Category Banner */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase font-semibold">
                  {currentModel.category}
                </span>
                <span className="text-xs text-slate-500 font-mono">•</span>
                <span className="text-xs text-slate-400 font-mono">Algorithm Spec #{currentModel.id}</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">{currentModel.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{currentModel.shortDescription}</p>
            </div>

            {/* Implementation Reference Box */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span>Backend Implementation:</span>
                <span className="text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/20">
                  {currentModel.implementationFile}
                </span>
              </div>
              <div className="text-slate-500 text-[11px]">
                <code>{currentModel.functionSignature}</code>
              </div>
            </div>

            {/* Mathematical Formula Card */}
            <div className="bg-[#080d19] border border-cyan-500/30 rounded-xl p-5 relative group shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-wider font-semibold">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Governing Mathematical Formulation</span>
                </div>
                <button
                  onClick={handleCopyFormula}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] font-mono text-slate-300 hover:text-white transition-colors"
                >
                  {copiedFormula ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied LaTeX</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>Copy LaTeX</span>
                    </>
                  )}
                </button>
              </div>

              {/* KaTeX Display */}
              <div className="overflow-x-auto py-3 text-center sm:text-left text-slate-100 font-serif">
                <MathView math={currentModel.formulaLatex} block={true} className="text-sm sm:text-base" />
              </div>
            </div>

            {/* Variables and Semantic Units */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
                <span>Variables, Parameters & Engineering Units</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  ({currentModel.variables.length} parameters defined)
                </span>
              </h4>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[11px]">
                      <th className="py-2.5 px-3">Symbol</th>
                      <th className="py-2.5 px-3">Parameter Name</th>
                      <th className="py-2.5 px-3">Engineering Unit</th>
                      <th className="py-2.5 px-3">Operational Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {currentModel.variables.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-900/30">
                        <td className="py-2.5 px-3 font-semibold text-cyan-300">
                          <MathView math={v.latex} />
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-200">{v.name}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-mono text-[11px]">
                          {v.unit}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-400 text-[11px] leading-relaxed">
                          {v.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Worked Numerical Example */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
                  <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Verified Numerical Example</span>
                </h4>
                <span className="text-[11px] font-mono text-slate-500">
                  Scenario: {currentModel.workedExample.scenario}
                </span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3">
                {/* Inputs badge */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-800 text-xs font-mono">
                  <span className="text-slate-400 font-semibold">Inputs:</span>
                  {Object.entries(currentModel.workedExample.inputs).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 text-[11px]"
                    >
                      <span className="text-slate-400">{k}:</span> {v}
                    </span>
                  ))}
                </div>

                {/* Step-by-step resolution */}
                <div className="space-y-3">
                  {currentModel.workedExample.steps.map((st, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-slate-200">
                          {st.stepTitle}
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                          {st.stepResult}
                        </span>
                      </div>
                      <div className="py-1 overflow-x-auto text-slate-100 font-serif">
                        <MathView math={st.stepFormula} block={false} />
                      </div>
                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {st.stepExplanation}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Final Result Callout */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/40 text-cyan-200 text-xs font-mono">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="font-semibold">Calculated Outcome:</span>
                  <span className="text-white">{currentModel.workedExample.finalResult}</span>
                </div>
              </div>
            </div>

            {/* Key Engineering Takeaway */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-mono font-bold text-cyan-300 uppercase">
                  Engineering Takeaway
                </h5>
                <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                  {currentModel.keyTakeaway}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>RANGUARD Mathematical Audit Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
