/*
===========================================================
 TradeMind Pro
 V25.7-DSC-v20
 S5 FINAL COMBINED CLEAN-DATA AUDIT
 ----------------------------------------------------------
 PURPOSE:
 Final controlled S5 data-policy audit before any historical
 importer is authorized.

 POLICY UNDER TEST:
   1. Remove invalid OHLC rows.
   2. Remove timestamp-anomaly rows (short spacing < 300s).
   3. Retain negative-volume candles.
   4. Do NOT repair timestamps.
   5. Do NOT create synthetic candles.
   6. Use the exact V25.7 production VWAP policy:
        Math.max(0, n(c.v, 0))

 IMPORTANT:
   - This is NOT a trading test.
   - learning-engine.js is NOT modified.
   - No learning records are generated.
   - No strategy/threshold changes.
   - No real orders.
===========================================================
*/

const DHAN_URL = "https://api.dhan.co/v2/charts/intraday";

const WINDOWS = [
  { id: "A", fromDate: "2021-12-28 00:00:00", toDate: "2022-02-26 00:00:00" },
  { id: "B", fromDate: "2022-02-26 00:00:00", toDate: "2022-04-27 00:00:00" },
  { id: "C", fromDate: "2022-04-27 00:00:00", toDate: "2022-06-26 00:00:00" }
];

const REQUEST = {
  securityId: "13",
  exchangeSegment: "IDX_I",
  instrument: "INDEX",
  interval: "5",
  oi: false
};

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function isValidOHLC(c) {
  const o = n(c.o, NaN);
  const h = n(c.h, NaN);
  const l = n(c.l, NaN);
  const cl = n(c.c, NaN);

  if (![o, h, l, cl].every(Number.isFinite)) return false;
  if (!(h >= Math.max(o, cl))) return false;
  if (!(l <= Math.min(o, cl))) return false;
  if (!(h >= l)) return false;

  return true;
}

function normalizeResponse(data) {
  const ts = Array.isArray(data?.timestamp) ? data.timestamp : [];
  const op = Array.isArray(data?.open) ? data.open : [];
  const hi = Array.isArray(data?.high) ? data.high : [];
  const lo = Array.isArray(data?.low) ? data.low : [];
  const cl = Array.isArray(data?.close) ? data.close : [];
  const vol = Array.isArray(data?.volume) ? data.volume : [];

  const rows = [];
  const len = Math.min(
    ts.length, op.length, hi.length, lo.length, cl.length, vol.length
  );

  for (let i = 0; i < len; i++) {
    rows.push({
      sourceIndex: i,
      ts: n(ts[i], NaN),
      o: n(op[i], NaN),
      h: n(hi[i], NaN),
      l: n(lo[i], NaN),
      c: n(cl[i], NaN),
      v: n(vol[i], 0)
    });
  }

  return rows;
}

function auditTimestampAnomalies(rows) {
  const anomalies = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].ts;
    const cur = rows[i].ts;
    const diff = cur - prev;

    if (!Number.isFinite(diff)) {
      anomalies.push({
        sourceIndex: rows[i].sourceIndex,
        previousTimestamp: prev,
        timestamp: cur,
        diffSeconds: null,
        reason: "NON_NUMERIC_TIMESTAMP"
      });
      continue;
    }

    // Overnight/session gaps are expected.
    // Only flag a short interval below the required 5-minute grid.
    if (diff > 0 && diff < 300) {
      anomalies.push({
        sourceIndex: rows[i].sourceIndex,
        previousTimestamp: prev,
        timestamp: cur,
        diffSeconds: diff,
        reason: "SHORT_SPACING"
      });
    }

    if (diff <= 0) {
      anomalies.push({
        sourceIndex: rows[i].sourceIndex,
        previousTimestamp: prev,
        timestamp: cur,
        diffSeconds: diff,
        reason: diff === 0 ? "DUPLICATE_TIMESTAMP" : "NON_MONOTONIC_TIMESTAMP"
      });
    }
  }

  return anomalies;
}

function ema(values, period) {
  if (values.length < period) return null;
  let value = values.slice(0, period)
    .reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

function rsi(values, period) {
  if (values.length <= period) return null;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;

    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(rows, period) {
  if (rows.length <= period) return null;

  const tr = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      tr.push(rows[i].h - rows[i].l);
      continue;
    }

    const prevClose = rows[i - 1].c;
    tr.push(Math.max(
      rows[i].h - rows[i].l,
      Math.abs(rows[i].h - prevClose),
      Math.abs(rows[i].l - prevClose)
    ));
  }

  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < tr.length; i++) {
    value = ((value * (period - 1)) + tr[i]) / period;
  }

  return value;
}

function productionSessionVWAP(rows) {
  if (!rows.length) return null;

  let pv = 0;
  let vv = 0;

  for (const c of rows) {
    const typical = (c.h + c.l + c.c) / 3;
    const volume = Math.max(0, n(c.v, 0));

    pv += typical * volume;
    vv += volume;
  }

  return vv > 0 ? pv / vv : null;
}

