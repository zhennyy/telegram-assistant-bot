// Точка входа личного ассистента: проверяем .env, готовим базу, запускаем бота и напоминания.
import { config, validateConfig } from './src/config/index.js';

try {
  validateConfig();
} catch (configError) {
  console.error(configError.message);
  process.exit(1);
}

// Остальные модули — после проверки .env: им уже нужны токены
const { initializeDatabase } = await import('./src/database/initialize.js');
const { disconnect } = await import('./src/database/index.js');
const { bot, launchBot } = await import('./src/bot/index.js');
const { startSchedulers } = await import('./src/schedulers/index.js');

try {
  await initializeDatabase();
} catch (databaseError) {
  console.error(`Не удалось подготовить базу ${config.dataDirectory}:`, databaseError.message);
  process.exit(1);
}

const stopSchedulers = startSchedulers(bot.telegram);
launchBot();

// При остановке гасим и бота, и cron-напоминания, иначе процесс не завершится
async function shutdown(signal) {
  stopSchedulers();
  bot.stop(signal);
  await disconnect();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
