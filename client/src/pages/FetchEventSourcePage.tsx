import { fetchEventSource } from '@microsoft/fetch-event-source';
import ChatView, { type StreamController } from '@/components/ChatView';
import { MessageThrottler } from '@/lib/MessageThrottler';

/**
 * 路由二：基于 @microsoft/fetch-event-source。
 * 支持 POST + JSON body（GET 的 EventSource 做不到）。
 * 通过 MessageThrottler 复刻 SSEClient 的节流能力：增量入队，按 emitIntervalMs 批量刷新。
 */
export default function FetchEventSourcePage() {
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
    const ctrl = new AbortController();
    let done = false;

    // 节流器：把零散的 token 增量合并后再交给 UI，减少 setState 次数
    const throttler = new MessageThrottler<string>(emitIntervalMs, (items) => {
      handlers.onDelta(items.join(''));
    });

    const finishError = (msg: string) => {
      if (done) return;
      done = true;
      throttler.flush();
      handlers.onError(msg);
    };

    fetchEventSource('/api/chat/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
      signal: ctrl.signal,
      openWhenHidden: true, // 切到后台标签页时也保持连接
      onopen: async (res) => {
        if (res.ok) {
          handlers.onOpen?.();
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      },
      onmessage: (ev) => {
        // 后端自定义错误事件（与 EventSource 端保持一致，统一用 server_error）
        if (ev.event === 'server_error') {
          let msg = 'DeepSeek 出错';
          try {
            msg = JSON.parse(ev.data).message || msg;
          } catch {
            // ignore
          }
          finishError(msg);
          ctrl.abort();
          return;
        }

        if (ev.data === '[DONE]') {
          done = true;
          throttler.flush();
          ctrl.abort();
          handlers.onDone();
          return;
        }

        try {
          const json = JSON.parse(ev.data) as { content?: string };
          if (json.content) throttler.enqueue(json.content);
        } catch {
          // 单帧解析失败忽略
        }
      },
      onclose: () => {
        // 服务端正常关闭连接：若还没收到 [DONE]，也按完成处理
        if (done) return;
        done = true;
        throttler.flush();
        handlers.onDone();
      },
      onerror: (err) => {
        // 抛出以阻止 fetch-event-source 默认的自动重试
        if (!done) finishError(err?.message || '连接出错');
        throw err;
      },
    }).catch(() => {
      // onerror 抛出会让 promise reject，这里吞掉避免未捕获异常
    });

    return {
      abort: () => {
        done = true;
        throttler.dispose();
        ctrl.abort();
      },
    };
  };

  return (
    <ChatView
      title='@microsoft/fetch-event-source'
      badge='fetch-event-source + 节流'
      subtitle='POST /api/chat/fetch，配合 MessageThrottler 复刻 SSEClient 的批量节流能力'
      start={start}
    />
  );
}
