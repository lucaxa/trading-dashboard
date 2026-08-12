/*
===========================================================
TradeMind Pro
V24.5 — SEGMENT 4 CONFIGURATION
===========================================================

SEGMENT MAP
-----------
Segment 1 = closest to V23
Segment 2 = immediately older
Segment 3 = immediately older
Segment 4 = oldest

Each segment = 180 days.
Total confirmation horizon = 720 days.
Segments are non-overlapping.

IMPORTANT:
This is the Segment 4 selection block for the
V24.5 segmented independent confirmation engine.
It is intended to replace the confirmation-segment
selection block in the V24.5 complete engine.

Segment 4 can also be explicitly supplied through:
    ?confirmationSegment=4

or request body:
    { "confirmationSegment": 4 }

===========================================================
*/

const V24_TOTAL_CONFIRMATION_DAYS = 720;

const V24_CONFIRMATION_SEGMENT_DAYS = 180;

const V24_CONFIRMATION_SEGMENTS =
    V24_TOTAL_CONFIRMATION_DAYS /
    V24_CONFIRMATION_SEGMENT_DAYS;

// =====================================================
// SEGMENT 4 — OLDEST CONFIRMATION SLICE
// =====================================================

const requestedConfirmationSegment = Number(
    req.body?.confirmationSegment ??
    req.query?.confirmationSegment ??
    4
);

const V24_CONFIRMATION_SEGMENT =
    Number.isFinite(requestedConfirmationSegment)
        ? Math.min(
            V24_CONFIRMATION_SEGMENTS,
            Math.max(
                1,
                Math.floor(
                    requestedConfirmationSegment
                )
            )
        )
        : 4;

const V24_CONFIRMATION_DAYS =
    V24_CONFIRMATION_SEGMENT_DAYS;

const v24LatestStartMs =
    Date.now() -
    REQUESTED_DAYS *
    24 *
    60 *
    60 *
    1000;

const v24V23BoundaryEndMs =
    v24LatestStartMs - 1000;

const segmentOffsetMs =
    (V24_CONFIRMATION_SEGMENT - 1) *
    V24_CONFIRMATION_SEGMENT_DAYS *
    24 *
    60 *
    60 *
    1000;

const v24ConfirmationEndMs =
    v24V23BoundaryEndMs -
    segmentOffsetMs;

const v24ConfirmationStartMs =
    v24ConfirmationEndMs -
    V24_CONFIRMATION_SEGMENT_DAYS *
    24 *
    60 *
    60 *
    1000;

const v24ConfirmationData =
    await loadHistoricalDataRange(
        v24ConfirmationStartMs,
        v24ConfirmationEndMs
    );

const v24ConfirmationFetchEndMs =
    Date.now();

const v24ConfirmationRows =
    v24ConfirmationData.candles;

const v24ConfirmationCandles =
    v24ConfirmationRows.length > 0
        ? v24ConfirmationRows.slice(0, -1)
        : [];

let v24ConfirmationDiscovery = null;

let v24IndependentEdgeHealthConfirmation = null;

if (
    v24ConfirmationCandles.length >= 500
) {

    v24ConfirmationDiscovery = {

        rawRecords:
            generateV24ConfirmationLearningRecords(
                v24ConfirmationCandles,
                0,
                v24ConfirmationCandles.length
            )
    };

    v24IndependentEdgeHealthConfirmation =
        buildV245IndependentEdgeHealthConfirmation({

            confirmationRecords:
                v24ConfirmationDiscovery.rawRecords,

            sourceLabel:
                "SEPARATE_NON_OVERLAPPING_HISTORICAL_SLICE",

            sourceStartTs:
                v24ConfirmationRows[0]?.ts ?? null,

            sourceEndTs:
                v24ConfirmationRows[
                    v24ConfirmationRows.length - 1
                ]?.ts ?? null
        });

    v24IndependentEdgeHealthConfirmation.segment = {

        segment:
            V24_CONFIRMATION_SEGMENT,

        segmentCount:
            V24_CONFIRMATION_SEGMENTS,

        segmentDays:
            V24_CONFIRMATION_SEGMENT_DAYS,

        totalResearchDays:
            V24_TOTAL_CONFIRMATION_DAYS,

        v23BoundaryEndMs:
            v24V23BoundaryEndMs,

        rangeStartMs:
            v24ConfirmationStartMs,

        rangeEndMs:
            v24ConfirmationEndMs
    };

} else {

    v24IndependentEdgeHealthConfirmation = {

        success: false,

        version:
            "V24.5",

        status:
            "INSUFFICIENT_CONFIRMATION_DATA",

        mode:
            "V24_INDEPENDENT_EDGE_HEALTH_CONFIRMATION",

        diagnosticOnly:
            true,

        segment: {

            segment:
                V24_CONFIRMATION_SEGMENT,

            segmentCount:
                V24_CONFIRMATION_SEGMENTS,

            segmentDays:
                V24_CONFIRMATION_SEGMENT_DAYS,

            totalResearchDays:
                V24_TOTAL_CONFIRMATION_DAYS,

            rangeStartMs:
                v24ConfirmationStartMs,

            rangeEndMs:
                v24ConfirmationEndMs
        },

        paperOnly:
            true,

        realOrders:
            false,

        brokerOrderEnabled:
            false,

        brokerOrderSent:
            false,

        source: {

            label:
                "SEPARATE_NON_OVERLAPPING_HISTORICAL_SLICE",

            rangeStartTs:
                v24ConfirmationRows[0]?.ts ?? null,

            rangeEndTs:
                v24ConfirmationRows[
                    v24ConfirmationRows.length - 1
                ]?.ts ?? null,

            candles:
                v24ConfirmationCandles.length,

            minimumRequired:
                500
        },

        decisionGuard: {

            noTradingChange:
                true,

            noAutomaticFilterPromotion:
                true
        }
    };
}
