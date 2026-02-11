const FATIGUE_WINDOW_ONE_HOUR = 60 * 60 * 1000;
const FATIGUE_WINDOW_TWO_HOURS = 2 * 60 * 60 * 1000;
const EVENT_FLUCTUATION_WINDOW = 60 * 1000;
const EVENT_FLUCTUATION_MIN_EVENTS = 3;
const SPOTLIGHT_WINDOW = 60 * 60 * 1000;

const EVENT_TYPE_SPOTLIGHTS = ["searching face", "blocked"];
const VALIDATION_SPOTLIGHTS = [
    "blocked",
    "detection error",
    "searching face",
    "face",
    "no video",
    "non event",
    "false positive",
    "unsafe",
    "unsafe distraction",
];

let siteStatsContainer = null;
let siteStatsSummary = null;
let watchListOneHour = null;
let watchListTwoHour = null;
let eventHotFive = null;
let eventHotThree = null;
let validationHotFive = null;
let validationHotThree = null;
let fluctuationContainer = null;
let fluctuationExportButton = null;
let refreshButton = null;
let currentFluctuationClusters = [];
let controlToastElement = null;
let controlToastTimeoutId = null;

document.addEventListener("DOMContentLoaded", () => {
    siteStatsContainer = document.getElementById("siteStatsContainer");
    siteStatsSummary = document.getElementById("siteStatsSummary");
    watchListOneHour = document.getElementById("watchListOneHour");
    watchListTwoHour = document.getElementById("watchListTwoHour");
    eventHotFive = document.getElementById("eventHotFive");
    eventHotThree = document.getElementById("eventHotThree");
    validationHotFive = document.getElementById("validationHotFive");
    validationHotThree = document.getElementById("validationHotThree");
    fluctuationContainer = document.getElementById("fluctuationContainer");
    fluctuationExportButton = document.getElementById("fluctuationExport");
    refreshButton = document.getElementById("controlRefresh");
    controlToastElement = document.getElementById("controlToast");

    setupCardCollapses();

    if (fluctuationExportButton) {
        fluctuationExportButton.addEventListener("click", () => {
            exportFluctuationsCsv(currentFluctuationClusters);
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            loadControlData({ announce: true, showLoading: true });
        });
    }

    loadControlData();
});

function loadControlData(options = {}) {
    const { announce = false, showLoading = false } = options;

    if (showLoading && refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("spinning");
    }

    EventLogDB.getAll().then((rawLogs) => {
        const logs = deduplicateForAnalytics(rawLogs
            .map((log) => normalizeLog(log))
            .filter(Boolean))
            .sort((a, b) => {
                const timeA = getEventTime(a);
                const timeB = getEventTime(b);
                if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
                    return timeA - timeB;
                }
                if (Number.isFinite(timeA)) {
                    return -1;
                }
                if (Number.isFinite(timeB)) {
                    return 1;
                }
                const createdA = Number.isFinite(a.createdAt) ? a.createdAt : 0;
                const createdB = Number.isFinite(b.createdAt) ? b.createdAt : 0;
                return createdA - createdB;
            });

        renderSiteStats(logs, siteStatsContainer, siteStatsSummary);
        const watchLists = buildFatigueWatchLists(logs);
        renderWatchList(watchListOneHour, watchLists.withinOneHour, {
            emptyMessage: "No trucks have three fatigue events within one hour.",
        });
        renderWatchList(watchListTwoHour, watchLists.withinTwoHours, {
            emptyMessage: "No trucks have three fatigue events within two hours.",
        });

        const spotlights = buildSpotlights(logs);
        renderSpotlightList(eventHotFive, spotlights.eventTypes.top, {
            emptyMessage: "No trucks reached five hotspot events within an hour window.",
            tone: "event",
        });
        renderSpotlightList(eventHotThree, spotlights.eventTypes.mid, {
            emptyMessage: "No trucks reached three hotspot events within an hour window.",
            tone: "event",
        });
        renderSpotlightList(validationHotFive, spotlights.validationTypes.top, {
            emptyMessage: "No trucks reached five hotspot validations within an hour window.",
            tone: "validation",
        });
        renderSpotlightList(validationHotThree, spotlights.validationTypes.mid, {
            emptyMessage: "No trucks reached three hotspot validations within an hour window.",
            tone: "validation",
        });

        currentFluctuationClusters = renderFluctuations(logs, fluctuationContainer);
        updateFluctuationExportButton(fluctuationExportButton, currentFluctuationClusters);

        if (announce) {
            showControlToast("Control center refreshed");
        }

        if (showLoading && refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("spinning");
        }

    }).catch((error) => {
        if (showLoading && refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("spinning");
        }
        console.warn("Failed to load control data", error);
        if (announce) {
            showControlToast("Unable to refresh control center");
        }
    });
}

