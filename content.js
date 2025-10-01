let isEnabled = false;
let playbackSpeed = 1.0;
let pressKey = "ArrowRight";
let autoPressNext = false;
let removeEyeTracker = false;
let activeOverride = null;
const processedEventKeys = new Set();
let mutationObserver = null;

let baseAutomationSettings = {
    smartSkipEnabled: false,
    skipDelay: 0,
    keyDelay: 0,
    loopingEnabled: false,
    loopReset: 10,
    loopHold: 5,
    loopFollow: true,
};
let overrideAutomationSettings = null;

let smartSkipEnabled = false;
let smartSkipDelaySeconds = 0;
let smartSkipActionTimeout = null;
let smartSkipCooldownUntil = 0;

let keyDelaySeconds = 0;

let loopEnabled = false;
let loopResetSeconds = 10;
let loopHoldSeconds = 5;
let loopActionInProgress = false;
let loopCooldownUntil = 0;
let loopHoldRepeatInterval = null;
let loopHoldReleaseTimeout = null;
let loopHoldActive = false;

let automationInterval = null;

let lastPlaybackDetectedAt = Date.now();
let currentEventSignature = "";
let lastKnownEventData = null;

const DEFAULT_VALIDATION_VOCABULARY = [
    { label: "Blocked", keywords: ["blocked"] },
    { label: "Critical", keywords: ["critical"] },
    { label: "Moderate", keywords: ["moderate"] },
    { label: "3 Low/hr", keywords: ["low"] },
    { label: "Cellphone", keywords: ["cell phone", "cellphone", "cell", "phone"] },
    { label: "False Positive", keywords: ["false", "non"] },
    { label: "Lost Connection", keywords: ["lost connection", "lost", "disconnect"] },
];

let validationVocabulary = cloneDefaultVocabulary();
let validationFilterEnabled = true;
let validationMatchers = buildValidationMatchers(validationVocabulary);

function normalizeBoolean(value, fallback = false) {
    if (value === true || value === "true" || value === 1 || value === "1") {
        return true;
    }

    if (value === false || value === "false" || value === 0 || value === "0") {
        return false;
    }

    return fallback;
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

    for (const matcher of validationMatchers) {
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
    validationVocabulary = sanitizeVocabularyInput(rawList);
    validationFilterEnabled = typeof filterEnabled === "boolean" ? filterEnabled : true;
    validationMatchers = buildValidationMatchers(validationVocabulary);
}

function normalizeValidationType(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }

    if (!validationFilterEnabled) {
        return text;
    }

    const matched = findValidationLabel(text);
    return matched || text;
}

function looksLikeValidationLabel(text) {
    if (!text) {
        return false;
    }

    const cleaned = String(text).trim();
    if (!cleaned) {
        return false;
    }

    if (findValidationLabel(cleaned)) {
        return true;
    }

    return /validation/i.test(cleaned);
}

