document.addEventListener("DOMContentLoaded", () => {
    const scanningToggle = document.getElementById("enableScanning");
    const scanningStatus = document.getElementById("scanningStatus");
    const playbackSelect = document.getElementById("playbackSpeed");
    const keySelect = document.getElementById("pressKey");
    const autoPressNextToggle = document.getElementById("autoPressNext");
    const removeEyeTrackerToggle = document.getElementById("removeEyeTracker");
    const monitorInput = document.getElementById("monitorName");

    function sendMessageToActiveTab(payload) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs.length) {
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, payload, () => chrome.runtime.lastError);
        });
    }

    function updateScanningStatus(isEnabled) {
        scanningStatus.textContent = isEnabled ? "Active" : "Standby";
        scanningStatus.classList.toggle("active", isEnabled);
    }

    function setEnabledState(isEnabled) {
        scanningToggle.checked = isEnabled;
        updateScanningStatus(isEnabled);
        chrome.storage.sync.set({ enabled: isEnabled }, () => {
            sendMessageToActiveTab({ enabled: isEnabled });
            chrome.runtime.sendMessage({ type: "updateBrowserIcon", enabled: isEnabled });
        });
    }

    chrome.storage.sync.get(
        ["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker", "monitorName", "siteOverrides"],
        (data) => {
            const enabled = data.enabled ?? false;
            scanningToggle.checked = enabled;
            updateScanningStatus(enabled);

            playbackSelect.value = data.playbackSpeed || "1";
            keySelect.value = data.pressKey || "ArrowDown";
            autoPressNextToggle.checked = data.autoPressNext ?? false;
            removeEyeTrackerToggle.checked = data.removeEyeTracker ?? false;
            monitorInput.value = data.monitorName || "";

            sendMessageToActiveTab({ siteOverrides: Array.isArray(data.siteOverrides) ? data.siteOverrides : [] });
        },
    );

    scanningToggle.addEventListener("change", () => {
        const isEnabled = scanningToggle.checked;
        setEnabledState(isEnabled);
    });

    playbackSelect.addEventListener("change", () => {
        const speed = playbackSelect.value;
        chrome.storage.sync.set({ playbackSpeed: speed }, () => {
            sendMessageToActiveTab({ playbackSpeed: speed });
        });
    });

    keySelect.addEventListener("change", () => {
        const key = keySelect.value;
        chrome.storage.sync.set({ pressKey: key }, () => {
            sendMessageToActiveTab({ pressKey: key });
        });
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

    function persistMonitorName() {
        const name = monitorInput.value.trim();
        chrome.storage.sync.set({ monitorName: name });
    }

    monitorInput.addEventListener("blur", persistMonitorName);
    monitorInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            monitorInput.blur();
        }
    });
});
