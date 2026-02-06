const REQUIRED_CLASS_SELECTORS = [
    ".uiTabItem.unselectable",
    ".uiTabItem.unselectable.selected",
    ".uiTabItem.unselectable.selected.roundedBegin",
    ".gvEventListItemLeft",
    ".gvEventListItemRight",
    ".gvEventListItemPadding.selected.primarysel",
];

const OAS_REQUIRED_SELECTORS = [
    ".List .content",
    ".List .item .Thumbnail .image-container",
];

const DEFAULT_VALIDATION_VOCABULARY = [
    { label: "Blocked", keywords: ["blocked"] },
    { label: "Critical", keywords: ["critical"] },
    { label: "Moderate", keywords: ["moderate"] },
    { label: "3 Low/hr", keywords: ["low"] },
    { label: "Cellphone", keywords: ["cell phone", "cellphone", "cell", "phone"] },
    { label: "False Positive", keywords: ["false", "non"] },
    { label: "Lost Connection", keywords: ["lost connection", "lost", "disconnect"] },
];

const UNIVERSAL_SPEED_VALUES = new Set(["off", "1", "1.25", "1.5", "1.75", "2"]);
const DEFAULT_ANTI_LAG_SEEK = 0.5;
const LAG_RECOVERY_DELAY_MS = 180;
const LAG_RECOVERY_COOLDOWN_MS = 1500;
const DROPPED_FRAME_SPIKE = 8;

const state = {
    enabled: false,
    autoMode: false,
    autoPressNext: false,
    autoLoop: false,
    playbackSpeed: 1,
    universalSpeed: "off",
    smartSkipEnabled: true,
    smartSkipDelay: 6,
    bufferDelay: 4,
    autoLoopDelay: 8,
    autoLoopHold: 5,
    oasMode: false,
    removeEyeTracker: false,
    antiLagEnabled: false,
    antiLagSeekSeconds: DEFAULT_ANTI_LAG_SEEK,
    hasRequiredElements: false,
    mode: "Off",
    siteName: "",
    siteUrl: "",
    lastEventSignature: "",
    lastEventData: null,
    pendingSkipSignature: "",
    pendingBufferSignature: "",
    skipTimerId: null,
    bufferTimerId: null,
    loopTimerId: null,
    selectionRetryTimer: null,
    holdReleaseTimer: null,
    holdRepeatInterval: null,
    holdTarget: null,
    holdingLeft: false,
    automationIntervalId: null,
    lastPlaybackAt: 0,
    validationVocabulary: DEFAULT_VALIDATION_VOCABULARY,
    validationMatchers: [],
    validationFilterEnabled: true,
    siteOverrides: [],
};

const videoLagState = new WeakMap();

function normalizeBoolean(value, fallback = false) {
    if (value === true || value === "true" || value === 1 || value === "1") {
        return true;
    }

    if (value === false || value === "false" || value === 0 || value === "0") {
        return false;
    }

    return fallback;
}

function parsePositiveNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback >= 0 ? fallback : 0;
    }
    return parsed < 0 ? 0 : parsed;
}

function sanitizeUniversalSpeed(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        value = String(value);
    }

    if (typeof value !== "string") {
        return "off";
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return "off";
    }

    if (trimmed.toLowerCase() === "off") {
        return "off";
    }

    if (UNIVERSAL_SPEED_VALUES.has(trimmed)) {
        return trimmed;
    }

    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
        const asString = numeric.toString();
        if (UNIVERSAL_SPEED_VALUES.has(asString)) {
            return asString;
        }
    }

    return "off";
}

function getPageUrl() {
    return window.location.href.split("#")[0];
}

function cloneDefaultVocabulary() {
    return DEFAULT_VALIDATION_VOCABULARY.map((entry) => ({
        label: entry.label,
        keywords: Array.isArray(entry.keywords) ? [...entry.keywords] : [],
    }));
}

function sanitizeVocabularyInput(input) {
    if (!Array.isArray(input)) {
        return cloneDefaultVocabulary();
    }

    const seen = new Set();
    const sanitized = input
        .map((entry) => {
            const label = String(entry?.label || "").trim();
            if (!label) {
                return null;
            }

            const lowerLabel = label.toLowerCase();
            if (seen.has(lowerLabel)) {
                return null;
            }

            const keywordSource = Array.isArray(entry?.keywords)
                ? entry.keywords
                : typeof entry?.keywords === "string"
                    ? entry.keywords.split(",")
                    : [];

            const keywords = Array.from(
                new Set(
                    keywordSource
                        .concat(label)
                        .map((keyword) => String(keyword || "").trim())
                        .filter(Boolean),
                ),
            );

            seen.add(lowerLabel);
            return { label, keywords };
        })
        .filter(Boolean);

    return sanitized.length ? sanitized : cloneDefaultVocabulary();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildValidationMatchers(list) {
    return list.map((entry) => {
        const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
        const normalizedKeywords = Array.from(
            new Set(keywords.concat(entry.label).map((keyword) => String(keyword || "").trim()).filter(Boolean)),
        );

        const regexes = normalizedKeywords
            .map((keyword) => {
                if (!keyword) {
                    return null;
                }
                if (/^[\w\s]+$/.test(keyword)) {
                    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
                }
                return null;
            })
            .filter(Boolean);

        const lowerKeywords = normalizedKeywords.map((keyword) => keyword.toLowerCase());

        return {
            label: entry.label,
            regexes,
            lowerKeywords,
        };
    });
}

function findValidationLabel(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) {
        return "";
    }

    const lower = cleaned.toLowerCase();

    for (const matcher of state.validationMatchers) {
        if (matcher.regexes.some((regex) => regex.test(cleaned))) {
            return matcher.label;
        }

        if (matcher.lowerKeywords.some((keyword) => keyword && lower.includes(keyword))) {
            return matcher.label;
        }
    }

    return "";
}

