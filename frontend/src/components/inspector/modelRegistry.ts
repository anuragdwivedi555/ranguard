export interface MathModelDoc {
  id: string;
  title: string;
  shortDescription: string;
  category: 'RF & Propagation' | 'Energy & Physics' | 'Safety & Guardrails' | 'Shadow Simulation' | 'Interference';
  implementationFile: string;
  functionSignature: string;
  formulaLatex: string;
  variables: Array<{
    symbol: string;
    latex: string;
    name: string;
    unit: string;
    description: string;
  }>;
  workedExample: {
    scenario: string;
    inputs: Record<string, string>;
    steps: Array<{
      stepTitle: string;
      stepFormula: string;
      stepResult: string;
      stepExplanation: string;
    }>;
    finalResult: string;
  };
  keyTakeaway: string;
}

export const MATHEMATICAL_MODELS: MathModelDoc[] = [
  {
    id: 'dbm-to-watt',
    title: 'dBm-to-Watt RF Power Conversion',
    shortDescription: 'Logarithmic RF power conversion to linear Watts and milliwatts for electromagnetic field summation.',
    category: 'RF & Propagation',
    implementationFile: 'backend/app/simulation/signal_model.py',
    functionSignature: 'SignalModel.dbm_to_mw(power_dbm: float) -> float',
    formulaLatex: `\\begin{aligned}
P_{\\text{mW}} &= 10^{\\frac{P_{\\text{dBm}}}{10}} \\\\[6pt]
P_{\\text{W}} &= 10^{\\frac{P_{\\text{dBm}} - 30}{10}} = \\frac{P_{\\text{mW}}}{1000} \\\\[6pt]
P_{\\text{dBm}} &= 10 \\cdot \\log_{10}(P_{\\text{mW}}) = 30 + 10 \\cdot \\log_{10}(P_{\\text{W}})
\\end{aligned}`,
    variables: [
      {
        symbol: 'P_dBm',
        latex: 'P_{\\text{dBm}}',
        name: 'Power in Decibel-Milliwatts',
        unit: 'dBm',
        description: 'Logarithmic ratio of radio frequency power relative to 1 milliwatt.',
      },
      {
        symbol: 'P_mW',
        latex: 'P_{\\text{mW}}',
        name: 'Linear Power in Milliwatts',
        unit: 'mW',
        description: 'Absolute radiant RF power in milliwatts, required for linear signal superposition.',
      },
      {
        symbol: 'P_W',
        latex: 'P_{\\text{W}}',
        name: 'Linear Power in Watts',
        unit: 'W',
        description: 'Base SI unit of radiant RF power for base station amplifier energy consumption.',
      },
    ],
    workedExample: {
      scenario: 'Converting Cell 02 standard transmit power (38.0 dBm) to linear electrical RF watts.',
      inputs: {
        'P_dBm': '38.0 dBm',
      },
      steps: [
        {
          stepTitle: 'Step 1: Compute the base-10 logarithmic exponent',
          stepFormula: '\\text{exponent} = \\frac{38.0 - 30.0}{10} = \\frac{8.0}{10} = 0.8',
          stepResult: '0.8',
          stepExplanation: 'Subtract 30 dBm to shift from milliwatts reference to 1 Watt reference, then divide by 10.',
        },
        {
          stepTitle: 'Step 2: Calculate linear power in Watts',
          stepFormula: 'P_{\\text{W}} = 10^{0.8} = 6.30957\\dots',
          stepResult: '6.310 W',
          stepExplanation: 'Evaluating 10 raised to the 0.8 power yields 6.310 Watts of radiated RF power.',
        },
        {
          stepTitle: 'Step 3: Calculate linear milliwatts equivalent',
          stepFormula: 'P_{\\text{mW}} = 6.30957 \\times 1000 = 6309.57',
          stepResult: '6309.57 mW',
          stepExplanation: 'Multiplying by 1000 yields the linear milliwatt value used in the SINR denominator.',
        },
      ],
      finalResult: '38.0 dBm = 6.310 W = 6,309.57 mW',
    },
    keyTakeaway: 'Decibels are logarithmic: a 3 dB increase doubles radiated power, while a 10 dB drop reduces power by 90%.',
  },
  {
    id: 'sinr-propagation',
    title: 'SINR & 3GPP Macro Urban Propagation',
    shortDescription: 'Deterministic 3GPP TR 36.814 path loss and multi-cell interference summation for receiver SINR.',
    category: 'RF & Propagation',
    implementationFile: 'backend/app/simulation/interference_model.py',
    functionSignature: 'InterferenceModel.calculate_user_sinr(user, cells) -> (rsrp, sinr, interference)',
    formulaLatex: `\\begin{aligned}
PL(d) &= 128.1 + 37.6 \\cdot \\log_{10}(d_{\\text{km}}), \\quad d_{\\text{km}} = \\frac{\\max(d, 35\\text{ m})}{1000} \\\\[6pt]
RSRP_i &= P_{\\text{tx}, i} - PL(d_i) \\quad [\\text{dBm}] \\\\[6pt]
S_{\\text{mW}} &= 10^{\\frac{RSRP_{\\text{serving}}}{10}} \\\\[6pt]
I_{\\text{mW}} &= \\sum_{j \\neq \\text{serving}, \\text{active}} 10^{\\frac{RSRP_j}{10}} \\\\[6pt]
N_{\\text{mW}} &= 10^{\\frac{N_0}{10}} \\quad [N_0 = -104.0\\text{ dBm} \\implies N \\approx 3.981 \\times 10^{-11}\\text{ mW}] \\\\[6pt]
\\text{SINR}_{\\text{dB}} &= 10 \\cdot \\log_{10}\\left(\\frac{S_{\\text{mW}}}{I_{\\text{mW}} + N_{\\text{mW}}}\\right)
\\end{aligned}`,
    variables: [
      {
        symbol: 'd',
        latex: 'd',
        name: 'Euclidean Distance',
        unit: 'meters (m)',
        description: 'Direct distance between user device (x, y) and cell site (x, y), clamped to 35m minimum.',
      },
      {
        symbol: 'PL(d)',
        latex: 'PL(d)',
        name: '3GPP Path Loss',
        unit: 'dB',
        description: 'Macro Urban radio propagation attenuation over carrier frequency 2.0 GHz (TR 36.814).',
      },
      {
        symbol: 'RSRP',
        latex: 'RSRP',
        name: 'Reference Signal Received Power',
        unit: 'dBm',
        description: 'Power of the LTE/5G reference signals received across the channel bandwidth.',
      },
      {
        symbol: 'I_mW',
        latex: 'I_{\\text{mW}}',
        name: 'Co-Channel Interference',
        unit: 'mW',
        description: 'Linear sum of power received from all non-serving active base stations.',
      },
      {
        symbol: 'N_0',
        latex: 'N_0',
        name: 'Thermal Noise Floor',
        unit: 'dBm',
        description: 'Johnson-Nyquist thermal noise over 10 MHz channel bandwidth (-104.0 dBm).',
      },
      {
        symbol: 'SINR',
        latex: '\\text{SINR}',
        name: 'Signal to Interference plus Noise Ratio',
        unit: 'dB',
        description: 'Spectral efficiency metric determining user throughput and connection stability.',
      },
    ],
    workedExample: {
      scenario: 'User at (1150, 650) connected to CELL_02 at distance 150m, with CELL_05 interfering at 850m.',
      inputs: {
        'Serving Cell': 'CELL_02 (P_tx = 38.0 dBm, d = 150 m = 0.15 km)',
        'Interfering Cell': 'CELL_05 (P_tx = 38.0 dBm, d = 850 m = 0.85 km)',
        'Noise Floor': 'N_0 = -104.0 dBm',
      },
      steps: [
        {
          stepTitle: 'Step 1: Compute 3GPP Path Loss for serving cell',
          stepFormula: 'PL(0.15) = 128.1 + 37.6 \\log_{10}(0.15) = 128.1 + 37.6(-0.8239) = 128.1 - 30.98 = 97.12\\text{ dB}',
          stepResult: '97.12 dB',
          stepExplanation: 'Path loss over 150 meters in urban macro environment.',
        },
        {
          stepTitle: 'Step 2: Compute serving RSRP and linear signal power',
          stepFormula: 'RSRP_1 = 38.0 - 97.12 = -59.12\\text{ dBm} \\implies S_{\\text{mW}} = 10^{-5.912} = 1.225 \\times 10^{-6}\\text{ mW}',
          stepResult: '1.225 × 10⁻⁶ mW',
          stepExplanation: 'Received signal power from the serving cell.',
        },
        {
          stepTitle: 'Step 3: Compute interfering cell path loss and interference power',
          stepFormula: 'PL(0.85) = 128.1 + 37.6 \\log_{10}(0.85) = 128.1 - 2.65 = 125.45\\text{ dB} \\implies RSRP_2 = 38.0 - 125.45 = -87.45\\text{ dBm} \\implies I = 1.799 \\times 10^{-9}\\text{ mW}',
          stepResult: '1.799 × 10⁻⁹ mW',
          stepExplanation: 'Linear interference power radiated from neighboring base station.',
        },
        {
          stepTitle: 'Step 4: Compute SINR ratio and convert to decibels',
          stepFormula: '\\text{SINR} = 10 \\log_{10}\\left(\\frac{1.225 \\times 10^{-6}}{1.799 \\times 10^{-9} + 3.981 \\times 10^{-11}}\\right) = 10 \\log_{10}(666.2) = 28.24\\text{ dB}',
          stepResult: '+28.24 dB',
          stepExplanation: 'Excellent link quality, well above minimum 0.0 dB adequate threshold.',
        },
      ],
      finalResult: 'RSRP = -59.12 dBm, Interference = 1.80 × 10⁻⁹ mW, SINR = +28.24 dB',
    },
    keyTakeaway: 'In dense cellular grids, co-channel interference I typically exceeds thermal noise N by 10 to 40 dB.',
  },
  {
    id: 'coverage-guardrails',
    title: 'Coverage Constraints & Safety Guardrails',
    shortDescription: 'Non-negotiable hard constraints protecting network coverage, RF power limits, and link stability.',
    category: 'Safety & Guardrails',
    implementationFile: 'backend/app/referee/guardrails.py',
    functionSignature: 'SafetyGuardrails.validate_candidate(predicted_metrics, current_cells, proposed_actions) -> (bool, list)',
    formulaLatex: `\\begin{aligned}
\\mathcal{C}_{\\text{pred}} &= \\frac{|\\{u \\in U \\mid u.\\text{rsrp\\_dbm} \\ge -95.0 \\land u.\\text{sinr\\_db} \\ge 0.0\\}|}{|U|} \\times 100\\% \\ge 95.0\\% \\\\[6pt]
P_{\\text{min}, i} &\\le P_{\\text{tx}, i}^{\\text{proposed}} \\le P_{\\text{max}, i} \\quad [10.0\\text{ dBm} \\le P_{\\text{tx}} \\le 46.0\\text{ dBm}] \\\\[6pt]
\\Delta P_i &= |P_{\\text{tx}, i}^{\\text{proposed}} - P_{\\text{tx}, i}^{\\text{curr}}| \\le \\Delta P_{\\text{max}} = 6.0\\text{ dB/cycle} \\\\[6pt]
\\min_{u \\in U_{\\text{conn}}} &\\text{SINR}_u \\ge -5.0\\text{ dB} \\\\[6pt]
E_{\\text{total}} &\\ge 0.0
\\end{aligned}`,
    variables: [
      {
        symbol: 'C_pred',
        latex: '\\mathcal{C}_{\\text{pred}}',
        name: 'Predicted Coverage Percentage',
        unit: '%',
        description: 'Fraction of user devices receiving adequate RSRP (>= -95 dBm) and SINR (>= 0.0 dB).',
      },
      {
        symbol: 'C_min',
        latex: '\\mathcal{C}_{\\text{min}}',
        name: 'Minimum Safe Coverage Threshold',
        unit: '% (95.0%)',
        description: 'Hard SLA constraint. Any action causing coverage < 95% is instantly disqualified.',
      },
      {
        symbol: 'Delta_P_max',
        latex: '\\Delta P_{\\text{max}}',
        name: 'Maximum Power Step',
        unit: 'dB (6.0 dB)',
        description: 'Prevents rapid RF power swings that trigger cell breathing instability and handoff storms.',
      },
      {
        symbol: 'P_min, P_max',
        latex: 'P_{\\text{min}}, P_{\\text{max}}',
        name: 'Hardware Tx Power Limits',
        unit: 'dBm',
        description: 'Radio hardware amplifier linear operating boundaries [10.0 dBm, 46.0 dBm].',
      },
    ],
    workedExample: {
      scenario: 'Energy Controller proposes shutting down CELL_03 to reduce power consumption.',
      inputs: {
        'Action': 'SHUTDOWN on CELL_03 (current power 38.0 dBm)',
        'Total Users': '100 users',
        'Current Coverage': '98.0%',
      },
      steps: [
        {
          stepTitle: 'Step 1: Shadow simulator computes hypothetical user re-association',
          stepFormula: '\\text{Users formerly served by CELL\\_03} = 15 \\implies \\text{Handoff to CELL\\_02 and CELL\\_06}',
          stepResult: '15 users re-assigned',
          stepExplanation: 'Users must connect to further base stations with higher path loss.',
        },
        {
          stepTitle: 'Step 2: Evaluate received signal strength on edge users',
          stepFormula: 'RSRP_{\\text{new}} \\text{ for 8 edge users} = -98.2\\text{ dBm} < -95.0\\text{ dBm}',
          stepResult: '8 users drop below threshold',
          stepExplanation: '8 users fall into coverage dead zones.',
        },
        {
          stepTitle: 'Step 3: Calculate predicted coverage percentage',
          stepFormula: '\\mathcal{C}_{\\text{pred}} = \\frac{100 - 12}{100} \\times 100\\% = 88.0\\%',
          stepResult: '88.0%',
          stepExplanation: 'Coverage falls from 98% to 88%.',
        },
        {
          stepTitle: 'Step 4: Guardrail evaluation against hard SLA',
          stepFormula: '88.0\\% < 95.0\\% \\implies \\text{GUARDRAIL BREACH: Hard Coverage Threshold Violated}',
          stepResult: 'DISQUALIFIED (Score = -999.0)',
          stepExplanation: 'SafetyGuardrails flags is_safe: False and drops the candidate from arbitration.',
        },
      ],
      finalResult: 'Candidate REJECTED — Preserves 98.0% live network coverage SLA.',
    },
    keyTakeaway: 'Guardrails act as a hard mathematical sieve: no optimization objective can override a safety violation.',
  },
  {
    id: 'electrical-power',
    title: 'Base Station Electrical Power & Energy Model',
    shortDescription: 'Multi-component power consumption accounting for static baseband circuits and RF amplifier efficiency.',
    category: 'Energy & Physics',
    implementationFile: 'backend/app/simulation/energy_model.py',
    functionSignature: 'EnergyModel.calculate_cell_energy(cell: Cell) -> float',
    formulaLatex: `\\begin{aligned}
E_{\\text{cell}} &= \\begin{cases}
0.0, & \\text{status} \\in \\{\\text{SHUTDOWN}, \\text{INACTIVE}\\} \\\\[4pt]
E_{\\text{sleep}} = 2.0, & \\text{status} = \\text{SLEEP} \\\\[4pt]
E_{\\text{static}} + \\eta_{\\text{RF}} \\cdot 10^{\\frac{P_{\\text{tx}} - 30}{10}}, & \\text{status} = \\text{ACTIVE}
\\end{cases} \\\\[8pt]
E_{\\text{total}} &= \\sum_{c \\in \\text{Cells}} E_{\\text{cell}}(c) \\\\[6pt]
E_{\\text{Joules}}(t) &= E_{\\text{total}} \\cdot \\Delta t \\quad [\\Delta t = 10.0\\text{ s}], \\quad E_{\\text{Wh}} = \\frac{E_{\\text{Joules}}}{3600}
\\end{aligned}`,
    variables: [
      {
        symbol: 'E_static',
        latex: 'E_{\\text{static}}',
        name: 'Static Base Energy',
        unit: 'units (10.0)',
        description: 'Fixed power drawn by digital baseband processors, FPGA, power supplies, and cooling fans.',
      },
      {
        symbol: 'eta_RF',
        latex: '\\eta_{\\text{RF}}',
        name: 'RF Efficiency Factor',
        unit: 'scalar (0.5)',
        description: 'Power amplifier conversion factor modeling drain efficiency and feeder losses.',
      },
      {
        symbol: 'E_sleep',
        latex: 'E_{\\text{sleep}}',
        name: 'Micro-Sleep Mode Power',
        unit: 'units (2.0)',
        description: 'Low-power standby state where RF chains are unpowered while retaining control signaling.',
      },
      {
        symbol: 'P_tx',
        latex: 'P_{\\text{tx}}',
        name: 'Transmit Power',
        unit: 'dBm',
        description: 'Configured radio carrier transmission power.',
      },
      {
        symbol: 'E_total',
        latex: 'E_{\\text{total}}',
        name: 'Network Normalized Energy',
        unit: 'units',
        description: 'Instantaneous total energy consumption across all 6 base station cells.',
      },
    ],
    workedExample: {
      scenario: 'Comparing network power with 6 active cells at 38.0 dBm vs putting 1 underutilized cell into SLEEP mode.',
      inputs: {
        'Active Cells': '6 cells at P_tx = 38.0 dBm',
        'Static Energy': '10.0 units',
        'Sleep Energy': '2.0 units',
        'RF Factor': '0.5',
      },
      steps: [
        {
          stepTitle: 'Step 1: Calculate single active cell energy consumption',
          stepFormula: 'E_{\\text{active}} = 10.0 + 0.5 \\cdot 10^{\\frac{38 - 30}{10}} = 10.0 + 0.5 \\cdot 6.3096 = 10.0 + 3.155 = 13.155\\text{ units}',
          stepResult: '13.155 units/cell',
          stepExplanation: 'Static electronics contribute 10.0 units; RF amplifier adds 3.155 units.',
        },
        {
          stepTitle: 'Step 2: Calculate total baseline energy for all 6 cells',
          stepFormula: 'E_{\\text{total, base}} = 6 \\times 13.155 = 78.930\\text{ units}',
          stepResult: '78.930 units',
          stepExplanation: 'Full baseline operational power across the grid.',
        },
        {
          stepTitle: 'Step 3: Calculate energy with Cell 06 in SLEEP mode',
          stepFormula: 'E_{\\text{total, sleep}} = 5 \\times 13.155 + 2.0 = 65.775 + 2.0 = 67.775\\text{ units}',
          stepResult: '67.775 units',
          stepExplanation: 'Cell 06 draws only 2.0 units instead of 13.155 units.',
        },
        {
          stepTitle: 'Step 4: Compute percentage energy savings',
          stepFormula: '\\Delta E\\% = \\frac{78.930 - 67.775}{78.930} \\times 100\\% = \\frac{11.155}{78.930} \\times 100\\% = 14.13\\%',
          stepResult: '-14.13% Energy Savings',
          stepExplanation: 'Micro-sleep saves 14.1% network power with zero hardware modifications.',
        },
      ],
      finalResult: 'Baseline = 78.93 units | With Micro-Sleep = 67.78 units (-14.1% power reduction)',
    },
    keyTakeaway: 'Because baseband power (10.0) dominates over pure RF power (3.15), putting unused sectors into sleep produces substantial savings.',
  },
  {
    id: 'shadow-simulation',
    title: 'Shadow Simulation & Multi-Objective Arbitration',
    shortDescription: 'Virtual digital twin candidate projection and normalized multi-objective scalarization function.',
    category: 'Shadow Simulation',
    implementationFile: 'backend/app/referee/shadow_simulator.py & optimizer.py',
    functionSignature: 'ObjectiveOptimizer.score_candidates(candidates, baseline_metrics, current_cells) -> list',
    formulaLatex: `\\begin{aligned}
\\mathcal{S}^{(k)} &= \\text{clone}(\\mathcal{S}_{\\text{live}}) \\oplus \\vec{a}_k \\implies \\text{Metrics}^{(k)} = \\mathcal{M}(\\mathcal{S}^{(k)}) \\\\[6pt]
J(\\vec{a}_k) &= w_E S_E + w_I S_I + w_C S_C + w_M S_M \\\\[4pt]
&\\quad [w_E = 0.30, \\; w_I = 0.25, \\; w_C = 0.25, \\; w_M = 0.20] \\\\[6pt]
S_E &= \\text{clip}\\left(2.0 \\cdot \\frac{E_{\\text{base}} - E_{\\text{pred}}}{E_{\\text{base}}}, -1.0, 1.0\\right) \\\\[4pt]
S_I &= \\text{clip}\\left(1.5 \\cdot \\frac{I_{\\text{base}} - I_{\\text{pred}}}{I_{\\text{base}}}, -1.0, 1.0\\right) \\\\[4pt]
S_C &= \\text{clip}\\left(\\frac{\\mathcal{C}_{\\text{pred}} - \\mathcal{C}_{\\text{base}}}{5.0} + \\frac{\\mathcal{C}_{\\text{pred}} - 95.0}{5.0}, -1.0, 1.0\\right) \\\\[4pt]
S_M &= \\text{clip}\\left(1.0 - \\frac{\\sum |\\Delta P_i|}{10.0}, -1.0, 1.0\\right)
\\end{aligned}`,
    variables: [
      {
        symbol: 'J(a_k)',
        latex: 'J(\\vec{a}_k)',
        name: 'Total Objective Score',
        unit: 'score in [-1.0, 1.0]',
        description: 'Multi-objective Pareto fitness score. The highest scoring safe candidate is selected.',
      },
      {
        symbol: 'S_E',
        latex: 'S_E',
        name: 'Energy Improvement Score',
        unit: 'score in [-1.0, 1.0]',
        description: 'Normalized energy savings relative to baseline (weight 0.30).',
      },
      {
        symbol: 'S_I',
        latex: 'S_I',
        name: 'Interference Reduction Score',
        unit: 'score in [-1.0, 1.0]',
        description: 'Normalized inter-cell radiated interference reduction (weight 0.25).',
      },
      {
        symbol: 'S_C',
        latex: 'S_C',
        name: 'Coverage Maintenance Score',
        unit: 'score in [-1.0, 1.0]',
        description: 'Coverage retention and distance above the 95% safety floor (weight 0.25).',
      },
      {
        symbol: 'S_M',
        latex: 'S_M',
        name: 'Minimum Action Magnitude Score',
        unit: 'score in [-1.0, 1.0]',
        description: 'Hysteresis penalty discouraging unnecessary power perturbations (weight 0.20).',
      },
    ],
    workedExample: {
      scenario: 'Evaluating Candidate 3 (Pareto Compromise: trim Cell 02 by -2 dBm, boost Cell 01 by +1 dBm).',
      inputs: {
        'Baseline': 'E = 78.9, I = 42.0, Coverage = 98.0%',
        'Predicted Candidate 3': 'E = 72.5, I = 36.8, Coverage = 97.5%, Total Delta = 3.0 dB',
        'Weights': 'w_E = 0.30, w_I = 0.25, w_C = 0.25, w_M = 0.20',
      },
      steps: [
        {
          stepTitle: 'Step 1: Calculate Energy Score S_E',
          stepFormula: 'S_E = 2.0 \\cdot \\frac{78.9 - 72.5}{78.9} = 2.0 \\cdot \\frac{6.4}{78.9} = 2.0 \\cdot 0.0811 = +0.1622',
          stepResult: '+0.1622',
          stepExplanation: 'Energy reduced by 8.11%, yielding a positive energy sub-score.',
        },
        {
          stepTitle: 'Step 2: Calculate Interference Score S_I',
          stepFormula: 'S_I = 1.5 \\cdot \\frac{42.0 - 36.8}{42.0} = 1.5 \\cdot \\frac{5.2}{42.0} = 1.5 \\cdot 0.1238 = +0.1857',
          stepResult: '+0.1857',
          stepExplanation: 'Interference dropped by 12.38%, improving neighbor SINR.',
        },
        {
          stepTitle: 'Step 3: Calculate Coverage Score S_C',
          stepFormula: 'S_C = \\frac{97.5 - 98.0}{5.0} + \\frac{97.5 - 95.0}{5.0} = \\frac{-0.5}{5.0} + \\frac{2.5}{5.0} = -0.10 + 0.50 = +0.4000',
          stepResult: '+0.4000',
          stepExplanation: 'Coverage has safe 2.5% buffer above 95% threshold.',
        },
        {
          stepTitle: 'Step 4: Calculate Magnitude Score S_M',
          stepFormula: 'S_M = 1.0 - \\frac{3.0}{10.0} = +0.7000',
          stepResult: '+0.7000',
          stepExplanation: 'Small aggregate change (3 dB) incurs minimal stability penalty.',
        },
        {
          stepTitle: 'Step 5: Compute weighted objective score J',
          stepFormula: 'J = 0.30(0.1622) + 0.25(0.1857) + 0.25(0.4000) + 0.20(0.7000) = 0.0487 + 0.0464 + 0.1000 + 0.1400 = 0.3351',
          stepResult: 'J = +0.3351',
          stepExplanation: 'Positive score demonstrates clear Pareto improvement over baseline.',
        },
      ],
      finalResult: 'Objective Score J = +0.3351 | Action Verdict: APPROVE / MODIFY (Selected for Live Commit)',
    },
    keyTakeaway: 'RANGUARD evaluates all candidate permutations in an isolated shadow snapshot, preventing physical radio oscillation.',
  },
  {
    id: 'interference-matrix',
    title: 'Inter-Cell Radiated Interference Index',
    shortDescription: 'Spatial interference coupling across neighboring base stations scaled to normalized emission indices.',
    category: 'Interference',
    implementationFile: 'backend/app/simulation/interference_model.py',
    functionSignature: 'InterferenceModel.calculate_cell_interference_matrix(cells) -> dict',
    formulaLatex: `\\begin{aligned}
\\text{Rad}_{i \\to j} &= 10^{\\frac{RSRP(P_{\\text{tx}, i}, \\text{dist}(c_i, c_j)) + 100.0}{10}} \\\\[6pt]
\\mathcal{I}_i &= \\sum_{j \\in \\text{Neighbors}(i), \\text{active}} \\text{Rad}_{i \\to j} \\\\[6pt]
\\mathcal{I}_{\\text{total}} &= \\sum_{c_i \\in \\text{Cells}} \\mathcal{I}_i
\\end{aligned}`,
    variables: [
      {
        symbol: 'Rad_i_to_j',
        latex: '\\text{Rad}_{i \\to j}',
        name: 'Radiated Interference Index',
        unit: 'index units',
        description: 'Normalized radio energy delivered by cell i into the primary coverage basin of neighbor j.',
      },
      {
        symbol: 'I_i',
        latex: '\\mathcal{I}_i',
        name: 'Cell Total Interference Caused',
        unit: 'index units',
        description: 'Aggregated cross-cell pollution produced by cell i towards all adjacent sectors.',
      },
      {
        symbol: 'dist(c_i, c_j)',
        latex: '\\text{dist}(c_i, c_j)',
        name: 'Inter-Site Distance (ISD)',
        unit: 'meters (m)',
        description: 'Physical separation distance between base station towers.',
      },
    ],
    workedExample: {
      scenario: 'Calculating interference caused by Cell 02 (1150, 500) to its 5 neighbors at distance ~800m.',
      inputs: {
        'Cell 02 Tx Power': '38.0 dBm',
        'Average Neighbor Distance': '800 m (0.8 km)',
        'Active Neighbors': '5 cells',
      },
      steps: [
        {
          stepTitle: 'Step 1: Compute path loss to neighbor tower',
          stepFormula: 'PL(0.8) = 128.1 + 37.6 \\log_{10}(0.8) = 128.1 - 3.64 = 124.46\\text{ dB}',
          stepResult: '124.46 dB',
          stepExplanation: 'Attenuation at neighbor position.',
        },
        {
          stepTitle: 'Step 2: Calculate received power at neighbor location',
          stepFormula: 'RSRP = 38.0 - 124.46 = -86.46\\text{ dBm}',
          stepResult: '-86.46 dBm',
          stepExplanation: 'Interference signal strength.',
        },
        {
          stepTitle: 'Step 3: Compute normalized scaled index per neighbor',
          stepFormula: '\\text{Rad} = 10^{\\frac{-86.46 + 100.0}{10}} = 10^{1.354} = 22.60',
          stepResult: '22.60 units/neighbor',
          stepExplanation: 'Normalized interference index.',
        },
        {
          stepTitle: 'Step 4: Sum across active neighbors',
          stepFormula: '\\mathcal{I}_{\\text{CELL\\_02}} = 5 \\times 22.60 = 113.00',
          stepResult: '113.0 index units',
          stepExplanation: 'Elevated index triggers the Interference Controller to propose power trimming.',
        },
      ],
      finalResult: 'Total Cell Interference = 113.0 units -> Prompts targeted -3 dBm trimming.',
    },
    keyTakeaway: 'Central cells like CELL_02 radiate into multiple adjacent cells simultaneously, making them the primary source of network conflicts.',
  },
];
