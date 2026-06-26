import { BaseListChatMessageHistory } from '@langchain/core/chat_history';

const MAX_STORED_MESSAGES = 50;
const MAX_CONTEXT_MESSAGES = 10;

class WindowedChatMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ['streambench', 'memory', 'windowed'];
  messages = [];

  async getMessages() {
    return this.messages.slice(-MAX_CONTEXT_MESSAGES);
  }

  async addMessage(message) {
    this.messages.push(message);
    this.trim();
  }

  async addMessages(messages) {
    this.messages.push(...messages);
    this.trim();
  }

  async clear() {
    this.messages = [];
  }

  trim() {
    this.messages = this.messages.slice(-MAX_STORED_MESSAGES);
  }
}

const sessions = new Map();

export function getMessageHistory(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new WindowedChatMessageHistory());
  }

  return sessions.get(sessionId);
}
