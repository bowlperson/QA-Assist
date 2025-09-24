document.addEventListener("DOMContentLoaded", function () {
    SettingsController.setup({
        toggleId: "toggle",
        speedSelectId: "speed",
        keySelectId: "keySelect",
        autoPressNextId: "autoPressNext",
        removeEyeTrackerId: "removeEyeTracker",
        statusTextId: "statusText",
        statusIconId: "statusIcon",
        viewLogsButtonId: "viewLogs",
        onOpenLogs: () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
        },
    });

    function openPage(page) {
        chrome.tabs.create({ url: chrome.runtime.getURL(page) });
    }

    const callValidationButton = document.getElementById("openCallValidation");
    const settingsPageButton = document.getElementById("openSettingsPage");
    const siteInfoButton = document.getElementById("openSiteInfo");

    if (callValidationButton) {
        callValidationButton.addEventListener("click", () => openPage("call-validation.html"));
    }

    if (settingsPageButton) {
        settingsPageButton.addEventListener("click", () => openPage("settings.html"));
    }

    if (siteInfoButton) {
        siteInfoButton.addEventListener("click", () => openPage("site-info.html"));
    }
});
