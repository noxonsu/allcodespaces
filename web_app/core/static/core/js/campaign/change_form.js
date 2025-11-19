$(document).ready(function () {
    // CHANGE: Удаление disabled атрибута с радиокнопок format для новых кампаний
    // WHY: Исправление issue #33 - атрибут disabled блокировал выбор формата
    // REF: #33
    const campaignId = new URLSearchParams(window.location.search).get('object_id') ||
                       window.location.pathname.match(/\/(\d+)\/change\//)?.[1];

    // Если это страница создания новой кампании (нет ID)
    if (!campaignId && window.location.pathname.includes('/add/')) {
        // Убираем disabled со всех радиокнопок format
        $('.field-format input[type="radio"]').removeAttr('disabled').prop('disabled', false);
        console.log('Campaign add form: enabled format radio buttons');
    } else {
        console.log('Campaign change form: format field remains disabled for existing campaign');
    }
});
