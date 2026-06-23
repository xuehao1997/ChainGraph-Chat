import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from './config.js';

/**
 * 调用 DeepSeek 流式接口，并把每个 token 的增量内容以标准 SSE 帧转发给前端。
 *
 * 统一的下游 SSE 协议（两个前端路由共用）：
 *   - 正常增量： data: {"content":"xxx"}\n\n
 *   - 出错：     event: server_error\n data: {"message":"..."}\n\n
 *   - 结束：     data: [DONE]\n\n
 *
 * 注意：自定义事件名用 server_error 而非 error。因为 error 是浏览器原生
 * EventSource 的保留事件名（连接关闭/出错时会派发），用它会和应用层错误撞名。
 *
 * @param {object} params
 * @param {string} params.message     用户输入
 * @param {import('express').Response} params.res  Express 响应（已设置 SSE 头）
 * @param {AbortSignal} params.signal  客户端断开时用于中断上游请求
 */
export async function streamDeepSeekToSSE({ message, res, signal }) {
  let upstream;
  try {
    upstream = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: true,
        messages: [
          {
            role: 'system',
            content: '你是一个简洁、友好的中文 AI 助手，用于 SSE 流式输出测试。',
          },
          { role: 'user', content: message },
        ],
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return; // 客户端主动断开，无需回写
    writeError(res, `请求 DeepSeek 失败: ${err.message}`);
    return endStream(res);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await safeReadText(upstream);
    writeError(res, `DeepSeek 返回错误 ${upstream.status}`, detail);
    return endStream(res);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const chunk of upstream.body) {
      if (signal?.aborted) break;
      buffer += decoder.decode(chunk, { stream: true });

      // 上游也是 SSE，按行解析，残行留到下一轮拼接
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json?.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // 单帧解析失败忽略，避免中断整条流
        }
      }
    }
  } catch (err) {
    if (!signal?.aborted) {
      writeError(res, `读取 DeepSeek 流出错: ${err.message}`);
    }
  }

  endStream(res);
}

function writeError(res, message, detail) {
  res.write(
    `event: server_error\ndata: ${JSON.stringify({ message, detail })}\n\n`,
  );
}

function endStream(res) {
  try {
    res.write('data: [DONE]\n\n');
    res.end();
  } catch {
    // 连接已关闭
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
