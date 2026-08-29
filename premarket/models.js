export function createEmptySelection() {

    return {
        version: "PMSE-V1",
        mode: "RESEARCH",

        generatedAt: null,
        marketDate: null,

        marketRegime: {
            status: "UNKNOWN",
            score: null,
            reasons: []
        },

        candidates: [],

        selectionStatus: "NOT_READY",

        noTradeReason: null,

        evidence: [],

        metadata: {
            cutoff: null,
            informationCutoffEnforced: true
        }
    };

}