function setupCardCollapses() {
    const toggles = document.querySelectorAll(".page-card .collapse-toggle");
    toggles.forEach((toggle) => {
        const card = toggle.closest(".page-card");
        if (!card) {
            return;
        }
        const collapsed = card.classList.contains("collapsed");
        updateCollapseToggle(toggle, collapsed);
        toggle.addEventListener("click", () => {
            const nextState = card.classList.toggle("collapsed");
            updateCollapseToggle(toggle, nextState);
        });
    });
}

function updateCollapseToggle(button, collapsed) {
    button.textContent = collapsed ? "+" : "−";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");
}

function normalizeLog(log) {
    if (!log) {
        return null;
    }

    const normalized = { ...log };

    normalized.eventType = safeText(log.eventType);
    normalized.validationType = deriveValidation(log);
    normalized.callValidationType = safeText(log.callValidationType) || normalized.validationType;
    normalized.operatorName = "";
    normalized.truckNumber = safeText(log.truckNumber);
    normalized.siteName = safeText(log.siteName);
    normalized.siteMatchValue = safeText(log.siteMatchValue);
    normalized.pageUrl = safeText(log.pageUrl);
    normalized.eventId = safeText(log.eventId);
    normalized.timestampText = safeText(log.timestamp);
    const createdAtMs = log.createdAt ? Date.parse(log.createdAt) : NaN;
    normalized.createdAt = Number.isFinite(createdAtMs) ? createdAtMs : NaN;

    let timestampMs = parseTimestamp(log);
    if (!Number.isFinite(timestampMs) && Number.isFinite(normalized.createdAt)) {
        timestampMs = normalized.createdAt;
    }
    normalized.timestampMs = Number.isFinite(timestampMs) ? timestampMs : NaN;

    return normalized;
}

function deduplicateForAnalytics(logs) {
    const deduped = new Map();

    let fallbackIndex = 0;
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const key = EventLogDB.buildDuplicateKey(log);
        if (!key) {
            deduped.set(`${safeText(log.id)}|${safeText(log.createdAt)}|${fallbackIndex}`, log);
            fallbackIndex += 1;
            return;
        }

        deduped.set(key, log);
    });

    return Array.from(deduped.values());
}

function safeText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function deriveValidation(log) {
    const candidates = [
        log.callValidationType,
        log.finalValidation,
        log.validationType,
        log.validationTypeRaw,
        log.validationTypeDetected,
        log.detectedValidation,
    ];

    for (const candidate of candidates) {
        const text = safeText(candidate);
        if (text) {
            return text;
        }
    }

    return "";
}

function parseTimestamp(log) {
    const candidates = [log.timestamp, log.eventTimestamp, log.eventTime, log.createdAt];
    for (const candidate of candidates) {
        const text = safeText(candidate);
        if (!text) {
            continue;
        }
        const parsed = Date.parse(text);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        const fallback = parseLocalDateTime(text);
        if (Number.isFinite(fallback)) {
            return fallback;
        }
    }
    return NaN;
}

function parseLocalDateTime(text) {
    const sanitized = safeText(text).replace(/,/g, " ").trim();
    if (!sanitized) {
        return NaN;
    }

    const normalized = sanitized.replace(/\s+/g, " ");
    const patterns = [
        /^(?<month>\d{1,2})[\/\-](?<day>\d{1,2})[\/\-](?<year>\d{2,4})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?\s*(?<meridiem>AM|PM)?)?$/i,
        /^(?<year>\d{4})[\/\-](?<month>\d{1,2})[\/\-](?<day>\d{1,2})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?\s*(?<meridiem>AM|PM)?)?$/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) {
            continue;
        }

        const groups = match.groups || {};
        const monthNumber = Number(groups.month) - 1;
        const dayNumber = Number(groups.day);
        let yearNumber = Number(groups.year);

        if (groups.year && groups.year.length === 2) {
            yearNumber += yearNumber >= 70 ? 1900 : 2000;
        }

        if (
            Number.isNaN(monthNumber) ||
            Number.isNaN(dayNumber) ||
            Number.isNaN(yearNumber)
        ) {
            continue;
        }

        let hourNumber = groups.hour ? Number(groups.hour) : 0;
        const minuteNumber = groups.minute ? Number(groups.minute) : 0;
        const secondNumber = groups.second ? Number(groups.second) : 0;

        if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber) || Number.isNaN(secondNumber)) {
            continue;
        }

        if (groups.meridiem) {
            const meridiem = groups.meridiem.toUpperCase();
            if (meridiem === "PM" && hourNumber < 12) {
                hourNumber += 12;
            } else if (meridiem === "AM" && hourNumber === 12) {
                hourNumber = 0;
            }
        }

        const parsed = new Date(yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber, 0);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getTime();
        }
    }

    return NaN;
}

