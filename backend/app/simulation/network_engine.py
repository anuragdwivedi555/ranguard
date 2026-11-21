import copy
from typing import Dict, List, Optional, Tuple
import numpy as np

from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics
from .signal_model import SignalModel
from .interference_model import InterferenceModel
from .energy_model import EnergyModel
from .metrics_engine import MetricsEngine
from .traffic_provider import TrafficProvider, TrafficMode, SyntheticTrafficProvider, MilanReplayTrafficProvider


class NetworkEngine:
    """
    Core deterministic mobile network simulation engine.
    Manages 6 cells and 100 users across a 2000m x 2000m area.
    """
    DEFAULT_SEED: int = 42
    TOTAL_CELLS: int = 6
    TOTAL_USERS: int = 100
    CELL_CAPACITY: int = 35

    def __init__(
        self,
        seed: int = DEFAULT_SEED,
        traffic_mode: TrafficMode = TrafficMode.SYNTHETIC,
        traffic_provider: Optional[TrafficProvider] = None,
    ):
        self.seed = seed
        self.rng = np.random.RandomState(seed)
        self.cells: Dict[str, Cell] = {}
        self.users: List[User] = []
        self.metrics: Optional[NetworkMetrics] = None
        self.cycle: int = 1
        self.state_version: int = 1
        self.traffic_mode = traffic_mode
        if traffic_provider is not None:
            self.traffic_provider = traffic_provider
            self.traffic_mode = traffic_provider.mode
        elif traffic_mode == TrafficMode.SYNTHETIC:
            self.traffic_provider = SyntheticTrafficProvider()
        elif traffic_mode == TrafficMode.MILAN_REPLAY:
            self.traffic_provider = MilanReplayTrafficProvider()
        else:
            self.traffic_provider = SyntheticTrafficProvider()
        self.cycle_duration_seconds: float = 10.0
        self.cumulative_energy_joules: float = 0.0
        self.cumulative_energy_wh: float = 0.0
        self.initialize_network()

    def initialize_network(self) -> None:
        """
        Creates the deterministic 6-cell topology and 100 distributed users.
        """
        self.rng = np.random.RandomState(self.seed)
        self.cycle = 1
        self.state_version = 1
        self.cumulative_energy_joules = 0.0
        self.cumulative_energy_wh = 0.0

        # 1. Initialize 6 cells in a 2-tier grid across 2200m x 2000m
        cell_configs = [
            {"id": "CELL_01", "x": 350.0, "y": 500.0, "neighbors": ["CELL_02", "CELL_04", "CELL_05"]},
            {"id": "CELL_02", "x": 1150.0, "y": 500.0, "neighbors": ["CELL_01", "CELL_03", "CELL_04", "CELL_05", "CELL_06"]},
            {"id": "CELL_03", "x": 1950.0, "y": 500.0, "neighbors": ["CELL_02", "CELL_05", "CELL_06"]},
            {"id": "CELL_04", "x": 350.0, "y": 1500.0, "neighbors": ["CELL_01", "CELL_02", "CELL_05"]},
            {"id": "CELL_05", "x": 1150.0, "y": 1500.0, "neighbors": ["CELL_01", "CELL_02", "CELL_03", "CELL_04", "CELL_06"]},
            {"id": "CELL_06", "x": 1950.0, "y": 1500.0, "neighbors": ["CELL_02", "CELL_03", "CELL_05"]},
        ]

        self.cells = {}
        for cfg in cell_configs:
            cell = Cell(
                cell_id=cfg["id"],
                x=cfg["x"],
                y=cfg["y"],
                tx_power_dbm=38.0,
                min_tx_power=10.0,
                max_tx_power=46.0,
                status="ACTIVE",
                capacity=self.CELL_CAPACITY,
                neighbors=cfg["neighbors"],
            )
            self.cells[cell.cell_id] = cell

        # 2. Distribute 100 users deterministically:
        # 14 users clustered around each of the 6 cells (84 users),
        # plus 16 boundary / cell-edge users in the overlapping handoff zones.
        self.users = []
        user_idx = 1

        # Cluster around each cell
        for cell_id, cell in self.cells.items():
            for _ in range(14):
                # Gaussian scatter around cell center, bounded within radius ~320m
                angle = self.rng.uniform(0, 2 * np.pi)
                radius = self.rng.uniform(40.0, 320.0)
                ux = float(np.clip(cell.x + radius * np.cos(angle), 50.0, 2200.0))
                uy = float(np.clip(cell.y + radius * np.sin(angle), 50.0, 1950.0))
                demand = float(round(self.rng.uniform(1.0, 3.0), 2))

                self.users.append(
                    User(
                        user_id=f"USER_{user_idx:03d}",
                        x=round(ux, 1),
                        y=round(uy, 1),
                        traffic_demand=demand,
                        base_traffic_demand=demand,
                    )
                )
                user_idx += 1

        # 16 boundary / edge users scattered across cell overlap regions
        for _ in range(16):
            ux = float(round(self.rng.uniform(200.0, 2100.0), 1))
            uy = float(round(self.rng.uniform(300.0, 1700.0), 1))
            demand = float(round(self.rng.uniform(1.0, 3.5), 2))
            self.users.append(
                User(
                    user_id=f"USER_{user_idx:03d}",
                    x=ux,
                    y=uy,
                    traffic_demand=demand,
                    base_traffic_demand=demand,
                )
            )
            user_idx += 1

        # 3. Apply traffic provider demands if provider attached
        if hasattr(self, "traffic_provider") and self.traffic_provider is not None:
            self.traffic_provider.update_cycle(self.users, self.cells, self.cycle)

        # 4. Perform initial network recalculation
        self.recalculate()

    def recalculate(self) -> NetworkMetrics:
        """
        Recalculates user association, signal strength, SINR, cell loads, and KPIs.
        Every state change invokes this method.
        """
        # Reset cell loads
        for cell in self.cells.values():
            cell.connected_users_count = 0
            cell.current_load = 0.0

        # Step A & B: User association based on strongest received signal
        active_cells = {cid: c for cid, c in self.cells.items() if c.is_active}

        for user in self.users:
            best_cell_id: Optional[str] = None
            best_rsrp = -140.0

            for cid, cell in active_cells.items():
                dist = SignalModel.calculate_distance(user.x, user.y, cell.x, cell.y)
                rsrp = SignalModel.calculate_rsrp(cell.tx_power_dbm, dist)
                if rsrp > best_rsrp:
                    best_rsrp = rsrp
                    best_cell_id = cid

            # Apply minimum signal threshold
            if best_cell_id is not None and best_rsrp >= SignalModel.MIN_RSRP_THRESHOLD_DBM:
                user.serving_cell = best_cell_id
                user.rsrp_dbm = round(best_rsrp, 2)
                user.connection_status = "CONNECTED"
                self.cells[best_cell_id].connected_users_count += 1
            else:
                user.serving_cell = None
                user.rsrp_dbm = round(best_rsrp, 2)
                user.connection_status = "UNCOVERED"
                user.sinr_db = -30.0
                user.is_adequately_served = False

        # Step C: SINR recalculation in linear units
        for user in self.users:
            if user.connection_status == "CONNECTED" and user.serving_cell:
                rsrp, sinr, _ = InterferenceModel.calculate_user_sinr(user, self.cells)
                user.rsrp_dbm = round(rsrp, 2)
                user.sinr_db = round(sinr, 2)
                # Adequately served requirement: RSRP >= -95 dBm and SINR >= 0 dB
                user.is_adequately_served = (
                    user.rsrp_dbm >= SignalModel.MIN_RSRP_THRESHOLD_DBM
                    and user.sinr_db >= MetricsEngine.MIN_SINR_SAFE_DB
                )
            else:
                user.sinr_db = -30.0
                user.is_adequately_served = False

        # Update cell utilization and radiated interference
        cell_interference = InterferenceModel.calculate_cell_interference_matrix(self.cells)
        for cid, cell in self.cells.items():
            connected_users = [u for u in self.users if u.serving_cell == cid and u.connection_status == "CONNECTED"]
            cell.total_traffic_demand = round(sum(u.traffic_demand for u in connected_users), 2)
            user_load = cell.connected_users_count / max(cell.capacity, 1)
            traffic_load = cell.total_traffic_demand / max(getattr(cell, "capacity_mbps", 70.0), 1.0)
            cell.current_load = round(min(1.0, max(user_load, traffic_load)), 3)
            cell.energy_consumption = EnergyModel.calculate_cell_energy(cell)
            cell.total_interference_caused = round(cell_interference.get(cid, 0.0), 3)

        # Calculate network metrics
        self.metrics = MetricsEngine.calculate_metrics(
            self.cells,
            self.users,
            cumulative_energy_joules=self.cumulative_energy_joules,
            cumulative_energy_wh=self.cumulative_energy_wh,
        )
        return self.metrics

    def clone(self) -> "NetworkEngine":
        """
        Creates an independent deep-copy snapshot of the simulation state for shadow simulation.
        Does not mutate the active network.
        """
        snapshot = copy.deepcopy(self)
        return snapshot

    def apply_action(self, cell_id: str, tx_power_dbm: Optional[float] = None, status: Optional[str] = None) -> None:
        """
        Applies a configuration change to a single cell and recalculates metrics.
        """
        if cell_id not in self.cells:
            raise ValueError(f"Cell {cell_id} not found in network")

        cell = self.cells[cell_id]
        if status is not None:
            cell.status = status
        if tx_power_dbm is not None:
            delta = tx_power_dbm - cell.tx_power_dbm
            cell.tx_power_dbm = float(tx_power_dbm)
            cell.last_power_change = round(delta, 2)
            cell.last_action_cycle = self.cycle

        self.recalculate()

    def apply_joint_actions(self, actions: Dict[str, Dict[str, any]]) -> None:
        """
        Applies coordinated updates to multiple cells:
        actions = {"CELL_03": {"tx_power_dbm": 34.0, "status": "ACTIVE"}}
        """
        for cid, config in actions.items():
            if cid in self.cells:
                cell = self.cells[cid]
                if "status" in config:
                    cell.status = config["status"]
                if "tx_power_dbm" in config:
                    delta = config["tx_power_dbm"] - cell.tx_power_dbm
                    cell.tx_power_dbm = float(config["tx_power_dbm"])
                    cell.last_power_change = round(delta, 2)
                    cell.last_action_cycle = self.cycle
        self.recalculate()

    def step(self) -> int:
        """
        Advances the simulation by one cycle.
        Accumulates energy consumed during the cycle (Power in Watts * cycle duration in seconds).
        Updates user traffic demand if a traffic provider is active.
        """
        if self.metrics:
            p_watts = self.metrics.total_energy
            delta_joules = p_watts * self.cycle_duration_seconds
            self.cumulative_energy_joules = round(self.cumulative_energy_joules + delta_joules, 3)
            self.cumulative_energy_wh = round(self.cumulative_energy_joules / 3600.0, 5)

        self.cycle += 1
        if hasattr(self, "traffic_provider") and self.traffic_provider is not None:
            self.traffic_provider.update_cycle(self.users, self.cells, self.cycle)
        self.recalculate()
        return self.cycle

    def set_traffic_provider(self, provider: TrafficProvider) -> None:
        """
        Sets or updates the traffic demand provider and recalculates network state.
        """
        self.traffic_provider = provider
        self.traffic_mode = provider.mode
        self.traffic_provider.update_cycle(self.users, self.cells, self.cycle)
        self.recalculate()
