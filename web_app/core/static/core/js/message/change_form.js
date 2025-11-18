$(document).ready(function () {
    var labelDelete = $('label[for="image-clear_id"]');
    if (labelDelete.length > 0) {
        labelDelete.text('Удалить');
    }
    var videoLabelDelete = $('label[for="video-clear_id"]');
    if (labelDelete.length > 0) {
        videoLabelDelete.text('Удалить');
    }
    var pFileUploadTag = $('p.file-upload');
    if (pFileUploadTag.length > 0) {
        pFileUploadTag.each(function () {
            oldPText = $(this).html();
            oldPText = oldPText.replace('На данный момент: ', '')
            oldPText = oldPText.replace('Изменить:', '')
            $(this).html(oldPText);
            $(this).children('a').text('Ссылка ')
        });
    }
    var inputImage = $('input#id_image');
    if (inputImage.length > 0) {
        var inputImageReplace = `<input type="file" id="image-file"  accept="image/*" name="image" class="hidden"/><label class="btn btn-outline-info" for="image-file">Выбрать изображение</label>`;
        inputImage.replaceWith(inputImageReplace);
    }
    var inputVideo = $('input#id_video');
    if (inputVideo.length > 0) {
        var inputVideoReplace = `<input type="file" name="video"  accept="video/*" id="id_video" class="hidden"/><label class="btn btn-outline-info" for="id_video">Выбрать видео</label>`;
        inputVideo.replaceWith(inputVideoReplace);
    }

    function editResultListColsClass(){
        var _str_ = $("#result_list  tbody  [role=row] .field-__str__")
        if (_str_ && $(_str_).length > 0) {
            if (! $(_str_).hasClass('col-6')) {
                $(_str_).addClass('col-6')
            }
        }
        var col_title = $("#result_list  tbody  [role=row] [class^='field-title']")
        if (col_title && $(col_title).length > 0) {
            if (! $(col_title).hasClass('col-md')) {
                $(col_title).addClass('col-md')
            }
        }
        var col_message_type = $("#result_list  tbody  [role=row] .field-message_type")
        if (col_message_type && $(col_message_type).length > 0) {
            if (! $(col_message_type).hasClass('col-sm')) {
                $(col_message_type).addClass('col-sm')
            }
        }
        var col_img_th = $("#result_list  tbody  [role=row] [class^='field-display_image']")
        if (col_img_th && $(col_img_th).length > 0) {
            if (! $(col_img_th).hasClass('col-sm')) {
                $(col_img_th).addClass('col-sm')
            }
        }

    }
    editResultListColsClass();

    var formatField = $('#id_format');
    var bodyField = $('#id_body');
    var buttonsField = $('#id_buttons_json');
    var counterWrapper = $('<div class="msg-body-counter text-muted small mt-1"></div>');
    var buttonHelp = $('<div class="msg-button-help text-muted small mt-1"></div>');
    var formatHelp = $('<div class="msg-format-help text-muted small mt-1">Поддерживаются теги <b>, <i>, ссылки &lt;a href&gt;.</div>');
    var SPONSORSHIP_LIMIT = 160;

    function ensureBodyHelp() {
        if (bodyField.length && !bodyField.next('.msg-body-counter').length) {
            bodyField.after(counterWrapper);
            bodyField.after(formatHelp);
        }
    }

    function ensureButtonHelp() {
        if (buttonsField.length && !buttonsField.next('.msg-button-help').length) {
            buttonsField.after(buttonHelp);
        }
    }

    function updateBodyCounter() {
        if (!bodyField.length) {
            return;
        }
        var textLength = bodyField.val() ? bodyField.val().length : 0;
        counterWrapper.text('Для «Спонсорство»: ' + textLength + '/' + SPONSORSHIP_LIMIT + ' символов');
        counterWrapper.toggleClass('text-danger', textLength > SPONSORSHIP_LIMIT);
    }

    function toggleFormatRequirements() {
        if (!formatField.length) {
            return;
        }
        var isSponsorship = formatField.val() === 'sponsorship';
        if (isSponsorship) {
            ensureBodyHelp();
            ensureButtonHelp();
            counterWrapper.show();
            buttonHelp.text('Для «Спонсорство» максимум одна кнопка (строка: Текст | URL).');
            bodyField.attr('maxlength', SPONSORSHIP_LIMIT);
            updateBodyCounter();
        } else {
            counterWrapper.hide();
            ensureButtonHelp();
            buttonHelp.text('Можно до 8 кнопок. Формат каждой строки: Текст | URL');
            bodyField.removeAttr('maxlength');
        }
    }

    if (formatField.length && bodyField.length) {
        toggleFormatRequirements();
        formatField.on('change', function () {
            bodyField.trigger('input');
            toggleFormatRequirements();
        });
        bodyField.on('input', updateBodyCounter);
    }

    function getCookie(name) {
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function renderPreviewResult(wrapper, data, isError) {
        var deepLink = data && data.deep_link ? data.deep_link : null;
        var expiresAt = data && data.expires_at ? data.expires_at : null;
        var botStatus = data && Object.prototype.hasOwnProperty.call(data, 'bot_response_status') ? data.bot_response_status : null;
        var classes = isError ? 'alert alert-danger mt-3' : 'alert alert-success mt-3';
        var content = '';
        if (isError) {
            content = '<strong>Не удалось создать предпросмотр.</strong> ' + (data && data.detail ? data.detail : 'Попробуйте ещё раз.');
        } else {
            content = '<div><strong>Ссылка для предпросмотра</strong></div>';
            if (deepLink) {
                content += '<div><a href="' + deepLink + '" target="_blank" rel="noopener">' + deepLink + '</a></div>';
            }
            if (expiresAt) {
                content += '<div class="text-muted small">Действует до: ' + expiresAt + '</div>';
            }
            if (botStatus !== null) {
                content += '<div class="text-muted small">Бот ответил статусом: ' + botStatus + '</div>';
            }
        }
        wrapper.html('<div class="' + classes + '">' + content + '</div>');
    }

    var messageIdMatch = window.location.pathname.match(/\\/core\\/message\\/([^/]+)\\/change\\//);
    var messageId = messageIdMatch ? messageIdMatch[1] : null;
    var submitRow = $('.submit-row');

    if (messageId && submitRow.length) {
        var previewWrapper = $('<div class="preview-link-wrapper"></div>');
        var previewBtn = $('<button type="button" class="btn btn-outline-primary preview-link-btn">Отправить предпросмотр</button>');
        var previewResult = $('<div class="preview-link-result"></div>');

        previewBtn.on('click', function () {
            previewBtn.prop('disabled', true).text('Отправляем...');
            renderPreviewResult(previewResult, {detail: 'Создаём ссылку...'}, false);
            fetch('/api/message/' + messageId + '/preview/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({})
            }).then(function (response) {
                return response.json().then(function (data) {
                    return {ok: response.ok, data: data};
                });
            }).then(function (result) {
                renderPreviewResult(previewResult, result.data, !result.ok);
            }).catch(function () {
                renderPreviewResult(previewResult, {detail: 'Сервер недоступен'}, true);
            }).finally(function () {
                previewBtn.prop('disabled', false).text('Отправить предпросмотр');
            });
        });

        previewWrapper.append(previewBtn);
        previewWrapper.append(previewResult);
        submitRow.prepend(previewWrapper);
    }
});
