from typing import Dict, List, Tuple
from ..models.cell import Cell
from ..models.user import User
from ..models.metrics import NetworkMetrics


class SafetyGuardrails:
    """
    Enforces hard safety constraints for network operation.
    Unsafe candidates are disqualified regardless of optimization score.
    """
    DEFAULT_MIN_COVERAGE_PCT: float = 95.0
    DEFAULT_MIN_RSRP_DBM: float = -95.0
    DEFAULT_MIN_SINR_DB: float = 0.0
    MAX_POWER_STEP_PER_CYCLE_DB: float = 6.0

    def __init__(
        self,
        min_coverage_pct: float = DEFAULT_MIN_COVERAGE_PCT,
        min_rsrp_dbm: float = DEFAULT_MIN_RSRP_DBM,
        min_sinr_db: float = DEFAULT_MIN_SINR_DB,
        max_power_step: float = MAX_POWER_STEP_PER_CYCLE_DB,
    ):
        self.min_coverage_pct = min_coverage_pct
        self.min_rsrp_dbm = min_rsrp_dbm
        self.min_sinr_db = min_sinr_db
        self.max_power_step = max_power_step

    def validate_candidate(
        self,
        predicted_metrics: NetworkMetrics,
        current_cells: Dict[str, Cell],
        proposed_actions: Dict[str, Dict[str, any]],
    ) -> Tuple[bool, List[str]]:
        """
        Validates hard constraints on a candidate action.
        Returns:
            is_safe: bool
            violated_constraints: List[str]
        """
        violations: List[str] = []

        # 1. Hard Coverage constraint
        if predicted_metrics.coverage_percentage < self.min_coverage_pct:
            violations.append(
                f"Coverage drop violation: Predicted coverage {predicted_metrics.coverage_percentage:.1f}% "
                f"falls below minimum required threshold of {self.min_coverage_pct:.1f}%."
            )

        # 2. Hardware Tx Power limit constraints & step constraints
        for cid, act in proposed_actions.items():
            if cid in current_cells:
                curr_cell = current_cells[cid]
                if "tx_power_dbm" in act:
                    power = act["tx_power_dbm"]
                    if power < curr_cell.min_tx_power:
                        violations.append(
                            f"Hardware limit violation: Cell {cid} proposed power {power} dBm is below minimum {curr_cell.min_tx_power} dBm."
                        )
                    if power > curr_cell.max_tx_power:
                        violations.append(
                            f"Hardware limit violation: Cell {cid} proposed power {power} dBm exceeds maximum {curr_cell.max_tx_power} dBm."
                        )

                    # Max step per cycle
                    delta = abs(power - curr_cell.tx_power_dbm)
                    if delta > self.max_power_step:
                        violations.append(
                            f"Stability step violation: Cell {cid} power adjustment of {delta:.1f} dB exceeds max allowed step {self.max_power_step:.1f} dB/cycle."
                        )

                # Invalid state checks
                status = act.get("status", curr_cell.status)
                if status not in ["ACTIVE", "SLEEP", "SHUTDOWN", "INACTIVE"]:
                    violations.append(f"Invalid state violation: Cell {cid} unknown status '{status}'.")

        # 3. Network stability check (e.g. non-negative energy)
        if predicted_metrics.total_energy < 0.0:
            violations.append("Physical constraint violation: Negative energy consumption predicted.")

        # 4. Severe SINR collapse check (e.g. min SINR below -5 dB)
        if predicted_metrics.min_sinr_db < -5.0:
            violations.append(
                f"RF signal degradation: Connected users experience severe SINR collapse ({predicted_metrics.min_sinr_db:.1f} dB < -5 dB)."
            )

        is_safe = len(violations) == 0
        return is_safe, violations

    def evaluate_checks(
        self,
        predicted_metrics: NetworkMetrics,
        current_cells: Dict[str, Cell],
        proposed_actions: Dict[str, Dict[str, any]],
    ) -> List[Dict[str, any]]:
        """
        Structured, display-ready version of validate_candidate(): one entry per hard
        guardrail with the measured value, the limit and the pass/fail outcome.
        """
        powers = []
        steps = []
        hw_ok = True
        for cid, act in proposed_actions.items():
            cell = current_cells.get(cid)
            if cell is None or "tx_power_dbm" not in act:
                continue
            pw = act["tx_power_dbm"]
            powers.append(pw)
            steps.append(abs(pw - cell.tx_power_dbm))
            if pw < cell.min_tx_power or pw > cell.max_tx_power:
                hw_ok = False
        max_step = max(steps) if steps else 0.0
        lowest = min(powers) if powers else None
        return [
            {
                "key": "coverage",
                "label": "Coverage",
                "rule": f"≥ {self.min_coverage_pct:.0f} %",
                "value": f"{predicted_metrics.coverage_percentage:.1f} %",
                "passed": predicted_metrics.coverage_percentage >= self.min_coverage_pct,
            },
            {
                "key": "sinr",
                "label": "Worst-user SINR",
                "rule": "≥ −5 dB",
                "value": f"{predicted_metrics.min_sinr_db:.1f} dB",
                "passed": predicted_metrics.min_sinr_db >= -5.0,
            },
            {
                "key": "step",
                "label": "Power step per cycle",
                "rule": f"≤ {self.max_power_step:.0f} dB",
                "value": f"{max_step:.1f} dB",
                "passed": max_step <= self.max_power_step,
            },
            {
                "key": "hardware",
                "label": "Amplifier limits",
                "rule": "10 – 46 dBm",
                "value": "unchanged" if lowest is None else f"{lowest:.1f} dBm",
                "passed": hw_ok,
            },
            {
                "key": "energy",
                "label": "Physical sanity",
                "rule": "energy ≥ 0",
                "value": f"{predicted_metrics.total_energy:.1f} u",
                "passed": predicted_metrics.total_energy >= 0.0,
            },
        ]
