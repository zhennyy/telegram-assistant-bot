// Подготовка базы при старте: миграции и разовый перенос JSON-файлов старой версии
import { connect } from './index.js';
import { importLegacyJsonFiles } from './json-import.js';
import { config } from '../config/index.js';

export async function initializeDatabase() {
  connect(); // применяет миграции и создаёт клиент Prisma
  await importLegacyJsonFiles(config.dataDirectory);
}
