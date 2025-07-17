$(document).ready( function() {
    $.fn.exists = function() {
    return this.length > 0;
  };
    var select_channel = $('select[data-channel-select]');
    if (select_channel.exists()) {
        select_channel.on('change', function (e) {
            var channel_id = this.value;
            var location_splited = location.href.split('/')
            var protocol = location_splited[0]
            var domain = location_splited[2]
            var campaign_id = location_splited[5]
            var url = protocol + '//' + domain + '/core/channel/'+`${channel_id}/channel-admins-list`
            $.ajax({
                url:url ,
                method: "GET",
            }).done(function (list_admins){
                $('[data-channel_admin-select]').empty();
                if (list_admins.length > 0) {
                    var option = new Option(list_admins[0]['text'], list_admins[0]['id'], true, true);
                    $('[data-channel_admin-select]').append(option).trigger('change');
                }else{
                    $('[data-channel_admin-select]').prop('disabled', false);
                }
            });
        });
  }
});