function renderSiteStats(logs, container, summaryBadge) {
    const siteMap = new Map();

    logs.forEach((log) => {
        const host = getHost(log.pageUrl);
        const siteKey = log.siteName || host || "Unknown site";
        if (!siteMap.has(siteKey)) {
            siteMap.set(siteKey, {
                name: siteKey,
                host,
                matchValue: log.siteMatchValue,
                total: 0,
                eventTypes: new Map(),
                validations: new Map(),
            });
        }
        const entry = siteMap.get(siteKey);
        entry.total += 1;
        if (log.eventType) {
            entry.eventTypes.set(log.eventType, (entry.eventTypes.get(log.eventType) || 0) + 1);
        }
        const validation = log.callValidationType || log.validationType;
        if (validation) {
            entry.validations.set(validation, (entry.validations.get(validation) || 0) + 1);
        }
    });

    const entries = Array.from(siteMap.values()).sort((a, b) => b.total - a.total);
    summaryBadge.textContent = `${entries.length} site${entries.length === 1 ? "" : "s"}`;

    container.innerHTML = "";
    if (!entries.length) {
        container.innerHTML = '<p class="empty-state">No events logged yet.</p>';
        return;
    }

    entries.forEach((entry) => {
        const card = document.createElement("article");
        card.className = "stat-card";

        const header = document.createElement("header");
        header.className = "stat-card-header";
        const title = document.createElement("h4");
        title.textContent = entry.name;
        const badge = document.createElement("span");
        badge.className = "badge subtle";
        badge.textContent = `${entry.total} event${entry.total === 1 ? "" : "s"}`;
        header.appendChild(title);
        header.appendChild(badge);

        const meta = document.createElement("p");
        meta.className = "stat-meta";
        if (entry.host) {
            meta.textContent = entry.host;
        } else if (entry.matchValue) {
            meta.textContent = entry.matchValue;
        } else {
            meta.textContent = "No site URL recorded";
        }

        const body = document.createElement("div");
        body.className = "stat-card-body";

        body.appendChild(buildCountList(entry.eventTypes, "Event types", { tone: "event" }));
        body.appendChild(buildCountList(entry.validations, "Validation types", { tone: "validation" }));

        card.appendChild(header);
        card.appendChild(meta);
        card.appendChild(body);

        container.appendChild(card);
    });
}

function buildCountList(map, label, { tone } = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "stat-block";

    const heading = document.createElement("h5");
    heading.textContent = label;
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "stat-list";
    const entries = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (!entries.length) {
        const item = document.createElement("li");
        item.textContent = "—";
        list.appendChild(item);
    } else {
        entries.forEach(([key, count]) => {
            const item = document.createElement("li");
            const labelSpan = document.createElement("span");
            const countSpan = document.createElement("span");
            countSpan.className = "count";
            countSpan.textContent = count;

            if (tone === "event") {
                decorateLabel(labelSpan, key, "event");
            } else if (tone === "validation") {
                decorateLabel(labelSpan, key, "validation");
            } else {
                labelSpan.textContent = key;
            }

            item.appendChild(labelSpan);
            item.appendChild(countSpan);
            list.appendChild(item);
        });
    }

    wrapper.appendChild(list);
    return wrapper;
}

function buildFatigueWatchLists(logs) {
    const groups = new Map();

    logs.forEach((log) => {
        if (!isFatigueValidation(log.callValidationType || log.validationType)) {
            return;
        }
        const identity = buildIdentity(log);
        if (!groups.has(identity.key)) {
            groups.set(identity.key, { ...identity, events: [] });
        }
        groups.get(identity.key).events.push(log);
    });

    const withinOneHour = [];
    const withinTwoHours = [];

    groups.forEach((entry) => {
        entry.events.sort((a, b) => getEventTime(a) - getEventTime(b));
        const timeline = entry.events.filter((event) => Number.isFinite(getEventTime(event)));
        const oneHourWindow = findWindow(timeline, FATIGUE_WINDOW_ONE_HOUR);
        if (oneHourWindow) {
            const windowEvents = timeline.slice(oneHourWindow.startIndex, oneHourWindow.endIndex + 1);
            withinOneHour.push({ ...entry, events: windowEvents, window: oneHourWindow });
            return;
        }
        const twoHourWindow = findWindow(timeline, FATIGUE_WINDOW_TWO_HOURS);
        if (twoHourWindow) {
            const windowEvents = timeline.slice(twoHourWindow.startIndex, twoHourWindow.endIndex + 1);
            withinTwoHours.push({ ...entry, events: windowEvents, window: twoHourWindow });
        }
    });

    return { withinOneHour, withinTwoHours };
}

