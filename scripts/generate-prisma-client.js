// Генерация клиента Prisma (запускается автоматически после npm install).
// Для генерации движок схемы Prisma не нужен, но CLI пытается его скачать с binaries.prisma.sh,
// а этот адрес бывает закрыт (сервер в России, корпоративные сети). Подставляем заглушку, чтобы CLI не качал движок.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const environment = { ...process.env };
if (!environment.PRISMA_SCHEMA_ENGINE_BINARY) environment.PRISMA_SCHEMA_ENGINE_BINARY = process.execPath;

const prismaCli = require.resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'generate', '--schema', path.join(import.meta.dirname, '..', 'prisma', 'schema.prisma')], {
  stdio: 'inherit',
  env: environment,
});
