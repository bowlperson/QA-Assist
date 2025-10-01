document.addEventListener("DOMContentLoaded", () => {
    const overrideContainer = document.getElementById("overrideContainer");
    const overrideEmpty = document.getElementById("overrideEmpty");
    const overrideCount = document.getElementById("overrideCount");

    const nameInput = document.getElementById("overrideName");
    const patternInput = document.getElementById("overridePattern");
    const speedSelect = document.getElementById("overrideSpeed");
    const keySelect = document.getElementById("overrideKey");
    const enableScanningToggle = document.getElementById("overrideEnableScanning");
    const speedToggle = document.getElementById("overrideSpeedToggle");
    const keyToggle = document.getElementById("overrideKeyToggle");
    const autoPressToggle = document.getElementById("overrideAutoPress");
    const eyeTrackerToggle = document.getElementById("overrideEyeTracker");
    const createButton = document.getElementById("createOverride");
    const clearButton = document.getElementById("clearOverrideForm");

    const editModal = document.getElementById("editModal");
    const editNameInput = document.getElementById("editName");
    const editPatternInput = document.getElementById("editPattern");
    const editSpeedSelect = document.getElementById("editSpeed");
    const editKeySelect = document.getElementById("editKey");
    const editEnableScanningToggle = document.getElementById("editEnableScanning");
    const editSpeedToggle = document.getElementById("editSpeedToggle");
    const editKeyToggle = document.getElementById("editKeyToggle");
    const editAutoPressToggle = document.getElementById("editAutoPress");
    const editEyeTrackerToggle = document.getElementById("editEyeTracker");
    const saveEditButton = document.getElementById("saveEdit");
    const cancelEditButton = document.getElementById("cancelEdit");
    const editCloseButton = document.getElementById("editClose");

    const toast = document.getElementById("overrideToast");
    const confirmModal = document.getElementById("overrideConfirmModal");
    const confirmMessage = document.getElementById("overrideConfirmMessage");
    const confirmAcceptButton = document.getElementById("overrideConfirmAccept");
    const confirmCancelButton = document.getElementById("overrideConfirmCancel");

    let overrides = [];
    let editingId = null;
    let toastTimeout = null;
    let pendingDeleteId = null;

    function generateId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `override-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    function normalizePattern(pattern) {
        if (!pattern) {
            return "";
        }

        let cleaned = pattern.trim().toLowerCase();
        cleaned = cleaned.replace(/^https?:\/\//, "");
        cleaned = cleaned.replace(/\/$/, "");
        cleaned = cleaned.replace(/:.*/, "");
        return cleaned;
    }

    function showToast(message) {
        if (!toast) {
            return;
        }
        toast.textContent = message;
        toast.classList.add("show");

        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toastTimeout = setTimeout(() => {
            toast.classList.remove("show");
        }, 2200);
    }

    function broadcastOverrides() {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, { siteOverrides: overrides }, () => chrome.runtime.lastError);
            });
        });
    }

    function saveOverrides() {
        chrome.storage.local.set({ siteOverrides: overrides }, () => {
            broadcastOverrides();
        });
    }

    function clearForm() {
        nameInput.value = "";
        patternInput.value = "";
        speedSelect.value = "1";
        keySelect.value = "ArrowDown";
        enableScanningToggle.checked = false;
        speedToggle.checked = false;
        keyToggle.checked = false;
        autoPressToggle.checked = false;
        eyeTrackerToggle.checked = false;
        updateFormStates();
    }

    function updateFormStates() {
        speedSelect.disabled = !speedToggle.checked;
        speedSelect.style.opacity = speedToggle.checked ? "1" : "0.55";
        keySelect.disabled = !keyToggle.checked;
        keySelect.style.opacity = keyToggle.checked ? "1" : "0.55";

        editSpeedSelect.disabled = !editSpeedToggle.checked;
        editSpeedSelect.style.opacity = editSpeedToggle.checked ? "1" : "0.55";
        editKeySelect.disabled = !editKeyToggle.checked;
        editKeySelect.style.opacity = editKeyToggle.checked ? "1" : "0.55";
    }

    function renderOverrides() {
        overrideContainer.innerHTML = "";
        overrideCount.textContent = `${overrides.length} override${overrides.length === 1 ? "" : "s"}`;

        if (!overrides.length) {
            overrideContainer.appendChild(overrideEmpty);
            overrideEmpty.style.display = "block";
            return;
        }

        overrideEmpty.style.display = "none";

        overrides
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((override) => {
                const card = document.createElement("div");
                card.className = "override-card";

                const header = document.createElement("header");
                const title = document.createElement("h3");
                title.textContent = override.name;

                const statusChip = document.createElement("span");
                statusChip.className = `chip ${override.enableScanning ? "success" : "warning"}`;
                statusChip.textContent = override.enableScanning ? "Scanning On" : "Manual Activation";

                header.appendChild(title);
                header.appendChild(statusChip);

                const settings = document.createElement("div");
                settings.className = "settings-list";
                settings.innerHTML = `
                    <div><strong>Pattern:</strong>${override.pattern}</div>
                    <div><strong>Playback:</strong>${override.overridePlaybackSpeed ? `${override.playbackSpeed}x` : "Inherit global"}</div>
                    <div><strong>Key:</strong>${override.overridePressKey ? override.pressKey : "Inherit global"}</div>
                    <div><strong>Auto Press Next:</strong>${override.autoPressNext ? "Enabled" : "Disabled"}</div>
                    <div><strong>Eye Tracker:</strong>${override.removeEyeTracker ? "Removed" : "Leave default"}</div>
                `;

                const actions = document.createElement("div");
                actions.className = "actions";

                const editButton = document.createElement("button");
                editButton.className = "ghost";
                editButton.textContent = "Edit";
                editButton.addEventListener("click", () => openEditModal(override.id));

                const deleteButton = document.createElement("button");
                deleteButton.className = "danger";
                deleteButton.textContent = "Delete";
                deleteButton.addEventListener("click", () => deleteOverride(override.id));

                actions.appendChild(editButton);
                actions.appendChild(deleteButton);

                card.appendChild(header);
                card.appendChild(settings);
                card.appendChild(actions);

                overrideContainer.appendChild(card);
            });
    }

    function closeConfirmModal() {
        if (!confirmModal) {
            return;
        }
        confirmModal.classList.remove("show");
        pendingDeleteId = null;
    }

    function openConfirmModal(message) {
        if (!confirmModal) {
            return;
        }

        if (confirmMessage) {
            confirmMessage.textContent = message;
        }

        confirmModal.classList.add("show");
        setTimeout(() => confirmAcceptButton && confirmAcceptButton.focus(), 100);
    }

    function deleteOverride(id) {
        const override = overrides.find((entry) => entry.id === id);
        if (!override) {
            return;
        }

        pendingDeleteId = id;
        const message = override.name
            ? `Remove override "${override.name}"?`
            : "Remove this override?";
        openConfirmModal(message);
    }

    function collectFormData(inputs) {
        const { nameField, patternField, speedField, keyField, enableField, speedOverrideField, keyOverrideField, autoPressField, eyeTrackerField } = inputs;

        const name = nameField.value.trim();
        const pattern = normalizePattern(patternField.value);

        if (!name || !pattern) {
            showToast("Provide both a name and pattern.");
            return null;
        }

        const overridePlaybackSpeed = speedOverrideField.checked;
        const overridePressKey = keyOverrideField.checked;

        return {
            name,
            pattern,
            overridePlaybackSpeed,
            playbackSpeed: speedField.value,
            overridePressKey,
            pressKey: keyField.value,
            enableScanning: enableField.checked,
            autoPressNext: autoPressField.checked,
            removeEyeTracker: eyeTrackerField.checked,
        };
    }

    function createOverride() {
        const data = collectFormData({
            nameField: nameInput,
            patternField: patternInput,
            speedField: speedSelect,
            keyField: keySelect,
            enableField: enableScanningToggle,
            speedOverrideField: speedToggle,
            keyOverrideField: keyToggle,
            autoPressField: autoPressToggle,
            eyeTrackerField: eyeTrackerToggle,
        });

        if (!data) {
            return;
        }

        const duplicate = overrides.some((override) => override.pattern === data.pattern);
        if (duplicate) {
            showToast("An override for this pattern already exists.");
            return;
        }

        overrides.push({ id: generateId(), ...data });
        saveOverrides();
        renderOverrides();
        clearForm();
        showToast("Override added");
    }

    function openEditModal(id) {
        const override = overrides.find((entry) => entry.id === id);
        if (!override) {
            return;
        }

        editingId = id;
        editNameInput.value = override.name;
        editPatternInput.value = override.pattern;
        editSpeedSelect.value = override.playbackSpeed || "1";
        editKeySelect.value = override.pressKey || "ArrowDown";
        editEnableScanningToggle.checked = !!override.enableScanning;
        editSpeedToggle.checked = !!override.overridePlaybackSpeed;
        editKeyToggle.checked = !!override.overridePressKey;
        editAutoPressToggle.checked = !!override.autoPressNext;
        editEyeTrackerToggle.checked = !!override.removeEyeTracker;
        updateFormStates();
        editModal.classList.add("show");
    }

    function closeEditModal() {
        editModal.classList.remove("show");
        editingId = null;
    }

    function saveEdit() {
        if (!editingId) {
            closeEditModal();
            return;
        }

        const override = overrides.find((entry) => entry.id === editingId);
        if (!override) {
            closeEditModal();
            return;
        }

        const data = collectFormData({
            nameField: editNameInput,
            patternField: editPatternInput,
            speedField: editSpeedSelect,
            keyField: editKeySelect,
            enableField: editEnableScanningToggle,
            speedOverrideField: editSpeedToggle,
            keyOverrideField: editKeyToggle,
            autoPressField: editAutoPressToggle,
            eyeTrackerField: editEyeTrackerToggle,
        });

        if (!data) {
            return;
        }

        const duplicate = overrides.some((entry) => entry.id !== editingId && entry.pattern === data.pattern);
        if (duplicate) {
            showToast("Another override already uses this pattern.");
            return;
        }

        Object.assign(override, data);
        saveOverrides();
        renderOverrides();
        closeEditModal();
        showToast("Override updated");
    }


    function attachToggleListeners() {
        [speedToggle, editSpeedToggle].forEach((toggle) => {
            toggle.addEventListener("change", updateFormStates);
        });
        [keyToggle, editKeyToggle].forEach((toggle) => {
            toggle.addEventListener("change", updateFormStates);
        });
    }

    patternInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            createOverride();
        }
    });

    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            createOverride();
        }
    });

    createButton.addEventListener("click", createOverride);
    clearButton.addEventListener("click", clearForm);
    cancelEditButton.addEventListener("click", closeEditModal);
    if (editCloseButton) {
        editCloseButton.addEventListener("click", closeEditModal);
    }
    saveEditButton.addEventListener("click", saveEdit);

    if (confirmAcceptButton) {
        confirmAcceptButton.addEventListener("click", () => {
            if (!pendingDeleteId) {
                closeConfirmModal();
                return;
            }

            const index = overrides.findIndex((override) => override.id === pendingDeleteId);
            if (index !== -1) {
                overrides.splice(index, 1);
                saveOverrides();
                renderOverrides();
                showToast("Override removed");
            }

            closeConfirmModal();
        });
    }

    if (confirmCancelButton) {
        confirmCancelButton.addEventListener("click", () => {
            closeConfirmModal();
        });
    }

    editModal.addEventListener("click", (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    });

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

        if (confirmModal && confirmModal.classList.contains("show")) {
            closeConfirmModal();
            return;
        }

        if (editModal.classList.contains("show")) {
            closeEditModal();
        }
    });

    attachToggleListeners();
    updateFormStates();

    chrome.storage.local.get("siteOverrides", (data) => {
        overrides = Array.isArray(data.siteOverrides) ? data.siteOverrides : [];
        renderOverrides();
    });
});
