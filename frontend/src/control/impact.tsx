import React, { useMemo, useState } from 'react';
import { AlertTriangle, Network, MousePointerClick } from 'lucide-react';
import { Cell, ControllerCommand } from '../types';
import { cellHealth, CONTROLLER_META, ConflictInfo, describeCommand, HEALTH_COLOR, prettyCell, fmt } from './model';

/**
 * Impact Graph (PRD stage 02): links every controller command → the tower it targets → the KPIs it moves,
 * and shows where commands collide (same tower) or interact indirectly (neighbouring towers, opposite moves).
 */

type KpiKey = 'coverage' | 'energy' | 'interference';
type Effect = { kpi: KpiKey; dir: 'up' | 'down'; strong?: boolean };

const KPI_META: Record<KpiKey, { label: string; sub: string; goodDir: 'up' | 'down' }> = {
  coverage: { label: 'Coverage', sub: 'users with usable signal', goodDir: 'up' },
  energy: { label: 'Energy', sub: 'network power draw', goodDir: 'down' },
  interference: { label: 'Interference', sub: 'inter-cell noise', goodDir: 'down' },
};
const KPI_ORDER: KpiKey[] = ['coverage', 'energy', 'interference'];

const effectsOf = (c: ControllerCommand): Effect[] => {
  switch (c.action_type) {
    case 'POWER_UP':
    case 'WAKEUP':
      return [
        { kpi: 'coverage', dir: 'up' },
        { kpi: 'energy', dir: 'up' },
        { kpi: 'interference', dir: 'up' },
      ];
    case 'POWER_DOWN':
      return [
        { kpi: 'coverage', dir: 'down' },
        { kpi: 'energy', dir: 'down' },
        { kpi: 'interference', dir: 'down' },
      ];
    case 'SHUTDOWN':
    case 'SLEEP':
      return [
        { kpi: 'coverage', dir: 'down', strong: true },
        { kpi: 'energy', dir: 'down', strong: true },
        { kpi: 'interference', dir: 'down' },
      ];
    default:
      return [];
  }
};

type Focus = { kind: 'cmd' | 'cell' | 'kpi'; id: string } | null;

interface Edge {
  id: string;
  kind: 'cmd-cell' | 'cell-kpi' | 'coupling';
  d: string;
  color: string;
  cmdId?: string;
  cellId?: string;
  cellId2?: string;
  kpi?: KpiKey;
  conflict?: boolean;
  dir?: 'up' | 'down';
  strong?: boolean;
}

const W = 1040;
const H = 440;
const CMD = { x: 20, w: 236, h: 62 };
const KPI = { x: 868, w: 152, h: 66 };
const R = 31;

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};

