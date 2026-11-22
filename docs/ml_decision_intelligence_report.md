# RANGUARD — Advanced Machine Learning Decision Intelligence Report
## Final Hardening & Empirical Validation Report

**Document Version:** 2.0.0 (Hardened Production Release)  
**Verification Date:** November 21, 2026  
**Engineering Team:** Antigravity AI Engineering / Team Arigato Algorithms  
**Active Worktree:** `ranguard-ml-showcase`  
**Active Branch:** `feat/ml-showcase`  
**Core Architectural Paradigm:**  
$$\mathbf{AI\ PREDICTS} \longrightarrow \mathbf{DIGITAL\ TWIN\ VERIFIES} \longrightarrow \mathbf{REFEREE\ DECIDES}$$

---

## 1. Executive Summary & Hackathon Judge Matrix

Project RANGUARD V1 established an authoritative mobile network conflict-resolution referee, using digital-twin shadow simulation and deterministic safety guardrails to arbitrate conflicting proposals from autonomous RAN controllers (Energy, Coverage, Interference).

In this enhancement, we introduce **Advanced ML Decision Intelligence** — a lightweight predictive surrogate paired with an interactive **AI Risk Lens** explainability suite. Crucially, following rigorous scientific auditing, the enhancement has been hardened to eliminate unnecessary arbitration overhead, correct safety claims, disclose failure modes transparently, and preserve the absolute authority of the Digital Twin.

### Comprehensive Benchmarking & Hardening Matrix

| Evaluation Dimension | Standard V1 RANGUARD (Pure Shadow Twin) | Linear Ridge Baseline | XGBoost Action Surrogate (Ours) | Hardened Empirical Finding / Scientific Evidence |
|---|---|---|---|---|
| **Interference $\Delta$ MAE** | Exact physics simulation ($0.00$) | $30.668$ | **$4.091$** | **$-86.7\%$ error reduction** over Ridge; $R^2 = 0.9898$ |
| **Interference $\Delta$ RMSE** | Exact physics simulation ($0.00$) | $41.463$ | **$6.005$** | Non-linear RF interference summation captured with high precision |
| **Coverage $\Delta$ (%) MAE** | Exact physics simulation ($0.00\%$) | $0.624\%$ | **$0.524\%$** | **$-16.0\%$ error reduction** over Ridge; $R^2 = 0.6655$ |
| **Coverage $\Delta$ (%) RMSE** | Exact physics simulation ($0.00\%$) | $1.191\%$ | **$1.228\%$** | Discrete user dropouts create localized boundary step-errors |
| **Candidate Ranking (Spearman $\rho$)** | Baseline ground truth ($1.0000$) | $0.512$ | **$0.8783$** | Strong global multi-objective ordering across candidate actions |
| **Top-1 Candidate Agreement** | Baseline ground truth ($100\%$) | $12.50\%$ | **$20.00\%$** | Top candidates differ by $<0.02$; **Pruning with ML prohibited** |
| **Safety Violation Precision** | $100\%$ ($0$ false alarms) | $100\%$ | **$100\%$ ($1.0000$)** | Actions flagged unsafe are truly unsafe; zero false positives |
| **Unsafe False Negatives (FN)** | **$0$** (Authoritative Twin) | $193$ ($80.4\%$) | **$216$ ($90.0\%$ FN rate)** | **Proves ML CANNOT replace Digital Twin safety verification** |
| **Single-Action Inference Latency** | N/A | $0.015\text{ ms}$ | **$5.413\text{ ms}$ ($P_{50}$)** / $8.070\text{ ms}$ ($P_{95}$) | Rapid pre-simulation screening capability |
| **Default Arbitration Latency ($P_{50}$)**| **$206.14\text{ ms}$** | N/A | **$206.14\text{ ms}$** (On-Demand Mode) | **$0\text{ ms}$ default overhead**; surrogate runs on-demand |
| **Active AI Risk Lens Latency ($P_{50}$)**| N/A | N/A | **$369.30\text{ ms}$** ($+163.17\text{ ms}$) | Both modes well within O-RAN $1,000\text{ ms}$ Near-RT RIC budget |
| **Worst-Case Latency ($P_{95}$)** | $242.35\text{ ms}$ | N/A | **$458.92\text{ ms}$** (Lens Active) | $P_{95} < 500\text{ ms}$ under all evaluated test workloads |
| **Mean Network Coverage** | **$98.00\%$** | N/A | **$98.00\%$** | Identical ($+0.00\%$) because Twin Referee enforces safety |
| **Safety Violations in Control** | **$0$** | N/A | **$0$** | Hard guardrails strictly active; zero breaches committed |

