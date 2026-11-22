"""Feature extraction for candidate action surrogate.

Extracts features strictly available BEFORE candidate simulation:
1. Baseline cell and network telemetry.
2. Target cell state, load, and neighbor topology.
3. Proposed joint action parameters and power deltas.
"""

from __future__ import annotations

from typing import Any, Dict, List
import numpy as np
import pandas as pd

from ...simulation.network_engine import NetworkEngine
from ...models.cell import Cell
from ...models.metrics import NetworkMetrics


FEATURE_COLUMNS = [
    "base_coverage_pct",
    "base_interference",
    "base_total_energy",
    "base_avg_sinr",
    "base_min_sinr",
    "base_active_cells",
    "base_cell_utilization",
    "target_cell_idx",
    "target_cell_curr_pwr",
    "target_cell_proposed_pwr",
    "target_cell_power_delta",
    "target_cell_is_shutdown",
    "target_cell_curr_load",
    "target_cell_curr_interference",
    "target_cell_connected_users",
    "target_cell_neighbor_count",
    "target_cell_neighbor_mean_pwr",
    "action_num_cells_modified",
    "action_total_delta_db",
    "traffic_demand_multiplier",
]


def cell_id_to_idx(cid: str) -> int:
    """Map 'CELL_01'..'CELL_06' to 1..6; ALL/None to 0."""
    if not cid or cid == "ALL":
        return 0
    try:
        return int(cid.split("_")[-1])
    except Exception:
        return 0


def extract_candidate_features(
    live_network: NetworkEngine,
    candidate_def: Dict[str, Any],
) -> Dict[str, float]:
    """
    Extracts the complete 20-dimensional pre-action feature vector.
    Guarantees zero mutation to live_network and zero lookahead leakage.
    """
    base_m: NetworkMetrics = live_network.metrics
    cells: Dict[str, Cell] = live_network.cells
    users = live_network.users

    target_cell_id = candidate_def.get("target_cell", "ALL")
    target_idx = cell_id_to_idx(target_cell_id)

    joint_actions = candidate_def.get("joint_actions", {})
    proposed_power = candidate_def.get("proposed_power", 0.0)
    proposed_status = candidate_def.get("proposed_status", "ACTIVE")

    # If target cell exists in network
    if target_cell_id in cells:
        t_cell = cells[target_cell_id]
        curr_pwr = float(t_cell.tx_power_dbm)
        curr_load = float(t_cell.current_load)
        curr_interference = float(t_cell.total_interference_caused)
        conn_users = int(t_cell.connected_users_count)
        neighbor_count = len(t_cell.neighbors)

        # Neighbor mean power
        n_pwrs = [cells[nid].tx_power_dbm for nid in t_cell.neighbors if nid in cells]
        neighbor_mean_pwr = float(np.mean(n_pwrs)) if n_pwrs else 38.0
    else:
        curr_pwr = 38.0
        curr_load = base_m.cell_utilization
        curr_interference = base_m.interference_level / max(1, len(cells))
        conn_users = int(len(users) / max(1, len(cells)))
        neighbor_count = 4
        neighbor_mean_pwr = 38.0

    is_shutdown = 1 if (proposed_status == "SHUTDOWN" or any(act.get("status") == "SHUTDOWN" for act in joint_actions.values())) else 0
    power_delta = (-curr_pwr) if is_shutdown else (proposed_power - curr_pwr)

    # Joint actions summary
    num_cells_mod = len(joint_actions)
    total_delta_db = 0.0
    for cid, act in joint_actions.items():
        if cid in cells:
            c_pwr = cells[cid].tx_power_dbm
            p_pwr = float(act.get("tx_power_dbm", c_pwr))
            if act.get("status") == "SHUTDOWN":
                total_delta_db += c_pwr
            else:
                total_delta_db += abs(p_pwr - c_pwr)

    # Average user traffic demand scale factor
    avg_traffic = float(np.mean([u.traffic_demand for u in users])) if users else 1.0

    return {
        "base_coverage_pct": float(base_m.coverage_percentage),
        "base_interference": float(base_m.interference_level),
        "base_total_energy": float(base_m.total_energy),
        "base_avg_sinr": float(base_m.avg_sinr_db),
        "base_min_sinr": float(base_m.min_sinr_db),
        "base_active_cells": int(base_m.active_cells),
        "base_cell_utilization": float(base_m.cell_utilization),
        "target_cell_idx": int(target_idx),
        "target_cell_curr_pwr": float(curr_pwr),
        "target_cell_proposed_pwr": float(0.0 if is_shutdown else proposed_power),
        "target_cell_power_delta": float(power_delta),
        "target_cell_is_shutdown": int(is_shutdown),
        "target_cell_curr_load": float(curr_load),
        "target_cell_curr_interference": float(curr_interference),
        "target_cell_connected_users": int(conn_users),
        "target_cell_neighbor_count": int(neighbor_count),
        "target_cell_neighbor_mean_pwr": float(neighbor_mean_pwr),
        "action_num_cells_modified": int(num_cells_mod),
        "action_total_delta_db": float(round(total_delta_db, 2)),
        "traffic_demand_multiplier": float(round(avg_traffic, 3)),
    }


def features_to_dataframe(feature_dicts: List[Dict[str, float]]) -> pd.DataFrame:
    """Convert list of feature dicts to DataFrame with consistent column ordering."""
    return pd.DataFrame(feature_dicts, columns=FEATURE_COLUMNS)
