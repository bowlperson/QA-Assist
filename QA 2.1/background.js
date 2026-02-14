if (typeof importScripts === "function") {
    try {
        importScripts("enabled-state-controller.js", "event-log-db.js");
    } catch (error) {
        console.error("Failed to load background dependencies", error);
    }
}

const actionApi = (typeof chrome !== "undefined" && (chrome.action || chrome.browserAction)) || null;

const fallbackNormalizeBoolean = (value, fallback = false) => {
    if (value === true || value === "true" || value === 1 || value === "1") {
        return true;
    }

    if (value === false || value === "false" || value === 0 || value === "0") {
        return false;
    }

    return Boolean(fallback);
};

const controllerNamespace = typeof EnabledStateController !== "undefined" ? EnabledStateController : null;
const createEnabledStateController = controllerNamespace?.createEnabledStateController || null;
const normalizeBoolean = controllerNamespace?.normalizeBoolean || fallbackNormalizeBoolean;

const enabledStateController = createEnabledStateController ? createEnabledStateController(chrome) : null;

const SITE_INFO_KEY = "siteInfo";
const SITE_INFO_INITIALIZED_KEY = "siteInfoInitialized";
const STORAGE_MIGRATION_KEYS = [
    "enabled",
    "playbackSpeed",
    "universalSpeed",
    "autoModeEnabled",
    "autoPressNext",
    "autoLoopEnabled",
    "removeEyeTracker",
    "dispatchName",
    "siteOverrides",
    SITE_INFO_KEY,
    SITE_INFO_INITIALIZED_KEY,
    "customSpeedRules",
    "smartSkipEnabled",
    "skipDelay",
    "keyDelay",
    "autoLoopDelay",
    "autoLoopHold",
    "oasModeEnabled",
    "siteRules",
    "validationVocabulary",
    "validationFilterEnabled",
    "antiLagEnabled",
    "antiLagSeekSeconds",
];
const ALERT_ALARM_NAME = "qaAssistAlertScan";
const ALERT_SCAN_PERIOD_MINUTES = 1;
const ALERT_WINDOW_MS = 60 * 60 * 1000;
const ALERT_SPOTLIGHT_TERMS = ["searching face", "detection error", "false positive", "non event", "blocked", "unsafe", "dark glasses"];


function updateBrowserActionIcon(isEnabled) {
    if (!actionApi || typeof actionApi.setIcon !== "function") {
        return;
    }

    const iconPath = isEnabled ? "on.png" : "off.png";
    actionApi.setIcon({ path: iconPath });
}

function broadcastEnabledState(isEnabled, specificTabId) {
    if (!chrome.tabs || typeof chrome.tabs.sendMessage !== "function") {
        return;
    }

    const payload = { enabled: isEnabled };

    if (typeof specificTabId === "number") {
        chrome.tabs.sendMessage(specificTabId, payload, () => chrome.runtime.lastError);
        return;
    }

    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError || !Array.isArray(tabs)) {
            return;
        }

        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, payload, () => chrome.runtime.lastError);
        });
    });
}

if (enabledStateController) {
    enabledStateController.onChange((state) => {
        updateBrowserActionIcon(state);
        broadcastEnabledState(state);
    });

    enabledStateController
        .ensureLoaded()
        .then((state) => {
            updateBrowserActionIcon(state);
        })
        .catch((error) => {
            console.error("Failed to initialize enabled state", error);
        });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
    if (enabledStateController) {
        enabledStateController
            .ensureLoaded()
            .then((state) => {
                broadcastEnabledState(state, tabId);
            })
            .catch((error) => {
                console.error("Failed to sync enabled state to activated tab", error);
            });
        return;
    }

    chrome.storage.local.get("enabled", (data) => {
        chrome.tabs.sendMessage(tabId, { enabled: data.enabled }, () => chrome.runtime.lastError);
    });
});

chrome.runtime.onInstalled.addListener(() => {
    migrateSyncStorage();
    migrateDispatchName();
    initializeSiteDirectory();
    ensureAlertAlarm();
    runAlertScan();
});
chrome.runtime.onStartup.addListener(() => {
    migrateSyncStorage();
    migrateDispatchName();
    initializeSiteDirectory();
    ensureAlertAlarm();
    runAlertScan();
});

