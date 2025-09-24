const SITE_INFO_KEY = "siteInfo";
const SITE_INFO_INITIALIZED_KEY = "siteInfoInitialized";

chrome.tabs.onActivated.addListener(() => {
    chrome.storage.sync.get("enabled", function (data) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { enabled: data.enabled });
            }
        });
    });
});

chrome.runtime.onInstalled.addListener(() => {
    initializeSiteDirectory();
});
chrome.runtime.onStartup.addListener(() => {
    initializeSiteDirectory();
});

function initializeSiteDirectory() {
    chrome.storage.sync.get([SITE_INFO_KEY, SITE_INFO_INITIALIZED_KEY], (data) => {
        if (data[SITE_INFO_INITIALIZED_KEY]) {
            return;
        }

        fetch(chrome.runtime.getURL("sitelist.txt"))
            .then((response) => response.text())
            .then((text) => {
                const parsedEntries = parseSiteList(text);
                if (!parsedEntries.length) {
                    chrome.storage.sync.set({ [SITE_INFO_INITIALIZED_KEY]: true });
                    return;
                }

                const existing = Array.isArray(data[SITE_INFO_KEY]) ? data[SITE_INFO_KEY] : [];
                const merged = mergeSiteInfo(existing, parsedEntries);

                chrome.storage.sync.set({
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
