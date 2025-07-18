// log.js
document.addEventListener("DOMContentLoaded", function () {
    const logTableBody = document.getElementById("logTableBody");
    const bookmarkBody = document.getElementById("bookmarkBody");
    const clearLogsButton = document.getElementById("clearLogs");
    const exportCSVButton = document.getElementById("exportCSV");
    const eventCount = document.getElementById("eventCount");
    const bookmarkCount = document.getElementById("bookmarkCount");
    const filterInput = document.getElementById("filterInput");
    const openSettingsButton = document.getElementById("openSettings");

    let logs = [];

    // Load logs
    chrome.storage.local.get("eventLogs", function (data) {
        logs = data.eventLogs || [];
        updateDisplays(logs);
    });

    function updateDisplays(allLogs) {
        const keyword = filterInput.value.toLowerCase();
        const bookmarks = allLogs.filter(log => log.bookmarked);
        const normalLogs = allLogs.filter(log => !log.bookmarked);

        // Filter normal by keyword
        const filtered = normalLogs.filter(log =>
            (log.eventType || "").toLowerCase().includes(keyword) ||
            (log.truckNumber || "").toLowerCase().includes(keyword) ||
            (log.timestamp || "").toLowerCase().includes(keyword) ||
            (log.pageUrl || "").toLowerCase().includes(keyword)
        );

        // Update counts
        eventCount.textContent = `(Watched ${normalLogs.length} Events)`;
        bookmarkCount.textContent = `(${bookmarks.length} Bookmarked)`;

        // Render bookmarks
        bookmarkBody.innerHTML = "";
        bookmarks.slice().reverse().forEach(log => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${log.eventType || '—'}</td>
                <td>${log.truckNumber || '—'}</td>
                <td>${log.timestamp || '—'}</td>
                <td>
                  <a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a>
                  <button class="mark-btn">\u2605</button>
                </td>
                <td><span class="comment-text">${log.comment || ''}</span></td>
            `;
            row.querySelector('.mark-btn').addEventListener('click', () => {
                log.bookmarked = false;
                chrome.storage.local.set({ eventLogs: logs }, () => updateDisplays(logs));
            });
            bookmarkBody.appendChild(row);
        });

        // Render normal logs
        logTableBody.innerHTML = "";
        filtered.slice().reverse().forEach(log => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${log.eventType || '—'}</td>
                <td>${log.truckNumber || '—'}</td>
                <td>${log.timestamp || '—'}</td>
                <td>
                  <a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a>
                  <button class="mark-btn">\u2606</button>
                </td>
            `;
            row.querySelector('.mark-btn').addEventListener('click', () => {
                const comment = prompt('Add a comment for this bookmark:');
                log.bookmarked = true;
                log.comment = comment || '';
                chrome.storage.local.set({ eventLogs: logs }, () => updateDisplays(logs));
            });
            logTableBody.appendChild(row);
        });
    }

    // Clear logs
    clearLogsButton.addEventListener("click", function () {
        if (confirm("Are you sure you want to clear all logs?")) {
            logs = [];
            chrome.storage.local.set({ eventLogs: [] }, () => updateDisplays(logs));
        }
    });

    // Filtering
    filterInput.addEventListener("input", () => updateDisplays(logs));

    if (openSettingsButton) {
        openSettingsButton.addEventListener("click", () => {
            window.open("settings.html");
        });
    }

    // Export to CSV
    exportCSVButton.addEventListener("click", function () {
        let csvContent = "data:text/csv;charset=utf-8,Event Type,Truck Number,Timestamp,Page URL,Bookmarked,Comment\n";
        logs.forEach(log => {
            csvContent += `"${log.eventType}","${log.truckNumber}","${log.timestamp}","${log.pageUrl}","${log.bookmarked ? 'Yes' : 'No'}","${log.comment || ''}"\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "event_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
