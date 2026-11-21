import math
from typing import Dict, Tuple

class SignalModel:
    """
    Deterministic radio propagation and path-loss model based on 3GPP Macro Urban (TR 36.814).
    PL(d) = 128.1 + 37.6 * log10(d_km) for d in km, with minimum distance clamping.
    """
    MIN_DISTANCE_METERS: float = 35.0
    MIN_RSRP_THRESHOLD_DBM: float = -95.0
    NOISE_FLOOR_DBM: float = -104.0

    @classmethod
    def calculate_distance(cls, x1: float, y1: float, x2: float, y2: float) -> float:
        dist = math.hypot(x1 - x2, y1 - y2)
        return max(dist, cls.MIN_DISTANCE_METERS)

    @classmethod
    def calculate_path_loss(cls, distance_meters: float) -> float:
        """
        Calculates path loss in dB.
        """
        d_km = max(distance_meters, cls.MIN_DISTANCE_METERS) / 1000.0
        # 3GPP Macro Urban Path Loss: 128.1 + 37.6 * log10(R)
        return 128.1 + 37.6 * math.log10(d_km)

    @classmethod
    def calculate_rsrp(cls, tx_power_dbm: float, distance_meters: float) -> float:
        """
        Calculates Received Signal Received Power (RSRP) in dBm.
        """
        path_loss = cls.calculate_path_loss(distance_meters)
        return tx_power_dbm - path_loss

    @classmethod
    def dbm_to_mw(cls, power_dbm: float) -> float:
        """
        Converts power from dBm to milliwatts (linear power).
        """
        return math.pow(10.0, power_dbm / 10.0)

    @classmethod
    def mw_to_dbm(cls, power_mw: float) -> float:
        """
        Converts linear power in milliwatts to dBm.
        """
        if power_mw <= 0:
            return -140.0
        return 10.0 * math.log10(power_mw)
