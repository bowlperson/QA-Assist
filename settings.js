const eventTypes = [
    'Searching Face',
    'Blocked',
    'Micro Sleep',
    'Microsleep',
    'Distraction',
    'Pending Review'
];
const speeds = ['1', '1.25', '1.5', '2'];

const DEFAULT_VALIDATION_VOCABULARY = [
    { label: 'Blocked', keywords: ['blocked'] },
    { label: 'Critical', keywords: ['critical'] },
    { label: 'Moderate', keywords: ['moderate'] },
    { label: '3 Low/hr', keywords: ['low'] },
    { label: 'Cellphone', keywords: ['cell phone', 'cellphone', 'cell', 'phone'] },
    { label: 'False Positive', keywords: ['false', 'non'] },
    { label: 'Lost Connection', keywords: ['lost connection', 'lost', 'disconnect'] },
];

document.addEventListener('DOMContentLoaded', () => {
    const rulesContainer = document.getElementById('rulesContainer');
    const addRuleBtn = document.getElementById('addRule');
    const skipDelayInput = document.getElementById('skipDelay');
    const smartSkipToggle = document.getElementById('smartSkipToggle');
    const skipContainer = document.getElementById('skipContainer');
    const simpleSkipToggle = document.getElementById('simpleSkipToggle');
    const simpleSkipDelayInput = document.getElementById('simpleSkipDelay');
    const simpleSkipDelayContainer = document.getElementById('simpleSkipDelayContainer');
    const keyDelayInput = document.getElementById('keyDelay');
    const loopToggle = document.getElementById('loopToggle');
    const loopResetInput = document.getElementById('loopReset');
    const loopHoldInput = document.getElementById('loopHold');
    const loopFollowToggle = document.getElementById('loopFollow');
    const loopResetContainer = document.getElementById('loopResetContainer');
    const loopHoldContainer = document.getElementById('loopHoldContainer');
    const loopFollowContainer = document.getElementById('loopFollowContainer');
    const saveBtn = document.getElementById('saveSettings');
    const siteRulesContainer = document.getElementById('siteRulesContainer');
    const addSiteRuleBtn = document.getElementById('addSiteRule');
    const scanToggle = document.getElementById('scanToggle');
    const scanHotkeyInput = document.getElementById('scanHotkey');
    const scanDurationInput = document.getElementById('scanDuration');
    const scanHotkeyContainer = document.getElementById('scanHotkeyContainer');
    const scanDurationContainer = document.getElementById('scanDurationContainer');
    const toast = document.getElementById('settingsToast');
    const validationListContainer = document.getElementById('validationList');
    const addValidationTermButton = document.getElementById('addValidationTerm');
    const validationFilterToggle = document.getElementById('validationFilterToggle');
    const confirmModal = document.getElementById('confirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmAcceptButton = document.getElementById('confirmAccept');
    const confirmCancelButton = document.getElementById('confirmCancel');
    const confirmCloseButton = document.getElementById('confirmClose');

    let toastTimeout = null;
    let confirmResolver = null;

    function showToast(message) {
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add('show');

        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    function closeConfirmModal(result) {
        if (!confirmModal) {
            if (confirmResolver) {
                confirmResolver(Boolean(result));
                confirmResolver = null;
            }
            return;
        }

        confirmModal.classList.remove('show');

        if (confirmResolver) {
            confirmResolver(Boolean(result));
            confirmResolver = null;
        }
    }

    function requestConfirmation(message) {
        if (!confirmModal || !confirmMessage) {
            return Promise.resolve(true);
        }

        confirmMessage.textContent = message;
        confirmModal.classList.add('show');

        return new Promise((resolve) => {
            confirmResolver = resolve;
        });
    }

    if (confirmAcceptButton) {
        confirmAcceptButton.addEventListener('click', () => closeConfirmModal(true));
    }

    if (confirmCancelButton) {
        confirmCancelButton.addEventListener('click', () => closeConfirmModal(false));
    }

    if (confirmCloseButton) {
        confirmCloseButton.addEventListener('click', () => closeConfirmModal(false));
    }

    if (confirmModal) {
        confirmModal.addEventListener('click', (event) => {
            if (event.target === confirmModal) {
                closeConfirmModal(false);
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && confirmModal?.classList.contains('show')) {
            closeConfirmModal(false);
        }
    });

    function cloneDefaultVocabulary() {
        return DEFAULT_VALIDATION_VOCABULARY.map((entry) => ({
            label: entry.label,
            keywords: Array.isArray(entry.keywords) ? [...entry.keywords] : [],
        }));
    }

    function sanitizeVocabularyInput(input, { fallback = false } = {}) {
        if (!Array.isArray(input)) {
            return fallback ? cloneDefaultVocabulary() : [];
        }

        const seen = new Set();
        const sanitized = input
            .map((entry) => {
                const label = String(entry?.label || '').trim();
                if (!label) {
                    return null;
                }

                const lowerLabel = label.toLowerCase();
                if (seen.has(lowerLabel)) {
                    return null;
                }

                const keywordSource = Array.isArray(entry?.keywords)
                    ? entry.keywords
                    : typeof entry?.keywords === 'string'
                        ? entry.keywords.split(',')
                        : [];

                const keywords = Array.from(
                    new Set(
                        keywordSource
                            .concat(label)
                            .map((keyword) => String(keyword || '').trim())
                            .filter(Boolean),
                    ),
                );

                seen.add(lowerLabel);
                return { label, keywords };
            })
            .filter(Boolean);

        if (!sanitized.length && fallback) {
            return cloneDefaultVocabulary();
        }

        return sanitized;
    }

    function createValidationRow(entry = {}) {
        if (!validationListContainer) {
            return null;
        }

        const row = document.createElement('div');
        row.className = 'validation-row';

        const labelField = document.createElement('label');
        labelField.textContent = 'Label';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'validation-label';
        labelInput.value = entry.label || '';
        labelField.appendChild(labelInput);

        const keywordField = document.createElement('label');
        keywordField.textContent = 'Keywords';
        const keywordInput = document.createElement('input');
        keywordInput.type = 'text';
        keywordInput.className = 'validation-keywords';
        keywordInput.placeholder = 'Comma separated matches';
        keywordInput.value = Array.isArray(entry.keywords) ? entry.keywords.join(', ') : '';
        keywordField.appendChild(keywordInput);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.className = 'remove icon-button';
        removeBtn.addEventListener('click', async () => {
            const confirmed = await requestConfirmation('Remove this validation label?');
            if (confirmed) {
                row.remove();
            }
        });

        row.append(labelField, keywordField, removeBtn);
        validationListContainer.appendChild(row);

        return labelInput;
    }

    function updateValidationEnabled() {
        if (!validationListContainer || !validationFilterToggle) {
            return;
        }

        validationListContainer.classList.toggle('validation-disabled', !validationFilterToggle.checked);
    }

    function createSiteRuleRow(rule) {
        const div = document.createElement('div');
        div.className = 'site-rule';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'example.com';
        urlInput.value = rule?.url || '';
        urlInput.className = 'url';

        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'URL ';
        urlLabel.appendChild(urlInput);

        const disableCheck = document.createElement('input');
        disableCheck.type = 'checkbox';
        disableCheck.checked = rule?.disabled || false;
        disableCheck.className = 'disabled';

        const disableLabel = document.createElement('label');
        disableLabel.appendChild(disableCheck);
        disableLabel.append(' Disable for this site');

        const speedSelect = document.createElement('select');
        speedSelect.className = 'speed';
        speeds.forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp;
            opt.textContent = sp + 'x';
            speedSelect.appendChild(opt);
        });
        speedSelect.value = rule?.speed || speeds[0];

        const speedLabel = document.createElement('label');
        speedLabel.textContent = 'Speed ';
        speedLabel.appendChild(speedSelect);

        const keySelect = document.createElement('select');
        keySelect.className = 'key';
        [{ val: 'ArrowRight', text: 'OAS' }, { val: 'ArrowDown', text: 'OpWeb' }].forEach(optInfo => {
            const opt = document.createElement('option');
            opt.value = optInfo.val;
            opt.textContent = optInfo.text;
            keySelect.appendChild(opt);
        });
        keySelect.value = rule?.pressKey || 'ArrowDown';

        const keyLabel = document.createElement('label');
        keyLabel.textContent = 'Key ';
        keyLabel.appendChild(keySelect);

        const autoNext = document.createElement('input');
        autoNext.type = 'checkbox';
        autoNext.className = 'autoNext';
        autoNext.checked = rule?.autoPressNext || false;

        const autoNextLabel = document.createElement('label');
        autoNextLabel.appendChild(autoNext);
        autoNextLabel.append(' Auto Press Next');

        const removeEye = document.createElement('input');
        removeEye.type = 'checkbox';
        removeEye.className = 'removeEye';
        removeEye.checked = rule?.removeEyeTracker || false;

        const removeEyeLabel = document.createElement('label');
        removeEyeLabel.appendChild(removeEye);
        removeEyeLabel.append(' Remove Eye Tracker');

        const smartSkip = document.createElement('input');
        smartSkip.type = 'checkbox';
        smartSkip.className = 'smartSkip';
        smartSkip.checked = rule?.smartSkipEnabled || false;

        const skipDelay = document.createElement('input');
        skipDelay.type = 'number';
        skipDelay.min = '0';
        skipDelay.max = '30';
        skipDelay.className = 'skipDelay';
        skipDelay.value = rule?.skipDelay ?? 0;

        const smartSkipLabel = document.createElement('label');
        smartSkipLabel.appendChild(smartSkip);
        smartSkipLabel.append(' Smart Skip delay ');
        smartSkipLabel.appendChild(skipDelay);
        smartSkipLabel.append('s');

        const keyDelaySite = document.createElement('input');
        keyDelaySite.type = 'number';
        keyDelaySite.min = '0';
        keyDelaySite.className = 'keyDelay';
        keyDelaySite.value = rule?.keyDelay ?? 2;

        const keyDelayLabel = document.createElement('label');
        keyDelayLabel.textContent = 'Buffer between videos ';
        keyDelayLabel.appendChild(keyDelaySite);
        keyDelayLabel.append('s');

        const loopToggleSite = document.createElement('input');
        loopToggleSite.type = 'checkbox';
        loopToggleSite.className = 'loopToggle';
        loopToggleSite.checked = rule?.loopingEnabled || false;

        const loopToggleLabel = document.createElement('label');
        loopToggleLabel.appendChild(loopToggleSite);
        loopToggleLabel.append(' Looping Mode');

        const loopResetSite = document.createElement('input');
        loopResetSite.type = 'number';
        loopResetSite.min = '0';
        loopResetSite.className = 'loopReset';
        loopResetSite.value = rule?.loopReset ?? 10;

        const loopResetLabel = document.createElement('label');
        loopResetLabel.textContent = 'Seconds till "reset" ';
        loopResetLabel.appendChild(loopResetSite);

        const loopHoldSite = document.createElement('input');
        loopHoldSite.type = 'number';
        loopHoldSite.min = '0';
        loopHoldSite.className = 'loopHold';
        loopHoldSite.value = rule?.loopHold ?? 5;

        const loopHoldLabel = document.createElement('label');
        loopHoldLabel.textContent = 'Seconds held ';
        loopHoldLabel.appendChild(loopHoldSite);

        const loopFollowSite = document.createElement('input');
        loopFollowSite.type = 'checkbox';
        loopFollowSite.className = 'loopFollow';
        loopFollowSite.checked = rule?.loopFollow ?? true;

        const loopFollowLabel = document.createElement('label');
        loopFollowLabel.appendChild(loopFollowSite);
        loopFollowLabel.append(' Follow up');

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '-';
        removeBtn.className = 'remove';
        removeBtn.addEventListener('click', async () => {
            const confirmed = await requestConfirmation('Remove this site override?');
            if (confirmed) {
                div.remove();
            }
        });

        div.append(
            urlLabel,
            disableLabel,
            speedLabel,
            keyLabel,
            autoNextLabel,
            removeEyeLabel,
            smartSkipLabel,
            keyDelayLabel,
            loopToggleLabel,
            loopResetLabel,
            loopHoldLabel,
            loopFollowLabel,
            removeBtn
        );
        siteRulesContainer.appendChild(div);
    }

    function updateSkipEnabled() {
        if (smartSkipToggle.checked) {
            skipContainer.classList.remove('disabled');
            skipDelayInput.disabled = false;
        } else {
            skipContainer.classList.add('disabled');
            skipDelayInput.disabled = true;
        }
    }

    function updateSimpleSkipEnabled() {
        if (simpleSkipToggle.checked) {
            simpleSkipDelayContainer.classList.remove('disabled');
            simpleSkipDelayInput.disabled = false;
        } else {
            simpleSkipDelayContainer.classList.add('disabled');
            simpleSkipDelayInput.disabled = true;
        }
    }

    function updateLoopEnabled() {
        const on = loopToggle.checked;
        [loopResetContainer, loopHoldContainer, loopFollowContainer].forEach(el => {
            if (on) {
                el.classList.remove('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = false);
            } else {
                el.classList.add('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = true);
            }
        });
    }

    function updateScanEnabled() {
        const on = scanToggle.checked;
        [scanHotkeyContainer, scanDurationContainer].forEach(el => {
            if (on) {
                el.classList.remove('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = false);
            } else {
                el.classList.add('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = true);
            }
        });
    }

    function createRuleRow(rule) {
        const div = document.createElement('div');
        div.className = 'rule';

        const eventSelect = document.createElement('select');
        eventTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type;
            eventSelect.appendChild(opt);
        });
        eventSelect.value = rule?.eventType || eventTypes[0];

        const speedSelect = document.createElement('select');
        speeds.forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp;
            opt.textContent = sp + 'x';
            speedSelect.appendChild(opt);
        });
        speedSelect.value = rule?.speed || speeds[0];

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '-';
        removeBtn.className = 'remove';
        removeBtn.addEventListener('click', async () => {
            const confirmed = await requestConfirmation('Remove this speed rule?');
            if (confirmed) {
                div.remove();
            }
        });

        div.appendChild(eventSelect);
        div.appendChild(speedSelect);
        div.appendChild(removeBtn);
        rulesContainer.appendChild(div);
    }

    addRuleBtn.addEventListener('click', () => createRuleRow());
    addSiteRuleBtn.addEventListener('click', () => createSiteRuleRow());

    if (addValidationTermButton) {
        addValidationTermButton.addEventListener('click', () => {
            const input = createValidationRow();
            if (input) {
                setTimeout(() => input.focus(), 50);
            }
        });
    }

    if (validationFilterToggle) {
        validationFilterToggle.addEventListener('change', updateValidationEnabled);
    }

    smartSkipToggle.addEventListener('change', updateSkipEnabled);
    simpleSkipToggle.addEventListener('change', updateSimpleSkipEnabled);
    loopToggle.addEventListener('change', updateLoopEnabled);
    scanToggle.addEventListener('change', updateScanEnabled);

    chrome.storage.sync.get({ customSpeedRules: [], skipDelay: 0, smartSkipEnabled: false, simpleAutoSkipEnabled: false, simpleAutoSkipDelay: 5, keyDelay: 2, loopingEnabled: false, loopReset: 10, loopHold: 5, loopFollow: true, siteRules: {}, scanningEnabled: false, scanHotkey: 'Ctrl+Shift+K', scanDuration: 60, validationVocabulary: DEFAULT_VALIDATION_VOCABULARY, validationFilterEnabled: true }, data => {
        const rules = data.customSpeedRules;
        if (rules.length === 0) {
            createRuleRow();
        } else {
            rules.forEach(r => createRuleRow(r));
        }

        smartSkipToggle.checked = data.smartSkipEnabled;
        skipDelayInput.value = data.skipDelay || 0;
        simpleSkipToggle.checked = data.simpleAutoSkipEnabled;
        simpleSkipDelayInput.value = data.simpleAutoSkipDelay ?? 5;
        keyDelayInput.value = data.keyDelay ?? 2;
        loopToggle.checked = data.loopingEnabled;
        loopResetInput.value = data.loopReset ?? 10;
        loopHoldInput.value = data.loopHold ?? 5;
        loopFollowToggle.checked = data.loopFollow ?? true;
        Object.entries(data.siteRules).forEach(([url, cfg]) => {
            createSiteRuleRow(Object.assign({ url }, cfg));
        });
        scanToggle.checked = data.scanningEnabled;
        scanHotkeyInput.value = data.scanHotkey || 'Ctrl+Shift+K';
        scanDurationInput.value = data.scanDuration ?? 60;
        const validations = sanitizeVocabularyInput(data.validationVocabulary, { fallback: true });
        if (validationListContainer) {
            validations.forEach((entry) => createValidationRow(entry));
        }
        if (validationFilterToggle) {
            validationFilterToggle.checked = data.validationFilterEnabled ?? true;
        }
        updateSkipEnabled();
        updateSimpleSkipEnabled();
        updateLoopEnabled();
        updateScanEnabled();
        updateValidationEnabled();
    });

    saveBtn.addEventListener('click', () => {
        const rules = [];
        rulesContainer.querySelectorAll('.rule').forEach(div => {
            const [eventSelect, speedSelect] = div.querySelectorAll('select');
            rules.push({ eventType: eventSelect.value, speed: speedSelect.value });
        });

        let delay = parseFloat(skipDelayInput.value) || 0;
        if (delay > 30) delay = 30;
        skipDelayInput.value = delay;

        let keyDelay = parseFloat(keyDelayInput.value);
        if (isNaN(keyDelay) || keyDelay < 0) keyDelay = 0;
        keyDelayInput.value = keyDelay;

        let simpleDelay = parseFloat(simpleSkipDelayInput.value) || 0;
        simpleSkipDelayInput.value = simpleDelay;

        const enabled = smartSkipToggle.checked;
        const simpleEnabled = simpleSkipToggle.checked;
        const loopingEnabled = loopToggle.checked;
        const scanEnabled = scanToggle.checked;
        let scanDuration = parseFloat(scanDurationInput.value) || 60;
        scanDurationInput.value = scanDuration;
        const scanHotkey = scanHotkeyInput.value || 'Ctrl+Shift+K';

        const vocabularyEntries = [];
        if (validationListContainer) {
            validationListContainer.querySelectorAll('.validation-row').forEach((row) => {
                const labelInput = row.querySelector('.validation-label');
                const keywordsInput = row.querySelector('.validation-keywords');
                const label = labelInput ? labelInput.value.trim() : '';
                if (!label) {
                    return;
                }

                const keywords = keywordsInput
                    ? keywordsInput.value
                          .split(',')
                          .map((keyword) => keyword.trim())
                          .filter(Boolean)
                    : [];

                vocabularyEntries.push({ label, keywords });
            });
        }

        const sanitizedVocabulary = sanitizeVocabularyInput(vocabularyEntries, { fallback: false });
        const validationFilterEnabled = validationFilterToggle ? validationFilterToggle.checked : true;

        const siteRules = {};
        siteRulesContainer.querySelectorAll('.site-rule').forEach(div => {
            const url = div.querySelector('.url').value.trim();
            if (!url) return;
            const cfg = {
                disabled: div.querySelector('.disabled').checked,
                speed: div.querySelector('.speed').value,
                pressKey: div.querySelector('.key').value,
                autoPressNext: div.querySelector('.autoNext').checked,
                removeEyeTracker: div.querySelector('.removeEye').checked,
                smartSkipEnabled: div.querySelector('.smartSkip').checked,
                skipDelay: parseFloat(div.querySelector('.skipDelay').value) || 0,
                keyDelay: parseFloat(div.querySelector('.keyDelay').value) || 0,
                loopingEnabled: div.querySelector('.loopToggle').checked,
                loopReset: parseFloat(div.querySelector('.loopReset').value) || 10,
                loopHold: parseFloat(div.querySelector('.loopHold').value) || 5,
                loopFollow: div.querySelector('.loopFollow').checked
            };
            siteRules[url] = cfg;
        });

        chrome.storage.sync.set({ customSpeedRules: rules, skipDelay: delay, smartSkipEnabled: enabled, simpleAutoSkipEnabled: simpleEnabled, simpleAutoSkipDelay: simpleDelay, keyDelay, loopingEnabled, loopReset: parseFloat(loopResetInput.value) || 10, loopHold: parseFloat(loopHoldInput.value) || 5, loopFollow: loopFollowToggle.checked, siteRules, scanningEnabled: scanEnabled, scanHotkey, scanDuration, validationVocabulary: sanitizedVocabulary, validationFilterEnabled }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        customSpeedRules: rules,
                        skipDelay: enabled ? delay : 0,
                        smartSkipEnabled: enabled,
                        simpleAutoSkipEnabled: simpleEnabled,
                        simpleAutoSkipDelay: simpleDelay,
                        keyDelay,
                        loopingEnabled,
                        loopReset: parseFloat(loopResetInput.value) || 10,
                        loopHold: parseFloat(loopHoldInput.value) || 5,
                        loopFollow: loopFollowToggle.checked,
                        siteRules,
                        scanningEnabled: scanEnabled,
                        scanHotkey,
                        scanDuration,
                        validationVocabulary: sanitizedVocabulary,
                        validationFilterEnabled,
                    });
                }
            });
            showToast('Settings saved');
        });
    });
});