---

## 2. Hardening Task 1 — On-Demand Execution & Latency Overhead Elimination

### 2.1 The Investigation
In initial prototypes, running the ML surrogate across all candidate action permutations on every arbitration cycle increased median cycle latency from $206.14\text{ ms}$ to $369.30\text{ ms}$ ($+163.17\text{ ms}$, or $+79.2\%$ overhead). Because the referee's final verdict was identical (+0.00% difference in committed actions), imposing this computational overhead unconditionally during background operations was inefficient.

### 2.2 Architectural Solution: On-Demand AI Risk Lens
1. **Default Pure Shadow Twin Execution:** The `DecisionIntelligenceEngine` now defaults to `enabled = False`. During normal background arbitration cycles, RANGUARD executes the pure Digital Twin shadow simulator directly.
2. **On-Demand Activation:** The surrogate pipeline is executed strictly when:
   - The user or judge explicitly toggles AI Risk Lens mode (`POST /api/ml/decision-intelligence/toggle`),
   - An API client passes `enable_ai_risk_lens = True` in `EvaluateRequest`, or
   - The operator inspects candidates in the interactive frontend (`GET /api/ml/decision-intelligence/audit/latest` generates an on-demand audit snapshot).
3. **Deterministic Safety Preservation:** The deterministic safety checks (`SafetyGuardrails`) and multi-objective scoring (`ObjectiveOptimizer`) execute identically regardless of whether the AI Risk Lens is active.

### 2.3 Measured Baseline Before and After (Identical Seed 42 Workload, 25 Cycles)

```
+-------------------------------------------------------------------------------------------------------+
|                                  ON-DEMAND OVERHEAD ELIMINATION BENCHMARK                             |
+------------------------------------+--------------------------+-----------------------+---------------+
| Metric                             | Pure Twin (ML Standby)   | AI Risk Lens Active   | Delta Saved   |
+------------------------------------+--------------------------+-----------------------+---------------+
| Median Latency (P50)               | 206.14 ms                | 369.30 ms             | -163.17 ms    |
| 95th Percentile Latency (P95)      | 242.35 ms                | 458.92 ms             | -216.57 ms    |
| Mean Latency                       | 204.93 ms                | 382.52 ms             | -177.59 ms    |
| Cycle Overhead Percentage          | 0.0% (Baseline)          | +79.2%                | -44.2% saved  |
| Network Control Coverage           | 98.00%                   | 98.00%                | Identical     |
| Safety Violations Committed        | 0                        | 0                     | 0 breaches    |
+------------------------------------+--------------------------+-----------------------+---------------+
```

---

## 3. Hardening Task 2 — Safety Classification Autopsy & Threshold Investigation

### 3.1 The 216 Missed Unsafe Actions (Held-Out Test Set)
On the held-out test set ($N = 1,210$ candidate evaluations, seeds 101–105), the ground-truth digital twin identified $240$ actions that violated the mandatory minimum coverage constraint ($< 95.0\%$).

Using the natural decision threshold ($C_{\text{base}} + \Delta \hat{C} < 95.0\%$):
- **Actual Unsafe Candidates:** $240$
- **True Positives (TP, caught by surrogate):** $24$
- **False Negatives (FN, missed by surrogate):** **$216$**
- **True Negatives (TN, confirmed safe):** $970$
- **False Positives (FP, safe action falsely flagged):** $0$
- **Unsafe-Action Recall:** **$10.00\%$ ($0.1000$)**
- **False-Negative Rate:** **$90.00\%$ ($0.9000$)**
- **Safety Violation Precision:** **$100.00\%$ ($1.0000$)**

### 3.2 Root-Cause Analysis: Continuous Regressors vs Discrete Outage Cliffs
In cellular network physics, mobile user coverage is a discrete step-function: 100 users are distributed across the service area. An action dropping 2 boundary users drops network-wide coverage from $96.0\%$ to $94.0\%$ (an immediate $2.0\%$ step).
The smooth gradient-boosted regression surrogate predicts a smooth delta (e.g. $-1.3\%$), projecting post-action coverage at $94.7\%$ or $95.1\%$. Because $95.1\% \ge 95.0\%$, the surrogate classifies the candidate as "FEASIBLE" when it is actually an illegal outage.

