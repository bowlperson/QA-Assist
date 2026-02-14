const FATIGUE_WINDOW_ONE_HOUR = 60 * 60 * 1000;
const FATIGUE_WINDOW_TWO_HOURS = 2 * 60 * 60 * 1000;
const EVENT_FLUCTUATION_WINDOW = 60 * 1000;
const EVENT_FLUCTUATION_MIN_EVENTS = 3;
const SPOTLIGHT_WINDOW = 60 * 60 * 1000;

const DEFAULT_DATA_KEYWORDS = [
    { type: "eventType", label: "Searching Face", keywords: ["searching face"] },
    { type: "eventType", label: "Detection Error", keywords: ["detection error"] },
    { type: "eventType", label: "False Positive", keywords: ["false positive"] },
    { type: "eventType", label: "Non Event", keywords: ["non event"] },
    { type: "eventType", label: "Blocked", keywords: ["blocked"] },
    { type: "eventType", label: "Unsafe", keywords: ["unsafe"] },
    { type: "eventType", label: "Dark Glasses", keywords: ["dark glasses"] },
    { type: "eventType", label: "Micro Sleep", keywords: ["micro sleep", "microsleep"] },
    { type: "eventType", label: "Distraction", keywords: ["distraction"] },
    { type: "validationType", label: "Low Fatigue", keywords: ["low fatigue", "low"] },
    { type: "validationType", label: "Moderate Fatigue", keywords: ["moderate fatigue", "moderate"] },
    { type: "validationType", label: "Critical Fatigue", keywords: ["critical fatigue", "critical"] },
    { type: "validationType", label: "Blocked", keywords: ["blocked"] },
    { type: "validationType", label: "Unsafe", keywords: ["unsafe"] },
    { type: "validationType", label: "Behavioral Distractions", keywords: ["behavioral distractions"] },
    { type: "validationType", label: "Operational Distractions", keywords: ["operational distractions"] },
    { type: "validationType", label: "Distraction", keywords: ["distraction"] },
];

const TECHNICAL_SPOTLIGHT_TERMS = ["Searching Face", "Detection Error", "False Positive", "Non Event", "Blocked", "Unsafe", "Dark Glasses"];
const DATA_CENTER_FILTERS = [
    { key: "criticalFatigue", label: "Critical Fatigue (V)", type: "validationType", terms: ["Critical Fatigue"] },
    { key: "moderateFatigue", label: "Moderate Fatigue (V)", type: "validationType", terms: ["Moderate Fatigue"] },
    { key: "lowFatigue", label: "Low Fatigue (V)", type: "validationType", terms: ["Low Fatigue"] },
    { key: "blocked", label: "Blocked (V)", type: "validationType", terms: ["Blocked"] },
    { key: "unsafe", label: "Unsafe (V)", type: "validationType", terms: ["Unsafe"] },
    { key: "allFatigue", label: "All Fatigue (V)", type: "validationType", terms: ["Critical Fatigue", "Moderate Fatigue", "Low Fatigue"] },
    { key: "microSleep", label: "Micro Sleep (ET)", type: "eventType", terms: ["Micro Sleep"] },
    { key: "distraction", label: "Distraction (ET)", type: "eventType", terms: ["Distraction"] },
    { key: "safeDistractions", label: "Safe Distractions (V)", type: "validationType", terms: ["Behavioral Distractions", "Operational Distractions", "Distraction"] },
];

let siteStatsContainer = null;
let siteStatsSummary = null;
let watchListOneHour = null;
let watchListTwoHour = null;
let watchRangeStartInput = null;
let watchRangeEndInput = null;
let eventHotFive = null;
let eventHotThree = null;
let validationHotFive = null;
let validationHotThree = null;
let spotlightRangeStartInput = null;
let spotlightRangeEndInput = null;
let watchKeywordSearchInput = null;
let spotlightKeywordSearchInput = null;
let saveWatchFiltersButton = null;
let clearWatchFiltersButton = null;
let saveSpotlightFiltersButton = null;
let clearSpotlightFiltersButton = null;
let dataCenterRangeStartInput = null;
let dataCenterRangeEndInput = null;
let dataCenterFilterInput = null;
let dataCenterGroupByInput = null;
let dataCenterKeywordSearchInput = null;
let dataCenterSortDirectionInput = null;
let saveDataCenterFiltersButton = null;
let clearDataCenterFiltersButton = null;
let dataCenterContainer = null;
let dataCenterModal = null;
let closeDataCenterModalButton = null;
let dataCenterModalList = null;
let dataCenterModalMeta = null;
let fluctuationContainer = null;
let fluctuationExportButton = null;
let refreshButton = null;
let currentFluctuationClusters = [];
let controlToastElement = null;
let controlToastTimeoutId = null;
let activeDataCenterRows = [];
let alertSoundSettings = { enabled: true, volume: 0.25 };
let notificationHubList = null;
let notificationHubUnread = null;
let notificationPrevPage = null;
let notificationNextPage = null;
let notificationPageLabel = null;
let markAllNotificationsReadButton = null;
let clearAllNotificationsButton = null;
let notificationHubEntries = [];
let notificationPageIndex = 0;
const NOTIFICATION_PAGE_SIZE = 7;
let currentDataKeywords = sanitizeDataKeywords(DEFAULT_DATA_KEYWORDS);

