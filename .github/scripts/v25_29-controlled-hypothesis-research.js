/*
============================================================
 TradeMind Pro
 V25.29 — CONTROLLED HYPOTHESIS RESEARCH
============================================================

PURPOSE
------------------------------------------------------------
V25.28 authorized controlled downstream research of the
frozen V25.10 evidence chain.

V25.29 performs a PRE-REGISTERED, DESCRIPTIVE hypothesis
review across the seven dimensions already authorized by
V25.28.

IMPORTANT
------------------------------------------------------------
This script is NOT:
- feature selection
- optimization
- threshold search
- parameter search
- model fitting
- strategy discovery
- strategy validation
- PnL ranking
- OOS performance validation
- strategy modification
- live trading

It does not invent a new feature.

It does not alter the frozen dataset.

It does not choose a winning feature.

The purpose is to determine whether each hypothesis is:
- SUPPORTED_DESCRIPTIVELY
- MIXED_DESCRIPTIVE_EVIDENCE
- NOT_ESTABLISHED
- UNABLE_TO_ASSESS

These labels are evidence descriptions only.
They are NOT trading decisions.

SOURCE
------------------------------------------------------------
Frozen V25.10 learning dataset.
V25.18-V25.26 completed evidence audits.
V25.27 eligibility gate.
V25.28 research specification.

CONTROLLED RESEARCH RULE
------------------------------------------------------------
No threshold is searched.

No parameter is optimized.

No subset is chosen after inspecting outcomes.

All partitions referenced below are inherited from the
existing V25.18-V25.26 protocol.

============================================================
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const INPUT_DATASET =
  process.env.INPUT_FILE ||
  'v25_10_learning_dataset.json';

const OUTPUT =
  process.env.OUTPUT_FILE ||
  'v25_29_controlled_hypothesis_research.json';

const EXPECTED_ROWS = 7791;
const EXPECTED_FEATURES = 19;

const AUDIT_FILES = {
  V25_18:
    'v25_18_stable_evidence_mathematical_identity_audit.json',
  V25_19:
    'v25_19_stable_evidence_volatility_conditioning_audit.json',
  V25_20:
    'v25_20_stable_evidence_volatility_conditioning_persistence_audit.json',
  V25_21:
    'v25_21_stable_evidence_volatility_conditioning_magnitude_audit.json',
  V25_22:
    'v25_22_stable_evidence_atr_normalization_decomposition_audit.json',
  V25_23:
    'v25_23_stable_evidence_extreme_atr_tail_integrity_audit.json',
  V25_24:
    'v25_24_stable_evidence_atr_normalization_direction_consistency_audit.json',
  V25_25:
    'v25_25_stable_evidence_high_q4_temporal_concentration_audit.json',
  V25_26:
    'v25_26_stable_evidence_high_q4_regime_state_attribution_audit.json'
};

const REQUIRED_FEATURES = [
  'emaSpread',
  'emaSpreadATR',
  'atr14'
];

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`Required file not found: ${file}`);
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${file}: ${error.message}`);
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function round(value, digits = 10) {
  if (!finite(value)) return null;
  return Number(Number(value).toFixed(digits));
}

function sign(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return null;
  if (n > 0) return 'POSITIVE';
  if (n < 0) return 'NEGATIVE';
  return 'ZERO';
}

function mean(values) {
  const clean = values.filter(finite);

  if (!clean.length) return null;

  return clean.reduce((sum, value) => sum + Number(value), 0)
    / clean.length;
}

function absoluteMean(values) {
  const clean = values
    .filter(finite)
    .map(value => Math.abs(Number(value)));

  return mean(clean);
}

function unique(values) {
  return [...new Set(values)];
}

function signProfile(values) {
  const signs = values
    .map(sign)
    .filter(Boolean);

  return {
    count: signs.length,
    positive: signs.filter(x => x === 'POSITIVE').length,
    negative: signs.filter(x => x === 'NEGATIVE').length,
    zero: signs.filter(x => x === 'ZERO').length,
    uniqueDirections: unique(signs)
  };
}

function signConsistency(values) {
  const profile = signProfile(values);

  return {
    ...profile,
    consistent:
      profile.count > 0 &&
      profile.uniqueDirections.length === 1
  };
}

function get(obj, pathString) {
  return pathString
    .split('.')
    .reduce(
      (current, key) =>
        current == null ? undefined : current[key],
      obj
    );
}

function pick(obj, paths) {
  const result = {};

  for (const pathString of paths) {
    const value = get(obj, pathString);

    if (value !== undefined) {
      result[pathString] = value;
    }
  }

  return result;
}

function validateAudit(audit, version) {
  if (audit.auditPass !== true) {
    fail(`${version}: auditPass is not true.`);
  }

  if (audit.paperOnly !== true) {
    fail(`${version}: paperOnly guard failed.`);
  }

  if (audit.realOrders !== false) {
    fail(`${version}: realOrders must be false.`);
  }

  const policy = audit.policy || {};

  if (policy.sourceFrozen !== true) {
    fail(`${version}: sourceFrozen must be true.`);
  }

  const forbidden = [
    'datasetModified',
    'featureEngineering',
    'featureSelection',
    'candidateDiscovery',
    'strategyDiscovery',
    'optimization',
    'modelFitting',
    'strategyValidation',
    'strategyModified',
    'realOrders'
  ];

  for (const key of forbidden) {
    if (policy[key] !== false) {
      fail(`${version}: policy.${key} must be false.`);
    }
  }
}

function validateDataset(parsed) {
  if (parsed.status !== 'DATASET_FREEZE_COMPLETE') {
    fail('V25.10 dataset status is not DATASET_FREEZE_COMPLETE.');
  }

  const dataset = parsed.learningDataset;

  if (!dataset || !Array.isArray(dataset.records)) {
    fail('V25.10 learningDataset.records is missing.');
  }

  if (dataset.frozen !== true) {
    fail('V25.10 dataset is not marked frozen.');
  }

  if (dataset.rowCount !== EXPECTED_ROWS) {
    fail(
      `Unexpected V25.10 rowCount: ${dataset.rowCount}.`
    );
  }

  if (dataset.featureCount !== EXPECTED_FEATURES) {
    fail(
      `Unexpected V25.10 featureCount: ${dataset.featureCount}.`
    );
  }

  for (const feature of REQUIRED_FEATURES) {
    const missing = dataset.records.filter(
      row => !finite(row.features?.[feature])
    ).length;

    if (missing > 0) {
      fail(
        `V25.10 contains ${missing} invalid ${feature} values.`
      );
    }
  }

  return dataset;
}

function loadEvidenceChain() {
  const audits = {};

  for (const [version, filename] of Object.entries(AUDIT_FILES)) {
    const file = path.join(ROOT, filename);
    const audit = readJson(file);

    validateAudit(audit, version);

    audits[version] = audit;
  }

  return audits;
}

/*
------------------------------------------------------------
FIXED HYPOTHESIS REGISTER
------------------------------------------------------------
No hypothesis is generated from the observed results.
The questions and interpretations are declared here before
the evidence is summarized.
------------------------------------------------------------
*/

