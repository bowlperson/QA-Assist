let isEnabled = false;
let playbackSpeed = 1.0; // Default to 1x speed
let pressKey = "ArrowDown"; // Default key is Down Arrow
let autoPressNext = false; // Default to disabled
let removeEyeTracker = false; // Default to disabled
let customSpeedRules = [];
let noVideoSkipDelay = 0;
let noVideoTimerId = null;
let smartSkipEnabled = false;
let keyDelay = 2; // Delay after video ends before pressing Right Arrow
let loopingEnabled = false;
let loopReset = 10;
let loopHold = 5;
let loopFollow = true;
let loopTimerId = null;
let lastLoopSignature = "";
let loopCheckIntervalId = null;

function extractEventData(video) {
    let allRows = document.querySelectorAll(".gvEventListItemPadding");
    let selectedRow = document.querySelector(".gvEventListItemPadding.selected.primarysel");
    let isHideTracking = false;
    if (video) {
        isHideTracking = video.closest(".videos.hide-tracking") !== null;
    } else if (document.querySelector(".videos.hide-tracking .item.selected")) {
        isHideTracking = true;
    }

    let eventType = "";
    let truckNumber = "";
    let timestamp = "";
    let isLastCell = false;

    if (isHideTracking) {
        let selectedItem = document.querySelector(".videos.hide-tracking .item.selected");
        if (selectedItem) {
            let eventTypeElement = selectedItem.querySelector("label.field-event_type");
            let timestampElement = selectedItem.querySelector("label.field-created_at");
            if (eventTypeElement) eventType = eventTypeElement.textContent.trim();
            if (timestampElement) timestamp = timestampElement.textContent.trim();
        }
    } else if (selectedRow) {
        isLastCell = selectedRow === allRows[allRows.length - 1];
        let eventTypeElement = selectedRow.querySelector(".gvEventListItemRight[style*='color']");
        let truckNumberElements = selectedRow.querySelectorAll(".gvEventListItemLeft");
        let timestampElement = selectedRow.querySelector(".gvEventListItemRight[style*='width: 90%']");
        let truckNumberElement = (truckNumberElements.length > 1) ? truckNumberElements[1] : null;
        if (eventTypeElement) eventType = eventTypeElement.textContent.trim();
        if (truckNumberElement) truckNumber = truckNumberElement.textContent.trim();
        if (timestampElement) timestamp = timestampElement.textContent.trim();
    } else {
        return null;
    }

    return { eventType, truckNumber, timestamp, isLastCell };
}

