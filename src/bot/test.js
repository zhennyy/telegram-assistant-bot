// Бот в чате: прогоняем настоящие обработчики через подставные Telegram и Claude (без сети)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as testHelpers from './test-helpers.js';
import { splitLongText } from './send.js';

const { OWNER_ID, STRANGER_ID, lastTextTo, claude, claudeRequests } = testHelpers;
let bot;
let database;
const say = (text, fromId = OWNER_ID, chatType) => testHelpers.sendText(bot, fromId, text, chatType);

before(async () => {
  ({ bot, database } = await testHelpers.start());
});

test('/start — приветствие со списком команд', async () => {
  await say('/start');
  assert.match(lastTextTo(OWNER_ID), /^Привет! Я твой личный ассистент на базе Claude/);
  assert.match(lastTextTo(OWNER_ID), /\/forget ID — удалить факт из памяти$/);
});

test('чужим и в группах не отвечаем и не тратим ключ Claude', async () => {
  const callsBefore = testHelpers.telegramCalls.length;
  await say('/start', STRANGER_ID);
  await say('Привет', STRANGER_ID);
  await say('Привет', OWNER_ID, 'group');
  assert.equal(testHelpers.telegramCalls.length, callsBefore);
  assert.equal(claudeRequests.length, 0);
});

test('неизвестная команда и /remember без текста — молча игнорируются', async () => {
  const callsBefore = testHelpers.telegramCalls.length;
  await say('/unknown');
  await say('/remember');
  assert.equal(testHelpers.telegramCalls.length, callsBefore);
});

test('память: /remember, /memory, факты попадают в системный промпт, /forget', async () => {
  await say('/memory');
  assert.equal(lastTextTo(OWNER_ID), 'Пока ничего не сохранено. Добавь через /remember текст.');

  await say('/remember у меня аллергия на орехи');
  const fact = await database.memoryFact.findFirst({ where: { chat_id: OWNER_ID } });
  assert.equal(fact.text, 'у меня аллергия на орехи');
  assert.equal(lastTextTo(OWNER_ID), `Запомнила ✅ (номер: ${fact.code})`);

  await say('/memory');
  assert.equal(lastTextTo(OWNER_ID), `Сохранено в памяти:\n${fact.code} — у меня аллергия на орехи`);

  await say('Что приготовить?');
  assert.match(claudeRequests.at(-1).system, /Важные факты о пользователе \(учитывай их в ответах\):\n- у меня аллергия на орехи$/);

  await say('/forget nope');
  assert.equal(lastTextTo(OWNER_ID), 'Не нашла факт с таким номером. Посмотри /memory.');
  await say(`/forget ${fact.code}`);
  assert.equal(lastTextTo(OWNER_ID), 'Забыла ✅');
  assert.equal(await database.memoryFact.count(), 0);
});

test('память: не больше 100 фактов, текст факта — до 500 символов', async () => {
  await database.memoryFact.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ chat_id: OWNER_ID, code: `f${index}`, text: 'факт '.repeat(100) })) });
  await say('/remember ещё один');
  assert.equal(lastTextTo(OWNER_ID), 'В памяти уже 100 фактов — удали лишние через /forget');

  // 100 фактов по 500 символов не влезают в одно сообщение Telegram — список приходит частями
  const callsBefore = testHelpers.sentTo(OWNER_ID).length;
  await say('/memory');
  const parts = testHelpers.sentTo(OWNER_ID).slice(callsBefore).map((call) => call.payload.text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 4096));
  assert.match(parts[0], /^Сохранено в памяти:\nf0 — /);

  await database.memoryFact.deleteMany();
  await say(`/remember ${'а'.repeat(600)}`);
  assert.equal((await database.memoryFact.findFirst()).text.length, 500);
  await database.memoryFact.deleteMany();
});

