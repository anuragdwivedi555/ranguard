import axios from 'axios';
import {
  NetworkState,
  NetworkMetrics,
  ControllerCommand,
  RefereeDecision,
  BenchmarkComparison,
  MLStatus,
  CellAdvisoryItem,
} from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export const api = {
  // Health
  checkHealth: async () => {
    const res = await client.get('/health');
    return res.data;
  },

  // Network State and Metrics
  getNetworkState: async (): Promise<NetworkState> => {
    const res = await client.get('/network/state');
    return res.data;
  },

  getMetrics: async (): Promise<NetworkMetrics> => {
    const res = await client.get('/network/metrics');
    return res.data;
  },

  resetSimulation: async (seed: number = 42): Promise<NetworkMetrics> => {
    const res = await client.post('/simulation/reset', { seed });
    return res.data;
  },

  stepSimulation: async (): Promise<{ cycle: number; state_version: number; metrics: NetworkMetrics }> => {
    const res = await client.post('/simulation/step');
    return res.data;
  },

  // Controllers
  getControllerCommands: async (): Promise<ControllerCommand[]> => {
    const res = await client.get('/controllers/commands');
    return res.data;
  },

  // Referee
  evaluateProposals: async (commands: ControllerCommand[]): Promise<RefereeDecision> => {
    const res = await client.post('/referee/evaluate', { commands });
    return res.data;
  },

  commitDecision: async (decision: RefereeDecision): Promise<{ success: boolean; message: string; metrics: NetworkMetrics }> => {
    const res = await client.post('/referee/commit', { decision });
    return res.data;
  },

  getRefereeHistory: async (limit: number = 20): Promise<RefereeDecision[]> => {
    const res = await client.get(`/referee/history?limit=${limit}`);
    return res.data;
  },

  // Scenarios
  runScenario: async (scenario: 'CELL_SHUTDOWN' | 'TRAFFIC_SPIKE' | 'PING_PONG'): Promise<any> => {
    const res = await client.post('/scenarios/run', { scenario });
    return res.data;
  },

  // Benchmark comparison
  runBenchmarkComparison: async (seed: number = 42, cycles: number = 4): Promise<BenchmarkComparison> => {
    const res = await client.post('/comparison/run', { seed, cycles });
    return res.data;
  },

  // ML Traffic Advisory
  getMLStatus: async (): Promise<MLStatus> => {
    const res = await client.get('/ml/status');
    return res.data;
  },

  toggleML: async (enabled: boolean): Promise<MLStatus> => {
    const res = await client.post('/ml/toggle', { enabled });
    return res.data;
  },

  getCellAdvisories: async (): Promise<CellAdvisoryItem[]> => {
    const res = await client.get('/ml/advisories');
    return res.data;
  },
};
