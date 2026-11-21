from typing import Dict, List
import numpy as np
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics
from .energy_model import EnergyModel


class MetricsEngine:
    """
    Computes all network-level KPIs derived directly from simulation state.
    """
    MIN_COVERAGE_TARGET_PCT: float = 95.0
    MIN_RSRP_SAFE_DBM: float = -95.0
    MIN_SINR_SAFE_DB: float = 0.0

    @classmethod
    def calculate_metrics(
        cls,
        cells: Dict[str, Cell],
        users: List[User],
        min_coverage_target: float = 95.0,
        cumulative_energy_joules: float = 0.0,
        cumulative_energy_wh: float = 0.0,
    ) -> NetworkMetrics:
        total_users = len(users)
        if total_users == 0:
            return NetworkMetrics(
                coverage_percentage=0.0,
                avg_sinr_db=0.0,
                min_sinr_db=0.0,
                avg_rsrp_dbm=-140.0,
                total_energy=0.0,
                interference_level=0.0,
                active_cells=0,
                total_cells=len(cells),
                connected_users=0,
                uncovered_users=0,
                cell_utilization=0.0,
                safety_violations=["No users present in simulation"],
            )

        connected_users_list = [u for u in users if u.connection_status == "CONNECTED"]
        adequately_served = [u for u in users if u.is_adequately_served]
        coverage_pct = round((len(adequately_served) / total_users) * 100.0, 2)

        if connected_users_list:
            avg_sinr = round(float(np.mean([u.sinr_db for u in connected_users_list])), 2)
            min_sinr = round(float(np.min([u.sinr_db for u in connected_users_list])), 2)
            avg_rsrp = round(float(np.mean([u.rsrp_dbm for u in connected_users_list])), 2)
        else:
            avg_sinr = -30.0
            min_sinr = -30.0
            avg_rsrp = -140.0

        total_energy = EnergyModel.calculate_total_energy(cells)
        active_cells_count = sum(1 for c in cells.values() if c.is_active)

        # Total interference metric across all active cells
        total_interference = round(sum(c.total_interference_caused for c in cells.values()), 3)

        # Average cell utilization
        active_cells_list = [c for c in cells.values() if c.is_active]
        if active_cells_list:
            avg_utilization = round(float(np.mean([c.current_load for c in active_cells_list])), 3)
        else:
            avg_utilization = 0.0

        # Safety violations evaluation
        violations: List[str] = []
        if coverage_pct < min_coverage_target:
            violations.append(
                f"Coverage {coverage_pct:.1f}% is below hard safety threshold of {min_coverage_target:.1f}%"
            )

        for cid, cell in cells.items():
            if cell.is_active and (cell.tx_power_dbm < cell.min_tx_power or cell.tx_power_dbm > cell.max_tx_power):
                violations.append(
                    f"Cell {cid} tx power {cell.tx_power_dbm} dBm exceeds safe limits [{cell.min_tx_power}, {cell.max_tx_power}]"
                )

        return NetworkMetrics(
            coverage_percentage=coverage_pct,
            avg_sinr_db=avg_sinr,
            min_sinr_db=min_sinr,
            avg_rsrp_dbm=avg_rsrp,
            total_energy=total_energy,
            cumulative_energy_joules=cumulative_energy_joules,
            cumulative_energy_wh=cumulative_energy_wh,
            interference_level=total_interference,
            active_cells=active_cells_count,
            total_cells=len(cells),
            connected_users=len(connected_users_list),
            uncovered_users=total_users - len(adequately_served),
            cell_utilization=avg_utilization,
            safety_violations=violations,
        )
