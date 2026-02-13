document.addEventListener("DOMContentLoaded", () => {
    CardCollapseState?.initCardCollapseState?.("siteInfo");
    const siteTableBody = document.getElementById("siteTableBody");
    const siteCount = document.getElementById("siteCount");
    const siteNameInput = document.getElementById("siteNameInput");
    const siteAddressInput = document.getElementById("siteAddressInput");
    const addSiteButton = document.getElementById("addSite");
    const clearFormButton = document.getElementById("clearForm");
    const toast = document.getElementById("toast");

    let sites = [];
    let toastTimeout = null;

    function generateId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `site-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    function deriveMatchValue(address) {
        if (!address) {
            return "";
        }

        let cleaned = address.trim();
        cleaned = cleaned.replace(/[()]/g, "");

        if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
            try {
                const url = new URL(cleaned);
                return url.hostname.toLowerCase();
            } catch (error) {
                cleaned = cleaned.replace(/^https?:\/\//, "");
            }
        }

        cleaned = cleaned.replace(/^https?:\/\//, "");
        cleaned = cleaned.replace(/\/$/, "");
        cleaned = cleaned.replace(/:.*/, "");

        return cleaned.toLowerCase();
    }

    function ensureSiteShape(site) {
        if (!site) {
            return null;
        }

        const shaped = { ...site };
        shaped.id = shaped.id || generateId();
        shaped.name = (shaped.name || "").trim();
        shaped.address = (shaped.address || "").trim();
        shaped.matchValue = (shaped.matchValue || deriveMatchValue(shaped.address || shaped.name)).trim();
        return shaped.matchValue ? shaped : null;
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

    function saveSites() {
        chrome.storage.local.set({ siteInfo: sites });
    }

    function resetForm() {
        siteNameInput.value = "";
        siteAddressInput.value = "";
    }

    function renderSites() {
        siteTableBody.innerHTML = "";
        siteCount.textContent = `${sites.length} site${sites.length === 1 ? "" : "s"}`;

        if (!sites.length) {
            const emptyRow = document.createElement("tr");
            emptyRow.className = "empty-state";
            const cell = document.createElement("td");
            cell.colSpan = 4;
            cell.textContent = "No sites have been added yet.";
            emptyRow.appendChild(cell);
            siteTableBody.appendChild(emptyRow);
            return;
        }

        sites
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((site) => {
                const row = document.createElement("tr");
                row.dataset.id = site.id;

                const nameCell = document.createElement("td");
                nameCell.innerHTML = `<div>${site.name}</div><div class="muted">ID: ${site.matchValue}</div>`;

                const addressCell = document.createElement("td");
                addressCell.textContent = site.address;

                const matchCell = document.createElement("td");
                matchCell.textContent = site.matchValue;

                const actionsCell = document.createElement("td");
                actionsCell.className = "actions";

                const editButton = document.createElement("button");
                editButton.className = "ghost";
                editButton.textContent = "Edit";
                editButton.addEventListener("click", () => enterEditMode(row, site));

                const deleteButton = document.createElement("button");
                deleteButton.className = "danger";
                deleteButton.textContent = "Delete";
                deleteButton.addEventListener("click", () => deleteSite(site.id));

                actionsCell.appendChild(editButton);
                actionsCell.appendChild(deleteButton);

                row.appendChild(nameCell);
                row.appendChild(addressCell);
                row.appendChild(matchCell);
                row.appendChild(actionsCell);

                siteTableBody.appendChild(row);
            });
    }

    function deleteSite(id) {
        const index = sites.findIndex((site) => site.id === id);
        if (index === -1) {
            return;
        }

        sites.splice(index, 1);
        saveSites();
        renderSites();
        showToast("Site removed");
    }

    function enterEditMode(row, site) {
        row.innerHTML = "";

        const nameCell = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = site.name;
        nameCell.appendChild(nameInput);

        const addressCell = document.createElement("td");
        const addressInput = document.createElement("input");
        addressInput.type = "text";
        addressInput.value = site.address;
        addressCell.appendChild(addressInput);

        const matchCell = document.createElement("td");
        matchCell.textContent = site.matchValue;

        const actionsCell = document.createElement("td");
        actionsCell.className = "actions";

        const saveButton = document.createElement("button");
        saveButton.className = "primary";
        saveButton.textContent = "Save";
        saveButton.addEventListener("click", () => {
            const newName = nameInput.value.trim();
            const newAddress = addressInput.value.trim();

            if (!newName || !newAddress) {
                showToast("Provide both a name and address.");
                return;
            }

            const newMatchValue = deriveMatchValue(newAddress) || deriveMatchValue(newName);
            if (!newMatchValue) {
                showToast("Unable to derive a match value from the address.");
                return;
            }

            const duplicate = sites.some((entry) => entry.id !== site.id && entry.matchValue === newMatchValue);
            if (duplicate) {
                showToast("Another site already uses this address.");
                return;
            }

            site.name = newName;
            site.address = newAddress;
            site.matchValue = newMatchValue;

            saveSites();
            renderSites();
            showToast("Site updated");
        });

        const cancelButton = document.createElement("button");
        cancelButton.className = "ghost";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => renderSites());

        actionsCell.appendChild(saveButton);
        actionsCell.appendChild(cancelButton);

        row.appendChild(nameCell);
        row.appendChild(addressCell);
        row.appendChild(matchCell);
        row.appendChild(actionsCell);

        nameInput.focus();
    }

    function addSite() {
        const name = siteNameInput.value.trim();
        const address = siteAddressInput.value.trim();

        if (!name || !address) {
            showToast("Provide both a name and address.");
            return;
        }

        const matchValue = deriveMatchValue(address) || deriveMatchValue(name);
        if (!matchValue) {
            showToast("Unable to derive a match value from the address.");
            return;
        }

        const duplicate = sites.some((site) => site.matchValue === matchValue);
        if (duplicate) {
            showToast("A site with this address already exists.");
            return;
        }

        const newSite = ensureSiteShape({ id: generateId(), name, address, matchValue });
        if (!newSite) {
            showToast("The entry could not be created.");
            return;
        }

        sites.push(newSite);
        saveSites();
        renderSites();
        resetForm();
        showToast("Site added");
    }

    addSiteButton.addEventListener("click", addSite);
    siteAddressInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addSite();
        }
    });

    siteNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addSite();
        }
    });

    clearFormButton.addEventListener("click", () => {
        resetForm();
    });

    chrome.storage.local.get("siteInfo", (data) => {
        const loadedSites = Array.isArray(data.siteInfo) ? data.siteInfo : [];
        sites = loadedSites
            .map((site) => ensureSiteShape(site))
            .filter(Boolean);
        renderSites();
    });
});
