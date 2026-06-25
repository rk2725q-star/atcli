import { AgentSkill } from './base';
import { chromium, Browser, Page } from 'playwright';

class BrowserSessionManager {
    private static instance: BrowserSessionManager;
    private browser: Browser | null = null;
    private page: Page | null = null;

    private constructor() {}

    public static getInstance(): BrowserSessionManager {
        if (!BrowserSessionManager.instance) {
            BrowserSessionManager.instance = new BrowserSessionManager();
        }
        return BrowserSessionManager.instance;
    }

    public async getPage(): Promise<Page> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: false });
        }
        if (!this.page || this.page.isClosed()) {
            const context = await this.browser.newContext();
            this.page = await context.newPage();
        }
        return this.page;
    }

    public async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

const sessionManager = BrowserSessionManager.getInstance();

export const BrowserGotoSkill: AgentSkill = {
    name: 'browser_goto',
    description: 'Navigate the native ATCLI browser to a URL.',
    example: `<tool_call>\n{"action": "browser_goto", "url": "https://google.com"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.url) return "Error: url is required";
        try {
            const page = await sessionManager.getPage();
            await page.goto(args.url, { waitUntil: 'domcontentloaded' });
            return `Successfully navigated to ${args.url}`;
        } catch (e: any) {
            return `Error navigating: ${e.message}`;
        }
    }
};

export const BrowserGetAnnotatedStateSkill: AgentSkill = {
    name: 'browser_get_annotated_state',
    description: 'Injects visual bounding boxes (Set-of-Mark) over all interactive elements on the page, returning a base64 screenshot and a mapping of ID to element tag/text. Pass this screenshot to a vision model so it can decide which ID to click.',
    example: `<tool_call>\n{"action": "browser_get_annotated_state"}\n</tool_call>`,
    execute: async () => {
        try {
            const page = await sessionManager.getPage();
            
            // 1. Inject DOM Annotation Script (OpenClaw replica)
            const mapData = await page.evaluate(() => {
                // Remove old labels if any
                document.querySelectorAll('.atcli-som-label').forEach(el => el.remove());

                let idCounter = 1;
                const mapping: any = {};
                
                const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]');
                elements.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    // Must be visible
                    if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight) return;

                    const id = idCounter++;
                    mapping[id] = {
                        tag: el.tagName.toLowerCase(),
                        text: (el as HTMLElement).innerText?.slice(0, 30) || (el as HTMLInputElement).value?.slice(0, 30) || el.getAttribute('aria-label') || '',
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                    };

                    // Draw the visual box
                    const label = document.createElement('div');
                    label.className = 'atcli-som-label';
                    label.innerText = `[${id}]`;
                    label.style.position = 'absolute';
                    label.style.left = `${rect.left}px`;
                    label.style.top = `${rect.top}px`;
                    label.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
                    label.style.color = 'white';
                    label.style.fontSize = '12px';
                    label.style.fontWeight = 'bold';
                    label.style.padding = '2px';
                    label.style.zIndex = '999999';
                    label.style.pointerEvents = 'none'; // Don't block clicks
                    label.style.border = '2px solid red';
                    document.body.appendChild(label);
                });

                // Attach mapping to window for click_element to use later
                (window as any).__atcliSomMapping = mapping;
                return mapping;
            });

            // 2. Take Screenshot of annotated page
            await page.waitForTimeout(500); // let DOM update
            const buffer = await page.screenshot({ type: 'png' });
            const base64 = buffer.toString('base64');

            return JSON.stringify({
                message: "Page annotated successfully. Use the image mapping to choose an ID.",
                elementMapping: mapData,
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
        if (!args.elementId) return "Error: elementId is required";
        try {
            const page = await sessionManager.getPage();
            
            // Retrieve coordinates from window mapping
            const coords = await page.evaluate((id: number) => {
                const map = (window as any).__atcliSomMapping;
                if (!map || !map[id]) return null;
                return { x: map[id].x, y: map[id].y };
            }, args.elementId);

            if (!coords) return `Error: ID ${args.elementId} not found. Call browser_get_annotated_state first.`;

            await page.mouse.click(coords.x, coords.y);
            return `Successfully clicked element ID ${args.elementId} at (${coords.x}, ${coords.y})`;

        } catch (e: any) {
            return `Error clicking element: ${e.message}`;
        }
    }
};

export const BrowserTypeElementSkill: AgentSkill = {
    name: 'browser_type_element',
    description: 'Clicks an element based on its ID and types text into it.',
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
            await page.waitForTimeout(200);
            
            // Clean annotations so they don't block typing if inside
            await page.evaluate(() => {
                document.querySelectorAll('.atcli-som-label').forEach(el => el.remove());
            });

            await page.keyboard.press('Control+A');
            await page.keyboard.insertText(args.text);
            
            return `Successfully typed into element ID ${args.elementId}`;

        } catch (e: any) {
            return `Error typing: ${e.message}`;
        }
    }
};

export const BrowserCloseSkill: AgentSkill = {
    name: 'browser_close',
    description: 'Closes the native ATCLI browser session.',
    example: `<tool_call>\n{"action": "browser_close"}\n</tool_call>`,
    execute: async () => {
        await sessionManager.close();
        return "Browser closed successfully.";
    }
};
