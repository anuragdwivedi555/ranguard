"""ML Decision Intelligence Surrogate Package."""

from .schemas import (
    PreActionFeatures,
    SurrogatePrediction,
    CandidateTwinVerification,
    PredictionVerificationPair,
    DecisionIntelligenceAudit,
)
from .feature_extractor import extract_candidate_features, FEATURE_COLUMNS
from .surrogate_model import XGBoostActionSurrogate
from .baseline_models import ZeroDeltaBaseline, MeanDeltaBaseline, LinearRidgeBaseline
from .dataset_generator import SurrogateDatasetGenerator, generate_and_save_dataset
from .evaluator import SurrogateEvaluator
from .engine import DecisionIntelligenceEngine

__all__ = [
    "PreActionFeatures",
    "SurrogatePrediction",
    "CandidateTwinVerification",
    "PredictionVerificationPair",
    "DecisionIntelligenceAudit",
    "extract_candidate_features",
    "FEATURE_COLUMNS",
    "XGBoostActionSurrogate",
    "ZeroDeltaBaseline",
    "MeanDeltaBaseline",
    "LinearRidgeBaseline",
    "SurrogateDatasetGenerator",
    "generate_and_save_dataset",
    "SurrogateEvaluator",
    "DecisionIntelligenceEngine",
]