function cleanValidationText(text) {
    if (!text) {
        return "";
    }

    return String(text)
        .replace(/validation\s*type\s*:?/gi, "")
        .replace(/validation\s*:?/gi, "")
        .replace(/type\s*:?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractValidationFromContainer(container) {
    if (!container) {
        return "";
    }

    const selectors = [
        "label.field-validation_type",
        "label.field-validationtype",
        "label.field-validation",
        "[data-field='validation_type']",
        "[data-name='validation_type']",
        ".validation-type",
        ".field-validation_type",
        ".field-validation",
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

function collectEventDetails(video, options = {}) {
    const suppressWarnings = Boolean(options && options.suppressWarnings);
    const allRows = document.querySelectorAll(".gvEventListItemPadding");
    const selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    const isHideTracking = video
        ? video.closest(".videos.hide-tracking") !== null
        : Boolean(document.querySelector(".videos.hide-tracking"));

    let eventType = "";
    let truckNumber = "";
    let timestamp = "";
    let eventId = "";
    const pageUrl = getPageUrl();
    let isLastCell = false;
    let validationType = "";

    if (isHideTracking) {
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

        const truckNumberElements = selectedRow.querySelectorAll(".gvEventListItemLeft");
        const timestampElement = selectedRow.querySelector(".gvEventListItemRight[style*='width: 90%']");
        const rightSideElements = Array.from(selectedRow.querySelectorAll(".gvEventListItemRight"))
            .filter((node) => {
                const styleAttr = (node.getAttribute("style") || "").toLowerCase();
                return styleAttr.includes("color");
            });

        if (truckNumberElements.length > 0) {
            eventId = (truckNumberElements[0]?.textContent || "").trim();
        }
        if (truckNumberElements.length > 1) {
            truckNumber = (truckNumberElements[1]?.textContent || "").trim();
        }
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
        const detailsPanel =
            document.querySelector(".gvDetailPanel, .gvEventDetails, .event-details, .details-panel") ||
            selectedRow?.parentElement ||
            null;
        validationType = extractValidationFromContainer(detailsPanel) || validationType;
    }

    const cleanedValidation = (validationType || "").trim();
    const normalizedValidation = normalizeValidationType(cleanedValidation);

    const eventData = {
        eventType,
        truckNumber,
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

    const parts = [eventData.eventId, eventData.eventType, eventData.timestamp, eventData.truckNumber];
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

function registerEventLog(eventData) {
    if (!eventData) {
        return;
    }

    const eventKey = createEventKey(eventData);

    if (eventKey && processedEventKeys.has(eventKey)) {
        console.log("🔁 Duplicate event detected in-session. Skipping log entry.", eventData);
        return;
    }

    if (eventKey) {
        processedEventKeys.add(eventKey);
    }

    resolveSiteName(eventData.pageUrl).then(({ siteName, siteMatchValue }) => {
        const rawValidation = eventData.validationTypeRaw || eventData.validationType || "";
        const callValidation = eventData.callValidationType || rawValidation;
        const normalizedValidation = normalizeValidationType(callValidation || rawValidation);
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

        chrome.storage.local.get("eventLogs", (data) => {
            const logs = Array.isArray(data.eventLogs) ? data.eventLogs : [];
            const alreadyExists = eventKey
                ? logs.some((log) => createEventKey(log) === eventKey)
                : false;

            if (alreadyExists) {
                console.log("🛑 Duplicate event detected in storage. Skipping log entry.", enrichedEvent);
                return;
            }

            logs.push(enrichedEvent);
            chrome.storage.local.set({ eventLogs: logs });
            console.log("📌 Event logged successfully:", enrichedEvent);
        });
    });
}

function generateLogId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function getKeyCodeForKey(key) {
    switch (key) {
        case "ArrowRight":
            return 39;
        case "ArrowDown":
            return 40;
        case "ArrowLeft":
            return 37;
        default:
            return undefined;
    }
}

function dispatchKeyboardEvent(target, key, type) {
    if (!target) {
        return;
    }

    const keyCode = getKeyCodeForKey(key);
    const event = new KeyboardEvent(type, {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
    });

    target.dispatchEvent(event);
}

function pressKeyEvent(key) {
    const targetElement = document.activeElement || document.body || document;
    dispatchKeyboardEvent(targetElement, key, "keydown");
    setTimeout(() => dispatchKeyboardEvent(targetElement, key, "keyup"), 100);
}

function applyPlaybackSpeed(video) {
    if (video) {
        video.playbackRate = playbackSpeed;
    }
}

function removeEyeTrackerElement() {
    const eyeTrackerCanvas = document.querySelector("canvas.gvCvDetailViewer");
    if (eyeTrackerCanvas) {
        eyeTrackerCanvas.remove();
        console.log("✅ Eye Tracker removed.");
    }
}

function parsePositiveNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback < 0 ? 0 : fallback;
    }
    return parsed < 0 ? 0 : parsed;
}

function buildAutomationSettingsFromData(data) {
    return {
        smartSkipEnabled: normalizeBoolean(
            data.smartSkipEnabled,
            baseAutomationSettings.smartSkipEnabled,
        ),
        skipDelay: parsePositiveNumber(data.skipDelay, baseAutomationSettings.skipDelay),
        keyDelay: parsePositiveNumber(data.keyDelay, baseAutomationSettings.keyDelay),
        loopingEnabled: normalizeBoolean(
            data.loopingEnabled,
            baseAutomationSettings.loopingEnabled,
        ),
        loopReset: parsePositiveNumber(data.loopReset, baseAutomationSettings.loopReset),
        loopHold: parsePositiveNumber(data.loopHold, baseAutomationSettings.loopHold),
        loopFollow: normalizeBoolean(data.loopFollow, baseAutomationSettings.loopFollow),
    };
}

function buildOverrideAutomationSettings(override) {
    if (!override || typeof override !== "object") {
        return null;
    }

    const overrideSettings = {};

    if (typeof override.smartSkipEnabled === "boolean") {
        overrideSettings.smartSkipEnabled = override.smartSkipEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(override, "skipDelay")) {
        overrideSettings.skipDelay = parsePositiveNumber(override.skipDelay, smartSkipDelaySeconds);
    }

    if (Object.prototype.hasOwnProperty.call(override, "keyDelay")) {
        overrideSettings.keyDelay = parsePositiveNumber(override.keyDelay, keyDelaySeconds);
    }

    if (typeof override.loopingEnabled === "boolean") {
        overrideSettings.loopingEnabled = override.loopingEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(override, "loopReset")) {
        overrideSettings.loopReset = parsePositiveNumber(override.loopReset, loopResetSeconds);
    }

    if (Object.prototype.hasOwnProperty.call(override, "loopHold")) {
        overrideSettings.loopHold = parsePositiveNumber(override.loopHold, loopHoldSeconds);
    }

    if (typeof override.loopFollow === "boolean") {
        overrideSettings.loopFollow = override.loopFollow;
    }

    return Object.keys(overrideSettings).length ? overrideSettings : null;
}

function updateBaseAutomationSettingsFromPartial(partial) {
    if (!partial || typeof partial !== "object") {
        return;
    }

    let changed = false;

    if (Object.prototype.hasOwnProperty.call(partial, "smartSkipEnabled")) {
        const next = normalizeBoolean(partial.smartSkipEnabled, baseAutomationSettings.smartSkipEnabled);
        if (next !== baseAutomationSettings.smartSkipEnabled) {
            baseAutomationSettings.smartSkipEnabled = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "skipDelay")) {
        const next = parsePositiveNumber(partial.skipDelay, baseAutomationSettings.skipDelay);
        if (next !== baseAutomationSettings.skipDelay) {
            baseAutomationSettings.skipDelay = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "keyDelay")) {
        const next = parsePositiveNumber(partial.keyDelay, baseAutomationSettings.keyDelay);
        if (next !== baseAutomationSettings.keyDelay) {
            baseAutomationSettings.keyDelay = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "loopingEnabled")) {
        const next = normalizeBoolean(partial.loopingEnabled, baseAutomationSettings.loopingEnabled);
        if (next !== baseAutomationSettings.loopingEnabled) {
            baseAutomationSettings.loopingEnabled = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "loopReset")) {
        const next = parsePositiveNumber(partial.loopReset, baseAutomationSettings.loopReset);
        if (next !== baseAutomationSettings.loopReset) {
            baseAutomationSettings.loopReset = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "loopHold")) {
        const next = parsePositiveNumber(partial.loopHold, baseAutomationSettings.loopHold);
        if (next !== baseAutomationSettings.loopHold) {
            baseAutomationSettings.loopHold = next;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(partial, "loopFollow")) {
        const next = normalizeBoolean(partial.loopFollow, baseAutomationSettings.loopFollow);
        if (next !== baseAutomationSettings.loopFollow) {
            baseAutomationSettings.loopFollow = next;
            changed = true;
        }
    }

    if (changed) {
        recomputeAutomationSettings();
    } else {
        ensureAutomationLoop();
    }
}

function recomputeAutomationSettings() {
    const previousSmartSkip = smartSkipEnabled;
    const previousLoop = loopEnabled;

    const combined = { ...baseAutomationSettings };
    if (overrideAutomationSettings) {
        Object.assign(combined, overrideAutomationSettings);
    }

    smartSkipEnabled = normalizeBoolean(combined.smartSkipEnabled, false);
    smartSkipDelaySeconds = parsePositiveNumber(combined.skipDelay, 0);
    keyDelaySeconds = parsePositiveNumber(combined.keyDelay, 0);
    loopEnabled = normalizeBoolean(combined.loopingEnabled, false);
    loopResetSeconds = parsePositiveNumber(combined.loopReset, 10);
    loopHoldSeconds = parsePositiveNumber(combined.loopHold, 5);

    if (!smartSkipEnabled) {
        clearSmartSkipActionTimeout();
        smartSkipCooldownUntil = 0;
    }

    if (!loopEnabled) {
        cancelLoopAction();
        loopCooldownUntil = 0;
    }

    if ((smartSkipEnabled && !previousSmartSkip) || (loopEnabled && !previousLoop)) {
        lastPlaybackDetectedAt = Date.now();
    }

    ensureAutomationLoop();
}

function clearSmartSkipActionTimeout() {
    if (smartSkipActionTimeout) {
        clearTimeout(smartSkipActionTimeout);
        smartSkipActionTimeout = null;
    }
}

function cancelLoopAction() {
    if (loopHoldRepeatInterval) {
        clearInterval(loopHoldRepeatInterval);
        loopHoldRepeatInterval = null;
    }

    if (loopHoldReleaseTimeout) {
        clearTimeout(loopHoldReleaseTimeout);
        loopHoldReleaseTimeout = null;
    }

    if (loopHoldActive) {
        const targetElement = document.activeElement || document.body || document;
        dispatchKeyboardEvent(targetElement, "ArrowLeft", "keyup");
        loopHoldActive = false;
    }

    loopActionInProgress = false;
}

function holdLoopKey(seconds, onComplete) {
    const durationMs = Math.max(0, Number.isFinite(Number(seconds)) ? Number(seconds) * 1000 : 0);
    const targetElement = document.activeElement || document.body || document;
    const key = "ArrowLeft";

    const sendKeyDown = () => dispatchKeyboardEvent(targetElement, key, "keydown");

    const finish = () => {
        if (loopHoldRepeatInterval) {
            clearInterval(loopHoldRepeatInterval);
            loopHoldRepeatInterval = null;
        }

        if (loopHoldActive) {
            dispatchKeyboardEvent(targetElement, key, "keyup");
            loopHoldActive = false;
        }

        if (typeof onComplete === "function") {
            onComplete();
        }
    };

    sendKeyDown();
    loopHoldActive = true;
    loopHoldRepeatInterval = setInterval(sendKeyDown, 150);

    const holdDuration = durationMs === 0 ? 120 : durationMs;
    loopHoldReleaseTimeout = setTimeout(() => {
        loopHoldReleaseTimeout = null;
        finish();
    }, holdDuration);
}

function completeLoopAction() {
    loopActionInProgress = false;
    lastPlaybackDetectedAt = Date.now();
    ensureAutomationLoop();
}

function triggerLoopReset(now) {
    cancelLoopAction();
    loopActionInProgress = true;
    loopCooldownUntil = now + Math.max(1000, loopResetSeconds * 1000);
    smartSkipCooldownUntil = Math.max(smartSkipCooldownUntil, loopCooldownUntil);

    holdLoopKey(loopHoldSeconds, completeLoopAction);
}

function collectCurrentEventSnapshot() {
    const video = getActiveVideoElement();
    const snapshot = collectEventDetails(video || null, { suppressWarnings: true });
    return snapshot || lastKnownEventData;
}

function getActiveVideoElement() {
    return (
        document.querySelector("video.gvVideo.controllerless") ||
        document.querySelector(".videos.hide-tracking video") ||
        null
    );
}

function updateActiveEventSignature(eventData) {
    if (!eventData) {
        return;
    }

    lastKnownEventData = eventData;
    const signature = createEventSignature(eventData);

    if (signature && signature !== currentEventSignature) {
        currentEventSignature = signature;
        lastPlaybackDetectedAt = Date.now();
    }
}

function recordPlaybackActivity() {
    lastPlaybackDetectedAt = Date.now();
}

function triggerSmartSkip(now) {
    if (!pressKey) {
        return;
    }

    smartSkipCooldownUntil =
        now +
        Math.max(1000, smartSkipDelaySeconds * 1000) +
        Math.max(0, keyDelaySeconds * 1000);

    clearSmartSkipActionTimeout();

    const delayMs = Math.max(0, keyDelaySeconds) * 1000;
    if (delayMs > 0) {
        smartSkipActionTimeout = setTimeout(() => {
            pressKeyEvent(pressKey);
            smartSkipActionTimeout = null;
        }, delayMs);
    } else {
        pressKeyEvent(pressKey);
    }

    lastPlaybackDetectedAt = now + delayMs;
}

function checkSmartSkip(now) {
    if (!smartSkipEnabled || smartSkipDelaySeconds <= 0) {
        return;
    }

    if (loopActionInProgress) {
        return;
    }

    if (now < smartSkipCooldownUntil) {
        return;
    }

    const elapsed = now - lastPlaybackDetectedAt;
    if (elapsed < smartSkipDelaySeconds * 1000) {
        return;
    }

    triggerSmartSkip(now);
}

function checkLoopReset(now) {
    if (!loopEnabled || loopResetSeconds <= 0) {
        return;
    }

    if (loopActionInProgress) {
        return;
    }

    if (now < loopCooldownUntil) {
        return;
    }

    const snapshot = collectCurrentEventSnapshot();
    if (snapshot) {
        updateActiveEventSignature(snapshot);
    }

    const inactivityDuration = now - lastPlaybackDetectedAt;
    if (inactivityDuration < loopResetSeconds * 1000) {
        return;
    }

    triggerLoopReset(now);
}

function runAutomationCycle() {
    if (!isEnabled) {
        stopAutomationTimers();
        return;
    }

    const now = Date.now();

    if (smartSkipEnabled) {
        checkSmartSkip(now);
    }

    if (loopEnabled) {
        checkLoopReset(now);
    }
}

function ensureAutomationLoop() {
    if (!isEnabled || (!smartSkipEnabled && !loopEnabled)) {
        stopAutomationTimers();
        return;
    }

    if (!automationInterval) {
        automationInterval = setInterval(runAutomationCycle, 1000);
    }
}

function stopAutomationTimers() {
    if (automationInterval) {
        clearInterval(automationInterval);
        automationInterval = null;
    }

    clearSmartSkipActionTimeout();
    cancelLoopAction();
    smartSkipCooldownUntil = 0;
    loopCooldownUntil = 0;
}

function attachVideoActivityListeners(video) {
    if (!video || video.dataset.activityListenersAttached) {
        return;
    }

    const markActive = () => recordPlaybackActivity();
    const markIfProgressing = () => {
        if (!video.paused && !video.ended) {
            recordPlaybackActivity();
        }
    };

    video.addEventListener("playing", markActive);
    video.addEventListener("loadeddata", markActive);
    video.addEventListener("seeked", markActive);
    video.addEventListener("timeupdate", markIfProgressing);
    video.addEventListener("ratechange", markIfProgressing);

    video.dataset.activityListenersAttached = "true";
}

function monitorVideos() {
    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    if (!videos.length) {
        return;
    }

    videos.forEach((video) => {
        if (video.dataset.listenerAdded) {
            return;
        }

        const eventData = collectEventDetails(video);
        if (eventData) {
            registerEventLog(eventData);
            updateActiveEventSignature(eventData);
        }

        applyPlaybackSpeed(video);
        attachVideoActivityListeners(video);
        recordPlaybackActivity();

        if (removeEyeTracker) {
            removeEyeTrackerElement();
        }

        video.addEventListener("play", () => {
            applyPlaybackSpeed(video);
            recordPlaybackActivity();
        });

        video.addEventListener(
            "ended",
            () => {
                if (!isEnabled) {
                    return;
                }

                const navigationKey = pressKey || "ArrowDown";
                const delayMs = Math.max(0, keyDelaySeconds) * 1000;
                const navigateToNext = () => pressKeyEvent(navigationKey);

                if (delayMs > 0) {
                    setTimeout(navigateToNext, delayMs);
                } else {
                    navigateToNext();
                }

                recordPlaybackActivity();

                chrome.storage.local.get("autoPressNext", (data) => {
                    const shouldAutoPress = data.autoPressNext ?? autoPressNext;
                    if (shouldAutoPress && eventData?.isLastCell) {
                        setTimeout(() => pressKeyEvent("ArrowRight"), 2000);
                    }
                });
            },
            { once: true },
        );

        video.dataset.listenerAdded = "true";
    });

    ensureAutomationLoop();
}

function monitorForNewVideos() {
    if (mutationObserver) {
        return;
    }

    mutationObserver = new MutationObserver(() => {
        monitorVideos();
        const snapshot = collectCurrentEventSnapshot();
        if (snapshot) {
            updateActiveEventSignature(snapshot);
        }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function stopMonitoring() {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }

    const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
    videos.forEach((video) => {
        if (video.dataset && video.dataset.listenerAdded) {
            delete video.dataset.listenerAdded;
        }
    });

    stopAutomationTimers();
    currentEventSignature = "";
    lastKnownEventData = null;
}

function findOverrideForUrl(url, overrides) {
    if (!url || !Array.isArray(overrides)) {
        return null;
    }

    let host = "";
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch (error) {
        host = url;
    }

    return (
        overrides.find((override) => {
            if (!override || !override.pattern) {
                return false;
            }

            const pattern = String(override.pattern).toLowerCase();
            return host === pattern || host.endsWith(`.${pattern}`) || url.toLowerCase().includes(pattern);
        }) || null
    );
}

function applyOverrideSettings(override) {
    if (!override) {
        activeOverride = null;
        overrideAutomationSettings = null;
        recomputeAutomationSettings();
        return;
    }

    activeOverride = override;

    if (override.overridePlaybackSpeed && override.playbackSpeed) {
        playbackSpeed = parseFloat(override.playbackSpeed) || playbackSpeed;
    }

    if (override.overridePressKey && override.pressKey) {
        pressKey = override.pressKey;
    }

    if (typeof override.autoPressNext === "boolean") {
        autoPressNext = override.autoPressNext;
    }

    if (typeof override.removeEyeTracker === "boolean") {
        removeEyeTracker = override.removeEyeTracker;
    }

    if (typeof override.enableScanning === "boolean") {
        isEnabled = override.enableScanning;
        if (!isEnabled) {
            stopMonitoring();
        }
    }

    overrideAutomationSettings = buildOverrideAutomationSettings(override);
    recomputeAutomationSettings();

    if (isEnabled) {
        monitorVideos();
        monitorForNewVideos();
        recordPlaybackActivity();
        ensureAutomationLoop();
    }
}

function loadSettingsAndInitialize() {
    chrome.storage.local.get(
        {
            enabled: false,
            playbackSpeed: "1",
            pressKey: "ArrowDown",
            autoPressNext: false,
            removeEyeTracker: false,
            siteOverrides: [],
            validationVocabulary: DEFAULT_VALIDATION_VOCABULARY,
            validationFilterEnabled: true,
            smartSkipEnabled: false,
            skipDelay: 0,
            keyDelay: 0,
            loopingEnabled: false,
            loopReset: 10,
            loopHold: 5,
            loopFollow: true,
        },
        (data) => {
            applyValidationPreferences(data.validationVocabulary, data.validationFilterEnabled);
            isEnabled = normalizeBoolean(data.enabled, false);
            playbackSpeed = parseFloat(data.playbackSpeed) || 1.0;
            pressKey = data.pressKey || "ArrowDown";
            autoPressNext = normalizeBoolean(data.autoPressNext, false);
            removeEyeTracker = normalizeBoolean(data.removeEyeTracker, false);

            baseAutomationSettings = buildAutomationSettingsFromData(data);
            overrideAutomationSettings = null;
            recomputeAutomationSettings();

            const override = findOverrideForUrl(window.location.href, data.siteOverrides || []);
            applyOverrideSettings(override);

            if (isEnabled) {
                monitorVideos();
                monitorForNewVideos();
                recordPlaybackActivity();
            }

            if (removeEyeTracker) {
                removeEyeTrackerElement();
            }

            ensureAutomationLoop();
            syncEnabledStateFromBackground();
        },
    );
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.enabled !== undefined) {
        isEnabled = normalizeBoolean(request.enabled, false);
        if (isEnabled) {
            monitorVideos();
            monitorForNewVideos();
            recordPlaybackActivity();
            ensureAutomationLoop();
        } else {
            stopMonitoring();
        }
    }

    if (request.autoPressNext !== undefined) {
        autoPressNext = normalizeBoolean(request.autoPressNext, false);
    }

    if (request.removeEyeTracker !== undefined) {
        removeEyeTracker = normalizeBoolean(request.removeEyeTracker, false);
        if (removeEyeTracker) {
            removeEyeTrackerElement();
        }
    }

    if (request.playbackSpeed && playbackSpeed !== parseFloat(request.playbackSpeed)) {
        playbackSpeed = parseFloat(request.playbackSpeed);
        const videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
        videos.forEach((video) => applyPlaybackSpeed(video));
    }

    if (request.pressKey && pressKey !== request.pressKey) {
        pressKey = request.pressKey;
    }

    const automationKeys = [
        "smartSkipEnabled",
        "skipDelay",
        "keyDelay",
        "loopingEnabled",
        "loopReset",
        "loopHold",
        "loopFollow",
    ];

    if (automationKeys.some((key) => Object.prototype.hasOwnProperty.call(request, key))) {
        updateBaseAutomationSettingsFromPartial(request);
    }

    if (request.siteOverrides) {
        const override = findOverrideForUrl(window.location.href, request.siteOverrides);
        applyOverrideSettings(override);
    }

    if (Object.prototype.hasOwnProperty.call(request, "validationVocabulary") ||
        Object.prototype.hasOwnProperty.call(request, "validationFilterEnabled")) {
        applyValidationPreferences(request.validationVocabulary, request.validationFilterEnabled);
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    const vocabChange = changes.validationVocabulary;
    const filterChange = changes.validationFilterEnabled;
    const automationUpdate = {};
    let hasAutomationUpdate = false;

    [
        "smartSkipEnabled",
        "skipDelay",
        "keyDelay",
        "loopingEnabled",
        "loopReset",
        "loopHold",
        "loopFollow",
    ].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
            automationUpdate[key] = changes[key].newValue;
            hasAutomationUpdate = true;
        }
    });

    if (vocabChange || filterChange) {
        applyValidationPreferences(
            vocabChange ? vocabChange.newValue : validationVocabulary,
            filterChange ? filterChange.newValue : validationFilterEnabled,
        );
    }

    if (hasAutomationUpdate) {
        updateBaseAutomationSettingsFromPartial(automationUpdate);
    }
});

function syncEnabledStateFromBackground() {
    if (!chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
        return;
    }

    chrome.runtime.sendMessage({ type: "getEnabledState" }, (response) => {
        if (chrome.runtime.lastError || !response || !Object.prototype.hasOwnProperty.call(response, "enabled")) {
            return;
        }

        const backgroundState = normalizeBoolean(response.enabled, isEnabled);
        if (backgroundState === isEnabled) {
            return;
        }

        isEnabled = backgroundState;
        if (isEnabled) {
            monitorVideos();
            monitorForNewVideos();
            recordPlaybackActivity();
            ensureAutomationLoop();
        } else {
            stopMonitoring();
        }
    });
}

loadSettingsAndInitialize();
