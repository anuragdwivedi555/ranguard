import math
from typing import Dict
from ..models.cell import Cell


class EnergyModel:
    """
    Simulated normalized energy consumption model.
    Accounts for static baseband/cooling consumption and RF transmission power.
    """
    STATIC_BASE_ENERGY: float = 10.0
    SLEEP_MODE_ENERGY: float = 2.0
    SHUTDOWN_ENERGY: float = 0.0
    RF_EFFICIENCY_FACTOR: float = 0.5

    @classmethod
    def calculate_cell_energy(cls, cell: Cell) -> float:
        """
        Calculates normalized energy consumption for a single cell.
        """
        if cell.status == "SHUTDOWN" or cell.status == "INACTIVE":
            return cls.SHUTDOWN_ENERGY
        elif cell.status == "SLEEP":
            return cls.SLEEP_MODE_ENERGY

        # ACTIVE cell: Base static energy + RF power component
        # Power in Watts = 10^((tx_power_dbm - 30) / 10)
        rf_watts = math.pow(10.0, (cell.tx_power_dbm - 30.0) / 10.0)
        rf_energy = rf_watts * cls.RF_EFFICIENCY_FACTOR
        return round(cls.STATIC_BASE_ENERGY + rf_energy, 3)

    @classmethod
    def calculate_total_energy(cls, cells: Dict[str, Cell]) -> float:
        """
        Calculates total network simulated normalized energy consumption.
        """
        return round(sum(cls.calculate_cell_energy(c) for c in cells.values()), 3)
