const functions = require("firebase-functions");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const cors = require("cors")({ origin: true });

// --- ATENÇÃO: COLE SUA CHAVE AQUI DENTRO DAS ASPAS ---
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-2318711496313017-121623-db65575ab8e0daaccfadfa4a14fdee51-333898620', // <--- MUDE ISSO PELA SUA CHAVE "APP_USR-..."
    options: { timeout: 5000 }
});

exports.criarPagamento = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        try {
            // Adicionamos 'items' e 'method' na recepção dos dados
            const { items, playerInfo, total, method } = req.body;

            console.log(`Iniciando pagamento via ${method.toUpperCase()} para:`, playerInfo.email || "cliente@tropyberry.com");

            // --- LÓGICA PARA PIX (Transparente) ---
            if (method === 'pix') {
                const payment = new Payment(client);
                const result = await payment.create({
                    body: {
                        transaction_amount: parseFloat(total),
                        description: `Pedido Tropyberry - ${playerInfo.name}`,
                        payment_method_id: 'pix',
                        payer: {
                            email: 'cliente@tropyberry.com',
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
            
            // --- LÓGICA PARA CARTÃO (Link Seguro - Checkout Pro) ---
            else if (method === 'card') {
                const { Preference } = require("mercadopago");
                const preference = new Preference(client);

                 // Prepara os itens para a preferência
                 const mpItems = items.map(i => ({
                    id: String(i.id), title: i.name, quantity: Number(i.quantity), unit_price: Number(i.price)
                }));

                // !!! IMPORTANTE: TROQUE "SEU-SITE.web.app" PELO SEU LINK REAL DO FIREBASE !!!
                const siteUrl = "https://tropiberry.web.app"; 

                const result = await preference.create({
                    body: {
                        items: mpItems,
                        payer: {
                            name: playerInfo.name,
                            phone: { area_code: "83", number: playerInfo.phone }
                        },
                        back_urls: {
                            success: `${siteUrl}/?status=approved`,
                            failure: `${siteUrl}/?status=failure`,
                            pending: `${siteUrl}/?status=pending`
                        },
                        auto_return: "approved",
                        payment_methods: {
                            excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], // Força cartão
                            excluded_payment_methods: [{ id: "pix" }] // Exclui pix daqui pois já temos separado
                        }
                    }
                });

                res.status(200).json({
                    success: true,
                    type: 'card_link',
                    link: result.init_point
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