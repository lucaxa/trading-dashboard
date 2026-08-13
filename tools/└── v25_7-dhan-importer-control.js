/*
===========================================================
 TradeMind Pro
 V25.7 — LOCAL DHAN CONTROL IMPORTER
 ----------------------------------------------------------
 PURPOSE:
 First controlled historical-data import after V25.7-DSC-v20.

 IMPORTANT:
 - LOCAL/OFFLINE TOOL ONLY
 - NOT a Vercel API function
 - PAPER / RESEARCH DATA ONLY
 - NO learning-engine.js
 - NO learning-dataset.js
 - NO candidate discovery
 - NO validation/OOS
 - NO strategy changes
 - NO real orders

 FIRST TEST:
 S5-A control window:
 2021-12-28 00:00:00 -> 2022-01-04 00:00:00

 Dhan:
 POST /v2/charts/intraday
 securityId=13
 exchangeSegment=IDX_I
 instrument=INDEX
 interval=5
 oi=false

 APPROVED V25.7 POLICY:
 - Remove invalid OHLC rows.
 - Remove timestamp-anomaly rows only.
 - Retain negative-volume candles.
 - No timestamp repair.
 - No candle repair.
 - No synthetic candles.
===========================================================
*/

"use strict";

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DHAN_ACCESS_TOKEN;
const ENDPOINT = "https://api.dhan.co/v2/charts/intraday";

const WINDOW = {
    id: "S5-CONTROL-7D",
    fromDate: "2021-12-28 00:00:00",
    toDate: "2022-01-04 00:00:00"
};

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function normalize(data) {
    const ts = Array.isArray(data?.timestamp) ? data.timestamp : [];
    const o = Array.isArray(data?.open) ? data.open : [];
    const h = Array.isArray(data?.high) ? data.high : [];
    const l = Array.isArray(data?.low) ? data.low : [];
    const c = Array.isArray(data?.close) ? data.close : [];
    const v = Array.isArray(data?.volume) ? data.volume : [];

    const count = Math.min(
        ts.length, o.length, h.length, l.length, c.length, v.length
    );

    return Array.from({ length: count }, (_, i) => ({
        sourceIndex: i,
        ts: num(ts[i]),
        open: num(o[i]),
        high: num(h[i]),
        low: num(l[i]),
        close: num(c[i]),
        volume: num(v[i]) ?? 0
    }));
}

function validOHLC(row) {
    if (
        row.open === null ||
        row.high === null ||
        row.low === null ||
        row.close === null
    ) return false;

    return (
        row.high >= row.low &&
        row.high >= Math.max(row.open, row.close) &&
        row.low <= Math.min(row.open, row.close)
    );
}

function findTimestampAnomalies(rows) {
    const bad = new Set();
    const details = [];

    for (let i = 0; i < rows.length; i++) {
        if (rows[i].ts === null) {
            bad.add(i);
            details.push({
                index: i,
                reason: "INVALID_TIMESTAMP"
            });
            continue;
        }

        if (i === 0) continue;

        const diff = rows[i].ts - rows[i - 1].ts;

        if (diff <= 0 || diff < 300) {
            bad.add(i);
            details.push({
                index: i,
                previousTimestamp: rows[i - 1].ts,
                timestamp: rows[i].ts,
                diffSeconds: diff,
                reason:
                    diff === 0
                        ? "DUPLICATE_TIMESTAMP"
                        : diff < 0
                            ? "NON_MONOTONIC_TIMESTAMP"
                            : "SHORT_SPACING"
            });
        }
    }

    return { bad, details };
}

function integrity(rows) {
    const timestamps = rows.map(r => r.ts);
    const unique = new Set(timestamps);

    let chronological = true;
    let shortSpacing = 0;

    for (let i = 1; i < rows.length; i++) {
        const diff = rows[i].ts - rows[i - 1].ts;
        if (diff <= 0) chronological = false;
        if (diff < 300) shortSpacing++;
    }

    return {
        chronological,
        duplicateTimestamps: unique.size !== timestamps.length,
        remainingTimestampAnomalies: shortSpacing,
        remainingShortSpacingRows: shortSpacing,
        allOHLCValid: rows.every(validOHLC),
        negativeVolumeRetained: rows.filter(r => r.volume < 0).length,
        rowCount: rows.length
    };
}

