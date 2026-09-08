import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!TELEGRAM_TOKEN || !ANTHROPIC_API_KEY) {
  console.error('Ошибка: заполни TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY в файле .env');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Здесь можно настроить характер и роль ассистента
const SYSTEM_PROMPT =
  'Ты — личный ассистент пользователя в Telegram. Отвечай кратко, дружелюбно и по делу. ' +
  'Помогай с планированием, напоминаниями, вопросами и повседневными задачами.';

// Модель Claude: claude-haiku-4-5-20251001 — быстрее и дешевле,
// claude-sonnet-5 — баланс качества и скорости (используется по умолчанию),
// claude-opus-5 — самая мощная, но медленнее и дороже.
const MODEL = 'claude-sonnet-5';

// История диалога хранится в файле data/history.json — переживает перезапуск бота.
const DATA_DIR = path.resolve('data');
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
    bot.sendMessage(r.chatId, `⏰ Напоминание: ${r.text}`);
  }

  // Убираем сработавшие напоминания из списка
  const remaining = reminders.filter((r) => r.time !== currentTime);
  reminders.length = 0;
  reminders.push(...remaining);
  saveReminders();
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
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

bot.onText(/\/remember (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const facts = getMemory(chatId);

  const fact = { id: Date.now().toString(36), text };
  facts.push(fact);
  saveMemory();

  bot.sendMessage(chatId, `Запомнила ✅ (номер: ${fact.id})`);
});

bot.onText(/\/memory/, (msg) => {
  const facts = getMemory(msg.chat.id);
  if (facts.length === 0) {
    bot.sendMessage(msg.chat.id, 'Пока ничего не сохранено. Добавь через /remember текст.');
    return;
  }
  const list = facts.map((f) => `${f.id} — ${f.text}`).join('\n');
  bot.sendMessage(msg.chat.id, `Сохранено в памяти:\n${list}`);
});

bot.onText(/\/forget (\S+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1];
  const facts = getMemory(chatId);
  const index = facts.findIndex((f) => f.id === id);

  if (index === -1) {
    bot.sendMessage(chatId, 'Не нашла факт с таким номером. Посмотри /memory.');
    return;
  }
  facts.splice(index, 1);
  saveMemory();
  bot.sendMessage(chatId, 'Забыла ✅');
});

bot.onText(/\/remind (\d{1,2}):(\d{2}) (.+)/, (msg, match) => {
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  const text = match[3];

  if (Number(hours) > 23 || Number(minutes) > 59) {
    bot.sendMessage(msg.chat.id, 'Похоже, время некорректно. Формат: /remind 15:30 текст');
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

  bot.sendMessage(
    msg.chat.id,
    `Готово ✅ Напомню в ${reminder.time}: «${text}» (номер: ${reminder.id})`
  );
});

bot.onText(/\/reminders/, (msg) => {
  const own = reminders.filter((r) => r.chatId === msg.chat.id);
  if (own.length === 0) {
    bot.sendMessage(msg.chat.id, 'Активных напоминаний нет.');
    return;
  }
  const list = own.map((r) => `${r.id} — ${r.time} — ${r.text}`).join('\n');
  bot.sendMessage(msg.chat.id, `Активные напоминания:\n${list}`);
});

bot.onText(/\/cancelremind (\S+)/, (msg, match) => {
  const id = match[1];
  const index = reminders.findIndex((r) => r.id === id && r.chatId === msg.chat.id);
  if (index === -1) {
    bot.sendMessage(msg.chat.id, 'Не нашла напоминание с таким номером.');
    return;
  }
  reminders.splice(index, 1);
  saveReminders();
  bot.sendMessage(msg.chat.id, 'Напоминание отменено ✅');
});

bot.onText(/\/reset/, (msg) => {
  histories[String(msg.chat.id)] = [];
  saveHistories();
  bot.sendMessage(msg.chat.id, 'История диалога очищена ✅');
});

bot.on('message', async (msg) => {
  const text = msg.text;
  if (!text || text.startsWith('/')) return; // команды обрабатываются отдельно выше

  const chatId = msg.chat.id;
  const history = getHistory(chatId);

  history.push({ role: 'user', content: text });
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }

  bot.sendChatAction(chatId, 'typing');

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

    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error('Ошибка запроса к Claude:', err);
    await bot.sendMessage(
      chatId,
      'Упс, что-то пошло не так при обращении к Claude. Попробуй ещё раз чуть позже.'
    );
  }
});

console.log('Бот запущен и слушает сообщения...');
