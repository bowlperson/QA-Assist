let isEnabled = false;
let playbackSpeed = 1.0; // Default to 1x speed
let pressKey = "ArrowRight"; // Default key
let autoPressNext = false; // Default to disabled
let removeEyeTracker = false; // Default to disabled

function normalizeValidationType(rawValue) {
    if (!rawValue) {
        return "";
    }
    const value = rawValue.toLowerCase();

    if (value.indexOf("blocked") !== -1) {
        return "Blocked";
    }
    if (value.indexOf("critical") !== -1) {
        return "Critical";
    }
    if (value.indexOf("moderate") !== -1) {
        return "Moderate";
    }
    if (value.indexOf("low") !== -1) {
        return "3 Low/hr";
    }
    if (value.indexOf("cell") !== -1) {
        return "Cellphone";
    }
    if (value.indexOf("non") !== -1 || value.indexOf("false") !== -1) {
        return "False Positive";
    }
    if (value.indexOf("lost") !== -1 && value.indexOf("connection") !== -1) {
        return "Lost Connection";
    }
    if (value.indexOf("disconnect") !== -1) {
        return "Lost Connection";
    }

    return "";
}

function parseTimestampParts(timestamp) {
    if (!timestamp) {
        return {
            dateISO: "",
            dateDisplay: "",
            hour: "",
            minute: "",
            seconds: "",
            timeRaw: "",
        };
    }

    const timeMatch = timestamp.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    let hour = "";
    let minute = "";
    let seconds = "";
    let timeRaw = "";
    if (timeMatch) {
        hour = String(parseInt(timeMatch[1], 10) || 0);
        minute = String(parseInt(timeMatch[2], 10) || 0);
        seconds = typeof timeMatch[3] !== "undefined" ? String(parseInt(timeMatch[3], 10) || 0) : "";
        timeRaw = timeMatch[0];
    }

    const dateMatch = timestamp.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    let dateISO = "";
    let dateDisplay = "";
    if (dateMatch) {
        const rawDate = dateMatch[0];
        let year;
        let month;
        let day;

        if (rawDate.indexOf("-") !== -1 && rawDate.length >= 8) {
            const parts = rawDate.split("-");
            if (parts[0].length === 4) {
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            } else {
                month = parseInt(parts[0], 10);
                day = parseInt(parts[1], 10);
                year = parseInt(parts[2], 10);
            }
        } else {
            const parts = rawDate.split(/[\/\-]/);
            month = parseInt(parts[0], 10);
            day = parseInt(parts[1], 10);
            const rawYear = parts[2];
            year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
        }

        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const monthStr = month < 10 ? "0" + month : String(month);
            const dayStr = day < 10 ? "0" + day : String(day);
            dateISO = year + "-" + monthStr + "-" + dayStr;
            dateDisplay = month + "/" + day + "/" + year;
        }
    }

    return {
        dateISO,
        dateDisplay,
        hour,
        minute,
        seconds,
        timeRaw,
    };
}

function findValueByLabel(container, regex) {
    if (!container) {
        return "";
    }

    const elements = container.querySelectorAll("label, span, div, dt, dd, th, td, strong, p");
    for (let i = 0; i < elements.length; i += 1) {
        const element = elements[i];
        const text = (element.textContent || "").trim();
        if (!text) {
            continue;
        }

        if (regex.test(text)) {
            const directParts = text.split(/[:：]/);
            if (directParts.length > 1) {
                const candidate = directParts.slice(1).join(":").trim();
                if (candidate && !regex.test(candidate)) {
                    return candidate;
                }
            }

            const next = element.nextElementSibling;
            if (next) {
                const nextText = (next.textContent || "").trim();
                if (nextText && !regex.test(nextText)) {
                    return nextText;
                }
            }

            const parent = element.parentElement;
            if (parent) {
                const siblings = parent.children;
                for (let j = 0; j < siblings.length; j += 1) {
                    const sibling = siblings[j];
                    if (sibling === element) {
                        continue;
                    }
                    const siblingText = (sibling.textContent || "").trim();
                    if (siblingText && !regex.test(siblingText)) {
                        return siblingText;
                    }
                }
            }
        }
    }

    return "";
}

function extractValidationTypeFromContainer(container, eventType) {
    if (!container) {
        return "";
    }

    const selectors = [
        "[data-field='validation_type']",
        "[data-field='validationType']",
        ".field-validation_type",
        ".validation-type",
        "[data-label='Validation Type']",
        "[aria-label='Validation Type']",
    ];

    for (let i = 0; i < selectors.length; i += 1) {
        const element = container.querySelector(selectors[i]);
        if (element) {
            const text = (element.textContent || "").trim();
            if (text) {
                return text;
            }
        }
    }

    const dataAttribute = container.getAttribute && container.getAttribute("data-validation-type");
    if (dataAttribute) {
        return dataAttribute.trim();
    }

    const labelledValue = findValueByLabel(container, /validation\s*type/i);
    if (labelledValue) {
        return labelledValue;
    }

    if (container !== document.body && container !== document) {
        const parentLabelledValue = findValueByLabel(document.body, /validation\s*type/i);
        if (parentLabelledValue) {
            return parentLabelledValue;
        }
    }

    if (eventType) {
        return eventType;
    }

    return "";
}

