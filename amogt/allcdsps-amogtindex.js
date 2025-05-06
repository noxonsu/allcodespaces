#!/usr/bin/env node
const path = require('path'); 
const { google } = require('googleapis');
const config = require('./config'); 
const { startAmoWebhookListener, pushToGoogleSheet } = require('./amo2gtables'); // Import pushToGoogleSheet
const { startGoogleSheetSync } = require('./gtables2amo');
const fs = require('fs').promises; 

// dotenv.config is now handled in config.js
// const TOKENS_PATH = path.join(__dirname, 'amo_tokens.json'); // Now from config.AMO_TOKENS_PATH

function getAuthUrl() {
    return `https://www.amocrm.ru/oauth?client_id=${config.AMO_INTEGRATION_ID}&mode=popup`;
}

async function getNewTokens(authCode) {
    console.log('Attempting to get new tokens with authCode:', authCode ? 'provided' : 'MISSING');
    if (!authCode) {
        throw new Error('Authorization code is missing for getNewTokens.');
    }
    const response = await fetch(`${config.AMO_DOMAIN}/oauth2/access_token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: config.AMO_INTEGRATION_ID,
            client_secret: config.AMO_SECRET_KEY,
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: config.AMO_REDIRECT_URI // Use config.AMO_REDIRECT_URI
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Failed to get new tokens. Status:', response.status, 'Body:', errorBody);
        throw new Error(`Failed to get new tokens: ${response.status}. Body: ${errorBody}`);
    }

    const tokens = await response.json();
    console.log('Successfully obtained new tokens.');
    await saveTokens(tokens);
    return tokens;
}

async function refreshTokens(refreshToken) {
    console.log('Attempting to refresh tokens.');
    const response = await fetch(`${config.AMO_DOMAIN}/oauth2/access_token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: config.AMO_INTEGRATION_ID,
            client_secret: config.AMO_SECRET_KEY,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            redirect_uri: config.AMO_REDIRECT_URI // Use config.AMO_REDIRECT_URI
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Failed to refresh tokens. Status:', response.status, 'Body:', errorBody);
        throw new Error(`Failed to refresh tokens: ${response.status}. Body: ${errorBody}`);
    }

    const tokens = await response.json();
    console.log('Successfully refreshed tokens.');
    await saveTokens(tokens);
    return tokens;
}

