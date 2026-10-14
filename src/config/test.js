// Настройки: без токенов бот не стартует и говорит, что заполнить
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const PROJECT_DIR = path.join(import.meta.dirname, '..', '..');

test('без TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY — понятная ошибка и выход', () => {
  const environment = { ...process.env, TELEGRAM_BOT_TOKEN: '', ANTHROPIC_API_KEY: '', DOTENV_CONFIG_PATH: '/nonexistent/.env' };
  assert.throws(
    () => execFileSync(process.execPath, ['index.js'], { cwd: PROJECT_DIR, env: environment, stdio: 'pipe' }),
    (processError) => processError.status === 1 && processError.stderr.toString().includes('Ошибка: заполни TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY в файле .env'),
  );
});

test('OWNER_ID по умолчанию и папка данных', async () => {
  process.env.OWNER_ID = '';
  process.env.DATA_DIR = '/data/assistant';
  const { config } = await import('./index.js');
  assert.equal(config.ownerId, '739258026');
  assert.equal(config.dataDirectory, '/data/assistant');
});
