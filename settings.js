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
    const skipContainer = document.getElementById('skipContainer');
    const addSkipBtn = document.getElementById('addSkip');
    const saveBtn = document.getElementById('saveSettings');

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

    function createSkipRow(rule) {
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

        const delayInput = document.createElement('input');
        delayInput.type = 'number';
        delayInput.min = '0';
        delayInput.placeholder = 'sec';
        delayInput.value = rule?.seconds || 0;

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '-';
        removeBtn.className = 'remove';
        removeBtn.addEventListener('click', () => div.remove());

        div.appendChild(eventSelect);
        div.appendChild(delayInput);
        div.appendChild(removeBtn);
        skipContainer.appendChild(div);
    }

    addRuleBtn.addEventListener('click', () => createRuleRow());
    addSkipBtn.addEventListener('click', () => createSkipRow());

    chrome.storage.sync.get({ customSpeedRules: [], smartSkipRules: [] }, data => {
        const rules = data.customSpeedRules;
        if (rules.length === 0) {
            createRuleRow();
        } else {
            rules.forEach(r => createRuleRow(r));
        }

        const skips = data.smartSkipRules;
        if (skips.length === 0) {
            createSkipRow();
        } else {
            skips.forEach(s => createSkipRow(s));
        }
    });

    saveBtn.addEventListener('click', () => {
        const rules = [];
        rulesContainer.querySelectorAll('.rule').forEach(div => {
            const [eventSelect, speedSelect] = div.querySelectorAll('select');
            rules.push({ eventType: eventSelect.value, speed: speedSelect.value });
        });

        const skips = [];
        skipContainer.querySelectorAll('.rule').forEach(div => {
            const eventSelect = div.querySelector('select');
            const delayInput = div.querySelector('input');
            skips.push({ eventType: eventSelect.value, seconds: delayInput.value });
        });

        chrome.storage.sync.set({ customSpeedRules: rules, smartSkipRules: skips }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { customSpeedRules: rules, smartSkipRules: skips });
                }
            });
            alert('Settings saved');
        });
    });
});