document.addEventListener("DOMContentLoaded", () => {
    siteStatsContainer = document.getElementById("siteStatsContainer");
    siteStatsSummary = document.getElementById("siteStatsSummary");
    watchListOneHour = document.getElementById("watchListOneHour");
    watchListTwoHour = document.getElementById("watchListTwoHour");
    watchRangeStartInput = document.getElementById("watchRangeStart");
    watchRangeEndInput = document.getElementById("watchRangeEnd");
    watchKeywordSearchInput = document.getElementById("watchKeywordSearch");
    saveWatchFiltersButton = document.getElementById("saveWatchFilters");
    clearWatchFiltersButton = document.getElementById("clearWatchFilters");
    eventHotFive = document.getElementById("eventHotFive");
    eventHotThree = document.getElementById("eventHotThree");
    validationHotFive = document.getElementById("validationHotFive");
    validationHotThree = document.getElementById("validationHotThree");
    spotlightRangeStartInput = document.getElementById("spotlightRangeStart");
    spotlightRangeEndInput = document.getElementById("spotlightRangeEnd");
    spotlightKeywordSearchInput = document.getElementById("spotlightKeywordSearch");
    saveSpotlightFiltersButton = document.getElementById("saveSpotlightFilters");
    clearSpotlightFiltersButton = document.getElementById("clearSpotlightFilters");
    dataCenterRangeStartInput = document.getElementById("dataCenterRangeStart");
    dataCenterRangeEndInput = document.getElementById("dataCenterRangeEnd");
    dataCenterFilterInput = document.getElementById("dataCenterFilter");
    dataCenterGroupByInput = document.getElementById("dataCenterGroupBy");
    dataCenterKeywordSearchInput = document.getElementById("dataCenterKeywordSearch");
    dataCenterSortDirectionInput = document.getElementById("dataCenterSortDirection");
    saveDataCenterFiltersButton = document.getElementById("saveDataCenterFilters");
    clearDataCenterFiltersButton = document.getElementById("clearDataCenterFilters");
    dataCenterContainer = document.getElementById("dataCenterContainer");
    fluctuationContainer = document.getElementById("fluctuationContainer");
    fluctuationExportButton = document.getElementById("fluctuationExport");
    refreshButton = document.getElementById("controlRefresh");
    controlToastElement = document.getElementById("controlToast");
    notificationHubList = document.getElementById("notificationHubList");
    notificationHubUnread = document.getElementById("notificationHubUnread");
    notificationPrevPage = document.getElementById("notificationPrevPage");
    notificationNextPage = document.getElementById("notificationNextPage");
    notificationPageLabel = document.getElementById("notificationPageLabel");
    markAllNotificationsReadButton = document.getElementById("markAllNotificationsRead");
    clearAllNotificationsButton = document.getElementById("clearAllNotifications");
    dataCenterModal = document.getElementById("dataCenterModal");
    closeDataCenterModalButton = document.getElementById("closeDataCenterModal");
    dataCenterModalList = document.getElementById("dataCenterModalList");
    dataCenterModalMeta = document.getElementById("dataCenterModalMeta");

    CardCollapseState?.initCardCollapseState?.("qaControl");

    if (fluctuationExportButton) {
        fluctuationExportButton.addEventListener("click", () => {
            exportFluctuationsCsv(currentFluctuationClusters);
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            loadControlData({ announce: true, showLoading: true });
        });
    }

    populateDataCenterFilterOptions();
    applyMilitaryInputSettings();
    loadSavedFilters();

    [watchRangeStartInput, watchRangeEndInput, spotlightRangeStartInput, spotlightRangeEndInput, dataCenterRangeStartInput, dataCenterRangeEndInput, dataCenterFilterInput, dataCenterGroupByInput, dataCenterSortDirectionInput].forEach((input) => {
        if (input) {
            input.addEventListener("change", () => loadControlData({ showLoading: true }));
        }
    });
    [watchKeywordSearchInput, spotlightKeywordSearchInput, dataCenterKeywordSearchInput].forEach((input) => {
        if (input) {
            input.addEventListener("input", () => loadControlData({ showLoading: true }));
        }
    });

    if (saveWatchFiltersButton) {
        saveWatchFiltersButton.addEventListener("click", () => saveFilters("watch"));
    }
    if (clearWatchFiltersButton) {
        clearWatchFiltersButton.addEventListener("click", () => clearFilters("watch"));
    }
    if (saveSpotlightFiltersButton) {
        saveSpotlightFiltersButton.addEventListener("click", () => saveFilters("spotlight"));
    }
    if (clearSpotlightFiltersButton) {
        clearSpotlightFiltersButton.addEventListener("click", () => clearFilters("spotlight"));
    }
    if (saveDataCenterFiltersButton) {
        saveDataCenterFiltersButton.addEventListener("click", () => saveFilters("dataCenter"));
    }
    if (clearDataCenterFiltersButton) {
        clearDataCenterFiltersButton.addEventListener("click", () => clearFilters("dataCenter"));
    }

    if (closeDataCenterModalButton) {
        closeDataCenterModalButton.addEventListener("click", closeDataCenterEventsModal);
    }
    if (dataCenterModal) {
        dataCenterModal.addEventListener("click", (event) => {
            if (event.target === dataCenterModal) {
                closeDataCenterEventsModal();
            }
        });
    }

    setupNotificationHub();
    loadNotificationHub();

    loadControlData();
});

function setupNotificationHub() {
    if (notificationPrevPage) {
        notificationPrevPage.addEventListener("click", () => {
            notificationPageIndex = Math.max(0, notificationPageIndex - 1);
            renderNotificationHub();
        });
    }
    if (notificationNextPage) {
        notificationNextPage.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(notificationHubEntries.length / NOTIFICATION_PAGE_SIZE));
            notificationPageIndex = Math.min(totalPages - 1, notificationPageIndex + 1);
            renderNotificationHub();
        });
    }
    if (markAllNotificationsReadButton) {
        markAllNotificationsReadButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "markAllAlertsRead" }, () => loadNotificationHub());
        });
    }
    if (clearAllNotificationsButton) {
        clearAllNotificationsButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "clearAlerts" }, () => loadNotificationHub());
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.alertNotifications) {
            loadNotificationHub();
        }
    });
}

function loadNotificationHub() {
    chrome.runtime.sendMessage({ type: "getAlertNotifications" }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }
        notificationHubEntries = Array.isArray(response?.notifications) ? response.notifications : [];
        const totalPages = Math.max(1, Math.ceil(notificationHubEntries.length / NOTIFICATION_PAGE_SIZE));
        notificationPageIndex = Math.min(notificationPageIndex, totalPages - 1);
        renderNotificationHub();
    });
}

function renderNotificationHub() {
    if (!notificationHubList) {
        return;
    }
    const unread = notificationHubEntries.filter((entry) => !entry.read).length;
    if (notificationHubUnread) {
        notificationHubUnread.textContent = `${unread} unread`;
    }

    const totalPages = Math.max(1, Math.ceil(notificationHubEntries.length / NOTIFICATION_PAGE_SIZE));
    const start = notificationPageIndex * NOTIFICATION_PAGE_SIZE;
    const pageItems = notificationHubEntries.slice(start, start + NOTIFICATION_PAGE_SIZE);

    notificationHubList.innerHTML = "";
    if (!pageItems.length) {
        notificationHubList.innerHTML = '<p class="empty-state">No notifications yet.</p>';
    } else {
        pageItems.forEach((entry) => {
            const row = document.createElement("article");
            row.className = `notification-row${entry.read ? " is-read" : ""}`;
            const timeText = formatTimestamp(entry.createdAt, "—", { hour12: false });
            row.innerHTML = `
                <div class="notification-main">
                    <div class="notification-title">${escapeHtml(entry.title || "Alert")}</div>
                    <div class="notification-description">${escapeHtml(entry.description || "")}</div>
                    <div class="notification-time">${escapeHtml(timeText)}</div>
                </div>
                <div class="notification-actions">
                    <button type="button" class="secondary mark-read-btn" data-id="${escapeHtml(entry.id || "")}">Mark read</button>
                    <button type="button" class="ghost delete-alert-btn" data-id="${escapeHtml(entry.id || "")}">Delete</button>
                </div>
            `;
            notificationHubList.appendChild(row);
        });

        notificationHubList.querySelectorAll(".mark-read-btn").forEach((button) => {
            button.addEventListener("click", () => {
                const id = safeText(button.dataset.id);
                if (!id) return;
                chrome.runtime.sendMessage({ type: "markAlertRead", id }, () => loadNotificationHub());
            });
        });
        notificationHubList.querySelectorAll(".delete-alert-btn").forEach((button) => {
            button.addEventListener("click", () => {
                const id = safeText(button.dataset.id);
                if (!id) return;
                chrome.runtime.sendMessage({ type: "deleteAlert", id }, () => loadNotificationHub());
            });
        });
    }

    if (notificationPageLabel) {
        notificationPageLabel.textContent = `Page ${notificationPageIndex + 1} of ${totalPages}`;
    }
    if (notificationPrevPage) {
        notificationPrevPage.disabled = notificationPageIndex <= 0;
    }
    if (notificationNextPage) {
        notificationNextPage.disabled = notificationPageIndex >= totalPages - 1;
    }
}

