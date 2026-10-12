export class CollectionProgressError extends Error {
    readonly counts: { collected: number; inserted: number; duplicates: number; updated: number; reactivated: number; deactivated: number };
    constructor(counts: CollectionProgressError['counts']) { super('COLLECTION_INTERRUPTED'); this.counts = counts; }
}
