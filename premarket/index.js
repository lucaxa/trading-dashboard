import { PREMARKET_CONFIG } from "./config.js";
import { createEmptySelection } from "./models.js";

export function runPreMarketSelection(input = {}) {

    const result =
        createEmptySelection();

    result.generatedAt =
        new Date().toISOString();

    result.metadata.cutoff =
        PREMARKET_CONFIG.PREMARKET_CUTOFF;

    result.metadata.informationCutoffEnforced =
        PREMARKET_CONFIG.ENFORCE_INFORMATION_CUTOFF;

    if (!PREMARKET_CONFIG.REQUIRE_CANDIDATE) {

        result.selectionStatus =
            "NO_SELECTION_ENGINE_IMPLEMENTED";

        result.noTradeReason =
            "Pre-Market Selection Engine V1 skeleton only";

    }

    return result;

}
