(function initCardCollapseNamespace(global) {
    const STORAGE_KEY = "cardCollapseState";

    function normalizeId(card, index) {
        return card.dataset.collapseId || card.id || `card-${index}`;
    }

    function updateToggle(button, collapsed) {
        if (!button) {
            return;
        }
        button.textContent = collapsed ? "+" : "−";
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        button.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");
    }

    function initCardCollapseState(pageKey) {
        const cards = Array.from(document.querySelectorAll(".page-card"));
        if (!cards.length || !chrome?.storage?.local) {
            return;
        }

        chrome.storage.local.get({ [STORAGE_KEY]: {} }, (data) => {
            const allState = data[STORAGE_KEY] || {};
            const pageState = allState[pageKey] || {};

            cards.forEach((card, index) => {
                const id = normalizeId(card, index);
                const toggle = card.querySelector(".collapse-toggle");
                if (!toggle) {
                    return;
                }

                const shouldCollapse = Boolean(pageState[id]);
                card.classList.toggle("collapsed", shouldCollapse);
                updateToggle(toggle, shouldCollapse);

                toggle.addEventListener("click", () => {
                    const collapsed = card.classList.toggle("collapsed");
                    updateToggle(toggle, collapsed);
                    chrome.storage.local.get({ [STORAGE_KEY]: {} }, (stateData) => {
                        const next = stateData[STORAGE_KEY] || {};
                        const nextPage = { ...(next[pageKey] || {}) };
                        nextPage[id] = collapsed;
                        next[pageKey] = nextPage;
                        chrome.storage.local.set({ [STORAGE_KEY]: next });
                    });
                });
            });
        });
    }

    global.CardCollapseState = { initCardCollapseState, updateToggle };
})(typeof window !== "undefined" ? window : globalThis);
