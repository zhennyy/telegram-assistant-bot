# Личный ассистент в Telegram (на Claude)

Простой бот на Node.js: получает сообщения из Telegram, отправляет их в Claude API и присылает ответ. Работает локально, на твоём компьютере.

## Что понадобится

1. **Node.js 18 или новее** — проверь версию: `node -v`. Если не установлен, скачай с [nodejs.org](https://nodejs.org).
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

На сервере ещё `DATA_DIR` (папка для памяти и напоминаний) и, если нужен прокси, `ANTHROPIC_BASE_URL` / `TELEGRAM_API_ROOT` — они подробно описаны в `.env.example`.

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

- `index.js` — вся логика на [Telegraf](https://telegraf.js.org): слушает сообщения через long polling, хранит историю, напоминания и память в файлах `data/*.json` и отправляет запросы в Claude.
- Системный промпт (характер ассистента) задаётся в переменной `SYSTEM_PROMPT` в начале `index.js` — его можно менять как угодно: добавить специализацию, стиль общения, ограничения.
- Модель по умолчанию — `claude-sonnet-5` (баланс скорости и качества). Можно поменять на `claude-haiku-4-5-20251001` (быстрее и дешевле) или `claude-opus-5` (мощнее) — константа `MODEL` в `index.js`.

## Работа 24/7 на своём сервере (VPS)

Бот работает на собственном сервере вместе с остальными проектами BotForAll:

- код — `/opt/bots/assistant`, данные — `/data/assistant` (переменная `DATA_DIR`), каждую ночь — резервная копия;
- ключи — `bfa env assistant`: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `OWNER_ID`; на сервере в России ещё `TELEGRAM_API_ROOT` и `ANTHROPIC_BASE_URL` (посредник в Нидерландах);
- обновление: `git push`, затем на сервере `bfa update`; логи — `bfa logs assistant`.

Установка сервера — в [BotForAll/deploy/README.md](https://github.com/zhennyy/botforall/blob/main/deploy/README.md).
