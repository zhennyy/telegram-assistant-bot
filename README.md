# Личный ассистент в Telegram (на Claude)

Простой бот на Node.js: получает сообщения из Telegram, отправляет их в Claude API и присылает ответ. Работает локально, на твоём компьютере.

## Что понадобится

1. **Node.js 22.12 или новее** — проверь версию: `node -v` (в `.nvmrc` — 22). Если не установлен, скачай с [nodejs.org](https://nodejs.org).
2. **Токен Telegram-бота**:
   - Открой Telegram, напиши [@BotFather](https://t.me/BotFather).
   - Команда `/newbot`, придумай имя и username бота.
   - BotFather пришлёт токен вида `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` — сохрани его.
3. **API-ключ Anthropic**:
   - Зайди на [console.anthropic.com](https://console.anthropic.com).
   - В разделе API Keys создай новый ключ и сохрани его (показывается только один раз).

## Установка

Открой терминал в папке `telegram-assistant-bot` и выполни:

```bash
npm install
```

После установки сам сгенерируется клиент базы (Prisma) — отдельно ничего запускать не нужно.

Скопируй файл `.env.example` в `.env`:

```bash
cp .env.example .env
```

Открой `.env` и вставь свои значения:

```
TELEGRAM_BOT_TOKEN=твой_токен_от_botfather
ANTHROPIC_API_KEY=твой_ключ_anthropic
OWNER_ID=твой_telegram_id
```

На сервере ещё `DATA_DIR` (папка с базой `assistant.db`) и, если нужен прокси, `ANTHROPIC_BASE_URL` / `TELEGRAM_API_ROOT` — они подробно описаны в `.env.example`.

## Запуск

```bash
npm start
```

В консоли появится `Бот запущен и слушает сообщения...` — значит всё работает. Открой своего бота в Telegram и напиши ему любое сообщение.

Пока скрипт запущен в терминале — бот отвечает. Если закрыть терминал, бот остановится (это нормально для локального теста).

## Команды бота

- `/start` — приветствие и список команд.
- `/reset` — очистить историю диалога.
- `/remind ЧЧ:ММ текст`, `/reminders`, `/cancelremind ID` — напоминания.
- `/remember текст`, `/memory`, `/forget ID` — постоянная память о тебе.

Бот личный: отвечает только владельцу (`OWNER_ID` в `.env`) и только в личной переписке — чужие сообщения игнорируются и не тратят ключ Claude.

## Как это устроено

`index.js` — точка входа: проверяет `.env` (без `TELEGRAM_BOT_TOKEN` или `ANTHROPIC_API_KEY` сразу скажет, чего не хватает),
готовит базу, запускает бота и напоминания. Всё остальное — в `src/`, каждый механизм в своей папке:

| Папка | Что внутри |
|---|---|
| `config/` | чтение и проверка `.env`, `OWNER_ID`, папка данных |
| `database/` | подключение к SQLite через Prisma, миграции, разовый перенос старых JSON-файлов (`json-import.js`) |
| `claude/` | клиент Claude API: системный промпт (`SYSTEM_PROMPT`), модель (`MODEL`), запрос ответа |
| `conversation/` | разговор: сообщение → история + память → ответ Claude → история |
| `history/` | история диалога (последние 20 сообщений чата) |
| `memory/` | постоянная память — факты, которые не пропадают после `/reset` |
| `reminders/` | напоминания: добавить, отменить, забрать те, которым пора сработать |
| `codes/` | номер записи для пользователя (для `/forget` и `/cancelremind`) |
| `schedulers/` | раз в минуту отправляет напоминания (node-cron) |
| `bot/` | Telegram-бот на [Telegraf](https://telegraf.js.org): `index.js` пускает только хозяйку и направляет текст в обработчик из `handlers/` (`start`, `memory`, `reminders`, `reset`, `chat`), `send.js` — отправка с разбивкой длинных сообщений |

- Системный промпт (характер ассистента) — `SYSTEM_PROMPT` в `src/claude/index.js`: можно добавить специализацию, стиль общения, ограничения.
- Модель по умолчанию — `claude-sonnet-5` (баланс скорости и качества). Можно поменять на `claude-haiku-4-5-20251001` (быстрее и дешевле) или `claude-opus-5` (мощнее) — константа `MODEL` там же.
- Бот слушает сообщения через long polling — отдельный сервер и HTTPS не нужны.

### База данных

История, память и напоминания хранятся в SQLite, работа с базой — через ORM [Prisma](https://www.prisma.io): запросы пишутся на JavaScript, без SQL.

```js
const facts = await database.memoryFact.findMany({ where: { chat_id: chatId }, orderBy: { id: 'asc' } });
```

- База — `assistant.db` в папке `DATA_DIR` (на сервере `/data/assistant/assistant.db`); без `DATA_DIR` — в папке `data/` проекта.
- `prisma/schema.prisma` — схема таблиц (имена полей = колонки в базе).
- `prisma/migrations/*.sql` — изменения структуры; применяются сами при запуске, каждая один раз (учёт — в таблице `_app_migrations`).
- Клиент Prisma генерируется после `npm install` (`npm run db:generate` — вручную).
- **Переход со старой версии:** раньше всё лежало в `history.json`, `memory.json` и `reminders.json`. При первом запуске
  бот один раз переносит их в базу (номера фактов и напоминаний сохраняются), отмечает это в таблице `json_imports`
  и больше их не читает. Сами файлы не удаляются — остаются резервной копией. Испорченный файл пропускается с ошибкой в логе:
  его можно поправить и перезапустить бота.

### Проверка

```bash
npm test              # автотесты
npm run lint          # ESLint: ошибки и понятные имена (без однобуквенных переменных)
npm run format:check  # Prettier: единый стиль кода (npm run format — поправить)
```

19 автотестов: команды бота (`/start`, память, напоминания, `/reset`), разговор с Claude (история, лимит в 20 сообщений,
пустой ответ, ошибка API), «только хозяйка и только личка», напоминания по расписанию, миграции и перенос старых JSON-файлов —
через подставные Telegram и Claude, без сети. Тесты лежат рядом с кодом — файл `test.js` в папке модуля; `npm test` находит их сам.

На каждый push и pull request GitHub Actions запускает Prettier, ESLint и тесты (`.github/workflows/ci.yml`).

## Работа 24/7 на своём сервере (VPS)

Бот работает на собственном сервере вместе с остальными проектами BotForAll:

- код — `/opt/bots/assistant`, база — `/data/assistant/assistant.db` (переменная `DATA_DIR`), каждую ночь — резервная копия;
- ключи — `bfa env assistant`: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `OWNER_ID`; на сервере в России ещё `TELEGRAM_API_ROOT` и `ANTHROPIC_BASE_URL` (посредник в Нидерландах);
- обновление: `git push`, затем на сервере `bfa update`; логи — `bfa logs assistant`;
- на сервере нужен Node.js 22.12+; после первого запуска этой версии в логах будут строки `База: из … перенесено записей — …`.

Установка сервера — в [BotForAll/deploy/README.md](https://github.com/zhennyy/botforall/blob/main/deploy/README.md).
