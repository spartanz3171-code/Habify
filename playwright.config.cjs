const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/browser',
    timeout: 30000,
    fullyParallel: false,
    workers: 1,
    use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', screenshot: 'only-on-failure' },
    projects: [
        { name: 'desktop', use: { channel: 'chrome', viewport: { width: 1280, height: 900 } } },
        { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome', defaultBrowserType: 'chromium' } },
        // WebKit's Windows renderer needs more time for full SVG editor journeys.
        { name: 'webkit-mobile', timeout: 180000, testMatch: /(?:mobile-arena|equipment|habits-progress|habify)\.spec\.cjs/, use: { ...devices['iPhone 13'], browserName: 'webkit' } }
    ],
    webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }
});
