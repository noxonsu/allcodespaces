$(document).ready(function(){
    $('a.nav-link').on('click', function(e) {
        var navInnerText = $(this).text().trim();
        if (navInnerText === 'Администраторы') {
        var add_new_related_model_btn = $('a.addlink');
        if (add_new_related_model_btn.length > 0) {
            var new_text = add_new_related_model_btn.text().replace('еще один Администраторы', 'Администратора');
            add_new_related_model_btn.text(new_text);
            }
        }
    });
})