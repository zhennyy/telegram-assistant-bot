// Постоянная память: /remember, /memory, /forget
import { replyText } from '../send.js';
import { MAX_FACTS, MAX_FACT_LENGTH, addFact, countFacts, deleteFact, getFacts } from '../../memory/index.js';

async function rememberFact(context, commandMatch) {
  const chatId = context.chat.id;
  const text = commandMatch[1].trim().slice(0, MAX_FACT_LENGTH);
  if ((await countFacts(chatId)) >= MAX_FACTS) {
    return replyText(context, `В памяти уже ${MAX_FACTS} фактов — удали лишние через /forget`);
  }
  const fact = await addFact(chatId, text);
  return replyText(context, `Запомнила ✅ (номер: ${fact.code})`);
}

async function showMemory(context) {
  const facts = await getFacts(context.chat.id);
  if (facts.length === 0) return replyText(context, 'Пока ничего не сохранено. Добавь через /remember текст.');
  const factList = facts.map((fact) => `${fact.code} — ${fact.text}`).join('\n');
  return replyText(context, `Сохранено в памяти:\n${factList}`);
}

async function forgetFact(context, commandMatch) {
  const isDeleted = await deleteFact(context.chat.id, commandMatch[1]);
  return replyText(context, isDeleted ? 'Забыла ✅' : 'Не нашла факт с таким номером. Посмотри /memory.');
}

export const memoryCommands = [
  { pattern: /^\/remember (.+)$/s, handle: rememberFact },
  { pattern: /^\/memory\b/, handle: showMemory },
  { pattern: /^\/forget (\S+)$/, handle: forgetFact },
];
