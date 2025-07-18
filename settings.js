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

    addRuleBtn.addEventListener('click', () => createRuleRow());

    chrome.storage.sync.get({ customSpeedRules: [] }, data => {
        const rules = data.customSpeedRules;
        if (rules.length === 0) {
            createRuleRow();
        } else {
            rules.forEach(r => createRuleRow(r));
        }
    });

    saveBtn.addEventListener('click', () => {
        const rules = [];
        rulesContainer.querySelectorAll('.rule').forEach(div => {
            const [eventSelect, speedSelect] = div.querySelectorAll('select');
            rules.push({ eventType: eventSelect.value, speed: speedSelect.value });
        });
        chrome.storage.sync.set({ customSpeedRules: rules }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { customSpeedRules: rules });
                }
            });
            alert('Settings saved');
        });
    });
});
