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
    const copyCallTimesButton = document.getElementById("copyCallTimes");
    const eventTimeSummary = document.getElementById("eventTimeSummary");
    const callTimeSummary = document.getElementById("callTimeSummary");

    let logs = [];
    let activeCallState = null;
    let lastTabSegments = null;

    if (copyTabOutputButton) {
        copyTabOutputButton.dataset.defaultLabel = copyTabOutputButton.textContent;
    }
    if (copyEventTimeButton) {
        copyEventTimeButton.dataset.defaultLabel = copyEventTimeButton.textContent;
    }
    if (copyCallTimesButton) {
        copyCallTimesButton.dataset.defaultLabel = copyCallTimesButton.textContent;
    }

    updateTimeSummaries(null);

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
        shaped.detectedValidation = (shaped.detectedValidation || shaped.validationType || "").trim();
        if (shaped.validationType) {
            shaped.validationType = normalizeValidationType(shaped.validationType);
        }

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

    function normalizeValidationType(value) {
        const text = (value || "").trim();
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
        if (/\blow\b/.test(lower)) {
            return "3Low/hr";
        }
        if (lower.includes("cellphone") || lower.includes("cell phone") || lower.includes("cell-phone")) {
            return "Cellphone";
        }
        if (lower.includes("lost") && lower.includes("connection")) {
            return "Lost Connection";
        }
        if (/(?:^|\b)(?:false|non)/.test(lower)) {
            return "False Positive";
        }

        return text;
    }

    function parseHourMinuteParts(value) {
        if (value instanceof Date) {
            return {
                hour: String(value.getHours()),
                minute: String(value.getMinutes()),
            };
        }

        if (typeof value === "number") {
            const dateFromNumber = new Date(value);
            if (!Number.isNaN(dateFromNumber.getTime())) {
                return {
                    hour: String(dateFromNumber.getHours()),
                    minute: String(dateFromNumber.getMinutes()),
                };
            }
        }

        if (typeof value === "string" && value.trim()) {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                const parsedDate = new Date(parsed);
                return {
                    hour: String(parsedDate.getHours()),
                    minute: String(parsedDate.getMinutes()),
                };
            }

            const match = value.match(/(\d{1,2}):(\d{2})/);
            if (match) {
                return {
                    hour: String(Number(match[1])),
                    minute: String(Number(match[2])),
                };
            }
        }

        return { hour: "", minute: "" };
    }

    function describeTimeSegment(segment) {
        if (!segment || (segment.hour === "" && segment.minute === "")) {
            return "—";
        }

        const parts = [];
        if (segment.hour !== "") {
            parts.push(`${segment.hour} hr`);
        }
        if (segment.minute !== "") {
            parts.push(`${segment.minute} min`);
        }

        return parts.length ? parts.join(" ") : "—";
    }

    function formatCallTimesSummary(callSegments = []) {
        const labels = ["1st", "2nd", "3rd"];
        return labels
            .map((label, index) => {
                const segment = callSegments[index] || { hour: "", minute: "" };
                const description = describeTimeSegment(segment);
                return `${label}: ${description}`;
            })
            .join(" · ");
    }

    function updateTimeSummaries(segments) {
        if (!eventTimeSummary || !callTimeSummary) {
            return;
        }

        if (!segments) {
            eventTimeSummary.textContent = "—";
            callTimeSummary.textContent = "—";
            return;
        }

        eventTimeSummary.textContent = describeTimeSegment(segments.eventTime || { hour: "", minute: "" });
        callTimeSummary.textContent = formatCallTimesSummary(segments.callTimes || []);
    }

    function copyTextWithFeedback(button, text, defaultLabel) {
        if (!button) {
            return;
        }

        const fallbackLabel = defaultLabel || button.dataset.defaultLabel || button.textContent || "Copy";
        button.dataset.defaultLabel = fallbackLabel;

        if (!navigator.clipboard) {
            return;
        }

        navigator.clipboard
            .writeText(text)
            .then(() => {
                button.textContent = "Copied!";
                button.disabled = true;
                setTimeout(() => {
                    button.textContent = button.dataset.defaultLabel || fallbackLabel;
                    button.disabled = false;
                }, 1500);
            })
            .catch(() => {
                button.textContent = "Copy failed";
                setTimeout(() => {
                    button.textContent = button.dataset.defaultLabel || fallbackLabel;
                    button.disabled = false;
                }, 1500);
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
                log.validationType,
                log.detectedValidation,
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
        callSummaryLeft.innerHTML = "";
        callSummaryRight.innerHTML = "";
        validationDisplay.textContent = "—";
        validationDisplay.removeAttribute("title");
        lastTabSegments = null;
        updateTimeSummaries(null);
        saveCallButton.disabled = false;

        if (copyTabOutputButton) {
            copyTabOutputButton.textContent = copyTabOutputButton.dataset.defaultLabel || "Copy Full Row";
            copyTabOutputButton.disabled = false;
        }
        if (copyEventTimeButton) {
            copyEventTimeButton.textContent = copyEventTimeButton.dataset.defaultLabel || "Only Copy Event Time";
            copyEventTimeButton.disabled = false;
        }
        if (copyCallTimesButton) {
            copyCallTimesButton.textContent = copyCallTimesButton.dataset.defaultLabel || "Only Copy Call Time";
            copyCallTimesButton.disabled = false;
        }
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
        const detectedValidation = (log.detectedValidation || "").trim();
        const storedValidation = (log.validationType || "").trim();
        const baseValidation = storedValidation || detectedValidation || (log.eventType || "").trim();
        const normalizedDefault = normalizeValidationType(baseValidation);
        const defaultValidation = normalizedDefault || baseValidation;

        activeCallState = {
            logId,
            attemptNumber,
            defaultValidation,
            finalValidation: defaultValidation,
            validationConfirmed: false,
            contactSelection: null,
            monitorName: "",
            detectedValidation,
        };

        validationDisplay.textContent = defaultValidation || "—";
        validationDisplay.className = "tag";
        if (detectedValidation && detectedValidation !== defaultValidation) {
            validationDisplay.title = `Detected: ${detectedValidation}`;
        } else {
            validationDisplay.removeAttribute("title");
        }

        callSummaryLeft.innerHTML = `
            <strong>Event Type</strong>
            <span>${log.eventType || "—"}</span>
            <strong>Detected Validation</strong>
            <span>${detectedValidation || "—"}</span>
            <strong>Truck</strong>
            <span>${log.truckNumber || "—"}</span>
        `;

        callSummaryRight.innerHTML = `
            <strong>Timestamp</strong>
            <span>${log.timestamp || "—"}</span>
            <strong>Site</strong>
            <span>${(log.siteName || "—").trim()}</span>
            <strong>Attempts Logged</strong>
            <span>${attempts}</span>
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

        const eventTimeSources = [log.timestamp, log.createdAt, log.createdOn];
        let eventTimeParts = { hour: "", minute: "" };
        for (const source of eventTimeSources) {
            const parts = parseHourMinuteParts(source);
            if (parts.hour !== "" || parts.minute !== "") {
                eventTimeParts = parts;
                break;
            }
        }

        const attempts = Array.isArray(log.callHistory) ? log.callHistory : [];
        const attemptEntries = [attempts[0], attempts[1], attempts[2]];
        const callSegments = attemptEntries.map((entry) =>
            entry ? parseHourMinuteParts(entry.timestamp) : { hour: "", minute: "" },
        );

        while (callSegments.length < 3) {
            callSegments.push({ hour: "", minute: "" });
        }

        const contactMade = attemptRecord ? attemptRecord.contactMade : false;
        const receptor = contactMade ? "Dispatch" : "";
        const normalizedValidation = normalizeValidationType(
            log.validationType || log.detectedValidation || log.eventType || "",
        );
        const trimmedMonitor = (monitorName || "").trim();

        const rowValues = [
            dateStr,
            eventTimeParts.hour,
            eventTimeParts.minute,
            callSegments[0].hour,
            callSegments[0].minute,
            callSegments[1].hour,
            callSegments[1].minute,
            callSegments[2].hour,
            callSegments[2].minute,
            (log.siteName || "").trim(),
            log.truckNumber || "",
            normalizedValidation,
            trimmedMonitor,
            contactMade ? "Yes" : "No",
            receptor,
        ];

        return {
            rowString: rowValues.join("\t"),
            rowValues,
            segments: {
                eventTime: eventTimeParts,
                callTimes: callSegments,
            },
        };
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

        const finalValidationSource =
            activeCallState.finalValidation ||
            log.validationType ||
            log.detectedValidation ||
            log.eventType ||
            "";
        const normalizedFinal = normalizeValidationType(finalValidationSource);

        log.validationType = normalizedFinal;
        activeCallState.finalValidation = normalizedFinal;
        log.monitorName = monitorName;
        log.callHistory = Array.isArray(log.callHistory) ? log.callHistory : [];

        const attemptRecord = {
            attempt: activeCallState.attemptNumber,
            timestamp,
            contactMade,
            receptor: contactMade ? "Dispatch" : "",
        };

        log.callHistory.push(attemptRecord);

        const tabData = generateTabDelimitedRow(log, attemptRecord, monitorName);
        attemptRecord.tabRow = tabData.rowString;
        attemptRecord.tabSegments = tabData.segments;
        lastTabSegments = tabData.segments;

        chrome.storage.sync.set({ monitorName });
        saveLogs();
        updateDisplays(logs);

        validationDisplay.textContent = normalizedFinal || "—";
        if (activeCallState.detectedValidation && activeCallState.detectedValidation !== normalizedFinal) {
            validationDisplay.title = `Detected: ${activeCallState.detectedValidation}`;
        } else {
            validationDisplay.removeAttribute("title");
        }

        tabOutput.value = tabData.rowString;
        updateTimeSummaries(lastTabSegments);
        callResultBox.classList.remove("hidden");
        saveCallButton.disabled = true;
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
        if (activeCallState.detectedValidation && activeCallState.detectedValidation !== normalized) {
            validationDisplay.title = `Detected: ${activeCallState.detectedValidation}`;
        } else {
            validationDisplay.removeAttribute("title");
        }
        setValidationConfirmed(true);
        validationEditGroup.classList.add("hidden");
    });

    validationNoButton.addEventListener("click", () => {
        if (!activeCallState) {
            return;
        }
        validationEditGroup.classList.remove("hidden");
        validationInput.value = activeCallState.finalValidation || activeCallState.defaultValidation;
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
        if (activeCallState.detectedValidation && activeCallState.detectedValidation !== normalized) {
            validationDisplay.title = `Detected: ${activeCallState.detectedValidation}`;
        } else {
            validationDisplay.removeAttribute("title");
        }
        validationEditGroup.classList.add("hidden");
        setValidationConfirmed(true);
    });

    cancelValidationEditButton.addEventListener("click", () => {
        validationEditGroup.classList.add("hidden");
        if (activeCallState) {
            activeCallState.finalValidation = activeCallState.defaultValidation;
        }
    });

    saveCallButton.addEventListener("click", handleSaveCall);

    cancelCallButton.addEventListener("click", closeCallModal);
    closeCallModalButton.addEventListener("click", closeCallModal);

    copyTabOutputButton.addEventListener("click", () => {
        const text = tabOutput.value;
        if (typeof text !== "string") {
            return;
        }
        copyTextWithFeedback(copyTabOutputButton, text, copyTabOutputButton.dataset.defaultLabel);
    });

    copyEventTimeButton.addEventListener("click", () => {
        if (!lastTabSegments) {
            return;
        }
        const eventTime = lastTabSegments.eventTime || { hour: "", minute: "" };
        const values = [eventTime.hour || "", eventTime.minute || ""];
        copyTextWithFeedback(copyEventTimeButton, values.join("\t"), copyEventTimeButton.dataset.defaultLabel);
    });

    copyCallTimesButton.addEventListener("click", () => {
        if (!lastTabSegments) {
            return;
        }
        const callSegments = Array.isArray(lastTabSegments.callTimes) ? lastTabSegments.callTimes : [];
        const values = [];
        for (let index = 0; index < 3; index += 1) {
            const segment = callSegments[index] || { hour: "", minute: "" };
            values.push(segment.hour || "");
            values.push(segment.minute || "");
        }
        copyTextWithFeedback(copyCallTimesButton, values.join("\t"), copyCallTimesButton.dataset.defaultLabel);
    });

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
