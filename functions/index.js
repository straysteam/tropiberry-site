const functions = require("firebase-functions");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago"); // Adicionei Preference aqui no topo
const cors = require("cors")({ origin: true });

// --- ATENÇÃO: SUA CHAVE JÁ ESTÁ CONFIGURADA ---
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-2318711496313017-121623-db65575ab8e0daaccfadfa4a14fdee51-333898620', 
    options: { timeout: 5000 }
});

exports.criarPagamento = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        try {
            const { items, playerInfo, total, method } = req.body;

            console.log(`Iniciando pagamento via ${method.toUpperCase()} para:`, playerInfo.email || "cliente@tropyberry.com");
            
            // Debug: Ver o que chegou
            console.log("Itens recebidos:", JSON.stringify(items));

            // --- LÓGICA PARA PIX ---
            if (method === 'pix') {
                const payment = new Payment(client);
                const result = await payment.create({
                    body: {
                        transaction_amount: parseFloat(total),
                        description: `Pedido Tropyberry - ${playerInfo.name}`,
                        payment_method_id: 'pix',
                        payer: {
                            email: playerInfo.email || 'cliente@tropyberry.com',
                            first_name: playerInfo.name.split(" ")[0],
                            last_name: playerInfo.name.split(" ").slice(1).join(" ") || "Cliente",
                            identification: { type: "CPF", number: "19119119100" } // CPF Genérico
                        }
                    }
                });

                if(result.point_of_interaction) {
                    const data = result.point_of_interaction.transaction_data;
                    res.status(200).json({ 
                        success: true,
                        type: 'pix',
                        qr_code: data.qr_code, 
                        qr_code_base64: data.qr_code_base64,
                        id: result.id
                    });
                } else {
                    throw new Error("O Mercado Pago não retornou o QR Code.");
                }
            } 
            
            // --- LÓGICA PARA CARTÃO ---
            else if (method === 'card') {
                const preference = new Preference(client);

                 // ========================================================
                 // AQUI ESTAVA O ERRO! CORREÇÃO ABAIXO:
                 // ========================================================
                 const mpItems = items.map(i => ({
                    id: String(i.id),
                    title: i.title,           // <--- MUDADO DE i.name PARA i.title
                    quantity: Number(i.quantity),
                    unit_price: Number(i.unit_price), // <--- MUDADO DE i.price PARA i.unit_price
                    currency_id: 'BRL',
                    description: i.description || 'Produto'
                }));
                // ========================================================

                const siteUrl = "https://tropiberry.web.app"; 

                const result = await preference.create({
                    body: {
                        items: mpItems,
                        payer: {
                            name: playerInfo.name,
                            email: playerInfo.email || 'cliente@tropyberry.com',
                            phone: { area_code: "83", number: playerInfo.phone }
                        },
                        back_urls: {
                            success: `${siteUrl}/?status=approved`,
                            failure: `${siteUrl}/?status=failure`,
                            pending: `${siteUrl}/?status=pending`
                        },
                        auto_return: "approved",
                        payment_methods: {
                            excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], 
                            excluded_payment_methods: [{ id: "pix" }]
                        }
                    }
                });

                res.status(200).json({
                    success: true,
                    type: 'card_link',
                    init_point: result.init_point, // Garante envio correto
                    sandbox_init_point: result.sandbox_init_point // Garante envio correto
                });
            } else {
                res.status(400).json({ error: "Método de pagamento inválido." });
            }

        } catch (error) {
            console.error("Erro MP:", error);
            res.status(500).json({ error: error.message || "Erro desconhecido no servidor." });
        }
    });
}); 