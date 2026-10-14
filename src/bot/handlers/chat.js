// Обычный текст (не команда) — в Claude, ответ — обратно в чат
import { replyText } from '../send.js';
import { answerMessage } from '../../conversation/index.js';

export async function chatWithClaude(context) {
  const chatId = context.chat.id;
  context.telegram.sendChatAction(chatId, 'typing').catch(() => {});
  try {
    const reply = await answerMessage(chatId, context.message.text);
    await replyText(context, reply ?? 'Claude ничего не ответил 🤷 Попробуй переформулировать.');
  } catch (claudeError) {
    console.error('Ошибка запроса к Claude:', claudeError.status || claudeError.message);
    await replyText(context, 'Упс, что-то пошло не так при обращении к Claude. Попробуй ещё раз чуть позже.');
  }
}
