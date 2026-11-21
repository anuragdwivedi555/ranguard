from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from ...services.benchmark_service import BenchmarkService

router = APIRouter(prefix="/api/comparison", tags=["Benchmark Comparison"])


class ComparisonRequest(BaseModel):
    seed: int = Field(default=42, description="Random seed for deterministic benchmark initialization")
    cycles: int = Field(default=4, description="Number of simulation cycles to evaluate")


@router.post("/run", summary="Run comparative evaluation across No-Referee, Fixed-Priority, and RANGUARD")
def run_benchmark_comparison(req: Optional[ComparisonRequest] = None) -> Dict[str, Any]:
    seed = req.seed if req else 42
    cycles = req.cycles if req else 4
    return BenchmarkService.run_comparison(seed=seed, cycles_count=cycles)
