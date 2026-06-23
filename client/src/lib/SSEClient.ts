/*
 * SSE 客户端（基于原生 EventSource）
 * 源自 BooklnAISaas/src/components/sse/SSEClient.tsx，保留其核心能力：
 *   - 消息节流：messageQueue + emitTimer，按 emitIntervalMs 批量触发 onMessage，减少频繁重排
 *   - 自动重连、自定义事件、JSON 解析
 *   - 关闭/出错前先 flush 队列，防止丢消息
 */

type MessageHandler<T = any> = (payload: {
  rawEvent: MessageEvent<string>;
  data: T;
}) => void;

type OpenHandler = (event: Event) => void;
type ErrorHandler = (event: Event) => void;
type CloseHandler = () => void;

export interface SSEOptions<T = any> {
  /** 监听 message 事件的处理函数 */
  onMessage?: MessageHandler<T>;
  /** 自定义事件名 => handler 映射（如 server 推送 "error" 事件） */
  eventHandlers?: Record<string, MessageHandler<T>>;
  onOpen?: OpenHandler;
  onError?: ErrorHandler;
  onClose?: CloseHandler;
  /** 触发 onMessage 之间的最小间隔(ms)，用于减少频繁重排，默认 80ms。设为 0 即逐条实时输出 */
  emitIntervalMs?: number;
  /** 是否自动重连 */
  autoReconnect?: boolean;
  /** 重连间隔，默认 3s */
  reconnectIntervalMs?: number;
  /** 最大重连次数，默认无限 */
  maxRetries?: number;
  /** 需要携带 Cookie 时启用 */
  withCredentials?: boolean;
  /** message.data 是否尝试 JSON.parse，默认 true */
  parseJson?: boolean;
}

export class SSEClient<T = any> {
  private url: string;
  private source: EventSource | null = null;
  private options: SSEOptions<T>;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: Array<{ rawEvent: MessageEvent<string>; data: T }> = [];

  constructor(url: string, options?: SSEOptions<T>) {
    this.url = url;
    this.options = {
      autoReconnect: true,
      reconnectIntervalMs: 3000,
      maxRetries: Infinity,
      parseJson: true,
      emitIntervalMs: 80,
      ...options,
    };
  }

  connect() {
    this.cleanupTimer();
    this.source?.close();

    this.source = new EventSource(this.url, {
      withCredentials: this.options.withCredentials ?? false,
    });

    this.source.onopen = (event) => {
      this.retries = 0;
      this.options.onOpen?.(event);
    };

    this.source.onmessage = (event) => {
      const payload = this.parseData(event);
      this.enqueueMessage({ rawEvent: event, data: payload });
    };

    this.source.onerror = (event) => {
      // 错误发生时，先 flush 队列中的消息，防止消息丢失
      if (this.messageQueue.length > 0) {
        this.cleanupEmitTimer();
        this.flushMessages();
      }
      this.options.onError?.(event);
      this.handleReconnect();
    };

    if (this.options.eventHandlers) {
      Object.entries(this.options.eventHandlers).forEach(([name, handler]) => {
        this.source?.addEventListener(name, (evt) => {
          const messageEvt = evt as MessageEvent<string>;
          const payload = this.parseData(messageEvt);
          this.enqueueMessage({ rawEvent: messageEvt, data: payload }, handler);
        });
      });
    }
  }

  close() {
    // 关闭前先 flush 所有待处理的消息，防止消息丢失
    if (this.messageQueue.length > 0) {
      this.cleanupEmitTimer();
      this.flushMessages();
    }

    this.cleanupTimer();
    this.cleanupEmitTimer();
    this.messageQueue = [];
    this.source?.close();
    this.source = null;
    this.options.onClose?.();
  }

  private handleReconnect() {
    const { autoReconnect, reconnectIntervalMs, maxRetries } = this.options;
    if (!autoReconnect || this.source?.readyState === EventSource.CLOSED) {
      this.close();
    }

    if (autoReconnect && this.retries < (maxRetries ?? Infinity)) {
      this.retries += 1;
      this.cleanupTimer();
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        reconnectIntervalMs,
      );
    }
  }

  private parseData(event: MessageEvent<string>) {
    const { parseJson } = this.options;
    if (!parseJson) return event.data as unknown as T;
    try {
      return JSON.parse(event.data) as T;
    } catch {
      return event.data as unknown as T;
    }
  }

  private cleanupTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupEmitTimer() {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
  }

  private enqueueMessage(
    message: { rawEvent: MessageEvent<string>; data: T },
    handlerOverride?: MessageHandler<T>,
  ) {
    this.messageQueue.push(message);

    // emitIntervalMs 为 0 时立即处理，实现真正的逐条流式输出
    if (this.options.emitIntervalMs === 0) {
      this.flushMessages(handlerOverride);
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(
        () => this.flushMessages(handlerOverride),
        this.options.emitIntervalMs,
      );
    }
  }

  private flushMessages(handlerOverride?: MessageHandler<T>) {
    this.emitTimer = null;
    const handler = handlerOverride || this.options.onMessage;
    while (this.messageQueue.length > 0) {
      const next = this.messageQueue.shift();
      if (next && handler) {
        handler(next);
      }
    }
  }
}
