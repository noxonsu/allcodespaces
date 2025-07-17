$(document).ready( function () {
    $.fn.exists =  function(){
        return ($(this).length > 0);
    }
    var channel_admin_tab_nav = $('li.nav-item a[aria-controls="администраторы-каналов-tab"]')
    var channel_admin_selector = $('[data-channel_admin-select]')

    channel_admin_tab_nav.on('mousenter focus mouseleave click', function (e) {
        if (channel_admin_tab_nav.hasClass('active')) {
            channel_admin_selector.select2({containerCss: {width: "50% !important"}});
        }
    });
});
