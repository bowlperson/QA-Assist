const SettingsController = (function () {
    function setup(config) {
        const {
            toggleId,
            speedSelectId,
            keySelectId,
            autoPressNextId,
            removeEyeTrackerId,
            statusTextId,
            statusIconId,
            viewLogsButtonId,
            onOpenLogs,
        } = config;

        const toggle = document.getElementById(toggleId);
        const speedSelect = document.getElementById(speedSelectId);
        const keySelect = document.getElementById(keySelectId);
        const statusText = document.getElementById(statusTextId);
        const statusIcon = document.getElementById(statusIconId);
        const autoPressNextToggle = document.getElementById(autoPressNextId);
        const removeEyeTrackerToggle = document.getElementById(removeEyeTrackerId);
        const viewLogsButton = viewLogsButtonId ? document.getElementById(viewLogsButtonId) : null;

        if (!toggle || !speedSelect || !keySelect) {
            console.warn("SettingsController: Missing required elements");
            return;
        }

        function updateStatus(isEnabled) {
            if (statusText) {
                statusText.textContent = isEnabled ? "Enabled" : "Disabled";
                statusText.style.color = isEnabled ? "#00d26a" : "#ff5252";
            }
            if (statusIcon) {
                statusIcon.src = isEnabled ? "on.png" : "off.png";
            }
            if (typeof chrome !== "undefined" && chrome.browserAction) {
                chrome.browserAction.setIcon({ path: isEnabled ? "on.png" : "off.png" });
            }
        }

        function sendMessage(payload) {
            if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
                return;
            }
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, payload);
                }
            });
        }

        chrome.storage.sync.get([
            "enabled",
            "playbackSpeed",
            "pressKey",
            "autoPressNext",
            "removeEyeTracker",
        ], function (data) {
            toggle.checked = typeof data.enabled === "boolean" ? data.enabled : false;
            speedSelect.value = data.playbackSpeed || "1";
            keySelect.value = data.pressKey || "ArrowDown";
            if (autoPressNextToggle) {
                autoPressNextToggle.checked = typeof data.autoPressNext === "boolean" ? data.autoPressNext : false;
            }
            if (removeEyeTrackerToggle) {
                removeEyeTrackerToggle.checked = typeof data.removeEyeTracker === "boolean" ? data.removeEyeTracker : false;
            }
            updateStatus(toggle.checked);
        });

        toggle.addEventListener("change", function () {
            const isEnabled = toggle.checked;
            chrome.storage.sync.set({ enabled: isEnabled }, function () {
                updateStatus(isEnabled);
                sendMessage({ enabled: isEnabled });
            });
        });

        speedSelect.addEventListener("change", function () {
            const selectedSpeed = speedSelect.value;
            chrome.storage.sync.set({ playbackSpeed: selectedSpeed }, function () {
                sendMessage({ playbackSpeed: selectedSpeed });
            });
        });

        keySelect.addEventListener("change", function () {
            const selectedKey = keySelect.value;
            chrome.storage.sync.set({ pressKey: selectedKey }, function () {
                sendMessage({ pressKey: selectedKey });
            });
        });

        if (autoPressNextToggle) {
            autoPressNextToggle.addEventListener("change", function () {
                const isEnabled = autoPressNextToggle.checked;
                chrome.storage.sync.set({ autoPressNext: isEnabled }, function () {
                    sendMessage({ autoPressNext: isEnabled });
                });
            });
        }

        if (removeEyeTrackerToggle) {
            removeEyeTrackerToggle.addEventListener("change", function () {
                const isEnabled = removeEyeTrackerToggle.checked;
                chrome.storage.sync.set({ removeEyeTracker: isEnabled }, function () {
                    sendMessage({ removeEyeTracker: isEnabled });
                });
            });
        }

        if (viewLogsButton && typeof onOpenLogs === "function") {
            viewLogsButton.addEventListener("click", onOpenLogs);
        }

        return {
            updateStatus,
        };
    }

    return {
        setup,
    };
})();
