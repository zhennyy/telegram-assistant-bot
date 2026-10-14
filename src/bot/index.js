// Telegram-бот: проверяет, что пишет хозяйка, и направляет текст в нужный обработчик
import { Telegraf } from 'telegraf';
import { config } from '../config/index.js';
import { startCommands } from './handlers/start.js';
import { memoryCommands } from './handlers/memory.js';
import { reminderCommands } from './handlers/reminders.js';
import { resetCommands } from './handlers/reset.js';
import { chatWithClaude } from './handlers/chat.js';

// Команды по порядку: первая подходящая и сработает. Неизвестные команды молча игнорируются.
const COMMANDS = [...startCommands, ...memoryCommands, ...reminderCommands, ...resetCommands];

// TELEGRAM_API_ROOT — посредник для Telegram (нужен, если сервер в России)
const telegramOptions = config.telegramApiRoot ? { telegram: { apiRoot: config.telegramApiRoot.replace(/\/*$/, '/') } } : {};
export const bot = new Telegraf(config.telegramToken, telegramOptions);

// Бот личный: отвечает только хозяйке и только в личной переписке.
// Чужие сообщения молча игнорируются (и не тратят ключ Claude).
export const isOwnerMessage = (message) => message?.chat?.type === 'private' && String(message?.from?.id) === config.ownerId;

// Единая точка входа: команды — по списку, остальное — в Claude
bot.on('text', async (context) => {
  if (!isOwnerMessage(context.message)) return;
  const text = context.message.text;
  if (!text.startsWith('/')) return chatWithClaude(context);

  for (const command of COMMANDS) {
    const commandMatch = text.match(command.pattern);
    if (commandMatch) return command.handle(context, commandMatch);
  }
});

// Ошибка в одном обработчике не должна ронять бота целиком
bot.catch((handlerError) => console.error('Ошибка бота:', handlerError.message));

export function launchBot() {
  bot.launch().catch((launchError) => {
    console.error('Не удалось подключиться к Telegram:', launchError.message);
    process.exit(1);
  });
  console.log('Бот запущен и слушает сообщения...');
}
