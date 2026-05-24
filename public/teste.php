<?php
$ch = curl_init('https://tropiberry.site/webhook-ifood.php');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['id' => 'TESTE_123', 'code' => 'PLC']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type:application/json']);
curl_exec($ch);
curl_close($ch);
?>