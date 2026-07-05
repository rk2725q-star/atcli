import { AgentSkill } from './base';
import { Page } from 'playwright';
import { BrowserManager } from '../../browser/manager';

// ─────────────────────────────────────────────────────────────────────────────
// FIX A — Shared Browser Session Manager
// Previously: BrowserSessionManager called chromium.launch() → second blank Chrome
// Now: Uses the SAME BrowserManager singleton that the AI provider already opened
// Result: ONE Chrome window total, OpenClaw tasks open as new TABS in existing browser
// This means YouTube/Google/DeepSeek all share the same logged-in profile
// ─────────────────────────────────────────────────────────────────────────────
class SharedBrowserSession {
    private static instance: SharedBrowserSession;
    private _page: Page | null = null;

    private constructor() {}

    public static getInstance(): SharedBrowserSession {
        if (!SharedBrowserSession.instance) {
            SharedBrowserSession.instance = new SharedBrowserSession();
        }
        return SharedBrowserSession.instance;
    }

    /** Get or create the OpenClaw task page — always in the SHARED BrowserManager context */
    public async getPage(): Promise<Page> {
        const manager = BrowserManager.getInstance();
        await manager.initialize();

        if (this._page && !this._page.isClosed()) {
            return this._page;
        }

        if (!manager.context) {
            throw new Error('BrowserManager context not initialized. Is the AI provider running?');
        }

        console.log('[Browser] Opening new OpenClaw task tab in shared browser...');
        const page = await manager.context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            (window as any).navigator.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        this._page = page;
        return this._page;
    }

    public async close(): Promise<void> {
        if (this._page && !this._page.isClosed()) {
            await this._page.close();
            this._page = null;
        }
    }
}

const sessionManager = SharedBrowserSession.getInstance();

// ── Helper: fast page wait (FIX B — speed) ────────────────────────────────────
// Old: waitForLoadState('networkidle') → waits for ALL network to stop (10s+ on YouTube)
// New: domcontentloaded + 1.5s max cap → page is usable, no wasted waiting
async function fastWait(page: Page): Promise<void> {
    await Promise.race([
        page.waitForLoadState('domcontentloaded'),
        new Promise(r => setTimeout(r, 1500))
    ]);
}

// ── Skills ────────────────────────────────────────────────────────────────────

export const BrowserGotoSkill: AgentSkill = {
    name: 'browser_goto',
    description: 'Navigate the ATCLI browser to a URL. Opens in the shared Chrome window.',
    example: `<tool_call>\n{"action": "browser_goto", "url": "https://google.com"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.url) return "Error: url is required";
        try {
            const page = await sessionManager.getPage();
            await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            return `Successfully navigated to ${args.url}`;
        } catch (e: any) {
            return `Error navigating: ${e.message}`;
        }
    }
};

export const BrowserGetAnnotatedStateSkill: AgentSkill = {
    name: 'browser_get_annotated_state',
    description: 'Injects visual bounding boxes (Set-of-Mark) over all interactive elements on the page, returning a base64 screenshot and a mapping of ID to element tag/text. Use this to SEE the page and choose what to click.',
    example: `<tool_call>\n{"action": "browser_get_annotated_state"}\n</tool_call>`,
    execute: async () => {
        try {
            const page = await sessionManager.getPage();
            await fastWait(page); // FIX B: fast wait instead of networkidle

            const mapData = await page.evaluate(() => {
                document.querySelectorAll('.atcli-som-label').forEach(el => el.remove());
                let idCounter = 1;
                const mapping: any = {};
                const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]');
                elements.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight) return;
                    const id = idCounter++;
                    mapping[id] = {
                        tag: el.tagName.toLowerCase(),
                        text: (el as HTMLElement).innerText?.slice(0, 30) || (el as HTMLInputElement).value?.slice(0, 30) || el.getAttribute('aria-label') || '',
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                    };
                    const label = document.createElement('div');
                    label.className = 'atcli-som-label';
                    label.innerText = `[${id}]`;
                    label.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;background:rgba(255,0,0,0.85);color:white;font-size:11px;font-weight:bold;padding:2px 4px;z-index:999999;pointer-events:none;border:2px solid red;border-radius:2px;`;
                    document.body.appendChild(label);
                });
                (window as any).__atcliSomMapping = mapping;

                // ✅ Auto-expire: remove ALL annotations after 8 seconds automatically
                // This prevents red boxes from persisting after task completes
                setTimeout(() => {
                    document.querySelectorAll('.atcli-som-label').forEach(el => el.remove());
                }, 8000);

                return mapping;
            });

            await page.waitForTimeout(300); // let labels render
            const buffer = await page.screenshot({ type: 'png', fullPage: false });
            const base64 = buffer.toString('base64');

            const elementSummary = Object.entries(mapData)
                .slice(0, 30)
                .map(([id, el]: any) => `[${id}] ${el.tag}: "${el.text}" @ (${Math.round(el.x)},${Math.round(el.y)})`)
                .join('\n');

            return JSON.stringify({
                message: `Page annotated. ${Object.keys(mapData).length} elements found. Use browser_click_element with an ID.`,
                elementSummary,
                screenshotBase64: base64
            });

        } catch (e: any) {
            return `Error annotating state: ${e.message}`;
        }
    }
};

