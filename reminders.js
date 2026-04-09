const cron = require('node-cron');
const { getPendingReminders, markReminderSent, getDueRecurring, updateRecurringNextFire, addReminder } = require('./db');

function calcNextFire(intervalType) {
  const d = new Date();
  if (intervalType === 'daily')   d.setDate(d.getDate() + 1);
  if (intervalType === 'weekly')  d.setDate(d.getDate() + 7);
  if (intervalType === 'monthly') d.setMonth(d.getMonth() + 1);
  if (intervalType === 'yearly')  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function startReminderCron(bot) {
  cron.schedule('* * * * *', async () => {
    // Jednokratni podsjetnici
    const pending = getPendingReminders();
    for (const reminder of pending) {
      try {
        await bot.telegram.sendMessage(
          reminder.user_id,
          `⏰ *Podsjetnik:* ${reminder.title}`,
          { parse_mode: 'Markdown' }
        );
        markReminderSent(reminder.id);
      } catch (err) {
        console.error(`Reminder ${reminder.id} failed:`, err.message);
      }
    }

    // Ponavljajući zadaci
    const dueRecurring = getDueRecurring();
    for (const task of dueRecurring) {
      try {
        await bot.telegram.sendMessage(
          task.user_id,
          `🔁 *Ponavljajući podsjetnik:* ${task.title}`,
          { parse_mode: 'Markdown' }
        );
        updateRecurringNextFire(task.id, calcNextFire(task.interval_type));
      } catch (err) {
        console.error(`Recurring ${task.id} failed:`, err.message);
      }
    }
  });

  console.log('✅ Reminder cron pokrenut (svake minute)');
}

module.exports = { startReminderCron };
