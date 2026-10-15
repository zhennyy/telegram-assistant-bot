// Общая обвязка тестов (файлы test.js рядом с кодом): временная папка данных, подставные Telegram и Claude.
// Каждый test.js запускается отдельным процессом — со своей базой.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Telegram } from 'telegraf';

export const OWNER_ID = 1001;
export const STRANGER_ID = 7392580262; // настоящие id Telegram бывают длиннее 32 бит

process.env.TELEGRAM_BOT_TOKEN = '123456:TESTTOKEN';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OWNER_ID = String(OWNER_ID);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-'));
delete process.env.TELEGRAM_API_ROOT;
delete process.env.ANTHROPIC_BASE_URL;

// ---- подставной Telegram: каждый запрос бота записываем, отвечаем как Telegram ----
export const telegramCalls = [];
let messageCounter = 5000;
Telegram.prototype.callApi = async function fakeCallApi(method, payload) {
  telegramCalls.push({ method, payload });
  if (method === 'sendMessage')
    return { message_id: ++messageCounter, chat: { id: payload.chat_id }, date: 0, text: payload.text };
  return true;
};
export const sentTo = (chatId) =>
  telegramCalls.filter((call) => call.method === 'sendMessage' && String(call.payload.chat_id) === String(chatId));
export const lastTextTo = (chatId) => sentTo(chatId).at(-1)?.payload.text;

// ---- подставной Claude: запоминаем запросы, отвечаем тем, что задал тест ----
export const claudeRequests = [];
export const claude = {
  // (request) => текст ответа; может бросить ошибку, как настоящий API
  answer: (request) => `Ответ на «${request.messages.at(-1).content}»`,
};

let started = null;
export async function start() {
  if (started) return started;
  const { initializeDatabase } = await import('../database/initialize.js');
  await initializeDatabase();
  const { anthropicClient } = await import('../claude/index.js');
  anthropicClient.messages.create = async (request) => {
    claudeRequests.push(structuredClone(request));
    return { content: [{ type: 'text', text: claude.answer(request) }] };
  };
  const { bot } = await import('./index.js');
  bot.botInfo = { id: 1, is_bot: true, first_name: 'Ассистент', username: 'assistant_test_bot' };
  const { database } = await import('../database/index.js');
  started = { bot, database };
  return started;
}

let updateCounter = 0;
// Входящее текстовое сообщение, как его присылает Telegram
export function sendText(bot, fromId, text, chatType = 'private') {
  const commandMatch = text.match(/^\/\w+/);
  return bot.handleUpdate({
    update_id: ++updateCounter,
    message: {
      message_id: updateCounter,
      date: Math.floor(Date.now() / 1000),
      text,
      from: { id: fromId, is_bot: false, first_name: 'Женя' },
      chat: chatType === 'private' ? { id: fromId, type: 'private' } : { id: -100500, type: chatType, title: 'Группа' },
      ...(commandMatch ? { entities: [{ type: 'bot_command', offset: 0, length: commandMatch[0].length }] } : {}),
    },
  });
}