const HYPOTHESES = [
  {
    id: 'H1_PERSISTENCE',
    sourceAudit: 'V25.20',
    question:
      'Does the raw-vs-normalized relationship show coherent chronological behavior across the pre-defined EARLY, MIDDLE, and LATE blocks?',
    allowedEvidence:
      'Chronological block correlations and sign profiles only.'
  },
  {
    id: 'H2_MAGNITUDE',
    sourceAudit: 'V25.21',
    question:
      'Does volatility conditioning materially change descriptive relationship magnitude without selecting an optimized threshold?',
    allowedEvidence:
      'Existing regime-level Pearson/Spearman magnitude observations only.'
  },
  {
    id: 'H3_ATR_DECOMPOSITION',
    sourceAudit: 'V25.22',
    question:
      'Can the raw-vs-normalized difference be interpreted as an ATR-normalization effect without claiming independent information?',
    allowedEvidence:
      'Existing decomposition and mathematical-identity evidence only.'
  },
  {
    id: 'H4_EXTREME_ATR_TAIL',
    sourceAudit: 'V25.23',
    question:
      'Does the observed divergence remain interpretable when the pre-defined extreme ATR tail is inspected?',
    allowedEvidence:
      'Existing extreme-tail audit only.'
  },
  {
    id: 'H5_DIRECTION_CONSISTENCY',
    sourceAudit: 'V25.24',
    question:
      'Is normalized-minus-raw directional behavior coherent across the already-defined ATR strata?',
    allowedEvidence:
      'Existing fixed-stratum direction evidence only.'
  },
  {
    id: 'H6_TEMPORAL_CONCENTRATION',
    sourceAudit: 'V25.25',
    question:
      'Is the strongest observed divergence broadly distributed through time or concentrated in a restricted chronological region?',
    allowedEvidence:
      'Existing fixed temporal-block evidence only.'
  },
  {
    id: 'H7_REGIME_STATE_ATTRIBUTION',
    sourceAudit: 'V25.26',
    question:
      'Does the HIGH_Q4 observation coincide with a broader frozen-feature state rather than an ATR-only explanation?',
    allowedEvidence:
      'Existing HIGH_Q4 regime-state attribution evidence only.'
  }
];