function buildIdentity(log) {
    const truck = safeText(log.truckNumber) || "Unknown truck";
    const site = safeText(log.siteName) || getHost(log.pageUrl) || "Unknown site";
    return {
        key: `${truck.toLowerCase()}|${site.toLowerCase()}`,
        truck,
        site,
    };
}

function findWindow(events, windowSize) {
    if (!events.length) {
        return null;
    }
    let start = 0;
    for (let end = 0; end < events.length; end += 1) {
        const endTime = getEventTime(events[end]);
        if (!Number.isFinite(endTime)) {
            continue;
        }
        while (start < end && endTime - getEventTime(events[start]) > windowSize) {
            start += 1;
        }
        if (end - start + 1 >= 3) {
            return {
                startIndex: start,
                endIndex: end,
                startTime: getEventTime(events[start]),
                endTime,
                count: end - start + 1,
            };
        }
    }
    return null;
}

function renderWatchList(container, entries, { emptyMessage }) {
    container.innerHTML = "";
    if (!entries.length) {
        container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }

    entries
        .sort((a, b) => b.window.endTime - a.window.endTime)
        .forEach((entry) => {
            const details = document.createElement("details");
            details.className = "watch-entry";

            const summary = document.createElement("summary");
            const totalEvents = entry.window?.count || entry.events.length;
            let windowText = "Unknown window";
            if (entry.events.length) {
                const firstEvent = entry.events[0];
                const lastEvent = entry.events[entry.events.length - 1];
                windowText = `${getEventDisplayTime(firstEvent)} – ${getEventDisplayTime(lastEvent)}`;
            } else if (entry.window) {
                windowText = formatRange(entry.window.startTime, entry.window.endTime);
            }
            summary.innerHTML = `
                <div class="watch-summary">
                    <div>
                        <span class="watch-name">${entry.truck}</span>
                    </div>
                    <div class="watch-meta">${entry.site}</div>
                </div>
                <div class="watch-window">${windowText} · ${totalEvents} event${totalEvents === 1 ? "" : "s"}</div>
            `;
            details.appendChild(summary);

            const filterRow = document.createElement("div");
            filterRow.className = "watch-filters";

            const validationSelect = document.createElement("select");
            const validationOptions = [""].concat(
                Array.from(new Set(entry.events.map((event) => event.callValidationType || event.validationType).filter(Boolean))).sort(),
            );
            validationOptions.forEach((value) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value || "All validations";
                validationSelect.appendChild(option);
            });

            const eventSelect = document.createElement("select");
            const eventOptions = [""].concat(
                Array.from(new Set(entry.events.map((event) => event.eventType).filter(Boolean))).sort(),
            );
            eventOptions.forEach((value) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value || "All event types";
                eventSelect.appendChild(option);
            });

            filterRow.appendChild(validationSelect);
            filterRow.appendChild(eventSelect);
            details.appendChild(filterRow);

            const list = document.createElement("ul");
            list.className = "watch-events";
            details.appendChild(list);

            const render = () => {
                const validationFilter = validationSelect.value;
                const eventFilter = eventSelect.value;
                list.innerHTML = "";
                entry.events
                    .filter((event) => {
                        if (validationFilter && (event.callValidationType || event.validationType) !== validationFilter) {
                            return false;
                        }
                        if (eventFilter && event.eventType !== eventFilter) {
                            return false;
                        }
                        return true;
                    })
                    .forEach((event) => {
                        const item = document.createElement("li");

                        const timeSpan = document.createElement("span");
                        timeSpan.className = "event-time";
                        timeSpan.textContent = getEventDisplayTime(event);

                        const eventSpan = document.createElement("span");
                        eventSpan.className = "event-type";
                        decorateLabel(eventSpan, event.eventType, "event");

                        const validationSpan = document.createElement("span");
                        validationSpan.className = "event-validation";
                        decorateLabel(
                            validationSpan,
                            event.callValidationType || event.validationType,
                            "validation",
                        );

                        item.appendChild(timeSpan);
                        item.appendChild(eventSpan);
                        item.appendChild(validationSpan);

                        list.appendChild(item);
                    });

                if (!list.children.length) {
                    const empty = document.createElement("li");
                    empty.className = "empty-row";
                    empty.textContent = "No events match the selected filters.";
                    list.appendChild(empty);
                }
            };

            validationSelect.addEventListener("change", render);
            eventSelect.addEventListener("change", render);
            render();

            container.appendChild(details);
        });
}

