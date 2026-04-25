(function (globalScope) {
    const DB_NAME = "qaAssistEventLogs";
    const DB_VERSION = 1;
    const STORE_NAME = "eventLogs";
    const MIGRATION_FLAG = "qaEventLogsMigratedToIndexedDb";

    let dbPromise = null;
    let migrationPromise = null;

    function safeText(value) {
        if (value === null || value === undefined) {
            return "";
        }
        return String(value).trim();
    }

    function normalizeKeyPart(value) {
        return safeText(value).toLowerCase();
    }

    function parseTimestampMs(input) {
        const raw = safeText(input);
        if (!raw) {
            return NaN;
        }

        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) {
            return parsed;
        }

        return NaN;
    }

    function deriveEventDate(log) {
        const explicitDate = safeText(log?.eventDate || log?.date);
        if (explicitDate) {
            return explicitDate;
        }

        const timestampMs = parseTimestampMs(log?.timestamp || log?.eventTimestamp || log?.eventTime);
        if (Number.isFinite(timestampMs)) {
            return new Date(timestampMs).toISOString().slice(0, 10);
        }

        const createdAtMs = parseTimestampMs(log?.createdAt);
        if (Number.isFinite(createdAtMs)) {
            return new Date(createdAtMs).toISOString().slice(0, 10);
        }

        return "";
    }

    function buildDuplicateKey(log) {
        const eventType = normalizeKeyPart(log?.eventType);
        const timestamp = normalizeKeyPart(log?.timestamp);
        const eventDate = normalizeKeyPart(deriveEventDate(log));
        const truckNumber = normalizeKeyPart(log?.truckNumber);
        const siteName = normalizeKeyPart(log?.siteName || log?.siteMatchValue);

        if (!eventType || !timestamp || !eventDate || !truckNumber || !siteName) {
            return "";
        }

        return [eventType, timestamp, eventDate, truckNumber, siteName].join("|");
    }

    function generateId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }

        return `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    function normalizeLog(log) {
        const record = { ...(log || {}) };

        record.id = safeText(record.id) || generateId();
        record.timestamp = safeText(record.timestamp);
        record.eventType = safeText(record.eventType);
        record.truckNumber = safeText(record.truckNumber);
        record.operatorName = "";
        record.siteName = safeText(record.siteName);
        record.siteMatchValue = safeText(record.siteMatchValue);

        if (!record.eventDate) {
            record.eventDate = deriveEventDate(record);
        } else {
            record.eventDate = safeText(record.eventDate);
        }

        const timestampMs = parseTimestampMs(record.timestamp || record.eventTimestamp || record.eventTime);
        const createdAtText = safeText(record.createdAt) || new Date().toISOString();
        const createdAtMs = parseTimestampMs(createdAtText);

        record.createdAt = createdAtText;
        record.createdAtMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
        record.timestampMs = Number.isFinite(timestampMs) ? timestampMs : record.createdAtMs;

        const duplicateKey = buildDuplicateKey(record);
        if (duplicateKey) {
            record.duplicateKey = duplicateKey;
        } else if (Object.prototype.hasOwnProperty.call(record, "duplicateKey")) {
            delete record.duplicateKey;
        }

        if (!Array.isArray(record.callHistory)) {
            record.callHistory = [];
        }

        return record;
    }

    function openDb() {
        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const store = db.objectStoreNames.contains(STORE_NAME)
                    ? event.target.transaction.objectStore(STORE_NAME)
                    : db.createObjectStore(STORE_NAME, { keyPath: "id" });

                if (!store.indexNames.contains("byEventKey")) {
                    store.createIndex("byEventKey", "eventKey", { unique: false });
                }

                if (!store.indexNames.contains("byTimestampMs")) {
                    store.createIndex("byTimestampMs", "timestampMs", { unique: false });
                }

                if (!store.indexNames.contains("byDuplicateKey")) {
                    store.createIndex("byDuplicateKey", "duplicateKey", { unique: true });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
        });

        return dbPromise;
    }

    function runTransaction(mode, callback) {
        return openDb().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, mode);
                    const store = tx.objectStore(STORE_NAME);

                    let result;
                    try {
                        result = callback(store, tx);
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    tx.oncomplete = () => resolve(result);
                    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
                    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
                }),
        );
    }

    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
        });
    }

    function migrateFromStorage() {
        if (migrationPromise) {
            return migrationPromise;
        }

        migrationPromise = new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve();
                return;
            }

            chrome.storage.local.get({ [MIGRATION_FLAG]: false, eventLogs: [] }, async (data) => {
                const alreadyMigrated = Boolean(data[MIGRATION_FLAG]);
                const legacyLogs = Array.isArray(data.eventLogs) ? data.eventLogs : [];

                if (alreadyMigrated || !legacyLogs.length) {
                    chrome.storage.local.set({ [MIGRATION_FLAG]: true }, () => resolve());
                    return;
                }

                try {
                    await runTransaction("readwrite", (store) => {
                        legacyLogs.forEach((log) => {
                            try {
                                const normalized = normalizeLog(log);
                                const duplicateKey = normalized.duplicateKey;
                                if (!duplicateKey) {
                                    store.put(normalized);
                                    return;
                                }

                                const duplicateIndex = store.index("byDuplicateKey");
                                const getRequest = duplicateIndex.get(duplicateKey);
                                getRequest.onsuccess = () => {
                                    const existing = getRequest.result;
                                    if (!existing) {
                                        store.put(normalized);
                                        return;
                                    }

                                    const merged = {
                                        ...existing,
                                        ...normalized,
                                        id: existing.id,
                                        createdAt: existing.createdAt || normalized.createdAt,
                                        createdAtMs: Number.isFinite(existing.createdAtMs)
                                            ? existing.createdAtMs
                                            : normalized.createdAtMs,
                                        callHistory: Array.isArray(existing.callHistory)
                                            ? existing.callHistory
                                            : normalized.callHistory,
                                        bookmarked: Boolean(existing.bookmarked),
                                        comment: safeText(existing.comment),
                                    };

                                    store.put(normalizeLog(merged));
                                };
                            } catch (error) {
                                console.warn("Failed to migrate legacy event log row", error);
                            }
                        });
                    });
                } catch (error) {
                    console.warn("Failed to migrate legacy event logs", error);
                }

                chrome.storage.local.remove("eventLogs", () => {
                    chrome.storage.local.set({ [MIGRATION_FLAG]: true }, () => resolve());
                });
            });
        });

        return migrationPromise;
    }

    async function upsert(log) {
        const normalized = normalizeLog(log);

        await migrateFromStorage();

        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);

            const finalizePut = (record) => {
                const putRequest = store.put(normalizeLog(record));
                putRequest.onsuccess = () => resolve(record);
                putRequest.onerror = () => reject(putRequest.error || new Error("Failed to upsert event log"));
            };

            if (!normalized.duplicateKey) {
                finalizePut(normalized);
            } else {
                const duplicateIndex = store.index("byDuplicateKey");
                const existingRequest = duplicateIndex.get(normalized.duplicateKey);
                existingRequest.onsuccess = () => {
                    const existing = existingRequest.result;
                    if (!existing) {
                        finalizePut(normalized);
                        return;
                    }

                    const merged = {
                        ...existing,
                        ...normalized,
                        id: existing.id,
                        createdAt: existing.createdAt || normalized.createdAt,
                        createdAtMs: Number.isFinite(existing.createdAtMs) ? existing.createdAtMs : normalized.createdAtMs,
                        callHistory: Array.isArray(existing.callHistory) ? existing.callHistory : normalized.callHistory,
                        bookmarked: Boolean(existing.bookmarked),
                        comment: safeText(existing.comment),
                    };

                    finalizePut(merged);
                };
                existingRequest.onerror = () => reject(existingRequest.error || new Error("Failed to read duplicate"));
            }

            tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
            tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
        });
    }

    async function getAll() {
        await migrateFromStorage();
        return runTransaction("readonly", (store) => {
            const request = store.getAll();
            return requestToPromise(request);
        }).then((result) => (Array.isArray(result) ? result.map(normalizeLog) : []));
    }

    async function remove(id) {
        if (!id) {
            return;
        }
        await migrateFromStorage();
        await runTransaction("readwrite", (store) => {
            store.delete(id);
        });
    }

    async function clearAll() {
        await migrateFromStorage();
        await runTransaction("readwrite", (store) => {
            store.clear();
        });
    }

    async function replaceAll(logs) {
        await migrateFromStorage();
        await runTransaction("readwrite", (store) => {
            store.clear();
            (Array.isArray(logs) ? logs : []).forEach((log) => {
                store.put(normalizeLog(log));
            });
        });
    }

    globalScope.EventLogDB = {
        upsert,
        getAll,
        remove,
        clearAll,
        replaceAll,
        normalizeLog,
        buildDuplicateKey,
        deriveEventDate,
    };
})(typeof window !== "undefined" ? window : globalThis);
