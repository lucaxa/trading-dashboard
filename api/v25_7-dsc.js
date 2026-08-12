/*
===========================================================
 TradeMind Pro
 V25.7-DSC v1 — Dhan Historical Data Compatibility Probe
===========================================================

PURPOSE
-------
Test whether DhanHQ can supply a small 5-minute NIFTY 50
historical window from the V25.7 period that INDstocks could
not supply.

THIS IS A DATA-SOURCE COMPATIBILITY TEST ONLY.

It does NOT:
- run V25.7 learning-engine.js
- generate candidates
- generate learning records
- classify HEALTHY / STABLE / DECAYING / BROKEN
- validate trades
- run OOS
- tune thresholds
- modify strategy mechanics
- place orders

FROZEN V25.7 REQUIREMENT
------------------------
The V25.7 research protocol remains unchanged.

We are only testing whether another historical data source can
provide the missing chronological candles.

DHANHQ DOCUMENTED CONFIGURATION
--------------------------------
Endpoint:
  POST https://api.dhan.co/v2/charts/intraday

NIFTY 50 example documented by Dhan:
  securityId: "13"
  exchangeSegment: "IDX_I"
  instrument: "INDEX"
  interval: "5"

Dhan's current v2 documentation states that intraday historical
data supports 1, 5, 15, 25 and 60 minute intervals and permits
up to 90 days per request. This probe intentionally uses only
a small window.

ENVIRONMENT
-----------
Set:

  DHAN_ACCESS_TOKEN

No order API is used anywhere in this file.

RUN
---
GET:
  /api/v25_7-dsc?probe=1

Probe 1 tests a small window inside the V25.7 S2-era period
that returned candles:null through INDstocks.

===========================================================
*/