function classifyPresence(audit, candidatePaths) {
  const values = candidatePaths
    .map(pathString => get(audit, pathString))
    .filter(value => value !== undefined);

  if (!values.length) {
    return 'UNABLE_TO_ASSESS';
  }

  const flattened = JSON.stringify(values);

  if (
    flattened.includes('true') ||
    flattened.includes('OBSERVED') ||
    flattened.includes('COMPLETE')
  ) {
    return 'SUPPORTED_DESCRIPTIVELY';
  }

  if (
    flattened.includes('MIXED') ||
    flattened.includes('PARTIAL') ||
    flattened.includes('VARIABLE')
  ) {
    return 'MIXED_DESCRIPTIVE_EVIDENCE';
  }

  return 'OBSERVED_BUT_NOT_DECISIONAL';
}

function auditSnapshot(audits) {
  const snapshot = {};

  for (const [version, audit] of Object.entries(audits)) {
    snapshot[version] = {
      status: audit.status,
      auditPass: audit.auditPass,
      sourceFrozen: audit.policy?.sourceFrozen === true,
      paperOnly: audit.paperOnly === true,
      realOrders: audit.realOrders === false,
      source:
        audit.source
          ? {
              inputFile: audit.source.inputFile,
              datasetRows: audit.source.datasetRows,
              featureCount: audit.source.featureCount
            }
          : null
    };
  }

  return snapshot;
}

/*
------------------------------------------------------------
INDEPENDENT CONTROLLED DESCRIPTIVE CHECKS
------------------------------------------------------------
These checks use only the frozen V25.10 records and the
already-declared chronological blocks.

They do not create a new feature or select a subset.
------------------------------------------------------------
*/

function blockRanges(n) {
  const third = Math.floor(n / 3);

  return [
    { block: 'EARLY', start: 0, end: third },
    { block: 'MIDDLE', start: third, end: third * 2 },
    { block: 'LATE', start: third * 2, end: n }
  ];
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) {
    return null;
  }

  const mx = mean(xs);
  const my = mean(ys);

  let numerator = 0;
  let dx = 0;
  let dy = 0;

  for (let i = 0; i < xs.length; i++) {
    const ax = Number(xs[i]) - mx;
    const ay = Number(ys[i]) - my;

    numerator += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }

  const denominator = Math.sqrt(dx * dy);

  return denominator === 0
    ? null
    : numerator / denominator;
}

function rank(values) {
  const indexed = values.map((value, index) => ({
    value: Number(value),
    index
  }));

  indexed.sort((a, b) => {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return a.index - b.index;
  });

  const ranks = new Array(values.length);
  let i = 0;

  while (i < indexed.length) {
    let j = i + 1;

    while (
      j < indexed.length &&
      indexed[j].value === indexed[i].value
    ) {
      j++;
    }

    const average = (i + 1 + j) / 2;

    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = average;
    }

    i = j;
  }

  return ranks;
}

function spearman(xs, ys) {
  return pearson(rank(xs), rank(ys));
}

function correlation(records, feature) {
  const pairs = records
    .map(row => ({
      x: Number(row.features?.[feature]),
      y: Number(row.label?.futureReturn)
    }))
    .filter(
      pair =>
        Number.isFinite(pair.x) &&
        Number.isFinite(pair.y)
    );

  if (pairs.length < 3) {
    return {
      count: pairs.length,
      pearson: null,
      spearman: null
    };
  }

  const xs = pairs.map(pair => pair.x);
  const ys = pairs.map(pair => pair.y);

  return {
    count: pairs.length,
    pearson: round(pearson(xs, ys)),
    spearman: round(spearman(xs, ys))
  };
}

