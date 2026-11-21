import defaultNetworkJson from './defaultNetworkData.json';
import defaultBenchmarkJson from './defaultBenchmarkData.json';
import { NetworkState, ControllerCommand, RefereeDecision, BenchmarkComparison } from '../types';

export const DEFAULT_NETWORK_STATE: NetworkState = defaultNetworkJson.networkState as unknown as NetworkState;
export const DEFAULT_COMMANDS: ControllerCommand[] = defaultNetworkJson.commands as unknown as ControllerCommand[];
export const DEFAULT_DECISION: RefereeDecision = defaultNetworkJson.decision as unknown as RefereeDecision;
export const DEFAULT_BENCHMARK: BenchmarkComparison = defaultBenchmarkJson as unknown as BenchmarkComparison;
