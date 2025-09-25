let isEnabled = false;
let playbackSpeed = 1.0;
let pressKey = "ArrowRight";
let autoPressNext = false;
let removeEyeTracker = false;
let activeOverride = null;
const processedEventKeys = new Set();
let mutationObserver = null;

function getPageUrl() {
    return window.location.href.split("#")[0];
}

function normalizeValidationType(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }

    const lower = text.toLowerCase();

    if (lower.includes("blocked")) {
        return "Blocked";
    }
    if (lower.includes("critical")) {
        return "Critical";
    }
    if (lower.includes("moderate")) {
        return "Moderate";
    }
    if (lower.includes("low")) {
        return "3 Low/hr";
    }
    if (lower.includes("cell")) {
        return "Cellphone";
    }
    if (lower.includes("non") || lower.includes("false")) {
        return "False Positive";
    }
    if (lower.includes("lost")) {
        return "Lost Connection";
    }

    return text;
}

function looksLikeValidationLabel(text) {
    if (!text) {
        return false;
    }

    const cleaned = String(text).trim();
    if (!cleaned) {
        return false;
    }

    const normalized = normalizeValidationType(cleaned);
    if (normalized && normalized !== cleaned) {
        return true;
    }

    return /(blocked|critical|moderate|low|cell|false|non|lost)/i.test(cleaned);
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

function collectEventDetails(video) {
    const allRows = document.querySelectorAll(".gvEventListItemPadding");
    const selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    const isHideTracking = video.closest(".videos.hide-tracking") !== null;

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

            const secondary = rightSideElements
                .slice(1)
                .map((node) => (node?.textContent || "").trim())
                .find((text) => looksLikeValidationLabel(text));

            if (secondary) {
                validationType = secondary;
            }
        }
        if (timestampElement) {
            timestamp = timestampElement.textContent.trim();
        }

        if (!validationType) {
            validationType = extractValidationFromContainer(selectedRow);
        }
    } else {
        console.warn("⚠️ No selected row found for event logging.");
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
        validationType: normalizedValidation || cleanedValidation,
        validationTypeRaw: cleanedValidation,
    };

    return eventData;
}

function createEventKey(eventData) {
    if (!eventData) {
        return "";
    }

    const keyParts = [
        eventData.eventId || "",
        eventData.eventType || "",
        eventData.truckNumber || "",
        eventData.timestamp || "",
        eventData.pageUrl || "",
    ];

    return keyParts.map((part) => String(part || "").trim().toLowerCase()).join("|");
}

function resolveSiteName(pageUrl) {
    return new Promise((resolve) => {
        chrome.storage.sync.get("siteInfo", (data) => {
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
    if (!eventKey) {
        return;
    }

    if (processedEventKeys.has(eventKey)) {
        console.log("🔁 Duplicate event detected in-session. Skipping log entry.", eventData);
        return;
    }

    processedEventKeys.add(eventKey);

    resolveSiteName(eventData.pageUrl).then(({ siteName, siteMatchValue }) => {
        const rawValidation = eventData.validationTypeRaw || eventData.validationType || "";
        const normalizedValidation = normalizeValidationType(rawValidation);
        const enrichedEvent = {
            ...eventData,
            validationTypeRaw: rawValidation,
            validationTypeDetected: rawValidation,
            detectedValidation: rawValidation,
            validationType: normalizedValidation,
            siteName,
            siteMatchValue,
            createdAt: new Date().toISOString(),
            callHistory: [],
            eventKey,
            id: generateLogId(),
        };

        chrome.storage.local.get("eventLogs", (data) => {
            const logs = Array.isArray(data.eventLogs) ? data.eventLogs : [];
            const alreadyExists = logs.some((log) => createEventKey(log) === eventKey);

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

function pressKeyEvent(key) {
    const eventDown = new KeyboardEvent("keydown", {
        key,
        code: key,
        keyCode: key === "ArrowRight" ? 39 : key === "ArrowDown" ? 40 : undefined,
        which: key === "ArrowRight" ? 39 : key === "ArrowDown" ? 40 : undefined,
        bubbles: true,
        cancelable: true,
    });

    const eventUp = new KeyboardEvent("keyup", {
        key,
        code: key,
        keyCode: key === "ArrowRight" ? 39 : key === "ArrowDown" ? 40 : undefined,
        which: key === "ArrowRight" ? 39 : key === "ArrowDown" ? 40 : undefined,
        bubbles: true,
        cancelable: true,
    });

    const targetElement = document.activeElement || document;
    targetElement.dispatchEvent(eventDown);
    setTimeout(() => targetElement.dispatchEvent(eventUp), 100);
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
        }

        applyPlaybackSpeed(video);

        if (removeEyeTracker) {
            removeEyeTrackerElement();
        }

        video.addEventListener("play", () => applyPlaybackSpeed(video));

        video.addEventListener(
            "ended",
            () => {
                if (!isEnabled) {
                    return;
                }

                pressKeyEvent("ArrowDown");

                chrome.storage.sync.get("autoPressNext", (data) => {
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
}

function monitorForNewVideos() {
    if (mutationObserver) {
        return;
    }

    mutationObserver = new MutationObserver(() => {
        monitorVideos();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
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
    }
}

function loadSettingsAndInitialize() {
    chrome.storage.sync.get(
        ["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker", "siteOverrides"],
        (data) => {
            isEnabled = data.enabled || false;
            playbackSpeed = parseFloat(data.playbackSpeed) || 1.0;
            pressKey = data.pressKey || "ArrowDown";
            autoPressNext = data.autoPressNext ?? false;
            removeEyeTracker = data.removeEyeTracker ?? false;

            const override = findOverrideForUrl(window.location.href, data.siteOverrides || []);
            applyOverrideSettings(override);

            if (isEnabled) {
                monitorVideos();
                monitorForNewVideos();
            }

            if (removeEyeTracker) {
                removeEyeTrackerElement();
            }
        },
    );
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.enabled !== undefined) {
        isEnabled = request.enabled;
        if (isEnabled) {
            monitorVideos();
            monitorForNewVideos();
        }
    }

    if (request.autoPressNext !== undefined) {
        autoPressNext = request.autoPressNext;
    }

    if (request.removeEyeTracker !== undefined) {
        removeEyeTracker = request.removeEyeTracker;
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

    if (request.siteOverrides) {
        const override = findOverrideForUrl(window.location.href, request.siteOverrides);
        applyOverrideSettings(override);
    }
});

loadSettingsAndInitialize();
