#!/usr/bin/env node
const path = require('path'); 
// XLSX is still needed by amo2excel.js and excel2amo.js, but not directly here for Drive ops
// const XLSX = require('xlsx'); 
const fs = require('fs'); // Used for checking GOOGLE_KEY_FILE existence
const config = require('./config'); 
const { startAmoWebhookListener, pushToExcelSheet } = require('./amo2excel'); 
const { startExcelSheetSync } = require('./excel2amo'); // Assuming this function performs a single sync cycle
const fsPromises = require('fs').promises; 

function getAuthUrl() {
    return `https://www.amocrm.ru/oauth?client_id=${config.AMO_INTEGRATION_ID}&mode=popup`;
}

async function getNewTokens(authCode) {
    console.log('[Auth] Attempting to get new tokens with authCode:', authCode ? 'provided' : 'MISSING');
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
        console.error('[Auth] Failed to get new tokens. Status:', response.status, 'Body:', errorBody);
        throw new Error(`Failed to get new tokens: ${response.status}. Body: ${errorBody}`);
    }

    const tokens = await response.json();
    console.log('[Auth] Successfully obtained new tokens.');
    await saveTokens(tokens);
    return tokens;
}

async function refreshTokens(refreshToken) {
    console.log('[Auth] Attempting to refresh tokens.');
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
        console.error('[Auth] Failed to refresh tokens. Status:', response.status, 'Body:', errorBody);
        throw new Error(`Failed to refresh tokens: ${response.status}. Body: ${errorBody}`);
    }

    const tokens = await response.json();
    console.log('[Auth] Successfully refreshed tokens.');
    await saveTokens(tokens);
    return tokens;
}

async function saveTokens(tokens) {
    console.log('[Auth] Saving tokens to:', config.AMO_TOKENS_PATH);
    await fsPromises.writeFile(config.AMO_TOKENS_PATH, JSON.stringify(tokens, null, 2)); // Changed fs to fsPromises
}

async function loadTokens() {
    try {
        console.log('[Auth] Attempting to load tokens from:', config.AMO_TOKENS_PATH);
        const data = await fsPromises.readFile(config.AMO_TOKENS_PATH, 'utf8'); // Changed fs to fsPromises
        console.log('[Auth] Tokens loaded successfully.');
        return JSON.parse(data);
    } catch (error) {
        console.log('[Auth] No tokens file found or error reading tokens:', error.message);
        return null;
    }
}

