API Вордстата

## В этой статье:

*   [Как подключиться к API Вордстата](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)
*   [Шаг 1. Авторизуйтесь с Яндекс ID](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)
*   [Шаг 2. Получите OAuth-токен](ru/content/api-wordstat#OAuth)
*   [Шаг 3. Зарегистрируйте идентификатор](ru/content/api-wordstat#ClientId)
*   [Шаг 4. Подайте заявку на доступ к API](ru/content/api-wordstat#access-request)
*   [Ограничения использования](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)

1.  API Вордстата
2.  Подключение к API

# API Вордстата

*   [Как подключиться к API Вордстата](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)
    *   [Шаг 1. Авторизуйтесь с Яндекс ID](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)
    *   [Шаг 2. Получите OAuth-токен](ru/content/api-wordstat#OAuth)
    *   [Шаг 3. Зарегистрируйте идентификатор](ru/content/api-wordstat#ClientId)
    *   [Шаг 4. Подайте заявку на доступ к API](ru/content/api-wordstat#access-request)
*   [Ограничения использования](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)

API позволяет получать данные Вордстата в формате, удобном для автоматической обработки. В настоящее время поддерживается формат JSON. Взаимодействие с API организовано по протоколу HTTPS. Адрес для отправки запросов к API: `https://api.wordstat.yandex.net`.

Для доступа к API необходимо:

1.  [Получить](ru/content/api-wordstat#OAuth) OAuth-токен.
2.  [Зарегистрировать](ru/content/api-wordstat#ClientId) идентификатор `ClientId`.
3.  Передавать токен с каждым запросом в HTTP-заголовке Authorization: `Authorization: Bearer <OAuth-токен>`.

## [](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)Как подключиться к API Вордстата

### [](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)Шаг 1. Авторизуйтесь с Яндекс ID

1.  Если у вас нет логина на Яндексе — зарегистрируйте [аккаунт Яндекс ID](https://passport.yandex.ru/auth/reg/portal).
2.  Авторизуйтесь с [Яндекс ID](https://passport.yandex.ru/auth).

### [](ru/content/api-wordstat#OAuth)Шаг 2. Получите OAuth-токен

На странице приложений [создайте приложение](https://oauth.yandex.ru/client/new/id) и получите токен:

1.  В блоке **Redirect URI** выберите **Подставить URL для отладки**.
    
    ![api-redirect-uri.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-redirect-uri.png)
    
2.  Выберите доступ по крайней мере к одному типу данных.
    
    ![api-access-to-data.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-access-to-data.png)
    

### [](ru/content/api-wordstat#ClientId)Шаг 3. Зарегистрируйте идентификатор

На странице созданного приложения найдите идентификатор `ClientId`.

![api-client-id.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-client-id.png)

### [](ru/content/api-wordstat#access-request)Шаг 4. Подайте заявку на доступ к API

Для подключения к API обратитесь в поддержку Яндекс Директа и сообщите свой логин и идентификатор `ClientId`.

Заявка на подключение

## [](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)Ограничения использования

Доступ к API ограничен квотой. Есть два вида квоты:

*   общая квота на весь API. В случае если она превышена, вы получите HTTP-ответ с кодом `503 Service unavailable, try again later`;
    
*   персональная квота, привязанная к OAuth-токену с ограничениями:
    
    *   на число запросов в секунду (старайтесь не задавать много запросов одновременно, чтобы не перегружать сервис);
    *   на число запросов в сутки.
    
    В случае превышения квоты вы получите HTTP-ответ с кодом `429 Quota limit exceeded, try again later. Time to refill: N seconds`. В ответе будет оценка времени, когда снова можно будет обращаться к API.
    

### Была ли статья полезна?

ДаНет

Предыдущая

[

Правила учета стоп-слов

](ru/content/stop-slova)

Следующая

[

Структура API
API Вордстата

## В этой статье:

*   [Как подключиться к API Вордстата](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)
*   [Шаг 1. Авторизуйтесь с Яндекс ID](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)
*   [Шаг 2. Получите OAuth-токен](ru/content/api-wordstat#OAuth)
*   [Шаг 3. Зарегистрируйте идентификатор](ru/content/api-wordstat#ClientId)
*   [Шаг 4. Подайте заявку на доступ к API](ru/content/api-wordstat#access-request)
*   [Ограничения использования](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)

1.  API Вордстата
2.  Подключение к API

# API Вордстата

*   [Как подключиться к API Вордстата](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)
    *   [Шаг 1. Авторизуйтесь с Яндекс ID](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)
    *   [Шаг 2. Получите OAuth-токен](ru/content/api-wordstat#OAuth)
    *   [Шаг 3. Зарегистрируйте идентификатор](ru/content/api-wordstat#ClientId)
    *   [Шаг 4. Подайте заявку на доступ к API](ru/content/api-wordstat#access-request)
*   [Ограничения использования](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)

API позволяет получать данные Вордстата в формате, удобном для автоматической обработки. В настоящее время поддерживается формат JSON. Взаимодействие с API организовано по протоколу HTTPS. Адрес для отправки запросов к API: `https://api.wordstat.yandex.net`.

Для доступа к API необходимо:

1.  [Получить](ru/content/api-wordstat#OAuth) OAuth-токен.
2.  [Зарегистрировать](ru/content/api-wordstat#ClientId) идентификатор `ClientId`.
3.  Передавать токен с каждым запросом в HTTP-заголовке Authorization: `Authorization: Bearer <OAuth-токен>`.

## [](ru/content/api-wordstat#kak-podklyuchitsya-k-api-vordstata)Как подключиться к API Вордстата

### [](ru/content/api-wordstat#shag-1-avtorizujtes-s-yandeks-id)Шаг 1. Авторизуйтесь с Яндекс ID

1.  Если у вас нет логина на Яндексе — зарегистрируйте [аккаунт Яндекс ID](https://passport.yandex.ru/auth/reg/portal).
2.  Авторизуйтесь с [Яндекс ID](https://passport.yandex.ru/auth).

### [](ru/content/api-wordstat#OAuth)Шаг 2. Получите OAuth-токен

На странице приложений [создайте приложение](https://oauth.yandex.ru/client/new/id) и получите токен:

1.  В блоке **Redirect URI** выберите **Подставить URL для отладки**.
    
    ![api-redirect-uri.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-redirect-uri.png)
    
2.  Выберите доступ по крайней мере к одному типу данных.
    
    ![api-access-to-data.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-access-to-data.png)
    

### [](ru/content/api-wordstat#ClientId)Шаг 3. Зарегистрируйте идентификатор

На странице созданного приложения найдите идентификатор `ClientId`.

![api-client-id.png](docs-assets/support-wordstat/rev/e9e2ad873b94b19218c56990fe549dc5322b1206/ru/_images/api-client-id.png)

### [](ru/content/api-wordstat#access-request)Шаг 4. Подайте заявку на доступ к API

Для подключения к API обратитесь в поддержку Яндекс Директа и сообщите свой логин и идентификатор `ClientId`.

Заявка на подключение

## [](ru/content/api-wordstat#ogranicheniya-ispolzovaniya)Ограничения использования

Доступ к API ограничен квотой. Есть два вида квоты:

*   общая квота на весь API. В случае если она превышена, вы получите HTTP-ответ с кодом `503 Service unavailable, try again later`;
    
*   персональная квота, привязанная к OAuth-токену с ограничениями:
    
    *   на число запросов в секунду (старайтесь не задавать много запросов одновременно, чтобы не перегружать сервис);
    *   на число запросов в сутки.
    
    В случае превышения квоты вы получите HTTP-ответ с кодом `429 Quota limit exceeded, try again later. Time to refill: N seconds`. В ответе будет оценка времени, когда снова можно будет обращаться к API.