import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import { streamDeepSeekToSSE } from './deepseek.js';

const app = express();
app.use(cors());
app.use(express.json());

/** 设置标准 SSE 响应头 */
function prepareSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/**
 * 路由一：供原生 EventSource 使用。
 * EventSource 仅支持 GET，问题通过 query 传递。
 * 例: GET /api/chat/eventsource?message=你好
 */
app.get('/api/chat/eventsource', async (req, res) => {
  const message = String(req.query.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'message 不能为空' });
    return;
  }
  const sessionId = normalizeSessionId(req.query.sessionId);
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId 不能为空' });
    return;
  }
  prepareSSE(res);

  // 监听响应关闭（客户端断开）来中断上游；不能用 req，POST 读完 body 后 req 会立即 close
  const controller = new AbortController();
  let streamCompleted = false;
  res.on('close', () => {
    if (!streamCompleted) controller.abort();
  });

  await streamDeepSeekToSSE({
    message,
    sessionId,
    res,
    signal: controller.signal,
  });
  streamCompleted = true;
});

/**
 * 路由二：供 @microsoft/fetch-event-source 使用。
 * 支持 POST + JSON body，问题放在 body 中。
 * 例: POST /api/chat/fetch  { "message": "你好" }
 */
app.post('/api/chat/fetch', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'message 不能为空' });
    return;
  }
  const sessionId = normalizeSessionId(req.body?.sessionId);
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId 不能为空' });
    return;
  }
  prepareSSE(res);

  // 监听响应关闭（客户端断开）来中断上游；不能用 req，POST 读完 body 后 req 会立即 close
  const controller = new AbortController();
  let streamCompleted = false;
  res.on('close', () => {
    if (!streamCompleted) controller.abort();
  });

  await streamDeepSeekToSSE({
    message,
    sessionId,
    res,
    signal: controller.signal,
  });
  streamCompleted = true;
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[StreamBench] server listening on http://localhost:${PORT}`);
});

function normalizeSessionId(value) {
  return String(value ?? '').trim();
}