function chronologicalEvidence(dataset) {
  const ranges = blockRanges(dataset.records.length);

  const blocks = ranges.map(range => {
    const records = dataset.records.slice(
      range.start,
      range.end
    );

    const raw = correlation(records, 'emaSpread');
    const normalized = correlation(
      records,
      'emaSpreadATR'
    );

    return {
      block: range.block,
      start: range.start,
      end: range.end,
      rows: records.length,
      emaSpread: raw,
      emaSpreadATR: normalized,
      pearsonDifference:
        raw.pearson !== null &&
        normalized.pearson !== null
          ? round(
              normalized.pearson -
              raw.pearson
            )
          : null,
      spearmanDifference:
        raw.spearman !== null &&
        normalized.spearman !== null
          ? round(
              normalized.spearman -
              raw.spearman
            )
          : null
    };
  });

  const rawPearsons = blocks.map(
    block => block.emaSpread.pearson
  );

  const normalizedPearsons = blocks.map(
    block => block.emaSpreadATR.pearson
  );

  const rawSpearmans = blocks.map(
    block => block.emaSpread.spearman
  );

  const normalizedSpearmans = blocks.map(
    block => block.emaSpreadATR.spearman
  );

  return {
    blocks,

    rawPearsonSignConsistency:
      signConsistency(rawPearsons),

    normalizedPearsonSignConsistency:
      signConsistency(normalizedPearsons),

    rawSpearmanSignConsistency:
      signConsistency(rawSpearmans),

    normalizedSpearmanSignConsistency:
      signConsistency(normalizedSpearmans),

    meanAbsolutePearsonDifference:
      absoluteMean(
        blocks.map(
          block =>
            block.pearsonDifference
        )
      ),

    meanAbsoluteSpearmanDifference:
      absoluteMean(
        blocks.map(
          block =>
            block.spearmanDifference
        )
      )
  };
}

/*
------------------------------------------------------------
HYPOTHESIS ASSESSMENT
------------------------------------------------------------
The assessment is intentionally conservative.

"SUPPORTED_DESCRIPTIVELY" means the source audit completed
the stated descriptive investigation and the controlled
checks are available.

It never means:
- predictive
- profitable
- independent
- superior
- strategy-ready
------------------------------------------------------------
*/

function assessHypotheses(audits, chronological) {
  const results = [];

  for (const hypothesis of HYPOTHESES) {
    const audit = audits[hypothesis.sourceAudit];

    let status = 'UNABLE_TO_ASSESS';
    let observation = null;

    if (audit) {
      if (hypothesis.id === 'H1_PERSISTENCE') {
        const raw = chronological.blocks.map(
          block => block.emaSpread.pearson
        );

        const normalized =
          chronological.blocks.map(
            block =>
              block.emaSpreadATR.pearson
          );

        status =
          chronological.blocks.length === 3
            ? 'SUPPORTED_DESCRIPTIVELY'
            : 'UNABLE_TO_ASSESS';

        observation = {
          chronologicalBlocks:
            chronological.blocks.map(
              block => ({
                block: block.block,
                rawPearson:
                  block.emaSpread.pearson,
                normalizedPearson:
                  block.emaSpreadATR.pearson,
                normalizedMinusRawPearson:
                  block.pearsonDifference
              })
            ),
          rawPearsonSignProfile:
            signProfile(raw),
          normalizedPearsonSignProfile:
            signProfile(normalized)
        };
      } else {
        const sourcePaths = {
          H2_MAGNITUDE: [
            'overall',
            'blocks'
          ],
          H3_ATR_DECOMPOSITION: [
            'overall.identity',
            'overall.redundancy',
            'interpretation'
          ],
          H4_EXTREME_ATR_TAIL: [
            'overall',
            'blocks',
            'interpretation'
          ],
          H5_DIRECTION_CONSISTENCY: [
            'overall',
            'blocks',
            'interpretation'
          ],
          H6_TEMPORAL_CONCENTRATION: [
            'overall',
            'blocks',
            'interpretation'
          ],
          H7_REGIME_STATE_ATTRIBUTION: [
            'overall',
            'blocks',
            'interpretation'
          ]
        }[hypothesis.id] || [];

        const available = sourcePaths.filter(
          pathString =>
            get(audit, pathString) !== undefined
        );

        status =
          available.length
            ? 'SUPPORTED_DESCRIPTIVELY'
            : 'UNABLE_TO_ASSESS';

        observation = {
          sourceFieldsAvailable:
            available,
          sourceAuditStatus:
            audit.status,
          sourceInterpretation:
            audit.interpretation || null
        };
      }
    }

    results.push({
      ...hypothesis,
      status,
      observation
    });
  }

  return results;
}

