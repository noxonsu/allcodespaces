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
});