function buildSpotlights(logs) {
    const grouped = new Map();

    logs.forEach((log) => {
        const eventTime = getEventTime(log);
        if (!Number.isFinite(eventTime)) {
            return;
        }

        const identity = buildIdentity(log);
        if (!grouped.has(identity.key)) {
            grouped.set(identity.key, { ...identity, events: [] });
        }

        grouped.get(identity.key).events.push({ log, time: eventTime });
    });

    const eventTypeEntries = [];
    const validationEntries = [];

    grouped.forEach((entry) => {
        entry.events.sort((a, b) => a.time - b.time);

        const eventWindow = findSpotlightWindow(
            entry.events,
            SPOTLIGHT_WINDOW,
            (item) => item.log.eventType,
            (label) => isSpotlightEventType(label),
        );
        if (eventWindow && eventWindow.total >= 3) {
            eventTypeEntries.push({
                truck: entry.truck,
                site: entry.site,
                total: eventWindow.total,
                latest: eventWindow.endTime,
                breakdown: eventWindow.breakdown,
                window: { start: eventWindow.startTime, end: eventWindow.endTime },
                events: (eventWindow.events || []).map((item) => item.log),
            });
        }

        const validationWindow = findSpotlightWindow(
            entry.events,
            SPOTLIGHT_WINDOW,
            (item) => item.log.callValidationType || item.log.validationType,
            (label) => isSpotlightValidation(label),
        );
        if (validationWindow && validationWindow.total >= 3) {
            validationEntries.push({
                truck: entry.truck,
                site: entry.site,
                total: validationWindow.total,
                latest: validationWindow.endTime,
                breakdown: validationWindow.breakdown,
                window: { start: validationWindow.startTime, end: validationWindow.endTime },
                events: (validationWindow.events || []).map((item) => item.log),
            });
        }
    });

    return {
        eventTypes: splitSpotlights(eventTypeEntries),
        validationTypes: splitSpotlights(validationEntries),
    };
}

function findSpotlightWindow(events, windowSize, labelResolver, predicate) {
    const timeline = events
        .map((entry) => {
            const label = safeText(labelResolver(entry));
            return { ...entry, label };
        })
        .filter((entry) => predicate(entry.label));

    if (!timeline.length) {
        return null;
    }

    let start = 0;
    const counts = new Map();
    let best = null;

    for (let end = 0; end < timeline.length; end += 1) {
        const current = timeline[end];
        const label = current.label || "—";
        counts.set(label, (counts.get(label) || 0) + 1);

        while (start <= end && current.time - timeline[start].time > windowSize) {
            const startLabel = timeline[start].label || "—";
            const updated = (counts.get(startLabel) || 0) - 1;
            if (updated <= 0) {
                counts.delete(startLabel);
            } else {
                counts.set(startLabel, updated);
            }
            start += 1;
        }

        const total = end - start + 1;
        if (!best || total > best.total || (total === best.total && current.time > best.endTime)) {
            best = {
                total,
                startIndex: start,
                endIndex: end,
                startTime: timeline[start].time,
                endTime: current.time,
                breakdown: new Map(counts),
                events: timeline.slice(start, end + 1),
            };
        }
    }

    return best;
}

function splitSpotlights(entries) {
    const sorted = [...entries].sort((a, b) => b.total - a.total || b.latest - a.latest);
    return {
        top: sorted.filter((entry) => entry.total >= 5),
        mid: sorted.filter((entry) => entry.total >= 3 && entry.total < 5),
    };
}

