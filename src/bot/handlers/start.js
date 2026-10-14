// /start — приветствие и список команд
import { replyText } from '../send.js';

const WELCOME_TEXT =
  'Привет! Я твой личный ассистент на базе Claude. Просто напиши мне, что нужно 🙂\n\n' +
  'Команды:\n' +
  '/reset — очистить историю диалога\n' +
  '/remind ЧЧ:ММ текст — поставить напоминание (например /remind 15:30 Позвонить маме)\n' +
  '/reminders — список активных напоминаний\n' +
  '/cancelremind ID — отменить напоминание по номеру\n' +
  '/remember текст — запомнить факт надолго (например /remember у меня аллергия на орехи)\n' +
  '/memory — что сохранено в памяти\n' +
  '/forget ID — удалить факт из памяти';

export const startCommands = [
  { pattern: /^\/start\b/, handle: (context) => replyText(context, WELCOME_TEXT) },
];
