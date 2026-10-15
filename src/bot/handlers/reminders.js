// Напоминания: /remind ЧЧ:ММ текст, /reminders, /cancelremind ID
import { replyText } from '../send.js';
import {
  MAX_REMINDERS,
  MAX_REMINDER_LENGTH,
  addReminder,
  cancelReminder,
  countReminders,
  getReminders,
} from '../../reminders/index.js';

async function createReminder(context, commandMatch) {
  const chatId = context.chat.id;
  const hours = commandMatch[1].padStart(2, '0');
  const minutes = commandMatch[2];
  const text = commandMatch[3].trim().slice(0, MAX_REMINDER_LENGTH);
  if ((await countReminders(chatId)) >= MAX_REMINDERS) {
    return replyText(context, `Уже ${MAX_REMINDERS} напоминаний — отмени лишние через /cancelremind`);
  }
  if (Number(hours) > 23 || Number(minutes) > 59) {
    return replyText(context, 'Похоже, время некорректно. Формат: /remind 15:30 текст');
  }
  const reminder = await addReminder(chatId, `${hours}:${minutes}`, text);
  return replyText(context, `Готово ✅ Напомню в ${reminder.time}: «${text}» (номер: ${reminder.code})`);
}

async function showReminders(context) {
  const reminders = await getReminders(context.chat.id);
  if (reminders.length === 0) return replyText(context, 'Активных напоминаний нет.');
  const reminderList = reminders.map((reminder) => `${reminder.code} — ${reminder.time} — ${reminder.text}`).join('\n');
  return replyText(context, `Активные напоминания:\n${reminderList}`);
}

async function cancelReminderByCode(context, commandMatch) {
  const isCancelled = await cancelReminder(context.chat.id, commandMatch[1]);
  return replyText(context, isCancelled ? 'Напоминание отменено ✅' : 'Не нашла напоминание с таким номером.');
}

export const reminderCommands = [
  { pattern: /^\/remind (\d{1,2}):(\d{2}) (.+)$/s, handle: createReminder },
  { pattern: /^\/reminders\b/, handle: showReminders },
  { pattern: /^\/cancelremind (\S+)$/, handle: cancelReminderByCode },
];