function applyValidationPreferences(rawList, filterEnabled) {
    state.validationVocabulary = sanitizeVocabularyInput(rawList);
    state.validationFilterEnabled = typeof filterEnabled === "boolean" ? filterEnabled : true;
    state.validationMatchers = buildValidationMatchers(state.validationVocabulary);
}

function looksLikeValidationLabel(text) {
    if (!text) {
        return false;
    }

    const cleaned = String(text).trim();
    if (!cleaned) {
        return false;
    }

    if (!state.validationFilterEnabled) {
        return false;
    }

    const normalized = cleaned.toLowerCase();
    return state.validationMatchers.some((matcher) => {
        if (matcher.regexes.some((regex) => regex.test(cleaned))) {
            return true;
        }
        return matcher.lowerKeywords.some((keyword) => keyword && normalized.includes(keyword));
    });
}

function cleanValidationText(text) {
    if (!text) {
        return "";
    }
    return text.replace(/validation[:\s-]*/i, "").trim();
}

function extractValidationFromContainer(container) {
    if (!container) {
        return "";
    }

    const selectors = [
        ".validation-label",
        "label.validation",
        "span.validation",
        "[data-field='validation']",
    ];

    for (const selector of selectors) {
        const node = container.querySelector(selector);
        if (node && node.textContent) {
            const cleaned = cleanValidationText(node.textContent);
            if (cleaned) {
                return cleaned;
            }
        }
    }

    const candidates = Array.from(container.querySelectorAll("label, span, div, p, strong"));
    for (const node of candidates) {
        const text = node?.textContent || "";
        if (!text) {
            continue;
        }
        if (!/validation/i.test(text)) {
            continue;
        }
        const cleaned = cleanValidationText(text);
        if (cleaned) {
            return cleaned;
        }
    }

    return "";
}