if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name === ALERT_ALARM_NAME) {
            runAlertScan();
        }
    });
}


function ensureAlertAlarm() {
    if (!chrome.alarms) {
        return;
    }
    chrome.alarms.create(ALERT_ALARM_NAME, { periodInMinutes: ALERT_SCAN_PERIOD_MINUTES });
}

function isFatigueValidation(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value) {
        return false;
    }
    return value.includes("fatigue") || /\b(low|moderate|critical)\b/.test(value);
}

function matchesSpotlight(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value) {
        return false;
    }
    return ALERT_SPOTLIGHT_TERMS.some((term) => value.includes(term));
}

function getEventTime(log) {
    if (!log) {
        return NaN;
    }
    const candidates = [log.timestampMs, log.createdAt && Date.parse(log.createdAt), log.timestamp && Date.parse(log.timestamp)];
    for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    return NaN;
}

function buildIdentity(log) {
    const truck = String(log?.truckNumber || "").trim() || "Unknown truck";
    const site = String(log?.siteName || "").trim() || "Unknown site";
    return { key: `${truck.toLowerCase()}|${site.toLowerCase()}`, truck, site };
}

function findClusterWindows(events, windowSize, minCount) {
    const timeline = (Array.isArray(events) ? events : [])
        .map((event) => ({ event, time: getEventTime(event) }))
        .filter((entry) => Number.isFinite(entry.time))
        .sort((a, b) => a.time - b.time);

    const clusters = [];
    let start = 0;

    while (start < timeline.length) {
        let end = start;
        while (end + 1 < timeline.length && timeline[end + 1].time - timeline[start].time <= windowSize) {
            end += 1;
        }

        const windowEvents = timeline.slice(start, end + 1);
        if (windowEvents.length >= minCount) {
            clusters.push({
                events: windowEvents.map((entry) => entry.event),
                start: windowEvents[0].time,
                end: windowEvents[windowEvents.length - 1].time,
                count: windowEvents.length,
            });
        }
        start = end + 1;
    }

    return clusters;
}

