<?php
$username = 'noxonsbot';
$password = 'dsfsdfsdfsdf434ff434f34ff334fdddd23222222';
$freepbx_url = 'sip.qazna24.kz';
$ari_port = '8089';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://$freepbx_url:$ari_port/ari/endpoints");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
curl_setopt($ch, CURLOPT_VERBOSE, 1);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Пропуск проверки SSL-сертификата
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Пропуск проверки имени хоста в сертификате

$response = curl_exec($ch);
if (curl_errno($ch)) {
    echo 'Error: ' . curl_error($ch);
} else {
    $endpoints = json_decode($response, true);
    if (is_array($endpoints)) {
        foreach ($endpoints as $endpoint) {
            echo "Operator: {$endpoint['resource']} - Status: {$endpoint['state']}\n";
        }
    } else {
        echo "Error: Invalid response or no endpoints found.\n";
        echo "Response: $response\n";
    }
}
curl_close($ch);
?>