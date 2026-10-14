// Клиент Claude API: характер ассистента, модель и запрос ответа.
// Адрес посредника (ANTHROPIC_BASE_URL из .env) SDK подхватывает сам.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';

// Здесь можно настроить характер и роль ассистента
export const SYSTEM_PROMPT =
  'Ты — личный ассистент пользователя в Telegram. Отвечай кратко, дружелюбно и по делу. ' +
  'Помогай с планированием, напоминаниями, вопросами и повседневными задачами.';

// Модель Claude: claude-haiku-4-5-20251001 — быстрее и дешевле,
// claude-sonnet-5 — баланс качества и скорости (используется по умолчанию),
// claude-opus-5 — самая мощная, но медленнее и дороже.
export const MODEL = 'claude-sonnet-5';
const MAX_ANSWER_TOKENS = 1024;

export const anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });

// Собирает системный промпт с учётом сохранённых фактов о пользователе
export function buildSystemPrompt(facts) {
  if (facts.length === 0) return SYSTEM_PROMPT;
  const factsText = facts.map((fact) => `- ${fact.text}`).join('\n');
  return `${SYSTEM_PROMPT}\n\nВажные факты о пользователе (учитывай их в ответах):\n${factsText}`;
}

// Ответ Claude одним текстом (все текстовые блоки ответа через перевод строки)
export async function askClaude(systemPrompt, messages) {
  const response = await anthropicClient.messages.create({
    model: MODEL,
    max_tokens: MAX_ANSWER_TOKENS,
    system: systemPrompt,
    messages,
  });
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
