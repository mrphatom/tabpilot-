import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send,
  Square,
  Monitor,
  Trash2,
  ChevronRight,
  Globe,
  MousePointer,
  Keyboard,
  FileText,
  ArrowDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  Loader,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: number;
  type: 'action' | 'result' | 'error' | 'done' | 'info';
  message: string;
}

interface AgentState {
  task: string;
  tabId: number | null;
  running: boolean;
  log: LogEntry[];
  extractedData: string | null;
}

// ---------------------------------------------------------------------------
// Background communication
// ---------------------------------------------------------------------------

function sendMessage<T = unknown>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(res as T);
    });
  });
}

// ---------------------------------------------------------------------------
// Log entry icon
// ---------------------------------------------------------------------------

function logIcon(type: LogEntry['type']) {
  const cls = 'w-3.5 h-3.5 shrink-0 mt-px';
  switch (type) {
    case 'action': return <ChevronRight className={cls} style={{ color: 'var(--color-accent)' }} />;
    case 'result': return <FileText className={cls} style={{ color: 'rgba(255,255,255,0.4)' }} />;
    case 'error':  return <AlertCircle className={cls} style={{ color: 'var(--color-danger)' }} />;
    case 'done':   return <CheckCircle className={cls} style={{ color: 'var(--color-success)' }} />;
    case 'info':   return <Info className={cls} style={{ color: 'rgba(255,255,255,0.35)' }} />;
  }
}