function splitCellText(text) {
    return String(text || "")
        .split(/\r?\n|\s{2,}|\t+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function removeEyeTrackerElements() {
    const overlays = document.querySelectorAll(".gvCvDetailViewer");
    overlays.forEach((node) => {
        try {
            node.remove();
        } catch (error) {
            // ignored
        }
    });
}

function collectEventDetails(video, options = {}) {
    const suppressWarnings = Boolean(options && options.suppressWarnings);
    const allRows = document.querySelectorAll(".gvEventListItemPadding");
    const selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    const isHideTracking = video
        ? video.closest(".videos.hide-tracking") !== null
        : Boolean(document.querySelector(".videos.hide-tracking"));

    let eventType = "";
    let truckNumber = "";
    let operatorName = "";
    let timestamp = "";
    let eventId = "";
    const pageUrl = getPageUrl();
    let isLastCell = false;
    let validationType = "";
    let oasDetailRoot = null;

    if (state.oasMode) {
        const selectedItem = document.querySelector(".List .item.selected");
        if (!selectedItem) {
            if (!suppressWarnings) {
                console.warn("⚠️ No selected OAS item found for event logging.");
            }
            return null;
        }

        const listRoot = selectedItem.closest(".List");
        const items = Array.from(listRoot ? listRoot.querySelectorAll(".item") : []);
        if (items.length) {
            isLastCell = selectedItem === items[items.length - 1];
        }

        oasDetailRoot = listRoot?.parentElement || selectedItem.parentElement || null;
        const lookupRoot = oasDetailRoot || selectedItem;
        const eventTypeElement =
            selectedItem.querySelector("label.field.event_type, label.field-event_type") ||
            lookupRoot.querySelector("label.field.event_type, label.field-event_type");
        const timestampElement =
            selectedItem.querySelector("label.field-created_at, label.field.created_at") ||
            lookupRoot.querySelector("label.field-created_at, label.field.created_at");
        const validationElement =
            selectedItem.querySelector("label.field-reviewed_type, label.field.reviewed_type") ||
            lookupRoot.querySelector("label.field-reviewed_type, label.field.reviewed_type");
        const eventIdElement =
            selectedItem.querySelector("label.field-eventid, label.field-event_id") ||
            lookupRoot.querySelector("label.field-eventid, label.field-event_id");

        if (eventTypeElement) {
            eventType = eventTypeElement.textContent.trim();
        }
        if (timestampElement) {
            timestamp = timestampElement.textContent.trim();
        }
        if (validationElement) {
            validationType = validationElement.textContent.trim();
        }
        if (eventIdElement) {
            eventId = eventIdElement.textContent.trim();
        }

        const fieldsRoot =
            selectedItem.querySelector(".Fields") ||
            (oasDetailRoot ? oasDetailRoot.querySelector(".Fields") : null);
        const fieldContainers = fieldsRoot
            ? Array.from(fieldsRoot.querySelectorAll(".fields .container"))
            : [];
        fieldContainers.forEach((container) => {
            const typeNode = container.querySelector(".type");
            const dataNode = container.querySelector(".data");
            const label = typeNode ? typeNode.textContent.trim().toLowerCase() : "";
            const value = dataNode ? dataNode.textContent.trim() : "";
            if (!value) {
                return;
            }
            if (label === "name" && !truckNumber) {
                truckNumber = value;
            }
            if (label === "operator" && !operatorName) {
                operatorName = value;
            }
        });

        if (!validationType) {
            validationType = extractValidationFromContainer(selectedItem);
        }
    } else if (isHideTracking) {
        const selectedItem = document.querySelector(".item.selected");

        if (selectedItem) {
            const eventTypeElement = selectedItem.querySelector("label.field-event_type");
            const timestampElement = selectedItem.querySelector("label.field-created_at");
            const eventIdElement = selectedItem.querySelector("label.field-eventid, label.field-event_id");

            if (eventTypeElement) {
                eventType = eventTypeElement.textContent.trim();
            }
            if (timestampElement) {
                timestamp = timestampElement.textContent.trim();
            }
            if (eventIdElement) {
                eventId = eventIdElement.textContent.trim();
            }

            validationType = extractValidationFromContainer(selectedItem);
        }
    } else if (selectedRow) {
        isLastCell = selectedRow === allRows[allRows.length - 1];

        const leftCells = Array.from(selectedRow.querySelectorAll(".gvEventListItemLeft"));
        if (leftCells.length) {
            const [firstCell] = leftCells;

            if (firstCell) {
                const text = (firstCell.textContent || "").trim();
                if (text) {
                    eventId = text;
                }
            }

            const detailTexts = leftCells
                .slice(1)
                .map((cell) => (cell.textContent || "").trim())
                .filter(Boolean);

            if (detailTexts.length) {
                const probableName = detailTexts.find((text) => text.includes(",") || text.split(/\s+/).length >= 2);
                if (probableName) {
                    operatorName = probableName;
                }

                const truckRegex = /^[A-Z]{1,6}\d{1,6}$/i;
                const probableTruck = detailTexts.find((text) => text !== operatorName && truckRegex.test(text));
                if (probableTruck) {
                    truckNumber = probableTruck;
                }

                if (!operatorName) {
                    operatorName = detailTexts[0];
                }

                if (!truckNumber && detailTexts.length > 1) {
                    const fallbackTruck = detailTexts.find((text) => text !== operatorName);
                    if (fallbackTruck) {
                        truckNumber = fallbackTruck;
                    }
                }
            }

            if (leftCells[1] && (!operatorName || !truckNumber)) {
                const parts = splitCellText(leftCells[1].textContent || "");
                if (!operatorName && parts.length) {
                    operatorName = parts[0];
                }
                if (!truckNumber && parts.length > 1) {
                    truckNumber = parts.slice(1).join(" ");
                }
            }

            if (!truckNumber && leftCells[2]) {
                const text = (leftCells[2].textContent || "").trim();
                if (text) {
                    truckNumber = text;
                }
            }
        }

        const timestampElement = selectedRow.querySelector(".gvEventListItemRight[style*='width: 90%']");
        const rightSideElements = Array.from(selectedRow.querySelectorAll(".gvEventListItemRight"))
            .filter((node) => {
                const styleAttr = (node.getAttribute("style") || "").toLowerCase();
                return styleAttr.includes("color");
            });

        if (rightSideElements.length) {
            const primary = (rightSideElements[0]?.textContent || "").trim();
            if (primary) {
                eventType = primary;
            }

            const secondaryValues = rightSideElements
                .slice(1)
                .map((node) => (node?.textContent || "").trim())
                .filter(Boolean);

            const labeledMatch = secondaryValues.find((text) => looksLikeValidationLabel(text));

            if (labeledMatch) {
                validationType = labeledMatch;
            } else {
                const normalizedEventType = (eventType || "").toLowerCase();
                const fallbackMatch = secondaryValues.find(
                    (text) => text && text.toLowerCase() !== normalizedEventType,
                );
                if (fallbackMatch) {
                    validationType = fallbackMatch;
                }
            }
        }

        if (timestampElement) {
            timestamp = timestampElement.textContent.trim();
        }

        if (!validationType) {
            validationType = extractValidationFromContainer(selectedRow);
        }
    } else {
        if (!suppressWarnings) {
            console.warn("⚠️ No selected row found for event logging.");
        }
        return null;
    }

    if (!validationType) {
        const detailsPanel = state.oasMode
            ? oasDetailRoot
            : document.querySelector(".gvDetailPanel, .gvEventDetails, .event-details, .details-panel") ||
              selectedRow?.parentElement ||
              null;
        validationType = extractValidationFromContainer(detailsPanel) || validationType;
    }

    const cleanedValidation = (validationType || "").trim();
    const normalizedValidation = state.validationFilterEnabled
        ? findValidationLabel(cleanedValidation) || cleanedValidation
        : cleanedValidation;

    const eventData = {
        eventType,
        truckNumber,
        operatorName: operatorName || "",
        timestamp,
        pageUrl,
        isLastCell,
        eventId,
        validationType: cleanedValidation,
        validationTypeRaw: cleanedValidation,
        validationTypeDetected: cleanedValidation,
        callValidationType: normalizedValidation || cleanedValidation,
    };

    return eventData;
}

function createEventKey(eventData) {
    if (!eventData) {
        return "";
    }

    const eventId = String(eventData.eventId || "").trim();
    const eventType = String(eventData.eventType || "").trim();
    const timestamp = String(eventData.timestamp || "").trim();

    if (!eventId || !eventType || !timestamp) {
        return "";
    }

    return [eventId, eventType, timestamp]
        .map((part) => part.toLowerCase())
        .join("|");
}

function createEventSignature(eventData) {
    if (!eventData) {
        return "";
    }

    const parts = [eventData.eventId, eventData.eventType, eventData.timestamp, eventData.truckNumber, eventData.operatorName];
    return parts
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value.length > 0)
        .join("|");
}

function resolveSiteName(pageUrl) {
    return new Promise((resolve) => {
        chrome.storage.local.get("siteInfo", (data) => {
            const siteInfo = Array.isArray(data.siteInfo) ? data.siteInfo : [];

            let siteName = "";
            let siteMatchValue = "";

            if (pageUrl) {
                try {
                    const url = new URL(pageUrl);
                    const host = url.hostname.toLowerCase();

                    const matchedEntry = siteInfo.find((entry) => {
                        if (!entry) {
                            return false;
                        }
                        const matchValue = (entry.matchValue || "").toLowerCase();
                        if (!matchValue) {
                            return false;
                        }
                        return host === matchValue || host.endsWith(`.${matchValue}`) || pageUrl.includes(matchValue);
                    });

                    if (matchedEntry) {
                        siteName = matchedEntry.name || "";
                        siteMatchValue = matchedEntry.matchValue || "";
                    }
                } catch (error) {
                    console.warn("Unable to parse page URL for site lookup", error);
                }
            }

            resolve({ siteName: siteName.trim(), siteMatchValue });
        });
    });
}

function generateLogId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function registerEventLog(eventData, callback) {
    if (!eventData) {
        if (typeof callback === "function") {
            setTimeout(() => callback(null), 0);
        }
        return;
    }

    const eventKey = createEventKey(eventData);

    chrome.storage.local.get("eventLogs", (data) => {
        const logs = Array.isArray(data.eventLogs) ? data.eventLogs : [];
        const existingLog = eventKey
            ? logs.find((log) => log.eventKey === eventKey || createEventKey(log) === eventKey)
            : null;

        if (existingLog) {
            if (!existingLog.eventKey && eventKey) {
                existingLog.eventKey = eventKey;
                chrome.storage.local.set({ eventLogs: logs }, () => {
                    if (typeof callback === "function") {
                        callback(existingLog);
                    }
                });
                return;
            }
            if (typeof callback === "function") {
                setTimeout(() => callback(existingLog), 0);
            }
            return;
        }

        resolveSiteName(eventData.pageUrl).then(({ siteName, siteMatchValue }) => {
            const rawValidation = eventData.validationTypeRaw || eventData.validationType || "";
            const callValidation = eventData.callValidationType || rawValidation;
            const normalizedValidation = state.validationFilterEnabled
                ? findValidationLabel(callValidation || rawValidation)
                : callValidation;

            const enrichedEvent = {
                ...eventData,
                validationTypeRaw: rawValidation,
                validationTypeDetected: rawValidation,
                detectedValidation: rawValidation,
                validationType: rawValidation,
                callValidationType: normalizedValidation || callValidation || rawValidation,
                siteName,
                siteMatchValue,
                createdAt: new Date().toISOString(),
                callHistory: [],
                eventKey,
                id: generateLogId(),
            };

            logs.push(enrichedEvent);
            chrome.storage.local.set({ eventLogs: logs }, () => {
                if (typeof callback === "function") {
                    callback(enrichedEvent);
                }
            });
        });
    });
}

function getActiveVideoElement() {
    return (
        document.querySelector("video.gvVideo.controllerless") ||
        document.querySelector(".videos.hide-tracking video") ||
        null
    );
}

function dispatchKeyboardEvent(target, key, type = "keydown", options = {}) {
    if (!target) {
        return;
    }

    const event = new KeyboardEvent(type, {
        key,
        code: key,
        keyCode: key === "ArrowDown" ? 40 : key === "ArrowLeft" ? 37 : key === "ArrowRight" ? 39 : undefined,
        which: key === "ArrowDown" ? 40 : key === "ArrowLeft" ? 37 : key === "ArrowRight" ? 39 : undefined,
        bubbles: true,
        cancelable: true,
        composed: true,
        repeat: Boolean(options.repeat),
    });

    target.dispatchEvent(event);
}

function getKeyTarget() {
    return document.activeElement || document.body || document;
}

function pressKey(key) {
    const target = getKeyTarget();
    dispatchKeyboardEvent(target, key, "keydown");
    setTimeout(() => dispatchKeyboardEvent(target, key, "keyup"), 100);
    state.lastPlaybackAt = Date.now();
}

function stopSmartSkipTimer() {
    if (state.skipTimerId) {
        clearTimeout(state.skipTimerId);
        state.skipTimerId = null;
    }
    state.pendingSkipSignature = "";
}

function stopBufferTimer() {
    if (state.bufferTimerId) {
        clearTimeout(state.bufferTimerId);
        state.bufferTimerId = null;
    }
    state.pendingBufferSignature = "";
}

function stopLoopTimer() {
    if (state.loopTimerId) {
        clearTimeout(state.loopTimerId);
        state.loopTimerId = null;
    }
}

function stopHoldTimer() {
    if (state.holdReleaseTimer) {
        clearTimeout(state.holdReleaseTimer);
        state.holdReleaseTimer = null;
    }
    if (state.holdRepeatInterval) {
        clearInterval(state.holdRepeatInterval);
        state.holdRepeatInterval = null;
    }
    if (state.holdingLeft) {
        const releaseTarget =
            (state.holdTarget && document.contains(state.holdTarget) && state.holdTarget) || getKeyTarget();
        dispatchKeyboardEvent(releaseTarget, "ArrowLeft", "keyup");
        state.holdingLeft = false;
    }
    state.holdTarget = null;
}

function startSmartSkipTimer(signature) {
    stopSmartSkipTimer();

    if (!state.autoMode || !state.smartSkipEnabled || state.smartSkipDelay <= 0) {
        return;
    }

    state.pendingSkipSignature = signature || "";
    const delay = Math.max(0, state.smartSkipDelay) * 1000;

    state.skipTimerId = setTimeout(() => {
        state.skipTimerId = null;
        if (!state.autoMode || state.mode !== "Auto") {
            return;
        }
        if (state.pendingSkipSignature && state.pendingSkipSignature !== state.lastEventSignature) {
            return;
        }
        const now = Date.now();
        if (now - state.lastPlaybackAt < delay) {
            return;
        }
        const isLastCell = Boolean(state.lastEventData?.isLastCell);
        pressKey(isLastCell ? "ArrowRight" : "ArrowDown");
        stopBufferTimer();
    }, delay);
}

function startBufferTimer(signature, eventData) {
    stopBufferTimer();

    if (!state.autoMode || state.bufferDelay < 0) {
        return;
    }

    const delay = Math.max(0, state.bufferDelay) * 1000;
    state.pendingBufferSignature = signature || "";

    state.bufferTimerId = setTimeout(() => {
        state.bufferTimerId = null;
        if (!state.autoMode || state.mode !== "Auto") {
            return;
        }
        if (state.pendingBufferSignature && state.pendingBufferSignature !== state.lastEventSignature) {
            return;
        }
        const advanceKey = state.oasMode ? "ArrowRight" : "ArrowDown";
        pressKey(advanceKey);
        if (!state.oasMode && state.autoPressNext && eventData?.isLastCell) {
            setTimeout(() => pressKey("ArrowRight"), 600);
        }
    }, delay);
}

function startLoopCheckTimer() {
    stopLoopTimer();

    if (!state.autoMode || !state.autoLoop || state.autoLoopDelay <= 0) {
        return;
    }

    const delay = Math.max(0, state.autoLoopDelay) * 1000;
    state.loopTimerId = setTimeout(() => {
        state.loopTimerId = null;
        if (!state.autoMode || state.mode !== "Auto") {
            return;
        }
        if (Date.now() - state.lastPlaybackAt < delay) {
            startLoopCheckTimer();
            return;
        }
        if (!document.querySelector(".right.disabled")) {
            startLoopCheckTimer();
            return;
        }
        if (state.holdingLeft) {
            startLoopCheckTimer();
            return;
        }

        state.holdingLeft = true;
        const target = getKeyTarget();
        state.holdTarget = target;
        dispatchKeyboardEvent(target, "ArrowLeft", "keydown");
        const holdDuration = Math.max(0, state.autoLoopHold) * 1000;
        if (state.holdRepeatInterval) {
            clearInterval(state.holdRepeatInterval);
        }
        if (holdDuration > 0) {
            state.holdRepeatInterval = setInterval(() => {
                if (!state.holdingLeft) {
                    return;
                }
                const repeatTarget =
                    (state.holdTarget && document.contains(state.holdTarget) && state.holdTarget) || getKeyTarget();
                state.holdTarget = repeatTarget;
                dispatchKeyboardEvent(repeatTarget, "ArrowLeft", "keydown", { repeat: true });
            }, 140);
        }
        state.holdReleaseTimer = setTimeout(() => {
            if (state.holdRepeatInterval) {
                clearInterval(state.holdRepeatInterval);
                state.holdRepeatInterval = null;
            }
            const releaseTarget =
                (state.holdTarget && document.contains(state.holdTarget) && state.holdTarget) || getKeyTarget();
            dispatchKeyboardEvent(releaseTarget, "ArrowLeft", "keyup");
            state.holdingLeft = false;
            state.holdReleaseTimer = null;
            state.holdTarget = null;
            state.lastPlaybackAt = Date.now();
            startLoopCheckTimer();
        }, holdDuration);
    }, delay);
}

function stopAllAutomationTimers() {
    stopSmartSkipTimer();
    stopBufferTimer();
    stopLoopTimer();
    stopHoldTimer();
    clearSelectionRetryTimer();
}

function ensureAutomationLoop() {
    if (!state.automationIntervalId) {
        state.automationIntervalId = setInterval(runAutomationCycle, 750);
    }
}

function stopAutomationLoop() {
    if (state.automationIntervalId) {
        clearInterval(state.automationIntervalId);
        state.automationIntervalId = null;
    }
    stopAllAutomationTimers();
}

function detectRequiredElements() {
    const selectors = state.oasMode ? OAS_REQUIRED_SELECTORS : REQUIRED_CLASS_SELECTORS;
    const hasElement = selectors.some((selector) => Boolean(document.querySelector(selector)));
    if (hasElement !== state.hasRequiredElements) {
        state.hasRequiredElements = hasElement;
        updateMode();
    }
    return hasElement;
}

function getEffectivePlaybackSpeed() {
    if (state.universalSpeed && state.universalSpeed !== "off") {
        const parsed = Number.parseFloat(state.universalSpeed);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return Number.isFinite(state.playbackSpeed) && state.playbackSpeed > 0 ? state.playbackSpeed : 1;
}

function applyPlaybackSpeed(video) {
    if (!video) {
        return;
    }
    try {
        video.playbackRate = getEffectivePlaybackSpeed();
    } catch (error) {
        console.warn("Unable to set playback speed", error);
    }
}

function updateAllVideoPlaybackRates() {
    const speed = getEffectivePlaybackSpeed();
    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    videos.forEach((video) => {
        try {
            video.playbackRate = speed;
        } catch (error) {
            console.warn("Unable to update playback speed", error);
        }
    });
}

function applyPlaybackCommand(command) {
    if (!state.enabled) {
        return false;
    }
    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    if (!videos.length) {
        return false;
    }
    let updated = false;
    videos.forEach((video) => {
        if (command === "pause") {
            if (!video.paused) {
                video.pause();
            }
            updated = true;
        } else if (command === "play") {
            applyPlaybackSpeed(video);
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {});
            }
            updated = true;
        }
    });
    return updated;
}