async function saveTokens(tokens) {
    console.log('Saving tokens to:', config.AMO_TOKENS_PATH);
    await fs.writeFile(config.AMO_TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function loadTokens() {
    try {
        console.log('Attempting to load tokens from:', config.AMO_TOKENS_PATH);
        const data = await fs.readFile(config.AMO_TOKENS_PATH, 'utf8');
        console.log('Tokens loaded successfully.');
        return JSON.parse(data);
    } catch (error) {
        console.log('No tokens file found or error reading tokens:', error.message);
        return null;
    }
}

async function checkAmoAccess() {
    let tokens = await loadTokens();
    let amoAuthCodeUsed = false;

    if (!tokens) {
        console.log('No stored tokens found.');
        const authCodeFromEnv = config.AMO_AUTH_CODE; 
        if (authCodeFromEnv) {
            console.log('AMO_AUTH_CODE found in config. Attempting to get initial tokens.');
            try {
                tokens = await getNewTokens(authCodeFromEnv);
                amoAuthCodeUsed = true;
                console.log('Successfully obtained tokens using AMO_AUTH_CODE. It is recommended to remove AMO_AUTH_CODE from .env now.');
            } catch (error) {
                console.error('Failed to get tokens using AMO_AUTH_CODE from config:', error.message);
            }
        }
    }

    if (tokens) {
        try {
            console.log('Attempting to verify access token.');
            let response = await fetch(`${config.AMO_DOMAIN}/api/v4/leads`, {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });

            if (response.status === 401 && tokens.refresh_token) {
                console.log('Access token expired or invalid (401). Attempting to refresh.');
                try {
                    tokens = await refreshTokens(tokens.refresh_token);
                    console.log('Retrying API call with new refreshed access token.');
                    response = await fetch(`${config.AMO_DOMAIN}/api/v4/leads`, {
                        headers: {
                            'Authorization': `Bearer ${tokens.access_token}`
                        }
                    });
                } catch (refreshError) {
                    console.error('Failed to refresh token:', refreshError.message);
                    tokens = null; 
                }
            }

            if (tokens && response.ok) {
                console.log('✅ Доступ к API AmoCRM подтвержден');
                return tokens; // Return tokens on success
            } else if (tokens) {
                const errorText = await response.text();
                console.error(`API AmoCRM request failed. Status: ${response.status}. Response: ${errorText}`);
            }
        } catch (apiError) {
            console.error('Error during AmoCRM API access check:', apiError.message);
        }
    }
    
    console.error(`
--------------------------------------------------------------------
ОШИБКА ДОСТУПА К AmoCRM или НЕОБХОДИМА АВТОРИЗАЦИЯ!
${amoAuthCodeUsed ? 'Попытка использовать AMO_AUTH_CODE из конфигурации не удалась или полученные токены не работают.' : ''}

Для работы необходимо получить НОВЫЙ код авторизации AmoCRM:
1. Перейдите по ссылке: ${getAuthUrl()}
2. Разрешите доступ приложению.
3. После перенаправления на ${config.AMO_DOMAIN}, скопируйте значение параметра 'code' из адресной строки браузера.
   Пример URL: ${config.AMO_DOMAIN}/?code=ВАШ_КОД_АВТОРИЗАЦИИ&referer=...
4. Вставьте этот НОВЫЙ код в файл .env как AMO_AUTH_CODE=ВАШ_КОД_АВТОРИЗАЦИИ
5. Перезапустите приложение. Старый код авторизации (если был) уже недействителен.
--------------------------------------------------------------------
`);
    process.exit(1);
}

async function checkGoogleCredentials() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: config.GOOGLE_KEY_FILE, // Use from config
            scopes: config.GOOGLE_SCOPES     // Use from config
        });

        // Try to initialize the credentials
        await auth.getClient();
        console.log('✅ Google credentials подтверждены');
        return true;
    } catch (error) {
        console.error(`
--------------------------------------------------------------------
ОШИБКА ДОСТУПА К Google Sheets!

Проверьте файл mycity2_key.json:
1. Убедитесь что файл существует
2. Проверьте права доступа файла
3. Проверьте валидность JSON данных
4. Убедитесь что сервисный аккаунт имеет доступ к таблицам
--------------------------------------------------------------------
`);
        console.error('❌ Ошибка Google credentials:', error.message);
        process.exit(1);
    }
}