function loadControlData(options = {}) {
    const { announce = false, showLoading = false } = options;

    if (showLoading && refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("spinning");
    }

    Promise.all([EventLogDB.getAll(), getControlConfig()]).then(([rawLogs, config]) => {
        currentDataKeywords = config.dataKeywords;
        alertSoundSettings = { enabled: config.notificationSoundEnabled, volume: config.notificationVolume };
        const logs = deduplicateForAnalytics(rawLogs
            .map((log) => normalizeLog(log))
            .filter(Boolean))
            .sort((a, b) => {
                const timeA = getEventTime(a);
                const timeB = getEventTime(b);
                if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
                    return timeA - timeB;
                }
                if (Number.isFinite(timeA)) {
                    return -1;
                }
                if (Number.isFinite(timeB)) {
                    return 1;
                }
                const createdA = Number.isFinite(a.createdAt) ? a.createdAt : 0;
                const createdB = Number.isFinite(b.createdAt) ? b.createdAt : 0;
                return createdA - createdB;
            });

        renderSiteStats(logs, siteStatsContainer, siteStatsSummary);

        const watchFilteredLogs = filterLogsByKeyword(
            filterLogsByRange(logs, watchRangeStartInput?.value, watchRangeEndInput?.value),
            watchKeywordSearchInput?.value,
        );
        const watchLists = buildFatigueWatchLists(watchFilteredLogs);
        renderWatchList(watchListOneHour, watchLists.withinOneHour, {
            emptyMessage: "No trucks have three fatigue events within one hour.",
        });
        renderWatchList(watchListTwoHour, watchLists.withinTwoHours, {
            emptyMessage: "No trucks have three fatigue events within two hours.",
        });

        const spotlightFilteredLogs = filterLogsByKeyword(
            filterLogsByRange(logs, spotlightRangeStartInput?.value, spotlightRangeEndInput?.value),
            spotlightKeywordSearchInput?.value,
        );
        const spotlights = buildSpotlights(spotlightFilteredLogs);
        renderSpotlightList(eventHotFive, spotlights.eventTypes.top, {
            emptyMessage: "No trucks reached five hotspot events within an hour window.",
            tone: "event",
        });
        renderSpotlightList(eventHotThree, spotlights.eventTypes.mid, {
            emptyMessage: "No trucks reached three hotspot events within an hour window.",
            tone: "event",
        });
        renderSpotlightList(validationHotFive, spotlights.validationTypes.top, {
            emptyMessage: "No trucks reached five hotspot validations within an hour window.",
            tone: "validation",
        });
        renderSpotlightList(validationHotThree, spotlights.validationTypes.mid, {
            emptyMessage: "No trucks reached three hotspot validations within an hour window.",
            tone: "validation",
        });

        const dataCenterLogs = filterLogsByRange(logs, dataCenterRangeStartInput?.value, dataCenterRangeEndInput?.value);
        activeDataCenterRows = renderDataCenter(dataCenterLogs);


        currentFluctuationClusters = renderFluctuations(logs, fluctuationContainer);
        updateFluctuationExportButton(fluctuationExportButton, currentFluctuationClusters);

        if (announce) {
            showControlToast("Control center refreshed");
        }

        if (showLoading && refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("spinning");
        }

    }).catch((error) => {
        if (showLoading && refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("spinning");
        }
        console.warn("Failed to load control data", error);
        if (announce) {
            showControlToast("Unable to refresh control center");
        }
    });
}

function normalizeLog(log) {
    if (!log) {
        return null;
    }

    const normalized = { ...log };

    normalized.eventType = safeText(log.eventType);
    normalized.validationType = deriveValidation(log);
    normalized.callValidationType = safeText(log.callValidationType) || normalized.validationType;
    normalized.operatorName = "";
    normalized.truckNumber = safeText(log.truckNumber);
    normalized.siteName = safeText(log.siteName);
    normalized.siteMatchValue = safeText(log.siteMatchValue);
    normalized.pageUrl = safeText(log.pageUrl);
    normalized.eventId = safeText(log.eventId);
    normalized.timestampText = safeText(log.timestamp);
    const createdAtMs = log.createdAt ? Date.parse(log.createdAt) : NaN;
    normalized.createdAt = Number.isFinite(createdAtMs) ? createdAtMs : NaN;

    let timestampMs = parseTimestamp(log);
    if (!Number.isFinite(timestampMs) && Number.isFinite(normalized.createdAt)) {
        timestampMs = normalized.createdAt;
    }
    normalized.timestampMs = Number.isFinite(timestampMs) ? timestampMs : NaN;

    return normalized;
}

function deduplicateForAnalytics(logs) {
    const deduped = new Map();

    let fallbackIndex = 0;
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const key = EventLogDB.buildDuplicateKey(log);
        if (!key) {
            deduped.set(`${safeText(log.id)}|${safeText(log.createdAt)}|${fallbackIndex}`, log);
            fallbackIndex += 1;
            return [];
        }

        deduped.set(key, log);
    });

    return Array.from(deduped.values());
}

function safeText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function sanitizeDataKeywords(input) {
    const source = Array.isArray(input) ? input : DEFAULT_DATA_KEYWORDS;
    const sanitized = [];
    const seen = new Set();
    source.forEach((entry) => {
        const type = entry?.type === "validationType" ? "validationType" : "eventType";
        const label = safeText(entry?.label);
        if (!label) {
            return;
        }
        const key = `${type}|${label.toLowerCase()}`;
        if (seen.has(key)) {
            return;
        }
        const keywords = Array.from(new Set(
            (Array.isArray(entry?.keywords) ? entry.keywords : [])
                .concat([label])
                .map((keyword) => safeText(keyword).toLowerCase())
                .filter(Boolean),
        ));
        sanitized.push({ type, label, keywords });
        seen.add(key);
    });
    return sanitized.length ? sanitized : sanitizeDataKeywords(DEFAULT_DATA_KEYWORDS);
}

function getControlConfig() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ dataKeywords: DEFAULT_DATA_KEYWORDS, notificationsEnabled: true, notificationMode: "windows", notificationSoundEnabled: true, notificationVolume: 0.25 }, (data) => {
            resolve({
                dataKeywords: sanitizeDataKeywords(data.dataKeywords),
                notificationsEnabled: data.notificationsEnabled !== false,
                notificationMode: data.notificationMode === "extension" ? "extension" : "windows",
                notificationSoundEnabled: data.notificationSoundEnabled !== false,
                notificationVolume: Math.max(0, Math.min(1, Number(data.notificationVolume ?? 0.25) || 0.25)),
            });
        });
    });
}

function applyMilitaryInputSettings() {
    [watchRangeStartInput, watchRangeEndInput, spotlightRangeStartInput, spotlightRangeEndInput, dataCenterRangeStartInput, dataCenterRangeEndInput]
        .filter(Boolean)
        .forEach((input) => {
            input.step = "1";
        });
}

function getFilterSnapshot(section) {
    if (section === "watch") {
        return {
            start: watchRangeStartInput?.value || "",
            end: watchRangeEndInput?.value || "",
            keyword: watchKeywordSearchInput?.value || "",
        };
    }
    if (section === "spotlight") {
        return {
            start: spotlightRangeStartInput?.value || "",
            end: spotlightRangeEndInput?.value || "",
            keyword: spotlightKeywordSearchInput?.value || "",
        };
    }
    return {
        start: dataCenterRangeStartInput?.value || "",
        end: dataCenterRangeEndInput?.value || "",
        filter: dataCenterFilterInput?.value || "criticalFatigue",
        groupBy: dataCenterGroupByInput?.value || "truck",
        keyword: dataCenterKeywordSearchInput?.value || "",
        sort: dataCenterSortDirectionInput?.value || "desc",
    };
}

