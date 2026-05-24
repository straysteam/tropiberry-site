<?php
// webhook-ifood.php - Recebe os pedidos enviados pelo iFood
$data = file_get_contents('php://input');
$logFile = 'log_ifood.txt';

// Salva o JSON bruto num arquivo de texto para você ver o que o iFood manda
file_put_contents($logFile, date('Y-m-d H:i:s') . " - " . $data . PHP_EOL, FILE_APPEND);

// Responde ao iFood que recebeu o evento com sucesso (HTTP 200)
http_response_code(200);
echo "OK";
?>