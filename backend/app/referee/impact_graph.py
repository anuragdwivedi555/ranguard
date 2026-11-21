from typing import Dict, List, Set, Any
import networkx as nx
from ..models.command import ControllerCommand
from ..models.cell import Cell


class ImpactGraph:
    """
    Constructs a NetworkX impact graph modeling relationships between
    Controllers, Commands, Cells, and Network KPIs.
    """
    def __init__(self):
        self.graph = nx.DiGraph()

    def build_graph(
        self,
        commands: List[ControllerCommand],
        cells: Dict[str, Cell],
    ) -> nx.DiGraph:
        self.graph.clear()

        # Add KPI nodes
        kpis = ["COVERAGE", "SINR", "ENERGY", "INTERFERENCE", "CAPACITY"]
        for kpi in kpis:
            self.graph.add_node(f"KPI_{kpi}", type="kpi", label=kpi)

        # Add Cell nodes and neighbor edges
        for cid, cell in cells.items():
            self.graph.add_node(cid, type="cell", label=cid, status=cell.status, power=cell.tx_power_dbm)
            # Cell impacts KPIs
            self.graph.add_edge(cid, "KPI_ENERGY", weight=0.3)
            self.graph.add_edge(cid, "KPI_COVERAGE", weight=0.4)
            self.graph.add_edge(cid, "KPI_INTERFERENCE", weight=0.3)
            self.graph.add_edge(cid, "KPI_SINR", weight=0.3)

            for nid in cell.neighbors:
                if nid in cells:
                    self.graph.add_edge(cid, nid, type="neighbor_influence", relation="co_channel")

        # Add Controller & Command nodes and edges
        for cmd in commands:
            ctrl_node = f"CTRL_{cmd.controller_id}"
            if not self.graph.has_node(ctrl_node):
                self.graph.add_node(ctrl_node, type="controller", label=cmd.controller_id)

            cmd_node = cmd.command_id
            self.graph.add_node(
                cmd_node,
                type="command",
                label=f"{cmd.action_type} -> {cmd.target_cell}",
                action_type=cmd.action_type,
                delta=cmd.delta,
                target_cell=cmd.target_cell,
            )

            # Controller issues Command
            self.graph.add_edge(ctrl_node, cmd_node, type="issues")
            # Command affects target Cell
            self.graph.add_edge(cmd_node, cmd.target_cell, type="targets", delta=cmd.delta)

        return self.graph

    def are_neighbors(self, cell_a: str, cell_b: str) -> bool:
        return self.graph.has_edge(cell_a, cell_b) or self.graph.has_edge(cell_b, cell_a)

    def get_cell_neighbors(self, cell_id: str) -> List[str]:
        if not self.graph.has_node(cell_id):
            return []
        return [
            target for target in self.graph.successors(cell_id)
            if self.graph.nodes[target].get("type") == "cell"
        ]

    def to_dict(self) -> Dict[str, Any]:
        """
        Serializes the graph for visualization.
        """
        nodes = []
        for n, data in self.graph.nodes(data=True):
            nodes.append({"id": n, **data})
        edges = []
        for u, v, data in self.graph.edges(data=True):
            edges.append({"source": u, "target": v, **data})
        return {"nodes": nodes, "edges": edges}
