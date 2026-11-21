# RANGUARD — Autonomous Conflict Referee for Mobile Networks

RANGUARD is an intelligent conflict-resolution referee platform for autonomous cellular network controllers.

- **Phase 1**: Backend Foundation and 2D Cellular Network Simulator (FastAPI, NumPy, NetworkX, Pydantic).
- **Phase 2**: Autonomous Network Controllers (Energy, Coverage, Interference) & Controller Manager.

---

## 1. Architecture & Repository Structure

```text
ranguard/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI application & mounted routers
│   │   ├── config.py                   # Centralized simulation configuration
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── cell.py                 # Cell model & operational status
│   │   │   ├── user.py                 # Mobile subscriber model
│   │   │   ├── network.py              # NetworkState, KPIs, and request schemas
│   │   │   └── command.py              # ControllerCommand & ControllerInfo schemas
│   │   ├── simulation/
│   │   │   ├── __init__.py
│   │   │   ├── network.py              # NetworkSimulator engine with cloning
│   │   │   ├── propagation.py          # Log-distance path loss & SINR calculations
│   │   │   └── metrics.py              # Network KPIs & energy modeling
│   │   ├── controllers/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                 # BaseController abstract class
│   │   │   ├── energy.py               # Energy Controller (underutilization optimizer)
│   │   │   ├── coverage.py             # Coverage Controller (coverage deficit optimizer)
│   │   │   ├── interference.py         # Interference Controller (co-channel SINR optimizer)
│   │   │   └── manager.py              # ControllerManager orchestrator
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── network.py              # Network simulation REST endpoints
│   │   │   └── controllers.py          # Autonomous controller REST endpoints
│   │   └── services/
│   │       ├── __init__.py
│   │       └── state_manager.py        # Thread-safe in-memory state manager
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_network.py             # 12 simulation, state version & cloning tests
│   │   ├── test_propagation.py         # 7 RF propagation & SINR calculation tests
│   │   ├── test_metrics.py             # 5 coverage, energy normalization & KPI tests
│   │   ├── test_api.py                 # 10 network HTTP API & error handling tests
│   │   └── test_controllers.py         # 13 autonomous controller & conflict tests
│   └── requirements.txt
├── docs/
│   └── Ranguard.pdf                    # Product Requirements Document
├── .gitignore
└── README.md
```

---

## 2. Autonomous Network Controllers (Phase 2)

Phase 2 introduces three independent autonomous controllers that inspect the identical network state snapshot and formulate transmission power adjustments without mutating active network state.

### 2.1 Energy Controller
- **Objective**: Minimize network energy consumption by identifying lightly-loaded base stations.
- **Priority**: 1 (Economic / efficiency tier).
- **Policy**:
  1. Inspects connected user counts and aggregated traffic demand per active cell.
  2. Compares cell loads against the network mean load.
  3. Proposes reducing transmission power by 5 dBm (or 10 dBm for severely underutilized cells < 10 users).
  4. Respects `min_power_dbm` bounds and skips inactive cells.

### 2.2 Coverage Controller
- **Objective**: Maintain network-wide coverage at or above 95.0% and mitigate coverage holes.
- **Priority**: 2 (Safety / operational tier).
- **Policy**:
  1. Triggers whenever coverage falls below 95.0% or subscribers have weak signals ($P_{rx} < -88\text{ dBm}$).
  2. Identifies underserved subscriber devices.
  3. Scores active candidate cells based on proximity and potential coverage expansion.
  4. Proposes increasing transmission power by 5 dBm on the most strategic candidate cell (clamped to `max_power_dbm`).
  5. Avoids unnecessary commands when coverage is healthy.

### 2.3 Interference Controller
- **Objective**: Mitigate inter-cell co-channel interference and optimize user SINR distribution.
- **Priority**: 2 (Safety / operational tier).
- **Policy**:
  1. Analyzes subscribers experiencing low SINR ($SINR < 6.0\text{ dB}$).
  2. For each victim user, calculates received interference power across all active neighboring cells using the log-distance propagation model.
  3. Identifies the dominant interfering cell across the victim population.
  4. Proposes reducing the dominant interferer's transmission power by 5 dBm (clamped to `min_power_dbm`).

