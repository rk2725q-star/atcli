const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://chat.qwenlm.ai/');
    await page.waitForTimeout(5000); // Give it time to load
    
    // We can't see a real chat without logging in, but maybe we can see the empty state classes
    const classes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div')).map(d => d.className).filter(c => c && typeof c === 'string' && c.includes('message'));
    });
    
    console.log(classes);
    await browser.close();
})();
