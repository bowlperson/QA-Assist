const eventTypes = [
    'Searching Face',
    'Blocked',
    'Micro Sleep',
    'Microsleep',
    'Distraction',
    'Pending Review'
];
const speeds = ['1', '1.25', '1.5', '2'];

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
    const loopFollowToggle = document.getElementById('loopFollow');
    const loopResetContainer = document.getElementById('loopResetContainer');
    const loopHoldContainer = document.getElementById('loopHoldContainer');
    const loopFollowContainer = document.getElementById('loopFollowContainer');
    const saveBtn = document.getElementById('saveSettings');
    const siteRulesContainer = document.getElementById('siteRulesContainer');
    const addSiteRuleBtn = document.getElementById('addSiteRule');

    function createSiteRuleRow(rule) {
        const div = document.createElement('div');
        div.className = 'rule';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'example.com';
        urlInput.value = rule?.url || '';

        const speedSelect = document.createElement('select');
        speeds.forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp;
            opt.textContent = sp + 'x';
            speedSelect.appendChild(opt);
        });
        speedSelect.value = rule?.speed || speeds[0];

        const disableCheck = document.createElement('input');
        disableCheck.type = 'checkbox';
        disableCheck.checked = rule?.disabled || false;

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '-';
        removeBtn.className = 'remove';
        removeBtn.addEventListener('click', () => div.remove());

        div.appendChild(urlInput);
        div.appendChild(speedSelect);
        div.appendChild(disableCheck);
        div.appendChild(removeBtn);
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
        removeBtn.addEventListener('click', () => div.remove());

        div.appendChild(eventSelect);
        div.appendChild(speedSelect);
        div.appendChild(removeBtn);
        rulesContainer.appendChild(div);
    }

    addRuleBtn.addEventListener('click', () => createRuleRow());
    addSiteRuleBtn.addEventListener('click', () => createSiteRuleRow());

    smartSkipToggle.addEventListener('change', updateSkipEnabled);
    loopToggle.addEventListener('change', updateLoopEnabled);

    chrome.storage.sync.get({ customSpeedRules: [], skipDelay: 0, smartSkipEnabled: false, keyDelay: 2, loopingEnabled: false, loopReset: 10, loopHold: 5, loopFollow: true, siteRules: {} }, data => {
        const rules = data.customSpeedRules;
        if (rules.length === 0) {
            createRuleRow();
        } else {
            rules.forEach(r => createRuleRow(r));
        }

        smartSkipToggle.checked = data.smartSkipEnabled;
        skipDelayInput.value = data.skipDelay || 0;
        keyDelayInput.value = data.keyDelay ?? 2;
        loopToggle.checked = data.loopingEnabled;
        loopResetInput.value = data.loopReset ?? 10;
        loopHoldInput.value = data.loopHold ?? 5;
        loopFollowToggle.checked = data.loopFollow ?? true;
        if (Object.keys(data.siteRules).length === 0) {
            createSiteRuleRow();
        } else {
            Object.entries(data.siteRules).forEach(([url, cfg]) => {
                createSiteRuleRow({ url, speed: cfg.speed, disabled: cfg.disabled });
            });
        }
        updateSkipEnabled();
        updateLoopEnabled();
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

        const enabled = smartSkipToggle.checked;
        const loopingEnabled = loopToggle.checked;

        const siteRules = {};
        siteRulesContainer.querySelectorAll('.rule').forEach(div => {
            const [urlInput, speedSelect, disableCheck] = div.querySelectorAll('input, select');
            const url = urlInput.value.trim();
            if (url) {
                siteRules[url] = { speed: speedSelect.value, disabled: disableCheck.checked };
            }
        });

        chrome.storage.sync.set({ customSpeedRules: rules, skipDelay: delay, smartSkipEnabled: enabled, keyDelay, loopingEnabled, loopReset: parseFloat(loopResetInput.value) || 10, loopHold: parseFloat(loopHoldInput.value) || 5, loopFollow: loopFollowToggle.checked, siteRules }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        customSpeedRules: rules,
                        skipDelay: enabled ? delay : 0,
                        smartSkipEnabled: enabled,
                        keyDelay,
                        loopingEnabled,
                        loopReset: parseFloat(loopResetInput.value) || 10,
                        loopHold: parseFloat(loopHoldInput.value) || 5,
                        loopFollow: loopFollowToggle.checked,
                        siteRules
                    });
                }
            });
            alert('Settings saved');
        });
    });
});