function saveFilters(section) {
    chrome.storage.local.get({ qaControlFilters: {} }, (data) => {
        const next = { ...(data.qaControlFilters || {}) };
        next[section] = getFilterSnapshot(section);
        chrome.storage.local.set({ qaControlFilters: next }, () => showControlToast("Filters saved"));
    });
}

function clearFilters(section) {
    if (section === "watch") {
        if (watchRangeStartInput) watchRangeStartInput.value = "";
        if (watchRangeEndInput) watchRangeEndInput.value = "";
        if (watchKeywordSearchInput) watchKeywordSearchInput.value = "";
    } else if (section === "spotlight") {
        if (spotlightRangeStartInput) spotlightRangeStartInput.value = "";
        if (spotlightRangeEndInput) spotlightRangeEndInput.value = "";
        if (spotlightKeywordSearchInput) spotlightKeywordSearchInput.value = "";
    } else {
        if (dataCenterRangeStartInput) dataCenterRangeStartInput.value = "";
        if (dataCenterRangeEndInput) dataCenterRangeEndInput.value = "";
        if (dataCenterKeywordSearchInput) dataCenterKeywordSearchInput.value = "";
        if (dataCenterFilterInput) dataCenterFilterInput.value = "criticalFatigue";
        if (dataCenterGroupByInput) dataCenterGroupByInput.value = "truck";
        if (dataCenterSortDirectionInput) dataCenterSortDirectionInput.value = "desc";
    }
    chrome.storage.local.get({ qaControlFilters: {} }, (data) => {
        const next = { ...(data.qaControlFilters || {}) };
        delete next[section];
        chrome.storage.local.set({ qaControlFilters: next }, () => {
            loadControlData({ showLoading: true });
            showControlToast("Filters cleared");
        });
    });
}

function loadSavedFilters() {
    chrome.storage.local.get({ qaControlFilters: {} }, (data) => {
        const saved = data.qaControlFilters || {};
        const watch = saved.watch || {};
        const spotlight = saved.spotlight || {};
        const dataCenter = saved.dataCenter || {};
        if (watchRangeStartInput) watchRangeStartInput.value = safeText(watch.start);
        if (watchRangeEndInput) watchRangeEndInput.value = safeText(watch.end);
        if (watchKeywordSearchInput) watchKeywordSearchInput.value = safeText(watch.keyword);
        if (spotlightRangeStartInput) spotlightRangeStartInput.value = safeText(spotlight.start);
        if (spotlightRangeEndInput) spotlightRangeEndInput.value = safeText(spotlight.end);
        if (spotlightKeywordSearchInput) spotlightKeywordSearchInput.value = safeText(spotlight.keyword);
        if (dataCenterRangeStartInput) dataCenterRangeStartInput.value = safeText(dataCenter.start);
        if (dataCenterRangeEndInput) dataCenterRangeEndInput.value = safeText(dataCenter.end);
        if (dataCenterFilterInput) dataCenterFilterInput.value = safeText(dataCenter.filter) || "criticalFatigue";
        if (dataCenterGroupByInput) dataCenterGroupByInput.value = safeText(dataCenter.groupBy) || "truck";
        if (dataCenterKeywordSearchInput) dataCenterKeywordSearchInput.value = safeText(dataCenter.keyword);
        if (dataCenterSortDirectionInput) dataCenterSortDirectionInput.value = safeText(dataCenter.sort) || "desc";
    });
}

function populateDataCenterFilterOptions() {
    if (!dataCenterFilterInput) {
        return;
    }
    dataCenterFilterInput.innerHTML = "";
    DATA_CENTER_FILTERS.forEach((filter) => {
        const option = document.createElement("option");
        option.value = filter.key;
        option.textContent = filter.label;
        dataCenterFilterInput.appendChild(option);
    });
    dataCenterFilterInput.value = "criticalFatigue";
}


function parseRangeInput(value) {
    const raw = safeText(value);
    if (!raw) {
        return NaN;
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function filterLogsByRange(logs, startValue, endValue) {
    const startMs = parseRangeInput(startValue);
    const endMs = parseRangeInput(endValue);

    if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) {
        return Array.isArray(logs) ? logs : [];
    }

    return (Array.isArray(logs) ? logs : []).filter((log) => {
        const eventTime = getEventTime(log);
        if (!Number.isFinite(eventTime)) {
            return false;
        }
        if (Number.isFinite(startMs) && eventTime < startMs) {
            return false;
        }
        if (Number.isFinite(endMs) && eventTime > endMs) {
            return false;
        }
        return true;
    });
}

function filterLogsByKeyword(logs, keywordValue) {
    const needle = safeText(keywordValue).toLowerCase();
    if (!needle) {
        return Array.isArray(logs) ? logs : [];
    }
    return (Array.isArray(logs) ? logs : []).filter((log) => {
        const haystack = [
            log.truckNumber,
            log.siteName,
            log.eventType,
            log.callValidationType,
            log.validationType,
            log.timestampText,
        ].map((value) => safeText(value).toLowerCase()).join(" ");
        return haystack.includes(needle);
    });
}
function deriveValidation(log) {
    const candidates = [
        log.callValidationType,
        log.finalValidation,
        log.validationType,
        log.validationTypeRaw,
        log.validationTypeDetected,
        log.detectedValidation,
    ];

    for (const candidate of candidates) {
        const text = safeText(candidate);
        if (text) {
            return text;
        }
    }

    return "";
}

function parseTimestamp(log) {
    const candidates = [log.timestamp, log.eventTimestamp, log.eventTime, log.createdAt];
    for (const candidate of candidates) {
        const text = safeText(candidate);
        if (!text) {
            continue;
        }
        const parsed = Date.parse(text);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        const fallback = parseLocalDateTime(text);
        if (Number.isFinite(fallback)) {
            return fallback;
        }
    }
    return NaN;
}

function parseLocalDateTime(text) {
    const sanitized = safeText(text).replace(/,/g, " ").trim();
    if (!sanitized) {
        return NaN;
    }

    const normalized = sanitized.replace(/\s+/g, " ");
    const patterns = [
        /^(?<month>\d{1,2})[\/\-](?<day>\d{1,2})[\/\-](?<year>\d{2,4})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?\s*(?<meridiem>AM|PM)?)?$/i,
        /^(?<year>\d{4})[\/\-](?<month>\d{1,2})[\/\-](?<day>\d{1,2})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?\s*(?<meridiem>AM|PM)?)?$/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) {
            continue;
        }

        const groups = match.groups || {};
        const monthNumber = Number(groups.month) - 1;
        const dayNumber = Number(groups.day);
        let yearNumber = Number(groups.year);

        if (groups.year && groups.year.length === 2) {
            yearNumber += yearNumber >= 70 ? 1900 : 2000;
        }

        if (
            Number.isNaN(monthNumber) ||
            Number.isNaN(dayNumber) ||
            Number.isNaN(yearNumber)
        ) {
            continue;
        }

        let hourNumber = groups.hour ? Number(groups.hour) : 0;
        const minuteNumber = groups.minute ? Number(groups.minute) : 0;
        const secondNumber = groups.second ? Number(groups.second) : 0;

        if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber) || Number.isNaN(secondNumber)) {
            continue;
        }

        if (groups.meridiem) {
            const meridiem = groups.meridiem.toUpperCase();
            if (meridiem === "PM" && hourNumber < 12) {
                hourNumber += 12;
            } else if (meridiem === "AM" && hourNumber === 12) {
                hourNumber = 0;
            }
        }

        const parsed = new Date(yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber, 0);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getTime();
        }
    }

    return NaN;
}

