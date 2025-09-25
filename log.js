// Enhanced log.js for QA Assist

document.addEventListener("DOMContentLoaded", () => {
    const logTableBody = document.getElementById("logTableBody");
    const bookmarkBody = document.getElementById("bookmarkBody");
    const clearLogsButton = document.getElementById("clearLogs");
    const exportCSVButton = document.getElementById("exportCSV");
    const eventCount = document.getElementById("eventCount");
    const bookmarkCount = document.getElementById("bookmarkCount");
    const filterInput = document.getElementById("filterInput");

    const callModal = document.getElementById("callModal");
    const closeCallModalButton = document.getElementById("closeCallModal");
    const cancelCallButton = document.getElementById("cancelCall");
    const saveCallButton = document.getElementById("saveCall");
    const copyTabOutputButton = document.getElementById("copyTabOutput");
    const contactYesButton = document.getElementById("contactYes");
    const contactNoButton = document.getElementById("contactNo");
    const contactError = document.getElementById("contactError");
    const monitorInput = document.getElementById("modalMonitorName");
    const monitorError = document.getElementById("monitorError");
    const validationDisplay = document.getElementById("validationDisplay");
    const validationYesButton = document.getElementById("validationYes");
    const validationNoButton = document.getElementById("validationNo");
    const validationEditGroup = document.getElementById("validationEditGroup");
    const validationInput = document.getElementById("validationInput");
    const saveValidationButton = document.getElementById("saveValidation");
    const cancelValidationEditButton = document.getElementById("cancelValidationEdit");
    const validationError = document.getElementById("validationError");

    const callResultBox = document.getElementById("callResultBox");
    const tabOutput = document.getElementById("tabOutput");
    const callSummaryLeft = document.getElementById("callSummaryLeft");
    const callSummaryRight = document.getElementById("callSummaryRight");
    const copyEventTimeButton = document.getElementById("copyEventTime");
    const copyCallTimeButton = document.getElementById("copyCallTime");

    let logs = [];
    let activeCallState = null;

    function normalizeValidationType(value) {
        const text = String(value || "").trim();
        if (!text) {
            return "";
        }

        const lower = text.toLowerCase();

        if (lower.includes("blocked")) {
            return "Blocked";
        }
        if (lower.includes("critical")) {
            return "Critical";
        }
        if (lower.includes("moderate")) {
            return "Moderate";
        }
        if (lower.includes("low")) {
            return "3 Low/hr";
        }
        if (lower.includes("cell")) {
            return "Cellphone";
        }
        if (lower.includes("non") || lower.includes("false")) {
            return "False Positive";
        }
        if (lower.includes("lost")) {
            return "Lost Connection";
        }

        return text;
    }

    function extractHourMinuteFromDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return { hour: "", minute: "" };
        }

        return {
            hour: String(date.getHours()),
            minute: String(date.getMinutes()),
        };
    }

    function extractHourMinuteFromText(text) {
        if (!text) {
            return null;
        }

        const match = String(text)
            .trim()
            .match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);

        if (!match) {
            return null;
        }

        let hour = Number.parseInt(match[1], 10);
        const minuteValue = Number.parseInt(match[2], 10);
        if (Number.isNaN(hour) || Number.isNaN(minuteValue)) {
            return null;
        }

        const meridiem = match[4] ? match[4].toUpperCase() : null;
        if (meridiem === "PM" && hour < 12) {
            hour += 12;
        } else if (meridiem === "AM" && hour === 12) {
            hour = 0;
        }

        return {
            hour: String(hour),
            minute: String(minuteValue),
        };
    }

    function getEventTimeParts(log) {
        if (!log) {
            return { hour: "", minute: "" };
        }

        const fromTimestamp = extractHourMinuteFromText(log.timestamp);
        if (fromTimestamp) {
            return fromTimestamp;
        }

        const createdAt = log.createdAt ? new Date(log.createdAt) : null;
        if (createdAt) {
            return extractHourMinuteFromDate(createdAt);
        }

        return { hour: "", minute: "" };
    }

    function getCallTimeParts(callHistory) {
        const safeHistory = Array.isArray(callHistory) ? callHistory : [];

        return [0, 1, 2].map((index) => {
            const entry = safeHistory[index];
            if (!entry) {
                return { hour: "", minute: "" };
            }

            const entryDate = entry.timestamp ? new Date(entry.timestamp) : null;
            if (entryDate) {
                const parts = extractHourMinuteFromDate(entryDate);
                if (parts.hour || parts.minute) {
                    return parts;
                }
            }

            const fallback = extractHourMinuteFromText(entry.time || entry.tabRow || "");
            return fallback || { hour: "", minute: "" };
        });
    }

    function setValidationButtonState(choice) {
        validationYesButton.classList.toggle("active", choice === "yes");
        validationNoButton.classList.toggle("active", choice === "no");
    }

    function flashButtonFeedback(button, message, duration = 1200) {
        if (!button) {
            return;
        }
        const original = button.textContent;
        button.textContent = message;
        button.disabled = true;
        setTimeout(() => {
            button.textContent = original;
            button.disabled = false;
        }, duration);
    }

    function generateId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    function createEventKey(log) {
        if (!log) {
            return "";
        }

        const keyParts = [
            log.eventId || "",
            log.eventType || "",
            log.truckNumber || "",
            log.timestamp || "",
            log.pageUrl || "",
        ];

        return keyParts.map((part) => String(part || "").trim().toLowerCase()).join("|");
    }

    function ensureLogShape(log) {
        if (!log) {
            return null;
        }

        const shaped = { ...log };

        shaped.callHistory = Array.isArray(shaped.callHistory) ? shaped.callHistory : [];
        shaped.eventKey = shaped.eventKey || createEventKey(shaped);
        shaped.id = shaped.id || generateId();
        const detected =
            shaped.detectedValidation ||
            shaped.validationTypeDetected ||
            shaped.validationTypeRaw ||
            shaped.validationTypeOriginal ||
            "";
        shaped.detectedValidation = detected;
        const normalizedValidation = normalizeValidationType(
            shaped.validationType || detected || shaped.eventType || "",
        );
        shaped.validationType = normalizedValidation;

        return shaped;
    }

    function deduplicateLogs(allLogs) {
        const seen = new Set();
        const deduped = [];

        (allLogs || []).forEach((log) => {
            const shaped = ensureLogShape(log);
            if (!shaped) {
                return;
            }

            const key = shaped.eventKey || createEventKey(shaped);
            if (key && seen.has(key)) {
                return;
            }

            if (key) {
                seen.add(key);
            }

            deduped.push(shaped);
        });

        return deduped;
    }

    function saveLogs() {
        chrome.storage.local.set({ eventLogs: logs });
    }

    function formatDate(date) {
        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    }

    function formatTime(date) {
        return date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    function getLogById(id) {
        return logs.find((log) => log.id === id);
    }

    function createBookmarkButton(log) {
        const button = document.createElement("button");
        button.className = "bookmark-button";
        button.title = log.bookmarked ? "Remove bookmark" : "Bookmark event";
        button.textContent = log.bookmarked ? "★" : "☆";

        button.addEventListener("click", () => {
            if (log.bookmarked) {
                log.bookmarked = false;
                log.comment = "";
            } else {
                const comment = prompt("Add a comment for this bookmark:", log.comment || "");
                log.bookmarked = true;
                log.comment = comment || "";
            }
            saveLogs();
            updateDisplays(logs);
        });

        return button;
    }

    function createCallButton(log) {
        const button = document.createElement("button");
        button.className = "call-button";
        button.textContent = "📞";
        button.title = "Log call and generate Excel row";
        button.addEventListener("click", () => openCallModal(log.id));
        return button;
    }

    function renderBookmarkRow(log) {
        const row = document.createElement("tr");

        const eventCell = document.createElement("td");
        eventCell.innerHTML = `<div>${log.eventType || "—"}</div><div class="badge" style="margin-top:6px;">${
            log.eventId || "ID unavailable"
        }</div>`;

        const truckCell = document.createElement("td");
        truckCell.textContent = log.truckNumber || "—";

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp || "—";

        const siteCell = document.createElement("td");
        siteCell.textContent = (log.siteName || "—").trim();

        const pageCell = document.createElement("td");
        pageCell.innerHTML = log.pageUrl
            ? `<a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a>`
            : "—";

        const commentCell = document.createElement("td");
        commentCell.textContent = log.comment || "";

        const actionsCell = document.createElement("td");
        actionsCell.appendChild(createBookmarkButton(log));
        actionsCell.appendChild(createCallButton(log));

        row.appendChild(eventCell);
        row.appendChild(truckCell);
        row.appendChild(timestampCell);
        row.appendChild(siteCell);
        row.appendChild(pageCell);
        row.appendChild(commentCell);
        row.appendChild(actionsCell);

        return row;
    }

    function renderLogRow(log) {
        const row = document.createElement("tr");

        const eventIdCell = document.createElement("td");
        eventIdCell.textContent = log.eventId || "—";

        const eventTypeCell = document.createElement("td");
        eventTypeCell.textContent = log.eventType || "—";

        const truckCell = document.createElement("td");
        truckCell.textContent = log.truckNumber || "—";

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp || "—";

        const siteCell = document.createElement("td");
        siteCell.textContent = (log.siteName || "—").trim();

        const pageCell = document.createElement("td");
        pageCell.innerHTML = log.pageUrl
            ? `<a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a>`
            : "—";

        const callsCell = document.createElement("td");
        const attempts = Array.isArray(log.callHistory) ? log.callHistory.length : 0;
        callsCell.innerHTML = attempts
            ? `<span class="badge success">${attempts} Call${attempts > 1 ? "s" : ""}</span>`
            : "—";

        const actionsCell = document.createElement("td");
        actionsCell.style.display = "flex";
        actionsCell.style.gap = "8px";
        actionsCell.appendChild(createBookmarkButton(log));
        actionsCell.appendChild(createCallButton(log));

        row.appendChild(eventIdCell);
        row.appendChild(eventTypeCell);
        row.appendChild(truckCell);
        row.appendChild(timestampCell);
        row.appendChild(siteCell);
        row.appendChild(pageCell);
        row.appendChild(callsCell);
        row.appendChild(actionsCell);

        return row;
    }

    function updateDisplays(allLogs) {
        const list = Array.isArray(allLogs) ? allLogs : logs;
        const keyword = filterInput.value.trim().toLowerCase();

        const bookmarks = list.filter((log) => log.bookmarked);
        const normalLogs = list.filter((log) => !log.bookmarked);

        const filteredNormals = normalLogs.filter((log) => {
            const haystack = [
                log.eventType,
                log.truckNumber,
                log.timestamp,
                log.pageUrl,
                log.siteName,
                log.eventId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(keyword);
        });

        eventCount.textContent = `${filteredNormals.length} item${filteredNormals.length === 1 ? "" : "s"}`;
        bookmarkCount.textContent = `${bookmarks.length} item${bookmarks.length === 1 ? "" : "s"}`;

        bookmarkBody.innerHTML = "";
        bookmarks
            .slice()
            .reverse()
            .forEach((log) => {
                bookmarkBody.appendChild(renderBookmarkRow(log));
            });

        logTableBody.innerHTML = "";
        filteredNormals
            .slice()
            .reverse()
            .forEach((log) => {
                logTableBody.appendChild(renderLogRow(log));
            });
    }

    function resetCallState() {
        activeCallState = null;
        callResultBox.classList.add("hidden");
        tabOutput.value = "";
        contactYesButton.classList.remove("active");
        contactNoButton.classList.remove("active");
        contactError.classList.add("hidden");
        monitorError.classList.add("hidden");
        validationError.classList.add("hidden");
        validationEditGroup.classList.add("hidden");
        validationInput.value = "";
        validationDisplay.textContent = "";
        validationDisplay.className = "tag";
        callSummaryLeft.innerHTML = "";
        callSummaryRight.innerHTML = "";
        setValidationButtonState(null);
        saveCallButton.disabled = false;
        if (copyEventTimeButton) {
            copyEventTimeButton.textContent = "Only Copy Event Time";
            copyEventTimeButton.disabled = false;
        }
        if (copyCallTimeButton) {
            copyCallTimeButton.textContent = "Only Copy Call Time";
            copyCallTimeButton.disabled = false;
        }
        copyTabOutputButton.textContent = "Copy to Clipboard";
        copyTabOutputButton.disabled = false;
    }

    function closeCallModal() {
        callModal.classList.remove("show");
        resetCallState();
    }

    function openCallModal(logId) {
        const log = getLogById(logId);
        if (!log) {
            return;
        }

        resetCallState();

        const attempts = Array.isArray(log.callHistory) ? log.callHistory.length : 0;
        const attemptNumber = attempts + 1;
        const detectedValidation =
            (log.validationType && log.validationType.trim()) ||
            (log.detectedValidation || log.validationTypeDetected || "").trim();
        const defaultValidation = normalizeValidationType(detectedValidation || log.eventType || "");

        activeCallState = {
            logId,
            attemptNumber,
            defaultValidation,
            finalValidation: defaultValidation,
            validationConfirmed: false,
            contactSelection: null,
            monitorName: "",
            detectedValidation,
            eventTimeParts: null,
            callTimeParts: null,
            latestAttemptIndex: null,
        };

        validationDisplay.textContent = defaultValidation || "—";
        validationDisplay.className = "tag";
        setValidationButtonState(null);

        callSummaryLeft.innerHTML = `
            <strong>Event Type</strong>
            <span>${log.eventType || "—"}</span>
            <strong>Truck</strong>
            <span>${log.truckNumber || "—"}</span>
            <strong>Timestamp</strong>
            <span>${log.timestamp || "—"}</span>
        `;

        callSummaryRight.innerHTML = `
            <strong>Site</strong>
            <span>${(log.siteName || "—").trim()}</span>
            <strong>Attempts Logged</strong>
            <span>${attempts}</span>
            <strong>Detected Validation</strong>
            <span>${detectedValidation || "—"}</span>
            <strong>Page</strong>
            <span>${log.pageUrl ? `<a href="${log.pageUrl}" target="_blank">${log.pageUrl}</a>` : "—"}</span>
        `;

        chrome.storage.sync.get("monitorName", (data) => {
            const storedName = data.monitorName || "";
            monitorInput.value = storedName;
            activeCallState.monitorName = storedName;
        });

        callModal.classList.add("show");
    }

    function setContactSelection(value) {
        if (!activeCallState) {
            return;
        }
        activeCallState.contactSelection = value;
        contactYesButton.classList.toggle("active", value === "yes");
        contactNoButton.classList.toggle("active", value === "no");
        contactError.classList.add("hidden");
    }

    function setValidationConfirmed(confirmed) {
        if (!activeCallState) {
            return;
        }
        activeCallState.validationConfirmed = confirmed;
        validationError.classList.add("hidden");
    }

    function generateTabDelimitedRow(log, attemptRecord, monitorName) {
        const now = attemptRecord ? new Date(attemptRecord.timestamp) : new Date();
        const dateStr = formatDate(now);
        const eventTime = getEventTimeParts(log);
        const callTimes = getCallTimeParts(log.callHistory);

        const contactMade = attemptRecord ? attemptRecord.contactMade : false;
        const receptor = contactMade ? "Dispatch" : "";
        const validationType = normalizeValidationType(
            log.validationType || activeCallState?.finalValidation || "",
        );

        const row = [
            dateStr,
            eventTime.hour,
            eventTime.minute,
            callTimes[0].hour,
            callTimes[0].minute,
            callTimes[1].hour,
            callTimes[1].minute,
            callTimes[2].hour,
            callTimes[2].minute,
            (log.siteName || "").trim(),
            log.truckNumber || "",
            validationType,
            monitorName,
            contactMade ? "Yes" : "No",
            receptor,
        ].join("\t");

        return { row, eventTime, callTimes };
    }

    function handleSaveCall() {
        if (!activeCallState) {
            return;
        }

        const log = getLogById(activeCallState.logId);
        if (!log) {
            closeCallModal();
            return;
        }

        const monitorName = monitorInput.value.trim();
        if (!monitorName) {
            monitorError.classList.remove("hidden");
            monitorInput.focus();
            return;
        }
        monitorError.classList.add("hidden");
        activeCallState.monitorName = monitorName;

        if (!activeCallState.validationConfirmed) {
            validationError.classList.remove("hidden");
            return;
        }
        validationError.classList.add("hidden");

        if (!activeCallState.contactSelection) {
            contactError.classList.remove("hidden");
            return;
        }
        contactError.classList.add("hidden");

        const contactMade = activeCallState.contactSelection === "yes";
        const timestamp = new Date().toISOString();

        const normalizedFinalValidation = normalizeValidationType(
            activeCallState.finalValidation || activeCallState.defaultValidation || log.validationType || "",
        );
        activeCallState.finalValidation = normalizedFinalValidation;
        log.validationType = normalizedFinalValidation;
        log.detectedValidation = activeCallState.detectedValidation || log.detectedValidation || "";
        log.monitorName = monitorName;
        log.callHistory = Array.isArray(log.callHistory) ? log.callHistory : [];

        const attemptRecord = {
            attempt: activeCallState.attemptNumber,
            timestamp,
            contactMade,
            receptor: contactMade ? "Dispatch" : "",
        };

        log.callHistory.push(attemptRecord);

        const { row: tabRow, eventTime, callTimes } = generateTabDelimitedRow(
            log,
            attemptRecord,
            monitorName,
        );
        attemptRecord.tabRow = tabRow;

        chrome.storage.sync.set({ monitorName });
        saveLogs();
        updateDisplays(logs);

        tabOutput.value = tabRow;
        callResultBox.classList.remove("hidden");
        saveCallButton.disabled = true;
        activeCallState.eventTimeParts = eventTime;
        activeCallState.callTimeParts = callTimes;
        activeCallState.latestAttemptIndex = Math.min(
            callTimes.length - 1,
            Math.max(0, attemptRecord.attempt - 1),
        );
    }

    filterInput.addEventListener("input", () => updateDisplays(logs));

    clearLogsButton.addEventListener("click", () => {
        if (!logs.length) {
            return;
        }

        if (confirm("Are you sure you want to clear all logs?")) {
            logs = [];
            saveLogs();
            updateDisplays(logs);
        }
    });

    exportCSVButton.addEventListener("click", () => {
        if (!logs.length) {
            return;
        }

        const header = [
            "Event ID",
            "Event Type",
            "Truck Number",
            "Timestamp",
            "Site",
            "Page URL",
            "Calls",
            "Validation Type",
            "Monitor Name",
            "Last Contact",
            "Tab Row",
        ];

        const rows = logs.map((log) => {
            const attempts = Array.isArray(log.callHistory) ? log.callHistory.length : 0;
            const lastAttempt = attempts ? log.callHistory[attempts - 1] : null;

            return [
                log.eventId || "",
                log.eventType || "",
                log.truckNumber || "",
                log.timestamp || "",
                (log.siteName || "").trim(),
                log.pageUrl || "",
                attempts,
                log.validationType || log.eventType || "",
                log.monitorName || "",
                lastAttempt ? (lastAttempt.contactMade ? "Contacted" : "No Contact") : "",
                lastAttempt && lastAttempt.tabRow ? lastAttempt.tabRow.replace(/\t/g, " ") : "",
            ]
                .map((value) => `"${(value || "").replace(/"/g, '""')}"`)
                .join(",");
        });

        const csvContent = [header.join(","), ...rows].join("\n");
        const encodedUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "event_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    contactYesButton.addEventListener("click", () => setContactSelection("yes"));
    contactNoButton.addEventListener("click", () => setContactSelection("no"));

    validationYesButton.addEventListener("click", () => {
        if (!activeCallState) {
            return;
        }
        const normalized = normalizeValidationType(activeCallState.defaultValidation);
        activeCallState.finalValidation = normalized;
        validationDisplay.textContent = normalized || "—";
        setValidationButtonState("yes");
        setValidationConfirmed(true);
        validationEditGroup.classList.add("hidden");
    });

    validationNoButton.addEventListener("click", () => {
        if (!activeCallState) {
            return;
        }
        setValidationButtonState("no");
        setValidationConfirmed(false);
        validationEditGroup.classList.remove("hidden");
        validationInput.value =
            activeCallState.finalValidation ||
            activeCallState.detectedValidation ||
            activeCallState.defaultValidation;
        validationInput.focus();
    });

    saveValidationButton.addEventListener("click", () => {
        if (!activeCallState) {
            return;
        }
        const updated = validationInput.value.trim();
        if (!updated) {
            validationInput.focus();
            return;
        }
        const normalized = normalizeValidationType(updated);
        activeCallState.finalValidation = normalized;
        validationDisplay.textContent = normalized || "—";
        setValidationButtonState("yes");
        validationEditGroup.classList.add("hidden");
        setValidationConfirmed(true);
    });

    cancelValidationEditButton.addEventListener("click", () => {
        validationEditGroup.classList.add("hidden");
        if (activeCallState) {
            activeCallState.finalValidation = activeCallState.defaultValidation;
            validationDisplay.textContent = activeCallState.defaultValidation || "—";
            setValidationButtonState(null);
            setValidationConfirmed(false);
        }
    });

    saveCallButton.addEventListener("click", handleSaveCall);

    cancelCallButton.addEventListener("click", closeCallModal);
    closeCallModalButton.addEventListener("click", closeCallModal);

    copyTabOutputButton.addEventListener("click", () => {
        const text = tabOutput.value;
        if (!text) {
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            flashButtonFeedback(copyTabOutputButton, "Copied!", 1500);
        });
    });

    if (copyEventTimeButton) {
        copyEventTimeButton.addEventListener("click", () => {
            if (!activeCallState || !activeCallState.eventTimeParts) {
                return;
            }
            const { hour = "", minute = "" } = activeCallState.eventTimeParts;
            if (!hour && !minute) {
                return;
            }
            navigator.clipboard
                .writeText(`${hour}\t${minute}`)
                .then(() => flashButtonFeedback(copyEventTimeButton, "Copied!"));
        });
    }

    if (copyCallTimeButton) {
        copyCallTimeButton.addEventListener("click", () => {
            if (
                !activeCallState ||
                !Array.isArray(activeCallState.callTimeParts) ||
                activeCallState.latestAttemptIndex == null
            ) {
                return;
            }

            const index = activeCallState.latestAttemptIndex;
            if (index < 0 || index >= activeCallState.callTimeParts.length) {
                return;
            }

            const parts = activeCallState.callTimeParts[index] || { hour: "", minute: "" };
            if (!parts.hour && !parts.minute) {
                return;
            }

            navigator.clipboard
                .writeText(`${parts.hour}\t${parts.minute}`)
                .then(() => flashButtonFeedback(copyCallTimeButton, "Copied!"));
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && callModal.classList.contains("show")) {
            closeCallModal();
        }
    });

    chrome.storage.local.get("eventLogs", (data) => {
        const loadedLogs = Array.isArray(data.eventLogs) ? data.eventLogs : [];
        logs = deduplicateLogs(loadedLogs);
        saveLogs();
        updateDisplays(logs);
    });
});
