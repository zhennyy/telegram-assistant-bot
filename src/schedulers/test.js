// Напоминания по расписанию: в нужную минуту отправляются один раз и удаляются, остальные ждут
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as testHelpers from '../bot/test-helpers.js';
import { sendDueReminders } from './index.js';

const { OWNER_ID, lastTextTo } = testHelpers;
let bot;
let database;

before(async () => {
  ({ bot, database } = await testHelpers.start());
});

test('напоминание срабатывает в своё время, один раз, и удаляется', async () => {
  await database.reminder.createMany({
    data: [
      { chat_id: OWNER_ID, code: 'a1', time: '15:30', text: 'Позвонить маме' },
      { chat_id: OWNER_ID, code: 'a2', time: '15:31', text: 'Выпить воды' },
    ],
  });
  const atHalfPastThree = new Date(2026, 9, 14, 15, 30, 12); // время сервера

  await sendDueReminders(bot.telegram, atHalfPastThree);
  assert.equal(lastTextTo(OWNER_ID), '⏰ Напоминание: Позвонить маме');
  assert.deepEqual((await database.reminder.findMany()).map((reminder) => reminder.code), ['a2']);

  const sentBefore = testHelpers.sentTo(OWNER_ID).length;
  await sendDueReminders(bot.telegram, atHalfPastThree);
  assert.equal(testHelpers.sentTo(OWNER_ID).length, sentBefore, 'повторно не отправляется');
});

test('ошибка отправки не мешает остальным напоминаниям', async () => {
  await database.reminder.deleteMany();
  await database.reminder.createMany({
    data: [
      { chat_id: 42, code: 'b1', time: '08:00', text: 'в заблокированный чат' },
      { chat_id: OWNER_ID, code: 'b2', time: '08:00', text: 'Зарядка' },
    ],
  });
  const failingTelegram = {
    sendMessage: (chatId, text) => (chatId === 42 ? Promise.reject(new Error('Forbidden: bot was blocked')) : bot.telegram.sendMessage(chatId, text)),
  };
  await sendDueReminders(failingTelegram, new Date(2026, 9, 14, 8, 0));
  assert.equal(lastTextTo(OWNER_ID), '⏰ Напоминание: Зарядка');
  assert.equal(await database.reminder.count(), 0);
});
