import ChatView, { type StreamController } from '@/components/ChatView';
import { SSEClient } from '@/lib/SSEClient';

/**
 * 路由一：基于浏览器原生 EventSource。
 * 直接复用从 BooklnAISaas 迁移来的 SSEClient（自带 emitIntervalMs 节流能力）。
 * 由于 EventSource 仅支持 GET，问题通过 query 传给后端。
 */
export default function EventSourcePage() {
  const start = ({
    message,
    history,
    emitIntervalMs,
    handlers,
  }: {
    message: string;
    history: Parameters<
      React.ComponentProps<typeof ChatView>['start']
    >[0]['history'];
    emitIntervalMs: number;
    handlers: Parameters<
      React.ComponentProps<typeof ChatView>['start']
    >[0]['handlers'];
  }): StreamController => {
    const params = new URLSearchParams({
      message,
      history: JSON.stringify(history),
    });
    const url = `/api/chat/eventsource?${params.toString()}`;
    let done = false;

    const client = new SSEClient<{ content?: string } | string>(url, {
      emitIntervalMs,
      autoReconnect: false, // 一次性问答，不重连
      parseJson: true,
      onOpen: () => handlers.onOpen?.(),
      onMessage: ({ data }) => {
        if (data === '[DONE]') {
          done = true;
          client.close();
          handlers.onDone();
          return;
        }
        if (data && typeof data === 'object' && data.content) {
          handlers.onDelta(data.content);
        }
      },
      eventHandlers: {
        // 后端推送的自定义错误事件。注意用 server_error 而非 error，
        // 否则会和 EventSource 原生的 error 事件（连接关闭时派发）撞名。
        server_error: ({ data }) => {
          if (done) return;
          done = true;
          const msg =
            (data && typeof data === 'object' && (data as any).message) ||
            'DeepSeek 出错';
          client.close();
          handlers.onError(msg);
        },
      },
      onError: () => {
        // EventSource 原生错误（网络中断 / 连接关闭）。正常结束后忽略。
        if (done) return;
        done = true;
        client.close();
        handlers.onError('连接中断');
      },
    });

    client.connect();

    return {
      abort: () => {
        done = true;
        client.close();
      },
    };
  };

  return (
    <ChatView
      title='原生 EventSource'
      badge='EventSource + SSEClient'
      subtitle='复用 BooklnAISaas 的 SSEClient（GET /api/chat/eventsource），内置 emitIntervalMs 节流'
      start={start}
    />
  );
}
