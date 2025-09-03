$(document).ready(function () {
    // removing hidden tag
    var hidden_avatar_label = $('[for="id_avatar_image"]');
    if (hidden_avatar_label.length > 0) {
        hidden_avatar_label.remove();
    }
})