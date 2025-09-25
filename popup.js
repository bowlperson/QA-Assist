document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("toggle");
    const speedSelect = document.getElementById("speed");
    const keySelect = document.getElementById("keySelect");
    const statusText = document.getElementById("statusText");
    const statusDot = document.getElementById("statusDot");
    const scanningBadge = document.getElementById("scanningBadge");
    const scanIndicator = document.getElementById("scanIndicator");
    const statusIcon = document.getElementById("statusIcon");
    const autoPressNextToggle = document.getElementById("autoPressNext");
    const removeEyeTrackerToggle = document.getElementById("removeEyeTracker");
    const monitorNameInput = document.getElementById("monitorName");
    const viewLogsButton = document.getElementById("viewLogs");
    const overrideBadge = document.getElementById("overrideBadge");
    const openSettingsButton = document.getElementById("openSettings");

    const scanConfirmModal = document.getElementById("scanConfirm");
    const confirmScanButton = document.getElementById("confirmScan");
    const cancelScanButton = document.getElementById("cancelScan");

    let currentEnabledState = false;
    let cachedOverrides = [];

    function findOverrideForUrl(url, overrides) {
        if (!url || !Array.isArray(overrides)) {
            return null;
        }

        let host = "";
        try {
            host = new URL(url).hostname.toLowerCase();
        } catch (error) {
            host = url.toLowerCase();
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

    function updateOverrideBadge(overrides) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs.length) {
                return;
            }

            const activeTab = tabs[0];
            const override = findOverrideForUrl(activeTab.url, overrides);

            if (override) {
                overrideBadge.textContent = override.name ? `Override: ${override.name}` : "Override active";
                overrideBadge.classList.add("active");
                overrideBadge.classList.remove("subtle");
            } else {
                overrideBadge.textContent = "No active override";
                overrideBadge.classList.remove("active");
                overrideBadge.classList.add("subtle");
            }
        });
    }

    function updateStatusVisuals(isEnabled) {
        statusText.textContent = isEnabled ? "Scanning" : "Standby";
        statusText.style.color = isEnabled ? "var(--success)" : "var(--warning)";
        statusDot.style.background = isEnabled ? "var(--success)" : "var(--warning)";
        statusDot.style.boxShadow = isEnabled
            ? "0 0 10px rgba(61, 214, 140, 0.7)"
            : "0 0 8px rgba(246, 201, 95, 0.6)";

        scanningBadge.textContent = isEnabled ? "Active" : "Standby";
        scanningBadge.classList.toggle("active", isEnabled);
        scanningBadge.classList.toggle("alert", !isEnabled);

        scanIndicator.textContent = isEnabled
            ? "Scanning mode is actively monitoring for new events."
            : "Scanning mode is currently inactive.";
        scanIndicator.classList.toggle("active", isEnabled);

        const iconPath = isEnabled ? "on.png" : "off.png";

        if (chrome.browserAction && chrome.browserAction.setIcon) {
            chrome.browserAction.setIcon({ path: iconPath });
        }

        if (statusIcon) {
            statusIcon.src = chrome.runtime.getURL(iconPath);
            statusIcon.alt = `QA Assist ${isEnabled ? "enabled" : "disabled"} status icon`;
        }
    }

    function sendMessageToActiveTab(payload) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs.length) {
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, payload, () => chrome.runtime.lastError);
        });
    }

    function setEnabledState(isEnabled) {
        currentEnabledState = isEnabled;
        toggle.checked = isEnabled;
        updateStatusVisuals(isEnabled);

        chrome.storage.sync.set({ enabled: isEnabled }, () => {
            sendMessageToActiveTab({ enabled: isEnabled });
        });
    }

    function openScanConfirm() {
        scanConfirmModal.classList.add("show");
    }

    function closeScanConfirm() {
        scanConfirmModal.classList.remove("show");
    }

    chrome.storage.sync.get(
        ["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker", "monitorName", "siteOverrides"],
        (data) => {
            currentEnabledState = data.enabled ?? false;
            toggle.checked = currentEnabledState;
            speedSelect.value = data.playbackSpeed || "1";
            keySelect.value = data.pressKey || "ArrowDown";
            autoPressNextToggle.checked = data.autoPressNext ?? false;
            removeEyeTrackerToggle.checked = data.removeEyeTracker ?? false;
            monitorNameInput.value = data.monitorName || "";
            cachedOverrides = Array.isArray(data.siteOverrides) ? data.siteOverrides : [];

            updateStatusVisuals(currentEnabledState);
            updateOverrideBadge(cachedOverrides);
            sendMessageToActiveTab({ siteOverrides: cachedOverrides });
        },
    );

    toggle.addEventListener("change", () => {
        const desiredState = toggle.checked;
        if (desiredState && !currentEnabledState) {
            toggle.checked = currentEnabledState;
            openScanConfirm();
            return;
        }

        setEnabledState(desiredState);
    });

    confirmScanButton.addEventListener("click", () => {
        closeScanConfirm();
        setEnabledState(true);
    });

    cancelScanButton.addEventListener("click", () => {
        closeScanConfirm();
        setEnabledState(false);
    });

    autoPressNextToggle.addEventListener("change", () => {
        const isEnabled = autoPressNextToggle.checked;
        chrome.storage.sync.set({ autoPressNext: isEnabled }, () => {
            sendMessageToActiveTab({ autoPressNext: isEnabled });
        });
    });

    removeEyeTrackerToggle.addEventListener("change", () => {
        const isEnabled = removeEyeTrackerToggle.checked;
        chrome.storage.sync.set({ removeEyeTracker: isEnabled }, () => {
            sendMessageToActiveTab({ removeEyeTracker: isEnabled });
        });
    });

    speedSelect.addEventListener("change", () => {
        const selectedSpeed = speedSelect.value;
        chrome.storage.sync.set({ playbackSpeed: selectedSpeed }, () => {
            sendMessageToActiveTab({ playbackSpeed: selectedSpeed });
        });
    });

    keySelect.addEventListener("change", () => {
        const selectedKey = keySelect.value;
        chrome.storage.sync.set({ pressKey: selectedKey }, () => {
            sendMessageToActiveTab({ pressKey: selectedKey });
        });
    });

    monitorNameInput.addEventListener("blur", () => {
        const name = monitorNameInput.value.trim();
        chrome.storage.sync.set({ monitorName: name });
    });

    monitorNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            monitorNameInput.blur();
        }
    });

    viewLogsButton.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
    });

    openSettingsButton.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });
});
