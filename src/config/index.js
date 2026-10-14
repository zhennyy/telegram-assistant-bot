// Настройки из .env: читаем один раз при старте и сразу проверяем,
// чтобы бот падал с понятной ошибкой, а не на первом сообщении.
import 'dotenv/config';
import path from 'node:path';

export const PROJECT_DIR = path.join(import.meta.dirname, '..', '..');

// Бот личный: отвечает только хозяйке. OWNER_ID — твой Telegram ID (можно переопределить в .env).
const DEFAULT_OWNER_ID = '739258026';

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  // TELEGRAM_API_ROOT — посредник для Telegram (нужен, если сервер в России)
  telegramApiRoot: process.env.TELEGRAM_API_ROOT,
  ownerId: String(process.env.OWNER_ID || DEFAULT_OWNER_ID),
  // История, напоминания и память хранятся в этой папке.
  // Локально это просто папка data/ рядом с проектом.
  // На сервере это /data/assistant (переменная DATA_DIR в .env) —
  // обновления кода эту папку не трогают, и каждую ночь с неё делается резервная копия.
  dataDirectory: path.resolve(process.env.DATA_DIR || path.join(PROJECT_DIR, 'data')),
};

export function validateConfig() {
  if (!config.telegramToken || !config.anthropicApiKey) {
    throw new Error('Ошибка: заполни TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY в файле .env');
  }
}
