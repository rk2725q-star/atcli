import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export class BrowserManager {
    private static instance: BrowserManager;
    private context: BrowserContext | null = null;
    private pages: Map<string, Page> = new Map();

    private constructor() {}

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    public async initialize(): Promise<void> {
        if (this.context) return;

        // Use a local directory to store browser session/cookies
        const userDataDir = path.resolve(process.cwd(), 'browser_profile');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        console.log(`\n[Browser] Launching browser with persistent profile...`);
        this.context = await chromium.launchPersistentContext(userDataDir, {
            headless: false, // Must be false so user can do CAPTCHAs/logins if needed
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-session-crashed-bubble',
                '--hide-crash-restore-window'
            ],
            viewport: null
        });
        
        console.log(`[Browser] Browser context initialized.`);
    }

    public async getOrCreatePage(id: string, url: string): Promise<Page> {
        if (!this.context) {
            await this.initialize();
        }

        if (this.pages.has(id)) {
            return this.pages.get(id)!;
        }

        console.log(`[Browser] Opening new tab for ${id}...`);
        const page = await this.context!.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        this.pages.set(id, page);
        return page;
    }

    public async closeAll(): Promise<void> {
        console.log(`\n[Browser] Shutting down browser gracefully...`);
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        this.pages.clear();
    }

    public async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.pages.clear();
        }
    }
}
