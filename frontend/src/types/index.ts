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
