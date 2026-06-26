const MAX_STORED_MESSAGES = 50;
const MAX_CONTEXT_MESSAGES = 10;

const sessions = new Map();

export function getSessionHistory(sessionId) {
  return (sessions.get(sessionId) ?? []).slice(-MAX_CONTEXT_MESSAGES);
}

export function saveSessionExchange(sessionId, userContent, assistantContent) {
  if (!sessionId || !assistantContent.trim()) return;

  const history = sessions.get(sessionId) ?? [];
  history.push(
    { role: 'user', content: userContent },
    { role: 'assistant', content: assistantContent },
  );

  sessions.set(sessionId, history.slice(-MAX_STORED_MESSAGES));
}
