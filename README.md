# RANGUARD — Autonomous Mobile Network Conflict-Resolution Referee
### Team: Arigato Algorithms | Problem Statement: SW-31

> **Autonomous conflict referee operating between multi-objective mobile network controllers and physical radio access infrastructure.**
> *"Do not choose a winning controller. Find the smallest safe change that benefits the entire network."*

---

## 1. Executive Summary

Modern Open RAN and 5G/6G mobile networks employ autonomous network controllers (rApps / xApps) to continuously optimize operational objectives:
1. **Energy Controller**: Drives down operational energy by trimming power or proposing cell sleep/shutdown.
2. **Coverage Controller**: Expands transmission power to eliminate dead zones and rescue fringe users.
3. **Interference Controller**: Trims neighbor cell power to protect boundary user SINR and suppress co-channel interference.

When these controllers run independently, **catastrophic conflicts arise**:
- **Direct Conflicts**: Opposite power commands targeting the identical cell (e.g., Energy requests 25 dBm while Coverage requests 42 dBm).
- **Indirect Conflicts**: Opposing actions on adjacent cells that trigger handoff ping-pong and fringe coverage degradation.
- **Catastrophic Unsafe Shutdowns**: Energy controllers attempting to power down a cell whose neighbors cannot absorb the user coverage demand.

**RANGUARD** intercepts all incoming controller proposals, builds a NetworkX impact graph, predicts system-wide outcomes on isolated shadow simulation clones, enforces hard safety guardrails, applies stability cooldown/hysteresis, and commits only validated, multi-objective coordinated actions.

---

## 2. Architecture & Decision Pipeline

The referee executes an 8-stage transactional pipeline:

```
[CONTROLLER PROPOSALS] (Energy, Coverage, Interference)
          │
          ▼
   1. INTERCEPT  ──> Intercepts commands without mutating active network
          │
          ▼
   2. DETECT     ──> Constructs NetworkX impact graph; flags direct & indirect collisions
          │
          ▼
   3. PREDICT    ──> Synthesizes candidate actions: original, status quo, coordinated compromise
          │
          ▼
   4. SIMULATE   ──> Clones active network; executes shadow simulation on deep-copied states
          │
          ▼
   5. VALIDATE   ──> Evaluates Hard Safety Guardrails (Coverage ≥ 95%, RSRP, SINR, Tx limits)
          │
          ▼
   6. ARBITRATE  ──> Normalized multi-objective optimization (0.30 Energy, 0.25 Interf, 0.25 Cov, 0.20 Min Change)
          │
          ▼
   7. STABILITY  ──> Dampens ping-pong thrashing via 3-cycle Cooldown & 1.0 dBm Hysteresis
          │
          ▼
   8. COMMIT     ──> Validates state version (v), applies atomic commit, recalculates actual live KPIs
```

### The Four Arbitration Verdicts:
- **`APPROVE`**: Proposal is non-conflicting, safe, and improves network utility without side effects.
- **`MODIFY`**: Proposal is conflicting or unsafe; replaced with a safe, coordinated compromise (e.g., partial power reduction instead of unsafe full shutdown).
- **`DELAY`**: Proposal postponed due to cooldown window or micro-hysteresis threshold.
- **`REJECT`**: Proposal violates hard constraints with no feasible safe alternative.

---

## 3. Technology Stack

- **Backend**: Python 3.11+ / 3.14, FastAPI, Uvicorn, NumPy, NetworkX, Pandas, Pydantic v2, Pytest, HTTPX
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts, Axios, Lucide React
- **Storage**: In-memory state manager with transactional versioning and decision audit log.

---

## 4. Quick Start & Run Instructions (MacBook / Local)

### Prerequisites:
- Python 3.11+ (or 3.14)
- Node.js v18+ and npm

### Terminal 1: Backend Server
```bash
cd /Users/pohorrid/Desktop/ranguard

# Activate virtual environment
source .venv/bin/activate

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Start FastAPI server on port 8000
PYTHONPATH=backend uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend runs at: `http://127.0.0.1:8000` | API Docs: `http://127.0.0.1:8000/docs`*

### Terminal 2: Frontend Dashboard
```bash
cd /Users/pohorrid/Desktop/ranguard/frontend

# Install dependencies (if not already installed)
npm install

# Start Vite dev server on port 5173
npm run dev
```
*Frontend opens at: `http://localhost:5173`*

---

## 5. Verification & Automated Test Suite

