<?php
// Permitir acesso do seu script
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Define a pasta onde as imagens vão ficar. O PHP cria sozinha com mkdir!
$pasta_destino = "uploads/pedidos/";

if (!file_exists($pasta_destino)) {
    mkdir($pasta_destino, 0777, true);
}

if (isset($_FILES['file']['name'])) {
    // Renomeia o arquivo para não dar conflito (timestamp + nome)
    $nome_arquivo = time() . '_' . preg_replace("/[^a-zA-Z0-9.]/", "", basename($_FILES["file"]["name"]));
    $caminho_completo = $pasta_destino . $nome_arquivo;

    // Salva na Locaweb
    if (move_uploaded_file($_FILES["file"]["tmp_name"], $caminho_completo)) {
        // Pega a URL do seu site dinamicamente
        $protocolo = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
        $dominio = $_SERVER['HTTP_HOST'];
        $url_imagem = $protocolo . "://" . $dominio . "/" . $caminho_completo;

        echo json_encode(["sucesso" => true, "url" => $url_imagem]);
    } else {
        echo json_encode(["sucesso" => false, "erro" => "Erro ao gravar arquivo na Locaweb."]);
    }
} else {
    echo json_encode(["sucesso" => false, "erro" => "Nenhuma imagem recebida."]);
}
?>