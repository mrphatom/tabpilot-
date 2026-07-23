import { createClient } from '@blinkdotnew/sdk';

const PROJECT_ID = import.meta.env.VITE_BLINK_PROJECT_ID;
const SECRET_KEY = import.meta.env.VITE_BLINK_SECRET_KEY;

const blink = createClient({ projectId: PROJECT_ID, secretKey: SECRET_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentState {
  task: string;
  tabId: number | null;
  running: boolean;
  log: LogEntry[];
  extractedData: string | null;
}

interface LogEntry {
  timestamp: number;
  type: 'action' | 'result' | 'error' | 'done' | 'info';
  message: string;
}

interface BrowserAction {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'scroll' | 'wait' | 'done';
  url?: string;
  selector?: string;
  text?: string;
  pixels?: number;
  ms?: number;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function getState(): Promise<AgentState> {
  const { state } = await chrome.storage.local.get('state');
  return state || { task: '', tabId: null, running: false, log: [], extractedData: null };
}

async function saveState(state: AgentState): Promise<void> {
  await chrome.storage.local.set({ state });
}

function addLog(state: AgentState, type: LogEntry['type'], message: string): void {
  state.log.push({ timestamp: Date.now(), type, message });
}

// ---------------------------------------------------------------------------
// Content script injection
// ---------------------------------------------------------------------------

function ensureContentScript(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.scripting.executeScript(
          { target: { tabId }, files: ['content.js'] },
          () => resolve()
        );
      } else {
        resolve();
      }
    });
  });
}

async function sendToTab(tabId: number, msg: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ---------------------------------------------------------------------------
// Get page state for the AI
// ---------------------------------------------------------------------------

async function getPageState(tabId: number): Promise<{ url: string; title: string; text: string; interactive: unknown[] }> {
  const tab = await chrome.tabs.get(tabId);
  const result = (await sendToTab(tabId, { type: 'GET_PAGE_STATE' })) as {
    url: string;
    title: string;
    text: string;
    interactive: unknown[];
  } | undefined;
  return result || { url: tab.url || '', title: tab.title || '', text: '', interactive: [] };
}

// ---------------------------------------------------------------------------
// AI decision loop
// ---------------------------------------------------------------------------

const ACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    action: {
      type: 'string' as const,
      enum: ['navigate', 'click', 'type', 'extract', 'scroll', 'wait', 'done'],
    },
    url: { type: 'string' as const },
    selector: { type: 'string' as const },
    text: { type: 'string' as const },
    pixels: { type: 'number' as const },
    ms: { type: 'number' as const },
    summary: { type: 'string' as const },
    reasoning: { type: 'string' as const },
  },
  required: ['action', 'reasoning'],
};

const SYSTEM_PROMPT = `You are TabPilot, a browser automation agent. You control a real Chrome tab and can navigate, click, type, extract data, scroll, and wait.

Your job: accomplish the user's task by taking browser actions step-by-step. You receive the current page state (URL, title, visible text, interactive elements) and must decide the next action.

## Actions

- **navigate**: Go to a URL. Provide "url".
- **click**: Click an element. Provide a CSS "selector" (use IDs, classes, or text-based selectors). The page will show you what's clickable.
- **type**: Type text into an input field. Provide "selector" for the input and "text" to type.
- **extract**: Read and extract data from the current page. The page text will be returned to you.
- **scroll**: Scroll the page. Provide "pixels" (positive = down, negative = up).
- **wait**: Wait for page to load. Provide "ms" (milliseconds).
- **done**: Task is complete. Provide a "summary" of what you accomplished.

## Strategy

1. Navigate to the right starting URL if needed
2. Observe the page, find relevant elements
3. Take actions: click, type, scroll
4. Extract data when you find what you need
5. Declare done when finished

## Important

- Always provide "reasoning" explaining why you chose this action
- For clicks, use selectors that are specific but not fragile (prefer IDs and data attributes over nth-child)
- When extracting, the full page text will be shown to you in the next step — you don't need to extract on every step
- If a click or navigation fails, try an alternative approach
- Keep responses concise and focused`;

