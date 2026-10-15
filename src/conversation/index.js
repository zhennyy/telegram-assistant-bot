// Разговор с Claude: сообщение пользователя → история + память → ответ Claude → история
import { addHistoryMessage, deleteHistoryMessage, getRecentHistory, trimHistory } from '../history/index.js';
import { getFacts } from '../memory/index.js';
import { askClaude, buildSystemPrompt } from '../claude/index.js';

export const MAX_MESSAGE_LENGTH = 4000;

// Возвращает текст ответа или null, если Claude ответил пустотой.
// Ошибку запроса к Claude пробрасывает дальше — сообщение пользователя при этом остаётся в истории.
export async function answerMessage(chatId, text) {
  const userMessage = await addHistoryMessage(chatId, 'user', text.slice(0, MAX_MESSAGE_LENGTH));
  await trimHistory(chatId);
  const [history, facts] = await Promise.all([getRecentHistory(chatId), getFacts(chatId)]);

  const reply = await askClaude(buildSystemPrompt(facts), history);

  if (!reply.trim()) {
    // пустой ответ не сохраняем — иначе история сломается
    await deleteHistoryMessage(userMessage.id);
    return null;
  }
  await addHistoryMessage(chatId, 'assistant', reply);
  await trimHistory(chatId);
  return reply;
}
