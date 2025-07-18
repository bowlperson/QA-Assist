let isEnabled = false;
let playbackSpeed = 1.0; // Default to 1x speed
let pressKey = "ArrowDown"; // Default key is Down Arrow
let autoPressNext = false; // Default to disabled
let removeEyeTracker = false; // Default to disabled
let customSpeedRules = [];
let noVideoSkipDelay = 0;
let noVideoTimerId = null;
let smartSkipEnabled = false;

// Function to store event data from the selected row
function saveEventData(video) {
    let allRows = document.querySelectorAll(".gvEventListItemPadding");
    let selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    let isHideTracking = false;
    if (video) {
        isHideTracking = video.closest(".videos.hide-tracking") !== null;
    } else if (document.querySelector(".videos.hide-tracking .item.selected")) {
        isHideTracking = true;
    }

    let eventType = "";
    let truckNumber = ""; // Leave blank for hide-tracking
    let timestamp = "";
    let pageUrl = window.location.href;
    let isLastCell = false;

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

        console.log("📌 Logging event from normal video:", { eventType, truckNumber, timestamp, pageUrl, isLastCell });
    } else {
        console.warn("⚠️ No selected row found for event logging.");
        return false;
    }

    let eventData = { eventType, truckNumber, timestamp, pageUrl, isLastCell };

    // store event type on the video for speed rules
    if (video) {
        video.dataset.eventType = eventType;
    }

    chrome.storage.local.get("eventLogs", function (data) {
        let logs = data.eventLogs || [];
        logs.push(eventData);

        chrome.storage.local.set({ eventLogs: logs });
        console.log("📌 Event logged successfully:", eventData);
    });

    return { isLastCell, eventType };
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
        let speed = playbackSpeed;
        const type = video.dataset.eventType || "";
        for (const rule of customSpeedRules) {
            if (rule.eventType === type) {
                speed = parseFloat(rule.speed);
                break;
            }
        }
        video.playbackRate = speed;
        console.log(`⚡ Playback speed set to ${speed}x for`, type, video);
    }
}

// Function to handle smart skip
function cancelNoVideoTimer() {
    if (noVideoTimerId) {
        clearTimeout(noVideoTimerId);
        noVideoTimerId = null;
        console.log("⏹️ No-video timer canceled");
    }
}

function startNoVideoTimer(info) {
    if (!smartSkipEnabled || noVideoSkipDelay <= 0) return;
    cancelNoVideoTimer();
    const { eventType, isLastCell } = info || {};
    console.log(`⏩ No video playback detected for ${eventType}; will skip in ${noVideoSkipDelay}s`);
    noVideoTimerId = setTimeout(() => {
        console.log("⏭️ Skipping due to no video playback");
        let key = pressKey;
        if (autoPressNext && isLastCell) {
            key = "ArrowRight";
        }
        pressKeyEvent(key);
    }, noVideoSkipDelay * 1000);
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
        const info = saveEventData(null);
        if (info && info.eventType) {
            startNoVideoTimer(info);
        }
        return;
    }

    let firstInfo = null;
    let playing = false;
    videos.forEach(video => {
        if (!video.dataset.listenerAdded) {
            console.log("🎥 Target video detected:", video);

            // Log event details based on video type
            let info = saveEventData(video);
            let isLastCell = info.isLastCell;
            if (!firstInfo) firstInfo = info;
            if (!video.paused) playing = true;

            // Apply the stored playback speed immediately
            applyPlaybackSpeed(video);
            cancelNoVideoTimer();

            // If Remove Eye Tracker is enabled, check and remove it every time a video is detected
            if (removeEyeTracker) {
                removeEyeTrackerElement();
            }

            video.addEventListener("play", () => {
                console.log("✅ Video playing detected");
                applyPlaybackSpeed(video);
                cancelNoVideoTimer();
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

    if (!playing && firstInfo && firstInfo.eventType) {
        startNoVideoTimer(firstInfo);
    } else if (playing) {
        cancelNoVideoTimer();
    }
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

    if (request.customSpeedRules) {
        customSpeedRules = request.customSpeedRules;
        console.log("⚡ Custom speed rules updated:", customSpeedRules);
        let videos = document.querySelectorAll("video.gvVideo.controllerless, .videos.hide-tracking video");
        videos.forEach(video => applyPlaybackSpeed(video));
    }

    if (request.skipDelay !== undefined) {
        noVideoSkipDelay = parseFloat(request.skipDelay) || 0;
        console.log("⏩ No-video skip delay updated:", noVideoSkipDelay);
    }

    if (request.smartSkipEnabled !== undefined) {
        smartSkipEnabled = request.smartSkipEnabled;
        console.log("⏩ Smart Skip enabled:", smartSkipEnabled);
        if (!smartSkipEnabled) {
            cancelNoVideoTimer();
        }
    }
});

// Load settings on startup and check for videos
chrome.storage.sync.get(["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker", "customSpeedRules", "skipDelay", "smartSkipEnabled"], function (data) {
    isEnabled = data.enabled || false;
    playbackSpeed = parseFloat(data.playbackSpeed) || 1.0; // Default to 1x speed
    pressKey = data.pressKey || "ArrowDown"; // Default key is now Down Arrow
    autoPressNext = data.autoPressNext ?? false; // Default to disabled
    removeEyeTracker = data.removeEyeTracker ?? false; // Default to disabled
    customSpeedRules = data.customSpeedRules || [];
    noVideoSkipDelay = parseFloat(data.skipDelay) || 0;
    smartSkipEnabled = data.smartSkipEnabled ?? false;

    console.log("⚙️ Extension loaded with settings: Enabled=" + isEnabled + ", Speed=" + playbackSpeed + "x, Key=" + pressKey + ", Auto Press Next=" + autoPressNext + ", Remove Eye Tracker=" + removeEyeTracker);

    if (isEnabled) {
        monitorVideos();
        monitorForNewVideos();
    }

    if (removeEyeTracker) {
        removeEyeTrackerElement();
    }
});