async function checkAmoAccess() {
    let tokens = await loadTokens();
    let amoAuthCodeUsed = false;

    if (!tokens) {
        console.log('[Auth] No stored tokens found.');
        const authCodeFromEnv = config.AMO_AUTH_CODE; 
        if (authCodeFromEnv) {
            console.log('[Auth] AMO_AUTH_CODE found in config. Attempting to get initial tokens.');
            try {
                tokens = await getNewTokens(authCodeFromEnv);
                amoAuthCodeUsed = true;
                console.log('[Auth] Successfully obtained tokens using AMO_AUTH_CODE. It is recommended to remove AMO_AUTH_CODE from .env now.');
            } catch (error) {
                console.error('[Auth] Failed to get tokens using AMO_AUTH_CODE from config:', error.message);
            }
        }
    }

    if (tokens) {
        try {
            console.log('[Auth] Attempting to verify access token.');
            let response = await fetch(`${config.AMO_DOMAIN}/api/v4/leads`, {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`
                }
            });

            if (response.status === 401 && tokens.refresh_token) {
                console.log('[Auth] Access token expired or invalid (401). Attempting to refresh.');
                try {
                    tokens = await refreshTokens(tokens.refresh_token);
                    console.log('[Auth] Retrying API call with new refreshed access token.');
                    response = await fetch(`${config.AMO_DOMAIN}/api/v4/leads`, {
                        headers: {
                            'Authorization': `Bearer ${tokens.access_token}`
                        }
                    });
                } catch (refreshError) {
                    console.error('[Auth] Failed to refresh token:', refreshError.message);
                    tokens = null; 
                }
            }

            if (tokens && response.ok) {
                console.log('[Auth] ✅ Доступ к API AmoCRM подтвержден');
                return tokens; // Return tokens on success
            } else if (tokens) {
                const errorText = await response.text();
                console.error(`[Auth] API AmoCRM request failed. Status: ${response.status}. Response: ${errorText}`);
            }
        } catch (apiError) {
            console.error('[Auth] Error during AmoCRM API access check:', apiError.message);
        }
    }
    
    console.error(`[Auth] 
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

async function fetchAndVerifyLeads(accessToken) {
    console.log('\n--- [AmoLeadSync] Проверка последних сделок в AmoCRM и Excel Sheet на Google Drive ---');
    if (!accessToken) {
        console.error('[AmoLeadSync] Нет accessToken для получения сделок AmoCRM.');
        return;
    }
    if (!config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        console.log('[AmoLeadSync] GOOGLE_DRIVE_FILE_ID_AMO2EXCEL не сконфигурирован, пропускаем fetchAndVerifyLeads.');
        return;
    }
    if (!config.DEFAULT_SHEET_NAME) {
        console.log('[AmoLeadSync] DEFAULT_SHEET_NAME не сконфигурирован, пропускаем fetchAndVerifyLeads.');
        return;
    }
     if (!fs.existsSync(config.GOOGLE_KEY_FILE)) {
        console.log(`[AmoLeadSync] Файл ключа Google (${config.GOOGLE_KEY_FILE}) не найден, пропускаем fetchAndVerifyLeads.`);
        return;
    }

    try {
        const leadsUrl = `${config.AMO_DOMAIN}/api/v4/leads?limit=5&order[created_at]=desc&with=contacts`;
        console.log(`[AmoLeadSync] Fetching leads from: ${leadsUrl}`);
        const amoResponse = await fetch(leadsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!amoResponse.ok) {
            console.error(`[AmoLeadSync] Ошибка получения сделок из AmoCRM: ${amoResponse.status} ${await amoResponse.text()}`);
            return;
        }
        const amoData = await amoResponse.json();
        const leads = amoData?._embedded?.leads || [];

        if (leads.length === 0) {
            console.log('[AmoLeadSync] Не найдено сделок в AmoCRM.');
            return;
        }
        console.log(`[AmoLeadSync] Получено ${leads.length} последних сделок из AmoCRM.`);

        // The logic for reading Excel is now inside pushToExcelSheet, which handles Drive download.
        // We just iterate through leads and call pushToExcelSheet.
        // The check for existing deal numbers will happen within pushToExcelSheet after downloading the file.
        
        for (const lead of leads) {
            console.log(`\n[AmoLeadSync] Processing Lead ID: ${lead.id} (Name: ${lead.name}, Created: ${new Date(lead.created_at * 1000).toLocaleString()}) for fetchAndVerifyLeads`);
            
            let paymentLinkValue = null;
            const targetCustomFieldName = "Ссылка на оплату"; 

            if (lead.custom_fields_values && lead.custom_fields_values.length > 0) {
                lead.custom_fields_values.forEach(cf => {
                    if (cf.field_name === targetCustomFieldName && cf.values.length > 0 && cf.values[0].value) {
                        const tempLink = String(cf.values[0].value).trim();
                        if (tempLink !== '') {
                            paymentLinkValue = tempLink;
                        }
                    }
                });
            }

            if (!paymentLinkValue) {
                console.log(`[AmoLeadSync]   Пропускаем лид ID ${lead.id} в fetchAndVerifyLeads: отсутствует или пустое значение для '${targetCustomFieldName}'.`);
                continue; 
            }
            
            const leadIdStr = String(lead.id);
            // pushToExcelSheet will handle download, check, append, and upload to Drive.
            // It will internally log if the lead is found or added.
            console.log(`[AmoLeadSync]   Передача лида ID ${leadIdStr} в pushToExcelSheet для проверки и возможного добавления в Excel на Drive.`);
            await pushToExcelSheet(leadIdStr, paymentLinkValue); 
        }
        console.log('--- [AmoLeadSync] Проверка последних сделок (fetchAndVerifyLeads) завершена ---');

    } catch (error) {
        console.error('[AmoLeadSync] Ошибка в функции fetchAndVerifyLeads:', error.message);
        console.error(error.stack);
    }
}

async function main() {
    console.log(`[Main] Initial value of config.DEFAULT_SHEET_NAME: "${config.DEFAULT_SHEET_NAME}"`);

    // The main loop for continuous operation
    while (true) {
        console.log(`\n--- [Main] Starting new cycle at ${new Date().toISOString()} ---`);
        let currentAccessToken = null;

        try {
            // Step 1: Authenticate with AmoCRM and get tokens
            const amoTokens = await checkAmoAccess(); // This function handles token loading, initial fetch, and refresh. It will exit(1) on auth failure.

            if (amoTokens && amoTokens.access_token) {
                currentAccessToken = amoTokens.access_token;
                console.log("[Main] AmoCRM access confirmed for this cycle.");

                // Step 2: AmoCRM -> Excel Sync (fetchAndVerifyLeads)
                if (config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL && config.DEFAULT_SHEET_NAME && fs.existsSync(config.GOOGLE_KEY_FILE)) {
                    console.log("[Main] Running: AmoCRM -> Excel Sync (fetchAndVerifyLeads)");
                    await fetchAndVerifyLeads(currentAccessToken);
                } else {
                    console.log("[Main] Prerequisites for AmoCRM -> Excel Sync (fetchAndVerifyLeads) not met, skipping this part.");
                }
            } else {
                // This case should ideally not be reached if checkAmoAccess exits on failure.
                // But as a safeguard:
                console.error('[Main] Could not obtain AmoCRM OAuth tokens for this cycle. Skipping API-dependent operations.');
            }

            // Step 3: Excel -> AmoCRM Sync (excel2amo.js logic)
            // This part uses currentAccessToken obtained above, or falls back to AMO_TOKEN if configured and OAuth failed.
            if (config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO && config.DEFAULT_SHEET_NAME && fs.existsSync(config.GOOGLE_KEY_FILE)) {
                if (currentAccessToken) {
                    console.log("[Main] Running: Excel -> AmoCRM Sync (excel2amo) with current OAuth token...");
                    await startExcelSheetSync(currentAccessToken); // IMPORTANT: Assumes startExcelSheetSync performs a single sync operation and returns.
                } else if (config.AMO_TOKEN) { 
                    // Fallback if OAuth token wasn't available for some reason but a direct token is.
                    console.warn("[Main] Running: Excel -> AmoCRM Sync (excel2amo) with AMO_TOKEN from .env (OAuth token not available for this part of the cycle)...");
                    await startExcelSheetSync(null); // Pass null to indicate usage of AMO_TOKEN as per previous logic.
                } else {
                    console.error("[Main] No AmoCRM token (OAuth or direct) available for Excel -> AmoCRM Sync, skipping this part.");
                }
            } else {
                console.log("[Main] Prerequisites for Excel -> AmoCRM Sync (excel2amo) not met, skipping this part.");
            }

        } catch (error) {
            // Errors from checkAmoAccess (if it doesn't exit), fetchAndVerifyLeads, or startExcelSheetSync
            console.error(`[Main] Error during operational cycle: ${error.message}`, error.stack);
            // The loop will continue after the delay, unless checkAmoAccess caused process.exit().
        }

        console.log(`--- [Main] Cycle finished at ${new Date().toISOString()}. Waiting for 30 seconds before the next cycle. ---`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30-second delay
    }
}

main().catch((error) => {
    // This catches errors if main itself throws an unhandled exception, 
    // or if checkAmoAccess calls process.exit, this might not be reached for that specific error.
    console.error('[Main] Critical error in main execution loop:', error.message, error.stack);
    process.exit(1); // Exit if the main loop itself fails critically
});