function collectAlertCandidates(logs) {
    const byIdentity = new Map();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const identity = buildIdentity(log);
        if (!byIdentity.has(identity.key)) {
            byIdentity.set(identity.key, { ...identity, events: [] });
        }
        byIdentity.get(identity.key).events.push(log);
    });

    const candidates = [];
    byIdentity.forEach((group) => {
        const fatigueEvents = group.events.filter((event) => isFatigueValidation(event.callValidationType || event.validationType));
        findClusterWindows(fatigueEvents, ALERT_WINDOW_MS, 3).forEach((cluster) => {
            candidates.push({
                key: `watch|${group.key}|${cluster.start}|${cluster.end}|${cluster.count}`,
                title: `Watch List: ${group.truck}`,
                description: `${group.site} · ${cluster.count} fatigue alerts in 1 hour`,
                createdAt: cluster.end,
            });
        });

        const spotlightEvents = group.events.filter((event) => matchesSpotlight(event.eventType) || matchesSpotlight(event.callValidationType || event.validationType));
        findClusterWindows(spotlightEvents, ALERT_WINDOW_MS, 3).forEach((cluster) => {
            candidates.push({
                key: `spotlight|${group.key}|${cluster.start}|${cluster.end}|${cluster.count}`,
                title: `Technical Spotlight: ${group.truck}`,
                description: `${group.site} · ${cluster.count} technical alerts in 1 hour`,
                createdAt: cluster.end,
            });
        });
    });

    return candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function createAlertRecord(alert) {
    return {
        id: `alert-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        key: alert.key,
        title: alert.title,
        description: alert.description,
        createdAt: Number.isFinite(alert.createdAt) ? alert.createdAt : Date.now(),
        read: false,
    };
}

function updateBadgeFromNotifications(notifications) {
    const unreadCount = (Array.isArray(notifications) ? notifications : []).filter((entry) => !entry.read).length;
    setAlertBadge(unreadCount);
}

function runAlertScan() {
    if (typeof EventLogDB === "undefined" || typeof EventLogDB.getAll !== "function") {
        return;
    }

    Promise.all([
        EventLogDB.getAll(),
        new Promise((resolve) => {
            chrome.storage.local.get({
                notificationsEnabled: true,
                notificationMode: "windows",
                alertNotifications: [],
                seenAlertKeys: [],
            }, resolve);
        }),
    ]).then(([rawLogs, settings]) => {
        if (settings.notificationsEnabled === false) {
            return;
        }

        const seenKeys = new Set(Array.isArray(settings.seenAlertKeys) ? settings.seenAlertKeys : []);
        const existingNotifications = Array.isArray(settings.alertNotifications) ? settings.alertNotifications : [];

        const normalized = (Array.isArray(rawLogs) ? rawLogs : []).map((log) => ({
            ...log,
            timestampMs: getEventTime(log),
        })).filter((log) => Number.isFinite(log.timestampMs));

        const deduped = new Map();
        normalized.forEach((log) => {
            const key = typeof EventLogDB.buildDuplicateKey === "function" ? EventLogDB.buildDuplicateKey(log) : `${log.id || ""}|${log.timestampMs}`;
            deduped.set(key || `${log.id || ""}|${log.timestampMs}`, log);
        });

        const candidates = collectAlertCandidates(Array.from(deduped.values()));
        const newAlerts = candidates.filter((alert) => alert.key && !seenKeys.has(alert.key));
        if (!newAlerts.length) {
            updateBadgeFromNotifications(existingNotifications);
            return;
        }

        const records = newAlerts.map(createAlertRecord);
        const notifications = records.concat(existingNotifications).slice(0, 300);
        records.forEach((record) => seenKeys.add(record.key));
        const seenAlertKeys = Array.from(seenKeys).slice(-800);

        chrome.storage.local.set({ alertNotifications: notifications, seenAlertKeys }, () => {
            updateBadgeFromNotifications(notifications);
            const mode = settings.notificationMode === "extension" ? "extension" : "windows";
            if (mode === "windows") {
                records.forEach((record) => createWindowsNotification(record));
            }
        });
    }).catch((error) => {
        console.error("Alert scan failed", error);
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "eventLogUpsert") {
        if (typeof EventLogDB === "undefined" || typeof EventLogDB.upsert !== "function") {
            sendResponse({ success: false, error: "EventLogDB unavailable in background" });
            return false;
        }

        EventLogDB.upsert(message.event || null)
            .then((record) => {
                runAlertScan();
                sendResponse({ success: true, record: record || null });
            })
            .catch((error) => {
                console.error("Failed to upsert event log", error);
                sendResponse({ success: false, error: error?.message || "Failed to upsert event log" });
            });
        return true;
    }

    if (message.type === "getEnabledState") {
        if (enabledStateController) {
            enabledStateController
                .ensureLoaded()
                .then((state) => sendResponse({ enabled: state }))
                .catch((error) => {
                    console.error("Failed to retrieve enabled state", error);
                    sendResponse({ enabled: false, error: error?.message || "Failed to retrieve enabled state" });
                });
            return true;
        }

        chrome.storage.local.get({ enabled: false }, (data) => {
            sendResponse({ enabled: normalizeBoolean(data.enabled, false) });
        });
        return true;
    }


    if (message.type === "getAlertNotifications") {
        chrome.storage.local.get({ alertNotifications: [] }, (data) => {
            const notifications = Array.isArray(data.alertNotifications) ? data.alertNotifications : [];
            updateBadgeFromNotifications(notifications);
            sendResponse({ notifications });
        });
        return true;
    }

    if (message.type === "markAllAlertsRead") {
        chrome.storage.local.get({ alertNotifications: [] }, (data) => {
            const notifications = (Array.isArray(data.alertNotifications) ? data.alertNotifications : []).map((entry) => ({ ...entry, read: true }));
            chrome.storage.local.set({ alertNotifications: notifications }, () => {
                updateBadgeFromNotifications(notifications);
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.type === "markAlertRead") {
        const id = String(message.id || "");
        chrome.storage.local.get({ alertNotifications: [] }, (data) => {
            const notifications = (Array.isArray(data.alertNotifications) ? data.alertNotifications : []).map((entry) => entry.id === id ? { ...entry, read: true } : entry);
            chrome.storage.local.set({ alertNotifications: notifications }, () => {
                updateBadgeFromNotifications(notifications);
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.type === "deleteAlert") {
        const id = String(message.id || "");
        chrome.storage.local.get({ alertNotifications: [] }, (data) => {
            const notifications = (Array.isArray(data.alertNotifications) ? data.alertNotifications : []).filter((entry) => entry.id !== id);
            chrome.storage.local.set({ alertNotifications: notifications }, () => {
                updateBadgeFromNotifications(notifications);
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.type === "clearAlerts") {
        chrome.storage.local.set({ alertNotifications: [], seenAlertKeys: [] }, () => {
            updateBadgeFromNotifications([]);
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.type === "clearAlertBadge") {
        chrome.storage.local.get({ alertNotifications: [] }, (data) => {
            const notifications = (Array.isArray(data.alertNotifications) ? data.alertNotifications : []).map((entry) => ({ ...entry, read: true }));
            chrome.storage.local.set({ alertNotifications: notifications }, () => {
                updateBadgeFromNotifications(notifications);
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.type === "setEnabledState") {
        if (enabledStateController) {
            enabledStateController
                .setState(message.value)
                .then((state) => sendResponse({ success: true, enabled: state }))
                .catch((error) => {
                    console.error("Failed to update enabled state", error);
                    sendResponse({
                        success: false,
                        enabled: enabledStateController.getCurrentState(),
                        error: error?.message || "Failed to update enabled state",
                    });
                });
            return true;
        }

        const desiredState = normalizeBoolean(message.value, false);
        chrome.storage.local.set({ enabled: desiredState }, () => {
            if (chrome.runtime.lastError) {
                console.error("Failed to update enabled state", chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    enabled: normalizeBoolean(message.value, false),
                    error: chrome.runtime.lastError.message,
                });
                return;
            }

            broadcastEnabledState(desiredState);
            sendResponse({ success: true, enabled: desiredState });
        });
        return true;
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (enabledStateController) {
        enabledStateController.handleStorageChange(changes, areaName);
    }
    if (areaName === "local" && changes.alertNotifications) {
        const next = Array.isArray(changes.alertNotifications.newValue) ? changes.alertNotifications.newValue : [];
        updateBadgeFromNotifications(next);
    }
});


function setAlertBadge(count) {
    if (!actionApi || typeof actionApi.setBadgeText !== "function") {
        return;
    }
    const text = count > 0 ? String(Math.min(count, 99)) : "";
    actionApi.setBadgeText({ text });
    if (typeof actionApi.setBadgeBackgroundColor === "function") {
        actionApi.setBadgeBackgroundColor({ color: "#d93025" });
    }
}

function createWindowsNotification(alert) {
    if (!chrome.notifications || typeof chrome.notifications.create !== "function") {
        return;
    }
    chrome.notifications.create(`qa-alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`, {
        type: "basic",
        iconUrl: "icon.png",
        title: alert.title || "QA Assist alert",
        message: alert.description || "New QA Assist alert.",
        priority: 1,
    });
}

function migrateSyncStorage() {
    if (!chrome.storage || !chrome.storage.sync || typeof chrome.storage.sync.get !== "function") {
        return;
    }

    chrome.storage.sync.get(STORAGE_MIGRATION_KEYS, (syncData) => {
        if (chrome.runtime.lastError || !syncData) {
            return;
        }

        chrome.storage.local.get(STORAGE_MIGRATION_KEYS, (localData) => {
            if (chrome.runtime.lastError) {
                return;
            }

            const dataToMigrate = {};

            STORAGE_MIGRATION_KEYS.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(syncData, key) && localData[key] === undefined) {
                    dataToMigrate[key] = syncData[key];
                }
            });

            if (Object.keys(dataToMigrate).length) {
                chrome.storage.local.set(dataToMigrate);
            }
        });
    });
}

function migrateDispatchName() {
    chrome.storage.local.get(["monitorName", "dispatchName"], (data) => {
        if (chrome.runtime.lastError) {
            return;
        }

        const monitorName = typeof data.monitorName === "string" ? data.monitorName.trim() : "";
        const dispatchName = typeof data.dispatchName === "string" ? data.dispatchName.trim() : "";

        const updates = {};
        if (monitorName && !dispatchName) {
            updates.dispatchName = monitorName;
        }

        const keysToRemove = [];
        if (Object.prototype.hasOwnProperty.call(data, "monitorName")) {
            keysToRemove.push("monitorName");
        }

        if (Object.keys(updates).length) {
            chrome.storage.local.set(updates);
        }

        if (keysToRemove.length) {
            chrome.storage.local.remove(keysToRemove);
        }
    });
}

function initializeSiteDirectory() {
    chrome.storage.local.get([SITE_INFO_KEY, SITE_INFO_INITIALIZED_KEY], (data) => {
        if (data[SITE_INFO_INITIALIZED_KEY]) {
            return;
        }

        fetch(chrome.runtime.getURL("sitelist.txt"))
            .then((response) => response.text())
            .then((text) => {
                const parsedEntries = parseSiteList(text);
                if (!parsedEntries.length) {
                    chrome.storage.local.set({ [SITE_INFO_INITIALIZED_KEY]: true });
                    return;
                }

                const existing = Array.isArray(data[SITE_INFO_KEY]) ? data[SITE_INFO_KEY] : [];
                const merged = mergeSiteInfo(existing, parsedEntries);

                chrome.storage.local.set({
                    [SITE_INFO_KEY]: merged,
                    [SITE_INFO_INITIALIZED_KEY]: true,
                });
            })
            .catch((error) => {
                console.error("Failed to load site information", error);
            });
    });
}

function parseSiteList(text) {
    if (!text) {
        return [];
    }

    const lines = text.split(/\r?\n/);
    const entries = [];

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }

        const cleanedLine = trimmed.replace(/[\u200B-\u200D\uFEFF]/g, "");
        const urlMatch = cleanedLine.match(/(https?:\/\/[^\s]+)/i);
        const ipMatch = cleanedLine.match(/(\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/[^\s]*)?)/);

        let address = urlMatch ? urlMatch[1] : ipMatch ? ipMatch[1] : null;
        if (!address) {
            return;
        }

        address = address.replace(/^\(|\)$/g, "").trim();
        let name = cleanedLine.replace(address, "").trim();
        name = name.replace(/^[-–—]+/, "").trim();
        name = name.replace(/\s{2,}/g, " ");

        if (!name) {
            name = address;
        }

        const entry = createSiteEntry(name.trim(), address.trim());
        if (entry) {
            entries.push(entry);
        }
    });

    return entries;
}

function createSiteEntry(name, address) {
    const matchValue = deriveMatchValue(address);
    if (!matchValue) {
        return null;
    }

    return {
        id: generateId(),
        name: name.trim(),
        address: address.trim(),
        matchValue,
    };
}

function deriveMatchValue(address) {
    if (!address) {
        return "";
    }

    let cleaned = address.trim();
    cleaned = cleaned.replace(/[\(\)]/g, "");

    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
        try {
            const url = new URL(cleaned);
            return url.hostname.toLowerCase();
        } catch (error) {
            cleaned = cleaned.replace(/^https?:\/\//, "");
        }
    }

    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.replace(/\/$/, "");
    cleaned = cleaned.replace(/:.*/, "");

    return cleaned.toLowerCase();
}

function mergeSiteInfo(existingEntries, newEntries) {
    const combined = new Map();

    const allEntries = [...(existingEntries || []), ...(newEntries || [])];

    allEntries.forEach((entry) => {
        if (!entry) {
            return;
        }

        const normalized = normalizeEntry(entry);
        if (!normalized.matchValue) {
            return;
        }

        if (!combined.has(normalized.matchValue)) {
            combined.set(normalized.matchValue, normalized);
        }
    });

    return Array.from(combined.values());
}

function normalizeEntry(entry) {
    const normalized = { ...entry };

    if (!normalized.id) {
        normalized.id = generateId();
    }

    if (normalized.address) {
        normalized.address = normalized.address.trim();
    }

    if (!normalized.matchValue) {
        normalized.matchValue = deriveMatchValue(normalized.address || normalized.name || "");
    }

    if (normalized.name) {
        normalized.name = normalized.name.trim();
    }

    return normalized;
}

function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `site-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
