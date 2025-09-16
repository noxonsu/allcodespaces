$(document).ready( function() {
    $.fn.exists = function() {
    return this.length > 0;
  };

    var select_channel = $('select[data-channel-select]');

    function getChannelAdmin(){
        var select_channel = $('select[data-channel-select]');
        select_channel.each(function () {
            $(this).on('change', function (e) {
                var channel_id = this.value;
                var location_splited = location.href.split('/')
                var protocol = location_splited[0]
                var domain = location_splited[2]
                var campaign_id = location_splited[5]
                var url = protocol + '//' + domain + '/core/channel/'+`${channel_id}/channel-admins-list`
                var id_select_channel_admin = $(this).attr('id') + '_admin';
                console.log('weqweqwe', id_select_channel_admin);

                $.ajax({
                    url:url ,
                    method: "GET",
                }).done(function (list_admins){
                    // $('[data-channel_admin-select]').empty();
                    if (list_admins.length > 0) {
                        var option = new Option(list_admins[0]['text'], list_admins[0]['id'], true, true);
                        // $('[data-channel_admin-select]').append(option).trigger('change');
                        $('#'+id_select_channel_admin).append(option).trigger('change');
                    }else{
                        $('[data-channel_admin-select]').prop('disabled', false);
                        $('#'+id_select_channel_admin).empty();
                    }
                });

            });
        });

    }
    getChannelAdmin()


const waitForElement = (selector, callback) => {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.matches && node.matches(selector)) {
          callback(node);
          observer.disconnect();
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
};

waitForElement('.add-row', element => {
  $(element).click(
      function (e){
        $('[data-channel_admin-select]').eq(-2).empty();
        getChannelAdmin()
      }
  );
});


    function addTotalsTr() {
        newRow = `<tr class='form-row has_original dynamic-campaigns_channel' id='campaigns_channel-totals'> 
                    <td class="campaigns_channel-totals-label field-channel"><lable class="h6 font-weight-bold font-italic" style="color:#64748b;">Итого</lable></td>
                    <td class="campaigns_channel-totals-field-1 field-channel_invitation_link"></td>
                    <td class="campaigns_channel-totals-field-2 field-channel_admin"></td>
                    <td class="campaigns_channel-totals-field-3 field-cpm">${$('label[data-totals-avg-cpm]').data('totals-avg-cpm')}</td>
                    <td class="campaigns_channel-totals-field-4 field-plan_cpm">${$('label[data-totals-avg-cpm-plan]').data('totals-avg-cpm-plan')}</td>
                    <td class="campaigns_channel-totals-field-5 field-cpm_diff">${$('label[data-totals-cpm-diff]').data('totals-cpm-diff')}</td>
                    <td class="campaigns_channel-totals-field-6 field-impressions_plan">${$('label[data-totals-impressions-plan]').data('totals-impressions-plan')}</td>
                    <td class="campaigns_channel-totals-field-7 field-impressions_fact">${$('label[data-totals-impressions-fact]').data('totals-impressions-fact')}</td>
                    <td class="campaigns_channel-totals-field-8 field-clicks">${$('label[data-totals-clicks]').data('totals-clicks')}</td>
                    <td class="campaigns_channel-totals-field-9 field-ctr">${$('label[data-totals-ctr]').data('totals-ctr')}</td>
                    <td class="campaigns_channel-totals-field-10 field-budget">${$('label[data-totals-budget]').data('totals-budget')}</td>
                    <td class=""></td>
                    <td class=""></td>
                    <td class=""></td>
                    <td class=""></td>
                    <td class=""></td>
                  </tr>`;
    $(newRow).insertAfter($('#campaign-channel-table tr:last'));
}
    addTotalsTr()
});