function renderSiteStats(logs, container, summaryBadge) {
    const siteMap = new Map();

    logs.forEach((log) => {
        const host = getHost(log.pageUrl);
        const siteKey = log.siteName || host || "Unknown site";
        if (!siteMap.has(siteKey)) {
            siteMap.set(siteKey, {
                name: siteKey,
                host,
                matchValue: log.siteMatchValue,
                total: 0,
                eventTypes: new Map(),
                validations: new Map(),
            });
        }
        const entry = siteMap.get(siteKey);
        entry.total += 1;
        if (log.eventType) {
            entry.eventTypes.set(log.eventType, (entry.eventTypes.get(log.eventType) || 0) + 1);
        }
        const validation = log.callValidationType || log.validationType;
        if (validation) {
            entry.validations.set(validation, (entry.validations.get(validation) || 0) + 1);
        }
    });

    const entries = Array.from(siteMap.values()).sort((a, b) => b.total - a.total);
    summaryBadge.textContent = `${entries.length} site${entries.length === 1 ? "" : "s"}`;

    container.innerHTML = "";
    if (!entries.length) {
        container.innerHTML = '<p class="empty-state">No events logged yet.</p>';
        return;
    }

    entries.forEach((entry) => {
        const card = document.createElement("article");
        card.className = "stat-card";

        const header = document.createElement("header");
        header.className = "stat-card-header";
        const title = document.createElement("h4");
        title.textContent = entry.name;
        const badge = document.createElement("span");
        badge.className = "badge subtle";
        badge.textContent = `${entry.total} event${entry.total === 1 ? "" : "s"}`;
        header.appendChild(title);
        header.appendChild(badge);

        const meta = document.createElement("p");
        meta.className = "stat-meta";
        if (entry.host) {
            meta.textContent = entry.host;
        } else if (entry.matchValue) {
            meta.textContent = entry.matchValue;
        } else {
            meta.textContent = "No site URL recorded";
        }

        const body = document.createElement("div");
        body.className = "stat-card-body";

        body.appendChild(buildCountList(entry.eventTypes, "Event types", { tone: "event" }));
        body.appendChild(buildCountList(entry.validations, "Validation types", { tone: "validation" }));

        card.appendChild(header);
        card.appendChild(meta);
        card.appendChild(body);

        container.appendChild(card);
    });
}

function buildCountList(map, label, { tone } = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "stat-block";

    const heading = document.createElement("h5");
    heading.textContent = label;
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "stat-list";
    const entries = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (!entries.length) {
        const item = document.createElement("li");
        item.textContent = "—";
        list.appendChild(item);
    } else {
        entries.forEach(([key, count]) => {
            const item = document.createElement("li");
            const labelSpan = document.createElement("span");
            const countSpan = document.createElement("span");
            countSpan.className = "count";
            countSpan.textContent = count;

            if (tone === "event") {
                decorateLabel(labelSpan, key, "event");
            } else if (tone === "validation") {
                decorateLabel(labelSpan, key, "validation");
            } else {
                labelSpan.textContent = key;
            }

            item.appendChild(labelSpan);
            item.appendChild(countSpan);
            list.appendChild(item);
        });
    }

    wrapper.appendChild(list);
    return wrapper;
}

function buildFatigueWatchLists(logs) {
    const groups = groupLogsByIdentity(logs, (log) => isFatigueValidation(log.callValidationType || log.validationType));

    const withinOneHour = buildClusterEntries(groups, FATIGUE_WINDOW_ONE_HOUR, 3, (event) => event.callValidationType || event.validationType);
    const withinTwoHours = buildClusterEntries(groups, FATIGUE_WINDOW_TWO_HOURS, 3, (event) => event.callValidationType || event.validationType);

    return { withinOneHour, withinTwoHours };
}

function buildIdentity(log) {
    const truck = safeText(log.truckNumber) || "Unknown truck";
    const site = safeText(log.siteName) || getHost(log.pageUrl) || "Unknown site";
    return {
        key: `${truck.toLowerCase()}|${site.toLowerCase()}`,
        truck,
        site,
    };
}

function groupLogsByIdentity(logs, predicate) {
    const groups = new Map();

    (Array.isArray(logs) ? logs : []).forEach((log) => {
        if (typeof predicate === "function" && !predicate(log)) {
            return;
        }

        const identity = buildIdentity(log);
        if (!groups.has(identity.key)) {
            groups.set(identity.key, { ...identity, events: [] });
        }

        groups.get(identity.key).events.push(log);
    });

    return groups;
}

function findClusterWindows(events, windowSize, minCount) {
    const timeline = (Array.isArray(events) ? events : [])
        .filter((event) => Number.isFinite(getEventTime(event)))
        .sort((a, b) => getEventTime(a) - getEventTime(b));

    const clusters = [];
    let start = 0;

    while (start < timeline.length) {
        let end = start;
        while (end + 1 < timeline.length && getEventTime(timeline[end + 1]) - getEventTime(timeline[start]) <= windowSize) {
            end += 1;
        }

        const windowEvents = timeline.slice(start, end + 1);
        if (windowEvents.length >= minCount) {
            clusters.push({
                events: windowEvents,
                start: getEventTime(windowEvents[0]),
                end: getEventTime(windowEvents[windowEvents.length - 1]),
                count: windowEvents.length,
            });
        }

        start = end + 1;
    }

    return clusters;
}

function buildClusterEntries(groups, windowSize, minCount, labelResolver) {
    const entries = [];

    groups.forEach((group) => {
        const clusters = findClusterWindows(group.events, windowSize, minCount);
        clusters.forEach((cluster) => {
            const breakdown = new Map();
            cluster.events.forEach((event) => {
                const label = safeText(labelResolver ? labelResolver(event) : event.eventType) || "—";
                breakdown.set(label, (breakdown.get(label) || 0) + 1);
            });

            entries.push({
                truck: group.truck,
                site: group.site,
                total: cluster.count,
                latest: cluster.end,
                breakdown,
                window: { start: cluster.start, end: cluster.end },
                events: cluster.events,
            });
        });
    });

    return entries.sort((a, b) => b.latest - a.latest || b.total - a.total);
}

function renderWatchList(container, entries, { emptyMessage }) {
    renderSpotlightList(container, entries, {
        emptyMessage,
        tone: "validation",
        labelType: "watch",
    });
}

function buildSpotlights(logs) {
    const eventGrouped = groupLogsByIdentity(logs, (event) => isSpotlightEventType(event.eventType));
    const eventEntries = buildClusterEntries(
        eventGrouped,
        SPOTLIGHT_WINDOW,
        3,
        (event) => event.eventType,
    );

    const validationGrouped = groupLogsByIdentity(logs, (event) => isSpotlightValidation(event.callValidationType || event.validationType));
    const validationEntries = buildClusterEntries(
        validationGrouped,
        SPOTLIGHT_WINDOW,
        3,
        (event) => event.callValidationType || event.validationType,
    );

    return {
        eventTypes: {
            top: eventEntries.filter((entry) => entry.total >= 5),
            mid: eventEntries.filter((entry) => entry.total >= 3 && entry.total < 5),
        },
        validationTypes: {
            top: validationEntries.filter((entry) => entry.total >= 5),
            mid: validationEntries.filter((entry) => entry.total >= 3 && entry.total < 5),
        },
    };
}

