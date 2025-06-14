# План продвижения услуги веб-разработки через Facebook Ads (обновлённый под лид-магнит)

## 1. Описание продукта и лид-магнита

| Этап | Что получает пользователь | Цель для нас |
|------|--------------------------|--------------|
| Лид-магнит | Бесплатный сервис на **onout.org**: анализ макета Figma (по картинке или ссылке). Автоматически оценивает сложность, объём работ и примерный бюджет разработки. | Получить контакт (e-mail / мессенджер) и квалифицировать лида. |
| Основная услуга | «Сайт под ключ»: Pixel-Perfect HTML + адаптив + интеграция с backend, поддержка и гарантия. | Монетизация: продажа разработки и апселлы (поддержка, доработки, хостинг). |

---

## 2. Целевая аудитория

- **Дизайнеры-фрилансеры и веб-студии** — нужен разработчик, готовый «подстраховать» клиентов.
- **Владельцы малого/среднего бизнеса, маркетологи** — ищут быстрый и прозрачный расчёт стоимости.
- География: Россия, СНГ ➜ затем можно масштабировать на англоязычный сегмент.

---

## 3. Оффер и позиционирование в рекламе

1. **Основной триггер**: «Бесплатно рассчитаем стоимость верстки вашего макета Figma за 30 секунд».
2. **Пруф**: демонстрация автоматического репорта (скрин) + CTA «Попробовать».
3. **Дальнейший шаг**: после анализа выводим форму заявки: «Хотите получить точное коммерческое предложение и сроки? Оставьте контакты».

---

## 4. Креативы и форматы

| Формат | Идея креатива |
|--------|---------------|
| Видео (10–15 с) | Экранка: загружается макет → через 3 сек выводится отчёт → «Попробуйте бесплатно». |
| Карусель | Слайды: ① «Перетащите макет», ② «Получите отчёт», ③ «Запустим сайт под ключ». |
| Статич. баннер | Скриншот отчёта + кнопка «Рассчитать стоимость» / «Try it now». Без «до/после». |
| Story/Reels | Динамика быстрого скролла макета → код → сайт. В конце «рассчитай бесплатно». |

---

## 5. Структура рекламного кабинета

### Кампания 1 • Lead Magnet (Conversion или Leads)

| Адсет | Аудитория | Бюджет нач. | Креативы |
|-------|-----------|-------------|----------|
| Дизайнеры | Интересы: Figma, UI/UX, Behance | 300 ₽/д | 3 варианта |
| Бизнес | Позиции «Founder, CEO», интерес «Digital Marketing» | 300 ₽/д | 3 варианта |

- Оптимизация на **Submit Form** (лид).  
- Facebook Pixel + Conversion API подключены к onout.org.

### Кампания 2 • Ретаргетинг (ENGAGEMENT / CUSTOM AUDIENCE)

- Трафик, посетивший analyzer ≥ 30 сек.
- Пользователи, открывшие лид-форму, но не отправившие.
- Креатив: «Получите детальную смету и сроки — персонально и бесплатно».

### Кампания 3 • Upsell «Сайт под ключ» (Look-alike 1-3 %)

- Лук-элайк на отправленных лидов и завершённых заказов.
- Оптимизация на **Schedule Call** / **Purchase** (если e-commerce flow).

---

## 6. Воронка

```
Ad → Landing (Analyzer) → Отчёт + форма контакта → Авто-письмо с PDF-отчётом
           ↘ пиксель / ретаргетинг ↗
``` 

- CRM (или Google Sheets + Zapier) для фиксации результатов.
- Серия писем:  
  1) PDF-отчёт, 2) Польза «5 ошибок при верстке», 3) Кейс «Figma→сайт за 7 дней», 4) CTA на консультацию.

### Автоматизация ответов в FB/Instagram

- Используем формат **Click-to-Message Ads** (Messenger/Instagram DM), чтобы объявление открывало чат внутри приложения.
- Настраиваем автоответ (Facebook Automated Responses, ManyChat, Chatfuel): приветственное сообщение + кнопка «Запустить анализ» со ссылкой `https://onout.org/analyzer`.
- Через Webhook/Graph API можно:
  1. Получить ссылку/файл макета от пользователя.
  2. Передать данные в сервис анализа.
  3. Автоматически отправить PDF-отчёт обратно в чат.
- Базовый вариант: встроенный Quick Reply и FAQ в Page Inbox.

---

## 7. Аналитика

| Метрика | Цель |
|---------|------|
| Cost per Lead (Analyzer) | ≤ 100 ₽ |
| Конверсия Lead→Call | ≥ 20 % |
| Cost per Sale | ≤ 7 – 10 % от среднего чека |
| ROAS | ≥ 4 |

Использовать UTM + Facebook Pixel, Google Analytics (GA4).

---

## 8. Бюджет и тест-план

1. Этап теста: 1 000 ₽/день × 14 дней = 14 000 ₽  
   – по 500 ₽ на каждый адсет.  
2. Успешные связки масштабируем: CBO + дублирование.

---

## 9. Чек-лист запуска

- [x] Внедрить пиксель + Conversion API.  
- [x] Landing onout.org/analyzer c быстрой загрузкой, без CDN.  
- [x] Форма контакта (e-mail + Telegram/WhatsApp).  
- [x] Автодействия: письмо с отчётом, напоминание менеджеру.  
- [x] Мини-CRM или Airtable для статусов.  

---

## 10. Итог

Продвигая бесплатный **Figma Analyzer** как лид-магнит, мы снижаем барьер входа, собираем квалифицированные контакты и затем конвертируем их в оплату разработки сайта под ключ. Стратегия сочетает образовательный контент, ретаргетинг и look-alike-аудитории для масштабирования.
