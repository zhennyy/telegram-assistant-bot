-- Начальная схема: история диалога, память, напоминания и учёт переноса JSON-файлов старой версии.
-- CREATE ... IF NOT EXISTS — повторный запуск ничего не меняет.
CREATE TABLE IF NOT EXISTS history_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS history_messages_chat ON history_messages(chat_id, id);

CREATE TABLE IF NOT EXISTS memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_facts_chat_code ON memory_facts(chat_id, code);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  time TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS reminders_chat_code ON reminders(chat_id, code);
CREATE INDEX IF NOT EXISTS reminders_time ON reminders(time);

CREATE TABLE IF NOT EXISTS json_imports (
  file_name TEXT PRIMARY KEY,
  records INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
