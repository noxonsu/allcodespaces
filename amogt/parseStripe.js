const puppeteer = require('puppeteer');
const fs = require('fs').promises; // Import fs.promises for async file operations
const path = require('path'); // To construct file paths

async function getPaymentDetails(url) {
  let browser;
  try {
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Save page content for debugging
    const pageContent = await page.content();
    const debugFilePath = path.join(__dirname, 'debug_page.html'); // Save in the same directory as the script
    await fs.writeFile(debugFilePath, pageContent);
    console.log(`Page content saved to ${debugFilePath}`);

    // Wait for the element with class CurrencyAmount to appear
    await page.waitForSelector('.CurrencyAmount', { timeout: 60000 }); // Increased timeout

    // Extract the text content
    const paymentInfo = await page.evaluate(() => {
      const element = document.querySelector('.CurrencyAmount');
      return element ? element.innerText : null;
    });

    if (paymentInfo) {
      // Assuming the format is like "$10.00" or "€25.50"
      // This regex tries to capture common currency symbols and the amount
      const match = paymentInfo.match(/([^\d.,\s]+)?\s*([\d.,]+)\s*([^\d.,\s]+)?/);
      if (match) {
        let currency = match[1] || match[3] || ''; // Symbol might be before or after
        let amount = match[2];
        
        // A more robust way to separate currency from amount might be needed
        // depending on the exact format and variability.
        // For "US$18", this simple split might work:
        if (!currency && amount.includes('$')) { // Heuristic for cases like "US$18"
            const parts = amount.split(/(\$)/); // Split by $
            if (parts.length >= 2) {
                currency = parts.find(p => p.includes('$') && p.length > 1) || parts.find(p => p === '$'); // e.g. US$ or $
                amount = parts.find(p => !isNaN(parseFloat(p)) && p !== currency);
            }
        } else if (currency && amount.startsWith(currency.trim())) {
            // If currency symbol was captured as part of amount, e.g. "$10.00" -> currency="$", amount="$10.00"
            amount = amount.substring(currency.trim().length);
        }


        console.log('Raw extracted text:', paymentInfo);
        console.log('Currency:', currency.trim());
        console.log('Amount:', amount.trim());
      } else {
        console.log('Could not parse payment info:', paymentInfo);
      }
    } else {
      console.log('CurrencyAmount element not found or has no text.');
    }

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

const url = 'https://pay.openai.com/c/pay/cs_live_a1zjfp64CRdIHqqWCCdJq0y6r76TwD1WfJJaM1MUtq9oOZeZBiodHDqLEb#fidpamZkaWAnPydgaycpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl';
getPaymentDetails(url);
