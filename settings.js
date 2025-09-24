document.addEventListener('DOMContentLoaded', function () {
    SettingsController.setup({
        toggleId: 'toggle',
        speedSelectId: 'speed',
        keySelectId: 'keySelect',
        autoPressNextId: 'autoPressNext',
        removeEyeTrackerId: 'removeEyeTracker',
        statusTextId: 'statusText',
        statusIconId: 'statusIcon',
        viewLogsButtonId: 'viewLogs',
        onOpenLogs: function () {
            window.location.href = chrome.runtime.getURL('log.html');
        },
    });
});