function renderSpotlightList(container, entries, { emptyMessage, tone }) {
    container.innerHTML = "";
    if (!entries.length) {
        container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }

    entries.forEach((entry) => {
        const card = document.createElement("article");
        card.className = "spotlight-card";

        const heading = document.createElement("header");
        heading.className = "spotlight-header";

        const identity = document.createElement("div");
        const nameDiv = document.createElement("div");
        nameDiv.className = "spotlight-name";
        nameDiv.textContent = entry.truck;
        const siteDiv = document.createElement("div");
        siteDiv.className = "spotlight-meta";
        siteDiv.textContent = entry.site;
        identity.appendChild(nameDiv);
        identity.appendChild(siteDiv);

        const headingAside = document.createElement("div");
        headingAside.className = "spotlight-header-aside";
        const badge = document.createElement("span");
        badge.className = "badge subtle";
        badge.textContent = `${entry.total} alert${entry.total === 1 ? "" : "s"}`;
        headingAside.appendChild(badge);

        const events = Array.isArray(entry.events) ? entry.events.filter(Boolean) : [];

        let indicator = null;
        if (events.length) {
            indicator = document.createElement("span");
            indicator.className = "spotlight-toggle-indicator";
            indicator.textContent = "+";
            headingAside.appendChild(indicator);
        }

        heading.appendChild(identity);
        heading.appendChild(headingAside);

        const body = document.createElement("div");
        body.className = "spotlight-body";

        const breakdownList = document.createElement("ul");
        breakdownList.className = "spotlight-breakdown";
        Array.from(entry.breakdown.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([label, count]) => {
                const item = document.createElement("li");
                const labelSpan = document.createElement("span");
                const countSpan = document.createElement("span");
                countSpan.className = "count";
                countSpan.textContent = count;
                if (tone === "event") {
                    decorateLabel(labelSpan, label, "event");
                } else if (tone === "validation") {
                    decorateLabel(labelSpan, label, "validation");
                } else {
                    labelSpan.textContent = label;
                }
                item.appendChild(labelSpan);
                item.appendChild(countSpan);
                breakdownList.appendChild(item);
            });

        body.appendChild(breakdownList);

        let detailsSection = null;
        if (events.length) {
            detailsSection = document.createElement("div");
            detailsSection.className = "spotlight-event-details";
            const list = document.createElement("ul");
            list.className = "spotlight-events";
            events.forEach((eventLog) => {
                const item = document.createElement("li");

                const timeSpan = document.createElement("span");
                timeSpan.className = "event-time";
                timeSpan.textContent = getEventDisplayTime(eventLog);

                const eventSpan = document.createElement("span");
                eventSpan.className = "event-type";
                decorateLabel(eventSpan, eventLog.eventType, "event");

                const validationSpan = document.createElement("span");
                validationSpan.className = "event-validation";
                decorateLabel(
                    validationSpan,
                    eventLog.callValidationType || eventLog.validationType,
                    "validation",
                );

                item.appendChild(timeSpan);
                item.appendChild(eventSpan);
                item.appendChild(validationSpan);
                list.appendChild(item);
            });

            detailsSection.appendChild(list);
            body.appendChild(detailsSection);
        }

        const footer = document.createElement("div");
        footer.className = "spotlight-footer";
        const rangeText = entry.window ? formatRange(entry.window.start, entry.window.end) : "";
        const relativeText = formatRelative(entry.latest);
        footer.textContent = rangeText ? `${rangeText} · ${relativeText}` : relativeText;

        card.appendChild(heading);
        card.appendChild(body);
        card.appendChild(footer);

        if (events.length && detailsSection) {
            card.classList.add("toggleable");
            card.setAttribute("tabindex", "0");
            card.setAttribute("role", "button");
            card.setAttribute("aria-expanded", "false");

            const updateExpansion = (expanded) => {
                card.classList.toggle("expanded", expanded);
                card.setAttribute("aria-expanded", expanded ? "true" : "false");
                if (indicator) {
                    indicator.textContent = expanded ? "−" : "+";
                }
            };

            const handleToggle = () => {
                const nextState = !card.classList.contains("expanded");
                updateExpansion(nextState);
            };

            card.addEventListener("click", (event) => {
                const interactiveTarget = event.target.closest(
                    "a, button, select, input, textarea, label",
                );
                if (interactiveTarget) {
                    return;
                }
                event.preventDefault();
                handleToggle();
            });

            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleToggle();
                }
            });
        }

        container.appendChild(card);
    });
}

function renderFluctuations(logs, container) {
    const clusters = buildFluctuationClusters(logs);
    container.innerHTML = "";

    if (!clusters.length) {
        container.innerHTML = '<p class="empty-state">No event clusters detected.</p>';
        return clusters;
    }

    clusters.forEach((cluster) => {
        const card = document.createElement("article");
        card.className = "fluctuation-card";

        const header = document.createElement("header");
        header.className = "fluctuation-header";
        header.innerHTML = `
            <div class="fluctuation-header-meta">
                <span class="truck-chip">${cluster.truckNumber}</span>
                <span>${formatRange(cluster.start, cluster.end)}</span>
            </div>
            <span class="badge subtle">${cluster.events.length} events</span>
        `;

        const list = document.createElement("ul");
        list.className = "fluctuation-events";
        cluster.events.forEach((event) => {
            const item = document.createElement("li");
            const truckSpan = document.createElement("span");
            truckSpan.className = "event-truck";
            truckSpan.textContent = cluster.truckNumber;

            const timeSpan = document.createElement("span");
            timeSpan.className = "event-time";
            timeSpan.textContent = getEventDisplayTime(event);

            const eventSpan = document.createElement("span");
            eventSpan.className = "event-type";
            decorateLabel(eventSpan, event.eventType, "event");

            const validationSpan = document.createElement("span");
            validationSpan.className = "event-validation";
            decorateLabel(
                validationSpan,
                event.callValidationType || event.validationType,
                "validation",
            );

            const siteSpan = document.createElement("span");
            siteSpan.className = "event-site";
            siteSpan.textContent = safeText(event.siteName) || getHost(event.pageUrl) || "Unknown site";

            item.appendChild(truckSpan);
            item.appendChild(timeSpan);
            item.appendChild(eventSpan);
            item.appendChild(validationSpan);
            item.appendChild(siteSpan);
            list.appendChild(item);
        });

        card.appendChild(header);
        card.appendChild(list);
        container.appendChild(card);
    });

    return clusters;
}

