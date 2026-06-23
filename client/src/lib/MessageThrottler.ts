/*
 * MessageThrottler —— 从 SSEClient 中抽取的「消息节流」能力。
 *
 * @microsoft/fetch-event-source 本身只负责收发，不带节流。
 * 这里复刻 SSEClient 的 messageQueue + emitTimer 思路：
 *   - enqueue(item)：入队，按 emitIntervalMs 批量触发 onFlush，减少 React setState 次数
 *   - emitIntervalMs === 0：逐条实时输出
 *   - flush()：立即清空队列（用于流结束/出错前，防止丢消息）
 */
export class MessageThrottler<T> {
  private queue: T[] = [];
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private emitIntervalMs: number,
    private onFlush: (items: T[]) => void,
  ) {}

  enqueue(item: T) {
    this.queue.push(item);

    if (this.emitIntervalMs === 0) {
      this.flush();
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => this.flush(), this.emitIntervalMs);
    }
  }

  /** 立即把队列里的所有消息交给 onFlush（结束/出错前调用，保证不丢消息） */
  flush() {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    if (this.queue.length === 0) return;
    const items = this.queue;
    this.queue = [];
    this.onFlush(items);
  }

  /** 丢弃队列并清理定时器（中断时调用） */
  dispose() {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    this.queue = [];
  }
}
