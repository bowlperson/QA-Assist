chrome.tabs.onActivated.addListener(() => {
    chrome.storage.sync.get("enabled", function (data) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { enabled: data.enabled });
            }
        });
    });
});

function updateBrowserActionIcon(isEnabled) {
    if (chrome.browserAction) {
        chrome.browserAction.setIcon({ path: isEnabled ? "on.png" : "off.png" });
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get("enabled", function (data) {
        const enabled = typeof data.enabled === "boolean" ? data.enabled : false;
        updateBrowserActionIcon(enabled);
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get("enabled", function (data) {
        const enabled = typeof data.enabled === "boolean" ? data.enabled : false;
        updateBrowserActionIcon(enabled);
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) {
        updateBrowserActionIcon(changes.enabled.newValue);
    }
});
