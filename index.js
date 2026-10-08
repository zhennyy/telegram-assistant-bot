import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';
import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!TELEGRAM_TOKEN || !ANTHROPIC_API_KEY) {
  console.error('Ошибка: заполни TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY в файле .env');
  process.exit(1);
}

// TELEGRAM_API_ROOT — посредник для Telegram (нужен, если сервер в России)
const bot = new Telegraf(TELEGRAM_TOKEN, process.env.TELEGRAM_API_ROOT ? { telegram: { apiRoot: process.env.TELEGRAM_API_ROOT.replace(/\/*$/, '/') } } : {});
const send = (chatId, text) => bot.telegram.sendMessage(chatId, text).catch((e) => console.error('Не отправилось:', e.message));
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Бот личный: отвечает только хозяйке и только в личной переписке.
// OWNER_ID — твой Telegram ID (можно переопределить в .env).
const OWNER_ID = String(process.env.OWNER_ID || '739258026');
const isOwner = (msg) => msg?.chat?.type === 'private' && String(msg?.from?.id) === OWNER_ID;
// Команды собираем в список; чужие сообщения молча игнорируются (и не тратят ключ Claude)
const commands = [];
const onCmd = (re, fn) => commands.push([re, fn]);
const MAX_FACTS = 100, MAX_FACT_LEN = 500, MAX_REMINDERS = 100, MAX_MSG_LEN = 4000;

// Здесь можно настроить характер и роль ассистента
const SYSTEM_PROMPT =
  'Ты — личный ассистент пользователя в Telegram. Отвечай кратко, дружелюбно и по делу. ' +
  'Помогай с планированием, напоминаниями, вопросами и повседневными задачами.';

// Модель Claude: claude-haiku-4-5-20251001 — быстрее и дешевле,
// claude-sonnet-5 — баланс качества и скорости (используется по умолчанию),
// claude-opus-5 — самая мощная, но медленнее и дороже.
const MODEL = 'claude-sonnet-5';

// История, напоминания и память хранятся в этой папке.
// Локально это просто папка data/ рядом с проектом.
// На сервере это /data/assistant (переменная DATA_DIR в .env) —
// обновления кода эту папку не трогают, и каждую ночь с неё делается резервная копия.
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY_MESSAGES = 20; // сколько последних сообщений держать в контексте

function loadHistories() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return {}; // файла ещё нет — начинаем с чистого листа
  }
}

function saveHistories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(histories, null, 2));
}

const histories = loadHistories();

function getHistory(chatId) {
  const key = String(chatId);
  if (!histories[key]) histories[key] = [];
  return histories[key];
}

// Напоминания хранятся в файле data/reminders.json.
// Формат одного напоминания: { id, chatId, time: 'ЧЧ:ММ', text }
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

function loadReminders() {
  try {
    return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveReminders() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

const reminders = loadReminders();

// Постоянная память — факты, которые не пропадают даже после /reset.
// Формат: { "chatId": [{ id, text }] }
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveMemory() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

const memory = loadMemory();

function getMemory(chatId) {
  const key = String(chatId);
  if (!memory[key]) memory[key] = [];
  return memory[key];
}

// Собирает системный промпт с учётом сохранённых фактов о пользователе
function buildSystemPrompt(chatId) {
  const facts = getMemory(chatId);
  if (facts.length === 0) return SYSTEM_PROMPT;
  const factsText = facts.map((f) => `- ${f.text}`).join('\n');
  return `${SYSTEM_PROMPT}\n\nВажные факты о пользователе (учитывай их в ответах):\n${factsText}`;
}

// Каждую минуту проверяем, не пора ли отправить напоминание.
// Срабатывает один раз (в ближайшее совпадение времени), затем удаляется из списка.
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // 'ЧЧ:ММ'

  const due = reminders.filter((r) => r.time === currentTime);
  if (due.length === 0) return;

  for (const r of due) {
    send(r.chatId, `⏰ Напоминание: ${r.text}`);
  }

  // Убираем сработавшие напоминания из списка
  const remaining = reminders.filter((r) => r.time !== currentTime);
  reminders.length = 0;
  reminders.push(...remaining);
  saveReminders();
});

onCmd(/^\/start\b/, (msg) => {
  send(
    msg.chat.id,
    'Привет! Я твой личный ассистент на базе Claude. Просто напиши мне, что нужно 🙂\n\n' +
      'Команды:\n' +
      '/reset — очистить историю диалога\n' +
      '/remind ЧЧ:ММ текст — поставить напоминание (например /remind 15:30 Позвонить маме)\n' +
      '/reminders — список активных напоминаний\n' +
      '/cancelremind ID — отменить напоминание по номеру\n' +
      '/remember текст — запомнить факт надолго (например /remember у меня аллергия на орехи)\n' +
      '/memory — что сохранено в памяти\n' +
      '/forget ID — удалить факт из памяти'
  );
});

onCmd(/^\/remember (.+)$/s, (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1].trim().slice(0, MAX_FACT_LEN);
  const facts = getMemory(chatId);
  if (facts.length >= MAX_FACTS) return send(chatId, `В памяти уже ${MAX_FACTS} фактов — удали лишние через /forget`);

  const fact = { id: Date.now().toString(36), text };
  facts.push(fact);
  saveMemory();

  send(chatId, `Запомнила ✅ (номер: ${fact.id})`);
});

onCmd(/^\/memory\b/, (msg) => {
  const facts = getMemory(msg.chat.id);
  if (facts.length === 0) {
    send(msg.chat.id, 'Пока ничего не сохранено. Добавь через /remember текст.');
    return;
  }
  const list = facts.map((f) => `${f.id} — ${f.text}`).join('\n');
  send(msg.chat.id, `Сохранено в памяти:\n${list}`);
});

onCmd(/^\/forget (\S+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1];
  const facts = getMemory(chatId);
  const index = facts.findIndex((f) => f.id === id);

  if (index === -1) {
    send(chatId, 'Не нашла факт с таким номером. Посмотри /memory.');
    return;
  }
  facts.splice(index, 1);
  saveMemory();
  send(chatId, 'Забыла ✅');
});

onCmd(/^\/remind (\d{1,2}):(\d{2}) (.+)$/s, (msg, match) => {
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  const text = match[3].trim().slice(0, MAX_FACT_LEN);
  if (reminders.filter((r) => r.chatId === msg.chat.id).length >= MAX_REMINDERS) {
    send(msg.chat.id, `Уже ${MAX_REMINDERS} напоминаний — отмени лишние через /cancelremind`);
    return;
  }

  if (Number(hours) > 23 || Number(minutes) > 59) {
    send(msg.chat.id, 'Похоже, время некорректно. Формат: /remind 15:30 текст');
    return;
  }

  const reminder = {
    id: Date.now().toString(36),
    chatId: msg.chat.id,
    time: `${hours}:${minutes}`,
    text,
  };
  reminders.push(reminder);
  saveReminders();

  send(
    msg.chat.id,
    `Готово ✅ Напомню в ${reminder.time}: «${text}» (номер: ${reminder.id})`
  );
});

onCmd(/^\/reminders\b/, (msg) => {
  const own = reminders.filter((r) => r.chatId === msg.chat.id);
  if (own.length === 0) {
    send(msg.chat.id, 'Активных напоминаний нет.');
    return;
  }
  const list = own.map((r) => `${r.id} — ${r.time} — ${r.text}`).join('\n');
  send(msg.chat.id, `Активные напоминания:\n${list}`);
});

onCmd(/^\/cancelremind (\S+)$/, (msg, match) => {
  const id = match[1];
  const index = reminders.findIndex((r) => r.id === id && r.chatId === msg.chat.id);
  if (index === -1) {
    send(msg.chat.id, 'Не нашла напоминание с таким номером.');
    return;
  }
  reminders.splice(index, 1);
  saveReminders();
  send(msg.chat.id, 'Напоминание отменено ✅');
});

onCmd(/^\/reset\b/, (msg) => {
  histories[String(msg.chat.id)] = [];
  saveHistories();
  send(msg.chat.id, 'История диалога очищена ✅');
});

async function chat(msg) {
  const text = msg.text?.slice(0, MAX_MSG_LEN);
  if (!text) return;

  const chatId = msg.chat.id;
  const history = getHistory(chatId);

  history.push({ role: 'user', content: text });
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }

  bot.telegram.sendChatAction(chatId, 'typing').catch(() => {});

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(chatId),
      messages: history,
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    history.push({ role: 'assistant', content: reply });
    saveHistories();

    await send(chatId, reply);
  } catch (err) {
    console.error('Ошибка запроса к Claude:', err.status || err.message);
    await send(
      chatId,
      'Упс, что-то пошло не так при обращении к Claude. Попробуй ещё раз чуть позже.'
    );
  }
}

// Единая точка входа: только хозяйка, только личка; команды — по списку, остальное — в Claude
bot.on('text', async (ctx) => {
  const msg = ctx.message;
  if (!isOwner(msg)) return; // чужим не отвечаем
  if (msg.text.startsWith('/')) {
    for (const [re, fn] of commands) {
      const m = msg.text.match(re);
      if (m) return fn(msg, m);
    }
    return;
  }
  await chat(msg);
});
bot.catch((err) => console.error('Ошибка бота:', err.message));

bot.launch().catch((e) => { console.error('Не удалось подключиться к Telegram:', e.message); process.exit(1); });
console.log('Бот запущен и слушает сообщения...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
