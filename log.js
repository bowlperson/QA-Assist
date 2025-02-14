document.addEventListener("DOMContentLoaded", function () {
    let logTableBody = document.getElementById("logTableBody");
    let clearLogsButton = document.getElementById("clearLogs"); 
    let exportCSVButton = document.getElementById("exportCSV");
    let eventCount = document.getElementById("eventCount"); // Get the event count span
    let filterInput = document.getElementById("filterInput"); // Get the search input box

    let logs = []; // Store logs in memory for filtering

    // Load stored logs and display them in the table
    chrome.storage.local.get("eventLogs", function (data) {
        logs = data.eventLogs || [];
        
        // Update event count display
        eventCount.textContent = `(Watched ${logs.length} Events)`;

        displayLogs(logs);
    });

    // Function to display logs based on filter
    function displayLogs(filteredLogs) {
        logTableBody.innerHTML = ""; // Clear the table
        filteredLogs.forEach(log => {
            let row = document.createElement("tr");

            row.innerHTML = `<td>${log.eventType}</td>
                             <td>${log.truckNumber}</td>
                             <td>${log.timestamp}</td>
                             <td><a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a></td>`;
            
            logTableBody.appendChild(row);
        });
    }

    // Event listener for clearing logs
    clearLogsButton.addEventListener("click", function () {
        if (confirm("Are you sure you want to clear all logs?")) {
            chrome.storage.local.set({ eventLogs: [] }, () => {
                console.log("🗑️ All logs cleared.");
                logs = [];
                displayLogs(logs);
                eventCount.textContent = `(Watched 0 Events)`;
            });
        }
    });

    // Event listener for filtering logs
    filterInput.addEventListener("input", function () {
        let keyword = filterInput.value.toLowerCase();
        let filteredLogs = logs.filter(log => 
            log.eventType.toLowerCase().includes(keyword) ||
            log.truckNumber.toLowerCase().includes(keyword) ||
            log.timestamp.toLowerCase().includes(keyword) ||
            log.pageUrl.toLowerCase().includes(keyword)
        );
        displayLogs(filteredLogs);
    });

    // Function to export logs to CSV
    function exportToCSV() {
        let keyword = filterInput.value.toLowerCase();
        let filteredLogs = logs.filter(log => 
            log.eventType.toLowerCase().includes(keyword) ||
            log.truckNumber.toLowerCase().includes(keyword) ||
            log.timestamp.toLowerCase().includes(keyword) ||
            log.pageUrl.toLowerCase().includes(keyword)
        );

        // Convert logs to CSV format
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Event Type,Truck Number,Timestamp,Page URL\n";

        filteredLogs.forEach(log => {
            let row = `"${log.eventType}","${log.truckNumber}","${log.timestamp}","${log.pageUrl}"`;
            csvContent += row + "\n";
        });

        // Create a downloadable link
        let encodedUri = encodeURI(csvContent);
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "event_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Event listener for exporting logs
    exportCSVButton.addEventListener("click", exportToCSV);
});
