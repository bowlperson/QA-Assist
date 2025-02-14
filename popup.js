document.addEventListener("DOMContentLoaded", function () {
    let toggle = document.getElementById("toggle");
    let speedSelect = document.getElementById("speed");
    let keySelect = document.getElementById("keySelect");
    let statusText = document.getElementById("statusText");
    let autoPressNextToggle = document.getElementById("autoPressNext");
    let removeEyeTrackerToggle = document.getElementById("removeEyeTracker"); // New toggle
    let viewLogsButton = document.getElementById("viewLogs"); // "View Logs" button

    // Load stored settings with new defaults
    chrome.storage.sync.get(["enabled", "playbackSpeed", "pressKey", "autoPressNext", "removeEyeTracker"], function (data) {
        console.log("🔄 Loaded settings:", data);

        toggle.checked = data.enabled ?? false;
        speedSelect.value = data.playbackSpeed || "1"; // Default to 1x
        keySelect.value = data.pressKey || "ArrowDown"; // Default to ArrowDown
        autoPressNextToggle.checked = data.autoPressNext ?? false; // Default to disabled
        removeEyeTrackerToggle.checked = data.removeEyeTracker ?? false; // Default to disabled
        updateStatus(toggle.checked);
    });

    // Function to update the status indicator
    function updateStatus(isEnabled) {
        statusText.textContent = isEnabled ? "Enabled" : "Disabled";
        statusText.style.color = isEnabled ? "green" : "red";
    }

    // Toggle switch event
    toggle.addEventListener("change", function () {
        let isEnabled = toggle.checked;
        console.log("🔘 Toggling state to:", isEnabled);

        chrome.storage.sync.set({ enabled: isEnabled }, () => {
            updateStatus(isEnabled);
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { enabled: isEnabled });
                }
            });
        });
    });

    // Auto Press Next List Toggle
    autoPressNextToggle.addEventListener("change", function () {
        let isEnabled = autoPressNextToggle.checked;
        console.log("🔄 Auto Press Next List:", isEnabled);

        chrome.storage.sync.set({ autoPressNext: isEnabled }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { autoPressNext: isEnabled });
                }
            });
        });
    });

    // Remove Eye Tracker Toggle
    removeEyeTrackerToggle.addEventListener("change", function () {
        let isEnabled = removeEyeTrackerToggle.checked;
        console.log("👀 Remove Eye Tracker:", isEnabled);

        chrome.storage.sync.set({ removeEyeTracker: isEnabled }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { removeEyeTracker: isEnabled });
                }
            });
        });
    });

    // Speed selection event
    speedSelect.addEventListener("change", function () {
        let selectedSpeed = speedSelect.value;
        console.log("⚡ Speed changed to:", selectedSpeed);

        chrome.storage.sync.set({ playbackSpeed: selectedSpeed }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { playbackSpeed: selectedSpeed });
                }
            });
        });
    });

    // Key selection event
    keySelect.addEventListener("change", function () {
        let selectedKey = keySelect.value;
        console.log("🎯 Key changed to:", selectedKey);

        chrome.storage.sync.set({ pressKey: selectedKey }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { pressKey: selectedKey });
                }
            });
        });
    });

    // Open log.html when clicking "View Logs" button
    viewLogsButton.addEventListener("click", function () {
        chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
    });
});
