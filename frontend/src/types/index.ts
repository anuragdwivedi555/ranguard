export interface Cell {
  cell_id: string;
  x: number;
  y: number;
  tx_power_dbm: number;
  min_tx_power: number;
  max_tx_power: number;
  status: 'ACTIVE' | 'SLEEP' | 'SHUTDOWN' | 'INACTIVE';
  capacity: number;
  current_load: number;
  connected_users_count: number;
  neighbors: string[];
  energy_consumption: number;
  total_interference_caused: number;
  last_action_cycle?: number | null;
  last_power_change: number;
}

export interface User {
  user_id: string;
  x: number;
  y: number;
  traffic_demand: number;
  serving_cell: string | null;
  rsrp_dbm: number;
  sinr_db: number;
  connection_status: 'CONNECTED' | 'UNCOVERED';
  is_adequately_served: boolean;
}

export interface NetworkMetrics {
  coverage_percentage: number;
  avg_sinr_db: number;
  min_sinr_db: number;
  avg_rsrp_dbm: number;
  total_energy: number;
  interference_level: number;
  active_cells: number;
  total_cells: number;
  connected_users: number;
  uncovered_users: number;
  cell_utilization: number;
  safety_violations: string[];
}

export interface NetworkState {
  cycle: number;
  state_version: number;
  metrics: NetworkMetrics;
  cells: Record<string, Cell>;
  users: User[];
}

export interface ControllerCommand {
  command_id: string;
  controller_id: 'ENERGY' | 'COVERAGE' | 'INTERFERENCE';
  target_cell: string;
  action_type: 'POWER_DOWN' | 'POWER_UP' | 'SHUTDOWN' | 'SLEEP' | 'WAKEUP' | 'MAINTAIN';
  current_value: number;
  proposed_value: number;
  delta: number;
  reason: string;
  priority: number;
  cycle: number;
  timestamp: number;
}

export interface CandidateAction {
  candidate_id: string;
  description: string;
  target_cell: string;
  proposed_power: number;
  proposed_status: string;
  joint_actions: Record<string, any>;
  predicted_metrics: NetworkMetrics;
  is_safe: boolean;
  violated_constraints: string[];
  objective_score: number;
  energy_score: number;
  interference_score: number;
  coverage_score: number;
  change_score: number;
  explanation: string;
}

export interface ConflictReport {
  conflict_id: string;
  conflict_type: 'DIRECT' | 'INDIRECT';
  involved_controllers: string[];
  affected_cells: string[];
  conflicting_commands: ControllerCommand[];
  affected_kpis: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  explanation: string;
}

export interface RefereeDecision {
  decision_id: string;
  cycle: number;
  verdict: 'APPROVE' | 'MODIFY' | 'DELAY' | 'REJECT';
  original_proposals: ControllerCommand[];
  selected_candidate?: CandidateAction | null;
  selected_action: Record<string, any>;
  reason: string;
  rejected_alternatives: Array<{
    candidate_id: string;
    description: string;
    is_safe: boolean;
    objective_score: number;
    violated_constraints: string[];
  }>;
  safety_validation: {
    is_safe: boolean;
    violated_constraints: string[];
  };
  predicted_kpi_impact: {
    coverage_delta: number;
    energy_delta: number;
    sinr_delta: number;
    interference_delta: number;
  };
  actual_kpi_impact?: {
    coverage_delta: number;
    energy_delta: number;
    sinr_delta: number;
    interference_delta: number;
  } | null;
  optimization_score: number;
  controllers_involved: string[];
  state_version: number;
  computation_time_ms: number;
  timestamp: number;
  committed: boolean;
  predictive_advisory?: {
    cell_id: string;
    cycle: number;
    ml_enabled: boolean;
    model_loaded: boolean;
    fallback_mode?: boolean;
    current_activity_index: number;
    predicted_activity_index: number;
    trend_delta: number;
    predicted_trend: 'SURGE' | 'STABLE' | 'DECLINE';
    is_surge_predicted: boolean;
    is_premature_power_cut: boolean;
    advisory_signal: string;
    explanation: string;
    unit: string;
  } | null;
  decision_intelligence?: DecisionIntelligenceAudit | null;
}

export interface MLStatus {
  ml_enabled: boolean;
  model_loaded: boolean;
  model_mode?: string | null;
  feature_count: number;
  units: string;
  cache_entries: number;
  status_message: string;
}

export interface CellAdvisoryItem {
  cell_id: string;
  cycle: number;
  current_activity_index: number;
  predicted_activity_index: number;
  trend_delta: number;
  predicted_trend: string;
  is_surge_predicted: boolean;
  is_premature_power_cut: boolean;
  advisory_signal: string;
  explanation: string;
  unit: string;
}

export interface PolicyMetric {
  name: string;
  coverage_pct: number;
  total_energy: number;
  avg_sinr_db: number;
  min_sinr_db: number;
  interference: number;
  safety_violations: number;
  control_reversals: number;
  median_latency_ms: number;
}

export interface BenchmarkComparison {
  policies: {
    no_referee: PolicyMetric;
    fixed_priority: PolicyMetric;
    ranguard: PolicyMetric;
  };
  cycles_evaluated: number;
  seed: number;
}

export interface SurrogatePrediction {
  candidate_id: string;
  target_cell: string;
  predicted_coverage_delta: number;
  predicted_coverage_pct: number;
  predicted_interference_delta: number;
  predicted_interference: number;
  predicted_energy_delta: number;
  predicted_total_energy: number;
  predicted_is_safe: boolean;
  safety_risk_score: number;
  surrogate_objective_score: number;
  prediction_latency_ms: number;
  prediction_timestamp: number;
  model_version: string;
  data_provenance: string;
}

export interface CandidateTwinVerification {
  candidate_id: string;
  actual_coverage_delta: number;
  actual_coverage_pct: number;
  actual_interference_delta: number;
  actual_interference: number;
  actual_energy_delta: number;
  actual_total_energy: number;
  actual_is_safe: boolean;
  violated_constraints: string[];
  actual_objective_score: number;
  verification_latency_ms: number;
  verification_timestamp: number;
}

export interface PredictionVerificationPair {
  candidate_id: string;
  description: string;
  target_cell: string;
  action_type: string;
  prediction: SurrogatePrediction;
  verification: CandidateTwinVerification;
  coverage_error_abs: number;
  interference_error_abs: number;
  safety_classification_match: boolean;
  is_false_negative_risk: boolean;
  arbitration_phase: string;
}

export interface DecisionIntelligenceAudit {
  cycle: number;
  decision_id: string;
  timestamp: number;
  total_candidates_screened: number;
  ml_inference_total_ms: number;
  twin_verification_total_ms: number;
  candidate_comparisons: PredictionVerificationPair[];
  top_predicted_candidate_id: string;
  top_verified_candidate_id: string;
  ranking_concordance: boolean;
  mean_coverage_error: number;
  mean_interference_error: number;
  unsafe_candidates_flagged: number;
  false_negatives_count: number;
  status: string;
}