export const ImpactGraph: React.FC<{
  commands: ControllerCommand[];
  cells: Record<string, Cell>;
  conflicts: ConflictInfo[];
  fork?: { label: string; changes: Array<{ cell_id: string; to_dbm: number; to_status: string }> } | null;
}> = ({ commands, cells, conflicts, fork }) => {
  const [focus, setFocus] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const active = pinned ?? focus;

  const model = useMemo(() => {
    const list = Object.values(cells).sort((a, b) => a.cell_id.localeCompare(b.cell_id));
    const xs = list.map((c) => c.x);
    const ys = list.map((c) => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pos: Record<string, { x: number; y: number }> = {};
    list.forEach((c) => {
      const nx = maxX === minX ? 0.5 : (c.x - minX) / (maxX - minX);
      const ny = maxY === minY ? 0.5 : (c.y - minY) / (maxY - minY);
      pos[c.cell_id] = { x: 440 + nx * 300, y: 118 + ny * 206 };
    });

    // commands: vertical column
    const n = commands.length;
    const gap = n > 1 ? Math.min(84, (H - 110) / (n - 1)) : 0;
    const startY = H / 2 - (gap * (n - 1)) / 2;
    const cmdPos: Record<string, { x: number; y: number }> = {};
    commands.forEach((c, i) => (cmdPos[c.command_id] = { x: CMD.x, y: startY + i * gap }));

    const kpiPos: Record<KpiKey, { x: number; y: number }> = {
      coverage: { x: KPI.x, y: 92 },
      energy: { x: KPI.x, y: 206 },
      interference: { x: KPI.x, y: 320 },
    };

    const directCells = new Set(conflicts.filter((c) => c.kind === 'DIRECT').flatMap((c) => c.cells));
    const indirectPairs = conflicts.filter((c) => c.kind === 'NEIGHBOR').map((c) => [...c.cells].sort().join('|'));

    const edges: Edge[] = [];

    // neighbour coupling (drawn first, beneath everything)
    const seen = new Set<string>();
    list.forEach((c) =>
      c.neighbors.forEach((nb) => {
        const key = [c.cell_id, nb].sort().join('|');
        if (seen.has(key) || !pos[nb]) return;
        seen.add(key);
        const a = pos[c.cell_id], b = pos[nb];
        edges.push({
          id: `cp-${key}`,
          kind: 'coupling',
          d: `M${a.x},${a.y} L${b.x},${b.y}`,
          color: indirectPairs.includes(key) ? '#f87171' : '#8d84a8',
          cellId: c.cell_id,
          cellId2: nb,
          conflict: indirectPairs.includes(key),
        });
      }),
    );

    // command → cell and cell → KPI
    const perCell: Record<string, string[]> = {};
    commands.forEach((c) => (perCell[c.target_cell] ||= []).push(c.command_id));
    commands.forEach((c) => {
      const cp = cmdPos[c.command_id];
      const tp = pos[c.target_cell];
      if (!tp) return;
      const siblings = perCell[c.target_cell];
      const idx = siblings.indexOf(c.command_id);
      const off = (idx - (siblings.length - 1) / 2) * 9;
      const color = CONTROLLER_META[c.controller_id].color;
      edges.push({
        id: `ec-${c.command_id}`,
        kind: 'cmd-cell',
        d: curve(cp.x + CMD.w, cp.y, tp.x - R, tp.y + off),
        color,
        cmdId: c.command_id,
        cellId: c.target_cell,
        conflict: directCells.has(c.target_cell),
      });
      effectsOf(c).forEach((e, k) => {
        const kp = kpiPos[e.kpi];
        edges.push({
          id: `ek-${c.command_id}-${e.kpi}`,
          kind: 'cell-kpi',
          d: curve(tp.x + R, tp.y + off, kp.x, kp.y - 12 + k * 12 + (siblings.indexOf(c.command_id) - 1) * 3),
          color,
          cmdId: c.command_id,
          cellId: c.target_cell,
          kpi: e.kpi,
          dir: e.dir,
          strong: e.strong,
        });
      });
    });

    // which KPIs are pulled both ways
    const kpiDirs: Record<KpiKey, Set<string>> = { coverage: new Set(), energy: new Set(), interference: new Set() };
    commands.forEach((c) => effectsOf(c).forEach((e) => kpiDirs[e.kpi].add(e.dir)));
    const kpiContested = (k: KpiKey) => kpiDirs[k].size > 1;

    return { list, pos, cmdPos, kpiPos, edges, directCells, kpiContested };
  }, [cells, commands, conflicts]);

  // what is highlighted for the current focus
  const lit = useMemo(() => {
    if (!active) return null;
    const nodes = new Set<string>();
    const edgeIds = new Set<string>();
    model.edges.forEach((e) => {
      let on = false;
      if (active.kind === 'cmd') on = e.cmdId === active.id;
      if (active.kind === 'cell') on = e.cellId === active.id || e.cellId2 === active.id;
      if (active.kind === 'kpi') on = e.kpi === active.id;
      if (!on) return;
      edgeIds.add(e.id);
      if (e.cmdId) nodes.add(`cmd:${e.cmdId}`);
      if (e.cellId) nodes.add(`cell:${e.cellId}`);
      if (e.cellId2) nodes.add(`cell:${e.cellId2}`);
      if (e.kpi) nodes.add(`kpi:${e.kpi}`);
    });
    nodes.add(`${active.kind}:${active.id}`);
    return { nodes, edgeIds };
  }, [active, model.edges]);

  const dimNode = (key: string) => (lit && !lit.nodes.has(key) ? 0.22 : 1);

  const forkCells = new Map((fork?.changes ?? []).map((c) => [c.cell_id, c]));

  /* ── plain-language explanation of the current focus ── */
  const explain = (): { title: string; body: React.ReactNode } => {
    if (!active) {
      const touched = new Set(commands.map((c) => c.target_cell));
      return {
        title: `${commands.length} command${commands.length === 1 ? '' : 's'} · ${touched.size} tower${touched.size === 1 ? '' : 's'} touched · ${conflicts.length} interaction${conflicts.length === 1 ? '' : 's'} found`,
        body: conflicts.length
          ? conflicts.map((c) => c.text).join('. ') + '.'
          : 'No two commands collide, but each one still changes network KPIs — that is why RANGUARD tests it before applying.',
      };
    }
    if (active.kind === 'cmd') {
      const c = commands.find((x) => x.command_id === active.id)!;
      const fx = effectsOf(c);
      return {
        title: `${CONTROLLER_META[c.controller_id].label} controller: ${describeCommand(c)}`,
        body: (
          <>
            {c.reason} Expected effect:{' '}
            {fx.map((e) => `${KPI_META[e.kpi].label} ${e.dir === 'up' ? '▲' : '▼'}${e.strong ? '▲' : ''}`).join(' · ') || 'none'}.
          </>
        ),
      };
    }
    if (active.kind === 'cell') {
      const cell = cells[active.id];
      const cmds = commands.filter((c) => c.target_cell === active.id);
      return {
        title: `${prettyCell(active.id)} · ${fmt(cell.tx_power_dbm, 1)} dBm · load ${Math.round(cell.current_load * 100)}%`,
        body: (
          <>
            {cmds.length === 0 && 'No controller is asking to change this tower. '}
            {cmds.length === 1 && `One command targets it (${CONTROLLER_META[cmds[0].controller_id].label}). `}
            {cmds.length > 1 && `${cmds.length} controllers target it at once — ${model.directCells.has(active.id) ? 'they pull the power in opposite directions, a direct collision.' : 'in the same direction.'} `}
            Radio neighbours: {cell.neighbors.map(prettyCell).join(', ')}.
          </>
        ),
      };
    }
    const k = active.id as KpiKey;
    const pushes = commands.flatMap((c) => effectsOf(c).filter((e) => e.kpi === k).map((e) => ({ c, e })));
    return {
      title: `${KPI_META[k].label} — ${KPI_META[k].sub}`,
      body: pushes.length
        ? pushes.map(({ c, e }) => `${CONTROLLER_META[c.controller_id].label} pushes it ${e.dir === 'up' ? 'up' : 'down'}${e.strong ? ' strongly' : ''}`).join('; ') +
          `. ${model.kpiContested(k) ? 'It is pulled both ways, so the net result is uncertain until simulated.' : ''}`
        : 'No command moves this KPI directly.',
    };
  };
  const detail = explain();

  const interactive = (kind: 'cmd' | 'cell' | 'kpi', id: string) => ({
    onMouseEnter: () => setFocus({ kind, id }),
    onMouseLeave: () => setFocus(null),
    onFocus: () => setFocus({ kind, id }),
    onBlur: () => setFocus(null),
    onClick: () => setPinned((p) => (p && p.kind === kind && p.id === id ? null : { kind, id })),
    tabIndex: 0,
    style: { cursor: 'pointer', outline: 'none' } as React.CSSProperties,
    role: 'button',
  });

  return (
    <section className="cr-panel overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-400/15 border border-sky-300/30 text-sky-300 grid place-items-center">
            <Network className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-slate-100">Impact graph</h2>
            <p className="text-[13.5px] text-slate-300 mt-0.5">Who is asking → which tower → what it changes. Red marks where commands collide.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-slate-200">{commands.length} commands</span>
          <span className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${conflicts.length ? 'bg-rose-500/10 border-rose-400/35 text-rose-200' : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200'}`}>
            {conflicts.length ? <AlertTriangle className="w-3.5 h-3.5" /> : null}
            {conflicts.length ? `${conflicts.length} collision${conflicts.length > 1 ? 's' : ''}` : 'no collisions'}
          </span>
          {pinned && (
            <button onClick={() => setPinned(null)} className="px-2.5 py-1 rounded-md bg-sky-400 text-slate-900 font-semibold">
              Clear selection
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px] h-auto select-none" role="group" aria-label="Impact graph">
            <defs>
              <filter id="ig-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <marker id="ig-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>

            {/* column headings */}
            {[
              { x: CMD.x, t: 'COMMANDS', s: 'who is asking' },
              { x: 440, t: 'TOWERS', s: 'where it lands (dashed = radio neighbours)' },
              { x: KPI.x, t: 'KPIs', s: 'what it changes' },
            ].map((h) => (
              <g key={h.t}>
                <text x={h.x} y="22" fill="#d3cbe4" fontSize="13" fontWeight="700" letterSpacing="1.2">{h.t}</text>
                <text x={h.x} y="40" fill="#968db0" fontSize="12">{h.s}</text>
              </g>
            ))}

            {/* edges */}
            <g fill="none">
              {model.edges
                .filter((e) => e.kind === 'coupling')
                .map((e) => {
                  const on = lit ? lit.edgeIds.has(e.id) : true;
                  return (
                    <path key={e.id} d={e.d} stroke={e.color} strokeWidth={e.conflict ? 3.2 : 1.4} strokeDasharray={e.conflict ? '7 5' : '4 6'} opacity={on ? (e.conflict ? 0.95 : lit ? 0.9 : 0.35) : 0.07} className={e.conflict ? 'ig-dash' : ''} />
                  );
                })}
              {model.edges
                .filter((e) => e.kind !== 'coupling')
                .map((e) => {
                  const on = lit ? lit.edgeIds.has(e.id) : true;
                  const base = e.kind === 'cmd-cell' ? 2.8 : 1.8;
                  return (
                    <path
                      key={e.id}
                      d={e.d}
                      stroke={e.conflict && e.kind === 'cmd-cell' ? '#f87171' : e.color}
                      strokeWidth={on && lit ? base + 1.2 : base + (e.strong ? 1 : 0)}
                      opacity={on ? (lit ? 1 : e.kind === 'cmd-cell' ? 0.9 : 0.55) : 0.07}
                      markerEnd={e.kind === 'cmd-cell' || (lit && on) ? 'url(#ig-arrow)' : undefined}
                      strokeLinecap="round"
                      style={{ transition: 'opacity .25s, stroke-width .25s' }}
                    />
                  );
                })}
            </g>

            {/* indirect conflict labels */}
            {conflicts
              .filter((c) => c.kind === 'NEIGHBOR')
              .map((c, i) => {
                const a = model.pos[c.cells[0]], b = model.pos[c.cells[1]];
                if (!a || !b) return null;
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                return (
                  <g key={i} opacity={lit ? 0.25 : 1}>
                    <rect x={mx - 52} y={my - 11} width="104" height="22" rx="6" fill="#2b1620" stroke="#f87171" strokeOpacity="0.7" />
                    <text x={mx} y={my + 4} textAnchor="middle" fill="#fecaca" fontSize="11.5" fontWeight="600">indirect clash</text>
                  </g>
                );
              })}

            {/* command nodes */}
            {commands.map((c) => {
              const p = model.cmdPos[c.command_id];
              const meta = CONTROLLER_META[c.controller_id];
              const clash = model.directCells.has(c.target_cell);
              const isFocus = active?.kind === 'cmd' && active.id === c.command_id;
              return (
                <g key={c.command_id} transform={`translate(${p.x},${p.y - CMD.h / 2})`} opacity={dimNode(`cmd:${c.command_id}`)} className="ig-node" {...interactive('cmd', c.command_id)}>
                  <rect width={CMD.w} height={CMD.h} rx="12" fill="#221d3c" stroke={isFocus ? '#ff9a3d' : clash ? '#f87171' : 'rgba(255,255,255,0.16)'} strokeWidth={isFocus ? 2 : 1.2} />
                  <rect width="6" height={CMD.h} rx="3" fill={meta.color} />
                  <text x="20" y="22" fill={meta.color} fontSize="12.5" fontWeight="700">{meta.label} controller</text>
                  <text x="20" y="42" fill="#f3eefc" fontSize="14.5" fontWeight="600">{describeCommand(c).replace(/ to (\d+\.\d) dBm/, ' → $1 dBm')}</text>
                  <text x={CMD.w - 12} y="22" textAnchor="end" fill="#b3aac9" fontSize="12" fontFamily="JetBrains Mono, monospace">
                    {c.action_type === 'SHUTDOWN' ? 'OFF' : `${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta).toFixed(1)} dB`}
                  </text>
                  {clash && <text x={CMD.w - 12} y="54" textAnchor="end" fill="#fca5a5" fontSize="11.5" fontWeight="600">⚠ collides</text>}
                </g>
              );
            })}

            {/* tower nodes */}
            {model.list.map((c) => {
              const p = model.pos[c.cell_id];
              const touched = commands.some((x) => x.target_cell === c.cell_id);
              const collide = model.directCells.has(c.cell_id);
              const health = cellHealth(c, touched);
              const col = collide ? '#f87171' : touched ? '#f5b942' : HEALTH_COLOR[health];
              const fk = forkCells.get(c.cell_id);
              const isFocus = active?.kind === 'cell' && active.id === c.cell_id;
              return (
                <g key={c.cell_id} transform={`translate(${p.x},${p.y})`} opacity={dimNode(`cell:${c.cell_id}`)} className="ig-node" {...interactive('cell', c.cell_id)}>
                  {collide && <circle r={R + 10} fill="#f87171" opacity="0.28" filter="url(#ig-glow)" className="ig-pulse" />}
                  {fk && <circle r={R + 8} fill="none" stroke="#ff9a3d" strokeWidth="2.4" strokeDasharray="5 4" className="ig-dash" />}
                  <circle r={R} fill="#1d1836" stroke={isFocus ? '#ff9a3d' : col} strokeWidth={isFocus ? 4 : touched ? 3.4 : 2.2} />
                  <circle r={R - 8} fill={col} opacity={touched ? 0.9 : 0.5} />
                  <text y="5" textAnchor="middle" fill="#14101f" fontSize="14" fontWeight="800">{c.cell_id.replace('CELL_0', 'C')}</text>
                  <text y={R + 18} textAnchor="middle" fill="#d3cbe4" fontSize="12.5" fontFamily="JetBrains Mono, monospace">
                    {c.status === 'ACTIVE' ? `${fmt(c.tx_power_dbm, 1)} dBm` : 'OFF'}
                  </text>
                  {fk && (
                    <g transform={`translate(0,${-R - 16})`}>
                      <rect x="-48" y="-11" width="96" height="21" rx="6" fill="#3a2410" stroke="#ff9a3d" strokeOpacity="0.8" />
                      <text y="4" textAnchor="middle" fill="#ffd9b0" fontSize="11.5" fontWeight="700">
                        {fork!.label}: {fk.to_status === 'SHUTDOWN' ? 'OFF' : `${fmt(fk.to_dbm, 1)}`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* KPI nodes */}
            {KPI_ORDER.map((k) => {
              const p = model.kpiPos[k];
              const meta = KPI_META[k];
              const contested = model.kpiContested(k);
              const pushes = commands.flatMap((c) => effectsOf(c).filter((e) => e.kpi === k).map((e) => ({ c, e })));
              const isFocus = active?.kind === 'kpi' && active.id === k;
              return (
                <g key={k} transform={`translate(${p.x},${p.y - KPI.h / 2})`} opacity={dimNode(`kpi:${k}`)} className="ig-node" {...interactive('kpi', k)}>
                  <rect width={KPI.w} height={KPI.h} rx="12" fill="#221d3c" stroke={isFocus ? '#ff9a3d' : contested ? '#f5b942' : 'rgba(255,255,255,0.16)'} strokeWidth={isFocus ? 2 : 1.2} strokeDasharray={contested && !isFocus ? '5 4' : undefined} />
                  <text x="14" y="25" fill="#f3eefc" fontSize="14.5" fontWeight="700">{meta.label}</text>
                  <text x="14" y="42" fill="#968db0" fontSize="11.5">{meta.sub}</text>
                  <g transform="translate(14,53)">
                    {pushes.length === 0 && <text fill="#6f6788" fontSize="11.5">unchanged</text>}
                    {pushes.map(({ c, e }, i) => {
                      const good = e.dir === meta.goodDir;
                      return (
                        <g key={i} transform={`translate(${i * 21},0)`}>
                          <circle cx="0" cy="-3" r="7.5" fill={CONTROLLER_META[c.controller_id].color} opacity="0.22" />
                          <text x="0" y="1" textAnchor="middle" fill={good ? '#4ade80' : '#f87171'} fontSize="11" fontWeight="800">{e.dir === 'up' ? '▲' : '▼'}</text>
                        </g>
                      );
                    })}
                  </g>
                  {contested && (
                    <g transform={`translate(${KPI.w - 12},57)`}>
                      <text textAnchor="end" fill="#f5b942" fontSize="11.5" fontWeight="700">⇅ mixed</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* explanation + legend */}
        <div className="mt-3 grid lg:grid-cols-[1fr_auto] gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[12.5px] text-slate-400 mb-1">
              <MousePointerClick className="w-3.5 h-3.5" />
              {active ? (pinned ? 'Selected — click again to release' : 'Hovering') : 'Hover or click any node to trace its connections'}
            </div>
            <div className="text-[14.5px] font-semibold text-slate-100 leading-snug">{detail.title}</div>
            <div className="text-[13.5px] text-slate-300 leading-snug mt-1">{detail.body}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[12.5px] text-slate-300 grid grid-cols-2 gap-x-5 gap-y-1.5 content-center">
            {Object.values(CONTROLLER_META).map((m) => (
              <span key={m.label} className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full" style={{ background: m.color }} />
                {m.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-rose-400 bg-rose-400/30" />Direct collision</span>
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-rose-400" />Indirect clash</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-400 font-bold">▲▼</span>Good effect</span>
            <span className="flex items-center gap-1.5"><span className="text-rose-400 font-bold">▲▼</span>Harmful effect</span>
          </div>
        </div>
      </div>
    </section>
  );
};