async function agentLoop(state: AgentState): Promise<void> {
  const tabId = state.tabId;
  if (!tabId) return;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  let stepCount = 0;
  const maxSteps = 25;

  while (state.running && stepCount < maxSteps) {
    stepCount++;

    // Get current page state
    let pageState: { url: string; title: string; text: string; interactive: unknown[] };
    try {
      pageState = await getPageState(tabId);
    } catch (err) {
      addLog(state, 'error', `Failed to read page: ${(err as Error).message}`);
      await saveState(state);
      break;
    }

    // Truncate page text for AI context
    const truncatedText = pageState.text.slice(0, 6000);
    const interactivePreview = JSON.stringify(pageState.interactive.slice(0, 30));

    const userMessage = stepCount === 1
      ? `Task: ${state.task}\n\nCurrent page:\nURL: ${pageState.url}\nTitle: ${pageState.title}\n\nInteractive elements:\n${interactivePreview}\n\nPage text (first 6000 chars):\n${truncatedText}`
      : `Step ${stepCount}. Previous action completed.\n\nCurrent page:\nURL: ${pageState.url}\nTitle: ${pageState.title}\n\nInteractive elements:\n${interactivePreview}\n\nPage text (first 6000 chars):\n${truncatedText}`;

    messages.push({ role: 'user', content: userMessage });

    // Get AI decision
    let action: BrowserAction;
    try {
      const { object } = await blink.ai.generateObject({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        schema: ACTION_SCHEMA,
        model: 'google/gemini-3.1-flash-lite',
        maxTokens: 500,
      });
      action = object as BrowserAction;
      messages.push({ role: 'assistant', content: JSON.stringify(action) });
    } catch (err) {
      addLog(state, 'error', `AI error: ${(err as Error).message}`);
      await saveState(state);
      break;
    }

    addLog(state, 'action', `[Step ${stepCount}] ${action.action} — ${action.reasoning || ''}`);

    if (action.action === 'done') {
      addLog(state, 'done', action.summary || 'Task completed.');
      state.extractedData = action.summary || null;
      state.running = false;
      await saveState(state);
      break;
    }

    // Execute action in the sandbox tab
    try {
      const result = await sendToTab(tabId, {
        type: 'EXECUTE_ACTION',
        action: action.action,
        url: action.url,
        selector: action.selector,
        text: action.text,
        pixels: action.pixels,
        ms: action.ms,
      });

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      const preview = resultStr.slice(0, 300);
      addLog(state, 'result', preview);

      // If we did extract, feed the extracted data back
      if (action.action === 'extract' && resultStr) {
        messages.push({
          role: 'user',
          content: `Extracted data:\n${resultStr.slice(0, 4000)}`,
        });
      }
    } catch (err) {
      addLog(state, 'error', `Action failed: ${(err as Error).message}`);
    }

    await saveState(state);

    // Brief pause between actions
    await new Promise((r) => setTimeout(r, 500));
  }

  if (stepCount >= maxSteps) {
    addLog(state, 'error', 'Reached maximum steps. Stopping.');
  }

  state.running = false;
  await saveState(state);
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const state = await getState();

    switch (msg.type) {
      // --- Popup: Start agent ---
      case 'START_AGENT': {
        const task = String(msg.task || '').trim();
        if (!task) {
          sendResponse({ error: 'No task provided' });
          return;
        }
        if (state.running) {
          sendResponse({ error: 'Agent already running' });
          return;
        }

        try {
          // Create dedicated sandbox tab
          const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
          const tabId = tab.id!;

          // Wait for tab to be ready, then inject content script
          await new Promise<void>((resolve) => {
            const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
              if (updatedTabId === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            // Timeout fallback
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }, 3000);
          });

          await ensureContentScript(tabId);

          state.task = task;
          state.tabId = tabId;
          state.running = true;
          state.log = [];
          state.extractedData = null;
          addLog(state, 'info', `Sandbox tab #${tabId} created. Starting task: "${task}"`);
          await saveState(state);

          sendResponse({ ok: true, tabId });

          // Run agent loop (don't await — it's long-running)
          agentLoop(state).catch((err) => {
            console.error('Agent loop crashed:', err);
            getState().then((s) => {
              addLog(s, 'error', `Agent crashed: ${(err as Error).message}`);
              s.running = false;
              saveState(s);
            });
          });
        } catch (err) {
          sendResponse({ error: (err as Error).message });
        }
        return;
      }

      // --- Popup: Stop agent ---
      case 'STOP_AGENT': {
        state.running = false;
        addLog(state, 'info', 'Agent stopped by user.');
        await saveState(state);
        sendResponse({ ok: true });
        return;
      }

      // --- Popup: Get state ---
      case 'GET_STATE': {
        sendResponse({ state });
        return;
      }

      // --- Popup: Clear ---
      case 'CLEAR_STATE': {
        const newState: AgentState = { task: '', tabId: null, running: false, log: [], extractedData: null };
        await saveState(newState);
        sendResponse({ ok: true });
        return;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();

  return true; // async sendResponse
});

// Log when background starts
console.log('TabPilot background service worker ready.');
