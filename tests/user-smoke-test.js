/**
 * TELEWIN User/Owner Smoke Test
 *
 * PURPOSE: Проверка доступности пользовательских экранов (не-админка)
 * WHY: Проверка что владельцы каналов могут видеть свои данные
 * REF: issue #58
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://telewin.wpmix.net';
const USER_EMAIL = process.env.USER_EMAIL || 'i448539@gmail.com';
const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

// User pages to test (GET only, non-admin)
const USER_PAGES = [
    { name: 'Homepage', url: '/' },
    { name: 'Login Page', url: '/login/' },
    { name: 'API Docs Swagger', url: '/docs/' },
    { name: 'API Docs Redoc', url: '/redoc/' },
];

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function testPage(page, pageInfo) {
    const { name, url } = pageInfo;
    const startTime = Date.now();

    try {
        console.log(`\n📄 Testing: ${name}`);
        console.log(`   URL: ${BASE_URL}${url}`);

        // Navigate to page
        const response = await page.goto(`${BASE_URL}${url}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Check HTTP status (allow redirects)
        const status = response.status();
        if (status >= 400) {
            throw new Error(`HTTP ${status}`);
        }

        // Check for Django error pages
        const bodyHTML = await page.content();
        const hasDjangoError = bodyHTML.includes('ProgrammingError') ||
                               bodyHTML.includes('OperationalError') ||
                               bodyHTML.includes('DoesNotExist') ||
                               bodyHTML.includes('Traceback');

        if (hasDjangoError) {
            throw new Error('Django error detected in page content');
        }

        // Take screenshot
        const screenshotName = `user-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
        const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });

        const duration = Date.now() - startTime;
        console.log(`   ✅ PASSED (${duration}ms)`);
        console.log(`   📸 Screenshot: ${screenshotPath}`);

        return {
            name,
            url,
            status: 'PASSED',
            duration,
            screenshot: screenshotPath
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   ❌ FAILED (${duration}ms)`);
        console.log(`   Error: ${error.message}`);

        // Take error screenshot
        try {
            const screenshotName = `user-ERROR-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
            const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });
            console.log(`   📸 Error screenshot: ${screenshotPath}`);
        } catch (screenshotError) {
            console.log(`   ⚠️ Could not take error screenshot: ${screenshotError.message}`);
        }

        return {
            name,
            url,
            status: 'FAILED',
            error: error.message,
            duration,
        };
    }
}

async function runTests() {
    console.log('🚀 Starting TeleWin User Smoke Tests');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
    console.log('━'.repeat(60));

    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const results = [];

    try {
        // Test each page
        for (const pageInfo of USER_PAGES) {
            const result = await testPage(page, pageInfo);
            results.push(result);

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    } finally {
        await browser.close();
    }

    // Print summary
    console.log('\n' + '━'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('━'.repeat(60));

    const passed = results.filter(r => r.status === 'PASSED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    const total = results.length;

    console.log(`\n✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);

    if (failed > 0) {
        console.log('\n❌ Failed tests:');
        results.filter(r => r.status === 'FAILED').forEach(r => {
            console.log(`   - ${r.name}: ${r.error}`);
        });
    }

    // Save JSON report
    const reportPath = path.join(SCREENSHOTS_DIR, 'user-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        summary: { total, passed, failed },
        results
    }, null, 2));

    console.log(`\n📄 Full report: ${reportPath}`);
    console.log('━'.repeat(60));

    // Exit with error code if tests failed
    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
