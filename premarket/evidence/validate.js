export function validateEvidenceTimestamp(
    item,
    cutoff
) {

    if (!item) {
        throw new Error("Evidence item is required");
    }

    if (!item.publishedAt) {
        throw new Error(
            "Evidence item requires publishedAt"
        );
    }

    if (!item.observedAt) {
        throw new Error(
            "Evidence item requires observedAt"
        );
    }

    const published =
        new Date(item.publishedAt).getTime();

    const observed =
        new Date(item.observedAt).getTime();

    const cutoffTime =
        new Date(cutoff).getTime();

    if (!Number.isFinite(published)) {
        throw new Error(
            "publishedAt is invalid"
        );
    }

    if (!Number.isFinite(observed)) {
        throw new Error(
            "observedAt is invalid"
        );
    }

    if (!Number.isFinite(cutoffTime)) {
        throw new Error(
            "cutoff is invalid"
        );
    }

    /*
     * Historical information cannot become eligible
     * merely because it was observed before cutoff.
     *
     * It must have been published by the cutoff.
     */
    if (published > cutoffTime) {

        throw new Error(
            "Evidence was published after cutoff"
        );

    }

    return true;

}
