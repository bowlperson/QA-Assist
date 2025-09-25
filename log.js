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
    const bookmarkModal = document.getElementById("bookmarkModal");
    const bookmarkCommentInput = document.getElementById("bookmarkComment");
    const bookmarkSaveButton = document.getElementById("bookmarkSave");
    const bookmarkRemoveButton = document.getElementById("bookmarkRemove");
    const bookmarkCancelButton = document.getElementById("bookmarkCancel");
    const closeBookmarkModalButton = document.getElementById("closeBookmarkModal");
    const confirmModal = document.getElementById("confirmModal");
    const confirmMessage = document.getElementById("confirmMessage");
    const confirmAcceptButton = document.getElementById("confirmAccept");
    const confirmCancelButton = document.getElementById("confirmCancel");
    const closeConfirmButton = document.getElementById("closeConfirmModal");
    const logToast = document.getElementById("logToast");

    const DEFAULT_VALIDATION_VOCABULARY = [
        { label: "Blocked", keywords: ["blocked"] },
        { label: "Critical", keywords: ["critical"] },
        { label: "Moderate", keywords: ["moderate"] },
        { label: "3 Low/hr", keywords: ["low"] },
        { label: "Cellphone", keywords: ["cell phone", "cellphone", "cell", "phone"] },
        { label: "False Positive", keywords: ["false", "non"] },
        { label: "Lost Connection", keywords: ["lost connection", "lost", "disconnect"] },
    ];

    let validationVocabulary = cloneDefaultVocabulary();
    let validationFilterEnabled = true;
    let validationMatchers = buildValidationMatchers(validationVocabulary);

    let logs = [];
    let activeCallState = null;
    let activeBookmarkId = null;
    let confirmAction = null;
    let toastTimeout = null;

    function cloneDefaultVocabulary() {
        return DEFAULT_VALIDATION_VOCABULARY.map((entry) => ({
            label: entry.label,
            keywords: Array.isArray(entry.keywords) ? [...entry.keywords] : [],
        }));
    }

    function sanitizeVocabularyInput(input) {
        if (!Array.isArray(input)) {
            return cloneDefaultVocabulary();
        }

        const seen = new Set();
        const sanitized = input
            .map((entry) => {
                const label = String(entry?.label || "").trim();
                if (!label) {
                    return null;
                }

                const lowerLabel = label.toLowerCase();
                if (seen.has(lowerLabel)) {
                    return null;
                }

                const keywordSource = Array.isArray(entry?.keywords)
                    ? entry.keywords
                    : typeof entry?.keywords === "string"
                        ? entry.keywords.split(",")
                        : [];

                const keywords = Array.from(
                    new Set(
                        keywordSource
                            .concat(label)
                            .map((keyword) => String(keyword || "").trim())
                            .filter(Boolean),
                    ),
                );

                seen.add(lowerLabel);
                return { label, keywords };
            })
            .filter(Boolean);

        return sanitized.length ? sanitized : cloneDefaultVocabulary();
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function buildValidationMatchers(list) {
        return list.map((entry) => {
            const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
            const normalizedKeywords = Array.from(
                new Set(keywords.concat(entry.label).map((keyword) => String(keyword || "").trim()).filter(Boolean)),
            );

            const regexes = normalizedKeywords
                .map((keyword) => {
                    if (!keyword) {
                        return null;
                    }
                    if (/^[\w\s]+$/.test(keyword)) {
                        return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
                    }
                    return null;
                })
                .filter(Boolean);

            const lowerKeywords = normalizedKeywords.map((keyword) => keyword.toLowerCase());

            return {
                label: entry.label,
                regexes,
                lowerKeywords,
            };
        });
    }

    function findValidationLabel(text) {
        const cleaned = String(text || "").trim();
        if (!cleaned) {
            return "";
        }

        const lower = cleaned.toLowerCase();

        for (const matcher of validationMatchers) {
            if (matcher.regexes.some((regex) => regex.test(cleaned))) {
                return matcher.label;
            }

            if (matcher.lowerKeywords.some((keyword) => keyword && lower.includes(keyword))) {
                return matcher.label;
            }
        }

        return "";
    }

    function applyValidationPreferences(rawList, filterEnabled) {
        validationVocabulary = sanitizeVocabularyInput(rawList);
        validationFilterEnabled = typeof filterEnabled === "boolean" ? filterEnabled : true;
        validationMatchers = buildValidationMatchers(validationVocabulary);
    }

    function refreshValidationPreferences(rawList, filterEnabled) {
        applyValidationPreferences(rawList, filterEnabled);
        if (logs.length) {
            logs = logs.map((entry) => ensureLogShape(entry)).filter(Boolean);
            updateDisplays(logs);
        }
    }

    function normalizeValidationType(value) {
        const text = String(value || "").trim();
        if (!text) {
            return "";
        }

        if (!validationFilterEnabled) {
            return text;
        }

        const matched = findValidationLabel(text);
        return matched || text;
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

    function showToast(message) {
        if (!logToast) {
            return;
        }

        logToast.textContent = message;
        logToast.classList.add("show");

        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toastTimeout = setTimeout(() => {
            logToast.classList.remove("show");
        }, 2200);
    }

    function setValidationButtonState(choice) {
        validationYesButton.classList.toggle("active", choice === "yes");
        validationNoButton.classList.toggle("active", choice === "no");
    }

    function getRawValidation(log) {
        if (!log) {
            return "";
        }

        const candidates = [
            log.validationTypeRaw,
            log.validationType,
            log.validationTypeDetected,
            log.detectedValidation,
            log.finalValidation,
        ];

        for (const candidate of candidates) {
            const text = (candidate || "").trim();
            if (text) {
                return text;
            }
        }

        return "";
    }

    function getLastCallHistoryValidation(log) {
        if (!log || !Array.isArray(log.callHistory) || !log.callHistory.length) {
            return "";
        }

        const lastAttempt = log.callHistory[log.callHistory.length - 1];
        return (lastAttempt?.validationType || "").trim();
    }

    function getCallValidation(log) {
        if (!log) {
            return "";
        }

        const stored = (log.callValidationType || "").trim();
        const historyValue = getLastCallHistoryValidation(log);
        const raw = getRawValidation(log);
        const base = stored || historyValue || raw;

        return normalizeValidationType(base || raw);
    }

    function closeBookmarkModal() {
        if (!bookmarkModal) {
            return;
        }

        bookmarkModal.classList.remove("show");
        activeBookmarkId = null;
        if (bookmarkCommentInput) {
            bookmarkCommentInput.value = "";
        }
    }

    function openBookmarkModal(log) {
        if (!bookmarkModal || !log) {
            return;
        }

        activeBookmarkId = log.id;
        bookmarkModal.classList.add("show");

        if (bookmarkCommentInput) {
            bookmarkCommentInput.value = log.comment || "";
            setTimeout(() => bookmarkCommentInput.focus(), 100);
        }

        if (bookmarkSaveButton) {
            bookmarkSaveButton.textContent = log.bookmarked ? "Save Changes" : "Add Bookmark";
        }

        if (bookmarkRemoveButton) {
            bookmarkRemoveButton.classList.toggle("hidden", !log.bookmarked);
        }
    }

    function closeConfirmModal() {
        if (!confirmModal) {
            return;
        }

        confirmModal.classList.remove("show");
        confirmAction = null;
    }

    function openConfirmModal(message, action) {
        if (!confirmModal) {
            if (typeof action === "function") {
                action();
            }
            return;
        }

        if (confirmMessage) {
            confirmMessage.textContent = message;
        }
        confirmModal.classList.add("show");
        confirmAction = typeof action === "function" ? action : null;
        if (confirmAcceptButton) {
            setTimeout(() => confirmAcceptButton.focus(), 100);
        }
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

        const eventId = String(log.eventId || "").trim();
        const eventType = String(log.eventType || "").trim();
        const timestamp = String(log.timestamp || "").trim();

        if (!eventId || !eventType || !timestamp) {
            return "";
        }

        return [eventId, eventType, timestamp]
            .map((part) => part.toLowerCase())
            .join("|");
    }

    function ensureLogShape(log) {
        if (!log) {
            return null;
        }

        const shaped = { ...log };

        shaped.callHistory = Array.isArray(shaped.callHistory) ? shaped.callHistory : [];
        shaped.eventKey = createEventKey(shaped);
        shaped.id = shaped.id || generateId();

        const rawCandidates = [
            shaped.validationTypeRaw,
            shaped.validationTypeDetected,
            shaped.detectedValidation,
            shaped.validationType,
        ];

        let rawValidation = "";
        for (const candidate of rawCandidates) {
            const text = (candidate || "").trim();
            if (text) {
                rawValidation = text;
                break;
            }
        }

        shaped.validationTypeRaw = rawValidation;
        shaped.validationTypeDetected = shaped.validationTypeDetected || rawValidation;
        shaped.detectedValidation = shaped.detectedValidation || rawValidation;
        shaped.validationType = rawValidation;

        const lastHistoryValue = shaped.callHistory.length
            ? (shaped.callHistory[shaped.callHistory.length - 1]?.validationType || "").trim()
            : "";
        const storedCallValue = (shaped.callValidationType || "").trim();
        const previousFinal = (shaped.finalValidation || "").trim();
        const callBase = storedCallValue || previousFinal || lastHistoryValue || rawValidation;
        const normalizedCall = normalizeValidationType(callBase || rawValidation);

        shaped.callValidationType = normalizedCall || callBase || rawValidation;
        shaped.finalValidation = shaped.callValidationType;

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

        button.addEventListener("click", () => openBookmarkModal(log));

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
        const eventId = log.eventId || "—";
        const eventType = log.eventType || "—";
        const eventIdDisplay = document.createElement("div");
        eventIdDisplay.className = "event-id-cell";
        eventIdDisplay.textContent = eventId;
        const eventTypeDisplay = document.createElement("div");
        eventTypeDisplay.className = "event-meta";
        eventTypeDisplay.textContent = eventType;
        eventCell.appendChild(eventIdDisplay);
        eventCell.appendChild(eventTypeDisplay);

        if (log.truckNumber) {
            const truckDisplay = document.createElement("div");
            truckDisplay.className = "event-meta";
            truckDisplay.textContent = `Truck ${log.truckNumber}`;
            eventCell.appendChild(truckDisplay);
        }

        const validationCell = document.createElement("td");
        validationCell.textContent = getRawValidation(log) || "—";

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp || "—";

        const siteCell = document.createElement("td");
        const siteNameDisplay = document.createElement("div");
        const siteName = (log.siteName || "").trim();
        siteNameDisplay.textContent = siteName || "—";
        siteCell.appendChild(siteNameDisplay);

        if (log.pageUrl) {
            const pageLink = document.createElement("a");
            pageLink.href = log.pageUrl;
            pageLink.target = "_blank";
            pageLink.rel = "noopener noreferrer";
            pageLink.textContent = log.pageUrl;
            pageLink.className = "event-meta-link";
            siteCell.appendChild(pageLink);
        }

        const commentCell = document.createElement("td");
        commentCell.textContent = log.comment || "";

        const actionsCell = document.createElement("td");
        actionsCell.appendChild(createBookmarkButton(log));
        actionsCell.appendChild(createCallButton(log));

        row.appendChild(eventCell);
        row.appendChild(validationCell);
        row.appendChild(timestampCell);
        row.appendChild(siteCell);
        row.appendChild(commentCell);
        row.appendChild(actionsCell);

        return row;
    }

    function renderLogRow(log) {
        const row = document.createElement("tr");

        const eventIdCell = document.createElement("td");
        const eventIdValue = document.createElement("div");
        eventIdValue.className = "event-id-cell";
        eventIdValue.textContent = log.eventId || "—";
        eventIdCell.appendChild(eventIdValue);

        const eventTypeDisplay = document.createElement("div");
        eventTypeDisplay.className = "event-meta";
        eventTypeDisplay.textContent = log.eventType || "—";
        eventIdCell.appendChild(eventTypeDisplay);

        const truckCell = document.createElement("td");
        truckCell.textContent = log.truckNumber || "—";

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp || "—";

        const siteCell = document.createElement("td");
        const siteNameDisplay = document.createElement("div");
        const siteName = (log.siteName || "").trim();
        siteNameDisplay.textContent = siteName || "—";
        siteCell.appendChild(siteNameDisplay);

        if (log.pageUrl) {
            const pageLink = document.createElement("a");
            pageLink.href = log.pageUrl;
            pageLink.target = "_blank";
            pageLink.rel = "noopener noreferrer";
            pageLink.textContent = log.pageUrl;
            pageLink.className = "event-meta-link";
            siteCell.appendChild(pageLink);
        }

        const validationCell = document.createElement("td");
        const validationText = getRawValidation(log);
        validationCell.textContent = validationText || "—";

        const actionsCell = document.createElement("td");
        actionsCell.style.display = "flex";
        actionsCell.style.gap = "8px";
        actionsCell.appendChild(createBookmarkButton(log));
        actionsCell.appendChild(createCallButton(log));

        row.appendChild(eventIdCell);
        row.appendChild(validationCell);
        row.appendChild(timestampCell);
        row.appendChild(siteCell);
        row.appendChild(truckCell);
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
                getRawValidation(log),
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
        const detectedValidation = getRawValidation(log);
        const defaultValidation = getCallValidation(log);

        activeCallState = {
            logId,
            attemptNumber,
            defaultValidation,
            finalValidation: defaultValidation || detectedValidation || "",
            validationConfirmed: false,
            contactSelection: null,
            monitorName: "",
            detectedValidation,
            siteValidation: detectedValidation,
            eventTimeParts: null,
            callTimeParts: null,
            latestAttemptIndex: null,
        };

        validationDisplay.textContent = defaultValidation || detectedValidation || "—";
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
            <strong>Validation Type</strong>
            <span>${defaultValidation || detectedValidation || "—"}</span>
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
        const baseValidation =
            (attemptRecord && attemptRecord.validationType) ||
            (activeCallState?.finalValidation && activeCallState.finalValidation.trim()) ||
            (activeCallState?.defaultValidation && activeCallState.defaultValidation.trim()) ||
            getCallValidation(log);

        const rawFallback = getRawValidation(log);
        const validationType =
            normalizeValidationType(baseValidation || rawFallback) ||
            baseValidation ||
            rawFallback ||
            "";

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

        const fallbackValidation =
            (activeCallState.finalValidation && activeCallState.finalValidation.trim()) ||
            (activeCallState.defaultValidation && activeCallState.defaultValidation.trim()) ||
            getCallValidation(log) ||
            getRawValidation(log);
        const normalizedFinalValidation = normalizeValidationType(fallbackValidation);
        const finalValidationValue = normalizedFinalValidation || fallbackValidation || "";

        activeCallState.finalValidation = finalValidationValue;
        log.callValidationType = finalValidationValue;

        const siteValidation = activeCallState.siteValidation || getRawValidation(log);
        if (!log.validationTypeRaw) {
            log.validationTypeRaw = siteValidation || finalValidationValue;
        }
        if (!log.validationTypeDetected) {
            log.validationTypeDetected = log.validationTypeRaw;
        }
        if (!log.detectedValidation) {
            log.detectedValidation = log.validationTypeRaw;
        }
        log.validationType = log.validationTypeRaw;
        log.monitorName = monitorName;
        log.callHistory = Array.isArray(log.callHistory) ? log.callHistory : [];

        const attemptRecord = {
            attempt: activeCallState.attemptNumber,
            timestamp,
            contactMade,
            receptor: contactMade ? "Dispatch" : "",
            validationType: finalValidationValue,
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

        openConfirmModal("Clear all saved events?", () => {
            logs = [];
            saveLogs();
            updateDisplays(logs);
            showToast("Event log cleared");
        });
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
                    getRawValidation(log),
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
        const baseValue = activeCallState.defaultValidation || activeCallState.siteValidation || "";
        const normalized = normalizeValidationType(baseValue);
        activeCallState.finalValidation = normalized || baseValue || "";
        validationDisplay.textContent = activeCallState.finalValidation || "—";
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
            activeCallState.defaultValidation ||
            activeCallState.detectedValidation ||
            "";
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
        const normalized = normalizeValidationType(updated) || updated;
        activeCallState.finalValidation = normalized;
        validationDisplay.textContent = normalized || "—";
        setValidationButtonState("yes");
        validationEditGroup.classList.add("hidden");
        setValidationConfirmed(true);
    });

    cancelValidationEditButton.addEventListener("click", () => {
        validationEditGroup.classList.add("hidden");
        if (activeCallState) {
            const resetValue = activeCallState.defaultValidation || activeCallState.siteValidation || "";
            activeCallState.finalValidation = normalizeValidationType(resetValue) || resetValue || "";
            validationDisplay.textContent = activeCallState.finalValidation || "—";
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

    if (bookmarkSaveButton) {
        bookmarkSaveButton.addEventListener("click", () => {
            if (!activeBookmarkId) {
                closeBookmarkModal();
                return;
            }

            const log = getLogById(activeBookmarkId);
            if (!log) {
                closeBookmarkModal();
                return;
            }

            const comment = bookmarkCommentInput ? bookmarkCommentInput.value.trim() : "";
            const wasBookmarked = log.bookmarked;
            log.bookmarked = true;
            log.comment = comment;
            saveLogs();
            updateDisplays(logs);
            showToast(wasBookmarked ? "Bookmark updated" : "Bookmark added");
            closeBookmarkModal();
        });
    }

    if (bookmarkRemoveButton) {
        bookmarkRemoveButton.addEventListener("click", () => {
            if (!activeBookmarkId) {
                closeBookmarkModal();
                return;
            }

            const log = getLogById(activeBookmarkId);
            if (!log) {
                closeBookmarkModal();
                return;
            }

            openConfirmModal("Remove this bookmark?", () => {
                log.bookmarked = false;
                log.comment = "";
                saveLogs();
                updateDisplays(logs);
                showToast("Bookmark removed");
                closeBookmarkModal();
            });
        });
    }

    if (bookmarkCancelButton) {
        bookmarkCancelButton.addEventListener("click", () => {
            closeBookmarkModal();
        });
    }

    if (closeBookmarkModalButton) {
        closeBookmarkModalButton.addEventListener("click", () => {
            closeBookmarkModal();
        });
    }

    if (bookmarkModal) {
        bookmarkModal.addEventListener("click", (event) => {
            if (event.target === bookmarkModal) {
                closeBookmarkModal();
            }
        });
    }

    if (confirmAcceptButton) {
        confirmAcceptButton.addEventListener("click", () => {
            const action = confirmAction;
            closeConfirmModal();
            if (typeof action === "function") {
                action();
            }
        });
    }

    if (confirmCancelButton) {
        confirmCancelButton.addEventListener("click", () => {
            closeConfirmModal();
        });
    }

    if (closeConfirmButton) {
        closeConfirmButton.addEventListener("click", () => {
            closeConfirmModal();
        });
    }

    if (confirmModal) {
        confirmModal.addEventListener("click", (event) => {
            if (event.target === confirmModal) {
                closeConfirmModal();
            }
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        if (bookmarkModal && bookmarkModal.classList.contains("show")) {
            closeBookmarkModal();
            return;
        }

        if (confirmModal && confirmModal.classList.contains("show")) {
            closeConfirmModal();
            return;
        }

        if (callModal.classList.contains("show")) {
            closeCallModal();
        }
    });

    chrome.storage.sync.get(
        { validationVocabulary: DEFAULT_VALIDATION_VOCABULARY, validationFilterEnabled: true },
        (data) => {
            refreshValidationPreferences(data.validationVocabulary, data.validationFilterEnabled);
        },
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
            return;
        }

        const vocabChange = changes.validationVocabulary;
        const filterChange = changes.validationFilterEnabled;

        if (vocabChange || filterChange) {
            refreshValidationPreferences(
                vocabChange ? vocabChange.newValue : validationVocabulary,
                filterChange ? filterChange.newValue : validationFilterEnabled,
            );
        }
    });

    chrome.storage.local.get("eventLogs", (data) => {
        const loadedLogs = Array.isArray(data.eventLogs) ? data.eventLogs : [];
        logs = deduplicateLogs(loadedLogs);
        saveLogs();
        updateDisplays(logs);
        refreshValidationPreferences(validationVocabulary, validationFilterEnabled);
    });
});
