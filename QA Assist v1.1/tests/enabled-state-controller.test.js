const assert = require("assert");

const { createEnabledStateController, normalizeBoolean } = require("../enabled-state-controller.js");

function createChromeStub(initialEnabled) {
    const state = {
        enabled: initialEnabled,
    };

    const chromeStub = {
        storage: {
            local: {
                get(defaults, callback) {
                    setTimeout(() => {
                        const result = { ...defaults };
                        if (state.enabled !== undefined) {
                            result.enabled = state.enabled;
                        }
                        callback(result);
                    }, 0);
                },
                set(values, callback) {
                    setTimeout(() => {
                        if (Object.prototype.hasOwnProperty.call(values, "enabled")) {
                            state.enabled = values.enabled;
                        }
                        callback();
                    }, 0);
                },
            },
        },
        runtime: {
            lastError: null,
        },
        tabs: {
            query(_, callback) {
                if (typeof callback === "function") {
                    callback([]);
                }
            },
            sendMessage() {},
        },
        browserAction: {
            setIcon() {},
        },
    };

    return { chromeStub, state };
}

async function runTests() {
    assert.strictEqual(normalizeBoolean(true, false), true, "normalizeBoolean should keep true");
    assert.strictEqual(normalizeBoolean("true", false), true, "normalizeBoolean should coerce string true");
    assert.strictEqual(normalizeBoolean(0, true), false, "normalizeBoolean should coerce zero to false");
    assert.strictEqual(normalizeBoolean(undefined, true), true, "normalizeBoolean should fallback when undefined");

    const { chromeStub, state } = createChromeStub(undefined);

    const controller = createEnabledStateController(chromeStub);

    let listenerCalls = 0;
    controller.onChange((enabled) => {
        listenerCalls += 1;
        assert.strictEqual(typeof enabled, "boolean", "listener should receive boolean state");
    });

    const initial = await controller.getState();
    assert.strictEqual(initial, false, "default state should be false when unset");

    const updated = await controller.setState(true);
    assert.strictEqual(updated, true, "setState should resolve with the new value");
    assert.strictEqual(state.enabled, true, "chrome.storage.local should be updated with new state");
    assert.strictEqual(listenerCalls, 1, "listener should be notified once after state change");

    await controller.setState(true);
    assert.strictEqual(listenerCalls, 1, "setting the same state should not re-notify listeners");

    state.enabled = false;
    controller.handleStorageChange({ enabled: { newValue: false } }, "local");
    assert.strictEqual(await controller.getState(), false, "state should update after external storage change");
    assert.strictEqual(listenerCalls, 2, "external change should notify listeners");

    controller.handleStorageChange({ enabled: { newValue: false } }, "local");
    assert.strictEqual(listenerCalls, 2, "duplicate storage change should be ignored");

    console.log("All enabled state controller tests passed");
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
