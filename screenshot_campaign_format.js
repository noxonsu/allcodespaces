const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  try {
    // Логин в админку
    await page.goto('https://telewin.wpmix.net/admin/login/', { waitUntil: 'networkidle2' });

    // Ждем появления поля логина
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.type('input[name="username"]', 'AlexeyFrolov');
    await page.type('input[name="password"]', '1234Fgtn@');
    await page.waitForSelector('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    const submitButton = await page.$('button[type="submit"]') || await page.$('input[type="submit"]');
    await submitButton.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Переход на страницу создания новой кампании
    await page.goto('https://telewin.wpmix.net/admin/core/campaign/add/', { waitUntil: 'networkidle2' });

    // Ждем загрузки формы
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Скриншот всей страницы
    await page.screenshot({ path: '/tmp/campaign_format_radiobuttons_full.png', fullPage: true });

    // Скриншот области с полем 'Формат размещения'
    const formatField = await page.$('.field-format');
    if (formatField) {
      await formatField.screenshot({ path: '/tmp/campaign_format_radiobuttons_field.png' });

      // Получаем HTML разметку поля format
      const formatHTML = await formatField.evaluate(el => el.innerHTML);
      console.log('Format field HTML:', formatHTML);
    } else {
      console.log('Format field not found with selector .field-format');

      // Попробуем найти через другие селекторы
      const allFieldDivs = await page.$$('div[class*="field"]');
      console.log(`Found ${allFieldDivs.length} field divs`);
    }

    console.log('Screenshots saved successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