export default async function handler(req, res) {

    const VERSION =
        "V25.7-DSC-v1";

    const ENDPOINT =
        "https://api.dhan.co/v2/charts/intraday";

    const INSTRUMENT =
        "NIFTY 50";

    const SECURITY_ID =
        "13";

    const EXCHANGE_SEGMENT =
        "IDX_I";

    const INSTRUMENT_TYPE =
        "INDEX";

    const INTERVAL =
        "5";

    /*
     * Probe 1:
     *
     * A small window inside the historical period that was
     * unavailable through INDstocks.
     *
     * 2023-12-20 00:00:00 UTC
     * through
     * 2023-12-26 00:00:00 UTC
     *
     * This is intentionally far below Dhan's documented
     * 90-day maximum request window.
     */
    const PROBES = {

        "1": {

            label:
                "S2_ERA_DHAN_CONTROL",

            description:
                "6-day 5-minute NIFTY 50 window inside the V25.7 S2-era historical period that returned candles:null through INDstocks.",

            fromDate:
                "2023-12-20 00:00:00",

            toDate:
                "2023-12-26 00:00:00",

            expectedPurpose:
                "Determine whether Dhan returns usable 5-minute candles for an S2-era period unavailable from INDstocks."
        }

    };

    function auditCandles(
        payload
    ) {

        /*
         * Dhan's historical response is documented as parallel
         * OHLC/time arrays. Be tolerant of small response-shape
         * differences, but do not silently manufacture data.
         */

        const timestampValues =
            Array.isArray(
                payload?.timestamp
            )
                ? payload.timestamp
                : Array.isArray(
                    payload?.timestamps
                )
                    ? payload.timestamps
                    : Array.isArray(
                        payload?.time
                    )
                        ? payload.time
                        : [];

        const open =
            Array.isArray(
                payload?.open
            )
                ? payload.open
                : [];

        const high =
            Array.isArray(
                payload?.high
            )
                ? payload.high
                : [];

        const low =
            Array.isArray(
                payload?.low
            )
                ? payload.low
                : [];

        const close =
            Array.isArray(
                payload?.close
            )
                ? payload.close
                : [];

        const volume =
            Array.isArray(
                payload?.volume
            )
                ? payload.volume
                : [];

        const count =
            Math.max(
                timestampValues.length,
                open.length,
                high.length,
                low.length,
                close.length,
                volume.length
            );

        const numericTimestamps =
            timestampValues
                .map(
                    Number
                )
                .filter(
                    Number.isFinite
                )
                .sort(
                    (a, b) =>
                        a - b
                );

        const uniqueTimestamps =
            [
                ...new Set(
                    numericTimestamps
                )
            ];

        let validOHLCRows =
            0;

        const sampleRows = [];

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const o =
                Number(
                    open[i]
                );

            const h =
                Number(
                    high[i]
                );

            const l =
                Number(
                    low[i]
                );

            const c =
                Number(
                    close[i]
                );

            const v =
                Number(
                    volume[i]
                );

            const valid =
                Number.isFinite(o) &&
                Number.isFinite(h) &&
                Number.isFinite(l) &&
                Number.isFinite(c) &&
                h >= Math.max(o, c) &&
                l <= Math.min(o, c);

            if (
                valid
            ) {

                validOHLCRows++;

                if (
                    sampleRows.length <
                    3
                ) {

                    sampleRows.push({
                        timestamp:
                            timestampValues[i] ??
                            null,

                        open:
                            o,

                        high:
                            h,

                        low:
                            l,

                        close:
                            c,

                        volume:
                            Number.isFinite(v)
                                ? v
                                : null
                    });
                }
            }
        }

        let fiveMinuteSpacingViolations =
            0;

        for (
            let i = 1;
            i <
            uniqueTimestamps.length;
            i++
        ) {

            const diff =
                uniqueTimestamps[i] -
                uniqueTimestamps[i - 1];

            /*
             * Dhan epoch timestamps are expected to be in seconds
             * for this API. A normal 5-minute spacing is 300 sec.
             *
             * We count deviations rather than assuming every
             * market-session gap should be 300 sec.
             */
            if (
                diff !== 300
            ) {

                /*
                 * Market overnight/weekend gaps are expected.
                 * Only count an irregular spacing when it is
                 * smaller than one trading-session boundary.
                 */
                if (
                    diff > 0 &&
                    diff < 60 * 60 * 12
                ) {

                    fiveMinuteSpacingViolations++;
                }
            }
        }

        return {

            responseShape:
                {
                    topLevelKeys:
                        payload &&
                        typeof payload ===
                            "object"
                            ? Object.keys(
                                payload
                            )
                            : [],

                    timestampKey:
                        timestampValues.length
                            ? (
                                Array.isArray(
                                    payload?.timestamp
                                )
                                    ? "timestamp"
                                    : Array.isArray(
                                        payload?.timestamps
                                    )
                                        ? "timestamps"
                                        : "time"
                            )
                            : null
                },

            candleArrays:
                {
                    timestampRows:
                        timestampValues.length,

                    openRows:
                        open.length,

                    highRows:
                        high.length,

                    lowRows:
                        low.length,

                    closeRows:
                        close.length,

                    volumeRows:
                        volume.length,

                    maxArrayLength:
                        count
                },

            timestampAudit:
                {
                    numericTimestampRows:
                        numericTimestamps.length,

                    uniqueTimestampRows:
                        uniqueTimestamps.length,

                    duplicateTimestampRows:
                        numericTimestamps.length -
                        uniqueTimestamps.length,

                    firstTimestamp:
                        uniqueTimestamps[0] ??
                        null,

                    lastTimestamp:
                        uniqueTimestamps[
                            uniqueTimestamps.length - 1
                        ] ??
                        null
                },

            ohlcAudit:
                {
                    validOHLCRows,

                    invalidOHLCRows:
                        Math.max(
                            0,
                            count -
                            validOHLCRows
                        )
                },

            fiveMinuteSpacingAudit:
                {
                    internalSpacingViolations:
                        fiveMinuteSpacingViolations
                },

            previewRows:
                sampleRows
        };
    }

    try {

        if (
            req.method !==
            "GET"
        ) {

            return res.status(405).json({

                success: false,

                version:
                    VERSION,

                status:
                    "METHOD_NOT_ALLOWED",

                paperOnly:
                    true,

                realOrders:
                    false,

                error:
                    "V25.7-DSC uses GET only."
            });
        }

        const accessToken =
            (
                process.env.DHAN_ACCESS_TOKEN ||
                ""
            ).trim();

        if (
            !accessToken
        ) {

            return res.status(500).json({

                success: false,

                version:
                    VERSION,

                status:
                    "CONFIG_ERROR",

                paperOnly:
                    true,

                realOrders:
                    false,

                error:
                    "DHAN_ACCESS_TOKEN is not configured."
            });
        }

        const probeId =
            String(
                req.query?.probe ||
                "1"
            );

        const probe =
            PROBES[
                probeId
            ];

        if (
            !probe
        ) {

            return res.status(400).json({

                success: false,

                version:
                    VERSION,

                status:
                    "INVALID_PROBE",

                availableProbes:
                    Object.keys(
                        PROBES
                    ),

                error:
                    "Use probe=1."
            });
        }

        const requestBody = {

            securityId:
                SECURITY_ID,

            exchangeSegment:
                EXCHANGE_SEGMENT,

            instrument:
                INSTRUMENT_TYPE,

            interval:
                INTERVAL,

            oi:
                false,

            fromDate:
                probe.fromDate,

            toDate:
                probe.toDate
        };

        const response =
            await fetch(
                ENDPOINT,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json",

                        "access-token":
                            accessToken
                    },

                    body:
                        JSON.stringify(
                            requestBody
                        )
                }
            );

        const rawText =
            await response.text();

        let payload =
            null;

        let parseStatus =
            "NOT_JSON";

        try {

            payload =
                JSON.parse(
                    rawText
                );

            parseStatus =
                "JSON";

        } catch {

            payload =
                null;
        }

        const audit =
            payload &&
            typeof payload ===
                "object"
                ? auditCandles(
                    payload
                )
                : null;

        let compatibility =
            "NO_VALID_CANDLE_ARRAYS";

        if (
            audit &&
            audit.timestampAudit
                .uniqueTimestampRows > 0
        ) {

            compatibility =
                "DATA_RETURNED";
        }

        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_7_DHAN_HISTORICAL_DATA_COMPATIBILITY",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            purpose:
                "Test DhanHQ as an independent historical candle source for the V25.7 S2-era period that INDstocks could not provide.",

            thisIsNotATradingTest:
                true,

            probe:
                {
                    id:
                        probeId,

                    label:
                        probe.label,

                    description:
                        probe.description,

                    fromDate:
                        probe.fromDate,

                    toDate:
                        probe.toDate,

                    expectedPurpose:
                        probe.expectedPurpose
                },

            request:
                {
                    endpoint:
                        ENDPOINT,

                    method:
                        "POST",

                    securityId:
                        SECURITY_ID,

                    exchangeSegment:
                        EXCHANGE_SEGMENT,

                    instrument:
                        INSTRUMENT_TYPE,

                    interval:
                        INTERVAL,

                    oi:
                        false
                },

            http:
                {
                    status:
                        response.status,

                    ok:
                        response.ok,

                    contentType:
                        response.headers.get(
                            "content-type"
                        ),

                    parseStatus
                },

            compatibility:
                {
                    status:
                        compatibility,

                    historicalDataReturned:
                        compatibility ===
                        "DATA_RETURNED",

                    enoughToProceed:
                        false,

                    reason:
                        "This probe establishes only whether Dhan returns usable candles. It does not establish V25.7 learning-record sufficiency."
                },

            audit,

            rawResponsePreview:
                audit
                    ? null
                    : rawText
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .slice(
                            0,
                            1000
                        ),

            comparisonTarget:
                {
                    INDSTOCKS_S2:
                        "CANDLES_NULL",

                    requiredV25_7Protocol:
                        {
                            segments:
                                5,

                            segmentDays:
                                180,

                            totalResearchDays:
                                900,

                            priorRecords:
                                40,

                            forwardRecords:
                                20,

                            recordsPerBlock:
                                60,

                            targetIndependentBlocks:
                                5,

                            targetUsableSELLRecords:
                                300
                        }
                },

            interpretation:
                {
                    learningRecordsGenerated:
                        false,

                    healthStatesCalculated:
                        false,

                    strategyModified:
                        false,

                    thresholdTuning:
                        false,

                    validationRun:
                        false,

                    oosRun:
                        false,

                    realOrders:
                        false,

                    conclusion:
                        compatibility
                },

            nextStep:
                "Inspect Probe 1 before attempting any broader Dhan historical import. Do not modify learning-engine.js based on this probe alone.",

            guardrails:
                {
                    noCandidateDiscovery:
                        true,

                    noLearningRecords:
                        true,

                    noHealthClassification:
                        true,

                    noValidation:
                        true,

                    noOOS:
                        true,

                    noStrategyChange:
                        true,

                    noThresholdChange:
                        true,

                    noRealOrders:
                        true
                }
        });

    } catch (
        error
    ) {

        return res.status(500).json({

            success:
                false,

            version:
                VERSION,

            status:
                "ERROR",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            error:
                error?.message ||
                String(
                    error
                )
        });
    }
}