### 3.3 Validation Set Threshold Exploration (Zero Test Leakage)
To investigate whether adjusting the classification decision threshold could recover acceptable recall, a systematic threshold exploration was conducted exclusively on the validation split (Seeds 49–50, $N = 264$ candidates, $56$ actual unsafe):

```
+----------------------------------------------------------------------------------------------------------+
|                              VALIDATION SET DECISION THRESHOLD EXPLORATION (SEEDS 49-50)                 |
+-----------------+---------+---------+---------+---------+-------------+--------------+-------------------+
| Threshold (T %) | TP      | FP      | FN      | TN      | Recall (%)  | Precision (%)| Operational State |
+-----------------+---------+---------+---------+---------+-------------+--------------+-------------------+
| 94.0%           | 16      | 2       | 40      | 206     | 28.6%       | 88.9%        | Dangerous (71% FN)|
| 94.5%           | 20      | 4       | 36      | 204     | 35.7%       | 83.3%        | Dangerous (64% FN)|
| 95.0% (Natural) | 24      | 8       | 32      | 200     | 42.9%       | 75.0%        | High Miss Rate    |
| 95.5%           | 36      | 38      | 20      | 170     | 64.3%       | 48.6%        | 38 False Alarms   |
| 96.0%           | 44      | 104     | 12      | 104     | 78.6%       | 29.7%        | 104 False Alarms  |
| 96.5%           | 52      | 162     | 4       | 46      | 92.9%       | 24.3%        | 162 False Alarms  |
| 97.0%           | 56      | 208     | 0       | 0       | 100.0%      | 21.2%        | All Safe Rejected |
+-----------------+---------+---------+---------+---------+-------------+--------------+-------------------+
```

### 3.4 Conclusive Scientific Finding
> [!CRITICAL]
> **SURROGATES CANNOT AUTONOMOUSLY ENFORCE SAFETY CONSTRAINTS.**
> As demonstrated on validation data:
> - At $T = 95.0\%$, recall is unacceptably low ($42.9\%$), missing 32 unsafe power cuts.
> - Increasing $T$ to $96.0\%$ raises recall to $78.6\%$, but precision collapses from $75.0\%$ to $29.7\%$, generating **104 false alarms** out of 208 safe candidates.
> - Reaching $100\%$ recall ($T = 97.0\%$) falsely flags **every single safe candidate as unsafe** ($FP = 208$).
> 
> **Formal Architectural Conclusion:** All claims that the surrogate can reliably detect unsafe actions have been excised. The surrogate serves strictly as an **advisory pre-screener**. The authoritative Digital Twin shadow simulator remains the sole, non-negotiable verification authority.

---

## 4. Hardening Task 3 — Candidate Ranking Investigation & Pruning Disallowance

### 4.1 The Paradox: Spearman $\rho = 0.8783$ vs Top-1 Agreement $= 20.0\%$
Evaluation on held-out episodes revealed high global rank correlation ($\text{Spearman } \rho = 0.8783$) alongside modest Top-1 match agreement ($20.00\%$).

### 4.2 Investigation & Mathematical Cause
In RANGUARD, candidate generation for a single decision cycle produces 5 to 12 distinct options:
1. `STATUS_QUO` (Maintain current power)
2. `GENTLE_CUT` ($-2\text{ dBm}$ on target cell)
3. `MODERATE_CUT` ($-4\text{ dBm}$ on target cell)
4. `SEVERE_CUT` ($-6\text{ dBm}$ on target cell)
5. `SHUTDOWN` (Deactivate cell)
6. `COMPROMISE` (Balanced power reconciliation)

Across the entire candidate spectrum from best to worst, the multi-objective utility ranges from $+0.85$ down to $-999.0$ (infeasible). XGBoost captures this global slope with high fidelity, correctly ranking gentle cuts higher than catastrophic shutdowns ($\rho = 0.8783$).

However, between the top 2-3 feasible candidates (e.g. `STATUS_QUO` vs `GENTLE_CUT`), their true multi-objective scores differ by less than $\pm 0.02$ points:
$$\text{Score}(\text{GENTLE\_CUT}) = 0.852 \quad \text{vs} \quad \text{Score}(\text{STATUS\_QUO}) = 0.841 \quad (\Delta = 0.011)$$
Because the surrogate's coverage MAE is $\approx 0.524\%$, a minor residual error of $0.2\%$ in predicted coverage delta causes a $\pm 0.02$ score perturbation, inverting the relative ordering of candidate #1 and candidate #2.

