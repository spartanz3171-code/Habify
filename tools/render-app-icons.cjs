// Export the original vector logo to correctly sized PWA icons. Development only.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const dir = path.join(__dirname, '../assets/icons');
(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
        const page = await browser.newPage();
        const svg = fs.readFileSync(path.join(dir, 'habify.svg'), 'utf8');
        for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
            const png = await page.evaluate(async ({ svg, size }) => {
                const image = new Image();
                image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                await image.decode();
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
                canvas.getContext('2d').drawImage(image, 0, 0, size, size);
                return canvas.toDataURL('image/png').split(',')[1];
            }, { svg, size });
            fs.writeFileSync(path.join(dir, name), Buffer.from(png, 'base64'));
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