function getLagState(video) {
    if (!video) {
        return null;
    }
    let entry = videoLagState.get(video);
    if (!entry) {
        entry = {
            pendingTimer: null,
            lastLagRecoveryAt: 0,
            lastDroppedFrames: 0,
        };
        videoLagState.set(video, entry);
    }
    return entry;
}

function readDroppedFrames(video) {
    if (!video) {
        return 0;
    }
    if (typeof video.getVideoPlaybackQuality === "function") {
        try {
            const quality = video.getVideoPlaybackQuality();
            if (quality && Number.isFinite(quality.droppedVideoFrames)) {
                return quality.droppedVideoFrames;
            }
        } catch (error) {
            // ignored
        }
    }
    if (Number.isFinite(video.webkitDroppedFrameCount)) {
        return video.webkitDroppedFrameCount;
    }
    return 0;
}

function clearLagTimer(video) {
    const lagState = video ? videoLagState.get(video) : null;
    if (!lagState) {
        return;
    }
    if (lagState.pendingTimer) {
        clearTimeout(lagState.pendingTimer);
        lagState.pendingTimer = null;
    }
}

function clearAllLagTimers() {
    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    videos.forEach((video) => clearLagTimer(video));
}

function getAntiLagSeekAmount() {
    return Math.max(0.1, parsePositiveNumber(state.antiLagSeekSeconds, DEFAULT_ANTI_LAG_SEEK));
}

