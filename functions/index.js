// functions/index.js
const functions = require("firebase-functions");
const { MercadoPagoConfig, Preference } = require("mercadopago");
const cors = require("cors")({ origin: true });

// CONFIGURE AQUI SEU ACCESS TOKEN DO MERCADO PAGO
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
            const { items, playerInfo } = req.body;

            // Converter itens do carrinho para o formato do Mercado Pago
            const mpItems = items.map(item => ({
                id: item.id.toString(),
                title: item.name,
                description: item.description ? item.description.substring(0, 200) : "",
                quantity: parseInt(item.quantity),
                unit_price: parseFloat(item.price)
            }));

            const preference = new Preference(client);
            
            const result = await preference.create({
                body: {
                    items: mpItems,
                    payer: {
                        name: playerInfo.name,
                        // email: "email_do_cliente@exemplo.com", // Se você coletar email, ponha aqui
                    },
                    back_urls: {
                        success: "https://SEU-SITE.web.app/sucesso", // Página para onde volta após pagar
                        failure: "https://SEU-SITE.web.app/erro",
                        pending: "https://SEU-SITE.web.app/pendente"
                    },
                    auto_return: "approved",
                }
            });

            // Retorna o link de pagamento (init_point)
            res.status(200).json({ 
                link: result.init_point, // Link para Desktop
                mobile_link: result.init_point // O link funciona para ambos hoje em dia
            });

        } catch (error) {
            console.error("Erro MP:", error);
            res.status(500).json({ error: error.message });
        }
    });
});