function renderSpotlightList(container, entries, { emptyMessage, tone, labelType = "spotlight" }) {
    container.innerHTML = "";
    if (!entries.length) {
        container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }

    entries.forEach((entry) => {
        const card = document.createElement("article");
        card.className = "spotlight-card";

        const heading = document.createElement("header");
        heading.className = "spotlight-header";

        const identity = document.createElement("div");
        const nameDiv = document.createElement("div");
        nameDiv.className = "spotlight-name";
        nameDiv.textContent = entry.truck;
        const siteDiv = document.createElement("div");
        siteDiv.className = "spotlight-meta";
        siteDiv.textContent = entry.site;
        identity.appendChild(nameDiv);
        identity.appendChild(siteDiv);

        const headingAside = document.createElement("div");
        headingAside.className = "spotlight-header-aside";
        const badge = document.createElement("span");
        badge.className = "badge subtle";
        badge.textContent = `${entry.total} ${entry.total === 1 ? "Alert" : "Alerts"}`;
        headingAside.appendChild(badge);

        const events = Array.isArray(entry.events) ? entry.events.filter(Boolean) : [];

        let indicator = null;
        if (events.length) {
            indicator = document.createElement("span");
            indicator.className = "spotlight-toggle-indicator";
            indicator.textContent = "+";
            headingAside.appendChild(indicator);
        }

        heading.appendChild(identity);
        heading.appendChild(headingAside);

        const body = document.createElement("div");
        body.className = "spotlight-body";

        const breakdownList = document.createElement("ul");
        breakdownList.className = "spotlight-breakdown";
        Array.from(entry.breakdown.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([label, count]) => {
                const item = document.createElement("li");
                const labelSpan = document.createElement("span");
                const countSpan = document.createElement("span");
                countSpan.className = "count";
                countSpan.textContent = count;
                if (tone === "event") {
                    decorateLabel(labelSpan, label, "event");
                } else {
                    decorateLabel(labelSpan, label, "validation");
                }
                item.appendChild(labelSpan);
                item.appendChild(countSpan);
                breakdownList.appendChild(item);
            });

        body.appendChild(breakdownList);

        let detailsSection = null;
        if (events.length) {
            detailsSection = document.createElement("div");
            detailsSection.className = "spotlight-event-details";
            const list = document.createElement("ul");
            list.className = "spotlight-events";
            events.forEach((eventLog) => {
                const item = document.createElement("li");

                const timeSpan = document.createElement("span");
                timeSpan.className = "event-time";
                timeSpan.textContent = getEventDisplayTime(eventLog);

                const eventSpan = document.createElement("span");
                eventSpan.className = "event-type";
                decorateLabel(eventSpan, eventLog.eventType, "event");

                const validationSpan = document.createElement("span");
                validationSpan.className = "event-validation";
                decorateLabel(validationSpan, eventLog.callValidationType || eventLog.validationType, "validation");

                item.appendChild(timeSpan);
                item.appendChild(eventSpan);
                item.appendChild(validationSpan);
                list.appendChild(item);
            });

            detailsSection.appendChild(list);
            body.appendChild(detailsSection);
        }

        const footer = document.createElement("div");
        footer.className = "spotlight-footer";
        const rangeText = entry.window ? formatRange(entry.window.start, entry.window.end) : "";
        const relativeText = formatRelative(entry.latest);
        const labelText = labelType === "watch" ? "Fatigue cluster" : "Technical cluster";
        footer.textContent = rangeText ? `${labelText} · ${rangeText} · ${relativeText}` : `${labelText} · ${relativeText}`;

        card.appendChild(heading);
        card.appendChild(body);
        card.appendChild(footer);

        if (events.length && detailsSection) {
            card.classList.add("toggleable");
            card.setAttribute("tabindex", "0");
            card.setAttribute("role", "button");
            card.setAttribute("aria-expanded", "false");

            const updateExpansion = (expanded) => {
                card.classList.toggle("expanded", expanded);
                card.setAttribute("aria-expanded", expanded ? "true" : "false");
                if (indicator) {
                    indicator.textContent = expanded ? "−" : "+";
                }
            };

            const handleToggle = () => {
                const nextState = !card.classList.contains("expanded");
                updateExpansion(nextState);
            };

            card.addEventListener("click", (event) => {
                const interactiveTarget = event.target.closest("a, button, select, input, textarea, label");
                if (interactiveTarget) {
                    return;
                }
                event.preventDefault();
                handleToggle();
            });

            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleToggle();
                }
            });
        }

        container.appendChild(card);
    });
}

function renderDataCenter(logs) {
    if (!dataCenterContainer) {
        return [];
    }
    const filterKey = safeText(dataCenterFilterInput?.value) || "criticalFatigue";
    const filterConfig = DATA_CENTER_FILTERS.find((entry) => entry.key === filterKey) || DATA_CENTER_FILTERS[0];
    const groupBy = safeText(dataCenterGroupByInput?.value) === "site" ? "site" : "truck";
    const keyword = safeText(dataCenterKeywordSearchInput?.value).toLowerCase();
    const sortDirection = safeText(dataCenterSortDirectionInput?.value) === "asc" ? "asc" : "desc";

    const matched = (Array.isArray(logs) ? logs : []).filter((log) => eventMatchesDataCenterFilter(log, filterConfig, keyword));
    const grouped = new Map();
    matched.forEach((log) => {
        const truck = safeText(log.truckNumber) || "Unknown truck";
        const site = safeText(log.siteName) || getHost(log.pageUrl) || "Unknown site";
        const key = groupBy === "site" ? site.toLowerCase() : truck.toLowerCase();
        if (!grouped.has(key)) {
            grouped.set(key, { truck, site, events: [] });
        }
        grouped.get(key).events.push(log);
    });

    const rows = Array.from(grouped.values()).map((bucket) => {
        const sortedEvents = bucket.events.slice().sort((a, b) => getEventTime(b) - getEventTime(a));
        return {
            truck: bucket.truck,
            site: bucket.site,
            search: filterConfig.label,
            count: sortedEvents.length,
            latestEvent: sortedEvents[0] || null,
            events: sortedEvents,
            filterKey: filterConfig.key,
        };
    });

    rows.sort((a, b) => (sortDirection === "asc" ? a.count - b.count : b.count - a.count) || getEventTime(b.latestEvent) - getEventTime(a.latestEvent));

    dataCenterContainer.innerHTML = "";
    if (!rows.length) {
        dataCenterContainer.innerHTML = '<p class="empty-state">No Data Center matches found.</p>';
        return [];
    }

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `<thead><tr><th>Truck #</th><th>Site</th><th>Search #</th><th>Date</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const dateText = row.latestEvent ? getEventDisplayTime(row.latestEvent) : "—";
        tr.innerHTML = `<td>${escapeHtml(row.truck)}</td><td>${escapeHtml(row.site)}</td><td><button type="button" class="link-button data-center-link" data-row-index="${index}">${escapeHtml(row.search)} · ${row.count}</button></td><td>${escapeHtml(dateText)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    dataCenterContainer.appendChild(table);

    dataCenterContainer.querySelectorAll(".data-center-link").forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.rowIndex);
            if (Number.isFinite(index) && rows[index]) {
                openDataCenterEventsModal(rows[index]);
            }
        });
    });

    return rows;
}

