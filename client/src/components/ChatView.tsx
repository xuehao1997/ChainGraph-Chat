import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'done'
  | 'error';

/** 一次流式请求暴露给 ChatView 的回调 */
export interface StreamHandlers {
  onOpen?: () => void;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** start() 返回的可中断句柄 */
export interface StreamController {
  abort: () => void;
}

export interface ChatViewProps {
  title: string;
  subtitle: string;
  badge: string;
  /** 发起一次流式请求；ChatView 负责 UI，具体传输由各页面注入 */
  start: (params: {
    message: string;
    sessionId: string;
    promptMode: string;
    userName: string;
    language: string;
    emitIntervalMs: number;
    handlers: StreamHandlers;
  }) => StreamController;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 流式输出中 */
  streaming?: boolean;
  error?: boolean;
  durationMs?: number;
}

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: '空闲',
  connecting: '连接中',
  streaming: '输出中',
  done: '已完成',
  error: '出错',
};

const PROMPT_MODES = [
  { value: 'assistant', label: '简洁助手' },
  { value: 'code_review', label: '代码审查' },
  { value: 'translator', label: '翻译官' },
];

const LANGUAGE_OPTIONS = ['Chinese', 'English'];

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function ChatView({
  title,
  subtitle,
  badge,
  start,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [emitIntervalMs, setEmitIntervalMs] = useState(80);
  const [sessionId, setSessionId] = useState(createSessionId);
  const [promptMode, setPromptMode] = useState('assistant');
  const [userName, setUserName] = useState('');
  const [language, setLanguage] = useState('English');

  const controllerRef = useRef<StreamController | null>(null);
  const startTimeRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isBusy = status === 'connecting' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // 卸载时中断进行中的请求
    return () => controllerRef.current?.abort();
  }, []);

  /** 把增量追加到最后一条 assistant 消息 */
  const appendDelta = useCallback((text: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant') {
        next[next.length - 1] = { ...last, content: last.content + text };
      }
      return next;
    });
  }, []);

  const finishLast = useCallback(
    (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            streaming: false,
            durationMs: Date.now() - startTimeRef.current,
            ...patch,
          };
        }
        return next;
      });
    },
    [],
  );

  const handleSend = useCallback(() => {
    const message = input.trim();
    if (!message || isBusy) return;

    setInput('');
    setStatus('connecting');
    startTimeRef.current = Date.now();

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '', streaming: true },
    ]);

    controllerRef.current = start({
      message,
      sessionId,
      promptMode,
      userName,
      language,
      emitIntervalMs,
      handlers: {
        onOpen: () => setStatus('streaming'),
        onDelta: (text) => {
          setStatus('streaming');
          appendDelta(text);
        },
        onDone: () => {
          setStatus('done');
          finishLast({});
          controllerRef.current = null;
        },
        onError: (msg) => {
          setStatus('error');
          finishLast({ error: true, content: `⚠️ ${msg}` });
          controllerRef.current = null;
        },
      },
    });
  }, [
    appendDelta,
    emitIntervalMs,
    finishLast,
    input,
    isBusy,
    language,
    promptMode,
    sessionId,
    start,
    userName,
  ]);

  const handleStop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    finishLast({});
    setStatus('idle');
  }, [finishLast]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className='chat'>
      <header className='chat-header'>
        <div className='chat-title'>
          {title}
          <span className='badge'>{badge}</span>
          <span className={`status ${status}`}>{STATUS_TEXT[status]}</span>
        </div>
        <div className='chat-subtitle'>{subtitle}</div>
        <div className='chat-toolbar'>
          <label className='toolbar-field'>
            角色/模式
            <select
              value={promptMode}
              onChange={(e) => {
                setPromptMode(e.target.value);
                setMessages([]);
                setSessionId(createSessionId());
                setStatus('idle');
              }}
              disabled={isBusy}
            >
              {PROMPT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className='toolbar-field'>
            用户名
            <input
              type='text'
              value={userName}
              placeholder='可选'
              onChange={(e) => setUserName(e.target.value)}
              disabled={isBusy}
            />
          </label>
          <label className='toolbar-field'>
            目标语言
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isBusy}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className='toolbar-field'>
            节流间隔 emitIntervalMs(ms)
            <input
              type='number'
              min={0}
              max={1000}
              step={20}
              value={emitIntervalMs}
              onChange={(e) => setEmitIntervalMs(Number(e.target.value) || 0)}
            />
          </label>
          <span className='toolbar-field'>
            0 = 逐条实时输出；&gt;0 = 批量节流，减少重排
          </span>
          <button
            className='toolbar-field'
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
            onClick={() => {
              setMessages([]);
              setSessionId(createSessionId());
              setStatus('idle');
            }}
            disabled={isBusy}
          >
            新会话
          </button>
        </div>
      </header>

      <div className='messages'>
        {messages.length === 0 ? (
          <div className='empty'>
            <div className='empty-title'>{title}</div>
            <div>输入问题，测试 DeepSeek 的 SSE 流式输出</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              <div className={`avatar ${m.role}`}>
                {m.role === 'user' ? '我' : 'AI'}
              </div>
              <div>
                <div
                  className={`bubble ${
                    m.streaming && m.content === '' ? 'cursor-blink' : ''
                  }`}
                >
                  {m.content}
                  {m.streaming && m.content !== '' && (
                    <span className='cursor-blink' />
                  )}
                </div>
                {m.role === 'assistant' && !m.streaming && m.content && (
                  <div className='meta'>
                    {m.error
                      ? '请求失败'
                      : `${m.content.length} 字 · 耗时 ${(
                          (m.durationMs ?? 0) / 1000
                        ).toFixed(1)}s`}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className='composer'>
        <div className='composer-inner'>
          <textarea
            rows={1}
            placeholder='给 DeepSeek 发消息…（Enter 发送，Shift+Enter 换行）'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
          />
          {isBusy ? (
            <button className='btn btn-stop' onClick={handleStop}>
              停止
            </button>
          ) : (
            <button
              className='btn btn-primary'
              onClick={handleSend}
              disabled={!input.trim()}
            >
              发送
            </button>
          )}
        </div>
        <div className='hint'>
          当前会话 ID：{sessionId}，角色模式和历史消息由后端参与 prompt 组装
        </div>
      </div>
    </div>
  );
}
