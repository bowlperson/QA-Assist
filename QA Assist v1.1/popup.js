document.addEventListener("DOMContentLoaded", () => {
    const UNIVERSAL_SPEED_VALUES = new Set(["off", "1", "1.25", "1.5", "1.75", "2"]);
    const extensionToggle = document.getElementById("extensionToggle");
    const modeBadge = document.getElementById("modeBadge");
    const siteDisplay = document.getElementById("siteDisplay");
    const dispatchInput = document.getElementById("dispatchName");
    const dispatchSaveButton = document.getElementById("saveDispatch");
    const dispatchSavedIndicator = document.getElementById("dispatchSaved");
    const statusIcon = document.getElementById("statusIcon");
    const autoModeToggle = document.getElementById("autoModeToggle");
    const autoPressToggle = document.getElementById("autoPressToggle");
    const autoLoopToggle = document.getElementById("autoLoopToggle");
    const removeEyeToggle = document.getElementById("removeEyeToggle");
    const instaLogButton = document.getElementById("instaLog");
    const universalSpeedSelect = document.getElementById("universalSpeedSelect");
    const pauseAllButton = document.getElementById("pauseAll");
    const playAllButton = document.getElementById("playAll");
    const lostMessage = document.getElementById("lostMessage");
    const forceAutoButton = document.getElementById("forceAuto");
    const openLogButton = document.getElementById("openLog");
    const openSettingsButton = document.getElementById("openSettings");
    const openControlButton = document.getElementById("openControl");
    const autoModeLabel = autoModeToggle ? autoModeToggle.closest(".toggle-inline") : null;
    const autoPressLabel = document.getElementById("autoPressLabel");
    const autoLoopLabel = document.getElementById("autoLoopLabel");

    let currentEnabled = false;
    let currentMode = "Off";
    let currentAutoMode = false;
    let currentAutoPress = false;
    let currentAutoLoop = false;
    let currentRemoveEyeTracker = false;
    let currentUniversalSpeed = "off";
    let currentDispatchName = "";
    let suppressAutoModeUpdate = false;
    let suppressAutoPressUpdate = false;
    let suppressAutoLoopUpdate = false;
    let suppressRemoveEyeUpdate = false;
    let suppressUniversalSpeedUpdate = false;
    let lastStatus = null;
    const dispatchSavedBaseText = dispatchSavedIndicator ? dispatchSavedIndicator.textContent : "Save";
    let dispatchSaveTimeoutId = null;
    let dispatchInputWarningTimeoutId = null;

    function normalizeBoolean(value, fallback = false) {
        if (value === true || value === "true" || value === 1 || value === "1") {
            return true;
        }
        if (value === false || value === "false" || value === 0 || value === "0") {
            return false;
        }
        return fallback;
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

    function withActiveTab(callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs.length) {
                return;
            }
            callback(tabs[0]);
        });
    }

    function updateModeBadge(mode) {
        modeBadge.textContent = mode;
        modeBadge.className = "mode-pill";
        switch (mode) {
            case "Auto":
                modeBadge.classList.add("mode-auto");
                break;
            case "Logging":
                modeBadge.classList.add("mode-logging");
                break;
            case "Lost":
                modeBadge.classList.add("mode-lost");
                break;
            default:
                modeBadge.classList.add("mode-off");
        }
    }

    function formatSiteDisplay(status) {
        const { siteName = "", siteUrl = "" } = status || {};
        if (siteName) {
            return siteName;
        }
        if (siteUrl) {
            try {
                const url = new URL(siteUrl);
                return url.hostname;
            } catch (error) {
                return siteUrl;
            }
        }
        return "—";
    }

    function toggleLostMessage(shouldShow) {
        lostMessage.classList.toggle("hidden", !shouldShow);
        forceAutoButton.classList.toggle("hidden", !shouldShow || currentAutoMode);
    }

    function updateStatusIcon() {
        if (!statusIcon) {
            return;
        }
        const iconName = currentEnabled ? "on.png" : "off.png";
        statusIcon.src = chrome.runtime.getURL(iconName);
    }

    function applyAutomationStyles(status) {
        const hasElements = normalizeBoolean(status?.hasRequiredElements, status?.mode ? status.mode !== "Lost" : true);
        const extensionActive = currentEnabled;
        const autoToggleEnabled = extensionActive && (hasElements || currentAutoMode);
        const autoOptionsActive = extensionActive && hasElements && currentAutoMode;

        if (autoModeLabel) {
            autoModeLabel.classList.toggle("inactive", !autoToggleEnabled);
        }

        autoModeToggle.disabled = !autoToggleEnabled;

        autoPressToggle.disabled = !extensionActive;
        autoLoopToggle.disabled = !extensionActive;
        removeEyeToggle.disabled = !extensionActive;
        if (universalSpeedSelect) {
            universalSpeedSelect.disabled = !extensionActive;
        }
        if (pauseAllButton) {
            pauseAllButton.disabled = !extensionActive;
        }
        if (playAllButton) {
            playAllButton.disabled = !extensionActive;
        }
        if (dispatchInput) {
            dispatchInput.disabled = !extensionActive;
        }

        if (instaLogButton) {
            const canInstaLog = extensionActive && hasElements;
            instaLogButton.disabled = !canInstaLog;
        }

        if (autoPressLabel) {
            autoPressLabel.classList.toggle("inactive", !autoOptionsActive || !extensionActive);
        }
        if (autoLoopLabel) {
            autoLoopLabel.classList.toggle("inactive", !autoOptionsActive || !extensionActive);
        }
    }

    function showDispatchSaved(message) {
        if (!dispatchSavedIndicator) {
            return;
        }
        const text = typeof message === "string" && message.trim() ? message : dispatchSavedBaseText;
        dispatchSavedIndicator.textContent = text;
        dispatchSavedIndicator.classList.remove("visible");
        // Force reflow to restart the animation
        void dispatchSavedIndicator.offsetWidth;
        dispatchSavedIndicator.classList.add("visible");

        if (dispatchSaveTimeoutId) {
            clearTimeout(dispatchSaveTimeoutId);
        }

        dispatchSaveTimeoutId = setTimeout(() => {
            dispatchSavedIndicator.classList.remove("visible");
            dispatchSavedIndicator.textContent = dispatchSavedBaseText;
        }, 1200);
    }

    function flashDispatchWarning(message) {
        if (dispatchInput) {
            dispatchInput.classList.add("input-warning");
            if (dispatchInputWarningTimeoutId) {
                clearTimeout(dispatchInputWarningTimeoutId);
            }
            dispatchInputWarningTimeoutId = setTimeout(() => {
                dispatchInput.classList.remove("input-warning");
                dispatchInputWarningTimeoutId = null;
            }, 1500);
        }
        showDispatchSaved(message);
    }

    function saveDispatchName() {
        if (!dispatchInput) {
            return;
        }

        const value = dispatchInput.value.trim();
        if (value === currentDispatchName) {
            showDispatchSaved();
            return;
        }
        currentDispatchName = value;
        dispatchInput.classList.remove("input-warning");
        if (dispatchInputWarningTimeoutId) {
            clearTimeout(dispatchInputWarningTimeoutId);
            dispatchInputWarningTimeoutId = null;
        }
        chrome.storage.local.set({ dispatchName: value }, showDispatchSaved);
    }

    function applyStatus(status) {
        if (!status) {
            return;
        }

        lastStatus = status;
        currentMode = status.mode || currentMode;
        currentEnabled = normalizeBoolean(status.enabled, currentEnabled);
        currentAutoMode = normalizeBoolean(status.autoMode, currentAutoMode);
        currentAutoPress = normalizeBoolean(status.autoPressNext, currentAutoPress);
        currentAutoLoop = normalizeBoolean(status.autoLoop, currentAutoLoop);
        currentRemoveEyeTracker = normalizeBoolean(status.removeEyeTracker, currentRemoveEyeTracker);
        currentUniversalSpeed = sanitizeUniversalSpeed(status.universalSpeed ?? currentUniversalSpeed);

        updateModeBadge(currentMode);
        siteDisplay.textContent = formatSiteDisplay(status);
        updateStatusIcon();

        const lost = currentEnabled && currentMode === "Lost";
        toggleLostMessage(lost && !currentAutoMode);

        if (!suppressAutoModeUpdate) {
            autoModeToggle.checked = currentAutoMode;
        }
        if (!suppressAutoPressUpdate) {
            autoPressToggle.checked = currentAutoPress;
        }
        if (!suppressAutoLoopUpdate) {
            autoLoopToggle.checked = currentAutoLoop;
        }
        if (!suppressRemoveEyeUpdate) {
            removeEyeToggle.checked = currentRemoveEyeTracker;
        }
        if (universalSpeedSelect && !suppressUniversalSpeedUpdate) {
            universalSpeedSelect.value = currentUniversalSpeed;
        }

        applyAutomationStyles(status);

        extensionToggle.checked = currentEnabled;

        if (status.rejectedAutoMode) {
            toggleLostMessage(true);
        }
    }

    function requestStatus() {
        withActiveTab((tab) => {
            chrome.tabs.sendMessage(tab.id, { type: "qaAssist:getStatus" }, (response) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                if (response) {
                    applyStatus(response);
                }
            });
        });
    }

    function commitEnabledState(desiredState) {
        const previous = currentEnabled;
        extensionToggle.disabled = true;
        chrome.runtime.sendMessage({ type: "setEnabledState", value: desiredState }, (response) => {
            extensionToggle.disabled = false;
            if (chrome.runtime.lastError || !response || response.success === false) {
                extensionToggle.checked = previous;
                return;
            }
            currentEnabled = normalizeBoolean(response.enabled, desiredState);
            extensionToggle.checked = currentEnabled;
            updateStatusIcon();
            applyAutomationStyles(lastStatus);
            requestStatus();
        });
    }

    function persistControlState(partial) {
        chrome.storage.local.set(partial);
    }

    function commitUniversalSpeed(rawValue) {
        const sanitized = sanitizeUniversalSpeed(rawValue);
        currentUniversalSpeed = sanitized;

        if (universalSpeedSelect) {
            universalSpeedSelect.value = sanitized;
        }

        suppressUniversalSpeedUpdate = true;
        persistControlState({ universalSpeed: sanitized });

        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(
                tab.id,
                { type: "qaAssist:updateControls", universalSpeed: sanitized },
                () => {
                    suppressUniversalSpeedUpdate = false;
                    if (chrome.runtime.lastError) {
                        requestStatus();
                        return;
                    }
                    requestStatus();
                },
            );
        });

        if (!handled) {
            suppressUniversalSpeedUpdate = false;
            requestStatus();
        }
    }

    function commitAutoMode(desired, { force = false } = {}) {
        suppressAutoModeUpdate = true;
        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(
                tab.id,
                { type: "qaAssist:updateControls", autoMode: desired, force },
                (response) => {
                    suppressAutoModeUpdate = false;

                    if (chrome.runtime.lastError) {
                        autoModeToggle.checked = currentAutoMode;
                        toggleLostMessage(desired);
                        return;
                    }

                    if (response && response.accepted === false) {
                        autoModeToggle.checked = currentAutoMode;
                        toggleLostMessage(true);
                        return;
                    }

                    currentAutoMode = desired;
                    autoModeToggle.checked = desired;
                    toggleLostMessage(false);
                    applyAutomationStyles(lastStatus);
                    persistControlState({
                        autoModeEnabled: desired,
                    });

                    if (response && response.status) {
                        applyStatus(response.status);
                    } else {
                        requestStatus();
                    }
                },
            );
        });

        if (!handled) {
            suppressAutoModeUpdate = false;
            autoModeToggle.checked = currentAutoMode;
        }
    }

    function commitAutoPress(desired) {
        suppressAutoPressUpdate = true;
        persistControlState({
            autoPressNext: desired,
        });
        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(
                tab.id,
                { type: "qaAssist:updateControls", autoPressNext: desired },
                () => {
                    suppressAutoPressUpdate = false;
                    if (chrome.runtime.lastError) {
                        autoPressToggle.checked = currentAutoPress;
                        return;
                    }
                    currentAutoPress = desired;
                    requestStatus();
                },
            );
        });

        if (!handled) {
            suppressAutoPressUpdate = false;
            autoPressToggle.checked = currentAutoPress;
        }
    }

    function commitAutoLoop(desired) {
        suppressAutoLoopUpdate = true;
        persistControlState({
            autoLoopEnabled: desired,
        });
        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(
                tab.id,
                { type: "qaAssist:updateControls", autoLoop: desired },
                () => {
                    suppressAutoLoopUpdate = false;
                    if (chrome.runtime.lastError) {
                        autoLoopToggle.checked = currentAutoLoop;
                        return;
                    }
                    currentAutoLoop = desired;
                    requestStatus();
                },
            );
        });

        if (!handled) {
            suppressAutoLoopUpdate = false;
            autoLoopToggle.checked = currentAutoLoop;
        }
    }

    function commitRemoveEyeTracker(desired) {
        suppressRemoveEyeUpdate = true;
        persistControlState({ removeEyeTracker: desired });
        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(
                tab.id,
                { type: "qaAssist:updateControls", removeEyeTracker: desired },
                () => {
                    suppressRemoveEyeUpdate = false;
                    if (chrome.runtime.lastError) {
                        removeEyeToggle.checked = currentRemoveEyeTracker;
                        return;
                    }
                    currentRemoveEyeTracker = desired;
                    requestStatus();
                },
            );
        });

        if (!handled) {
            suppressRemoveEyeUpdate = false;
            removeEyeToggle.checked = currentRemoveEyeTracker;
        }
    }

    function handleInstaLogClick() {
        if (!instaLogButton) {
            return;
        }

        if (!currentDispatchName) {
            flashDispatchWarning("Add name");
            dispatchInput?.focus();
            return;
        }

        if (instaLogButton.disabled) {
            return;
        }

        instaLogButton.classList.add("busy");
        instaLogButton.disabled = true;

        let handled = false;
        withActiveTab((tab) => {
            handled = true;
            chrome.tabs.sendMessage(tab.id, { type: "qaAssist:instaLog" }, (response) => {
                instaLogButton.classList.remove("busy");
                applyAutomationStyles(lastStatus);

                if (chrome.runtime.lastError) {
                    flashDispatchWarning("Select event");
                    requestStatus();
                    return;
                }

                if (!response || response.success === false) {
                    if (response?.reason === "noEvent") {
                        flashDispatchWarning("Select event");
                    } else if (response?.reason === "inactive") {
                        toggleLostMessage(true);
                        flashDispatchWarning("Site lost");
                    } else {
                        flashDispatchWarning("Try again");
                    }
                    requestStatus();
                    return;
                }

                const payload = {
                    logId: response.logId || "",
                    eventKey: response.eventKey || "",
                };

                requestStatus();

                chrome.storage.local.set({ pendingInstaLog: payload }, () => {
                    chrome.tabs.create({ url: chrome.runtime.getURL("log.html#insta") });
                });
            });
        });

        if (!handled) {
            instaLogButton.classList.remove("busy");
            applyAutomationStyles(lastStatus);
        }
    }

    function broadcastPlaybackCommand(action) {
        if (!currentEnabled) {
            return;
        }
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError || !Array.isArray(tabs)) {
                return;
            }
            tabs.forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, { type: "qaAssist:playbackCommand", action }, () => {
                    chrome.runtime.lastError;
                });
            });
        });
    }

    extensionToggle.addEventListener("change", () => {
        const desiredState = extensionToggle.checked;
        commitEnabledState(desiredState);
    });

    autoModeToggle.addEventListener("change", () => {
        const desired = autoModeToggle.checked;
        if (!desired) {
            toggleLostMessage(false);
        }
        if (desired && lastStatus && lastStatus.mode === "Lost" && !currentAutoMode) {
            autoModeToggle.checked = currentAutoMode;
            toggleLostMessage(true);
            return;
        }
        commitAutoMode(desired);
    });

    autoPressToggle.addEventListener("change", () => {
        const desired = autoPressToggle.checked;
        commitAutoPress(desired);
    });

    autoLoopToggle.addEventListener("change", () => {
        const desired = autoLoopToggle.checked;
        commitAutoLoop(desired);
    });

    removeEyeToggle.addEventListener("change", () => {
        const desired = removeEyeToggle.checked;
        commitRemoveEyeTracker(desired);
    });

    if (instaLogButton) {
        instaLogButton.addEventListener("click", handleInstaLogClick);
    }

    if (universalSpeedSelect) {
        universalSpeedSelect.addEventListener("change", () => {
            commitUniversalSpeed(universalSpeedSelect.value);
        });
    }

    if (pauseAllButton) {
        pauseAllButton.addEventListener("click", () => {
            broadcastPlaybackCommand("pause");
        });
    }

    if (playAllButton) {
        playAllButton.addEventListener("click", () => {
            broadcastPlaybackCommand("play");
        });
    }

    forceAutoButton.addEventListener("click", () => {
        commitAutoMode(true, { force: true });
    });

    dispatchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveDispatchName();
            dispatchInput.blur();
        }
    });

    dispatchInput.addEventListener("input", () => {
        dispatchInput.classList.remove("input-warning");
        if (dispatchInputWarningTimeoutId) {
            clearTimeout(dispatchInputWarningTimeoutId);
            dispatchInputWarningTimeoutId = null;
        }
    });

    if (dispatchSaveButton) {
        dispatchSaveButton.addEventListener("click", () => {
            saveDispatchName();
            dispatchInput.blur();
        });
    }

    openLogButton.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
    });

    openSettingsButton.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });

    if (openControlButton) {
        openControlButton.addEventListener("click", () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("qa-control.html") });
        });
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === "qaAssist:statusUpdate") {
            applyStatus(message);
        }
    });

    chrome.storage.local.get(
        {
            enabled: false,
            autoModeEnabled: false,
            autoPressNext: false,
            autoLoopEnabled: false,
            removeEyeTracker: false,
            universalSpeed: "off",
            dispatchName: "",
        },
        (data) => {
            currentEnabled = normalizeBoolean(data.enabled, false);
            currentAutoMode = normalizeBoolean(data.autoModeEnabled, false);
            currentAutoPress = normalizeBoolean(data.autoPressNext, false);
            currentAutoLoop = normalizeBoolean(data.autoLoopEnabled, false);
            currentRemoveEyeTracker = normalizeBoolean(data.removeEyeTracker, false);
            currentUniversalSpeed = sanitizeUniversalSpeed(data.universalSpeed || "off");

            extensionToggle.checked = currentEnabled;
            autoModeToggle.checked = currentAutoMode;
            autoPressToggle.checked = currentAutoPress;
            autoLoopToggle.checked = currentAutoLoop;
            removeEyeToggle.checked = currentRemoveEyeTracker;
            if (universalSpeedSelect) {
                universalSpeedSelect.value = currentUniversalSpeed;
            }
            currentDispatchName = data.dispatchName || "";
            dispatchInput.value = currentDispatchName;
            updateStatusIcon();
            applyAutomationStyles(lastStatus);

            requestStatus();
        },
    );
});
