const functions = require("firebase-functions");
const { MercadoPagoConfig, Payment, Preference, PreApproval } = require("mercadopago"); 
const cors = require("cors")({ origin: true });

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
            const { items, playerInfo, total, method, planName } = req.body;

            // --- GARANTIA DE VALOR NUMÉRICO (Correção do Erro) ---
            // Converte para float, fixa em 2 casas e transforma em Número novamente
            const totalFormatado = Number(parseFloat(total).toFixed(2));

            console.log(`Iniciando pagamento via ${method.toUpperCase()} para:`, playerInfo.email || "cliente@tropyberry.com");

            // --- 1. LÓGICA PARA ASSINATURA (CLUBE DO AÇAÍ) ---
            if (method === 'subscription') {
                const preApproval = new PreApproval(client);
                
                const result = await preApproval.create({
                    body: {
                        reason: planName || "Assinatura Clube TropiBerry",
                        auto_recurring: {
                            frequency: 1,
                            frequency_type: "months",
                            transaction_amount: totalFormatado, // Valor corrigido
                            currency_id: "BRL"
                        },
                        back_url: "https://tropiberry.web.app",
                        payer_email: playerInfo.email,
                        status: "pending"
                    }
                });

                return res.status(200).json({
                    success: true,
                    type: 'subscription',
                    init_point: result.init_point 
                });
            }

            // --- 2. LÓGICA PARA PIX ---
            else if (method === 'pix') {
                const payment = new Payment(client);
                const result = await payment.create({
                    body: {
                        transaction_amount: totalFormatado, // Valor corrigido
                        description: `Pedido Tropyberry - ${playerInfo.name}`,
                        payment_method_id: 'pix',
                        payer: {
                            email: playerInfo.email || 'cliente@tropyberry.com',
                            first_name: playerInfo.name.split(" ")[0],
                            last_name: playerInfo.name.split(" ").slice(1).join(" ") || "Cliente",
                            identification: { type: "CPF", number: "19119119100" } 
                        }
                    }
                });

                if(result.point_of_interaction) {
                    const data = result.point_of_interaction.transaction_data;
                    return res.status(200).json({ 
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
            
            // --- 3. LÓGICA PARA CARTÃO ---
            else if (method === 'card') {
                const preference = new Preference(client);

                const mpItems = items.map(i => ({
                    id: String(i.id),
                    title: i.title, 
                    quantity: Number(i.quantity),
                    // Garante que o preço unitário de cada item também esteja formatado
                    unit_price: Number(parseFloat(i.unit_price).toFixed(2)), 
                    currency_id: 'BRL',
                    description: i.description || 'Produto'
                }));

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

                return res.status(200).json({
                    success: true,
                    type: 'card_link',
                    init_point: result.init_point,
                    sandbox_init_point: result.sandbox_init_point 
                });
            } else {
                return res.status(400).json({ error: "Método de pagamento inválido." });
            }

        } catch (error) {
            console.error("Erro MP:", error);
            return res.status(500).json({ error: error.message || "Erro desconhecido no servidor." });
        }
    });
});