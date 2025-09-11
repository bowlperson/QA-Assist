// Shop items for QA-Assist

class StreakTimer {
    constructor() {
        this.freezeUntil = null;
    }

    freeze(hours) {
        const now = new Date();
        const freezeTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
        if (!this.freezeUntil || freezeTime > this.freezeUntil) {
            this.freezeUntil = freezeTime;
        }
    }

    isFrozen(currentDate = new Date()) {
        return this.freezeUntil && currentDate < this.freezeUntil;
    }
}

class ShopItem {
    constructor(name, description, cost, effect) {
        this.name = name;
        this.description = description;
        this.cost = cost;
        this.effect = effect; // function that applies the item's effect
    }

    use(target) {
        if (typeof this.effect === 'function') {
            this.effect(target);
        }
    }
}

const SHOP_ITEMS = Object.freeze({
    potionOfFrost: new ShopItem(
        'Potion of Frost',
        'Freeze Streak Timer for 24 Hours',
        300,
        (timer) => timer.freeze(24)
    ),
    potionOfTimeSlow: new ShopItem(
        'Potion of Time Slow',
        'Streak Timer is Frozen for 72 Hours',
        700,
        (timer) => timer.freeze(72)
    )
});

module.exports = { StreakTimer, ShopItem, SHOP_ITEMS };