### 4.3 Policy Directive: Surrogate Pruning Strictly Disallowed
Because residual error can swap the top two candidates, **the surrogate must NEVER be used to prune candidate actions before twin verification**. Pruning candidate #2 based on surrogate score would risk eliminating the truly optimal network configuration. All generated candidates must be evaluated by the digital twin.

---

## 5. Hardening Task 4 — Generalization Integrity & Out-of-Distribution Guardrails

### 5.1 Leakage Verification
1. **Independent Seed Partitions:**
   - Training Seeds: `[42, 43, 44, 45, 46, 47, 48]` ($N = 1,779$)
   - Validation Seeds: `[49, 50]` ($N = 264$)
   - Held-Out Test Seeds: `[101, 102, 103, 104, 105]` ($N = 1,210$)
   - Zero seed overlap: $\text{Seeds}_{\text{train}} \cap \text{Seeds}_{\text{test}} = \emptyset$.
2. **Causal Pre-Action Isolation:** The 20 input features are captured strictly before candidate actuation is applied to the digital twin.

### 5.2 Out-of-Distribution (OOD) Guardrails
In the interactive prober (`/api/ml/decision-intelligence/predict`), tree-based surrogates cannot reliably extrapolate outside their training domain. The endpoint enforces explicit guardrails:
- **Valid Cell Check:** Target cell must exist in `[CELL_01..CELL_06]`. Unknown cell IDs trigger `out_of_distribution: True`.
- **Power Envelope Check:** Transmit power must lie within $[10.0, 46.0]\text{ dBm}$ (or status `SHUTDOWN`). Inputs outside this range return:
  `"Input parameters outside validated operational envelope [10.0, 46.0 dBm]. Tree surrogate extrapolations are unverified."`
- **Provable Flagging:** Extrapolations are never silently presented as verified predictions.

### 5.3 Data-Source Taxonomy & Non-Physical Disclaimers
To maintain total scientific truthfulness:
- **Historical Milan CDR Data:** Real-world human telecommunications activity from Harvard Dataverse (doi:10.7910/DVN/EGZHFV), aggregated into 10-minute activity index records.
- **Live Simulation Telemetry:** Streamed runtime metrics generated by RANGUARD's deterministic 3GPP TR 36.814 Macro Urban simulation engine.
- **Physical-Network Telemetry:** Clearly documented as **unavailable**; no physical cellular testbed (e.g. POWDER, COSMOS) was connected. Simulated labels are never represented as physical hardware telemetry.

---

## 6. Hardening Task 5 — Performance Claim Corrections

### 6.1 Reconciled Arbitration Latency Figures
Previous drafts cited varying latency figures depending on whether ML was fully batch-evaluated or bypassed:
- **Pure Shadow Twin Referee (Default):** $P_{50} = 206.14\text{ ms}$, $P_{95} = 242.35\text{ ms}$.
- **On-Demand AI Risk Lens Active:** $P_{50} = 369.30\text{ ms}$, $P_{95} = 458.92\text{ ms}$.
- **Standalone XGBoost Inference:** $P_{50} = 5.413\text{ ms}$, $P_{95} = 8.070\text{ ms}$.
- **O-RAN Near-RT RIC Standard Budget:** $1,000\text{ ms}$ ($1.0\text{ s}$).

> [!NOTE]
> **Claim Correction:** While measured $P_{95}$ latency ($458.92\text{ ms}$) is well below $1,000\text{ ms}$, we do **not** claim that "every decision under any arbitrary workload is guaranteed in under 1 second". We report measured empirical percentiles ($P_{50}$ and $P_{95}$) under tested conditions.

### 6.2 Threshold Clarification: 95.0% vs 98.0%
- **$95.0\%$ Minimum Coverage:** The hard, non-negotiable safety guardrail. Any candidate yielding coverage $< 95.0\%$ is declared `INFEASIBLE` and rejected.
- **$98.0\%$ Nominal Target:** The desired operational service objective during standard daytime traffic.

### 6.3 Network Outcome Honesty
Because the ML surrogate is advisory and the Digital Twin referee strictly enforces safety and multi-objective optimization:
- **Network Control Outcomes are Identical ($+0.00\%$ change in coverage, energy, and interference).**
- We do **not** claim the surrogate improves cellular KPI control; its demonstrated value is **instantaneous operator screening, pre-simulation explainability, and transparent multi-objective visualization**.

---

## 7. Hardening Task 6 — Interactive AI Risk Lens Interface

The 3-panel **AI RISK LENS** frontend (`frontend/src/components/AIRiskLens.tsx`) is preserved and fully connected to the hardened backend:

