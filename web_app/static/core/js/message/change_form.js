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

});