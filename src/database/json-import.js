// Разовый перенос данных старой версии (history.json, memory.json, reminders.json из DATA_DIR) в базу.
// Каждый файл переносится один раз — отметка в таблице json_imports, поэтому повторный запуск ничего не дублирует.
// Сами JSON-файлы не удаляются и не меняются: они остаются резервной копией.
import fs from 'node:fs';
import path from 'node:path';
import { database, runInTransaction } from './index.js';

// Telegram ID чата: в history.json и memory.json это ключ-строка, в reminders.json — число
function toChatId(value) {
  const chatId = Number(value);
  return Number.isSafeInteger(chatId) ? chatId : null;
}

const isText = (value) => typeof value === 'string';

// history.json: { "chatId": [{ role, content }] }
function historyRows(histories) {
  return Object.entries(histories).flatMap(([chatKey, messages]) => {
    const chatId = toChatId(chatKey);
    if (chatId === null || !Array.isArray(messages)) return [];
    return messages
      .filter((message) => ['user', 'assistant'].includes(message?.role) && isText(message.content))
      .map((message) => ({ chat_id: chatId, role: message.role, content: message.content }));
  });
}

// memory.json: { "chatId": [{ id, text }] }
function memoryRows(memory) {
  return Object.entries(memory).flatMap(([chatKey, facts]) => {
    const chatId = toChatId(chatKey);
    if (chatId === null || !Array.isArray(facts)) return [];
    return facts
      .filter((fact) => isText(fact?.id) && isText(fact.text))
      .map((fact) => ({ chat_id: chatId, code: fact.id, text: fact.text }));
  });
}

// reminders.json: [{ id, chatId, time: 'ЧЧ:ММ', text }]
function reminderRows(reminders) {
  if (!Array.isArray(reminders)) return [];
  return reminders
    .filter(
      (reminder) =>
        isText(reminder?.id) &&
        toChatId(reminder.chatId) !== null &&
        /^\d{2}:\d{2}$/.test(reminder.time) &&
        isText(reminder.text),
    )
    .map((reminder) => ({
      chat_id: toChatId(reminder.chatId),
      code: reminder.id,
      time: reminder.time,
      text: reminder.text,
    }));
}

// Номер (code) уникален в пределах чата: строки, которые уже есть в базе или повторяются в файле, пропускаем
async function withoutDuplicateCodes(rows, model) {
  const existingRows = await model.findMany({ select: { chat_id: true, code: true } });
  const seenKeys = new Set(existingRows.map((row) => `${row.chat_id}:${row.code}`));
  return rows.filter((row) => {
    const key = `${row.chat_id}:${row.code}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

const LEGACY_FILES = [
  { fileName: 'history.json', toRows: historyRows, model: () => database.historyMessage },
  { fileName: 'memory.json', toRows: memoryRows, model: () => database.memoryFact, hasCodes: true },
  { fileName: 'reminders.json', toRows: reminderRows, model: () => database.reminder, hasCodes: true },
];

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (parseError) {
    // Испорченный файл не переносим и не отмечаем — можно поправить руками и перезапустить бота
    console.error(`База: не удалось прочитать ${path.basename(filePath)}, перенос пропущен:`, parseError.message);
    return undefined;
  }
}

// Возвращает { 'history.json': число перенесённых записей, ... } — только для файлов, перенесённых сейчас
export async function importLegacyJsonFiles(dataDirectory) {
  const importedCounts = {};
  for (const { fileName, toRows, model, hasCodes } of LEGACY_FILES) {
    const alreadyImported = await database.jsonImport.findUnique({ where: { file_name: fileName } });
    if (alreadyImported) continue;
    const fileContent = readJsonFile(path.join(dataDirectory, fileName));
    if (fileContent === undefined || fileContent === null) continue;

    await runInTransaction(async () => {
      const allRows = toRows(fileContent);
      const rows = hasCodes ? await withoutDuplicateCodes(allRows, model()) : allRows;
      if (rows.length) await model().createMany({ data: rows });
      await database.jsonImport.create({ data: { file_name: fileName, records: rows.length } });
      importedCounts[fileName] = rows.length;
    });
    console.log(`База: из ${fileName} перенесено записей — ${importedCounts[fileName]}`);
  }
  return importedCounts;
}
