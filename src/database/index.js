// Подключение к базе через Prisma.
// database — клиент Prisma; внутри runInTransaction он сам переключается на текущую транзакцию,
// поэтому функциям не нужно передавать транзакцию параметром.
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/index.js';
import { config } from '../config/index.js';
import { runMigrations } from './migrations.js';

// База лежит рядом с прежними JSON-файлами: DATA_DIR/assistant.db
export const databasePath = path.join(config.dataDirectory, 'assistant.db');

let prismaClient = null;
const transactionStorage = new AsyncLocalStorage();

export function connect() {
  if (prismaClient) return prismaClient;
  runMigrations(databasePath);
  prismaClient = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  return prismaClient;
}

// Обращение database.reminder.findMany(...) идёт в активную транзакцию, если она есть, иначе — в общий клиент
export const database = new Proxy(
  {},
  {
    get(_target, propertyName) {
      const activeClient = transactionStorage.getStore() || connect();
      const value = activeClient[propertyName];
      return typeof value === 'function' ? value.bind(activeClient) : value;
    },
  },
);

// Всё внутри work выполняется одной транзакцией: либо целиком, либо никак.
// Вложенный вызов просто продолжает внешнюю транзакцию.
export async function runInTransaction(work) {
  if (transactionStorage.getStore()) return work();
  return connect().$transaction((transactionClient) => transactionStorage.run(transactionClient, work), {
    timeout: 30000,
    maxWait: 30000,
  });
}

export async function disconnect() {
  if (prismaClient) await prismaClient.$disconnect();
  prismaClient = null;
}