function buildFluctuationClusters(logs) {
    const clusters = [];
    const byTruck = new Map();

    logs.forEach((log) => {
        if (!Number.isFinite(getEventTime(log))) {
            return;
        }
        const truckRaw = safeText(log.truckNumber);
        if (!truckRaw) {
            return;
        }
        const truckKey = truckRaw.toUpperCase();
        if (!byTruck.has(truckKey)) {
            byTruck.set(truckKey, { display: truckRaw, events: [] });
        }
        const bucket = byTruck.get(truckKey);
        if (!bucket.display && truckRaw) {
            bucket.display = truckRaw;
        }
        bucket.events.push(log);
    });

    byTruck.forEach((bucket, truckKey) => {
        const sorted = bucket.events
            .map((event) => ({ event, time: getEventTime(event) }))
            .filter((entry) => Number.isFinite(entry.time))
            .sort((a, b) => a.time - b.time);

        let start = 0;
        const windows = [];

        for (let end = 0; end < sorted.length; end += 1) {
            const endTime = sorted[end].time;
            while (start < end && endTime - sorted[start].time > EVENT_FLUCTUATION_WINDOW) {
                start += 1;
            }

            const count = end - start + 1;
            if (count >= EVENT_FLUCTUATION_MIN_EVENTS) {
                windows.push({ start, end });
            }
        }

        if (!windows.length) {
            return;
        }

        const merged = [];
        windows.forEach((window) => {
            const last = merged[merged.length - 1];
            if (!last || window.start > last.end) {
                merged.push({ ...window });
            } else {
                last.end = Math.max(last.end, window.end);
            }
        });

        merged.forEach((window) => {
            const events = sorted.slice(window.start, window.end + 1).map((entry) => entry.event);
            if (events.length >= EVENT_FLUCTUATION_MIN_EVENTS) {
                clusters.push({
                    truckNumber: safeText(events[0].truckNumber) || bucket.display || truckKey,
                    start: getEventTime(events[0]),
                    end: getEventTime(events[events.length - 1]),
                    events,
                });
            }
        });
    });

    return clusters.sort((a, b) => b.end - a.end);
}

function getEventTime(event) {
    if (!event) {
        return NaN;
    }
    if (Number.isFinite(event.timestampMs)) {
        return event.timestampMs;
    }
    if (Number.isFinite(event.createdAt)) {
        return event.createdAt;
    }
    const parsed = event.createdAt ? Date.parse(event.createdAt) : NaN;
    if (Number.isFinite(parsed)) {
        return parsed;
    }
    return NaN;
}

function getEventDisplayTime(event) {
    const text = safeText(event?.timestampText);
    if (text) {
        return text;
    }
    const timestamp = getEventTime(event);
    if (Number.isFinite(timestamp)) {
        return formatTimestamp(timestamp, "—", { hour12: false });
    }
    return "—";
}

function decorateLabel(element, label, category) {
    const text = safeText(label);
    element.textContent = text || "—";
    if (!text) {
        return;
    }

    const toneClass = category === "validation" ? getValidationToneClass(text) : getEventToneClass(text);
    if (toneClass) {
        element.classList.add("tone-label", toneClass);
    } else {
        element.classList.add("tone-label");
    }
}

function getValidationToneClass(label) {
    const value = safeText(label).toLowerCase();
    if (!value) {
        return "";
    }
    if (value.includes("critical")) {
        return "tone-validation-critical";
    }
    if (value.includes("moderate")) {
        return "tone-validation-moderate";
    }
    if (value.includes("low")) {
        return "tone-validation-low";
    }
    if (value.includes("searching face")) {
        return "tone-validation-search";
    }
    if (value.includes("blocked")) {
        return "tone-validation-blocked";
    }
    if (value.includes("detection error")) {
        return "tone-validation-detection";
    }
    if (value.includes("false positive")) {
        return "tone-validation-false-positive";
    }
    if (value.includes("unsafe distraction")) {
        return "tone-validation-unsafe-distraction";
    }
    if (value.includes("unsafe")) {
        return "tone-validation-unsafe";
    }
    if (value.includes("face")) {
        return "tone-validation-face";
    }
    if (value.includes("no video")) {
        return "tone-validation-no-video";
    }
    if (value.includes("non event")) {
        return "tone-validation-non-event";
    }
    return "tone-validation-default";
}

