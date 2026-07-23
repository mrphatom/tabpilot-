// TabPilot Content Script
// Injected into the sandbox tab to execute browser actions from the agent.

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'PING': {
        sendResponse({ pong: true, url: location.href, title: document.title });
        return;
      }

      case 'GET_PAGE_STATE': {
        const text = document.body?.innerText?.slice(0, 8000) || '';
        const interactive = getInteractiveElements();
        sendResponse({ url: location.href, title: document.title, text, interactive });
        return;
      }

      case 'EXECUTE_ACTION': {
        try {
          const result = await executeAction(msg);
          sendResponse(result);
        } catch (err) {
          sendResponse({ error: (err as Error).message });
        }
        return;
      }

      default:
        sendResponse({ error: `Unknown message: ${msg.type}` });
    }
  })();

  return true; // async sendResponse
});

// ---------------------------------------------------------------------------
// Interactive element scanner
// ---------------------------------------------------------------------------

function getInteractiveElements(): Array<{
  tag: string;
  id: string;
  classes: string;
  text: string;
  selector: string;
  type?: string;
  href?: string;
  placeholder?: string;
  ariaLabel?: string;
}> {
  const elements: ReturnType<typeof getInteractiveElements> = [];
  const selectors = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
  ];

  const seen = new Set<Element>();
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);

        const tag = el.tagName.toLowerCase();
        const id = el.id || '';
        const classes = Array.from(el.classList).slice(0, 3).join(' ');
        const text = (el as HTMLElement).innerText?.trim().slice(0, 80) || '';
        const ariaLabel = el.getAttribute('aria-label') || '';

        // Build a unique-ish selector
        let selector = '';
        if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (ariaLabel) {
          selector = `[aria-label="${ariaLabel}"]`;
        } else if (classes && tag !== 'a') {
          selector = `${tag}.${classes.split(' ').map((c) => CSS.escape(c)).join('.')}`;
        } else if (text && text.length < 40) {
          selector = `${tag}`;
        } else {
          selector = tag;
        }

        const entry: ReturnType<typeof getInteractiveElements>[0] = {
          tag,
          id,
          classes,
          text,
          selector,
        };

        if (tag === 'input') {
          const input = el as HTMLInputElement;
          entry.type = input.type;
          if (input.placeholder) entry.placeholder = input.placeholder;
        }
        if (tag === 'a') {
          entry.href = (el as HTMLAnchorElement).href;
        }
        if (ariaLabel) {
          entry.ariaLabel = ariaLabel;
        }

        elements.push(entry);
      });
    } catch {
      // CSS.escape can fail on malformed class names; skip that element
    }
  }

  // Return top 50
  return elements.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Find element by selector or text
// ---------------------------------------------------------------------------

function findElement(selector: string): Element | null {
  if (!selector) return null;

  // Try as CSS selector first
  try {
    const el = document.querySelector(selector);
    if (el) return el;
  } catch {
    // Invalid CSS selector
  }

  // Try as text match on interactive elements
  const lower = selector.toLowerCase();
  const candidates = document.querySelectorAll(
    'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"]'
  );
  for (const el of candidates) {
    const text = ((el as HTMLElement).innerText || '').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (el as HTMLInputElement).placeholder?.toLowerCase() || '';
    const value = (el as HTMLInputElement).value?.toLowerCase() || '';
    if (
      text.includes(lower) ||
      aria.includes(lower) ||
      placeholder.includes(lower) ||
      value.includes(lower)
    ) {
      return el;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

function highlightElement(el: Element): void {
  const origOutline = (el as HTMLElement).style.outline;
  const origBg = (el as HTMLElement).style.backgroundColor;
  (el as HTMLElement).style.outline = '3px solid #4f8cff';
  (el as HTMLElement).style.backgroundColor = 'rgba(79, 140, 255, 0.15)';
  setTimeout(() => {
    (el as HTMLElement).style.outline = origOutline;
    (el as HTMLElement).style.backgroundColor = origBg;
  }, 2000);
}

async function executeAction(msg: {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  pixels?: number;
  ms?: number;
}): Promise<unknown> {
  switch (msg.action) {
    // ---- Navigate ----
    case 'navigate': {
      if (!msg.url) return { error: 'No URL provided' };
      location.href = msg.url;
      return { navigated: msg.url };
    }

    // ---- Click ----
    case 'click': {
      if (!msg.selector) return { error: 'No selector provided' };
      const el = findElement(msg.selector);
      if (!el) return { error: `Element not found: ${msg.selector}` };

      highlightElement(el);
      (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
      await sleep(200);

      // Try multiple click methods
      try {
        (el as HTMLElement).click();
      } catch {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      await sleep(500); // Wait for any navigation / DOM update
      return { clicked: msg.selector, url: location.href, title: document.title };
    }

    // ---- Type ----
    case 'type': {
      if (!msg.selector) return { error: 'No selector provided' };
      const el = findElement(msg.selector) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return { error: `Element not found: ${msg.selector}` };

      highlightElement(el);
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      await sleep(200);

      // Focus and clear
      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // Select all existing text
        el.select();
      }

      // Type character by character for realism
      const text = msg.text || '';
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      return { typed: `"${text.slice(0, 50)}" into ${msg.selector}` };
    }

    // ---- Extract ----
    case 'extract': {
      const bodyText = document.body?.innerText || '';
      return { text: bodyText.slice(0, 10000), charCount: bodyText.length };
    }

    // ---- Scroll ----
    case 'scroll': {
      const px = msg.pixels || 500;
      window.scrollBy({ top: px, behavior: 'smooth' });
      await sleep(600);
      return { scrolled: px, scrollY: window.scrollY };
    }

    // ---- Wait ----
    case 'wait': {
      const ms = msg.ms || 2000;
      await sleep(ms);
      return { waited: ms };
    }

    default:
      return { error: `Unknown action: ${msg.action}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
