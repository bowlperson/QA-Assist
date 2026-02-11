if (typeof importScripts === "function") {
    try {
        importScripts("enabled-state-controller.js");
    } catch (error) {
        console.error("Failed to load enabled state controller", error);
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
});
chrome.runtime.onStartup.addListener(() => {
    migrateSyncStorage();
    migrateDispatchName();
    initializeSiteDirectory();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
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
});

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
