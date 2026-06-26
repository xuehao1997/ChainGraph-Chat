import {
  RunnableLambda,
  RunnableWithMessageHistory,
} from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from './config.js';
import { getMessageHistory } from './memory.js';
import {
  analysisOutputParser,
  createChatPrompt,
  isStructuredAnalysisMode,
} from './prompts.js';
import { chatTools } from './tools.js';

function createDeepSeekChatModel() {
  return new ChatOpenAI({
    apiKey: DEEPSEEK_API_KEY,
    model: DEEPSEEK_MODEL,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
    },
    // DeepSeek 兼容 OpenAI Chat Completions，但不需要 LangChain 额外请求流式 usage。
    streamUsage: false,
  });
}

const streamToSSERunnable = RunnableLambda.from(
  async ({
    message,
    history = [],
    promptMode,
    userName,
    language,
    res,
    signal,
  }) => {
    let assistantContent = '';

    try {
      const model = createDeepSeekChatModel();
      const chain = createChatPrompt(promptMode).pipe(model);
      const input = {
        message,
        history,
        user_name: userName || '',
        language: language || 'English',
        format_instructions: analysisOutputParser.getFormatInstructions(),
      };

      if (isStructuredAnalysisMode(promptMode)) {
        const result = await chain.invoke(input, { signal });
        const rawContent = normalizeChunkContent(result.content);
        const parsed = await analysisOutputParser.parse(rawContent);
        assistantContent = JSON.stringify(parsed, null, 2);
        res.write(`data: ${JSON.stringify({ content: assistantContent })}\n\n`);
        return assistantContent;
      }

      const promptValue = await createChatPrompt(promptMode).invoke(input);
      const messages = promptValue.toChatMessages();
      const modelWithTools = model.bindTools(chatTools);
      const firstResponse = await modelWithTools.invoke(messages, { signal });
      const toolCalls = firstResponse.tool_calls ?? [];

      if (toolCalls.length > 0) {
        const toolMessages = await Promise.all(
          toolCalls.map((toolCall) => runToolCall(toolCall)),
        );

        const stream = await model.stream(
          [...messages, firstResponse, ...toolMessages],
          { signal },
        );

        assistantContent = await writeStreamToSSE(stream, res, signal);
        return assistantContent;
      }

      assistantContent = normalizeChunkContent(firstResponse.content);
      if (assistantContent) {
        res.write(`data: ${JSON.stringify({ content: assistantContent })}\n\n`);
      }
      return assistantContent;
    } catch (err) {
      if (!signal?.aborted) {
        writeError(res, `LangChain 调用 DeepSeek 流出错: ${err.message}`);
      }
      throw err;
    } finally {
      endStream(res);
    }
  },
);

async function runToolCall(toolCall) {
  const matchedTool = chatTools.find((item) => item.name === toolCall.name);
  if (!matchedTool) {
    throw new Error(`未知工具: ${toolCall.name}`);
  }

  return matchedTool.invoke(toolCall);
}

async function writeStreamToSSE(stream, res, signal) {
  let content = '';

  for await (const chunk of stream) {
    if (signal?.aborted) break;

    const delta = normalizeChunkContent(chunk.content);
    if (delta) {
      content += delta;
      res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }
  }

  return content;
}


const streamToSSEWithHistory = new RunnableWithMessageHistory({
  runnable: streamToSSERunnable,
  getMessageHistory,
  inputMessagesKey: 'message',
  historyMessagesKey: 'history',
});

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
 * @param {string} params.sessionId   会话 ID，用于读写 ChatMessageHistory
 * @param {string} params.promptMode  Prompt 角色/模式
 * @param {string} params.userName    Prompt 变量：用户名称
 * @param {string} params.language    Prompt 变量：目标语言
 * @param {import('express').Response} params.res  Express 响应（已设置 SSE 头）
 * @param {AbortSignal} params.signal  客户端断开时用于中断上游请求
 */
export async function streamDeepSeekToSSE({
  message,
  sessionId,
  promptMode,
  userName,
  language,
  res,
  signal,
}) {
  try {
    await streamToSSEWithHistory.invoke(
      { message, promptMode, userName, language, res, signal },
      { configurable: { sessionId } },
    );
  } catch (err) {
    // 具体错误帧已经在 runnable 内部写入；这里吞掉异常，避免路由层重复处理。
  }
}

function normalizeChunkContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' || part?.type === 'text_delta') {
        return part.text ?? '';
      }
      return '';
    })
    .join('');
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
