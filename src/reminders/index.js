// Напоминания: { code, chat_id, time: 'ЧЧ:ММ', text }.
// Срабатывают один раз (в ближайшее совпадение времени), затем удаляются.
import { database, runInTransaction } from '../database/index.js';
import { createCode } from '../codes/index.js';

export const MAX_REMINDERS = 100;
export const MAX_REMINDER_LENGTH = 500;

export function getReminders(chatId) {
  return database.reminder.findMany({ where: { chat_id: chatId }, orderBy: { id: 'asc' } });
}

export function countReminders(chatId) {
  return database.reminder.count({ where: { chat_id: chatId } });
}

export function addReminder(chatId, time, text) {
  return database.reminder.create({ data: { chat_id: chatId, code: createCode(), time, text } });
}

// true — напоминание было и отменено, false — такого номера нет у этого чата
export async function cancelReminder(chatId, code) {
  const { count } = await database.reminder.deleteMany({ where: { chat_id: chatId, code } });
  return count > 0;
}

// Забираем напоминания на это время и сразу удаляем их из базы — каждое отправится ровно один раз
export function takeDueReminders(currentTime) {
  return runInTransaction(async () => {
    const dueReminders = await database.reminder.findMany({ where: { time: currentTime }, orderBy: { id: 'asc' } });
    if (dueReminders.length) {
      await database.reminder.deleteMany({ where: { id: { in: dueReminders.map((reminder) => reminder.id) } } });
    }
    return dueReminders;
  });
}

// Текущее время сервера в формате 'ЧЧ:ММ'
export const formatTime = (date = new Date()) => date.toTimeString().slice(0, 5);