function deriveSiteName() {
    const explicit = findValueByLabel(document.body, /site\s*name/i);
    if (explicit) {
        return explicit;
    }

    if (typeof window !== "undefined" && window.location && window.location.hostname) {
        return window.location.hostname;
    }

    return "";
}

function storeLatestEventDetails(eventData, validationDetails, timestampParts) {
    const latestEventDetails = {
        eventType: eventData.eventType,
        timestamp: eventData.timestamp,
        pageUrl: eventData.pageUrl,
        truckNumber: eventData.truckNumber,
        equipmentNumber: eventData.truckNumber,
        siteName: deriveSiteName(),
        validationTypeRaw: validationDetails.raw,
        validationType: validationDetails.normalized,
        dateISO: timestampParts.dateISO,
        dateDisplay: timestampParts.dateDisplay,
        eventTimeHr: timestampParts.hour,
        eventTimeMin: timestampParts.minute,
        seconds: timestampParts.seconds,
        timeRaw: timestampParts.timeRaw,
    };

    chrome.storage.local.set({ latestEventDetails });
}

// Function to store event data from the selected row
function saveEventData(video) {
    let allRows = document.querySelectorAll(".gvEventListItemPadding");
    let selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    let isHideTracking = video.closest(".videos.hide-tracking") !== null; // Check if the video is inside hide-tracking

    let eventType = "";
    let truckNumber = ""; // Leave blank for hide-tracking
    let timestamp = "";
    let pageUrl = window.location.href;
    let isLastCell = false;
    let containerForValidation = null;

    if (isHideTracking) {
        // Get the selected container within hide-tracking
        let selectedItem = document.querySelector(".item.selected");

        if (selectedItem) {
            let eventTypeElement = selectedItem.querySelector("label.field-event_type");
            let timestampElement = selectedItem.querySelector("label.field-created_at");

            if (eventTypeElement) {
                eventType = eventTypeElement.textContent.trim();
            }
            if (timestampElement) {
                timestamp = timestampElement.textContent.trim();
            }

            containerForValidation = selectedItem;
            console.log("📌 Logging event from hide-tracking video (selected item):", { eventType, timestamp, pageUrl });
        } else {
            console.warn("⚠️ No selected item found for hide-tracking video.");
        }
    } else if (selectedRow) {
        // Normal gvVideo.controllerless logging
        isLastCell = selectedRow === allRows[allRows.length - 1];

        let eventTypeElement = selectedRow.querySelector(".gvEventListItemRight[style*='color']");
        let truckNumberElements = selectedRow.querySelectorAll(".gvEventListItemLeft");
        let timestampElement = selectedRow.querySelector(".gvEventListItemRight[style*='width: 90%']");

        let truckNumberElement = (truckNumberElements.length > 1) ? truckNumberElements[1] : null;

        if (eventTypeElement) {
            eventType = eventTypeElement.textContent.trim();
        }
        if (truckNumberElement) {
            truckNumber = truckNumberElement.textContent.trim();
        }
        if (timestampElement) {
            timestamp = timestampElement.textContent.trim();
        }

        containerForValidation = selectedRow;
        console.log("📌 Logging event from normal video:", { eventType, truckNumber, timestamp, pageUrl, isLastCell });
    } else {
        console.warn("⚠️ No selected row found for event logging.");
        return false;
    }

    const rawValidation = extractValidationTypeFromContainer(containerForValidation || document.body, eventType);
    const normalizedValidation = normalizeValidationType(rawValidation);
    const timestampParts = parseTimestampParts(timestamp);

    let eventData = {
        eventType,
        truckNumber,
        timestamp,
        pageUrl,
        isLastCell,
        validationTypeRaw: rawValidation,
        validationType: normalizedValidation,
    };

    chrome.storage.local.get("eventLogs", function (data) {
        let logs = data.eventLogs || [];
        logs.push(eventData);

        chrome.storage.local.set({ eventLogs: logs });
        console.log("📌 Event logged successfully:", eventData);
    });

    storeLatestEventDetails(eventData, { raw: rawValidation, normalized: normalizedValidation }, timestampParts);

    return isLastCell;
}



// Function to simulate key press on the active element
function pressKeyEvent(key) {
    console.log(`⌨️ Pressing ${key} key...`);
    
    let eventDown = new KeyboardEvent("keydown", {
        key: key,
        code: key,
        keyCode: key === "ArrowRight" ? 39 : 40,
        which: key === "ArrowRight" ? 39 : 40,
        bubbles: true,
        cancelable: true
    });

    let eventUp = new KeyboardEvent("keyup", {
        key: key,
        code: key,
        keyCode: key === "ArrowRight" ? 39 : 40,
        which: key === "ArrowRight" ? 39 : 40,
        bubbles: true,
        cancelable: true
    });

    let targetElement = document.activeElement || document;
    console.log("📩 Dispatching key events to:", targetElement);

    targetElement.dispatchEvent(eventDown);
    setTimeout(() => {
        targetElement.dispatchEvent(eventUp);
        console.log(`✔️ Key press event completed: ${key}`);
    }, 100);
}

