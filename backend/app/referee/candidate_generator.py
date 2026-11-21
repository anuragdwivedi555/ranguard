from typing import Any, Dict, List
from collections import defaultdict
from ..models.command import ControllerCommand
from ..models.cell import Cell


class CandidateGenerator:
    """
    Generates meaningful candidate joint actions for shadow simulation.
    Explores original proposals, intermediate compromises, partial reductions, and status quo.
    """

    @classmethod
    def generate_candidates(
        cls,
        commands: List[ControllerCommand],
        cells: Dict[str, Cell],
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []

        # Always include Candidate 0: Maintain Current State (Status Quo)
        candidates.append({
            "candidate_id": "CAND-STATUS-QUO",
            "description": "Maintain current network state (No modifications)",
            "target_cell": "ALL",
            "proposed_power": 0.0,
            "proposed_status": "ACTIVE",
            "joint_actions": {},
            "origin": "BASELINE",
        })

        if not commands:
            return candidates

        # Group commands by target cell
        cmds_by_cell = defaultdict(list)
        for cmd in commands:
            cmds_by_cell[cmd.target_cell].append(cmd)

        # 1. Individual controller proposals
        for idx, cmd in enumerate(commands, 1):
            cell = cells.get(cmd.target_cell)
            current_pwr = cell.tx_power_dbm if cell else 38.0

            if cmd.action_type == "SHUTDOWN":
                candidates.append({
                    "candidate_id": f"CAND-PROP-{cmd.controller_id}-{cmd.target_cell}",
                    "description": f"Execute {cmd.controller_id} proposal: Full shutdown of {cmd.target_cell}",
                    "target_cell": cmd.target_cell,
                    "proposed_power": 0.0,
                    "proposed_status": "SHUTDOWN",
                    "joint_actions": {cmd.target_cell: {"status": "SHUTDOWN", "tx_power_dbm": 0.0}},
                    "origin": cmd.controller_id,
                })
            else:
                candidates.append({
                    "candidate_id": f"CAND-PROP-{cmd.controller_id}-{cmd.target_cell}",
                    "description": f"Execute {cmd.controller_id} proposal: Set {cmd.target_cell} to {cmd.proposed_value:.1f} dBm ({cmd.delta:+.1f} dBm)",
                    "target_cell": cmd.target_cell,
                    "proposed_power": cmd.proposed_value,
                    "proposed_status": "ACTIVE",
                    "joint_actions": {cmd.target_cell: {"status": "ACTIVE", "tx_power_dbm": cmd.proposed_value}},
                    "origin": cmd.controller_id,
                })

        # 2. Intelligent Compromises for cells with conflicts or shutdown
        for cell_id, cell_cmds in cmds_by_cell.items():
            cell = cells.get(cell_id)
            if not cell:
                continue

            has_shutdown = any(c.action_type == "SHUTDOWN" for c in cell_cmds)
            powers = [c.proposed_value for c in cell_cmds if c.action_type != "SHUTDOWN"]

            # If shutdown was proposed, generate Partial Power Reduction alternative
            if has_shutdown:
                # Moderate power reduction (e.g. reduce by 4.0 dBm from current)
                safe_reduced_power = max(cell.min_tx_power, cell.tx_power_dbm - 4.0)
                candidates.append({
                    "candidate_id": f"CAND-PARTIAL-REDUCTION-{cell_id}",
                    "description": f"Partial power reduction on {cell_id} ({safe_reduced_power:.1f} dBm) instead of full shutdown",
                    "target_cell": cell_id,
                    "proposed_power": safe_reduced_power,
                    "proposed_status": "ACTIVE",
                    "joint_actions": {cell_id: {"status": "ACTIVE", "tx_power_dbm": safe_reduced_power}},
                    "origin": "REFEREE_COORDINATED",
                })

            # If conflicting power levels exist on the same cell
            if len(powers) >= 2:
                midpoint_power = round(sum(powers) / len(powers), 1)
                candidates.append({
                    "candidate_id": f"CAND-COMPROMISE-{cell_id}",
                    "description": f"Intermediate compromise on {cell_id} at {midpoint_power:.1f} dBm balancing energy and coverage",
                    "target_cell": cell_id,
                    "proposed_power": midpoint_power,
                    "proposed_status": "ACTIVE",
                    "joint_actions": {cell_id: {"status": "ACTIVE", "tx_power_dbm": midpoint_power}},
                    "origin": "REFEREE_COORDINATED",
                })

        # 3. Multi-cell Joint Coordinated Candidate if multiple cells are targeted
        if len(cmds_by_cell) > 1:
            joint_actions = {}
            desc_parts = []
            for cid, c_list in cmds_by_cell.items():
                cell = cells[cid]
                # Pick the safest non-destructive action for each cell
                non_shutdown = [c for c in c_list if c.action_type != "SHUTDOWN"]
                if non_shutdown:
                    avg_pwr = round(sum(c.proposed_value for c in non_shutdown) / len(non_shutdown), 1)
                    joint_actions[cid] = {"status": "ACTIVE", "tx_power_dbm": avg_pwr}
                    desc_parts.append(f"{cid} -> {avg_pwr} dBm")
                else:
                    safe_pwr = max(cell.min_tx_power, cell.tx_power_dbm - 4.0)
                    joint_actions[cid] = {"status": "ACTIVE", "tx_power_dbm": safe_pwr}
                    desc_parts.append(f"{cid} -> {safe_pwr} dBm (partial)")

            candidates.append({
                "candidate_id": "CAND-JOINT-COORDINATED",
                "description": "Multi-cell coordinated balance: " + ", ".join(desc_parts),
                "target_cell": "MULTI_CELL",
                "proposed_power": 0.0,
                "proposed_status": "ACTIVE",
                "joint_actions": joint_actions,
                "origin": "REFEREE_COORDINATED",
            })

        return candidates