function attemptLagRecovery(video, reason) {
    if (!state.antiLagEnabled || !video) {
        return;
    }
    if (video.paused || video.ended) {
        return;
    }
    const lagState = getLagState(video);
    const now = Date.now();
    if (lagState && now - lagState.lastLagRecoveryAt < LAG_RECOVERY_COOLDOWN_MS) {
        return;
    }

    const seekAmount = getAntiLagSeekAmount();
    try {
        if (Number.isFinite(video.currentTime)) {
            const nextTime = Math.max(0, video.currentTime - seekAmount);
            video.currentTime = nextTime;
        }
        if (typeof video.play === "function") {
            video.play().catch(() => {});
        }
    } catch (error) {
        console.warn("Anti lag recovery failed", reason, error);
    }

    if (lagState) {
        lagState.lastLagRecoveryAt = now;
    }
}

function requestLagRecovery(video, reason) {
    if (!state.antiLagEnabled || !video) {
        return;
    }
    const lagState = getLagState(video);
    if (!lagState) {
        return;
    }

    if (lagState.pendingTimer) {
        clearTimeout(lagState.pendingTimer);
    }

    lagState.pendingTimer = setTimeout(() => {
        lagState.pendingTimer = null;
        attemptLagRecovery(video, reason);
    }, LAG_RECOVERY_DELAY_MS);
}