function featureSnapshot(rows) {
  if (rows.length < 22) {
    return {
      ema9: null,
      ema21: null,
      rsi14: null,
      atr14: null,
      vwap: null,
      emaState: null,
      vwapDirection: null
    };
  }

  const closes = rows.map(x => x.c);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r = rsi(closes, 14);
  const a = atr(rows, 14);
  const v = productionSessionVWAP(rows);

  return {
    ema9: e9,
    ema21: e21,
    rsi14: r,
    atr14: a,
    vwap: v,
    emaState:
      e9 == null || e21 == null ? null :
      e9 > e21 ? "BULL" :
      e9 < e21 ? "BEAR" : "FLAT",
    vwapDirection:
      v == null ? null :
      rows[rows.length - 1].c > v ? "ABOVE" :
      rows[rows.length - 1].c < v ? "BELOW" : "AT"
  };
}

function equalNumber(a, b, eps = 1e-9) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

async function fetchWindow(token, window) {
  const body = {
    ...REQUEST,
    fromDate: window.fromDate,
    toDate: window.toDate
  };

  const response = await fetch(DHAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": token
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") || "";
  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  return {
    response,
    contentType,
    data
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const token = process.env.DHAN_ACCESS_TOKEN;

  if (!token) {
    return res.status(200).json({
      success: false,
      version: "V25.7-DSC-v20",
      status: "CONFIG_ERROR",
      paperOnly: true,
      realOrders: false,
      error: "DHAN_ACCESS_TOKEN is not configured."
    });
  }

  try {
    const results = [];
    let rawRowsTotal = 0;
    let retainedRowsTotal = 0;
    let invalidOHLCTotal = 0;
    let timestampAnomalyTotal = 0;
    let negativeVolumeTotal = 0;

    for (const window of WINDOWS) {
      const { response, contentType, data } =
        await fetchWindow(token, window);

      if (!response.ok) {
        return res.status(200).json({
          success: false,
          version: "V25.7-DSC-v20",
          status: "DHAN_HTTP_ERROR",
          paperOnly: true,
          realOrders: false,
          window,
          http: {
            status: response.status,
            ok: response.ok,
            contentType,
            parseStatus: data ? "JSON" : "UNKNOWN"
          },
          dhanResponse: data
        });
      }

      const rawRows = normalizeResponse(data);

      rawRowsTotal += rawRows.length;

      const invalidOHLCIndexes = new Set();
      for (const row of rawRows) {
        if (!isValidOHLC(row)) invalidOHLCIndexes.add(row.sourceIndex);
        if (n(row.v, 0) < 0) negativeVolumeTotal++;
      }

      const timestampAnomalies = auditTimestampAnomalies(rawRows);
      const timestampAnomalyIndexes = new Set(
        timestampAnomalies.map(x => x.sourceIndex)
      );

      invalidOHLCTotal += invalidOHLCIndexes.size;
      timestampAnomalyTotal += timestampAnomalyIndexes.size;

      const finalRows = rawRows.filter(row =>
        !invalidOHLCIndexes.has(row.sourceIndex) &&
        !timestampAnomalyIndexes.has(row.sourceIndex)
      );

      retainedRowsTotal += finalRows.length;

      const finalTimestampAudit = auditTimestampAnomalies(finalRows);

      const rawFeatures = featureSnapshot(rawRows);
      const finalFeatures = featureSnapshot(finalRows);

      const featureComparison = {
        ema9: {
          changed: !equalNumber(rawFeatures.ema9, finalFeatures.ema9),
          absDifference:
            rawFeatures.ema9 == null || finalFeatures.ema9 == null
              ? null
              : Math.abs(rawFeatures.ema9 - finalFeatures.ema9)
        },
        ema21: {
          changed: !equalNumber(rawFeatures.ema21, finalFeatures.ema21),
          absDifference:
            rawFeatures.ema21 == null || finalFeatures.ema21 == null
              ? null
              : Math.abs(rawFeatures.ema21 - finalFeatures.ema21)
        },
        rsi14: {
          changed: !equalNumber(rawFeatures.rsi14, finalFeatures.rsi14),
          absDifference:
            rawFeatures.rsi14 == null || finalFeatures.rsi14 == null
              ? null
              : Math.abs(rawFeatures.rsi14 - finalFeatures.rsi14)
        },
        atr14: {
          changed: !equalNumber(rawFeatures.atr14, finalFeatures.atr14),
          absDifference:
            rawFeatures.atr14 == null || finalFeatures.atr14 == null
              ? null
              : Math.abs(rawFeatures.atr14 - finalFeatures.atr14)
        },
        vwap: {
          changed: !equalNumber(rawFeatures.vwap, finalFeatures.vwap),
          absDifference:
            rawFeatures.vwap == null || finalFeatures.vwap == null
              ? null
              : Math.abs(rawFeatures.vwap - finalFeatures.vwap)
        }
      };

      const featureStateComparison = {
        emaStateChanged:
          rawFeatures.emaState !== finalFeatures.emaState,
        vwapDirectionChanged:
          rawFeatures.vwapDirection !== finalFeatures.vwapDirection
      };

      results.push({
        window,
        http: {
          status: response.status,
          ok: response.ok,
          contentType,
          parseStatus: "JSON"
        },
        rawRows: rawRows.length,
        invalidOHLCRows: invalidOHLCIndexes.size,
        timestampAnomalyRows: timestampAnomalies.length,
        negativeVolumeRows: rawRows.filter(x => n(x.v, 0) < 0).length,
        retainedRows: finalRows.length,
        retainedPct: rawRows.length
          ? Number((finalRows.length / rawRows.length * 100).toFixed(4))
          : 0,
        removedRows: rawRows.length - finalRows.length,
        removalReasons: {
          INVALID_OHLC: invalidOHLCIndexes.size,
          TIMESTAMP_ANOMALY: timestampAnomalyIndexes.size,
          NEGATIVE_VOLUME: 0
        },
        timestampAnomalies,
        finalIntegrity: {
          chronological: finalRows.every(
            (x, i) => i === 0 || x.ts > finalRows[i - 1].ts
          ),
          duplicateTimestamps:
            new Set(finalRows.map(x => x.ts)).size !== finalRows.length,
          remainingShortSpacingRows: finalTimestampAudit.filter(
            x => x.reason === "SHORT_SPACING"
          ).length,
          remainingTimestampAnomalies: finalTimestampAudit.length,
          allOHLCValid: finalRows.every(isValidOHLC),
          negativeVolumeRetained: finalRows.filter(
            x => n(x.v, 0) < 0
          ).length
        },
        featureComparison,
        featureStateComparison,
        rawFeatures,
        finalFeatures
      });
    }

    const allFeatureChecks = results.flatMap(x =>
      Object.values(x.featureComparison).map(v => v.changed)
    );

    const allStateChanges = results.flatMap(x => [
      x.featureStateComparison.emaStateChanged,
      x.featureStateComparison.vwapDirectionChanged
    ]);

    const finalIntegrityPass = results.every(x =>
      x.finalIntegrity.chronological &&
      !x.finalIntegrity.duplicateTimestamps &&
      x.finalIntegrity.remainingShortSpacingRows === 0 &&
      x.finalIntegrity.remainingTimestampAnomalies === 0 &&
      x.finalIntegrity.allOHLCValid
    );

    const featureImpactFree =
      !allFeatureChecks.some(Boolean) &&
      !allStateChanges.some(Boolean);

    return res.status(200).json({
      success: true,
      version: "V25.7-DSC-v20",
      status: "COMPLETED",
      mode: "V25_7_DHAN_S5_FINAL_COMBINED_CLEAN_DATA_AUDIT",
      paperOnly: true,
      realOrders: false,
      brokerOrderEnabled: false,
      brokerOrderSent: false,

      purpose:
        "Apply the proposed final S5 data policy in one controlled audit and verify final dataset integrity and downstream feature stability before importer authorization.",

      thisIsNotATradingTest: true,

      policy: {
        invalidOHLC: "REMOVE",
        timestampAnomalies: "REMOVE_ONLY_ANOMALOUS_ROWS",
        negativeVolume: "RETAIN_CANDLE",
        negativeVolumeVWAPTreatment:
          "Math.max(0, n(c.v, 0))",
        timestampRepair: false,
        candleRepair: false,
        syntheticCandles: false
      },

      aggregateAudit: {
        windows: WINDOWS.length,
        rawRows: rawRowsTotal,
        invalidOHLCRows: invalidOHLCTotal,
        timestampAnomalyRows: timestampAnomalyTotal,
        negativeVolumeRows: negativeVolumeTotal,
        retainedRows: retainedRowsTotal,
        removedRows: rawRowsTotal - retainedRowsTotal,
        retainedPct: rawRowsTotal
          ? Number((retainedRowsTotal / rawRowsTotal * 100).toFixed(4))
          : 0
      },

      windowResults: results,

      finalDecisionAudit: {
        finalIntegrityPass,
        downstreamFeatureImpactFree: featureImpactFree,
        importerAuthorization: false,
        reason:
          "This endpoint is an audit only. Historical importer authorization remains a separate controlled decision after review."
      },

      interpretation: {
        learningRecordsGenerated: false,
        healthStatesCalculated: false,
        strategyModified: false,
        thresholdTuning: false,
        validationRun: false,
        oosRun: false,
        candleRepairPerformed: false,
        syntheticCandlesCreated: false,
        realOrders: false,
        conclusion:
          finalIntegrityPass && featureImpactFree
            ? "S5_FINAL_COMBINED_POLICY_AUDIT_CLEAN"
            : "S5_FINAL_COMBINED_POLICY_REQUIRES_REVIEW",
        decision:
          finalIntegrityPass && featureImpactFree
            ? "READY_FOR_IMPORTER_REVIEW"
            : "DO_NOT_AUTHORIZE_IMPORTER"
      },

      nextStep:
        "Inspect the complete combined S5 policy result. Do not modify learning-engine.js from this audit."
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      version: "V25.7-DSC-v20",
      status: "ERROR",
      paperOnly: true,
      realOrders: false,
      brokerOrderEnabled: false,
      brokerOrderSent: false,
      error: error?.message || String(error)
    });
  }
}