// Function to apply playback speed
function applyPlaybackSpeed(video) {
    if (video) {
        video.playbackRate = playbackSpeed;
        console.log(`⚡ Playback speed set to ${playbackSpeed}x for`, video);
    }
}

// Function to remove Eye Tracker canvas whenever a video is detected
function removeEyeTrackerElement() {
    let eyeTrackerCanvas = document.querySelector("canvas.gvCvDetailViewer");
    if (eyeTrackerCanvas) {
        eyeTrackerCanvas.remove();
        console.log("✅ Eye Tracker removed.");
    } else {
        console.log("⚠️ No Eye Tracker found.");
    }
}

// Monitor video elements and store event data
function monitorVideos() {
    console.log("🔍 Running video monitor check...");

    // Select both types of video elements
    let videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");

    if (videos.length === 0) {
        console.warn("⚠️ No target videos found.");
        return;
    }

    videos.forEach(video => {
        if (!video.dataset.listenerAdded) {
            console.log("🎥 Target video detected:", video);

            // Log event details based on video type
            let isLastCell = saveEventData(video);

            // Apply the stored playback speed immediately
            applyPlaybackSpeed(video);

            // If Remove Eye Tracker is enabled, check and remove it every time a video is detected
            if (removeEyeTracker) {
                removeEyeTrackerElement();
            }

            video.addEventListener("play", () => {
                console.log("✅ Video playing detected");
                applyPlaybackSpeed(video);
            });

            video.addEventListener("ended", () => {
                if (isEnabled) {
                    console.log("🎬 Video ended.");

                    // Always press the Down Arrow first
                    console.log("⬇️ Pressing Down Arrow immediately.");
                    pressKeyEvent("ArrowDown");

                    // Only press Right Arrow if "Auto Press Next List" is enabled and it's the last cell
                    chrome.storage.sync.get("autoPressNext", function (data) {
                        if (data.autoPressNext && isLastCell) {
                            console.log("⏳ Waiting 2 seconds before pressing Right Arrow...");
                            setTimeout(() => {
                                console.log("➡️ Pressing Right Arrow after delay.");
                                pressKeyEvent("ArrowRight");
                            }, 2000);
                        } else if (!data.autoPressNext) {
                            console.log("🚫 Auto Press Next List is disabled. Right Arrow will not be pressed.");
                        }
                    });
                }
            }, { once: true });

            video.dataset.listenerAdded = "true";
        }
    });
}



// MutationObserver to detect dynamically loaded videos
function monitorForNewVideos() {
    console.log("🔄 Starting MutationObserver for new videos...");
    
    const observer = new MutationObserver(() => {
        console.log("🔍 Checking for newly added videos...");
        monitorVideos();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Listen for messages from the popup (updates speed, key, toggles)
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
        console.log("🔄 Auto Press Next List updated:", autoPressNext);
    }

    if (request.removeEyeTracker !== undefined) {
        removeEyeTracker = request.removeEyeTracker;
        console.log("👀 Remove Eye Tracker updated:", removeEyeTracker);
        
        if (removeEyeTracker) {
            removeEyeTrackerElement();
        }
    }

    if (request.playbackSpeed && playbackSpeed !== parseFloat(request.playbackSpeed)) {
        playbackSpeed = parseFloat(request.playbackSpeed);
        console.log("⚡ Updating playback speed to:", playbackSpeed);
        
        let videos = document.querySelectorAll("video.gvVideo.controllerless");
        videos.forEach(video => applyPlaybackSpeed(video));
    }

    if (request.pressKey && pressKey !== request.pressKey) {
        pressKey = request.pressKey;
        console.log("🔑 Key press updated to: " + pressKey);
    }
});

// Load settings on startup and check for videos
chrome.storage.sync.get(["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker"], function (data) {
    isEnabled = data.enabled || false;
    playbackSpeed = parseFloat(data.playbackSpeed) || 1.0; // Default to 1x speed
    pressKey = data.pressKey || "ArrowDown"; // Default key is now Down Arrow
    autoPressNext = data.autoPressNext ?? false; // Default to disabled
    removeEyeTracker = data.removeEyeTracker ?? false; // Default to disabled

    console.log("⚙️ Extension loaded with settings: Enabled=" + isEnabled + ", Speed=" + playbackSpeed + "x, Key=" + pressKey + ", Auto Press Next=" + autoPressNext + ", Remove Eye Tracker=" + removeEyeTracker);

    if (isEnabled) {
        monitorVideos();
        monitorForNewVideos();
    }

    if (removeEyeTracker) {
        removeEyeTrackerElement();
    }
});