function monitorPlaybackQuality(video) {
    if (!state.antiLagEnabled || !video) {
        return;
    }
    const lagState = getLagState(video);
    if (!lagState) {
        return;
    }

    if (!video.paused && !video.ended && video.readyState > 0 && video.readyState < 3) {
        requestLagRecovery(video, "readyState");
    }

    const dropped = readDroppedFrames(video);
    if (Number.isFinite(dropped)) {
        if (lagState.lastDroppedFrames > 0 && dropped - lagState.lastDroppedFrames >= DROPPED_FRAME_SPIKE) {
            requestLagRecovery(video, "droppedFrames");
        }
        lagState.lastDroppedFrames = dropped;
    }
}

function handleVideoLagEvent(event) {
    if (!event || !(event.target instanceof HTMLVideoElement)) {
        return;
    }
    const video = event.target;
    if (video.paused || video.ended) {
        return;
    }
    requestLagRecovery(video, event.type);
}

function handleVideoTimeUpdate(event) {
    if (!event || !(event.target instanceof HTMLVideoElement)) {
        return;
    }
    const video = event.target;
    if (!video.paused && !video.ended) {
        handleVideoPlaying(event);
    }
    monitorPlaybackQuality(video);
}

function handleVideoProgress(event) {
    if (!event || !(event.target instanceof HTMLVideoElement)) {
        return;
    }
    monitorPlaybackQuality(event.target);
}

function handleVideoPlaying(event) {
    const video = event?.target instanceof HTMLVideoElement ? event.target : null;
    state.lastPlaybackAt = Date.now();
    stopSmartSkipTimer();
    startLoopCheckTimer();
    if (video) {
        clearLagTimer(video);
        const lagState = getLagState(video);
        if (lagState) {
            lagState.lastDroppedFrames = readDroppedFrames(video);
        }
    }
}

function handleVideoEnded(event) {
    const sourceVideo = event?.target instanceof HTMLVideoElement ? event.target : null;
    if (sourceVideo) {
        clearLagTimer(sourceVideo);
    }
    state.lastPlaybackAt = Date.now();
    if (!state.autoMode) {
        return;
    }
    const activeVideo = getActiveVideoElement();
    const details = collectEventDetails(activeVideo || null, { suppressWarnings: true }) || state.lastEventData;
    startBufferTimer(state.lastEventSignature, details);
}

function attachVideoListeners() {
    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    videos.forEach((video) => {
        if (video.dataset.qaAssistAttached) {
            return;
        }

        applyPlaybackSpeed(video);
        video.addEventListener("playing", handleVideoPlaying);
        video.addEventListener("loadeddata", handleVideoPlaying);
        video.addEventListener("timeupdate", handleVideoTimeUpdate);
        video.addEventListener("progress", handleVideoProgress);
        video.addEventListener("waiting", handleVideoLagEvent);
        video.addEventListener("stalled", handleVideoLagEvent);
        video.addEventListener("suspend", handleVideoLagEvent);
        video.addEventListener("error", handleVideoLagEvent);
        video.addEventListener("ended", handleVideoEnded);
        video.dataset.qaAssistAttached = "true";
        const lagState = getLagState(video);
        if (lagState) {
            lagState.lastDroppedFrames = readDroppedFrames(video);
        }
    });
}

function clearSelectionRetryTimer() {
    if (state.selectionRetryTimer) {
        clearTimeout(state.selectionRetryTimer);
        state.selectionRetryTimer = null;
    }
}

function applySelectionDetails(details) {
    clearSelectionRetryTimer();
    stopSmartSkipTimer();
    stopBufferTimer();
    if (!state.holdingLeft) {
        stopHoldTimer();
    }

    state.lastEventData = details;
    state.lastEventSignature = createEventSignature(details);
    state.lastPlaybackAt = Date.now();

    registerEventLog(details);

    if (state.autoMode) {
        startSmartSkipTimer(state.lastEventSignature);
        startLoopCheckTimer();
    }

    updateMode();
}

function scheduleSelectionRetry(attempt = 0) {
    clearSelectionRetryTimer();
    if (attempt >= 5) {
        updateMode();
        return;
    }

    state.selectionRetryTimer = setTimeout(() => {
        state.selectionRetryTimer = null;
        const video = getActiveVideoElement();
        const details = collectEventDetails(video || null, { suppressWarnings: true });
        if (!details) {
            scheduleSelectionRetry(attempt + 1);
            return;
        }
        applySelectionDetails(details);
    }, 200 + attempt * 100);
}

function handleSelectionChange() {
    const video = getActiveVideoElement();
    const details = collectEventDetails(video || null, { suppressWarnings: true });
    if (!details) {
        scheduleSelectionRetry();
        return;
    }

    applySelectionDetails(details);
}

