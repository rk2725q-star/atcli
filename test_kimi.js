const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://kimi.moonshot.cn/en');
    
    // Wait for the page to load
    await page.waitForTimeout(5000);
    
    const inputs = await page.evaluate(() => {
        const textareas = Array.from(document.querySelectorAll('textarea'));
        const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        
        return [...textareas, ...editables].map(el => {
            let placeholder = el.getAttribute('placeholder') || el.getAttribute('data-placeholder');
            let parent = el.parentElement;
            let depth = 0;
            while (!placeholder && parent && depth < 3) {
                placeholder = parent.getAttribute('data-placeholder');
                parent = parent.parentElement;
                depth++;
            }
            
            return {
                tag: el.tagName,
                className: el.className,
                id: el.id,
                placeholder: placeholder,
                innerText: el.innerText.substring(0, 50)
            };
        });
    });
    
    console.log(JSON.stringify(inputs, null, 2));
    await browser.close();
})();