```
+----------------------------------------------------------------------------------------------------+
|                                           AI RISK LENS                                             |
|                      AI PREDICTS  -->  DIGITAL TWIN VERIFIES  -->  REFEREE DECIDES                 |
+-----------------------------------+-----------------------------------+----------------------------+
| PANEL 1: AI PREDICTION            | PANEL 2: DIGITAL TWIN VERIFICATION| PANEL 3: REFEREE DECISION  |
| - Target 1: Predicted Delta Cov   | - Simulator Ground Truth Delta Cov| - Hard Safety Constraints  |
|   e.g. -1.45% (Projected: 95.5%)  |   e.g. -1.00% (Actual: 96.0%)     |   Coverage >= 95.0% (PASS) |
| - Target 2: Predicted Delta Int   | - Simulator Ground Truth Delta Int| - Multi-Objective Pareto   |
|   e.g. -27.55 (Projected: 242.8)  |   e.g. -37.74 (Actual: 232.6)     |   Score J: +0.284          |
| - Deterministic Power Delta:      | - Transparent Prediction Errors:  | - Final Verdict:           |
|   -4.2 W (Exact Physics Formula)  |   Cov Error: 0.45% | Int Err: 10.1|   APPROVE / MODIFY / REJECT|
| - Model: xgb-action-surrogate-v1.0| - Verification Latency: 8.4 ms    | - Authoritative Guarantee: |
| - Data Provenance: Simulated TR   | - Safety Concordance: AGREEMENT   |   Digital Twin verifies    |
|   36.814 (Not physical testbed)   |   (Twin validated safe boundary)  |   before commit.           |
| - Pre-Check: Advisory Screening   | - Ground Truth: Shadow Simulator  | - Hard Guardrail Enforced  |
+-----------------------------------+-----------------------------------+----------------------------+
```

### Key UI Features
1. **On-Demand Mode Toggle:** Allows switching between `AI LENS: ACTIVE` and `AI LENS: STANDBY (PURE SHADOW)` with immediate status reflection.
2. **Side-by-Side Transparent Error Tracking:** For every candidate action, displays exact absolute error in coverage ($\%$) and interference index.
3. **Interactive Action Prober with OOD Banners:** Allows operators to probe any arbitrary cell power setting, surfacing bold amber warnings whenever inputs fall outside $[10.0, 46.0]\text{ dBm}$.
4. **Held-Out Benchmark Table:** In-app presentation of held-out test metrics, false-negative autopsies, and scientific findings.

---

## 8. Final Answers to Core Hackathon Questions

### Question 1: How accurately does ML predict candidate-action consequences?
- **Interference Delta:** **Exceptional accuracy ($R^2 = 0.9898$, $\text{MAE} = 4.091$)**, achieving an $86.7\%$ error reduction over linear baselines by capturing complex non-linear RF power summation.
- **Coverage Delta:** **Moderate accuracy ($\text{MAE} = 0.524\%$, $R^2 = 0.6655$)**, outperforming Zero-Delta ($0.801\%$) and Ridge ($0.624\%$), but subject to step-function errors near discrete user dropouts.
- **Candidate Ranking:** **Strong global agreement ($\text{Spearman } \rho = 0.8783$)**, but Top-1 agreement is $20.0\%$ due to tiny score margins ($<0.02$) between top options.

### Question 2: How much computation does the model add or save?
- Standalone inference is very fast ($5.41\text{ ms}$ $P_{50}$).
- In full evaluation mode, surrogate inference adds $\approx 163\text{ ms}$ of cycle latency.
- In **On-Demand Mode**, default overhead is reduced to **$0\text{ ms}$**, executing the pure twin in $206.14\text{ ms}$ ($P_{50}$).
- Computation is not saved in safety verification because the Digital Twin must still evaluate candidates to eliminate the surrogate's 216 false negatives.

### Question 3: Does the model improve RANGUARD's decisions, or is it more valuable as an advisory system?
- **It is fundamentally an advisory, explainability, and operator-screening capability.**
- Control outcomes are identical ($+0.00\%$ change) because RANGUARD's Digital Twin referee already achieves optimal safety enforcement.
- Relying on the surrogate alone would cause 216 safety violations.
- The true triumph is the **AI PREDICTS → DIGITAL TWIN VERIFIES → REFEREE DECIDES** pipeline: combining machine-learning speed and intuition with the non-negotiable safety guarantees of deterministic simulation.