function actionIcon(action: string) {
  const cls = 'w-3 h-3 shrink-0';
  switch (action) {
    case 'navigate': return <Globe className={cls} />;
    case 'click':    return <MousePointer className={cls} />;
    case 'type':     return <Keyboard className={cls} />;
    case 'extract':  return <FileText className={cls} />;
    case 'scroll':   return <ArrowDown className={cls} />;
    case 'wait':     return <Clock className={cls} />;
    default:         return null;
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [state, setState] = useState<AgentState>({
    task: '', tabId: null, running: false, log: [], extractedData: null,
  });
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Poll state from background when running
  useEffect(() => {
    if (state.running) {
      pollRef.current = setInterval(async () => {
        try {
          const { state: newState } = await sendMessage<{ state: AgentState }>({ type: 'GET_STATE' });
          setState(newState);
        } catch {
          // background may have restarted
        }
      }, 500);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state.running]);

  // Load initial state
  useEffect(() => {
    sendMessage<{ state: AgentState }>({ type: 'GET_STATE' })
      .then(({ state: s }) => setState(s))
      .catch(() => {});
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.log]);

  // Start agent
  const handleStart = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setError('');
    try {
      const res = await sendMessage<{ ok?: boolean; error?: string }>({ type: 'START_AGENT', task: trimmed });
      if (res.error) {
        setError(res.error);
        return;
      }
      const { state: newState } = await sendMessage<{ state: AgentState }>({ type: 'GET_STATE' });
      setState(newState);
      setPrompt('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [prompt]);

  // Stop agent
  const handleStop = useCallback(async () => {
    try {
      await sendMessage({ type: 'STOP_AGENT' });
      const { state: newState } = await sendMessage<{ state: AgentState }>({ type: 'GET_STATE' });
      setState(newState);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Clear state
  const handleClear = useCallback(async () => {
    try {
      await sendMessage({ type: 'CLEAR_STATE' });
      setState({ task: '', tabId: null, running: false, log: [], extractedData: null });
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  }, [handleStart]);

  return (
    <div className="flex flex-col" style={{ minHeight: 420 }}>
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between shrink-0"
        style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          <span className="text-base font-semibold tracking-tight">TabPilot</span>
        </div>
        {!state.running && state.log.length > 0 && (
          <button
            onClick={handleClear}
            className="transition-fast rounded-[10px] p-1.5 hover:bg-white/6"
            title="Clear session"
          >
            <Trash2 className="w-4 h-4 text-white/40" />
          </button>
        )}
      </header>

      {/* ── Status bar (when running) ── */}
      {state.running && (
        <div
          className="flex items-center gap-2 shrink-0"
          style={{
            padding: '8px 16px',
            background: 'rgba(79, 140, 255, 0.08)',
            borderBottom: '1px solid rgba(79, 140, 255, 0.12)',
            fontSize: 12,
          }}
        >
          <div className="flex items-center gap-1.5" style={{ color: 'var(--color-accent)' }}>
            <Loader className="w-3 h-3 animate-spin" />
            <span className="font-medium">Agent working</span>
          </div>
          {state.tabId && (
            <span className="text-white/35">in tab #{state.tabId}</span>
          )}
          <span className="flex-1" />
          <span className="text-white/35">
            {state.log.filter((l) => l.type === 'action').length} steps
          </span>
        </div>
      )}

      {/* ── Log / Content area ── */}
      <div className="flex-1" style={{ padding: state.log.length > 0 ? '0' : '16px' }}>
        {state.log.length === 0 && !state.running ? (
          /* Empty state — show prompt input centered */
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/35 leading-relaxed">
              Give TabPilot a task. It will open a sandboxed tab and an AI agent will
              navigate, click, type, and extract data &mdash; while you keep browsing.
            </p>
            <div
              className="rounded-[12px] overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Find the top 3 trending AI repos on GitHub and summarize them..."
                className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-white/20"
                style={{ padding: '10px 12px', minHeight: 72, lineHeight: '20px' }}
                autoFocus
              />
              <div
                className="flex items-center justify-end gap-2"
                style={{ padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                <button
                  onClick={handleStart}
                  disabled={!prompt.trim()}
                  className="transition-fast flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium disabled:opacity-30"
                  style={{
                    background: prompt.trim() ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                    color: prompt.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Run
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Log entries */
          <div className="flex flex-col" style={{ padding: '8px 0' }}>
            {state.log.map((entry, i) => {
              const actionMatch = entry.type === 'action'
                ? entry.message.match(/^\[Step \d+\] (\w+)/)
                : null;
              const actionName = actionMatch?.[1];

              return (
                <div
                  key={i}
                  className="flex items-start gap-2"
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    lineHeight: '18px',
                    borderBottom: i < state.log.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  }}
                >
                  {entry.type === 'action' && actionName ? (
                    <span style={{ color: 'var(--color-accent)', marginTop: 2 }}>
                      {actionIcon(actionName)}
                    </span>
                  ) : (
                    <span className="text-white/35" style={{ marginTop: 2 }}>
                      {logIcon(entry.type)}
                    </span>
                  )}
                  <span
                    style={{
                      color: entry.type === 'error'
                        ? 'var(--color-danger)'
                        : entry.type === 'done'
                          ? 'var(--color-success)'
                          : entry.type === 'action'
                            ? 'rgba(255,255,255,0.75)'
                            : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    {entry.message.length > 200
                      ? entry.message.slice(0, 200) + '...'
                      : entry.message}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-[10px]"
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: 'rgba(208, 92, 92, 0.1)',
              border: '1px solid rgba(208, 92, 92, 0.2)',
              fontSize: 12,
              color: 'var(--color-danger)',
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* ── Bottom input (when running or has log) ── */}
      {(state.running || state.log.length > 0) && (
        <div
          className="shrink-0"
          style={{
            padding: '8px 12px 12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {state.running ? (
            <button
              onClick={handleStop}
              className="transition-fast flex items-center justify-center gap-1.5 w-full rounded-[10px] py-2 text-xs font-medium"
              style={{
                background: 'rgba(208, 92, 92, 0.12)',
                color: 'var(--color-danger)',
                border: '1px solid rgba(208, 92, 92, 0.2)',
              }}
            >
              <Square className="w-3 h-3" />
              Stop Agent
            </button>
          ) : (
            <div
              className="rounded-[12px] overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New task..."
                className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-white/20"
                style={{ padding: '8px 12px', minHeight: 40, lineHeight: '20px' }}
              />
              <div
                className="flex items-center justify-end gap-2"
                style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                <button
                  onClick={handleStart}
                  disabled={!prompt.trim()}
                  className="transition-fast flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium disabled:opacity-30"
                  style={{
                    background: prompt.trim() ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                    color: prompt.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Run
                </button>
              </div>
            </div>
          )}

          {/* Extracted data summary */}
          {state.extractedData && !state.running && (
            <div
              className="rounded-[10px]"
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'rgba(34, 160, 107, 0.08)',
                border: '1px solid rgba(34, 160, 107, 0.15)',
                fontSize: 12,
                lineHeight: '18px',
                color: 'var(--color-success)',
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="font-medium">Result</span>
              </div>
              <p className="text-white/65 whitespace-pre-wrap">{state.extractedData}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
