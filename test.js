const { Quest } = require('./quest');
const { StreakTimer, SHOP_ITEMS } = require('./shop');

// Test quest completion and due date rollover
let q1 = new Quest('Daily Quest', '2024-01-01', { repeatable: true, frequency: 'daily' });
q1.complete(new Date('2024-01-01'));
console.log('Next due date (daily):', q1.dueDate.toISOString().slice(0,10));

let q2 = new Quest('Monthly Quest', '2024-01-31', { repeatable: true, frequency: 'monthly' });
q2.complete(new Date('2024-01-31'));
console.log('Next due date (monthly rollover):', q2.dueDate.toISOString().slice(0,10));

// Test overdue penalty
let q3 = new Quest('Overdue Quest', '2024-01-01', { repeatable: false, xp: 100 });
q3.applyOverduePenalty(new Date('2024-01-03')); // 2 days overdue
console.log('XP after penalty (should be 60 or less):', q3.xp, 'Active:', q3.active);

// Test repeat limit
let q4 = new Quest('Limited Quest', '2024-01-01', { repeatable: true, frequency: 'daily', repeatLimit: 2 });
q4.complete(new Date('2024-01-01'));
q4.complete(new Date('2024-01-02'));
q4.complete(new Date('2024-01-03'));
console.log('Repeat count:', q4.repeatCount, 'Active:', q4.active);

// Test shop items
let timer = new StreakTimer();
SHOP_ITEMS.potionOfFrost.use(timer);
console.log('Timer frozen until (24h):', timer.freezeUntil.toISOString());
SHOP_ITEMS.potionOfTimeSlow.use(timer);
console.log('Timer frozen until (after 72h):', timer.freezeUntil.toISOString());

// Test editing due date
let q5 = new Quest('Edited Quest', '2024-01-01', { repeatable: true, frequency: 'daily' });
q5.editDueDate('2024-01-10');
q5.complete(new Date('2024-01-10'));
console.log('Next due date after edit:', q5.dueDate.toISOString().slice(0,10));

// Overdue disabling check
let q6 = new Quest('Long Overdue', '2024-01-01', { xp: 100 });
q6.applyOverduePenalty(new Date('2024-01-20')); // 19 days overdue -> 30% + 95% = capped at 100%
console.log('Quest active after long overdue:', q6.active, 'XP:', q6.xp);