test('напоминания: /remind, проверка времени, /reminders, /cancelremind', async () => {
  await say('/reminders');
  assert.equal(lastTextTo(OWNER_ID), 'Активных напоминаний нет.');

  await say('/remind 25:00 Позвонить маме');
  assert.equal(lastTextTo(OWNER_ID), 'Похоже, время некорректно. Формат: /remind 15:30 текст');

  await say('/remind 9:05 Позвонить маме');
  const reminder = await database.reminder.findFirst({ where: { chat_id: OWNER_ID } });
  assert.equal(reminder.time, '09:05');
  assert.equal(lastTextTo(OWNER_ID), `Готово ✅ Напомню в 09:05: «Позвонить маме» (номер: ${reminder.code})`);

  await say('/reminders');
  assert.equal(lastTextTo(OWNER_ID), `Активные напоминания:\n${reminder.code} — 09:05 — Позвонить маме`);

  await say('/cancelremind nope');
  assert.equal(lastTextTo(OWNER_ID), 'Не нашла напоминание с таким номером.');
  await say(`/cancelremind ${reminder.code}`);
  assert.equal(lastTextTo(OWNER_ID), 'Напоминание отменено ✅');
  assert.equal(await database.reminder.count(), 0);
});

test('напоминания: не больше 100 на чат', async () => {
  await database.reminder.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ chat_id: OWNER_ID, code: `r${index}`, time: '10:00', text: 'дело' })) });
  await say('/remind 10:00 ещё');
  assert.equal(lastTextTo(OWNER_ID), 'Уже 100 напоминаний — отмени лишние через /cancelremind');
  await database.reminder.deleteMany();
});

test('разговор: ответ Claude, история, /reset', async () => {
  await say('/reset');
  claudeRequests.length = 0;
  await say('Привет');
  assert.equal(lastTextTo(OWNER_ID), 'Ответ на «Привет»');
  assert.ok(testHelpers.telegramCalls.some((call) => call.method === 'sendChatAction' && call.payload.action === 'typing'));
  const request = claudeRequests.at(-1);
  assert.equal(request.model, 'claude-sonnet-5');
  assert.equal(request.max_tokens, 1024);
  assert.deepEqual(request.messages, [{ role: 'user', content: 'Привет' }]);

  await say('Как дела?');
  assert.deepEqual(claudeRequests.at(-1).messages.map((message) => message.content), ['Привет', 'Ответ на «Привет»', 'Как дела?']);

  await say('/reset');
  assert.equal(lastTextTo(OWNER_ID), 'История диалога очищена ✅');
  await say('Снова привет');
  assert.deepEqual(claudeRequests.at(-1).messages, [{ role: 'user', content: 'Снова привет' }]);
});

test('разговор: в контексте последние 20 сообщений, и первое — всегда от пользователя', async () => {
  await say('/reset');
  for (let messageNumber = 1; messageNumber <= 15; messageNumber++) await say(`Сообщение ${messageNumber}`);
  const messages = claudeRequests.at(-1).messages;
  assert.equal(messages[0].role, 'user');
  assert.ok(messages.length <= 20);
  assert.equal(messages.at(-1).content, 'Сообщение 15');
  assert.ok(await database.historyMessage.count({ where: { chat_id: OWNER_ID } }) <= 20, 'старые сообщения удаляются из базы');
});

test('разговор: пустой ответ не сохраняется, ошибка Claude — понятное сообщение', async () => {
  await say('/reset');
  claude.answer = () => '   ';
  await say('Молчишь?');
  assert.equal(lastTextTo(OWNER_ID), 'Claude ничего не ответил 🤷 Попробуй переформулировать.');
  assert.equal(await database.historyMessage.count({ where: { chat_id: OWNER_ID } }), 0);

  claude.answer = () => { throw Object.assign(new Error('overloaded'), { status: 529 }); };
  await say('Ты тут?');
  assert.equal(lastTextTo(OWNER_ID), 'Упс, что-то пошло не так при обращении к Claude. Попробуй ещё раз чуть позже.');

  claude.answer = (request) => `Ответ на «${request.messages.at(-1).content}»`;
  await say('А сейчас?');
  assert.deepEqual(claudeRequests.at(-1).messages.map((message) => message.content), ['Ты тут?', 'А сейчас?'], 'сообщение с ошибкой остаётся в истории, как раньше');
});

test('длинный текст делится на части по переводу строки', () => {
  assert.deepEqual(splitLongText('короткий'), ['короткий']);
  assert.deepEqual(splitLongText('аааа\nбббб\nвв', 9), ['аааа\nбббб', 'вв']);
  assert.deepEqual(splitLongText('абвгдеёжз', 4), ['абвг', 'деёж', 'з']);
});
