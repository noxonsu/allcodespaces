/**
 * TELEWIN Admin Smoke Test
 *
 * PURPOSE: Проверка доступности всех основных админских экранов (GET запросы)
 * WHY: Простейший тест для выявления базовых ошибок (миграции, импорты, etc)
 * REF: issue #58
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://telewin.wpmix.net';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'AlexeyFrolov';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234Fgtn@';
const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

// Admin pages to test (GET only)
const ADMIN_PAGES = [
    { name: 'Admin Index', url: '/admin/' },
    { name: 'Channels List', url: '/admin/core/channel/' },
    { name: 'Campaigns List', url: '/admin/core/campaign/' },
    { name: 'Messages List', url: '/admin/core/message/' },
    { name: 'Campaign Channels Stats', url: '/admin/core/campaignchannel/' },
    { name: 'Users List', url: '/admin/core/user/' },
    { name: 'Channel Admins List', url: '/admin/core/channeladmin/' },
    { name: 'Legal Entities List', url: '/admin/core/legalentity/' },
    { name: 'Channel Transactions List', url: '/admin/core/channeltransaction/' },
    { name: 'Payouts List', url: '/admin/core/payout/' },
    { name: 'Message Preview Tokens', url: '/admin/core/messagepreviewtoken/' },
    { name: 'User Login Tokens', url: '/admin/core/userlogintoken/' },
];

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function login(page) {
    console.log('🔐 Logging in as admin...');
    await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'networkidle2' });

    // Check if already logged in
    const currentUrl = page.url();
    if (!currentUrl.includes('/login/')) {
        console.log('✅ Already logged in');
        return;
    }

    // Fill login form - wait for inputs to be visible
    await page.waitForSelector('input[placeholder*="пользователя"], input[name="username"]', { visible: true });
    await page.type('input[placeholder*="пользователя"], input[name="username"]', ADMIN_USERNAME);
    await page.type('input[placeholder*="Пароль"], input[name="password"]', ADMIN_PASSWORD);

    // Click login button - find button with text "Войти"
    const loginButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => btn.textContent.includes('Войти'));
    });

    await Promise.all([
        loginButton.asElement().click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
    ]);

    console.log('✅ Login successful');
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

        // Check HTTP status
        const status = response.status();
        if (status !== 200) {
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
        const screenshotName = `admin-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
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
            const screenshotName = `admin-ERROR-${name.toLowerCase().replace(/\s+/g, '-')}.png`;
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
    console.log('🚀 Starting TeleWin Admin Smoke Tests');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`👤 Admin User: ${ADMIN_USERNAME}`);
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
        // Login first
        await login(page);

        // Test each page
        for (const pageInfo of ADMIN_PAGES) {
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
    const reportPath = path.join(SCREENSHOTS_DIR, 'admin-test-report.json');
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
