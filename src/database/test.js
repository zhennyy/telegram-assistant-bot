// База: миграции и разовый перенос JSON-файлов старой версии (history.json, memory.json, reminders.json)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import * as testHelpers from '../bot/test-helpers.js';
import { runMigrations } from './migrations.js';

const BIG_CHAT_ID = 7392580262; // настоящие id Telegram бывают длиннее 32 бит

// Файлы в том виде, в каком их записывала прежняя версия бота
const OLD_FILES = {
  'history.json': {
    [BIG_CHAT_ID]: [
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Привет! Чем помочь?' },
      { role: 'user', content: 'Напомни про маму' },
    ],
  },
  'memory.json': {
    [BIG_CHAT_ID]: [
      { id: 'mgq3x1k2', text: 'у меня аллергия на орехи' },
      { id: 'mgq3x9zz', text: 'кошку зовут Ася' },
    ],
  },
  'reminders.json': [
    { id: 'mgq4a0b1', chatId: BIG_CHAT_ID, time: '15:30', text: 'Позвонить маме' },
    { id: 'mgq4a0b1', chatId: BIG_CHAT_ID, time: '15:30', text: 'Позвонить маме' }, // дубликат номера — переносим один раз
    { id: 'broken', chatId: BIG_CHAT_ID, time: 'утром', text: 'неверное время — пропускаем' },
  ],
};

const dataDirectory = process.env.DATA_DIR;
const fileContents = {};
let database;
let importLegacyJsonFiles;

before(async () => {
  for (const [fileName, content] of Object.entries(OLD_FILES)) {
    fileContents[fileName] = JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(dataDirectory, fileName), fileContents[fileName]);
  }
  ({ database } = await testHelpers.start()); // первый запуск: миграции + перенос JSON
  ({ importLegacyJsonFiles } = await import('./json-import.js'));
});

test('миграции: применяются один раз и записываются в _app_migrations', () => {
  const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-migrations-')), 'assistant.db');
  runMigrations(databasePath);
  runMigrations(databasePath);
  const connection = new Database(databasePath);
  assert.deepEqual(
    connection
      .prepare('SELECT name FROM _app_migrations')
      .all()
      .map((row) => row.name),
    ['001_initial.sql'],
  );
  const tableNames = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.deepEqual(tableNames, ['_app_migrations', 'history_messages', 'json_imports', 'memory_facts', 'reminders']);
  connection.close();
});

test('перенос JSON: история, память и напоминания на месте, номера сохранены', async () => {
  const history = await database.historyMessage.findMany({ where: { chat_id: BIG_CHAT_ID }, orderBy: { id: 'asc' } });
  assert.deepEqual(
    history.map((message) => [message.role, message.content]),
    [
      ['user', 'Привет'],
      ['assistant', 'Привет! Чем помочь?'],
      ['user', 'Напомни про маму'],
    ],
  );
  const facts = await database.memoryFact.findMany({ orderBy: { id: 'asc' } });
  assert.deepEqual(
    facts.map((fact) => [fact.chat_id, fact.code, fact.text]),
    [
      [BIG_CHAT_ID, 'mgq3x1k2', 'у меня аллергия на орехи'],
      [BIG_CHAT_ID, 'mgq3x9zz', 'кошку зовут Ася'],
    ],
  );
  const reminders = await database.reminder.findMany();
  assert.deepEqual(
    reminders.map((reminder) => [reminder.chat_id, reminder.code, reminder.time, reminder.text]),
    [[BIG_CHAT_ID, 'mgq4a0b1', '15:30', 'Позвонить маме']],
  );
  const imports = await database.jsonImport.findMany({ orderBy: { file_name: 'asc' } });
  assert.deepEqual(
    imports.map((jsonImport) => [jsonImport.file_name, jsonImport.records]),
    [
      ['history.json', 3],
      ['memory.json', 2],
      ['reminders.json', 1],
    ],
  );
});

test('перенос JSON: повторный запуск ничего не дублирует, файлы не тронуты', async () => {
  assert.deepEqual(await importLegacyJsonFiles(dataDirectory), {});
  assert.equal(await database.historyMessage.count(), 3);
  assert.equal(await database.memoryFact.count(), 2);
  assert.equal(await database.reminder.count(), 1);
  for (const [fileName, content] of Object.entries(fileContents)) {
    assert.equal(fs.readFileSync(path.join(dataDirectory, fileName), 'utf-8'), content, fileName);
  }
});

test('перенос JSON: испорченный файл пропускается без падения и переносится после исправления', async () => {
  const otherDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-broken-'));
  await database.jsonImport.delete({ where: { file_name: 'memory.json' } });
  await database.memoryFact.deleteMany();

  fs.writeFileSync(path.join(otherDirectory, 'memory.json'), '{ "1001": [ { "id": "x1", ');
  assert.deepEqual(await importLegacyJsonFiles(otherDirectory), {});
  assert.equal(await database.memoryFact.count(), 0);

  fs.writeFileSync(
    path.join(otherDirectory, 'memory.json'),
    JSON.stringify({ 1001: [{ id: 'x1', text: 'люблю закаты' }] }),
  );
  assert.deepEqual(await importLegacyJsonFiles(otherDirectory), { 'memory.json': 1 });
  assert.equal((await database.memoryFact.findFirst()).text, 'люблю закаты');
});
