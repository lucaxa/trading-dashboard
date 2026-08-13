/*
===========================================================
 TradeMind Pro
 V25.28 — CONTROLLED FEATURE RESEARCH SPECIFICATION

 PURPOSE
 ----------------------------------------------------------
 V25.27 established that the V25.18–V25.26 evidence chain is
 eligible for controlled downstream research.

 V25.28 does NOT select, optimize, fit, or promote features.
 It creates a machine-readable research specification only.

 GUARANTEES
 ----------------------------------------------------------
 - Frozen-data research only
 - No live market access
 - No broker access
 - No order placement
 - No model fitting
 - No parameter optimization
 - No feature promotion
 - No performance claim
 - Hypotheses remain hypotheses
===========================================================
*/

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const SCRIPT_DIR = path.join(ROOT, '.github', 'scripts');
const OUTPUT = path.join(ROOT, 'v25_28_controlled_feature_research_specification.json');

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(SCRIPT_DIR)) {
  fail('Required .github/scripts directory is missing.');
}

const requiredEvidenceScripts = [
  'v25_18-stable-evidence-mathematical-identity-audit.js',
  'v25_19-stable-evidence-volatility-conditioning-audit.js',
  'v25_20-stable-evidence-volatility-conditioned-persistence-audit.js',
  'v25_21-stable-evidence-volatility-conditioned-magnitude-audit.js',
  'v25_22-stable-evidence-atr-normalization-decomposition-audit.js',
  'v25_23-stable-evidence-extreme-atr-tail-integrity-audit.js',
  'v25_24-stable-evidence-atr-normalization-direction-consistency-audit.js',
  'v25_25-stable-evidence-high-q4-temporal-concentration-audit.js',
  'v25_26-stable-evidence-high-q4-regime-state-attribution-audit.js'
];

const requiredWorkflowFamilies = [
  'v25_18', 'v25_19', 'v25_20', 'v25_21', 'v25_22',
  'v25_23', 'v25_24', 'v25_25', 'v25_26'
];

const missingScripts = requiredEvidenceScripts.filter(
  name => !fs.existsSync(path.join(SCRIPT_DIR, name))
);

if (missingScripts.length) {
  fail(`Required evidence scripts missing: ${missingScripts.join(', ')}`);
}

const workflowDir = path.join(ROOT, '.github', 'workflows');
if (!fs.existsSync(workflowDir)) {
  fail('Required .github/workflows directory is missing.');
}

const workflowFiles = fs.readdirSync(workflowDir)
  .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'));

const workflowPresence = requiredWorkflowFamilies.map(prefix => ({
  prefix,
  present: workflowFiles.some(name =>
    name.toLowerCase().startsWith(prefix.toLowerCase())
  )
}));

const missingWorkflowFamilies = workflowPresence
  .filter(x => !x.present)
  .map(x => x.prefix);

const specification = {
  status: 'CONTROLLED_FEATURE_RESEARCH_SPECIFICATION_COMPLETE',
  version: 'V25.28',
  mode: 'specification_only',

  researchEligibility: 'CONTROLLED_RESEARCH_ALLOWED',

  featurePromotion: 'PROHIBITED',
  optimization: 'PROHIBITED',
  modelFitting: 'PROHIBITED',
  liveTrading: 'PROHIBITED',
  brokerOrders: 'PROHIBITED',

  frozenDatasetRequired: true,
  frozenDatasetSource: 'V25.10',

  evidenceChain: {
    start: 'V25.18',
    end: 'V25.26',
    gate: 'V25.27',

    requiredScripts: requiredEvidenceScripts.map(name => ({
      file: name,
      present: true
    })),

    workflowFamilies: workflowPresence
  },

  researchDimensions: [
    {
      id: 'PERSISTENCE',
      sourceAudit: 'V25.20',
      question:
        'Does the observed relationship persist sufficiently across admissible partitions?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'MAGNITUDE',
      sourceAudit: 'V25.21',
      question:
        'Does effect magnitude remain directionally interpretable without selecting an optimized threshold?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'ATR_DECOMPOSITION',
      sourceAudit: 'V25.22',
      question:
        'Is the observed relationship distinguishable from ATR normalization effects?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'EXTREME_ATR_TAIL',
      sourceAudit: 'V25.23',
      question:
        'Does the relationship survive inspection of extreme-volatility tails?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'DIRECTION_CONSISTENCY',
      sourceAudit: 'V25.24',
      question:
        'Is directional behavior sufficiently consistent to justify further investigation?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'TEMPORAL_CONCENTRATION',
      sourceAudit: 'V25.25',
      question:
        'Is evidence concentrated in a narrow temporal region?',
      status: 'HYPOTHESIS_ONLY'
    },
    {
      id: 'REGIME_STATE_ATTRIBUTION',
      sourceAudit: 'V25.26',
      question:
        'Does apparent evidence depend on a specific regime state?',
      status: 'HYPOTHESIS_ONLY'
    }
  ],

  candidateRules: {
    allowNewFeatures: false,
    allowThresholdSearch: false,
    allowParameterSearch: false,
    allowRankingByPnL: false,
    allowCherryPicking: false,
    requireIndependentValidationBeforePromotion: true,
    requireTemporalAndRegimeReview: true,
    requireRedundancyReview: true,
    requireLeakageGate: true
  },

  prohibitedConclusions: [
    'feature_is_profitable',
    'feature_should_be_traded',
    'feature_is_optimal',
    'feature_is_predictive_out_of_sample',
    'feature_should_be_promoted_to_strategy'
  ],

  nextResearchStage: 'V25.29_CONTROLLED_HYPOTHESIS_RESEARCH',

  missingWorkflowFamilies,

  generatedAtUtc: new Date().toISOString()
};

const canonical = JSON.stringify(specification, null, 2) + '\n';
specification.specificationSha256 =
  crypto.createHash('sha256').update(canonical).digest('hex');

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(specification, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify(specification, null, 2));
console.log(`Output file: ${path.basename(OUTPUT)}`);