function eventMatchesDataCenterFilter(log, filterConfig, keyword) {
    const sourceValue = filterConfig.type === "eventType"
        ? safeText(log.eventType).toLowerCase()
        : safeText(log.callValidationType || log.validationType).toLowerCase();
    const aliasPool = filterConfig.terms.flatMap((term) => getAliasesForLabel(filterConfig.type, term));
    const filterMatch = aliasPool.some((alias) => sourceValue.includes(alias));
    if (!filterMatch) {
        return false;
    }
    if (!keyword) {
        return true;
    }
    const haystack = [
        log.truckNumber,
        log.siteName,
        log.eventType,
        log.callValidationType,
        log.validationType,
        log.timestampText,
    ].map((value) => safeText(value).toLowerCase()).join(" ");
    return haystack.includes(keyword);
}

function escapeHtml(value) {
    return safeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}


function openDataCenterEventsModal(row) {
    if (!dataCenterModal || !dataCenterModalList || !dataCenterModalMeta || !row) {
        return;
    }
    dataCenterModalMeta.textContent = `${row.truck} · ${row.site} · ${row.search}`;
    dataCenterModalList.innerHTML = "";
    (Array.isArray(row.events) ? row.events : []).forEach((eventLog) => {
        const item = document.createElement("li");
        const timeSpan = document.createElement("span");
        timeSpan.className = "event-time";
        timeSpan.textContent = getEventDisplayTime(eventLog);
        const eventSpan = document.createElement("span");
        eventSpan.className = "event-type";
        decorateLabel(eventSpan, eventLog.eventType, "event");
        const validationSpan = document.createElement("span");
        validationSpan.className = "event-validation";
        decorateLabel(validationSpan, eventLog.callValidationType || eventLog.validationType, "validation");
        item.append(timeSpan, eventSpan, validationSpan);
        dataCenterModalList.appendChild(item);
    });
    dataCenterModal.classList.add("show");
    dataCenterModal.setAttribute("aria-hidden", "false");
}

function closeDataCenterEventsModal() {
    if (!dataCenterModal) {
        return;
    }
    dataCenterModal.classList.remove("show");
    dataCenterModal.setAttribute("aria-hidden", "true");
}

function playNotificationSound() {
    if (!alertSoundSettings.enabled) {
        return;
    }
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return;
        }
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const tones = [
            { frequency: 1175, duration: 0.12, delay: 0 },
            { frequency: 880, duration: 0.14, delay: 0.09 },
        ];
        tones.forEach((tone) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(tone.frequency, now + tone.delay);
            gain.gain.setValueAtTime(0.0001, now + tone.delay);
            gain.gain.linearRampToValueAtTime(0.25 * alertSoundSettings.volume, now + tone.delay + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + tone.delay);
            osc.stop(now + tone.delay + tone.duration);
        });
        setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch (error) {
        // ignored
    }
}

function renderFluctuations(logs, container) {
    const clusters = buildFluctuationClusters(logs);
    container.innerHTML = "";

    if (!clusters.length) {
        container.innerHTML = '<p class="empty-state">No event clusters detected.</p>';
        return clusters;
    }

    clusters.forEach((cluster) => {
        const card = document.createElement("article");
        card.className = "fluctuation-card";

        const header = document.createElement("header");
        header.className = "fluctuation-header";
        header.innerHTML = `
            <div class="fluctuation-header-meta">
                <span class="truck-chip">${cluster.truckNumber}</span>
                <span>${formatRange(cluster.start, cluster.end)}</span>
            </div>
            <span class="badge subtle">${cluster.events.length} events</span>
        `;

        const list = document.createElement("ul");
        list.className = "fluctuation-events";
        cluster.events.forEach((event) => {
            const item = document.createElement("li");
            const truckSpan = document.createElement("span");
            truckSpan.className = "event-truck";
            truckSpan.textContent = cluster.truckNumber;

            const timeSpan = document.createElement("span");
            timeSpan.className = "event-time";
            timeSpan.textContent = getEventDisplayTime(event);

            const eventSpan = document.createElement("span");
            eventSpan.className = "event-type";
            decorateLabel(eventSpan, event.eventType, "event");

            const validationSpan = document.createElement("span");
            validationSpan.className = "event-validation";
            decorateLabel(
                validationSpan,
                event.callValidationType || event.validationType,
                "validation",
            );

            const siteSpan = document.createElement("span");
            siteSpan.className = "event-site";
            siteSpan.textContent = safeText(event.siteName) || getHost(event.pageUrl) || "Unknown site";

            item.appendChild(truckSpan);
            item.appendChild(timeSpan);
            item.appendChild(eventSpan);
            item.appendChild(validationSpan);
            item.appendChild(siteSpan);
            list.appendChild(item);
        });

        card.appendChild(header);
        card.appendChild(list);
        container.appendChild(card);
    });

    return clusters;
}

function buildFluctuationClusters(logs) {
    const clusters = [];
    const byTruck = new Map();

    logs.forEach((log) => {
        if (!Number.isFinite(getEventTime(log))) {
            return;
        }
        const truckRaw = safeText(log.truckNumber);
        if (!truckRaw) {
            return;
        }
        const truckKey = truckRaw.toUpperCase();
        if (!byTruck.has(truckKey)) {
            byTruck.set(truckKey, { display: truckRaw, events: [] });
        }
        const bucket = byTruck.get(truckKey);
        if (!bucket.display && truckRaw) {
            bucket.display = truckRaw;
        }
        bucket.events.push(log);
    });

    byTruck.forEach((bucket, truckKey) => {
        const sorted = bucket.events
            .map((event) => ({ event, time: getEventTime(event) }))
            .filter((entry) => Number.isFinite(entry.time))
            .sort((a, b) => a.time - b.time);

        let start = 0;
        const windows = [];

        for (let end = 0; end < sorted.length; end += 1) {
            const endTime = sorted[end].time;
            while (start < end && endTime - sorted[start].time > EVENT_FLUCTUATION_WINDOW) {
                start += 1;
            }

            const count = end - start + 1;
            if (count >= EVENT_FLUCTUATION_MIN_EVENTS) {
                windows.push({ start, end });
            }
        }

        if (!windows.length) {
            return;
        }

        const merged = [];
        windows.forEach((window) => {
            const last = merged[merged.length - 1];
            if (!last || window.start > last.end) {
                merged.push({ ...window });
            } else {
                last.end = Math.max(last.end, window.end);
            }
        });

        merged.forEach((window) => {
            const events = sorted.slice(window.start, window.end + 1).map((entry) => entry.event);
            if (events.length >= EVENT_FLUCTUATION_MIN_EVENTS) {
                clusters.push({
                    truckNumber: safeText(events[0].truckNumber) || bucket.display || truckKey,
                    start: getEventTime(events[0]),
                    end: getEventTime(events[events.length - 1]),
                    events,
                });
            }
        });
    });

    return clusters.sort((a, b) => b.end - a.end);
}

function getEventTime(event) {
    if (!event) {
        return NaN;
    }
    if (Number.isFinite(event.timestampMs)) {
        return event.timestampMs;
    }
    if (Number.isFinite(event.createdAt)) {
        return event.createdAt;
    }
    const parsed = event.createdAt ? Date.parse(event.createdAt) : NaN;
    if (Number.isFinite(parsed)) {
        return parsed;
    }
    return NaN;
}

