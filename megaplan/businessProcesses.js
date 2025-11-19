const fs = require('fs').promises;
const path = require('path');

// --- Конфигурация ---
require('dotenv').config();

const MEGAPLAN_HOST = process.env.MEGAPLAN_HOST;
const MEGAPLAN_USER = process.env.MEGAPLAN_USER;
const MEGAPLAN_PASSWORD = process.env.MEGAPLAN_PASSWORD;
const TOKEN_FILE_PATH = path.join(__dirname, 'megaplan_token.txt');
const OUTPUT_FILE_PATH = path.join(__dirname, 'megaplan_business_processes_details.json');

const LOGIN_ENDPOINT = '/api/v3/auth/access_token';
const BUSINESS_PROCESSES_ENDPOINT = '/api/v3/program';
const PROGRAM_STATES_ENDPOINT_TEMPLATE = '/api/v3/program/{id}/states';
const PROGRAM_FIELDS_ENDPOINT_TEMPLATE = '/api/v3/program/{id}/fields';
const PROGRAM_TRIGGERS_ENDPOINT_TEMPLATE = '/api/v3/program/{id}/triggers';

// --- Вспомогательные функции ---

/**
 * Пытается прочитать сохраненный токен из файла.
 * @returns {Promise<string|null>} Токен или null, если файл не найден.
 */
async function getSavedToken() {
  try {
    const token = await fs.readFile(TOKEN_FILE_PATH, 'utf-8');
    return token.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Файл токена не найден.');
    } else {
      console.error('Ошибка при чтении файла токена:', error);
    }
    return null;
  }
}

/**
 * Сохраняет токен в файл.
 * @param {string} token Токен для сохранения.
 */
async function saveToken(token) {
  try {
    await fs.writeFile(TOKEN_FILE_PATH, token, 'utf-8');
    console.log('Токен успешно сохранен в файл.');
  } catch (error) {
    console.error('Ошибка при сохранении токена:', error);
  }
}

/**
 * Выполняет вход в Мегаплан для получения токена доступа.
 * @returns {Promise<string|null>} Токен доступа или null в случае ошибки.
 */
async function loginToMegaplan() {
  const url = `https://${MEGAPLAN_HOST}${LOGIN_ENDPOINT}`;
  console.log(`Попытка входа на ${url} для пользователя ${MEGAPLAN_USER}...`);

  const formData = new FormData();
  formData.append('grant_type', 'password');
  formData.append('username', MEGAPLAN_USER);
  formData.append('password', MEGAPLAN_PASSWORD);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
      body: formData,
    });

    const responseData = await response.json();

    if (!response.ok || (!responseData.data?.access_token && !responseData.access_token)) {
      console.error('Ошибка входа в Мегаплан:', responseData);
      throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}`);
    }

    const accessToken = responseData.data?.access_token || responseData.access_token;
    console.log('Вход выполнен успешно, получен токен.');
    await saveToken(accessToken);
    return accessToken;
  } catch (error) {
    console.error('Критическая ошибка при попытке входа:', error);
    return null;
  }
}

/**
 * Получает актуальный токен доступа (из файла или через логин).
 * @param {boolean} forceLogin - Если true, принудительно выполнит вход, даже если токен есть.
 * @returns {Promise<string|null>} Токен доступа или null.
 */
async function getAccessToken(forceLogin = false) {
  if (!forceLogin) {
    const savedToken = await getSavedToken();
    if (savedToken) {
      console.log('Используется сохраненный токен.');
      return savedToken;
    }
  }
  return await loginToMegaplan();
}

/**
 * Запрашивает список бизнес-процессов (программ) из Мегаплана.
 * @param {string} accessToken Токен доступа.
 * @returns {Promise<Array|null|string>} Список бизнес-процессов, null в случае ошибки, или 'TOKEN_INVALID'.
 */
async function fetchBusinessProcesses(accessToken) {
  const url = `https://${MEGAPLAN_HOST}${BUSINESS_PROCESSES_ENDPOINT}`;
  console.log(`Запрос списка бизнес-процессов (программ): ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    if (response.status === 401) {
      console.log('Токен недействителен или срок его действия истек при запросе списка программ.');
      return 'TOKEN_INVALID';
    }
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Ошибка при получении списка бизнес-процессов (программ): ${response.status} ${response.statusText}. Ответ: ${errorData}`);
    }
    const responseData = await response.json();
    return responseData.data || responseData;
  } catch (error) {
    console.error('Ошибка при запросе бизнес-процессов (программ):', error);
    return null;
  }
}

/**
 * Запрашивает статусы (шаги) для конкретного бизнес-процесса (программы).
 * @param {string} accessToken Токен доступа.
 * @param {string} programId ID программы.
 * @returns {Promise<Array|null|string>} Список статусов, null в случае ошибки, или 'TOKEN_INVALID'.
 */