function observeSelectionChanges() {
    const observer = new MutationObserver((mutations) => {
        const hasClassicSelectionChange = mutations.some(
            (mutation) =>
                mutation.type === "attributes" &&
                mutation.target.classList.contains("gvEventListItemPadding"),
        );
        const hasOasSelectionChange = state.oasMode
            ? mutations.some(
                  (mutation) =>
                      mutation.type === "attributes" &&
                      mutation.target.classList.contains("item") &&
                      mutation.target.closest(".List"),
              )
            : false;

        if (hasClassicSelectionChange || hasOasSelectionChange) {
            handleSelectionChange();
        }
    });

    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
    });

    state.selectionObserver = observer;
}

function observeDomAdditions() {
    const observer = new MutationObserver(() => {
        attachVideoListeners();
        detectRequiredElements();
        if (state.removeEyeTracker) {
            removeEyeTrackerElements();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    state.videoObserver = observer;
}

function getStatusSnapshot() {
    return {
        mode: state.mode,
        siteName: state.siteName,
        siteUrl: state.siteUrl,
        autoMode: state.autoMode,
        autoPressNext: state.autoPressNext,
        autoLoop: state.autoLoop,
        removeEyeTracker: state.removeEyeTracker,
        enabled: state.enabled,
        hasRequiredElements: state.hasRequiredElements,
        smartSkipEnabled: state.smartSkipEnabled,
        smartSkipDelay: state.smartSkipDelay,
        bufferDelay: state.bufferDelay,
        autoLoopDelay: state.autoLoopDelay,
        autoLoopHold: state.autoLoopHold,
        oasMode: state.oasMode,
        universalSpeed: state.universalSpeed,
        antiLagEnabled: state.antiLagEnabled,
        antiLagSeekSeconds: state.antiLagSeekSeconds,
    };
}

function notifyStatus(extra = {}) {
    const payload = { type: "qaAssist:statusUpdate", ...getStatusSnapshot(), ...extra };
    try {
        chrome.runtime.sendMessage(payload, () => chrome.runtime.lastError);
    } catch (error) {
        // ignored
    }
}

function computeMode() {
    if (!state.enabled) {
        return "Off";
    }
    if (!state.hasRequiredElements) {
        return "Lost";
    }
    return state.autoMode ? "Auto" : "Logging";
}

function updateMode() {
    const nextMode = computeMode();
    if (nextMode === state.mode) {
        return;
    }
    state.mode = nextMode;
    notifyStatus();
}

function applyEnabledState(enabled) {
    state.enabled = normalizeBoolean(enabled, false);
    updateMode();

    if (!state.enabled) {
        clearAllLagTimers();
        stopAutomationLoop();
        return;
    }

    ensureAutomationLoop();
}

function setAutoMode(enabled, { force = false } = {}) {
    const desired = normalizeBoolean(enabled, false);

    if (desired && !state.hasRequiredElements && !force) {
        notifyStatus({ rejectedAutoMode: true });
        return false;
    }

    state.autoMode = desired;
    if (!state.autoMode) {
        stopAllAutomationTimers();
    } else {
        startSmartSkipTimer(state.lastEventSignature);
        startLoopCheckTimer();
    }
    updateMode();
    return true;
}

function setAutoPressNext(enabled) {
    state.autoPressNext = normalizeBoolean(enabled, false);
}

function setAutoLoop(enabled) {
    state.autoLoop = normalizeBoolean(enabled, false);
    if (!state.autoLoop) {
        stopLoopTimer();
        stopHoldTimer();
    } else {
        startLoopCheckTimer();
    }
}

function setRemoveEyeTracker(enabled) {
    state.removeEyeTracker = normalizeBoolean(enabled, false);
    if (state.removeEyeTracker) {
        removeEyeTrackerElements();
    }
}

function updateUniversalSpeed(value, { refresh = true } = {}) {
    state.universalSpeed = sanitizeUniversalSpeed(value);
    if (refresh) {
        updateAllVideoPlaybackRates();
    }
}

function applySettings(data) {
    state.playbackSpeed = Number.parseFloat(data.playbackSpeed) || 1;
    updateUniversalSpeed(data.universalSpeed, { refresh: false });
    state.smartSkipEnabled = normalizeBoolean(data.smartSkipEnabled, true);
    state.smartSkipDelay = parsePositiveNumber(data.skipDelay, 6);
    state.bufferDelay = parsePositiveNumber(data.keyDelay, 4);
    state.autoLoopDelay = parsePositiveNumber(data.autoLoopDelay, 8);
    state.autoLoopHold = parsePositiveNumber(data.autoLoopHold, 5);
    state.oasMode = normalizeBoolean(data.oasModeEnabled, false);
    state.antiLagEnabled = normalizeBoolean(data.antiLagEnabled, state.antiLagEnabled);
    state.antiLagSeekSeconds = parsePositiveNumber(
        data.antiLagSeekSeconds,
        DEFAULT_ANTI_LAG_SEEK,
    );
    applyValidationPreferences(data.validationVocabulary || DEFAULT_VALIDATION_VOCABULARY, data.validationFilterEnabled);

    detectRequiredElements();
    setAutoMode(data.autoModeEnabled);
    setAutoPressNext(data.autoPressNext);
    setAutoLoop(data.autoLoopEnabled);
    if (Object.prototype.hasOwnProperty.call(data, "removeEyeTracker")) {
        setRemoveEyeTracker(data.removeEyeTracker);
    }
    if (!state.antiLagEnabled) {
        clearAllLagTimers();
    }

    attachVideoListeners();
    updateAllVideoPlaybackRates();
    startSmartSkipTimer(state.lastEventSignature);
    startLoopCheckTimer();
}

function runAutomationCycle() {
    if (!state.enabled) {
        stopAllAutomationTimers();
        return;
    }

    const hasElements = detectRequiredElements();
    if (!hasElements) {
        stopAllAutomationTimers();
        return;
    }

    attachVideoListeners();
    if (state.removeEyeTracker) {
        removeEyeTrackerElements();
    }
}

function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes) {
        return;
    }

    if (changes.siteInfo) {
        resolveSiteName(state.siteUrl).then(({ siteName }) => {
            state.siteName = siteName;
            notifyStatus();
        });
    }

    if (Object.prototype.hasOwnProperty.call(changes, "removeEyeTracker")) {
        setRemoveEyeTracker(changes.removeEyeTracker.newValue);
        notifyStatus();
    }

    if (
        changes.autoModeEnabled ||
        changes.autoPressNext ||
        changes.autoLoopEnabled ||
        changes.smartSkipEnabled ||
        changes.skipDelay ||
        changes.keyDelay ||
        changes.autoLoopDelay ||
        changes.autoLoopHold ||
        changes.oasModeEnabled ||
        changes.validationVocabulary ||
        changes.validationFilterEnabled ||
        changes.playbackSpeed ||
        changes.universalSpeed ||
        changes.antiLagEnabled ||
        changes.antiLagSeekSeconds
    ) {
        chrome.storage.local.get(
            {
                playbackSpeed: "1",
                universalSpeed: state.universalSpeed,
                autoModeEnabled: state.autoMode,
                autoPressNext: state.autoPressNext,
                autoLoopEnabled: state.autoLoop,
                smartSkipEnabled: state.smartSkipEnabled,
                skipDelay: state.smartSkipDelay,
                keyDelay: state.bufferDelay,
                autoLoopDelay: state.autoLoopDelay,
                autoLoopHold: state.autoLoopHold,
                oasModeEnabled: state.oasMode,
                validationVocabulary: state.validationVocabulary,
                validationFilterEnabled: state.validationFilterEnabled,
                removeEyeTracker: state.removeEyeTracker,
                antiLagEnabled: state.antiLagEnabled,
                antiLagSeekSeconds: state.antiLagSeekSeconds,
            },
            (data) => {
                applySettings(data);
                notifyStatus();
            },
        );
    }
}

function initialize() {
    state.siteUrl = getPageUrl();
    resolveSiteName(state.siteUrl).then(({ siteName }) => {
        state.siteName = siteName;
        notifyStatus();
    });

    chrome.storage.local.get(
        {
            enabled: false,
            playbackSpeed: "1",
            universalSpeed: "off",
            autoModeEnabled: false,
            autoPressNext: false,
            autoLoopEnabled: false,
            removeEyeTracker: false,
            smartSkipEnabled: true,
            skipDelay: 6,
            keyDelay: 4,
            autoLoopDelay: 8,
            autoLoopHold: 5,
            oasModeEnabled: false,
            validationVocabulary: DEFAULT_VALIDATION_VOCABULARY,
            validationFilterEnabled: true,
            antiLagEnabled: false,
            antiLagSeekSeconds: DEFAULT_ANTI_LAG_SEEK,
        },
        (data) => {
            applyValidationPreferences(data.validationVocabulary, data.validationFilterEnabled);
            applyEnabledState(data.enabled);
            applySettings(data);
            detectRequiredElements();
            observeSelectionChanges();
            observeDomAdditions();
            handleSelectionChange();
            ensureAutomationLoop();
            notifyStatus();
        },
    );

    chrome.runtime.sendMessage({ type: "getEnabledState" }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }
        if (response && Object.prototype.hasOwnProperty.call(response, "enabled")) {
            applyEnabledState(response.enabled);
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "enabled")) {
        applyEnabledState(message.enabled);
        sendResponse?.(getStatusSnapshot());
        return;
    }

    if (message.type === "qaAssist:getStatus") {
        sendResponse?.(getStatusSnapshot());
        return true;
    }

    if (message.type === "qaAssist:updateControls") {
        let accepted = true;
        if (Object.prototype.hasOwnProperty.call(message, "autoMode")) {
            accepted = setAutoMode(message.autoMode, { force: Boolean(message.force) });
        }
        if (Object.prototype.hasOwnProperty.call(message, "autoPressNext")) {
            setAutoPressNext(message.autoPressNext);
        }
        if (Object.prototype.hasOwnProperty.call(message, "autoLoop")) {
            setAutoLoop(message.autoLoop);
        }
        if (Object.prototype.hasOwnProperty.call(message, "removeEyeTracker")) {
            setRemoveEyeTracker(message.removeEyeTracker);
        }
        if (Object.prototype.hasOwnProperty.call(message, "universalSpeed")) {
            updateUniversalSpeed(message.universalSpeed);
        }
        notifyStatus();
        sendResponse?.({ accepted, status: getStatusSnapshot() });
        return true;
    }

    if (message.type === "qaAssist:instaLog") {
        if (!state.enabled || !state.hasRequiredElements) {
            sendResponse?.({ success: false, reason: "inactive" });
            return true;
        }

        const details = state.lastEventData;
        if (!details) {
            sendResponse?.({ success: false, reason: "noEvent" });
            return true;
        }

        registerEventLog(details, (logEntry) => {
            if (!logEntry) {
                sendResponse?.({ success: false, reason: "noEvent" });
                return;
            }

            const eventKey = logEntry.eventKey || createEventKey(logEntry);
            sendResponse?.({
                success: true,
                logId: logEntry.id,
                eventKey,
                siteName: logEntry.siteName || state.siteName || "",
            });
        });
        return true;
    }

    if (message.type === "qaAssist:playbackCommand") {
        const action = typeof message.action === "string" ? message.action : "";
        if (action !== "pause" && action !== "play") {
            sendResponse?.({ success: false, reason: "invalid" });
            return true;
        }
        const handled = applyPlaybackCommand(action);
        sendResponse?.({ success: handled });
        return true;
    }

    if (message.type === "qaAssist:applySettings") {
        applySettings(message.settings || {});
        notifyStatus();
    }

    if (message.type === "qaAssist:forceSelectionRefresh") {
        handleSelectionChange();
        notifyStatus();
    }
});

chrome.storage.onChanged.addListener(handleStorageChange);

initialize();