function getEventDisplayTime(event) {
    const text = safeText(event?.timestampText);
    if (text) {
        return text;
    }
    const timestamp = getEventTime(event);
    if (Number.isFinite(timestamp)) {
        return formatTimestamp(timestamp, "—", { hour12: false });
    }
    return "—";
}

function decorateLabel(element, label, category) {
    const text = safeText(label);
    element.textContent = text || "—";
    if (!text) {
        return;
    }

    const toneClass = category === "validation" ? getValidationToneClass(text) : getEventToneClass(text);
    if (toneClass) {
        element.classList.add("tone-label", toneClass);
    } else {
        element.classList.add("tone-label");
    }
}

function getValidationToneClass(label) {
    const value = safeText(label).toLowerCase();
    if (!value) {
        return "";
    }
    if (value.includes("critical")) {
        return "tone-validation-critical";
    }
    if (value.includes("moderate")) {
        return "tone-validation-moderate";
    }
    if (value.includes("low")) {
        return "tone-validation-low";
    }
    if (value.includes("searching face")) {
        return "tone-validation-search";
    }
    if (value.includes("blocked")) {
        return "tone-validation-blocked";
    }
    if (value.includes("detection error")) {
        return "tone-validation-detection";
    }
    if (value.includes("false positive")) {
        return "tone-validation-false-positive";
    }
    if (value.includes("unsafe distraction")) {
        return "tone-validation-unsafe-distraction";
    }
    if (value.includes("unsafe")) {
        return "tone-validation-unsafe";
    }
    if (value.includes("face")) {
        return "tone-validation-face";
    }
    if (value.includes("no video")) {
        return "tone-validation-no-video";
    }
    if (value.includes("non event")) {
        return "tone-validation-non-event";
    }
    return "tone-validation-default";
}

function getEventToneClass(label) {
    const value = safeText(label).toLowerCase();
    if (!value) {
        return "";
    }
    if (value.includes("microsleep")) {
        return "tone-event-microsleep";
    }
    if (value.includes("distraction")) {
        return "tone-event-distraction";
    }
    if (value.includes("searching face")) {
        return "tone-event-search";
    }
    if (value.includes("pending review")) {
        return "tone-event-pending";
    }
    if (value.includes("blocked")) {
        return "tone-event-blocked";
    }
    return "tone-event-default";
}

function formatTimestamp(timestampMs, fallbackText, options) {
    if (Number.isFinite(timestampMs)) {
        try {
            return new Date(timestampMs).toLocaleString(undefined, options);
        } catch (error) {
            // ignored
        }
    }
    return fallbackText || "—";
}

function formatRange(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return "Unknown time";
    }
    const start = new Date(startMs);
    const end = new Date(endMs);
    const formatterOptions = { hour12: false };
    return `${start.toLocaleTimeString(undefined, formatterOptions)} – ${end.toLocaleTimeString(
        undefined,
        formatterOptions,
    )}`;
}

function formatTimestampForCsv(timestampMs, fallbackText) {
    if (Number.isFinite(timestampMs)) {
        try {
            return new Date(timestampMs).toISOString();
        } catch (error) {
            // ignored
        }
    }
    return fallbackText || "";
}

function formatRelative(timestampMs) {
    if (!Number.isFinite(timestampMs)) {
        return "at an unknown time";
    }
    const now = Date.now();
    const diff = now - timestampMs;
    if (diff < 60 * 1000) {
        return "just now";
    }
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.round(diff / (60 * 1000));
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.round(diff / (60 * 60 * 1000));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function updateFluctuationExportButton(button, clusters) {
    if (!button) {
        return;
    }

    const hasData = Array.isArray(clusters) && clusters.length > 0;
    button.disabled = !hasData;
    button.title = hasData ? "Download fluctuations as CSV" : "No fluctuation data to export";
}

function exportFluctuationsCsv(clusters) {
    if (!Array.isArray(clusters) || !clusters.length) {
        showControlToast("No fluctuation data to export");
        return;
    }

    const rows = [
        ["Truck", "Window Start", "Window End", "Event Timestamp", "Event Type", "Validation", "Site"],
    ];

    clusters.forEach((cluster) => {
        const windowStart = formatTimestampForCsv(cluster.start, cluster.events[0]?.timestampText || "");
        const windowEnd = formatTimestampForCsv(
            cluster.end,
            cluster.events[cluster.events.length - 1]?.timestampText || "",
        );

        cluster.events.forEach((event) => {
            rows.push([
                safeText(cluster.truckNumber),
                windowStart,
                windowEnd,
                formatTimestampForCsv(getEventTime(event), event.timestampText || ""),
                safeText(event.eventType),
                safeText(event.callValidationType || event.validationType),
                safeText(event.siteName) || getHost(event.pageUrl) || "",
            ]);
        });
    });

    const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `qa-assist-fluctuations-${timestamp}.csv`;

    triggerCsvDownload(csv, filename);
    copyCsvToClipboard(csv);

    const exportedRows = rows.length - 1;
    showControlToast(
        `Exported ${exportedRows} row${exportedRows === 1 ? "" : "s"} of fluctuation data`,
    );
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    const text = String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function triggerCsvDownload(csv, filename) {
    try {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        // ignored
    }
}

function copyCsvToClipboard(csv) {
    if (!navigator?.clipboard?.writeText) {
        return;
    }
    navigator.clipboard.writeText(csv).catch(() => {
        // ignored
    });
}

function showControlToast(message) {
    if (!controlToastElement) {
        return;
    }

    controlToastElement.textContent = message;
    controlToastElement.classList.add("show");

    if (controlToastTimeoutId) {
        clearTimeout(controlToastTimeoutId);
    }

    controlToastTimeoutId = setTimeout(() => {
        controlToastElement?.classList.remove("show");
        controlToastTimeoutId = null;
    }, 2200);
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dataCenterModal?.classList.contains("show")) {
        closeDataCenterEventsModal();
    }
});

function getHost(url) {
    const text = safeText(url);
    if (!text) {
        return "";
    }
    try {
        const { hostname } = new URL(text);
        return hostname;
    } catch (error) {
        return "";
    }
}

function isFatigueValidation(text) {
    const value = safeText(text).toLowerCase();
    if (!value) {
        return false;
    }
    if (value.includes("fatigue")) {
        return true;
    }
    return /\b(low|moderate|critical)\b/.test(value);
}

function isSpotlightEventType(text) {
    return matchKeywordAliases("eventType", TECHNICAL_SPOTLIGHT_TERMS, text);
}

function isSpotlightValidation(text) {
    return matchKeywordAliases("validationType", TECHNICAL_SPOTLIGHT_TERMS, text);
}

function matchKeywordAliases(type, labels, value) {
    const text = safeText(value).toLowerCase();
    if (!text) {
        return false;
    }
    return labels.some((label) => {
        const aliases = getAliasesForLabel(type, label);
        return aliases.some((alias) => text.includes(alias));
    });
}

function getAliasesForLabel(type, label) {
    const needle = safeText(label).toLowerCase();
    const matches = currentDataKeywords.filter((entry) => entry.type === type && safeText(entry.label).toLowerCase() === needle);
    if (!matches.length) {
        return [needle];
    }
    return Array.from(new Set(matches.flatMap((entry) => entry.keywords)));
}
