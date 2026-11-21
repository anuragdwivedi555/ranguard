# RANGUARD — Visual Documentation & Screenshot Index

This directory provides visual documentation, user interface captures, and visual walkthrough references for the **RANGUARD** Autonomous Mobile Network Conflict-Resolution Referee.

---

## 1. Visual Walkthrough & Interface Overview

RANGUARD features a unified, responsive frontend experience providing two presentation modalities:
1. **Cinematic 3D Narrative Experience** (Act 1: Explore & Technical Storytelling)
2. **Interactive Simulation Lab** (Act 2 & 3: Real-Time Actuation, Mathematical Audit, and 3-Policy Benchmarking)

---

## 2. Interface Artifacts & Recommended Screenshots

To capture screenshots from the running live application, follow the startup guide in the root [README.md](../../README.md) and navigate to `http://localhost:5173`.

### Screenshot Reference 1: Cinematic 3D Network Overview (`cinematic_overview_3d.png`)
- **Location:** View Mode: Cinematic &bull; Scene 01 / 07
- **Description:** Perspective 3D rendering of the 6-macro-cell hexagonal network topology, 100 user device pucks with live SINR color indicators, and animated directional signal beams.
- **Key Visual Elements:**
  - Macro tower 3D lattice masts with blinking status beacons
  - Ground range rings and translucent coverage basins
  - Live telemetry bar showing 6 macro sites, 100 UEs, and 3GPP TR 36.814 propagation model
  - Top navigation bar with Phase 3A badge, Math Inspector, and "ENTER SIMULATION LAB" button

### Screenshot Reference 2: Direct Actuation Collision (`cinematic_conflict_scene.png`)
- **Location:** View Mode: Cinematic &bull; Scene 03 / 07
- **Description:** Visual representation of contradictory controller proposals on `CELL_02`.
- **Key Visual Elements:**
  - Contested cell highlighted with red flashing beacon and red perimeter ring
  - Proposal collision breakdown: Coverage (+3 dBm) vs Energy (-4 dBm) vs Interference (-3 dBm)
  - Failure mode narrative explaining how uncoordinated execution triggers amplifier thrashing and coverage dead zones

### Screenshot Reference 3: Predictive ML Intelligence (`cinematic_predictive_ml.png`)
- **Location:** View Mode: Cinematic &bull; Scene 06 / 07
- **Description:** Diurnal traffic demand forecasting powered by the trained XGBoost model.
- **Key Visual Elements:**
  - Live ML toggle button (ON / OFF)
  - Forecasting model specifications: 11 lag features, Milan CDR activity index units (NOT Mbps)
  - Surge detection criteria: $\ge +8\%$ and $\Delta \ge +0.3$ units
  - Live advisory telemetry: observed activity index vs 10-minute-forward forecast
  - Link to inspect the XGBoost mathematical equations and feature pipeline

### Screenshot Reference 4: Interactive Simulation Lab (`simulation_lab_overview.png`)
- **Location:** View Mode: Lab (`http://localhost:5173`)
- **Description:** Full-featured operational dashboard for real-time conflict injection and multi-agent arbitration.
- **Key Visual Elements:**
  - Live KPI cards: Coverage %, Total Energy (W), Average SINR (dB), Interference Index
  - Prominent Arbitration Verdict Banner showing verdict (`APPROVE`, `MODIFY`, `DELAY`, `REJECT`), execution latency ($< 20\text{ ms}$), and state version
  - 3D Interactive / 2D Schematic topology switcher
  - Autonomous controller proposal cards (Energy, Coverage, Interference)
  - NetworkX conflict detection impact graph
  - Virtual digital twin shadow simulation candidate comparison table
  - One-click demonstration scenario triggers (`CELL_SHUTDOWN`, `TRAFFIC_SPIKE`, `PING_PONG`)

### Screenshot Reference 5: Mathematical & Algorithmic Inspector (`model_inspector_math.png`)
- **Location:** Accessible via "Math Inspector" button in both Cinematic and Lab views
- **Description:** Full modal dialog displaying verified LaTeX formulas, physical variable semantics, worked numerical examples, and code implementation references.
- **Key Visual Elements:**
  - Filterable algorithm selector covering all 8 mathematical modules:
    - `dbm-to-watt`: Logarithmic to linear RF power conversion
    - `sinr-propagation`: 3GPP TR 36.814 path loss & receiver SINR
    - `coverage-guardrails`: Hard deterministic safety guardrails
    - `electrical-power`: Base station amplifier & baseband power model
    - `shadow-simulation`: Virtual digital twin candidate projection & Pareto objective function
    - `interference-matrix`: Inter-cell radiated interference coupling
    - `stability-hysteresis`: Cooldown window, hysteresis, and emergency override
    - `xgboost-forecasting`: Milan 10-min CDR activity index forecasting & surge penalty
  - Step-by-step worked numerical calculation with exact units
  - Copy LaTeX button and link to source implementation file

### Screenshot Reference 6: 3-Policy Comparative Benchmark (`benchmark_comparison_table.png`)
- **Location:** Scene 07 of Cinematic Experience & Baseline Comparison in Simulation Lab
- **Description:** Measured benchmark results evaluating 48 simulation runs across No Referee, Fixed Priority, and RANGUARD.
- **Key Visual Elements:**
  - Clear side-by-side comparison of Coverage SLA, Safety Violations, Total Power, and Control Reversals
  - Verification that RANGUARD achieves **0.00 control reversals** (vs 260.83 in No Referee and 96.58 in Fixed Priority) and **0 safety violations**.
