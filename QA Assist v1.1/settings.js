const eventTypes = [
    'Searching Face',
    'Blocked',
    'Micro Sleep',
    'Microsleep',
    'Distraction',
    'Pending Review'
];
const speeds = ['1', '1.25', '1.5', '1.75', '2'];
const DEFAULT_ANTI_LAG_SEEK = 0.5;

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
    const keyDelayInput = document.getElementById('keyDelay');
    const loopToggle = document.getElementById('loopToggle');
    const loopResetInput = document.getElementById('loopReset');
    const loopHoldInput = document.getElementById('loopHold');
    const loopResetContainer = document.getElementById('loopResetContainer');
    const loopHoldContainer = document.getElementById('loopHoldContainer');
    const oasModeToggle = document.getElementById('oasModeToggle');
    const antiLagToggle = document.getElementById('antiLagToggle');
    const antiLagSeekInput = document.getElementById('antiLagSeek');
    const antiLagSeekContainer = document.getElementById('antiLagSeekContainer');
    const siteHealthCheckMinutesInput = document.getElementById('siteHealthCheckMinutes');
    const saveBtn = document.getElementById('saveSettings');
    const siteRulesContainer = document.getElementById('siteRulesContainer');
    const addSiteRuleBtn = document.getElementById('addSiteRule');
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
        [{ val: 'ArrowDown', text: 'OpWeb (↓)' }].forEach(optInfo => {
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

        const oasMode = document.createElement('input');
        oasMode.type = 'checkbox';
        oasMode.className = 'oasMode';
        oasMode.checked = rule?.oasModeEnabled || false;

        const oasModeLabel = document.createElement('label');
        oasModeLabel.appendChild(oasMode);
        oasModeLabel.append(' OAS Mode');

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
        loopToggleSite.checked = rule?.autoLoopEnabled || false;

        const loopToggleLabel = document.createElement('label');
        loopToggleLabel.appendChild(loopToggleSite);
        loopToggleLabel.append(' Auto loop');

        const loopResetSite = document.createElement('input');
        loopResetSite.type = 'number';
        loopResetSite.min = '0';
        loopResetSite.className = 'loopReset';
        loopResetSite.value = rule?.autoLoopDelay ?? 8;

        const loopResetLabel = document.createElement('label');
        loopResetLabel.textContent = 'Idle delay (s) ';
        loopResetLabel.appendChild(loopResetSite);

        const loopHoldSite = document.createElement('input');
        loopHoldSite.type = 'number';
        loopHoldSite.min = '0';
        loopHoldSite.className = 'loopHold';
        loopHoldSite.value = rule?.autoLoopHold ?? 5;

        const loopHoldLabel = document.createElement('label');
        loopHoldLabel.textContent = 'Hold duration (s) ';
        loopHoldLabel.appendChild(loopHoldSite);

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
            oasModeLabel,
            removeEyeLabel,
            smartSkipLabel,
            keyDelayLabel,
            loopToggleLabel,
            loopResetLabel,
            loopHoldLabel,
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

    function updateLoopEnabled() {
        const on = loopToggle.checked;
        [loopResetContainer, loopHoldContainer].forEach(el => {
            if (on) {
                el.classList.remove('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = false);
            } else {
                el.classList.add('disabled');
                el.querySelectorAll('input').forEach(i => i.disabled = true);
            }
        });
    }

    function updateAntiLagEnabled() {
        if (!antiLagToggle || !antiLagSeekContainer || !antiLagSeekInput) {
            return;
        }
        if (antiLagToggle.checked) {
            antiLagSeekContainer.classList.remove('disabled');
            antiLagSeekInput.disabled = false;
        } else {
            antiLagSeekContainer.classList.add('disabled');
            antiLagSeekInput.disabled = true;
        }
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

    const collapseButtons = document.querySelectorAll('.collapse-toggle');

    function updateCollapseButton(button, collapsed) {
        if (!button) {
            return;
        }

        button.textContent = collapsed ? '+' : '−';
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
    }

    collapseButtons.forEach((button) => {
        const section = button.closest('.page-card');
        const isCollapsed = section?.classList.contains('collapsed') ?? false;
        updateCollapseButton(button, isCollapsed);

        button.addEventListener('click', () => {
            const host = button.closest('.page-card');
            if (!host) {
                return;
            }

            const nextState = host.classList.toggle('collapsed');
            updateCollapseButton(button, nextState);
        });
    });

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
    loopToggle.addEventListener('change', updateLoopEnabled);
    if (antiLagToggle) {
        antiLagToggle.addEventListener('change', updateAntiLagEnabled);
    }

    chrome.storage.local.get(
        {
            customSpeedRules: [],
            skipDelay: 6,
            smartSkipEnabled: true,
            keyDelay: 4,
            autoLoopEnabled: false,
            autoLoopDelay: 8,
            autoLoopHold: 5,
            oasModeEnabled: false,
            siteRules: {},
            validationVocabulary: DEFAULT_VALIDATION_VOCABULARY,
            validationFilterEnabled: true,
            antiLagEnabled: false,
            antiLagSeekSeconds: DEFAULT_ANTI_LAG_SEEK,
            siteHealthCheckMinutes: 10,
        },
        (data) => {
        const rules = data.customSpeedRules;
        if (rules.length === 0) {
            createRuleRow();
        } else {
            rules.forEach(r => createRuleRow(r));
        }

        smartSkipToggle.checked = data.smartSkipEnabled;
        skipDelayInput.value = data.skipDelay || 0;
        keyDelayInput.value = data.keyDelay ?? 2;
        loopToggle.checked = data.autoLoopEnabled;
        loopResetInput.value = data.autoLoopDelay ?? 8;
        loopHoldInput.value = data.autoLoopHold ?? 5;
        if (oasModeToggle) {
            oasModeToggle.checked = data.oasModeEnabled ?? false;
        }
        if (antiLagToggle) {
            antiLagToggle.checked = data.antiLagEnabled ?? false;
        }
        if (antiLagSeekInput) {
            antiLagSeekInput.value = data.antiLagSeekSeconds ?? DEFAULT_ANTI_LAG_SEEK;
        }
        if (siteHealthCheckMinutesInput) {
            siteHealthCheckMinutesInput.value = data.siteHealthCheckMinutes ?? 10;
        }
        Object.entries(data.siteRules).forEach(([url, cfg]) => {
            createSiteRuleRow(Object.assign({ url }, cfg));
        });
        const validations = sanitizeVocabularyInput(data.validationVocabulary, { fallback: true });
        if (validationListContainer) {
            validations.forEach((entry) => createValidationRow(entry));
        }
        if (validationFilterToggle) {
            validationFilterToggle.checked = data.validationFilterEnabled ?? true;
        }
        updateSkipEnabled();
        updateLoopEnabled();
        updateValidationEnabled();
        updateAntiLagEnabled();
        },
    );

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

        const enabled = smartSkipToggle.checked;
        const siteHealthCheckMinutes = Math.max(1, parseFloat(siteHealthCheckMinutesInput?.value) || 10);
        if (siteHealthCheckMinutesInput) {
            siteHealthCheckMinutesInput.value = siteHealthCheckMinutes;
        }
        const autoLoopEnabled = loopToggle.checked;
        const oasModeEnabled = oasModeToggle ? oasModeToggle.checked : false;
        const antiLagEnabled = antiLagToggle ? antiLagToggle.checked : false;
        const rawAntiLag = parseFloat(antiLagSeekInput?.value);
        const antiLagSeekSeconds = Number.isFinite(rawAntiLag)
            ? Math.max(0, rawAntiLag)
            : DEFAULT_ANTI_LAG_SEEK;
        if (antiLagSeekInput) {
            antiLagSeekInput.value = antiLagSeekSeconds;
        }

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
                oasModeEnabled: div.querySelector('.oasMode').checked,
                removeEyeTracker: div.querySelector('.removeEye').checked,
                smartSkipEnabled: div.querySelector('.smartSkip').checked,
                skipDelay: parseFloat(div.querySelector('.skipDelay').value) || 0,
                keyDelay: parseFloat(div.querySelector('.keyDelay').value) || 0,
                autoLoopEnabled: div.querySelector('.loopToggle').checked,
                autoLoopDelay: parseFloat(div.querySelector('.loopReset').value) || 8,
                autoLoopHold: parseFloat(div.querySelector('.loopHold').value) || 5,
            };
            siteRules[url] = cfg;
        });

        chrome.storage.local.set(
            {
                customSpeedRules: rules,
                skipDelay: delay,
                smartSkipEnabled: enabled,
                keyDelay,
                autoLoopEnabled,
                autoLoopDelay: parseFloat(loopResetInput.value) || 8,
                autoLoopHold: parseFloat(loopHoldInput.value) || 5,
                oasModeEnabled,
                siteRules,
                validationVocabulary: sanitizedVocabulary,
                validationFilterEnabled,
                antiLagEnabled,
                antiLagSeekSeconds,
                siteHealthCheckMinutes,
            },
            () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            customSpeedRules: rules,
                            skipDelay: enabled ? delay : 0,
                            smartSkipEnabled: enabled,
                            keyDelay,
                            autoLoopEnabled,
                            autoLoopDelay: parseFloat(loopResetInput.value) || 8,
                            autoLoopHold: parseFloat(loopHoldInput.value) || 5,
                            oasModeEnabled,
                            siteRules,
                            validationVocabulary: sanitizedVocabulary,
                            validationFilterEnabled,
                            antiLagEnabled,
                            antiLagSeekSeconds,
                            siteHealthCheckMinutes,
                        });
                    }
                });
                showToast('Settings saved');
            },
        );
    });
});