Run the full Pytest test suite (21 unit and integration tests):
```bash
source .venv/bin/activate
PYTHONPATH=backend pytest backend/tests/ -v
```
All 21 tests pass in under 1 second, verifying:
- Deterministic 6-cell layout & 100-user distribution
- 3GPP propagation path-loss & linear SINR calculations
- Energy model & normalized interference index
- Independent controller proposal generation (zero mutation of active network)
- Direct & indirect conflict detection via NetworkX
- Shadow simulation deep-copy isolation
- Hard safety constraints enforcement (unsafe shutdown blocked)
- Arbitration verdicts (`APPROVE`, `MODIFY`, `DELAY`, `REJECT`)
- Cooldown, hysteresis, and reversal suppression
- Transactional commit engine & stale state version rejection
- Scenarios: Traffic Spike, Cell Shutdown, Ping-Pong
- Comparative 3-Policy benchmark execution

---

## 6. Mandatory Scenarios Walkthrough

### Scenario 1: Traffic Spike
- **Situation**: User traffic surge causes localized congestion and deteriorating SINR.
- **Controllers**: Coverage controller proposes boosting power; Interference controller proposes power reduction on adjacent neighbor; Energy controller proposes offset trimming.
- **RANGUARD Resolution**: Resolves competing proposals via coordinated multi-cell action that preserves coverage without runaway power escalation.

### Scenario 2: Cell Shutdown (Primary Hackathon Demo)
- **Situation**: Energy Controller attempts to shut down `CELL_03` to eliminate its power draw.
- **Shadow Simulation**: Evaluates Candidate A (Full Shutdown), Candidate B (Partial Power Reduction), and Candidate C (Status Quo).
- **Safety Engine**: Predicts that full shutdown causes network coverage to collapse below the mandatory 95.0% threshold (down to ~88.0%). Full shutdown is **BLOCKED**.
- **Verdict**: **`MODIFY`**. RANGUARD selects Candidate B: a partial power reduction to 34.0 dBm that preserves coverage ≥ 95% while achieving measurable energy savings.

### Scenario 3: Ping-Pong Control
- **Situation**: Energy and Coverage controllers repeatedly propose alternating power changes on `CELL_03`.
- **RANGUARD Resolution**: Detects reversal pattern, activates 3-cycle cooldown and hysteresis, suppressing rapid oscillations and reducing reversals by over 50% compared to raw baseline.

---

## 7. Comparative Benchmark (Measured Policy Comparison)

Under identical deterministic seeds (seed=42) and identical traffic conditions across 4 cycles:

| Metric | Policy A: No Referee | Policy B: Fixed Priority | Policy C: RANGUARD |
| :--- | :---: | :---: | :---: |
| **Final Coverage** | 88.0% *(Breached)* | 91.0% *(Breached)* | **96.0% (Safe ≥ 95%)** |
| **Safety Violations** | 2 | 1 | **0 (Zero Violations)** |
| **Control Reversals** | 4 *(Thrashing)* | 3 | **1 (Suppressed by Cooldown)** |
| **Total Energy** | 65.8 u | 82.5 u | **72.1 u (Balanced)** |
| **Arbitration Latency** | 0.0 ms | ~0.1 ms | **1.8 ms (< 100 ms target)** |

---

## 8. REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend service health check |
| `POST` | `/api/simulation/reset` | Resets simulation to deterministic state (seed=42) |
| `POST` | `/api/simulation/step` | Advances simulation by one control cycle |
| `GET` | `/api/network/state` | Returns 6 cells, 100 users, loads, and connections |
| `GET` | `/api/network/metrics` | Returns current KPIs (Coverage, SINR, Energy, Interference) |
| `GET` | `/api/controllers/commands` | Returns proposals from all 3 controllers for current cycle |
| `POST` | `/api/referee/evaluate` | Runs shadow simulation and returns verdict without mutating state |
| `POST` | `/api/referee/commit` | Verifies state version and commits validated action |
| `GET` | `/api/referee/history` | Returns arbitration decision audit trail |
| `POST` | `/api/scenarios/run` | Executes predefined scenario (`CELL_SHUTDOWN`, `TRAFFIC_SPIKE`, `PING_PONG`) |
| `POST` | `/api/comparison/run` | Executes 3-policy comparative benchmark |

---

## 9. Known Limitations & Future Improvements

- **Fading Channels**: The current MVP utilizes deterministic 3GPP Macro Urban path loss. Future iterations could add Rayleigh/Rician fast-fading and shadow fading maps.
- **Scalability**: The prototype operates with 6 cells and 100 users. The NetworkX impact graph and vectorized NumPy engine can scale to 100+ cells using hierarchical sector clustering.
- **O-RAN Integration**: Can be packaged as an O-RAN Non-Real-Time RIC rApp or Near-Real-Time RIC xApp communicating over E2 and O1 interfaces.

---
**Team Arigato Algorithms** | Hackathon SW-31