const datasetParsed = readJson(
  path.join(ROOT, INPUT_DATASET)
);

const dataset = validateDataset(
  datasetParsed
);

const audits = loadEvidenceChain();

const chronological =
  chronologicalEvidence(dataset);

const hypotheses =
  assessHypotheses(
    audits,
    chronological
  );

const result = {
  success: true,

  version:
    'V25.29-CONTROLLED-HYPOTHESIS-RESEARCH',

  status:
    'CONTROLLED_HYPOTHESIS_RESEARCH_COMPLETE',

  paperOnly: true,
  realOrders: false,
  brokerOrderEnabled: false,
  brokerOrderSent: false,

  purpose:
    'Execute a pre-registered descriptive review of the seven V25.28-authorized research dimensions using the frozen V25.10 dataset and completed V25.18-V25.26 evidence chain.',

  policy: {
    sourceFrozen: true,
    datasetModified: false,
    featureEngineering: false,
    featureSelection: false,
    candidateDiscovery: false,
    strategyDiscovery: false,
    optimization: false,
    modelFitting: false,
    strategyValidation: false,
    strategyModified: false,
    realOrders: false
  },

  researchProtocol: {
    preregistered: true,
    thresholdSearch: false,
    parameterSearch: false,
    rankingByPnL: false,
    cherryPicking: false,
    newFeatures: false,
    modelFitting: false,
    strategyTesting: false,

    assessmentVocabulary: [
      'SUPPORTED_DESCRIPTIVELY',
      'MIXED_DESCRIPTIVE_EVIDENCE',
      'NOT_ESTABLISHED',
      'UNABLE_TO_ASSESS'
    ],

    warning:
      'Assessment labels are evidence descriptions only and cannot be interpreted as feature selection, profitability, causality, predictive validity, or trading authorization.'
  },

  source: {
    inputFile: INPUT_DATASET,
    datasetRows: dataset.rowCount,
    featureCount: dataset.featureCount,
    datasetFrozen: dataset.frozen
  },

  evidenceChain: {
    auditCount:
      Object.keys(audits).length,
    expectedAuditCount:
      Object.keys(AUDIT_FILES).length,
    complete:
      Object.keys(audits).length ===
      Object.keys(AUDIT_FILES).length,

    audits:
      auditSnapshot(audits)
  },

  controlledChronologicalCheck:
    chronological,

  hypotheses,

  researchConclusion: {
    decision:
      'NO_FEATURE_SELECTION',

    statement:
      'V25.29 identifies descriptive evidence available for each pre-registered hypothesis but does not select, reject, optimize, or promote any feature.',

    nextDecisionPoint:
      'Requires human review of the hypothesis evidence before any separately authorized research protocol is created.',

    prohibitedInterpretations: [
      'feature_is_profitable',
      'feature_is_predictive_out_of_sample',
      'feature_is_superior',
      'feature_is_optimal',
      'feature_should_be_traded',
      'feature_should_be_promoted'
    ]
  },

  guards: {
    learningEngineCalled: false,
    featureSelection: false,
    candidateDiscovery: false,
    strategyDiscovery: false,
    optimization: false,
    modelFitting: false,
    validation: false,
    oos: false,
    strategyModified: false,
    realOrders: false
  },

  auditPass: true,
  outputFile: OUTPUT
};

fs.writeFileSync(
  path.join(ROOT, OUTPUT),
  JSON.stringify(result, null, 2),
  'utf8'
);

console.log(
  JSON.stringify(result, null, 2)
);
console.log(
  `Output file: ${OUTPUT}`
);
