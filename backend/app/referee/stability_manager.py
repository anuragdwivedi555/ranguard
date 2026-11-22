from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from ..models.cell import Cell
from ..models.metrics import NetworkMetrics


class StabilityRecord:
    def __init__(self, cycle: int, delta: float, action_type: str, controller_id: str):
        self.cycle = cycle
        self.delta = delta
        self.action_type = action_type
        self.controller_id = controller_id


class StabilityManager:
    """
    Guards against ping-pong instability, frequent reversals, and micro-oscillations.
    Implements Cooldown, Hysteresis, Reversal Tracking, and Safety Recovery Override.
    """
    DEFAULT_COOLDOWN_CYCLES: int = 3
    DEFAULT_HYSTERESIS_DELTA_DB: float = 1.0

    def __init__(
        self,
        cooldown_cycles: int = DEFAULT_COOLDOWN_CYCLES,
        hysteresis_delta_db: float = DEFAULT_HYSTERESIS_DELTA_DB,
    ):
        self.cooldown_cycles = cooldown_cycles
        self.hysteresis_delta_db = hysteresis_delta_db
        self.cell_history: Dict[str, List[StabilityRecord]] = defaultdict(list)
        self.reversal_count: int = 0
        self.delayed_count: int = 0
        self.override_count: int = 0

    def reset(self):
        self.cell_history.clear()
        self.reversal_count = 0
        self.delayed_count = 0
        self.override_count = 0

    def check_stability(
        self,
        cell_id: str,
        proposed_delta: float,
        proposed_action_type: str,
        controller_id: str,
        current_cycle: int,
        current_metrics: NetworkMetrics,
        is_hard_safety_recovery: bool = False,
        dry_run: bool = False,
    ) -> Tuple[bool, str, bool]:
        """
        Evaluates whether an action on cell_id should be DELAYED due to cooldown or hysteresis.
        Returns:
            should_delay: bool
            reason: str
            is_override: bool
        """
        history = self.cell_history[cell_id]

        # 1. Check for direction reversal (only record proposed reversal if not dry_run)
        if history and not dry_run:
            last_record = history[-1]
            if (last_record.delta > 0 and proposed_delta < 0) or (last_record.delta < 0 and proposed_delta > 0):
                self.reversal_count += 1

        # 2. Safety Recovery Override: Urgent safety recovery ALWAYS bypasses cooldown!
        if is_hard_safety_recovery or (current_metrics.coverage_percentage < 95.0 and proposed_delta > 0):
            if not dry_run:
                self.override_count += 1
            return False, "Safety Recovery Override: Action permitted immediately to rescue degraded network coverage.", True

        # 3. Hysteresis Check: Ignore trivial micro-oscillations under threshold
        if abs(proposed_delta) > 0 and abs(proposed_delta) < self.hysteresis_delta_db:
            if not dry_run:
                self.delayed_count += 1
            return True, f"Hysteresis block: Proposed delta {proposed_delta:+.2f} dBm is below the {self.hysteresis_delta_db} dBm stability threshold.", False

        # 4. Cooldown Check: Cell modified too recently
        if history:
            last_record = history[-1]
            cycles_since_last = current_cycle - last_record.cycle
            if cycles_since_last < self.cooldown_cycles:
                if not dry_run:
                    self.delayed_count += 1
                return (
                    True,
                    f"Cooldown active: Cell {cell_id} was modified in cycle {last_record.cycle} ({cycles_since_last} cycles ago, cooldown is {self.cooldown_cycles} cycles).",
                    False,
                )

        return False, "Stability criteria satisfied.", False

    def record_commit(self, cell_id: str, delta: float, action_type: str, controller_id: str, cycle: int):
        """
        Records executed action in history.
        """
        history = self.cell_history[cell_id]
        if history:
            last_record = history[-1]
            if (last_record.delta > 0 and delta < 0) or (last_record.delta < 0 and delta > 0):
                self.reversal_count += 1

        self.cell_history[cell_id].append(
            StabilityRecord(
                cycle=cycle,
                delta=delta,
                action_type=action_type,
                controller_id=controller_id,
            )
        )