export const BrowserClickElementSkill: AgentSkill = {
    name: 'browser_click_element',
    description: 'Clicks an element based on the ID generated by browser_get_annotated_state.',
    example: `<tool_call>\n{"action": "browser_click_element", "elementId": 12}\n</tool_call>`,
    execute: async (args: any) => {
        // ✅ Fix: accept both "elementId" and "id" — AI sometimes sends "id" instead
        const elementId = args.elementId ?? args.id;
        if (!elementId) return "Error: elementId is required (or use \"id\" as alias)";
        try {
            const page = await sessionManager.getPage();
            const coords = await page.evaluate((id: number) => {
                const map = (window as any).__atcliSomMapping;
                if (!map || !map[id]) return null;
                return { x: map[id].x, y: map[id].y };
            }, elementId);

            if (!coords) return `Error: ID ${elementId} not found. Call browser_get_annotated_state first.`;
            await page.mouse.click(coords.x, coords.y);

            // ✅ Auto-cleanup: remove annotation boxes immediately after clicking
            // Keeps the page clean — no red boxes persisting after the click
            await page.evaluate(() => {
                document.querySelectorAll('.atcli-som-label').forEach(el => el.remove());
            });

            return `Clicked element ID ${elementId} at (${Math.round(coords.x)}, ${Math.round(coords.y)}). Annotations cleared.`;
        } catch (e: any) {
            return `Error clicking element: ${e.message}`;
        }
    }
};

export const BrowserVisionActSkill: AgentSkill = {
    name: 'browser_vision_act',
    description: 'Takes a screenshot of the current browser tab and sends it to cloud AI for visual analysis. Use this to SEE the page. The AI will tell you what to click next.',
    example: `<tool_call>\n{"action": "browser_vision_act", "instruction": "What should I click to search?"}\n</tool_call>`,
    execute: async (args: any) => {
        try {
            const page = await sessionManager.getPage();
            await fastWait(page); // FIX B: fast wait, not networkidle

            // ✅ In-memory only — Buffer in RAM, never written to disk
            const screenshotBuffer = await page.screenshot({ fullPage: false });
            const base64Image = screenshotBuffer.toString('base64');

            return `__ATCLI_VISION_PAYLOAD__base64::${base64Image}__Please analyze this screenshot and tell me the next coordinates or action based on my instruction: ${args.instruction || 'Analyze screen'}`;
        } catch (e: any) {
            return `Error capturing vision state: ${e.message}`;
        }
    }
};

export const BrowserTypeElementSkill: AgentSkill = {
    name: 'browser_type_element',
    description: 'Clicks an element by its annotated ID and types text into it.',
    example: `<tool_call>\n{"action": "browser_type_element", "elementId": 15, "text": "Hello world"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.elementId || !args.text) return "Error: elementId and text are required";
        try {
            const page = await sessionManager.getPage();
            const coords = await page.evaluate((id: number) => {
                const map = (window as any).__atcliSomMapping;
                if (!map || !map[id]) return null;
                return { x: map[id].x, y: map[id].y };
            }, args.elementId);

            if (!coords) return `Error: ID ${args.elementId} not found.`;
            await page.mouse.click(coords.x, coords.y);
            await page.waitForTimeout(150);
            await page.evaluate(() => { document.querySelectorAll('.atcli-som-label').forEach(el => el.remove()); });
            await page.keyboard.press('Control+A');
            await page.keyboard.insertText(args.text);
            return `Typed "${args.text}" into element ID ${args.elementId}`;
        } catch (e: any) {
            return `Error typing: ${e.message}`;
        }
    }
};

export const BrowserCloseSkill: AgentSkill = {
    name: 'browser_close',
    description: 'Closes the OpenClaw task tab.',
    example: `<tool_call>\n{"action": "browser_close"}\n</tool_call>`,
    execute: async () => {
        await sessionManager.close();
        return "Browser task tab closed.";
    }
};

export const BrowserSmartClickSkill: AgentSkill = {
    name: 'browser_smart_click',
    description: 'Instantly clicks any visible element by its text content — buttons, links, thumbnails, menu items. Fastest way to click known elements. No annotations needed.',
    example: `<tool_call>\n{"action": "browser_smart_click", "text": "Sign in"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.text) return "Error: text is required";
        try {
            const page = await sessionManager.getPage();
            const locator = page.getByText(args.text, { exact: false }).first();
            await locator.waitFor({ state: 'visible', timeout: 4000 });
            await locator.click();
            return `Clicked element with text: "${args.text}"`;
        } catch (e: any) {
            return `Could not find element with text "${args.text}". Use browser_get_annotated_state to see the page and pick an ID.`;
        }
    }
};
