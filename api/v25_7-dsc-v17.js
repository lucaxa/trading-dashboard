/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v17 — INDICATOR DEPENDENCY / VOLUME POLICY AUDIT
===========================================================

PURPOSE
-------
Audit the V25.7 learning/decision source before making ANY S5
data-policy or importer change.

SOURCE BASIS
------------
This audit is based on the V25.7 independent-confirmation source
currently available in the project files.

This endpoint is intentionally STATIC.
It does not call Dhan and does not run the learning engine.

KEY FINDING TO VERIFY
---------------------
The V25.7 source's sessionVWAP() already applies:

    Math.max(0, n(c.v, 0))

Therefore negative volume is ALREADY neutralized to zero by the
V25.7 VWAP calculation.

This is critical because v15/v16 diagnostic VWAP comparisons
allowed negative volume to participate in the diagnostic VWAP,
which is NOT identical to the V25.7 production calculation.

NO:
- learning records
- candidate discovery
- historical import
- validation/OOS
- strategy changes
- threshold changes
- source repair
- real orders

RUN:
 /api/v25_7-dsc-v17?probe=1
===========================================================
*/

export default async function handler(req, res) {

    const VERSION = "V25.7-DSC-v17";

    if (req.method !== "GET") {
        return res.status(405).json({
            success:false,
            version:VERSION,
            status:"METHOD_NOT_ALLOWED",
            error:"Use GET with ?probe=1."
        });
    }

    if (String(req.query?.probe || "1") !== "1") {
        return res.status(400).json({
            success:false,
            version:VERSION,
            status:"INVALID_PROBE",
            availableProbes:["1"],
            error:"Use probe=1."
        });
    }

    return res.status(200).json({

        success:true,
        version:VERSION,
        status:"COMPLETED",
        mode:"V25_7_INDICATOR_DEPENDENCY_VOLUME_POLICY_AUDIT",

        paperOnly:true,
        realOrders:false,
        brokerOrderEnabled:false,
        brokerOrderSent:false,

        purpose:
            "Determine whether S5 negative volume can affect the actual V25.7 learning/decision pipeline and verify the production VWAP volume policy before any importer change.",

        thisIsNotATradingTest:true,

        sourceAudit:{
            source:
                "V25.7 independent confirmation source available in TradeMind Pro project files",

            sourceVerified:true,

            featureGeneration:{
                EMA9:{
                    used:true,
                    role:[
                        "trend direction",
                        "EMA spread",
                        "EMA slope"
                    ]
                },

                EMA21:{
                    used:true,
                    role:[
                        "trend direction",
                        "EMA spread"
                    ]
                },

                RSI14:{
                    used:true,
                    role:[
                        "rsiBucket",
                        "confirmation / feature context"
                    ]
                },

                ATR14:{
                    used:true,
                    role:[
                        "spread normalization",
                        "slope normalization",
                        "volatility",
                        "VWAP distance normalization",
                        "exit model"
                    ]
                },

                VWAP:{
                    used:true,
                    role:[
                        "vwapDirection",
                        "vwapDistanceATR",
                        "anti-chase filter",
                        "TREND_FOLLOW setup eligibility",
                        "VWAP_PULLBACK setup detection",
                        "recentVWAPInteraction"
                    ]
                }
            }
        },

        criticalFinding:{
            sessionVWAPSourceExpression:
                "Math.max(0, n(c.v, 0))",

            negativeVolumeTreatment:
                "NEGATIVE_VOLUME_IS_CLAMPED_TO_ZERO",

            negativeVolumeContributesToVWAPNumerator:false,
            negativeVolumeContributesToVWAPDenominator:false,

            candleOHLCIsRetained:true,

            interpretation:
                "The V25.7 production VWAP implementation already retains the candle while preventing negative volume from contributing to VWAP."
        },

        dependencyMap:{
            priceDerivedIndicators:{
                EMA9:true,
                EMA21:true,
                RSI14:true,
                ATR14:true
            },

            volumeSensitiveIndicator:{
                VWAP:true
            },

            decisionPath:{
                features:true,
                trendClassification:true,
                vwapDirection:true,
                vwapDistanceATR:true,
                antiChaseCheck:true,
                detectSetups:true,
                recentVWAPInteraction:true,
                confirmationScore:true,
                createLearningRecord:true
            }
        },

        setupDependency:{
            TREND_FOLLOW:{
                vwapDirectionUsed:true,
                antiChaseVWAPDistanceUsed:true
            },

            VWAP_PULLBACK:{
                vwapDirectionUsed:true,
                recentVWAPInteractionUsed:true,
                vwapDistanceATRUsed:true
            }
        },

        learningRecordDependency:{
            vwapDirectionStored:true,
            rsiBucketStored:true,
            trendStored:true,
            regimeStored:true,
            volatilityStored:true,
            resultRStored:true,

            rawVolumeStoredAsLearningFeature:false,

            interpretation:
                "Volume itself is not stored as a learning-record feature in the inspected createLearningRecord path, but VWAP-derived state is."
        },

        correctedInterpretationOfV15V16:{
            v15:
                "V15 established that allowing negative volume to participate in a diagnostic VWAP can materially distort the VWAP path.",

            v16:
                "V16 established that deleting negative-volume candles changes price-derived indicators, while zeroing volume preserves them. However, its RAW VWAP comparison was not identical to the V25.7 production VWAP because the diagnostic RAW path allowed negative volume to contribute.",

            consequence:
                "The V15/V16 VWAP magnitude differences must NOT be treated as evidence that the current V25.7 production VWAP is already corrupted."
        },

        decision:{
            importerPolicy:
                "DO_NOT_CHANGE_YET",

            candleDeletion:
                "NOT_JUSTIFIED_BY_NEGATIVE_VOLUME_ALONE",

            productionVWAPRepair:
                "NOT_REQUIRED_BASED_ON_THE_INSPECTED_SOURCE",

            learningEngineModification:
                "NONE",

            nextDiagnostic:
                "Re-run a corrected S5 impact audit using the EXACT V25.7 sessionVWAP rule, then measure whether negative-volume timestamps can change actual feature states / setup eligibility."
        },

        guardrails:{
            noCandidateDiscovery:true,
            noLearningRecords:true,
            noHealthClassification:true,
            noValidation:true,
            noOOS:true,
            noStrategyChange:true,
            noThresholdChange:true,
            noImporterChange:true,
            noCandleRepair:true,
            noSyntheticData:true,
            noRealOrders:true
        }
    });
}
