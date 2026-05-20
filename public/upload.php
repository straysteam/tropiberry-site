<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Define a pasta de destino
$pasta_destino = "uploads/pedidos/";

// Tenta criar a pasta se não existir
if (!file_exists($pasta_destino)) {
    if (!mkdir($pasta_destino, 0755, true)) {
        echo json_encode(["sucesso" => false, "erro" => "Não foi possível criar a pasta. Verifique permissões."]);
        exit;
    }
}

// Verifica se a pasta tem permissão de escrita
if (!is_writable($pasta_destino)) {
    echo json_encode(["sucesso" => false, "erro" => "Pasta sem permissão de escrita (CHMOD 755/777)."]);
    exit;
}

if (isset($_FILES['file']['name'])) {
    $extensao = pathinfo($_FILES["file"]["name"], PATHINFO_EXTENSION);
    $nome_arquivo = time() . '_' . bin2hex(random_bytes(5)) . '.' . $extensao;
    $caminho_completo = $pasta_destino . $nome_arquivo;

    if (move_uploaded_file($_FILES["file"]["tmp_name"], $caminho_completo)) {
        $protocolo = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
        $url_imagem = $protocolo . "://" . $_SERVER['HTTP_HOST'] . "/" . $caminho_completo;
        echo json_encode(["sucesso" => true, "url" => $url_imagem]);
    } else {
        echo json_encode(["sucesso" => false, "erro" => "Falha no move_uploaded_file."]);
    }
} else {
    echo json_encode(["sucesso" => false, "erro" => "Nenhum arquivo enviado."]);
}
?>