async function fetchAndVerifyLeads(accessToken) {
    console.log('\n--- Проверка последних сделок в AmoCRM и Google Sheet ---');
    if (!accessToken) {
        console.error('Нет accessToken для получения сделок AmoCRM.');
        return;
    }

    try {
        // 1. Fetch latest 5 leads from AmoCRM
        const leadsUrl = `${config.AMO_DOMAIN}/api/v4/leads?limit=5&order[created_at]=desc&with=contacts`;
        console.log(`Fetching leads from: ${leadsUrl}`);
        const amoResponse = await fetch(leadsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!amoResponse.ok) {
            console.error(`Ошибка получения сделок из AmoCRM: ${amoResponse.status} ${await amoResponse.text()}`);
            return;
        }
        const amoData = await amoResponse.json();
        const leads = amoData?._embedded?.leads || [];

        if (leads.length === 0) {
            console.log('Не найдено сделок в AmoCRM.');
            return;
        }
        console.log(`Получено ${leads.length} последних сделок из AmoCRM.`);

        // 2. Authenticate Google Sheets (only if needed)
        let sheetsService = null;
        let sheetValues = [];
        let googleAuthAttempted = false;

        // 3. Process and compare
        for (const lead of leads) {
            console.log(`\nProcessing Lead ID: ${lead.id} (Name: ${lead.name}, Created: ${new Date(lead.created_at * 1000).toLocaleString()})`);
            
            let paymentLinkValue = null;
            const targetCustomFieldName = "Ссылка на оплату";

            if (lead.custom_fields_values && lead.custom_fields_values.length > 0) {
                console.log("  Custom Fields:");
                lead.custom_fields_values.forEach(cf => {
                    const cfValues = cf.values.map(v => v.value).join(', ');
                    console.log(`    - ${cf.field_name} (ID: ${cf.field_id}): ${cfValues}`);
                    if (cf.field_name === targetCustomFieldName && cf.values.length > 0 && cf.values[0].value) {
                        const tempLink = String(cf.values[0].value).trim();
                        if (tempLink !== '') {
                            paymentLinkValue = tempLink;
                        }
                    }
                });
            } else {
                console.log("  No custom fields for this lead.");
            }

            if (!paymentLinkValue) {
                console.log(`  Пропускаем лид ID ${lead.id}: отсутствует или пустое значение для кастомного поля '${targetCustomFieldName}'.`);
                continue; // Skip to the next lead
            }

            // If we reach here, the lead has "Ссылка на оплату". Now check Google Sheet.
            // Authenticate and read sheet only once if needed
            if (!googleAuthAttempted) {
                googleAuthAttempted = true;
                try {
                    const googleAuth = new google.auth.GoogleAuth({
                        keyFile: config.GOOGLE_KEY_FILE,
                        scopes: config.GOOGLE_SCOPES
                    });
                    const authClient = await googleAuth.getClient();
                    sheetsService = google.sheets({ version: 'v4', auth: authClient });

                    console.log(`Чтение данных из Google Sheet ID: ${config.SPREADSHEET_ID_AMO2GT}, Лист: ${config.DEFAULT_SHEET_NAME}`);
                    const sheetResponse = await sheetsService.spreadsheets.values.get({
                        spreadsheetId: config.SPREADSHEET_ID_AMO2GT,
                        range: `${config.DEFAULT_SHEET_NAME}!A:A`,
                    });
                    sheetValues = sheetResponse.data.values ? sheetResponse.data.values.flat() : [];
                    console.log(`Найдено ${sheetValues.length} записей в столбце A листа ${config.DEFAULT_SHEET_NAME}.`);
                } catch (sheetError) {
                    console.error(`Ошибка чтения из Google Sheet (${config.SPREADSHEET_ID_AMO2GT}): ${sheetError.message}`);
                    console.log("Проверка в Google Sheet будет пропущена для всех последующих подходящих лидов из-за этой ошибки.");
                    sheetsService = null; // Ensure we don't try to use it if auth/read failed
                }
            }
            
            if (sheetsService) { // Proceed only if Google Sheet interaction is possible
                const leadIdStr = String(lead.id);
                if (sheetValues.includes(leadIdStr)) {
                    console.log(`  ✅ Lead ID ${leadIdStr} НАЙДЕН в Google Sheet (${config.SPREADSHEET_ID_AMO2GT}, Лист: ${config.DEFAULT_SHEET_NAME}, столбец A).`);
                } else {
                    console.log(`  ❌ Lead ID ${leadIdStr} НЕ НАЙДЕН в Google Sheet (${config.SPREADSHEET_ID_AMO2GT}, Лист: ${config.DEFAULT_SHEET_NAME}, столбец A). Добавляем...`);
                    // Call pushToGoogleSheet to add the lead
                    await pushToGoogleSheet(leadIdStr, paymentLinkValue);
                }
            }
        }
        console.log('--- Проверка завершена ---');

    } catch (error) {
        console.error('Ошибка в функции fetchAndVerifyLeads:', error.message);
        console.error(error.stack);
    }
}

async function main() {
    const [amoTokens] = await Promise.all([ // checkAmoAccess now returns tokens
        checkAmoAccess(),
        checkGoogleCredentials()
    ]);

    if (amoTokens && amoTokens.access_token) {
        await fetchAndVerifyLeads(amoTokens.access_token); // Call the new function
    } else {
        console.error('Не удалось получить AmoCRM токены, пропуск fetchAndVerifyLeads.');
    }

    // Start Task 1: AMO CRM to Google Sheets webhook listener
    startAmoWebhookListener();

    // Start Task 2: Google Sheets to AMO CRM sync
    startGoogleSheetSync();
}

main().catch((error) => console.error('Main error:', error.message));