function getEventToneClass(label) {
    const value = safeText(label).toLowerCase();
    if (!value) {
        return "";
    }
    if (value.includes("microsleep")) {
        return "tone-event-microsleep";
    }
    if (value.includes("distraction")) {
        return "tone-event-distraction";
    }
    if (value.includes("searching face")) {
        return "tone-event-search";
    }
    if (value.includes("pending review")) {
        return "tone-event-pending";
    }
    if (value.includes("blocked")) {
        return "tone-event-blocked";
    }
    return "tone-event-default";
}

function formatTimestamp(timestampMs, fallbackText, options) {
    if (Number.isFinite(timestampMs)) {
        try {
            return new Date(timestampMs).toLocaleString(undefined, options);
        } catch (error) {
            // ignored
        }
    }
    return fallbackText || "—";
}

function formatRange(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return "Unknown time";
    }
    const start = new Date(startMs);
    const end = new Date(endMs);
    const formatterOptions = { hour12: false };
    return `${start.toLocaleTimeString(undefined, formatterOptions)} – ${end.toLocaleTimeString(
        undefined,
        formatterOptions,
    )}`;
}

function formatTimestampForCsv(timestampMs, fallbackText) {
    if (Number.isFinite(timestampMs)) {
        try {
            return new Date(timestampMs).toISOString();
        } catch (error) {
            // ignored
        }
    }
    return fallbackText || "";
}

function formatRelative(timestampMs) {
    if (!Number.isFinite(timestampMs)) {
        return "at an unknown time";
    }
    const now = Date.now();
    const diff = now - timestampMs;
    if (diff < 60 * 1000) {
        return "just now";
    }
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.round(diff / (60 * 1000));
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.round(diff / (60 * 60 * 1000));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function updateFluctuationExportButton(button, clusters) {
    if (!button) {
        return;
    }

    const hasData = Array.isArray(clusters) && clusters.length > 0;
    button.disabled = !hasData;
    button.title = hasData ? "Download fluctuations as CSV" : "No fluctuation data to export";
}

function exportFluctuationsCsv(clusters) {
    if (!Array.isArray(clusters) || !clusters.length) {
        showControlToast("No fluctuation data to export");
        return;
    }

    const rows = [
        ["Truck", "Window Start", "Window End", "Event Timestamp", "Event Type", "Validation", "Site"],
    ];

    clusters.forEach((cluster) => {
        const windowStart = formatTimestampForCsv(cluster.start, cluster.events[0]?.timestampText || "");
        const windowEnd = formatTimestampForCsv(
            cluster.end,
            cluster.events[cluster.events.length - 1]?.timestampText || "",
        );

        cluster.events.forEach((event) => {
            rows.push([
                safeText(cluster.truckNumber),
                windowStart,
                windowEnd,
                formatTimestampForCsv(getEventTime(event), event.timestampText || ""),
                safeText(event.eventType),
                safeText(event.callValidationType || event.validationType),
                safeText(event.siteName) || getHost(event.pageUrl) || "",
            ]);
        });
    });

    const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `qa-assist-fluctuations-${timestamp}.csv`;

    triggerCsvDownload(csv, filename);
    copyCsvToClipboard(csv);

    const exportedRows = rows.length - 1;
    showControlToast(
        `Exported ${exportedRows} row${exportedRows === 1 ? "" : "s"} of fluctuation data`,
    );
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    const text = String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function triggerCsvDownload(csv, filename) {
    try {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        // ignored
    }
}

function copyCsvToClipboard(csv) {
    if (!navigator?.clipboard?.writeText) {
        return;
    }
    navigator.clipboard.writeText(csv).catch(() => {
        // ignored
    });
}

function showControlToast(message) {
    if (!controlToastElement) {
        return;
    }

    controlToastElement.textContent = message;
    controlToastElement.classList.add("show");

    if (controlToastTimeoutId) {
        clearTimeout(controlToastTimeoutId);
    }

    controlToastTimeoutId = setTimeout(() => {
        controlToastElement?.classList.remove("show");
        controlToastTimeoutId = null;
    }, 2200);
}

function getHost(url) {
    const text = safeText(url);
    if (!text) {
        return "";
    }
    try {
        const { hostname } = new URL(text);
        return hostname;
    } catch (error) {
        return "";
    }
}

function isFatigueValidation(text) {
    const value = safeText(text).toLowerCase();
    if (!value) {
        return false;
    }
    if (value.includes("fatigue")) {
        return true;
    }
    return /\b(low|moderate|critical)\b/.test(value);
}

function isSpotlightEventType(text) {
    const value = safeText(text).toLowerCase();
    if (!value) {
        return false;
    }
    return EVENT_TYPE_SPOTLIGHTS.some((keyword) => value.includes(keyword));
}

function isSpotlightValidation(text) {
    const value = safeText(text).toLowerCase();
    if (!value) {
        return false;
    }
    return VALIDATION_SPOTLIGHTS.some((keyword) => value.includes(keyword));
}