async function main() {
    if (!TOKEN) {
        throw new Error(
            "DHAN_ACCESS_TOKEN is not set. Set it locally before running."
        );
    }

    console.log("==========================================");
    console.log("TradeMind Pro V25.7 LOCAL CONTROL IMPORT");
    console.log("==========================================");
    console.log("Window:", WINDOW.id);
    console.log("From:", WINDOW.fromDate);
    console.log("To:", WINDOW.toDate);
    console.log("Paper only: true");
    console.log("Real orders: false");
    console.log("------------------------------------------");

    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "access-token": TOKEN
        },
        body: JSON.stringify({
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            oi: false,
            fromDate: WINDOW.fromDate,
            toDate: WINDOW.toDate
        })
    });

    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Dhan returned non-JSON response. HTTP ${response.status}. ` +
            text.slice(0, 500)
        );
    }

    if (!response.ok) {
        throw new Error(
            `Dhan HTTP ${response.status}: ${JSON.stringify(data).slice(0, 2000)}`
        );
    }

    const rawRows = normalize(data);

    const invalidOHLC = new Set(
        rawRows
            .map((row, i) => validOHLC(row) ? null : i)
            .filter(i => i !== null)
    );

    const timestampAudit = findTimestampAnomalies(rawRows);

    const canonicalRows = rawRows
        .filter((row, i) =>
            row.ts !== null &&
            !invalidOHLC.has(i) &&
            !timestampAudit.bad.has(i)
        )
        .sort((a, b) => a.ts - b.ts);

    // Defensive timestamp de-duplication.
    const seen = new Set();
    const dedupedRows = [];

    for (const row of canonicalRows) {
        if (seen.has(row.ts)) continue;
        seen.add(row.ts);
        dedupedRows.push(row);
    }

    const report = {
        success: true,
        version: "V25.7-LOCAL-CONTROL-v1",
        status: "CONTROL_IMPORT_COMPLETE",
        mode: "HISTORICAL_DATA_ONLY",
        paperOnly: true,
        realOrders: false,
        brokerOrderEnabled: false,
        brokerOrderSent: false,

        source: {
            provider: "Dhan",
            endpoint: ENDPOINT,
            securityId: "13",
            exchangeSegment: "IDX_I",
            instrument: "INDEX",
            interval: "5",
            oi: false
        },

        window: WINDOW,

        approvedPolicy: {
            invalidOHLC: "REMOVE",
            timestampAnomalies: "REMOVE_ONLY_ANOMALOUS_ROWS",
            negativeVolume: "RETAIN",
            timestampRepair: false,
            candleRepair: false,
            syntheticCandles: false
        },

        counts: {
            rawRows: rawRows.length,
            invalidOHLCRows: invalidOHLC.size,
            timestampAnomalyRows: timestampAudit.bad.size,
            rowsAfterCleaning: canonicalRows.length,
            crossDuplicateRows: canonicalRows.length - dedupedRows.length,
            canonicalRows: dedupedRows.length,
            negativeVolumeRows: dedupedRows.filter(
                r => r.volume < 0
            ).length
        },

        timestampAnomalies: timestampAudit.details,

        integrity: integrity(dedupedRows),

        guard: {
            learningRecordsGenerated: false,
            learningDatasetCalled: false,
            learningEngineCalled: false,
            candidateDiscovery: false,
            validation: false,
            oos: false,
            strategyModified: false,
            realOrders: false
        },

        canonicalRows: dedupedRows
    };

    const outputDir = path.join(process.cwd(), "v25_7_import_output");
    fs.mkdirSync(outputDir, { recursive: true });

    const outputFile = path.join(
        outputDir,
        "v25_7_control_import.json"
    );

    fs.writeFileSync(
        outputFile,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    console.log("HTTP:", response.status);
    console.log("RAW ROWS:", report.counts.rawRows);
    console.log("INVALID OHLC:", report.counts.invalidOHLCRows);
    console.log("TIMESTAMP ANOMALIES:", report.counts.timestampAnomalyRows);
    console.log("CANONICAL ROWS:", report.counts.canonicalRows);
    console.log(
        "NEGATIVE VOLUME RETAINED:",
        report.counts.negativeVolumeRows
    );
    console.log("CHRONOLOGICAL:", report.integrity.chronological);
    console.log(
        "DUPLICATE TIMESTAMPS:",
        report.integrity.duplicateTimestamps
    );
    console.log(
        "ALL OHLC VALID:",
        report.integrity.allOHLCValid
    );
    console.log("OUTPUT:", outputFile);

    if (
        !report.integrity.chronological ||
        report.integrity.duplicateTimestamps ||
        report.integrity.remainingTimestampAnomalies !== 0 ||
        !report.integrity.allOHLCValid
    ) {
        throw new Error("CONTROL IMPORT FAILED INTEGRITY GATE.");
    }

    console.log("------------------------------------------");
    console.log("CONTROL IMPORT INTEGRITY GATE: PASS");
    console.log("STOP — do not run the full S5 import yet.");
    console.log("------------------------------------------");
}

main().catch(error => {
    console.error("IMPORT ERROR:", error.message || error);
    process.exitCode = 1;
});
