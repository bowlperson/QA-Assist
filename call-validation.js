(function () {
    const VALIDATION_OPTIONS = [
        "",
        "Blocked",
        "Critical",
        "Moderate",
        "3 Low/hr",
        "Cellphone",
        "False Positive",
        "Lost Connection",
    ];

    document.addEventListener('DOMContentLoaded', function () {
        const form = {
            callDate: document.getElementById('callDate'),
            eventTime: document.getElementById('eventTime'),
            firstCallTime: document.getElementById('firstCallTime'),
            secondCallTime: document.getElementById('secondCallTime'),
            thirdCallTime: document.getElementById('thirdCallTime'),
            siteName: document.getElementById('siteName'),
            equipmentNumber: document.getElementById('equipmentNumber'),
            validationType: document.getElementById('validationType'),
            monitorName: document.getElementById('monitorName'),
            contact: document.getElementById('contact'),
            receptor: document.getElementById('receptor'),
        };

        const statusMessage = document.getElementById('formStatus');
        const tableBody = document.getElementById('callValidationBody');
        const copyLatestButton = document.getElementById('copyAll');
        const confirmOverlay = document.getElementById('validationConfirm');
        const confirmText = document.getElementById('confirmText');
        const confirmYes = document.getElementById('confirmYes');
        const confirmNo = document.getElementById('confirmNo');

        let callEntries = [];
        let latestEventDetails = null;
        let pendingEntry = null;
        let defaults = {};

        function normalizeExistingEntries(entries) {
            return entries.map(function (entry) {
                const normalized = Object.assign({}, entry);
                normalized.dateIso = entry.dateIso || entry.dateISO || '';
                if (!normalized.dateDisplay) {
                    normalized.dateDisplay = entry.dateDisplay || formatDateDisplay(normalized.dateIso);
                }
                if (!normalized.eventTime || typeof normalized.eventTime !== 'object') {
                    normalized.eventTime = splitTime(entry.eventTimeRaw || entry.eventTime || '');
                }
                if (!normalized.firstCall || typeof normalized.firstCall !== 'object') {
                    normalized.firstCall = splitTime(entry.firstCallRaw || '');
                }
                if (!normalized.secondCall || typeof normalized.secondCall !== 'object') {
                    normalized.secondCall = splitTime(entry.secondCallRaw || '');
                }
                if (!normalized.thirdCall || typeof normalized.thirdCall !== 'object') {
                    normalized.thirdCall = splitTime(entry.thirdCallRaw || '');
                }
                normalized.siteName = normalized.siteName || entry.site || '';
                normalized.equipmentNumber = normalized.equipmentNumber || entry.equipment || entry.truckNumber || '';
                normalized.validationType = normalized.validationType || entry.validation || '';
                normalized.monitorName = normalized.monitorName || '';
                normalized.contact = normalized.contact || '';
                normalized.receptor = normalized.receptor || '';
                normalized.id = normalized.id || Date.now() + Math.floor(Math.random() * 1000);
                return normalized;
            });
        }

        function setStatus(message, isError) {
            if (!statusMessage) {
                return;
            }
            statusMessage.textContent = message || '';
            statusMessage.style.color = isError ? '#ff9090' : '#8fd18b';
        }

        function splitTime(value) {
            if (!value) {
                return { hr: '', min: '' };
            }
            const trimmed = value.trim();
            if (!trimmed) {
                return { hr: '', min: '' };
            }
            const parts = trimmed.split(':');
            const hrPart = parts[0];
            const minPart = parts.length > 1 ? parts[1] : '';

            const hr = hrPart === undefined || hrPart === '' ? '' : String(parseInt(hrPart, 10) || 0);
            const min = minPart === undefined || minPart === '' ? '' : String(parseInt(minPart, 10) || 0);

            return { hr, min };
        }

        function formatDateDisplay(iso) {
            if (!iso) {
                return '';
            }
            const parts = iso.split('-');
            if (parts.length !== 3) {
                return iso;
            }
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            if (isNaN(year) || isNaN(month) || isNaN(day)) {
                return iso;
            }
            return month + '/' + day + '/' + year;
        }

        function copyToClipboard(text, successMessage) {
            if (!text) {
                setStatus('Nothing to copy.', true);
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    setStatus(successMessage || 'Copied to clipboard.');
                }).catch(function () {
                    fallbackCopy(text, successMessage);
                });
            } else {
                fallbackCopy(text, successMessage);
            }
        }

        function fallbackCopy(text, successMessage) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                setStatus(successMessage || 'Copied to clipboard.');
            } catch (err) {
                setStatus('Unable to copy to clipboard.', true);
            }
            document.body.removeChild(textarea);
        }

        function rowToClipboard(entry) {
            const parts = [
                entry.dateDisplay || '',
                entry.eventTime.hr,
                entry.eventTime.min,
                entry.firstCall.hr,
                entry.firstCall.min,
                entry.secondCall.hr,
                entry.secondCall.min,
                entry.thirdCall.hr,
                entry.thirdCall.min,
                entry.siteName,
                entry.equipmentNumber,
                entry.validationType,
                entry.monitorName,
                entry.contact,
                entry.receptor,
            ];
            return parts.join('\t');
        }

        function callTimesToClipboard(entry) {
            const parts = [
                entry.firstCall.hr,
                entry.firstCall.min,
                entry.secondCall.hr,
                entry.secondCall.min,
                entry.thirdCall.hr,
                entry.thirdCall.min,
            ];
            return parts.join('\t');
        }

        function eventTimeToClipboard(entry) {
            return [entry.eventTime.hr, entry.eventTime.min].join('\t');
        }

        function storeEntries() {
            chrome.storage.local.set({ callValidations: callEntries });
        }

        function storeDefaults(entry) {
            defaults = {
                monitorName: entry.monitorName || defaults.monitorName || '',
                contact: entry.contact || defaults.contact || '',
                receptor: entry.receptor || defaults.receptor || '',
            };
            chrome.storage.sync.set({ callValidationDefaults: defaults });
        }

        function renderTable() {
            tableBody.innerHTML = '';
            if (!callEntries.length) {
                const emptyRow = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 16;
                cell.className = 'table-empty';
                cell.textContent = 'No saved calls yet.';
                emptyRow.appendChild(cell);
                tableBody.appendChild(emptyRow);
                return;
            }

            callEntries.forEach(function (entry) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${entry.dateDisplay || ''}</td>
                    <td>${entry.eventTime.hr || ''}</td>
                    <td>${entry.eventTime.min || ''}</td>
                    <td>${entry.firstCall.hr || ''}</td>
                    <td>${entry.firstCall.min || ''}</td>
                    <td>${entry.secondCall.hr || ''}</td>
                    <td>${entry.secondCall.min || ''}</td>
                    <td>${entry.thirdCall.hr || ''}</td>
                    <td>${entry.thirdCall.min || ''}</td>
                    <td>${entry.siteName || ''}</td>
                    <td>${entry.equipmentNumber || ''}</td>
                    <td>${entry.validationType || ''}</td>
                    <td>${entry.monitorName || ''}</td>
                    <td>${entry.contact || ''}</td>
                    <td>${entry.receptor || ''}</td>
                    <td class="actions-cell"></td>
                `;

                const actionsCell = row.querySelector('.actions-cell');

                const copyRowBtn = document.createElement('button');
                copyRowBtn.className = 'secondary';
                copyRowBtn.textContent = 'Copy Row';
                copyRowBtn.addEventListener('click', function () {
                    copyToClipboard(rowToClipboard(entry), 'Call validation row copied.');
                });

                const copyEventBtn = document.createElement('button');
                copyEventBtn.className = 'secondary';
                copyEventBtn.textContent = 'Only Copy Event Time';
                copyEventBtn.addEventListener('click', function () {
                    copyToClipboard(eventTimeToClipboard(entry), 'Event time copied.');
                });

                const copyCallBtn = document.createElement('button');
                copyCallBtn.className = 'secondary';
                copyCallBtn.textContent = 'Only Copy Call Time';
                copyCallBtn.addEventListener('click', function () {
                    copyToClipboard(callTimesToClipboard(entry), 'Call times copied.');
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'secondary';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', function () {
                    callEntries = callEntries.filter(function (item) {
                        return item.id !== entry.id;
                    });
                    storeEntries();
                    renderTable();
                    setStatus('Entry deleted.');
                });

                actionsCell.appendChild(copyRowBtn);
                actionsCell.appendChild(copyEventBtn);
                actionsCell.appendChild(copyCallBtn);
                actionsCell.appendChild(deleteBtn);

                tableBody.appendChild(row);
            });
        }

        function buildEntryFromForm() {
            const dateIso = form.callDate.value;
            const validationValue = form.validationType.value;

            if (!validationValue) {
                setStatus('Please select a validation type before saving.', true);
                form.validationType.focus();
                return null;
            }

            const entry = {
                id: Date.now(),
                dateIso: dateIso || '',
                dateDisplay: formatDateDisplay(dateIso),
                eventTime: splitTime(form.eventTime.value),
                firstCall: splitTime(form.firstCallTime.value),
                secondCall: splitTime(form.secondCallTime.value),
                thirdCall: splitTime(form.thirdCallTime.value),
                siteName: form.siteName.value.trim(),
                equipmentNumber: form.equipmentNumber.value.trim(),
                validationType: validationValue,
                monitorName: form.monitorName.value.trim(),
                contact: form.contact.value.trim(),
                receptor: form.receptor.value.trim(),
            };

            return entry;
        }

        function openConfirm(entry) {
            pendingEntry = entry;
            confirmText.textContent = 'Is "' + entry.validationType + '" the correct validation type?';
            confirmOverlay.classList.remove('hidden');
        }

        function closeConfirm() {
            confirmOverlay.classList.add('hidden');
            pendingEntry = null;
        }

        function finalizeSave(entry) {
            callEntries.push(entry);
            storeEntries();
            storeDefaults(entry);
            renderTable();
            setStatus('Call validation saved.');
        }

        function clearForm(preserveDefaults) {
            form.callDate.value = '';
            form.eventTime.value = '';
            form.firstCallTime.value = '';
            form.secondCallTime.value = '';
            form.thirdCallTime.value = '';
            form.siteName.value = '';
            form.equipmentNumber.value = '';
            form.validationType.value = '';
            if (!preserveDefaults) {
                form.monitorName.value = defaults.monitorName || '';
                form.contact.value = defaults.contact || '';
                form.receptor.value = defaults.receptor || '';
            }
        }

        function fillDefaults() {
            if (defaults.monitorName && !form.monitorName.value) {
                form.monitorName.value = defaults.monitorName;
            }
            if (defaults.contact && !form.contact.value) {
                form.contact.value = defaults.contact;
            }
            if (defaults.receptor && !form.receptor.value) {
                form.receptor.value = defaults.receptor;
            }
        }

        function applyLatestEvent(details) {
            if (!details) {
                return;
            }
            latestEventDetails = details;
            if (details.dateISO) {
                form.callDate.value = details.dateISO;
            } else if (details.dateDisplay) {
                const parts = details.dateDisplay.split('/');
                if (parts.length === 3) {
                    const month = parts[0].padStart(2, '0');
                    const day = parts[1].padStart(2, '0');
                    form.callDate.value = parts[2] + '-' + month + '-' + day;
                }
            }
            if (details.timeRaw) {
                form.eventTime.value = details.timeRaw;
            } else if (details.eventTimeHr || details.eventTimeMin) {
                let hr = '';
                if (details.eventTimeHr !== undefined && details.eventTimeHr !== null && details.eventTimeHr !== '') {
                    const hrNumber = parseInt(details.eventTimeHr, 10);
                    hr = isNaN(hrNumber) ? String(details.eventTimeHr) : String(hrNumber);
                }
                let min = '';
                if (details.eventTimeMin !== undefined && details.eventTimeMin !== null && details.eventTimeMin !== '') {
                    const minNumber = parseInt(details.eventTimeMin, 10);
                    min = isNaN(minNumber) ? String(details.eventTimeMin) : String(minNumber).padStart(2, '0');
                }
                if (hr !== '' || min !== '') {
                    const paddedHr = hr !== '' ? (isNaN(parseInt(hr, 10)) ? hr : String(parseInt(hr, 10))) : '';
                    const paddedMin = min !== '' ? min : '00';
                    const displayHr = paddedHr !== '' ? paddedHr : '0';
                    form.eventTime.value = displayHr + ':' + paddedMin;
                }
            }
            if (details.siteName) {
                form.siteName.value = details.siteName;
            }
            if (details.equipmentNumber) {
                form.equipmentNumber.value = details.equipmentNumber;
            } else if (details.truckNumber) {
                form.equipmentNumber.value = details.truckNumber;
            }
            if (details.validationType && VALIDATION_OPTIONS.indexOf(details.validationType) !== -1) {
                form.validationType.value = details.validationType;
            } else {
                form.validationType.value = '';
            }
            fillDefaults();
        }

        document.getElementById('saveCall').addEventListener('click', function () {
            const entry = buildEntryFromForm();
            if (!entry) {
                return;
            }
            openConfirm(entry);
        });

        confirmYes.addEventListener('click', function () {
            if (pendingEntry) {
                finalizeSave(pendingEntry);
                closeConfirm();
            }
        });

        confirmNo.addEventListener('click', function () {
            closeConfirm();
            form.validationType.focus();
        });

        document.getElementById('clearForm').addEventListener('click', function () {
            clearForm(false);
            setStatus('Form cleared.');
        });

        document.getElementById('loadLatest').addEventListener('click', function () {
            if (!latestEventDetails) {
                setStatus('No recent event details available. Try watching an event.', true);
                return;
            }
            applyLatestEvent(latestEventDetails);
            setStatus('Latest event details loaded.');
        });

        copyLatestButton.addEventListener('click', function () {
            if (!callEntries.length) {
                setStatus('No rows available to copy.', true);
                return;
            }
            const latest = callEntries[callEntries.length - 1];
            copyToClipboard(rowToClipboard(latest), 'Latest row copied.');
        });

        chrome.storage.local.get(['callValidations', 'latestEventDetails'], function (data) {
            callEntries = Array.isArray(data.callValidations) ? normalizeExistingEntries(data.callValidations) : [];
            latestEventDetails = data.latestEventDetails || null;
            renderTable();
            applyLatestEvent(latestEventDetails);
        });

        chrome.storage.sync.get(['callValidationDefaults'], function (data) {
            defaults = data.callValidationDefaults || {};
            fillDefaults();
        });
    });
})();
