$(document).ready(function (){
    let form_primary_submit = document.querySelector(".jazzmin-login-page .login-box .btn.btn-primary.btn-block[type='submit']")
    if ( form_primary_submit) {
    let tgWidgetElement = document.createElement('script')
    tgWidgetElement.src='https://telegram.org/js/telegram-widget.js?22'
    tgWidgetElement.setAttribute('data-telegram-login',"username_new_test_bot")
    tgWidgetElement.setAttribute('data-auth-url',"/api/login/tg")
    tgWidgetElement.setAttribute('data-request-access',"write")
    tgWidgetElement.setAttribute('data-size',"large")
    tgWidgetElement.setAttribute('data-userpic',"true")

    let div_sbmt_btns = form_primary_submit.parentElement;


    div_sbmt_btns.append(tgWidgetElement)

    function onTelegramAuth(user){
        console.log('onTelegramAuth')
        console.log('onTelegramAuth[DEBUG]', user)
    }
}
if ($('form >.row > .col-12 >.btn.btn-primary.btn-block').length) {
    $('form >.row > .col-12 >.btn.btn-primary.btn-block').css({margin: "0 0 10px 0"})
}
if ($('.login-box .login-logo h1 picture img').length > 1){
    $('.login-box .login-logo h1 picture img').css('width','100%')
}
});

