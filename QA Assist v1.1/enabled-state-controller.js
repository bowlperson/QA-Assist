(function (global, factory) {
    if (typeof module === "object" && typeof module.exports !== "undefined") {
        module.exports = factory();
    } else {
        global.EnabledStateController = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {
    function normalizeBoolean(value, fallback) {
        if (value === true || value === "true" || value === 1 || value === "1") {
            return true;
        }

        if (value === false || value === "false" || value === 0 || value === "0") {
            return false;
        }

        return Boolean(fallback);
    }

    function createEnabledStateController(chromeApi) {
        if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local) {
            throw new Error("A chrome.storage.local implementation is required");
        }

        let currentState = false;
        let hasLoaded = false;
        let loadPromise = null;
        const listeners = new Set();

        function ensureLoaded() {
            if (hasLoaded) {
                return Promise.resolve(currentState);
            }

            if (loadPromise) {
                return loadPromise;
            }

            loadPromise = new Promise((resolve) => {
                chromeApi.storage.local.get({ enabled: false }, (data) => {
                    if (chromeApi.runtime && chromeApi.runtime.lastError) {
                        console.error("Failed to load enabled state", chromeApi.runtime.lastError);
                    }

                    currentState = normalizeBoolean(data.enabled, false);
                    hasLoaded = true;
                    resolve(currentState);
                });
            });

            return loadPromise;
        }

        function notifyListeners(state) {
            listeners.forEach((listener) => {
                try {
                    listener(state);
                } catch (error) {
                    console.error("Enabled state listener failed", error);
                }
            });
        }

        function setState(nextState) {
            return ensureLoaded().then(
                () =>
                    new Promise((resolve, reject) => {
                        const normalized = normalizeBoolean(nextState, false);

                        if (normalized === currentState && hasLoaded) {
                            resolve(currentState);
                            return;
                        }

                        const previousState = currentState;
                        currentState = normalized;

                        chromeApi.storage.local.set({ enabled: normalized }, () => {
                            if (chromeApi.runtime && chromeApi.runtime.lastError) {
                                console.error("Failed to persist enabled state", chromeApi.runtime.lastError);
                                currentState = previousState;
                                reject(chromeApi.runtime.lastError);
                                return;
                            }

                            hasLoaded = true;
                            notifyListeners(normalized);
                            resolve(normalized);
                        });
                    }),
            );
        }

        function getState() {
            return ensureLoaded().then(() => currentState);
        }

        function onChange(listener) {
            if (typeof listener !== "function") {
                return () => {};
            }

            listeners.add(listener);
            return () => listeners.delete(listener);
        }

        function handleStorageChange(changes, areaName) {
            if (areaName !== "local" || !changes || !Object.prototype.hasOwnProperty.call(changes, "enabled")) {
                return;
            }

            const newState = normalizeBoolean(changes.enabled.newValue, false);

            if (newState === currentState && hasLoaded) {
                return;
            }

            currentState = newState;
            hasLoaded = true;
            notifyListeners(newState);
        }

        function getCurrentState() {
            return currentState;
        }

        return {
            ensureLoaded,
            getState,
            setState,
            onChange,
            handleStorageChange,
            getCurrentState,
        };
    }

    return { createEnabledStateController, normalizeBoolean };
});
