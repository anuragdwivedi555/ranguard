import uuid
from typing import Dict, List
from collections import defaultdict

from ..models.command import ControllerCommand
from ..models.decision import ConflictReport
from ..models.cell import Cell
from .impact_graph import ImpactGraph


class ConflictDetector:
    """
    Detects Direct and Indirect Conflicts among controller proposals using the NetworkX Impact Graph.
    """
    def __init__(self):
        self.impact_graph = ImpactGraph()

    def detect_conflicts(
        self,
        commands: List[ControllerCommand],
        cells: Dict[str, Cell],
    ) -> List[ConflictReport]:
        # Build the impact graph
        self.impact_graph.build_graph(commands, cells)
        conflicts: List[ConflictReport] = []

        # 1. Detect DIRECT Conflicts (Multiple commands targeting the same cell)
        commands_by_cell: Dict[str, List[ControllerCommand]] = defaultdict(list)
        for cmd in commands:
            commands_by_cell[cmd.target_cell].append(cmd)

        for cell_id, cell_cmds in commands_by_cell.items():
            if len(cell_cmds) > 1:
                # Check if proposals contradict each other (e.g. different proposed values or actions)
                values = {c.proposed_value for c in cell_cmds}
                action_types = {c.action_type for c in cell_cmds}

                if len(values) > 1 or len(action_types) > 1:
                    controllers = list(dict.fromkeys(c.controller_id for c in cell_cmds))
                    severity = "CRITICAL" if any(c.action_type == "SHUTDOWN" for c in cell_cmds) else "HIGH"

                    detail_strs = [
                        f"{c.controller_id} ({c.action_type} -> {c.proposed_value:.1f} dBm)"
                        for c in cell_cmds
                    ]
                    explanation = (
                        f"Direct collision on {cell_id}: Multiple controllers submitted contradictory commands: "
                        + ", ".join(detail_strs)
                        + ". Executing concurrently without arbitration would destabilize transmission power and coverage."
                    )

                    conflicts.append(
                        ConflictReport(
                            conflict_id=f"CONF-DIR-{cell_id}-{uuid.uuid4().hex[:4]}",
                            conflict_type="DIRECT",
                            involved_controllers=controllers,
                            affected_cells=[cell_id],
                            conflicting_commands=cell_cmds,
                            affected_kpis=["COVERAGE", "ENERGY", "SINR"],
                            severity=severity,
                            explanation=explanation,
                        )
                    )

        # 2. Detect INDIRECT Conflicts (Commands targeting neighboring cells with opposing RF effects)
        for i, cmd_a in enumerate(commands):
            for cmd_b in commands[i + 1:]:
                # If they target different cells, check if their target cells are physical neighbors
                if cmd_a.target_cell != cmd_b.target_cell:
                    if self.impact_graph.are_neighbors(cmd_a.target_cell, cmd_b.target_cell):
                        # Detect opposing directional adjustments
                        # e.g., Power increase on Cell A while Cell B decreases, or shutdown of one while neighbor reduces power
                        opposing_directions = (
                            (cmd_a.delta > 0 and cmd_b.delta < 0)
                            or (cmd_a.delta < 0 and cmd_b.delta > 0)
                            or (cmd_a.action_type == "SHUTDOWN" and cmd_b.delta < 0)
                            or (cmd_b.action_type == "SHUTDOWN" and cmd_a.delta < 0)
                        )

                        if opposing_directions:
                            controllers = list(dict.fromkeys([cmd_a.controller_id, cmd_b.controller_id]))
                            conflicts.append(
                                ConflictReport(
                                    conflict_id=f"CONF-IND-{cmd_a.target_cell}-{cmd_b.target_cell}-{uuid.uuid4().hex[:4]}",
                                    conflict_type="INDIRECT",
                                    involved_controllers=controllers,
                                    affected_cells=[cmd_a.target_cell, cmd_b.target_cell],
                                    conflicting_commands=[cmd_a, cmd_b],
                                    affected_kpis=["INTERFERENCE", "COVERAGE", "SINR"],
                                    severity="MEDIUM",
                                    explanation=(
                                        f"Indirect inter-cell conflict between adjacent neighbors {cmd_a.target_cell} and {cmd_b.target_cell}: "
                                        f"{cmd_a.controller_id} proposes {cmd_a.action_type} (delta {cmd_a.delta:+.1f} dBm) while "
                                        f"{cmd_b.controller_id} proposes {cmd_b.action_type} (delta {cmd_b.delta:+.1f} dBm). "
                                        "Simultaneous execution alters boundary user handoffs and co-channel interference."
                                    ),
                                )
                            )

        return conflicts
