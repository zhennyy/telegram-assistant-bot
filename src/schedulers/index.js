// Фоновые задачи: каждую минуту проверяем, не пора ли отправить напоминание
import cron from 'node-cron';
import { formatTime, takeDueReminders } from '../reminders/index.js';
import { sendText } from '../bot/send.js';

export async function sendDueReminders(telegram, now = new Date()) {
  try {
    const dueReminders = await takeDueReminders(formatTime(now));
    for (const reminder of dueReminders) {
      await sendText(telegram, reminder.chat_id, `⏰ Напоминание: ${reminder.text}`);
    }
  } catch (reminderError) {
    console.error('Напоминания:', reminderError.message);
  }
}

// Возвращает функцию остановки — без неё cron не даст процессу завершиться
export function startSchedulers(telegram) {
  const reminderTask = cron.schedule('* * * * *', () => sendDueReminders(telegram));
  return () => reminderTask.stop();
}
