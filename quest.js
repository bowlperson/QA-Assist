// Quest management module for QA-Assist

class Quest {
    constructor(name, dueDate, options = {}) {
        this.name = name;
        this.dueDate = new Date(dueDate);
        this.repeatable = options.repeatable || false;
        this.frequency = options.frequency || null; // 'daily', 'weekly', 'monthly', 'infinite'
        this.repeatLimit = options.repeatLimit || null; // number of repeats before ending
        this.repeatCount = 0;
        this.active = true; // inactive when repeat limit reached or disabled
        this.xp = options.xp || 100; // default XP value
    }

    complete(currentDate = new Date()) {
        if (!this.active) return;
        // Apply overdue penalty before completion
        this.applyOverduePenalty(currentDate);

        if (this.repeatable && this.active) {
            this.repeatCount += 1;
            if (this.repeatLimit !== null && this.repeatCount >= this.repeatLimit) {
                this.active = false;
                return;
            }
            if (this.frequency !== 'infinite') {
                this.dueDate = this.calculateNextDueDate();
            }
        } else {
            this.active = false; // non-repeatable quest ends on completion
        }
    }

    calculateNextDueDate() {
        const date = new Date(this.dueDate);
        switch (this.frequency) {
            case 'daily':
                date.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                const day = this.dueDate.getDate();
                date.setDate(1); // avoid overflow
                date.setMonth(date.getMonth() + 1);
                const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                date.setDate(Math.min(day, daysInMonth));
                break;
            case 'infinite':
                // no due date change
                break;
            default:
                break;
        }
        return date;
    }

    editDueDate(newDate) {
        this.dueDate = new Date(newDate);
        // Reset repeat count to recalc from new date
        this.repeatCount = 0;
    }

    applyOverduePenalty(currentDate = new Date()) {
        if (!this.active) return;
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysOverdue = Math.floor((currentDate - this.dueDate) / msPerDay);
        if (daysOverdue >= 0) {
            // base 30% reduction, +5% for each additional day
            let penalty = 0.30 + Math.max(0, daysOverdue) * 0.05;
            if (penalty > 1) penalty = 1;
            this.xp = Math.round(this.xp * (1 - penalty));
            if (penalty >= 1) {
                this.active = false; // auto disable if 100% penalty
            }
        }
    }
}

module.exports = { Quest };
