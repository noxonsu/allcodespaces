const fs = require('fs').promises;
const path = require('path');

// --- Конфигурация ---
// В реальном приложении эти данные лучше хранить в .env файле и загружать с помощью библиотеки вроде dotenv
require('dotenv').config();

const MEGAPLAN_HOST = process.env.MEGAPLAN_HOST;
const MEGAPLAN_USER = process.env.MEGAPLAN_USER;
const MEGAPLAN_PASSWORD = process.env.MEGAPLAN_PASSWORD;
const TOKEN_FILE_PATH = path.join(__dirname, 'megaplan_token.txt');

const LOGIN_ENDPOINT = '/api/v3/auth/access_token';
// !!! ВНИМАНИЕ: Этот эндпоинт '/api/v3/contractorList' вызывает ошибку 404.
// !!! Пожалуйста, проверьте правильный эндпоинт для получения списка контрагентов (клиентов)
// !!! в документации вашего API Мегаплана v3 (обычно доступна по адресу /api/v3/docs в вашем аккаунте).
// Обновлено на основании RAML-документации
const CLIENTS_ENDPOINT = '/api/v3/contractor'; // Эндпоинт для получения списка контрагентов (клиентов)

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

  // Используем FormData для multipart/form-data
  const formData = new FormData();
  formData.append('grant_type', 'password');
  formData.append('username', MEGAPLAN_USER);
  formData.append('password', MEGAPLAN_PASSWORD);

  try {
    const response = await fetch(url, {
      method: 'POST',
      // При использовании FormData, fetch автоматически устанавливает
      // правильный Content-Type 'multipart/form-data' с boundary.
      // Явное указание 'Content-Type': 'application/json' здесь было бы неверно.
      // Если нужно явно указать, то это 'multipart/form-data', но обычно это не требуется.
      headers: {
        // 'Content-Type': 'multipart/form-data', // Обычно не нужно с FormData
        'Accept': 'application/json',
      },
      body: formData, // Передаем FormData напрямую
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.data || !responseData.data.access_token) {
      // В API Мегаплана токен может быть и на верхнем уровне ответа при успехе
      if (response.ok && responseData.access_token) {
        const accessToken = responseData.access_token;
        console.log('Вход выполнен успешно, получен токен (из корневого объекта).');
        await saveToken(accessToken);
        return accessToken;
      }
      console.error('Ошибка входа в Мегаплан:', responseData);
      throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}. Ответ: ${JSON.stringify(responseData)}`);
    }

    const accessToken = responseData.data.access_token;
    console.log('Вход выполнен успешно, получен токен (из объекта data).');
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
 * Запрашивает список клиентов (контрагентов) из Мегаплана.
 * @param {string} accessToken Токен доступа.
 * @returns {Promise<Array|null>} Список клиентов или null в случае ошибки.
 */
async function fetchClients(accessToken) {
  // По документации Megaplan API v3 запрос без параметров должен сработать
  // Убираем некорректные параметры сортировки, которые вызывают ошибку десериализации
  const url = `https://${MEGAPLAN_HOST}${CLIENTS_ENDPOINT}`;
  console.log(`Запрос списка клиентов: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (response.status === 401) { // Unauthorized
        console.log('Токен недействителен или срок его действия истек.');
        return 'TOKEN_INVALID'; // Специальное значение для повторной попытки логина
    }

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Ошибка при получении списка клиентов: ${response.status} ${response.statusText}. Ответ: ${errorData}`);
    }

    const responseData = await response.json();
    // Предполагаем, что клиенты находятся в responseData.data
    return responseData.data || responseData;
  } catch (error) {
    console.error('Ошибка при запросе клиентов:', error);
    return null;
  }
}

// --- Основная логика ---
async function main() {
  let accessToken = await getAccessToken();

  if (!accessToken) {
    console.log('Не удалось получить токен доступа. Завершение работы.');
    return;
  }

  let clients = await fetchClients(accessToken);

  if (clients === 'TOKEN_INVALID') {
    console.log('Попытка повторного входа из-за недействительного токена...');
    accessToken = await getAccessToken(true); // Принудительный логин
    if (!accessToken) {
        console.log('Не удалось получить новый токен доступа после ошибки. Завершение работы.');
        return;
    }
    clients = await fetchClients(accessToken);
  }

  if (clients) {
    console.log('Список клиентов получен успешно:');
    console.log(`Всего клиентов: ${clients.length}`);
    
    // Вывод клиентов с учетом их реальной структуры данных
    if (Array.isArray(clients)) {
        clients.forEach(client => {
            const contentType = client.contentType || 'Unknown';
            const id = client.id || 'Unknown ID';
            const name = getClientName(client);
            const type = client.type?.name || (client.type?.id ? `ID: ${client.type.id}` : 'Unknown type');
            
            // Получение основной контактной информации
            let contact = 'Нет данных';
            if (client.contactInfo && client.contactInfo.length > 0) {
                const mainContact = client.contactInfo.find(c => c.isMain === true) || client.contactInfo[0];
                contact = `${mainContact.type}: ${mainContact.value}`;
            }
            
            // Получение ответственного
            let responsible = 'Нет ответственного';
            if (client.responsibles && client.responsibles.length > 0) {
                responsible = client.responsibles[0].name || 'ID: ' + client.responsibles[0].id;
            }
            
            console.log(`${contentType} | ${id} | ${name} | ${type} | ${contact} | Ответственный: ${responsible}`);
        });
    } else {
        console.log('Неожиданный формат ответа:');
        console.log(JSON.stringify(clients, null, 2));
    }
  } else {
    console.log('Не удалось получить список клиентов.');
  }
}

/**
 * Получает отображаемое имя клиента в зависимости от типа
 * @param {Object} client Объект клиента
 * @returns {string} Имя клиента
 */
function getClientName(client) {
    if (client.contentType === 'ContractorCompany') {
        return client.name || 'Без названия';
    } else if (client.contentType === 'ContractorHuman') {
        // Составляем полное имя из доступных частей
        const parts = [];
        if (client.lastName) parts.push(client.lastName);
        if (client.firstName) parts.push(client.firstName);
        if (client.middleName) parts.push(client.middleName);
        
        return parts.length > 0 ? parts.join(' ') : 'Без имени';
    } else {
        // Для других типов пытаемся найти любое поле, подходящее для имени
        return client.name || client.Name || client.firstName || client.id || 'Unnamed';
    }
}

main().catch(error => {
  console.error('Произошла непредвиденная ошибка в главной функции:', error);
});