### 2.4 Controller Manager
- Coordinates execution across all registered controllers.
- Ensures command generation is strictly **side-effect free** (does not alter `state_version`).
- Preserves all proposals without deduplication or priority filtering, enabling downstream conflict detection and arbitration in Phase 3.

---

## 3. REST API Endpoints

Interactive documentation: `http://localhost:8000/docs`.

### Simulation & Network Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend service health, simulation ID, and state version |
| `GET` | `/api/network/state` | Full network snapshot (cells, users, metrics, history) |
| `GET` | `/api/network/metrics` | Current network KPIs (coverage, energy, SINR, interference) |
| `POST` | `/api/simulation/reset` | Deterministic network reset with optional seed |
| `PATCH` | `/api/network/cells/{cell_id}/power` | Adjust transmission power (0 to 46 dBm) |
| `PATCH` | `/api/network/cells/{cell_id}/status` | Activate (`ACTIVE`) or deactivate (`INACTIVE`) cell |

### Autonomous Controller Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/controllers/status` | List registered controllers, objectives, and trigger conditions |
| `GET` | `/api/controllers/commands` | Generate and return current proposed commands from all controllers |

---

## 4. Empirical Controller Proposals (Seed 42 Baseline)

Executing `GET /api/controllers/commands` on the baseline network state produces 3 simultaneous proposals:

```json
{
  "simulation_cycle": 0,
  "state_version": 1,
  "total_commands": 3,
  "commands": [
    {
      "command_id": "CMD_ENE_000_01",
      "controller": "ENERGY",
      "cell_id": "CELL_06",
      "action": "SET_TX_POWER",
      "current_power_dbm": 35.0,
      "target_power_dbm": 25.0,
      "reason": "Low cell utilization: 8 users connected (total demand: 10.25) vs average 15.5. Opportunity for power conservation.",
      "priority": 1,
      "simulation_cycle": 0
    },
    {
      "command_id": "CMD_COV_000_01",
      "controller": "COVERAGE",
      "cell_id": "CELL_01",
      "action": "SET_TX_POWER",
      "current_power_dbm": 35.0,
      "target_power_dbm": 40.0,
      "reason": "Coverage degradation detected: current coverage 93.0% (target: 95.0%), 7 uncovered users. Boosting power on nearest cell CELL_01 to expand coverage footprint.",
      "priority": 2,
      "simulation_cycle": 0
    },
    {
      "command_id": "CMD_INT_000_01",
      "controller": "INTERFERENCE",
      "cell_id": "CELL_05",
      "action": "SET_TX_POWER",
      "current_power_dbm": 35.0,
      "target_power_dbm": 30.0,
      "reason": "High inter-cell interference: cell is dominant interferer for 43 subscribers with SINR < 6.0 dB. Reducing transmission power to mitigate adjacent cell interference.",
      "priority": 2,
      "simulation_cycle": 0
    }
  ]
}
```

### Conflict Dynamics
- **Direct Conflicts**: In the baseline state, each controller selects a different target cell based on its distinct objective function. In states where multiple controllers target the same cell (e.g., test scenario where `CELL_03` has underutilized traffic while nearby subscribers are uncovered), `ENERGY` proposes a power reduction while `COVERAGE` proposes a power increase. Both contradictory commands are preserved simultaneously without deduplication.
- **Indirect Interactions**: In the baseline, `CELL_06` (targeted by `ENERGY`) and `CELL_05` (targeted by `INTERFERENCE`) share an edge in the cell topology graph (`distance = 29.15 <= 55.0`). Simultaneous power reductions on adjacent cells interactively affect coverage and SINR in the southern sector.

---

## 5. Automated Tests

```bash
python -m pytest backend/tests -v
```

All **47 tests** pass (34 Phase 1 tests + 13 Phase 2 controller tests).