async function fetchProgramStates(accessToken, programId) {
  const url = `https://${MEGAPLAN_HOST}${PROGRAM_STATES_ENDPOINT_TEMPLATE.replace('{id}', programId)}`;
  console.log(`  Запрос статусов для программы ${programId}: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    if (response.status === 401) return 'TOKEN_INVALID';
    if (response.status === 404) {
        console.log(`  Статусы для программы ${programId} не найдены (404).`);
        return [];
    }
    if (!response.ok) throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
    const responseData = await response.json();
    return responseData.data || responseData;
  } catch (error) {
    console.error(`  Ошибка при запросе статусов для программы ${programId}:`, error);
    return null;
  }
}

/**
 * Запрашивает поля для конкретного бизнес-процесса (программы).
 * @param {string} accessToken Токен доступа.
 * @param {string} programId ID программы.
 * @returns {Promise<Array|null|string>} Список полей, null в случае ошибки, или 'TOKEN_INVALID'.
 */
async function fetchProgramFields(accessToken, programId) {
  const url = `https://${MEGAPLAN_HOST}${PROGRAM_FIELDS_ENDPOINT_TEMPLATE.replace('{id}', programId)}`;
  console.log(`  Запрос полей для программы ${programId}: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    if (response.status === 401) return 'TOKEN_INVALID';
    if (response.status === 404) {
        console.log(`  Поля для программы ${programId} не найдены (404).`);
        return [];
    }
    if (!response.ok) throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
    const responseData = await response.json();
    return responseData.data || responseData;
  } catch (error) {
    console.error(`  Ошибка при запросе полей для программы ${programId}:`, error);
    return null;
  }
}

/**
 * Запрашивает триггеры для конкретного бизнес-процесса (программы).
 * @param {string} accessToken Токен доступа.
 * @param {string} programId ID программы.
 * @returns {Promise<Array|null|string>} Список триггеров, null в случае ошибки, или 'TOKEN_INVALID'.
 */
async function fetchProgramTriggers(accessToken, programId) {
  const url = `https://${MEGAPLAN_HOST}${PROGRAM_TRIGGERS_ENDPOINT_TEMPLATE.replace('{id}', programId)}`;
  console.log(`  Запрос триггеров для программы ${programId}: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    if (response.status === 401) return 'TOKEN_INVALID';
     if (response.status === 404) {
        console.log(`  Триггеры для программы ${programId} не найдены (404).`);
        return [];
    }
    if (!response.ok) throw new Error(`Ошибка ${response.status}: ${await response.text()}`);
    const responseData = await response.json();
    return responseData.data || responseData;
  } catch (error) {
    console.error(`  Ошибка при запросе триггеров для программы ${programId}:`, error);
    return null;
  }
}

/**
 * Собирает детальную информацию о бизнес-процессе (программе), включая статусы, поля и триггеры.
 * @param {string} accessToken Токен доступа.
 * @param {Object} program Базовый объект программы.
 * @returns {Promise<Object|null>} Объект с детальной информацией или null в случае критической ошибки с токеном.
 */
async function collectProgramDetails(accessToken, program) {
  console.log(`Сбор деталей для программы "${program.name}" (ID: ${program.id})...`);
  const programDetails = { ...program }; // Копируем базовую информацию

  const states = await fetchProgramStates(accessToken, program.id);
  if (states === 'TOKEN_INVALID') return 'TOKEN_INVALID_SUBREQUEST';
  programDetails.states = states;

  const fields = await fetchProgramFields(accessToken, program.id);
  if (fields === 'TOKEN_INVALID') return 'TOKEN_INVALID_SUBREQUEST';
  programDetails.fields = fields;

  const triggers = await fetchProgramTriggers(accessToken, program.id);
  if (triggers === 'TOKEN_INVALID') return 'TOKEN_INVALID_SUBREQUEST';
  programDetails.triggers = triggers;
  
  console.log(`  Детали для программы "${program.name}" собраны.`);
  return programDetails;
}

// --- Основная логика ---
async function main() {
  let accessToken = await getAccessToken();

  if (!accessToken) {
    console.log('Не удалось получить токен доступа. Завершение работы.');
    return;
  }

  let programs = await fetchBusinessProcesses(accessToken);

  if (programs === 'TOKEN_INVALID') {
    console.log('Попытка повторного входа из-за недействительного токена при получении списка программ...');
    accessToken = await getAccessToken(true); // Принудительный логин
    if (!accessToken) {
      console.log('Не удалось получить новый токен доступа после ошибки. Завершение работы.');
      return;
    }
    programs = await fetchBusinessProcesses(accessToken);
    if (programs === 'TOKEN_INVALID' || !programs) {
        console.log('Не удалось получить список программ даже после повторного входа. Завершение работы.');
        return;
    }
  }

  if (programs && Array.isArray(programs)) {
    console.log(`Список программ (${programs.length}) получен успешно.`);
    const allProgramsData = [];

    for (const program of programs) {
      let details = await collectProgramDetails(accessToken, program);
      
      if (details === 'TOKEN_INVALID_SUBREQUEST') {
        console.log(`Токен стал недействителен при сборе деталей для программы ${program.name}. Попытка обновить токен...`);
        accessToken = await getAccessToken(true); // Принудительный логин
        if (!accessToken) {
          console.log('Не удалось обновить токен. Сбор деталей для оставшихся программ будет пропущен.');
          break; 
        }
        console.log('Токен обновлен. Повторная попытка сбора деталей...');
        details = await collectProgramDetails(accessToken, program);
        if (details === 'TOKEN_INVALID_SUBREQUEST') {
            console.log(`Не удалось собрать детали для программы ${program.name} даже после обновления токена. Пропуск.`);
            continue;
        }
      }
      
      if (details) {
        allProgramsData.push(details);
      }
    }

    try {
      await fs.writeFile(OUTPUT_FILE_PATH, JSON.stringify(allProgramsData, null, 2), 'utf-8');
      console.log(`Все данные о бизнес-процессах (${allProgramsData.length} шт.) успешно сохранены в файл: ${OUTPUT_FILE_PATH}`);
    } catch (error) {
      console.error('Ошибка при сохранении данных в файл:', error);
    }

  } else if (programs) {
    console.log('Неожиданный формат ответа для списка бизнес-процессов (программ):');
    console.log(JSON.stringify(programs, null, 2));
  } else {
    console.log('Не удалось получить список бизнес-процессов (программ).');
  }
}

main().catch(error => {
  console.error('Произошла непредвиденная ошибка в главной функции:', error);
});