// Function to store event data from the selected row
function saveEventData(video) {
    let info = extractEventData(video);
    if (!info) {
        console.warn("⚠️ No selected row found for event logging.");
        return false;
    }
    let { eventType, truckNumber, timestamp, isLastCell } = info;
    let pageUrl = window.location.href;
    let eventData = { eventType, truckNumber, timestamp, pageUrl, isLastCell };

    console.log("📌 Logging event:", eventData);

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
        keyCode: key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : key === "ArrowRight" ? 39 : 40,
        which: key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : key === "ArrowRight" ? 39 : 40,
        bubbles: true,
        cancelable: true
    });

    let eventUp = new KeyboardEvent("keyup", {
        key: key,
        code: key,
        keyCode: key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : key === "ArrowRight" ? 39 : 40,
        which: key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : key === "ArrowRight" ? 39 : 40,
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

// Looping mode helpers
function cancelLoopTimer() {
    if (loopTimerId) {
        clearTimeout(loopTimerId);
        loopTimerId = null;
        console.log("⏹️ Loop timer canceled");
    }
}

function holdKey(key, seconds, callback) {
    const element = document.activeElement || document;
    const code = key === "ArrowLeft" ? 37 : key === "ArrowUp" ? 38 : key === "ArrowRight" ? 39 : 40;
    const down = new KeyboardEvent("keydown", { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true });
    const up = new KeyboardEvent("keyup", { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true });
    element.dispatchEvent(down);
    console.log(`⏮️ Holding ${key} for ${seconds}s`);
    setTimeout(() => {
        element.dispatchEvent(up);
        console.log(`▶️ Released ${key}`);
        if (callback) callback();
    }, seconds * 1000);
}

function triggerLoop() {
    holdKey("ArrowLeft", loopHold, () => {
        if (loopFollow) {
            pressKeyEvent("ArrowDown");
            setTimeout(() => {
                holdKey("ArrowUp", loopHold);
            }, 500);
        }
    });
}

function scheduleLoop() {
    if (!loopingEnabled || loopReset <= 0) return;
    cancelLoopTimer();
    console.log(`🔁 Loop scheduled in ${loopReset}s if event unchanged...`);
    loopTimerId = setTimeout(triggerLoop, loopReset * 1000);
}

function checkLoop(info) {
    if (!loopingEnabled || !info) {
        cancelLoopTimer();
        lastLoopSignature = "";
        return;
    }
    const sig = `${info.eventType}-${info.timestamp}`;
    if (sig !== lastLoopSignature) {
        lastLoopSignature = sig;
        scheduleLoop();
    }
}

function startLoopMonitor() {
    if (loopCheckIntervalId) return;
    loopCheckIntervalId = setInterval(() => {
        const info = extractEventData(null);
        checkLoop(info);
    }, 1000);
}

function stopLoopMonitor() {
    if (loopCheckIntervalId) {
        clearInterval(loopCheckIntervalId);
        loopCheckIntervalId = null;
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
        const info = saveEventData(null);
        if (info && info.eventType) {
            startNoVideoTimer(info);
            if (info.isLastCell) {
                checkLoop(info);
            }
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
                cancelLoopTimer();
            });

            video.addEventListener("ended", () => {
                if (isEnabled) {
                    console.log("🎬 Video ended.");

                    console.log(`⏳ Buffering for ${keyDelay}s before skipping...`);
                    setTimeout(() => {
                        console.log("⬇️ Pressing Down Arrow after delay.");
                        pressKeyEvent("ArrowDown");

                        if (autoPressNext && isLastCell) {
                            console.log(`⏳ Waiting another ${keyDelay}s before pressing Right Arrow...`);
                            setTimeout(() => {
                                console.log("➡️ Pressing Right Arrow after delay.");
                                pressKeyEvent("ArrowRight");
                            }, keyDelay * 1000);
                        } else if (!autoPressNext) {
                            console.log("🚫 Auto Press Next List is disabled. Right Arrow will not be pressed.");
                        }
                    }, keyDelay * 1000);
                }
            }, { once: true });

            video.dataset.listenerAdded = "true";
        }
    });

    if (!playing && firstInfo && firstInfo.eventType) {
        startNoVideoTimer(firstInfo);
        if (firstInfo.isLastCell) {
            checkLoop(firstInfo);
        }
    } else if (playing) {
        cancelNoVideoTimer();
        cancelLoopTimer();
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
            if (loopingEnabled) startLoopMonitor();
        } else {
            stopLoopMonitor();
            cancelLoopTimer();
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

    if (request.keyDelay !== undefined) {
        keyDelay = parseFloat(request.keyDelay) || 0;
        console.log("⌛ Key press delay updated:", keyDelay);
    }

    if (request.loopingEnabled !== undefined) {
        loopingEnabled = request.loopingEnabled;
        console.log("🔁 Looping mode:", loopingEnabled);
        if (!loopingEnabled) {
            cancelLoopTimer();
            stopLoopMonitor();
        } else {
            startLoopMonitor();
        }
    }

    if (request.loopReset !== undefined) {
        loopReset = parseFloat(request.loopReset) || 10;
        console.log("🔄 Loop reset seconds:", loopReset);
        if (loopingEnabled && lastLoopSignature) scheduleLoop();
    }

    if (request.loopHold !== undefined) {
        loopHold = parseFloat(request.loopHold) || 5;
        console.log("🕒 Loop hold seconds:", loopHold);
    }

    if (request.loopFollow !== undefined) {
        loopFollow = request.loopFollow;
        console.log("📼 Loop follow-up:", loopFollow);
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
chrome.storage.sync.get(["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker", "customSpeedRules", "skipDelay", "smartSkipEnabled", "keyDelay", "loopingEnabled", "loopReset", "loopHold", "loopFollow"], function (data) {
    isEnabled = data.enabled || false;
    playbackSpeed = parseFloat(data.playbackSpeed) || 1.0; // Default to 1x speed
    pressKey = data.pressKey || "ArrowDown"; // Default key is now Down Arrow
    autoPressNext = data.autoPressNext ?? false; // Default to disabled
    removeEyeTracker = data.removeEyeTracker ?? false; // Default to disabled
    customSpeedRules = data.customSpeedRules || [];
    noVideoSkipDelay = parseFloat(data.skipDelay) || 0;
    smartSkipEnabled = data.smartSkipEnabled ?? false;
    keyDelay = parseFloat(data.keyDelay) || 2;
    loopingEnabled = data.loopingEnabled ?? false;
    loopReset = parseFloat(data.loopReset) || 10;
    loopHold = parseFloat(data.loopHold) || 5;
    loopFollow = data.loopFollow ?? true;

    console.log("⚙️ Extension loaded with settings: Enabled=" + isEnabled + ", Speed=" + playbackSpeed + "x, Key=" + pressKey + ", Auto Press Next=" + autoPressNext + ", Remove Eye Tracker=" + removeEyeTracker + ", Key Delay=" + keyDelay + "s, Looping=" + loopingEnabled);

    if (isEnabled) {
        monitorVideos();
        monitorForNewVideos();
        if (loopingEnabled) startLoopMonitor();
    }

    if (removeEyeTracker) {
        removeEyeTrackerElement();
    }
});
