import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';

export const DEFAULT_PROMPT_MODE = 'assistant';

const PROMPT_MODES = {
  assistant: {
    label: '简洁助手',
    system:
      '你是一个简洁、友好的中文 AI 助手。用户名称是 {user_name}；如果用户名称为空，请自然忽略这条信息。',
  },
  code_review: {
    label: '代码审查',
    system:
      '你是一个资深代码审查助手。请优先指出 bug、行为回归、安全风险、边界条件和测试缺口。使用中文，结论要具体、可执行。用户名称是 {user_name}；如果用户名称为空，请自然忽略这条信息。',
  },
  translator: {
    label: '翻译官',
    system:
      '你是一个专业翻译官。请把用户输入翻译成 {language}，保留原意和语气，不添加额外解释。用户名称是 {user_name}；如果用户名称为空，请自然忽略这条信息。',
  },
};

export function normalizePromptMode(value) {
  const mode = String(value ?? '').trim();
  return PROMPT_MODES[mode] ? mode : DEFAULT_PROMPT_MODE;
}

export function createChatPrompt(mode) {
  const promptMode = normalizePromptMode(mode);

  return ChatPromptTemplate.fromMessages([
    ['system', PROMPT_MODES[promptMode].system],
    new MessagesPlaceholder('history'),
    ['human', '{message}'],
  ]);
}
