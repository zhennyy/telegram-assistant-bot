// История диалога с Claude: последние сообщения каждого чата
import { database } from '../database/index.js';

export const MAX_HISTORY_MESSAGES = 20; // сколько последних сообщений держать в контексте

export function addHistoryMessage(chatId, role, content) {
  return database.historyMessage.create({ data: { chat_id: chatId, role, content } });
}

export function deleteHistoryMessage(messageId) {
  return database.historyMessage.delete({ where: { id: messageId } });
}

// Последние сообщения в формате Claude API: [{ role, content }].
// Диалог для Claude должен начинаться с сообщения пользователя, поэтому ответы ассистента в начале отбрасываем.
export async function getRecentHistory(chatId) {
  const newestFirst = await database.historyMessage.findMany({
    where: { chat_id: chatId },
    orderBy: { id: 'desc' },
    take: MAX_HISTORY_MESSAGES,
  });
  const messages = newestFirst.reverse().map((message) => ({ role: message.role, content: message.content }));
  const firstUserIndex = messages.findIndex((message) => message.role === 'user');
  return firstUserIndex === -1 ? [] : messages.slice(firstUserIndex);
}

// Удаляем всё, что старше последних MAX_HISTORY_MESSAGES сообщений чата
export async function trimHistory(chatId) {
  const keptMessages = await database.historyMessage.findMany({
    where: { chat_id: chatId },
    orderBy: { id: 'desc' },
    take: MAX_HISTORY_MESSAGES,
    select: { id: true },
  });
  if (keptMessages.length < MAX_HISTORY_MESSAGES) return;
  const oldestKeptId = keptMessages.at(-1).id;
  await database.historyMessage.deleteMany({ where: { chat_id: chatId, id: { lt: oldestKeptId } } });
}

export function clearHistory(chatId) {
  return database.historyMessage.deleteMany({ where: { chat_id: chatId } });
}
