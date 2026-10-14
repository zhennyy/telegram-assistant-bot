// Отправка текста в Telegram. Ошибку отправки только пишем в лог — бот из-за неё не падает.
const TELEGRAM_MESSAGE_LIMIT = 4096;

// Длинный текст делим на части по лимиту Telegram — по возможности по переводу строки
export function splitLongText(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    const lineBreakIndex = rest.lastIndexOf('\n', limit);
    const cutIndex = lineBreakIndex > 0 ? lineBreakIndex : limit;
    parts.push(rest.slice(0, cutIndex));
    rest = rest.slice(cutIndex).replace(/^\n/, '');
  }
  parts.push(rest);
  return parts;
}

export async function sendText(telegram, chatId, text) {
  try {
    for (const part of splitLongText(text)) await telegram.sendMessage(chatId, part);
  } catch (sendError) {
    console.error('Не отправилось:', sendError.message);
  }
}

// Ответ в тот же чат, откуда пришло сообщение
export const replyText = (context, text) => sendText(context.telegram, context.chat.id, text);
