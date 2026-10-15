// /reset — очистить историю диалога (память при этом остаётся)
import { replyText } from '../send.js';
import { clearHistory } from '../../history/index.js';

async function resetHistory(context) {
  await clearHistory(context.chat.id);
  return replyText(context, 'История диалога очищена ✅');
}

export const resetCommands = [{ pattern: /^\/reset\b/, handle: resetHistory }];
