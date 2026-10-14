// Постоянная память — факты, которые не пропадают даже после /reset
import { database } from '../database/index.js';
import { createCode } from '../codes/index.js';

export const MAX_FACTS = 100;
export const MAX_FACT_LENGTH = 500;

export function getFacts(chatId) {
  return database.memoryFact.findMany({ where: { chat_id: chatId }, orderBy: { id: 'asc' } });
}

export function countFacts(chatId) {
  return database.memoryFact.count({ where: { chat_id: chatId } });
}

export function addFact(chatId, text) {
  return database.memoryFact.create({ data: { chat_id: chatId, code: createCode(), text } });
}

// true — факт был и удалён, false — такого номера нет
export async function deleteFact(chatId, code) {
  const { count } = await database.memoryFact.deleteMany({ where: { chat_id: chatId, code } });
  return count > 0;
}
