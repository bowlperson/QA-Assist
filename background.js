chrome.tabs.onActivated.addListener(() => {
    chrome.storage.sync.get("enabled", function (data) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { enabled: data.enabled });
            }
        });
    });
});
