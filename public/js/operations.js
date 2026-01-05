    import { db } from './auth.js';
    import { 
        collection, 
        onSnapshot, 
        query, 
        where, 
        doc, 
        updateDoc, 
        getDocs, 
        orderBy,
        getDoc,         
        setDoc,         
        addDoc,         
        serverTimestamp,
        increment,
        writeBatch,
        runTransaction // <--- O ERRO ESTÁ AQUI: Faltava importar isso!
    } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

    let kitchenListener = null;
    let allProductsLocal = []; // Cache local para busca e contagem
    let inventoryListener = null;

    // === 1. COZINHA (KITCHEN) ===
    window.iniciarMonitorCozinha = () => {
        if (kitchenListener) kitchenListener();

        // Filtra pedidos com status "Em Preparo"
        const q = query(collection(db, "pedidos"), where("status", "==", "Em Preparo"), orderBy("createdAt", "asc"));
        
        kitchenListener = onSnapshot(q, (snapshot) => {
            const grid = document.getElementById('kitchen-grid');
            const badge = document.getElementById('kitchen-count-badge');
            
            if (!grid) return;
            
            grid.innerHTML = '';
            badge.innerText = snapshot.size;

            if (snapshot.empty) {
                grid.innerHTML = `<div class="col-span-full py-20 text-center text-gray-400">Nenhum pedido em preparação no momento.</div>`;
                return;
            }

            snapshot.forEach(docSnap => {
                const order = docSnap.data();
                const id = docSnap.id;
                const time = order.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || '--:--';

                grid.innerHTML += `
                    <div class="bg-white rounded-xl border-2 border-gray-100 shadow-sm overflow-hidden flex flex-col h-fit">
                        <div class="bg-gray-50 p-3 border-b flex justify-between items-center">
                            <span class="font-bold text-gray-700">#${id.slice(-4).toUpperCase()}</span>
                            <span class="text-[10px] font-bold text-gray-400"><i class="far fa-clock"></i> ${time}</span>
                        </div>
                        <div class="p-4 flex-1">
                            <div class="space-y-3">
                                ${order.items.map(item => `
                                    <div class="border-b border-gray-50 pb-2">
                                        <div class="flex justify-between items-start">
                                            <span class="text-sm font-bold text-gray-800">${item.quantity}x ${item.name}</span>
                                            <i class="fas fa-utensils text-gray-200"></i>
                                        </div>
                                        ${item.details ? `<p class="text-[10px] text-orange-500 font-medium mt-1"><i class="fas fa-exclamation-circle"></i> ${item.details}</p>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="p-3 bg-gray-50 border-t">
                            <button onclick="finalizarPreparo('${id}')" class="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition shadow-sm">
                                MARCAR COMO PRONTO
                            </button>
                        </div>
                    </div>
                `;
            });
        });
    };

    window.finalizarPreparo = async (id) => {
        try {
            await updateDoc(doc(db, "pedidos", id), { 
                status: "Pronto",
                updatedAt: new Date()
            });
           showToast("Cozinha", "Pedido marcado como pronto!");
        } catch (e) { 
            console.error("Erro ao finalizar:", e); 
        }
    };

    // === 2. INVENTÁRIO (INVENTORY) ===

    window.renderizarInventario = () => {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return; 

    // Limpa listener anterior para não duplicar
    if (inventoryListener) inventoryListener();

    // Inicia o monitoramento em tempo real
    const q = query(collection(db, "produtos"), orderBy("name"));

    inventoryListener = onSnapshot(q, (snapshot) => {
        let disponivel = 0, alerta = 0, esgotado = 0;
        let html = '';
        const searchTerm = document.getElementById('inventory-search')?.value.toLowerCase() || '';

        allProductsLocal = []; 
        snapshot.forEach(doc => allProductsLocal.push({ id: doc.id, ...doc.data() }));

        const filtrados = allProductsLocal.filter(p => p.name.toLowerCase().includes(searchTerm));

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum produto encontrado.</td></tr>';
        } else {
            filtrados.forEach(p => {
                const estoque = p.stock || 0;
                const min = p.minStock || 5; 
                const controlaEstoque = p.stockControl === true;

                // Lógica de Status
                let statusClass = "bg-green-100 text-green-700";
                let statusText = "Disponível";
                let rowClass = "hover:bg-gray-50"; 

                if (controlaEstoque) {
                    if (estoque <= 0) {
                        esgotado++;
                        statusClass = "bg-red-100 text-red-700";
                        statusText = "Esgotado";
                        rowClass = "bg-red-50 hover:bg-red-100"; 
                    } else if (estoque <= min) {
                        alerta++;
                        statusClass = "bg-yellow-100 text-yellow-800";
                        statusText = "Baixo Estoque";
                        rowClass = "bg-yellow-50/50 hover:bg-yellow-50"; 
                    } else {
                        disponivel++;
                    }
                } else {
                    disponivel++;
                    statusText = "Livre";
                }

                html += `
                    <tr class="border-b transition ${rowClass}">
                        <td class="px-6 py-4 font-bold text-gray-700">
                            ${p.name}
                            ${estoque <= min && controlaEstoque && estoque > 0 ? '<span class="ml-2 text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded">ALERTA</span>' : ''}
                        </td>
                        <td class="px-6 py-4">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" ${controlaEstoque ? 'checked' : ''} onchange="toggleCampoProduto('${p.id}', 'stockControl', this.checked)">
                                <div class="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:bg-cyan-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                            </label>
                        </td>
                        <td class="px-6 py-4">
                            <span class="${statusClass} px-2 py-1 rounded-lg text-[10px] font-bold uppercase border border-black/5">
                                ${statusText}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <div class="flex items-center justify-center gap-2 ${!controlaEstoque ? 'opacity-30 pointer-events-none' : ''}">
                                <button onclick="ajustarEstoque('${p.id}', -1)" class="w-6 h-6 border rounded bg-white hover:bg-gray-100 font-bold text-gray-600">-</button>
                                
                                <span id="qty-${p.id}" class="font-bold text-sm min-w-[30px] text-center">${estoque}</span>
                                
                                <button onclick="ajustarEstoque('${p.id}', 1)" class="w-6 h-6 border rounded bg-white hover:bg-gray-100 font-bold text-gray-600">+</button>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <input type="number" value="${min}" onchange="toggleCampoProduto('${p.id}', 'minStock', parseInt(this.value))" class="w-12 text-right text-xs font-bold text-gray-400 outline-none border-b border-transparent focus:border-cyan-500 bg-transparent">
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }

        // Atualiza cabeçalho
        document.getElementById('inv-count-disponivel').innerText = `${disponivel} Disponível`;
        document.getElementById('inv-count-alerta').innerText = `(${alerta} Alerta)`;
        if(alerta > 0) document.getElementById('inv-count-alerta').className = "text-yellow-600 font-bold animate-pulse";
        document.getElementById('inv-count-esgotado').innerText = `${esgotado} Esgotado`;
    });
};

    window.ajustarEstoque = async (id, delta) => {
        const prodRef = doc(db, "produtos", id);
        try {
            // Usa transação para evitar erros se duas pessoas clicarem juntas
            await runTransaction(db, async (transaction) => {
                const prodDoc = await transaction.get(prodRef);
                if (!prodDoc.exists()) throw "Produto não existe";

                const data = prodDoc.data();
                // Garante que o estoque nunca fique negativo visualmente na conta
                let novoValor = (data.stock || 0) + delta;
                if (novoValor < 0) novoValor = 0;

                const updates = { stock: novoValor };
                
                // Lógica automática: 
                // Se zerar -> Tira do site (available = false)
                // Se for maior que 0 -> Volta pro site (available = true)
                if (novoValor <= 0) {
                    updates.available = false;
                } else {
                    updates.available = true;
                }

                transaction.update(prodRef, updates);
            });
            // Não precisa chamar renderizarInventario() aqui pois o onSnapshot faz isso sozinho
        } catch (e) {
            console.error("Erro ajuste manual:", e);
            alert("Erro ao ajustar estoque: " + e);
        }
    };
    window.toggleDisponibilidade = async (id, val) => {
        try {
            await updateDoc(doc(db, "produtos", id), { available: val === 'true' });
            renderizarInventario();
        } catch (e) { console.error(e); }
    };

    window.toggleCampoProduto = async (id, campo, val) => {
        try {
            await updateDoc(doc(db, "produtos", id), { [campo]: val });
            if (campo === 'minStock') renderizarInventario();
        } catch (e) { console.error(e); }
    };

    window.exportarInventarioCSV = () => {
        if (allProductsLocal.length === 0) return alert("Nenhum dado para exportar.");

        let csv = '\uFEFF'; // BOM para Excel reconhecer acentos
        csv += 'Produto,Categoria,Estoque Atual,Estoque Minimo,Status,Preco\n';
        
        allProductsLocal.forEach(p => {
            const status = p.available !== false ? 'Disponivel' : 'Fora de Estoque';
            csv += `"${p.name}","${p.category || ''}",${p.stock || 0},${p.minStock || 0},"${status}",${p.price || 0}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        
        link.setAttribute("href", url);
        link.setAttribute("download", `inventario_tropyberry_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // === CONTROLE DE MODAIS ===
    window.abrirModalConfirmAll = () => document.getElementById('modal-confirm-all-ready').classList.remove('hidden');
    window.fecharModalConfirmAll = () => document.getElementById('modal-confirm-all-ready').classList.add('hidden');
    window.abrirModalConfigCozinha = () => document.getElementById('modal-config-kitchens').classList.remove('hidden');
    window.fecharModalConfigCozinha = () => document.getElementById('modal-config-kitchens').classList.add('hidden');

    // === MARCAR TODOS COMO PRONTO (Img 1 funcional) ===
    window.marcarTodosComoProntos = async () => {
        try {
            // Busca todos os pedidos "Em Preparo"
            const q = query(collection(db, "pedidos"), where("status", "==", "Em Preparo"));
            const snapshot = await getDocs(q);
            
            if(snapshot.empty) return fecharModalConfirmAll();

            // Atualiza um por um no Firestore (Batch update simulado)
            const promessas = snapshot.docs.map(docSnap => 
                updateDoc(doc(db, "pedidos", docSnap.id), { 
                    status: "Pronto",
                    updatedAt: new Date()
                })
            );

            await Promise.all(promessas);
            fecharModalConfirmAll();
            showToast("Cozinha", "Todos os pedidos foram marcados como prontos!");
        } catch (e) {
            console.error("Erro ao limpar cozinha:", e);
        }
    };

    // === ATUALIZAÇÃO AUTOMÁTICA EM TEMPO REAL (Img 2 funcional) ===
    window.toggleKitchenAutoRefresh = () => {
        const mainBtn = document.getElementById('kitchen-auto-refresh-btn');
        const sideToggle = document.getElementById('toggle-auto-refresh-kitchen');
        const badge = document.getElementById('auto-refresh-status-badge');

        if (kitchenListener) {
            // DESATIVAR
            kitchenListener();
            kitchenListener = null;
            
            // UI Dashboard
            if(mainBtn) {
                mainBtn.innerText = "Ativar atualização automática";
                mainBtn.classList.replace('bg-orange-500', 'bg-blue-600');
            }
            // UI Modal Lateral
            if(sideToggle) sideToggle.checked = false;
            if(badge) {
                badge.innerText = "Desativado";
                badge.className = "text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-bold uppercase";
            }
        } else {
            // ATIVAR
            iniciarMonitorCozinha();
            
            // UI Dashboard
            if(mainBtn) {
                mainBtn.innerText = "Pausar atualização";
                mainBtn.classList.replace('bg-blue-600', 'bg-orange-500');
            }
            // UI Modal Lateral
            if(sideToggle) sideToggle.checked = true;
            if(badge) {
                badge.innerText = "Ativado";
                badge.className = "text-[10px] bg-green-100 text-green-500 px-2 py-0.5 rounded-full font-bold uppercase";
            }
        }
    };
    window.renomearCozinha = async () => {
        const nomeAtual = document.getElementById('kitchen-name-label').innerText;
        const novoNome = prompt("Digite o novo nome para esta cozinha:", nomeAtual);
        
        if (novoNome && novoNome !== nomeAtual) {
            try {
                await updateDoc(doc(db, "config", "cozinha"), { nomePrincipal: novoNome }, { merge: true });
                document.getElementById('kitchen-name-label').innerText = novoNome;
                window.showToast("Cozinha", "Nome atualizado com sucesso!"); // Uso do Toast
            } catch (e) {
                window.showToast("Erro", "Falha ao renomear.", true);
            }
        }
    };

    // 2. Criar nova cozinha (Img 933466)
    window.criarNovaCozinha = async () => {
        const nome = prompt("Qual o nome da nova cozinha (ex: Bar, Grelha)?");
        if (!nome) return;

        try {
            const docRef = doc(db, "config", "cozinha");
            const docSnap = await getDoc(docRef);
            let cozinhas = docSnap.exists() ? (docSnap.data().lista || []) : [];
            
            cozinhas.push({ id: Date.now(), nome: nome, ativa: true });
            await setDoc(docRef, { lista: cozinhas }, { merge: true });
            
            window.showToast("Sucesso", `Cozinha "${nome}" criada!`); // Uso do Toast
        } catch (e) {
            window.showToast("Erro", "Erro ao criar cozinha.", true);
        }
    };

    // 3. Botão de manter produtos após concluir (Img 933466)
    window.salvarConfigManterProdutos = async () => {
        const checkbox = document.getElementById('cfg-keep-kitchen-items');
        const valor = checkbox.checked;

        try {
            await updateDoc(doc(db, "config", "cozinha"), { 
                manterAposConcluir: valor 
            }, { merge: true });
            
            showToast(valor ? "Ativado" : "Desativado", "Configuração de permanência salva!");
        } catch (e) {
            console.error("Erro ao salvar config:", e);
        }
    };

    // Carregar configurações ao abrir o modal
    window.abrirModalConfigCozinha = async () => {
        document.getElementById('modal-config-kitchens').classList.remove('hidden');
        
        try {
            const docSnap = await getDoc(doc(db, "config", "cozinha"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if(data.nomePrincipal) document.getElementById('kitchen-name-label').innerText = data.nomePrincipal;
                if(data.manterAposConcluir !== undefined) document.getElementById('cfg-keep-kitchen-items').checked = data.manterAposConcluir;
            }
        } catch (e) { console.error(e); }
    };
    const MSG_TEMPLATES = {
        'boas-vindas': "👋 Olá, {client.name}!\nBem-vindo(a) à TropyBerry! 💜\n\nComo podemos te ajudar hoje?\n\nA. Fazer um pedido 🍦\nB. Obter mais informações ℹ️\n\nResponda com a letra da opção desejada.",
        'ausencia': "👋 Olá, {client.name}!\nNo momento estamos atendendo apenas pedidos agendados. 🕒\n\n🔗 Você pode fazer seu pedido aqui: {company.url}\n\nVoltamos em breve! 💜",
        'fazer-pedido': "Ótima escolha! 🍦\nPara agilizar seu atendimento, acesse nosso cardápio digital:\n\n👉 {company.url}\n\nLá você monta seu copo do seu jeito!",
        'promocoes': "🔥 OFERTAS DO DIA 🔥\n\nConfira as promoções exclusivas que preparamos para você hoje no nosso site!\n\nNão perca tempo!",
        'informacoes': "Aqui estão as informações da TropyBerry:\n\n📍 Endereço: {company.address}\n📞 WhatsApp: {company.phone}\n\nQualquer dúvida, estamos à disposição!",
        'horarios': "🕒 Nossos horários de atendimento:\n\nSeg a Sex: 14:00 às 22:00\nSáb e Dom: 13:00 às 23:00"
    };

    window.selecionarMsgBot = (tipo) => {
        // UI: Botões
        document.querySelectorAll('.msg-bot-btn').forEach(b => {
            b.className = "msg-bot-btn p-3 text-left text-sm border-l-4 border-transparent hover:bg-gray-50 transition";
        });
        const clickedBtn = event.currentTarget;
        clickedBtn.className = "msg-bot-btn active p-3 text-left text-sm border-l-4 border-blue-600 bg-blue-50 font-bold text-blue-700";

        // UI: Título e Input
        const titulos = {
            'boas-vindas': 'Mensagem de boas-vindas',
            'ausencia': 'Mensagem de ausência',
            'fazer-pedido': 'Mensagem para fazer pedido',
            'promocoes': 'Mensagem de promoções',
            'informacoes': 'Solicitar informações',
            'horarios': 'Horários de atendimento'
        };

        document.getElementById('bot-edit-title').innerText = titulos[tipo];
        document.getElementById('bot-text-input').value = MSG_TEMPLATES[tipo];
        
        atualizarPreviewCelular();
    };

    window.atualizarPreviewCelular = () => {
        const text = document.getElementById('bot-text-input').value;
        const preview = document.getElementById('phone-preview-bubble');
        // Converte quebras de linha para <br>
        preview.innerHTML = text.replace(/\n/g, '<br>');
    };

    // Inicia com a primeira mensagem ao carregar a tela
    setTimeout(() => {
        if(document.getElementById('bot-text-input')) {
            document.getElementById('bot-text-input').value = MSG_TEMPLATES['boas-vindas'];
            atualizarPreviewCelular();
        }
    }, 500);
    const BOT_CONTENT = {
        'boas-vindas': {
            title: "Mensagem de boas-vindas",
            desc: "Responda automaticamente aos clientes que iniciam uma conversa no WhatsApp. Ofereça duas ações a serem realizadas.",
            incoming: "Olá, bom dia",
            bot: "👋🏼 Olá, {client.name}<br><br>Bem-vindo(a) à <b>{company.name}</b>!💜 Estamos aqui para garantir que sua experiência seja deliciosa e sem complicações. Como podemos te ajudar hoje?<br><br>A. Fazer um pedido 🍽️<br>B. Obter mais informações ℹ<br><br>Selecione a letra da opção que você deseja consultar e envie como resposta. Estamos aqui para ajudar!"
        },
        'ausencia': {
            title: "Mensagem de ausência",
            desc: "Responda automaticamente aos seus clientes com uma mensagem de ausência quando seu negócio não estiver disponível.",
            incoming: "Olá, bom dia",
            bot: "👋🏼 Olá, {client.name}<br><br>No momento, estamos atendendo apenas pedidos agendados. 🕑<br><br>🔗 Você pode fazer seu pedido aqui: {company.url_products}<br><br>🕑 Nosso horário de atendimento é: {company.business_hours}<br><br>Esperamos vê-lo em breve! 🙌🏼 💜💜"
        },
        'fazer-pedido': {
            title: "Mensagem para fazer um pedido",
            desc: "Envie automaticamente seu menu digital para que seus clientes possam pedir de forma fácil e rápida.",
            incoming: "Você tem o menu?",
            bot: "Ótimo! 🎉 Para fazer seu pedido, entre no seguinte link e escolha seus copos favoritos:<br><br>🔗 Faça seu pedido aqui:<br>{company.url_products}<br><br>Estamos prontos para preparar um delicioso açai para você! 🍽️💜💜"
        },
        'promocoes': {
            title: "Mensagem de promoções",
            desc: "Mantenha seus clientes informados sobre as promoções do seu negócio.",
            incoming: "Vocês têm algum desconto?",
            bot: "Grandes notícias 😍🎉 Temos promoções incríveis esperando por você. Aproveite agora e desfrute dos seus copos favoritos com descontos especiais. 💜💜<br><br>Não perca esta oportunidade! Peça hoje e saboreie o irresistível. 🚀🛍️<br><br>🔗 Descubra mais aqui: {company.url_promotions}"
        },
        'informacoes': {
            title: "Mensagem para solicitar informações",
            desc: "Forneça informações relevantes sobre o seu negócio.",
            incoming: "Tenho uma pergunta",
            bot: "Claro!<br>Encontre todas as informações sobre o nosso restaurante, incluindo horário, serviços de entrega, endereço, custos e mais, no seguinte link: {info.url} 📲"
        },
        'horarios': {
            title: "Mensagem de horários de atendimento",
            desc: "Responda automaticamente aos clientes que solicitarem o horário de funcionamento.",
            incoming: "Tenho uma pergunta",
            bot: "⏰ Aqui está nosso horário de atendimento:<br><br>{company.business_hours}<br><br>Estamos disponíveis durante esses horários para oferecer o melhor em serviço e delícias culinárias.<br><br>🔗 Faça seu pedido aqui: {company.url_products}"
        },
        'solicitar-avaliacao': {
            title: "Solicitar uma avaliação",
            desc: "Uma hora após a finalização de um pedido, o Chatbot enviará automaticamente uma mensagem pedindo uma avaliação.",
            incoming: null, // Mensagem automática do sistema
            bot: "Oi {client.name}! 👋<br><br>Muito obrigado por escolher o nosso <b>{company.name}</b><br><br>Sua opinião é muito importante para nós 🙏<br>Você pode nos ajudar dando uma avaliação? ⭐<br><br>{order.url}<br><br>Obrigado, e esperamos vê-lo novamente em breve! 😍"
        },
        'fidelidade': {
            title: "Mensagem do Programa de Fidelidade",
            desc: "Informe aos seus clientes que eles ganharam pontos e recompensas.",
            incoming: "Olá, bom dia",
            bot: "Olá {client.name} 🎉<br><br>Esperamos que tenha gostado da sua última compra!<br><br>Graças a ela, você acumulou <b>{client.available_points}</b> pontos, que podem ser trocados por descontos exclusivos 🎊.<br><br>Explore seus descontos disponíveis aqui: {company.url_loyalty}.<br><br>Obrigado por nos escolher!"
        },
        'pedido-recebido': {
            title: "Pedido recebido",
            desc: "Notifique automaticamente seus clientes de que seu pedido foi recebido.",
            incoming: null,
            bot: "📦 Recebemos seu pedido Nº <b>{order.public_id}</b>. Estamos processando."
        },
        'pedido-aceito': {
            title: "Pedido aceito",
            desc: "Notifique automaticamente seus clientes quando seu pedido for aceito.",
            incoming: null,
            bot: "✅ Oi {client.name}, seu pedido Nº <b>{order.public_id}</b> foi aceito. Estamos preparando tudo."
        },
        'pedido-pronto': {
            title: "Pedido pronto",
            desc: "Notifique automaticamente seus clientes quando seu pedido estiver pronto.",
            incoming: null,
            bot: "🍽️ Seu pedido Nº <b>{order.public_id}</b> está pronto, {client.name}."
        }
    };

    window.selecionarMsgBot = (id) => {
        // 1. Atualiza visual dos botões do menu
        document.querySelectorAll('.bot-menu-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-50', 'border-blue-600', 'font-bold', 'text-blue-700');
            btn.classList.add('border-transparent');
        });
        event.currentTarget.classList.add('active', 'bg-blue-50', 'border-blue-600', 'font-bold', 'text-blue-700');

        // 2. Troca os textos
        const data = BOT_CONTENT[id];
        if(!data) return;

        document.getElementById('bot-view-title').innerText = data.title;
        document.getElementById('bot-view-desc').innerText = data.desc;
        
        // 3. Atualiza o celular (Simulador)
        const incomingBubble = document.getElementById('bubble-incoming');
        if(data.incoming) {
            incomingBubble.classList.remove('hidden');
            document.getElementById('text-incoming').innerText = data.incoming;
        } else {
            incomingBubble.classList.add('hidden'); // Para mensagens puramente do sistema
        }

        document.getElementById('text-bot-response').innerHTML = data.bot;
    };
    const BOT_CONTENT_EXTENDED = {
        'pedido-a-caminho': {
            title: "Pedido a caminho",
            desc: "Notifique automaticamente seus clientes quando seu pedido chegar.",
            incoming: null,
            bot: "🛵 Seu pedido Nº <b>{order.public_id}</b> já está a caminho."
        },
        'pedido-chegou': {
            title: "Pedido chegou",
            desc: "Notifique automaticamente seus clientes quando seu pedido estiver a caminho.",
            incoming: null,
            bot: "📦 Seu pedido Nº <b>{order.public_id}</b> chegou ao local indicado."
        },
        'pedido-entregue': {
            title: "Pedido entregue",
            desc: "Notifique automaticamente seus clientes quando seu pedido for entregue.",
            incoming: null,
            bot: "📬 Pedido Nº <b>{order.public_id}</b> entregue com sucesso."
        },
        'pedido-finalizado': {
            title: "Pedido finalizado",
            desc: "Notifique automaticamente seus clientes quando seu pedido for finalizado.",
            incoming: null,
            bot: "🌟 Obrigado pelo pedido Nº <b>{order.public_id}</b>. Ficamos felizes em atendê-lo!"
        },
        'pedido-cancelado': {
            title: "Pedido cancelado",
            desc: "Notifique automaticamente seus clientes quando seu pedido for cancelado.",
            incoming: null,
            bot: "🚫 Lamentamos informar que o pedido Nº <b>{order.public_id}</b> foi cancelado."
        }
    };
    Object.assign(BOT_CONTENT, BOT_CONTENT_EXTENDED);

    // Adicione ao final do operations.js
    window.toggleMaisMensagens = () => {
        const container = document.getElementById('colection-extra-messages');
        const btn = document.getElementById('btn-bot-ver-mais');
        
        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            btn.innerHTML = `Ver menos <i class="fas fa-chevron-up text-[8px]"></i>`;
        } else {
            container.classList.add('hidden');
            btn.innerHTML = `Ver mais mensagens <i class="fas fa-chevron-down text-[8px]"></i>`;
        }
    };
    // === INTEGRAÇÃO REAL WHATSAPP BOT ===

    window.abrirModalQR = () => {
        document.getElementById('modal-qrcode-whatsapp').classList.remove('hidden');
        // Simulação de chamada de API para gerar QR Code
        setTimeout(() => {
            document.getElementById('qr-loading').classList.add('hidden');
            const qrImg = document.getElementById('qr-image');
            // Exemplo de QR (Substitua pela URL da sua API de WhatsApp)
            qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=TropyBerryBotConnection";
            qrImg.classList.remove('hidden');
        }, 2000);
    };

    window.fecharModalQR = () => {
        document.getElementById('modal-qrcode-whatsapp').classList.add('hidden');
    };

    // FUNÇÃO MESTRE: Envia a mensagem baseada no status
    window.enviarNotificacaoWhats = async (pedidoId, novoStatus) => {
        const pedido = allOrders.find(o => o.id === pedidoId); // Busca dados do pedido
        if (!pedido || !pedido.customer.phone) return;

        // Busca o template de texto que configuramos anteriormente
        const templateKey = `pedido-${novoStatus.toLowerCase().replace(/ /g, '-')}`;
        const template = BOT_CONTENT[templateKey] || BOT_CONTENT_EXTENDED[templateKey];

        if (template) {
            let msgFinal = template.bot
                .replace(/{client.name}/g, pedido.customer.name)
                .replace(/{order.public_id}/g, pedidoId.slice(-4).toUpperCase())
                .replace(/<br>/g, '\n')
                .replace(/<b>/g, '*')
                .replace(/<\/b>/g, '*');

            console.log(`[WHATSAPP BOT] Enviando para ${pedido.customer.phone}: ${msgFinal}`);
            
            // Aqui entra a chamada real para a sua API (ex: fetch para Evolution API)
            // showToast("WhatsApp", `Status "${novoStatus}" enviado ao cliente!`);
        }
    };
    window.processarMensagemRecebida = (numero, texto) => {
        const txt = texto.toLowerCase().trim();
        
        // Resposta automática de Boas-vindas
        if (txt === "oi" || txt === "olá" || txt === "bom dia") {
            enviarRespostaPeloWhats(numero, "boas-vindas");
        } 
        // Resposta de Cardápio/Pedido
        else if (txt === "a" || txt.includes("menu") || txt.includes("pedido")) {
            enviarRespostaPeloWhats(numero, "fazer-pedido");
        }
        // Resposta de Horários
        else if (txt === "b" || txt.includes("horario")) {
            enviarRespostaPeloWhats(numero, "horarios");
        }
    };

    // 2. Função para criar o pedido no Dashboard vindo do WhatsApp
    window.criarPedidoViaBot = async (dadosCliente, itens) => {
        try {
            const novoPedido = {
                customer: {
                    name: dadosCliente.nome,
                    phone: dadosCliente.numero,
                    address: "Pedido via WhatsApp Bot"
                },
                items: itens, // Ex: [{name: 'Açaí 500ml', quantity: 1, price: 15}]
                method: 'whatsapp',
                status: 'Aguardando',
                total: itens.reduce((acc, i) => acc + (i.price * i.quantity), 0),
                origin: 'app', // Identifica no painel com o selo roxo (Img 942b4f)
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            const docRef = await addDoc(collection(db, "pedidos"), novoPedido);
            showToast("Novo Pedido", "Um pedido vindo do WhatsApp acabou de chegar!");
            return docRef.id;
        } catch (e) { console.error("Erro ao salvar pedido do bot:", e); }
    };
    window.iniciarMonitorInventario = () => {
        const tbody = document.getElementById('inventory-table-body');
        if (!tbody) return; // Se não estiver na tela de inventário, não roda

        // Se já tiver um monitor rodando, desliga para não duplicar
        if (inventoryListener) inventoryListener();

        // Escuta a coleção "produtos" em tempo real
        const q = query(collection(db, "produtos"), orderBy("name"));

        inventoryListener = onSnapshot(q, (snapshot) => {
            let disponivel = 0, alerta = 0, esgotado = 0;
            let html = '';
            const searchTerm = document.getElementById('inventory-search')?.value.toLowerCase() || '';

            // Esvazia lista local e popula com dados novos do banco
            allProductsLocal = []; 
            snapshot.forEach(doc => allProductsLocal.push({ id: doc.id, ...doc.data() }));

            const filtrados = allProductsLocal.filter(p => p.name.toLowerCase().includes(searchTerm));

            if (filtrados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum produto encontrado.</td></tr>';
            } else {
                filtrados.forEach(p => {
                    const estoque = p.stock || 0;
                    const min = p.minStock || 5; // Padrão 5 se não tiver definido
                    const controlaEstoque = p.stockControl === true;

                    // Lógica de Cores e Contadores
                    let statusClass = "bg-green-100 text-green-700";
                    let statusText = "Disponível";
                    let rowClass = "hover:bg-gray-50"; // Linha normal

                    if (controlaEstoque) {
                        if (estoque <= 0) {
                            esgotado++;
                            statusClass = "bg-red-100 text-red-700";
                            statusText = "Esgotado / Off";
                            rowClass = "bg-red-50 hover:bg-red-100"; // Linha vermelha clara
                        } else if (estoque <= min) {
                            alerta++;
                            statusClass = "bg-yellow-100 text-yellow-800"; // Amarelo alerta
                            statusText = "Baixo Estoque";
                            rowClass = "bg-yellow-50/50 hover:bg-yellow-50"; // Linha amarela clara
                        } else {
                            disponivel++;
                        }
                    } else {
                        disponivel++; // Produtos sem controle de estoque contam como disponíveis
                        statusText = "Livre";
                    }

                    // Renderiza Linha
                    html += `
                        <tr class="border-b transition ${rowClass}">
                            <td class="px-6 py-4 font-bold text-gray-700">
                                ${p.name}
                                ${estoque <= min && controlaEstoque && estoque > 0 ? '<span class="ml-2 text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded">ALERTA</span>' : ''}
                            </td>
                            <td class="px-6 py-4">
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" class="sr-only peer" ${controlaEstoque ? 'checked' : ''} onchange="toggleCampoProduto('${p.id}', 'stockControl', this.checked)">
                                    <div class="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:bg-cyan-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                                </label>
                            </td>
                            <td class="px-6 py-4">
                                <span class="${statusClass} px-2 py-1 rounded-lg text-[10px] font-bold uppercase border border-black/5">
                                    ${statusText}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-center">
                                <div class="flex items-center justify-center gap-2 ${!controlaEstoque ? 'opacity-30 pointer-events-none' : ''}">
                                    <button onclick="ajustarEstoque('${p.id}', -1)" class="w-6 h-6 border rounded bg-white hover:bg-gray-100">-</button>
                                    <span class="font-bold text-sm min-w-[30px]">${estoque}</span>
                                    <button onclick="ajustarEstoque('${p.id}', 1)" class="w-6 h-6 border rounded bg-white hover:bg-gray-100">+</button>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-right">
                                <input type="number" value="${min}" onchange="toggleCampoProduto('${p.id}', 'minStock', parseInt(this.value))" class="w-12 text-right text-xs font-bold text-gray-400 outline-none border-b border-transparent focus:border-cyan-500 bg-transparent">
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }

            // Atualiza os contadores no topo da tela
            document.getElementById('inv-count-disponivel').innerText = `${disponivel} Disponível`;
            document.getElementById('inv-count-alerta').innerText = `(${alerta} Alerta)`;
            document.getElementById('inv-count-alerta').className = alerta > 0 ? "text-yellow-600 font-bold animate-pulse" : "text-gray-400";
            document.getElementById('inv-count-esgotado').innerText = `${esgotado} Esgotado`;
        });
    };
    window.darBaixaEstoque = async (itensDoPedido) => {
        if (!itensDoPedido || itensDoPedido.length === 0) return;

        const batch = writeBatch(db);
        let produtosAfetados = 0;

        // Precisamos ler os produtos antes para ver se têm 'stockControl' ativado
        // Para performance em app grande, idealmente você já teria essa info no item do pedido
        // Mas aqui faremos a leitura para garantir segurança.
        
        for (const item of itensDoPedido) {
            // Assume que item.productId ou item.id é o ID do produto no Firestore
            // Se no seu carrinho você salva como 'id', use item.id
            const prodId = item.id || item.productId; 
            
            if (prodId) {
                const prodRef = doc(db, "produtos", prodId);
                const prodSnap = await getDoc(prodRef);

                if (prodSnap.exists()) {
                    const prodData = prodSnap.data();

                    // Só desconta se o controle de estoque estiver ATIVO
                    if (prodData.stockControl === true) {
                        const novoEstoque = (prodData.stock || 0) - (item.quantity || 1);
                        
                        // Atualização 1: Decrementa
                        batch.update(prodRef, { stock: novoEstoque });
                        
                        // Atualização 2: Se zerou ou ficou negativo, tira do ar automaticamente
                        if (novoEstoque <= 0) {
                            batch.update(prodRef, { available: false });
                        }
                        
                        produtosAfetados++;
                    }
                }
            }
        }

        if (produtosAfetados > 0) {
            await batch.commit();
            console.log(`Estoque atualizado para ${produtosAfetados} produtos.`);
        }
    };
    // Mesclando as listas de mensagens para garantir que todas funcionem
    Object.assign(BOT_CONTENT, BOT_CONTENT_EXTENDED);
