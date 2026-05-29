
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
    import { getFirestore, collection, onSnapshot, doc, updateDoc, orderBy, query, getDoc, setDoc, addDoc, serverTimestamp, getDocs, deleteDoc, limit, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
    import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
    import { monitorarEstadoAuth, verificarAdminNoBanco, db as authDb, fazerLogout } from './auth.js';
    import { MesaCard, BotaoNovaMesa } from './components.js';
    const db = authDb;
    const storage = getStorage(authDb.app);
    const notificationSound = document.getElementById('notif-sound');

    // Estado Global
    let allOrders = [];
    let allProducts = [];
    let allCategories = [];
    let tablesConfig = { environments: [] };
    let configEntregaAtual = {};
    let currentServiceTab = 'retirada'; 
    let currentStatusFilter = 'todos';  
    let currentEnvId = null;
    let currentTablePOS = null; 
    let currentTableOrder = []; 
    let currentPayOrder = null;
    let currentPayMethod = 'dinheiro';
    let salesChartInstance = null;
    let categoriaAtivaPOS = 'todos';
    let allComplements = {}; // "Cérebro" para calcular preços e montar o açaí

    // MONITOR DE COMPLEMENTOS (Puxa os tamanhos e preços do banco)
    // MONITOR DE COMPLEMENTOS (Puxa os tamanhos e preços do banco)
    onSnapshot(collection(db, "complementos"), (snapshot) => {
        allComplements = {}; // <--- ADICIONE ESTA LINHA PARA LIMPAR O OBJETO
        snapshot.forEach(doc => {
            allComplements[doc.id] = { id: doc.id, ...doc.data() };
        });
        // Recarrega os preços nos grids se as telas estiverem abertas
        if(!document.getElementById('view-pdv-manual').classList.contains('hidden')) renderizarProdutosManual();
        if(!document.getElementById('view-pos').classList.contains('hidden')) renderizarProdutosPOS();
    });

    const AVAILABLE_TAGS = [
        "Vegano", "Vegetariano", "Orgânico", "Sem açúcar", "Sem lactose", "Sem glúten",
        "Bebida gelada", "Bebida alcoólica", "Natural", "Mais Vendido", "Promoção", "Ofertão",
        "Para Compartilhar"
    ];
    let currentProductAttachedGroups = [];

// ===============================================
    // INICIALIZAÇÃO INTELIGENTE (Adicione no final do dashboard.js)
    // ===============================================

    document.addEventListener('DOMContentLoaded', () => {
        monitorarEstadoAuth(async (user) => {
            if (!user || !(await verificarAdminNoBanco(user.email))) {
                window.location.href = 'index.html'; 
                return;
            }
            
            // Carrega infos do usuário no topo
            if(document.getElementById('header-user-name')) document.getElementById('header-user-name').innerText = user.displayName || 'Admin';
            if(document.getElementById('header-user-email')) document.getElementById('header-user-email').innerText = user.email;

            // Inicia monitores globais
            iniciarMonitoramentoPedidos();
            
            // VERIFICA SE O USUÁRIO VEIO DO ATALHO DO SITE (edit_product)
            const params = new URLSearchParams(window.location.search);
            const editId = params.get('edit_product');

            if (editId) {
                // Aguarda os produtos carregarem do banco de dados na memória
                const checkLoaded = setInterval(() => {
                    if (allProducts.length > 0) {
                        clearInterval(checkLoaded);
                        
                        // 1. Força a navegação para a aba de produtos
                        window.navegarPara('view-produtos');
                        
                        // 2. Abre o modal com os dados carregados
                        window.abrirModalEdicao(editId);
                        
                        // 3. Limpa a URL silenciosamente para evitar que o modal abra de novo se você der F5
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                }, 500);
            } else {
                // SE NÃO TEM ATALHO, RECUPERA A ÚLTIMA TELA ABERTA PADRÃO
                const ultimaTela = localStorage.getItem('painel_ultima_tela') || 'view-pdv-wrapper';
                window.navegarPara(ultimaTela);
            }
        });
    });

    // === CONFIGURAÇÃO E DADOS BÁSICOS ===
    async function carregarConfigMesas() {
        try {
            const docSnap = await getDoc(doc(db, "config", "loja_mesas"));
            if (docSnap.exists() && docSnap.data().environments) {
                tablesConfig = docSnap.data();
            } else {
                tablesConfig = { environments: [{ id: 'env-1', name: 'Salão Principal', tables: [1, 2, 3, 4] }] };
                await setDoc(doc(db, "config", "loja_mesas"), tablesConfig);
            }
            if (tablesConfig.environments.length > 0 && (!currentEnvId || !tablesConfig.environments.find(e => e.id === currentEnvId))) {
                currentEnvId = tablesConfig.environments[0].id;
            }
            if (currentServiceTab === 'mesa') renderizarAmbientes();
        } catch(e) { console.error("Erro config mesas:", e); }
    }

    async function carregarProdutosECategorias() {
        const pSnap = await getDocs(collection(db, "produtos"));
        allProducts = [];
        pSnap.forEach(d => allProducts.push({id: d.id, ...d.data()}));
        const cSnap = await getDocs(query(collection(db, "categorias"), orderBy("nome")));
        allCategories = [];
        cSnap.forEach(d => allCategories.push(d.data()));
    }

    // === NAVEGAÇÃO ===
    window.mudarAbaServico = async (aba) => {
        currentServiceTab = aba;
        document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${aba}`).classList.add('active');
        
        const viewLista = document.getElementById('view-lista');
        const viewMesas = document.getElementById('view-mesas');
        
        if (aba === 'mesa') {
            viewLista.classList.add('hidden');
            viewMesas.classList.remove('hidden');
            // Garante que as configurações de ambiente existam antes de renderizar
            if (!tablesConfig.environments || tablesConfig.environments.length === 0) {
                await carregarConfigMesas();
            }
            renderizarAmbientes(); 
        } else {
            viewMesas.classList.add('hidden');
            viewLista.classList.remove('hidden');
            renderizarPedidosLista();
        }
    }

    window.toggleSubmenu = (id) => {
        const el = document.getElementById(id);
        el.classList.toggle('hidden');
        const arrow = document.getElementById('arrow-vendas');
        arrow.style.transform = el.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }
// Gerenciamento de Tags (Copiado do Admin)
    function renderTagSelector() {
        const container = document.getElementById('tags-container');
        if(!container) return;
        container.innerHTML = '';
        AVAILABLE_TAGS.forEach(tag => {
            const btn = document.createElement('button');
            btn.type = 'button';
            // Adicionamos as classes visuais base do Tailwind para o estado "desativado"
            btn.className = 'tag-item border border-gray-300 bg-white text-gray-600 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer mb-1 mr-1 hover:bg-cyan-50';
            btn.innerText = tag;
            
            // Múltipla seleção: O clique inverte o estado visual e a classe marcadora
            btn.onclick = () => {
                if (btn.classList.contains('tag-selected')) {
                    // Desativa: remove as cores de ativo e coloca as de inativo
                    btn.classList.remove('tag-selected', 'bg-cyan-600', 'text-white', 'border-cyan-600');
                    btn.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
                } else {
                    // Ativa: remove as cores inativas e pinta com a cor primária
                    btn.classList.add('tag-selected', 'bg-cyan-600', 'text-white', 'border-cyan-600');
                    btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-300');
                }
            };
            container.appendChild(btn);
        });
    }

    function getSelectedTags() {
        const selected = [];
        // O seletor pega TODAS as tags que têm a classe 'tag-selected' (múltipla seleção nativa)
        document.querySelectorAll('.tag-item.tag-selected').forEach(btn => selected.push(btn.innerText));
        return selected;
    }

    function setSelectedTags(tagsArray) {
        if (!tagsArray) tagsArray = []; // Proteção contra arrays vazios/nulos
        document.querySelectorAll('.tag-item').forEach(btn => {
            if (tagsArray.includes(btn.innerText)) {
                // Ativa a tag visualmente ao abrir o modal de edição
                btn.classList.add('tag-selected', 'bg-cyan-600', 'text-white', 'border-cyan-600');
                btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-300');
            } else {
                // Desativa a tag visualmente
                btn.classList.remove('tag-selected', 'bg-cyan-600', 'text-white', 'border-cyan-600');
                btn.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
            }
        });
    }

    // Upload de Imagem do Produto
// Substitua as funções de upload por esta versão unificada:
window.handleImageUpload = async function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const loading = document.getElementById('upload-loading');
        if(loading) loading.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Chamada direta para o seu arquivo PHP na raiz da Locaweb
            const response = await fetch('upload.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.sucesso) {
                // SUCESSO: O PHP salvou na pasta /uploads/pedidos/ e nos deu a URL
                document.getElementById('preview-image').src = result.url;
                document.getElementById('preview-image').classList.remove('hidden');
                document.getElementById('icon-image').classList.add('hidden');
                document.getElementById('edit-image-url').value = result.url;
                window.showToast("Sucesso", "Imagem enviada para seu servidor!");
            } else {
                throw new Error(result.erro);
            }
        } catch (error) {
            console.error("Erro no upload:", error);
            window.showToast("Erro", "Falha: " + error.message, true);
        } finally {
            if(loading) loading.classList.add('hidden');
        }
    }
}

window.navegarPara = (telaId) => {
        // 1. Salva a tela atual para o F5
        localStorage.setItem('painel_ultima_tela', telaId);

        // 2. Lista COMPLETA de todas as telas (incluindo o PDV Manual)
        const telas = [
            'view-pdv-wrapper', 'view-pos', 'view-historico', 'view-relatorios', 
            'view-financeiro', 'view-caixa', 'view-nfce', 
            'view-produtos', 'view-boasvindas', 'view-config-pedidos',
            'view-kitchen', 'view-inventory', 'view-chatbot', 
            'view-config-business', 'view-config-team', 
            'view-config-printers', 'view-config-interactions','view-marketing-cupons',
            'view-pdv-manual'
        ];
        
        // 3. Esconde todas e trata classes específicas
        telas.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.add('hidden');
                if(id === 'view-pos') el.classList.remove('flex');
            }
        });

        // 4. Mostra a tela alvo
        const target = document.getElementById(telaId);
        if(target) {
            target.classList.remove('hidden');
            if(telaId === 'view-pos') target.classList.add('flex');
        }
        
        // 5. Menu Lateral (Marca o botão como ativo)
        document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
        const activeBtn = document.querySelector(`[onclick="navegarPara('${telaId}')"]`);
        if(activeBtn) activeBtn.classList.add('active');

    // GATILHOS DE CARREGAMENTO
        if(telaId === 'view-caixa') iniciarTelaCaixa(); 
        if(telaId === 'view-produtos') renderizarListaProdutos();
        if(telaId === 'view-historico') carregarHistorico();
        if(telaId === 'view-relatorios') renderizarRelatorios();
        if(telaId === 'view-financeiro') renderizarFinanceiro();
        if(telaId === 'view-boasvindas') carregarConfigLoja();
        if(telaId === 'view-config-pedidos') carregarConfigPedidos();
        if(telaId === 'view-kitchen') iniciarMonitorCozinha(); 
        if(telaId === 'view-inventory') renderizarInventario(); 
        if(telaId === 'view-config-business') carregarConfigNegocio();
        if(telaId === 'view-config-team') renderizarEquipe();
        if(telaId === 'view-config-printers') carregarConfigImpressao();
        if(telaId === 'view-config-interactions') carregarCredenciaisIfood();
        
        // CORREÇÃO AQUI: Chama apenas o Monitor de Marketing
        if(telaId === 'view-marketing-cupons') {
            window.iniciarMonitorMarketing();
        }
    }

    // === MONITORAMENTO DE PEDIDOS ===
    function iniciarMonitoramentoPedidos() {
        const q = query(collection(db, "pedidos"), orderBy("createdAt", "desc"));
        
        // MONITOR DE PEDIDOS (Lógica original mantida 100%)
// No topo do dashboard.js, logo abaixo das constantes de estado global, adicione:
        const somAlerta = new Audio('assets/notificacao.mp3'); // Certifique-se que o caminho está correto

        onSnapshot(q, (snapshot) => {
            allOrders = [];
            let counts = { retirada: 0, delivery: 0, mesa: 0, pendente: 0, curso: 0 };
            let total = 0;

           snapshot.docChanges().forEach(change => {
                const data = change.doc.data();
                
                // Toca se for um pedido adicionado direto já pago, ou se foi modificado agora para 'Aguardando' (Pagamento confirmado)
                const isNovoPedido = (change.type === "added" && data.status !== 'Aguardando Pagamento');
                const isPagamentoConfirmado = (change.type === "modified" && data.status === 'Aguardando');

                if (isNovoPedido || isPagamentoConfirmado) {
                    if (!snapshot.metadata.fromCache) {
                        
                        somAlerta.play().catch(e => console.log("Android bloqueou som automático."));

                        if ("vibrate" in navigator) {
                            navigator.vibrate([500, 200, 500]);
                        }

                        if (Notification.permission === "granted") {
                            new Notification("🍦 TropiBerry: NOVO PEDIDO!", {
                                body: "Um pedido acabou de chegar e está pronto para aceite!",
                                icon: "img/logosf.png",
                                tag: "novo-pedido" 
                            });
                        }

                        if (typeof window.showToast === "function") {
                            window.showToast("Novo Pedido", "Pedido recebido e confirmado!", false);
                        }
                    }
                }
            });

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const order = { id: docSnap.id, ...data };
                allOrders.push(order);

                // Adicionamos a trava "&& data.status !== 'Aguardando Pagamento'" para o contador ignorar carrinhos não pagos
                if (data.status !== 'Finalizado' && data.status !== 'Rejeitado' && data.status !== 'Cancelado' && data.status !== 'Aguardando Pagamento') {
                    if (data.method === 'retirada') counts.retirada++;
                    if (data.method === 'delivery') counts.delivery++;
                    if (data.method === 'mesa') counts.mesa++;
                    if (data.status === 'Aguardando') counts.pendente++;
                    if (data.status === 'Em Preparo' || data.status === 'Saiu para Entrega') counts.curso++;
                    total += (data.total || 0);
                }
            });

            updateBadge('badge-retirada', counts.retirada);
            updateBadge('badge-delivery', counts.delivery);
            updateBadge('badge-mesa', counts.mesa);
            
            if(document.getElementById('count-pendente')) document.getElementById('count-pendente').innerText = counts.pendente;
            if(document.getElementById('count-curso')) document.getElementById('count-curso').innerText = counts.curso;
            if(document.getElementById('total-dia')) document.getElementById('total-dia').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;

            if (!document.getElementById('view-lista').classList.contains('hidden')) renderizarPedidosLista();
            if (!document.getElementById('view-mesas').classList.contains('hidden')) renderizarGridMesas();
        });

// MONITOR DE PRODUTOS
// MONITOR DE PRODUTOS
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        allProducts = [];
        snapshot.forEach(doc => {
            allProducts.push({ id: doc.id, ...doc.data() });
        });
        
        // Renderiza as telas que dependem de produtos se elas estiverem abertas
        if (!document.getElementById('view-produtos').classList.contains('hidden')) {
            window.renderizarListaProdutos();
        }
        if (!document.getElementById('view-pdv-wrapper').classList.contains('hidden')) {
             // Se estiver no PDV, renderiza o grid do PDV
            if (typeof window.renderizarProdutosPOS === 'function') window.renderizarProdutosPOS();
        }
        
        // Fecha o loading caso ele esteja aberto
        window.toggleLoading(false);
    });

    // MONITOR DE CATEGORIAS
    onSnapshot(collection(db, "categorias"), (snapshot) => {
        allCategories = [];
        snapshot.forEach(doc => {
            allCategories.push({ id: doc.id, ...doc.data() });
        });
        
        // CORREÇÃO DO SELECT: Se o modal de produto estiver aberto quando criar a categoria, ele atualiza o select na hora!
        const modalProduto = document.getElementById('product-modal');
        if (modalProduto && !modalProduto.classList.contains('hidden')) {
            const currentCat = document.getElementById('edit-category')?.value;
            if (typeof window.renderizarSeletorCategoriasModal === 'function') {
                window.renderizarSeletorCategoriasModal(currentCat);
            }
        }
    });
    }

    function updateBadge(id, count) {
        const badge = document.getElementById(id);
        if(badge) {
            badge.innerText = count;
            badge.classList.toggle('hidden', count === 0);
        }
    }

    // === RELATÓRIOS (CHART.JS ATUALIZADO) ===
    window.renderizarRelatorios = () => {
        const totalVendas = allOrders.reduce((acc, p) => acc + (p.total || 0), 0);
        const qtdPedidos = allOrders.length;
        const ticketMedio = qtdPedidos > 0 ? totalVendas / qtdPedidos : 0;

        // Atualiza os cards de texto
        document.getElementById('rel-qtd').innerText = qtdPedidos;
        document.getElementById('rel-total').innerText = `R$ ${totalVendas.toFixed(2).replace('.', ',')}`;
        document.getElementById('rel-ticket').innerText = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;

        const ctx = document.getElementById('salesChart').getContext('2d');
        if(salesChartInstance) salesChartInstance.destroy();

        // Lógica de dados dos últimos 7 dias
        const labels = [];
        const dataPoints = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayKey = d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'});
            labels.push(dayKey);
            
            const totalDia = allOrders.filter(p => {
                if(!p.createdAt) return false;
                const orderDate = p.createdAt.toDate();
                return orderDate.getDate() === d.getDate() && orderDate.getMonth() === d.getMonth();
            }).reduce((acc, p) => acc + (p.total || 0), 0);
            
            dataPoints.push(totalDia);
        }

        // Gradiente Bonito para o preenchimento
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(8, 145, 178, 0.4)'); // Cyan-600
        gradient.addColorStop(1, 'rgba(8, 145, 178, 0)');

        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Vendas (R$)',
                    data: dataPoints,
                    borderColor: '#0891b2', // Cor da linha
                    backgroundColor: gradient,
                    borderWidth: 4,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#0891b2',
                    pointBorderWidth: 3,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: true,
                    tension: 0.4, // Curva suave (Beziér)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#164e63', // Cyan-900
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return ' Vendas: R$ ' + context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                        ticks: {
                            callback: value => 'R$ ' + value,
                            font: { size: 11, weight: '600' },
                            color: '#94a3b8'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 11, weight: '600' },
                            color: '#94a3b8'
                        }
                    }
                }
            }
        });
    }

    // === HISTÓRICO, FINANCEIRO, CAIXA (Mesmo do anterior, resumido aqui) ===
    window.carregarHistorico = async () => {
        const tbody = document.getElementById('table-historico-body');
        tbody.innerHTML = '';
        const pedidosOrdenados = [...allOrders].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        pedidosOrdenados.forEach(p => {
            const date = p.createdAt ? p.createdAt.toDate().toLocaleString('pt-BR') : '--';
            let statusColor = p.status === 'Finalizado' ? 'text-green-600' : 'text-orange-500';
            tbody.innerHTML += `<tr class="bg-white border-b hover:bg-gray-50"><td class="px-6 py-4 font-bold">#${p.id.slice(0,4).toUpperCase()}</td><td class="px-6 py-4">${date}</td><td class="px-6 py-4">${p.customer?.name || 'Cliente'}</td><td class="px-6 py-4 font-bold text-gray-700">R$ ${p.total.toFixed(2)}</td><td class="px-6 py-4 ${statusColor} font-bold text-xs uppercase">${p.status}</td></tr>`;
        });
    }

    window.carregarFinanceiro = async () => {
        const tbody = document.getElementById('table-financeiro-body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400">Carregando lançamentos...</td></tr>';
        
        try {
            const q = query(collection(db, "movimentacoes"), orderBy("data", "desc"));
            const snap = await getDocs(q);
            
            tbody.innerHTML = '';
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-400">Nenhuma movimentação encontrada.</td></tr>';
                return;
            }

            snap.forEach(docSnap => {
                const m = docSnap.data();
                const color = m.tipo === 'entrada' ? 'text-green-600' : 'text-red-600';
                const sinal = m.tipo === 'entrada' ? '+' : '-';
                const dataFormatada = m.data ? m.data.toDate().toLocaleDateString('pt-BR') : '--/--/----';
                
                tbody.innerHTML += `
                    <tr class="bg-white border-b hover:bg-gray-50 transition">
                        <td class="px-6 py-3 text-gray-600">${dataFormatada}</td>
                        <td class="px-6 py-3 font-medium">${m.descricao}</td>
                        <td class="px-6 py-3 uppercase text-[10px] font-bold">
                            <span class="px-2 py-1 rounded-full ${m.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${m.tipo}</span>
                        </td>
                        <td class="px-6 py-3 ${color} font-bold">${sinal} R$ ${parseFloat(m.valor).toFixed(2).replace('.', ',')}</td>
                    </tr>`;
            });
        } catch (e) {
            console.error("Erro ao carregar financeiro:", e);
            window.showToast("Erro", "Falha ao carregar a lista financeira.", true);
        }
    }

    window.abrirModalFinanceiro = () => { document.getElementById('modal-financeiro').classList.remove('hidden'); }

    window.salvarLancamento = async () => {
        const descEl = document.getElementById('fin-desc');
        const tipoEl = document.getElementById('fin-tipo');
        const valorEl = document.getElementById('fin-valor');

        const desc = descEl.value.trim();
        const tipo = tipoEl.value;
        const valor = parseFloat(valorEl.value);

        // Validação usando Toast
        if (!desc || isNaN(valor) || valor <= 0) {
            return window.showToast("Atenção", "Preencha a descrição e um valor válido.", true);
        }

        try {
            // Salva no Firestore
            await addDoc(collection(db, "movimentacoes"), { 
                descricao: desc, 
                tipo: tipo, 
                valor: valor, 
                data: serverTimestamp() 
            });

            // Feedback de Sucesso
            window.showToast("Sucesso", "Lançamento registrado!");

            // Limpa e fecha o modal
            descEl.value = '';
            valorEl.value = '';
            document.getElementById('modal-financeiro').classList.add('hidden');

            // Atualiza a tabela e o saldo do caixa
            carregarFinanceiro();
            atualizarSaldoCaixa(tipo, valor);

        } catch (e) {
            console.error("Erro ao salvar lançamento:", e);
            window.showToast("Erro", "Não foi possível salvar no banco de dados.", true);
        }
    }
    // === MÓDULO VENDAS: CAIXA ===
    window.carregarEstadoCaixa = async () => {
        const storedCaixa = localStorage.getItem('caixa_status');
        if(storedCaixa) {
            const status = JSON.parse(storedCaixa);
            if(status.aberto) {
                document.getElementById('caixa-fechado-panel').classList.add('hidden');
                document.getElementById('caixa-aberto-panel').classList.remove('hidden');
                
                // Formatando a data
                const dataInicio = new Date(status.inicio);
                if(document.getElementById('caixa-inicio')) {
                    document.getElementById('caixa-inicio').innerText = dataInicio.toLocaleString('pt-BR');
                }
                
                // CORREÇÃO AQUI: Formatando para moeda BR e garantindo que é número
                const saldo = parseFloat(status.saldo) || 0;
                document.getElementById('caixa-saldo').innerText = `R$ ${saldo.toFixed(2).replace('.', ',')}`;
                
                return;
            }
        }
        document.getElementById('caixa-fechado-panel').classList.remove('hidden');
        document.getElementById('caixa-aberto-panel').classList.add('hidden');
    }

    window.abrirCaixa = () => {
        document.getElementById('modal-abrir-caixa').classList.remove('hidden');
        document.getElementById('caixa-valor-inicial').focus();
    };

    // 2. Confirmação com Toast e Proteção de Saldo
    window.confirmarAberturaCaixa = async () => {
        const input = document.getElementById('caixa-valor-inicial');
        
        // CORREÇÃO: Captura mais robusta do valor numérico
        // Se o input type="number" estiver vazio, assume 0.
        let valorNumerico = parseFloat(input.value);
        if (isNaN(valorNumerico)) valorNumerico = 0;
        
        const status = { 
            aberto: true, 
            inicio: new Date().toISOString(), 
            saldo: valorNumerico 
        };
        
        localStorage.setItem('caixa_status', JSON.stringify(status));
        document.getElementById('modal-abrir-caixa').classList.add('hidden');
        
        // Atualiza a tela imediatamente
        carregarEstadoCaixa();
        
        if (typeof showToast === "function") {
            showToast("Caixa Aberto", `Fundo de troco: R$ ${valorNumerico.toFixed(2).replace('.', ',')}`);
        }

        try {
            await addDoc(collection(db, "movimentacoes"), { 
                descricao: "Abertura de Caixa", 
                tipo: "entrada", 
                valor: valorNumerico, 
                data: serverTimestamp() 
            });
        } catch(e) {
            console.error("Erro ao registrar abertura:", e);
        }
    };

    window.fecharCaixa = () => {
        const data = localStorage.getItem('caixa_status');
        if (!data) {
            showToast("Erro", "O caixa já está fechado.", true);
            return;
        }
        document.getElementById('modal-confirmar-fechamento').classList.remove('hidden');
    };

    // 2. Executa o fechamento após a confirmação no modal
    window.executarFechamentoReal = () => {
        const data = localStorage.getItem('caixa_status');
        const status = JSON.parse(data);
        const saldoFinal = Number(status.saldo) || 0;

        showToast("Sucesso", `Caixa fechado com R$ ${saldoFinal.toFixed(2).replace('.', ',')}`);
        
        localStorage.removeItem('caixa_status');
        document.getElementById('modal-confirmar-fechamento').classList.add('hidden');
        carregarEstadoCaixa();
    };

    // 3. CORREÇÃO DO ERRO DO SALDO 0: Forçar atualização do display
    window.atualizarSaldoCaixa = (tipo, valor) => {
        const data = localStorage.getItem('caixa_status');
        if (!data) return;

        let status = JSON.parse(data);
        
        let saldoAtual = Number(status.saldo) || 0;
        const valorMovimentacao = Number(valor) || 0;

        if (tipo === 'entrada') {
            saldoAtual += valorMovimentacao;
        } else {
            saldoAtual -= valorMovimentacao;
        }

        status.saldo = saldoAtual;
        localStorage.setItem('caixa_status', JSON.stringify(status));
        
        // CORREÇÃO CRÍTICA AQUI: O ID correto no HTML é 'caixa-saldo'
        const display = document.getElementById('caixa-saldo'); 
        if(display) {
            display.innerText = `R$ ${saldoAtual.toFixed(2).replace('.', ',')}`;
        }
        
        console.log(`Saldo atualizado para: ${saldoAtual}`);
    };

    window.realizarSangria = () => {
        const val = prompt("Valor da Sangria:");
        if(val) {
            document.getElementById('fin-desc').value = "Sangria de Caixa";
            document.getElementById('fin-tipo').value = "saida";
            document.getElementById('fin-valor').value = val;
            salvarLancamento();
        }
    }

    window.realizarSuprimento = () => {
        const val = prompt("Valor do Suprimento:");
        if(val) {
            document.getElementById('fin-desc').value = "Suprimento de Caixa";
            document.getElementById('fin-tipo').value = "entrada";
            document.getElementById('fin-valor').value = val;
            salvarLancamento();
        }
    }

    // === RENDERIZAÇÃO LISTA DE PEDIDOS ===
    function renderizarPedidosLista() {
        const container = document.getElementById('orders-list');
        if (!container) return;
        container.innerHTML = '';
        
        // 1. Filtra primeiro pelo método (Balcão ou Delivery)
// 1. Filtra primeiro pelo método (Balcão ou Delivery)
let filtered = allOrders.filter(o => o.method === currentServiceTab); 

// --- NOVA TRAVA DE SEGURANÇA ---
// Remove pedidos que ainda não foram pagos (Pix/Cartão pendentes) 
// e que não são pagamentos na entrega.
filtered = filtered.filter(o => o.status !== 'Aguardando Pagamento');

// 2. Aplica o filtro de Status
filtered = filtered.filter(o => {
    if (currentStatusFilter === 'todos') {
        // Mostra tudo que está "em andamento", mas agora já filtrado pelo status de pagamento acima
        return o.status !== 'Finalizado' && o.status !== 'Rejeitado' && o.status !== 'Cancelado';
    }
            if (currentStatusFilter === 'pendente') {
                // Mostra APENAS o que acabou de chegar
                return o.status === 'Aguardando';
            }
            if (currentStatusFilter === 'finalizados') {
                // Mostra o histórico de concluídos e cancelados
                return o.status === 'Finalizado' || o.status === 'Rejeitado' || o.status === 'Cancelado';
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-gray-400">Nenhum pedido nesta seção.</div>`;
            return;
        }

        // 3. Renderiza os itens filtrados (Mantendo sua lógica de cores original)
        filtered.forEach(order => {
            const div = document.createElement('div');
            let borderClass = 'border-l-4 border-l-gray-300';
            
            // Cores da borda baseadas no status
            if(order.status === 'Aguardando') borderClass = 'border-l-4 border-l-orange-500';
            if(order.status === 'Em Preparo') borderClass = 'border-l-4 border-l-blue-500';
            if(order.status === 'Finalizado') borderClass = 'border-l-4 border-l-green-500';
            if(order.status === 'Cancelado' || order.status === 'Rejeitado') borderClass = 'border-l-4 border-l-red-500';

           // Layout Híbrido: Stack (Mobile) e Grid (Desktop)
            div.className = `bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col md:grid md:grid-cols-12 mb-3 items-center hover:shadow-md transition overflow-hidden ${borderClass}`;
            
            const time = order.createdAt ? order.createdAt.toDate().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            let originBadge = order.origin === 'app' ? 
                `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] border border-purple-200 font-black tracking-tighter uppercase">APP</span>` :
                `<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] border border-gray-200 font-black tracking-tighter uppercase">WEB</span>`;
            
            let payStatus = order.paymentStatus === 'paid' ? 
                `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-black border border-green-200">PAGO</span>` : 
                `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-black border border-orange-200 cursor-pointer" onclick="abrirModalPagamento('${order.id}')">NÃO PAGO</span>`;

            let actions = '';
            if (order.status === 'Finalizado' || order.status === 'Cancelado' || order.status === 'Rejeitado') {
                actions = `<span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Encerrado</span>`;
            } else if(order.status === 'Aguardando') {
                actions = `
                    <div class="flex gap-2 w-full md:w-auto justify-between md:justify-end">
                        <button onclick="atualizarStatus('${order.id}', 'Rejeitado')" class="flex-1 md:flex-none border-2 border-red-500 text-red-500 px-4 py-2 rounded-xl text-xs font-black hover:bg-red-50 transition active:scale-95">REJEITAR</button>
                        <button onclick="atualizarStatus('${order.id}', 'Em Preparo')" class="flex-1 md:flex-none bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-green-600 shadow-lg shadow-green-100 transition active:scale-95">ACEITAR</button>
                    </div>`;
            } else if (order.status === 'Pronto' && order.method === 'delivery') {
                actions = `
                    <div class="flex gap-2 w-full md:w-auto justify-between md:justify-end">
                        <button onclick="atualizarStatus('${order.id}', 'Saiu para Entrega')" class="w-full md:w-auto bg-purple-600 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-purple-700 shadow-lg transition active:scale-95">SAIU P/ ENTREGA</button>
                        <button onclick="atualizarStatus('${order.id}', 'Finalizado')" class="w-full md:w-auto bg-cyan-900 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-cyan-800 shadow-lg transition active:scale-95">CONCLUIR</button>
                    </div>`;
            } else {
                actions = `<div class="w-full md:w-auto"><button onclick="atualizarStatus('${order.id}', 'Finalizado')" class="w-full md:w-auto bg-cyan-900 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-cyan-800 shadow-lg transition active:scale-95">CONCLUIR PEDIDO</button></div>`;
            }

            div.innerHTML = `
                <div class="w-full md:col-span-2 p-4 md:p-3 text-xs border-b md:border-b-0 md:border-r flex justify-between md:flex-col items-center md:items-start">
                    <div class="font-black text-gray-800 text-sm md:text-xs flex items-center gap-2">#${order.id.slice(-4).toUpperCase()} ${originBadge}</div>
                    <div class="text-gray-400 font-bold"><i class="far fa-clock"></i> ${time}</div>
                </div>
                
                <div class="w-full md:col-span-2 p-4 md:p-3 text-xs font-black border-b md:border-b-0 md:border-r flex justify-between md:flex-col items-center md:items-start">
                    <span class="${['Cancelado', 'Rejeitado'].includes(order.status) ? 'text-red-600' : 'text-cyan-600'} uppercase tracking-tight">${order.status}</span>
                    ${payStatus}
                </div>
                
                <div class="w-full md:col-span-2 p-4 md:p-3 font-black text-gray-700 text-lg md:text-base border-b md:border-b-0 md:border-r flex justify-between md:block">
                    <span class="md:hidden text-xs text-gray-400 font-bold uppercase">Total do Pedido</span>
                    R$ ${order.total.toFixed(2).replace('.', ',')}
                </div>
                
                <div class="w-full md:col-span-4 p-4 md:p-3 text-xs border-b md:border-b-0 md:border-r truncate">
    <div class="font-black text-gray-800 text-sm md:text-xs uppercase">${order.customer?.name || 'Cliente Final'}</div>
    <div class="text-gray-500 font-bold mt-0.5">${order.items?.length || 0} itens • ${order.method?.toUpperCase() || 'BALCÃO'}</div>
    
    ${order.scheduled ? `
        <div class="mt-1 inline-block bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-black text-[10px]">
            <i class="fas fa-calendar-alt"></i> Agendado: ${order.scheduled}
        </div>
    ` : ''}
</div>
                
                <div class="w-full md:col-span-2 p-4 md:p-3 flex items-center justify-between md:justify-end gap-3 bg-gray-50/50 md:bg-transparent">
                    <button onclick="window.imprimirPedidoDash('${order.id}')" class="bg-white border border-gray-200 text-gray-500 hover:text-cyan-600 p-3 md:p-2 rounded-xl transition shadow-sm active:scale-90" title="Imprimir Cupom">
                        <i class="fas fa-print text-lg md:text-base"></i>
                    </button>
                    ${actions}
                </div>
            `;
            container.appendChild(div);
        });
    }

window.atualizarStatus = async (id, status) => {
    try { 
        const pedidoRef = doc(db, "pedidos", id);
        const pedidoSnap = await getDoc(pedidoRef);
        const pedidoDados = pedidoSnap.data();

        await updateDoc(pedidoRef, { 
            status: status,
            updatedAt: serverTimestamp()
        }); 
        
        window.showToast("Status Atualizado", `Pedido #${id.slice(0,4)} movido para ${status}`, false);

        // --- LÓGICA DE IMPRESSÃO AUTOMÁTICA ---
        // Se o pedido foi aceito (Em Preparo) e a config permitir, imprime automaticamente
        if (status === 'Em Preparo' && printConfig && printConfig.autoPrint) {
            console.log("Impressão automática disparada para o pedido:", id);
            window.imprimirPedidoDash(id);
        }

        // --- LÓGICA DE FIDELIDADE (Acionada ao Finalizar) ---
        if (status === 'Finalizado') {
            await processarFidelidadeAoFinalizar({ id, ...pedidoDados });
        }

        if (typeof window.enviarNotificacaoWhats === "function") {
            window.enviarNotificacaoWhats(id, status);
        }
        
    } catch(e) { console.error("Erro ao atualizar status:", e); }
}
async function processarFidelidadeAoFinalizar(pedido) {
    if (!pedido.customer.email) return;

    const userRef = doc(db, "usuarios", pedido.customer.email);
    const currentMonth = new Date().toISOString().slice(0, 7); // Ex: "2026-01"

    try {
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        let selosAtuais = userData.selosFidelidade || 0;
        
        // REGRA DE RESETE APÓS BRINDE: 
        // Se ele já tinha 10 e você finalizou mais um, significa que ele usou o brinde ou iniciou novo ciclo
        if (selosAtuais >= 10) {
            await updateDoc(userRef, { 
                selosFidelidade: 0, 
                mesReferenciaFidelidade: currentMonth 
            });
            return;
        }

        // REGRA DE CONCESSÃO: Pedido >= R$ 20,00
        if (pedido.total >= 20) {
            // Se o mês mudou, o cliente perde os selos antigos (regra mensal)
            if (userData.mesReferenciaFidelidade !== currentMonth) {
                await updateDoc(userRef, { 
                    selosFidelidade: 1, 
                    mesReferenciaFidelidade: currentMonth 
                });
            } else {
                // Mesmo mês, apenas soma
                await updateDoc(userRef, { 
                    selosFidelidade: selosAtuais + 1 
                });
            }
        }
    } catch (e) { console.error("Erro ao processar fidelidade:", e); }
}

    window.filtrarStatus = (filtro) => {
        currentStatusFilter = filtro;

        const botoes = {
            'todos': document.getElementById('btn-filter-todos'),
            'pendente': document.getElementById('btn-filter-pendente'),
            'finalizados': document.getElementById('btn-filter-finalizados')
        };

        Object.keys(botoes).forEach(key => {
            const btn = botoes[key];
            if (!btn) return;

            if (key === filtro) {
                // Estilo Selecionado (Azul Cyan)
                btn.className = "bg-cyan-600 text-white px-4 py-1.5 rounded-full text-xs font-bold border border-cyan-600 transition-all shadow-sm";
            } else {
                // Estilo Inativo (Branco com borda cinza)
                btn.className = "bg-white text-gray-600 px-4 py-1.5 rounded-full text-xs font-bold border border-gray-300 hover:bg-gray-50 transition-all";
            }
        });
        renderizarPedidosLista();
    }

    // === LÓGICA DE PAGAMENTO ===
    window.abrirModalPagamento = (orderId) => {
        currentPayOrder = allOrders.find(o => o.id === orderId);
        if (!currentPayOrder) return;
        document.getElementById('pay-order-id').innerText = `#${currentPayOrder.id.slice(0,4).toUpperCase()}`;
        document.getElementById('pay-total-display').innerText = `R$ ${currentPayOrder.total.toFixed(2).replace('.', ',')}`;
        document.getElementById('pay-input-value').value = currentPayOrder.total.toFixed(2);
        selecionarMetodoPagamento('dinheiro');
        calcularTroco();
        document.getElementById('payment-modal').classList.remove('hidden');
    }

    window.fecharModalPagamento = () => {
        document.getElementById('payment-modal').classList.add('hidden');
        currentPayOrder = null;
    }

    window.selecionarMetodoPagamento = (metodo) => {
        currentPayMethod = metodo;
        ['dinheiro', 'pix', 'cartao'].forEach(m => {
            const btn = document.getElementById(`btn-pay-${m}`);
            if(m === metodo) {
                btn.classList.add('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
                btn.classList.remove('border-gray-300', 'text-gray-600');
            } else {
                btn.classList.remove('selected', 'border-blue-500', 'bg-blue-50', 'text-blue-700');
                btn.classList.add('border-gray-300', 'text-gray-600');
            }
        });
        const inputArea = document.getElementById('money-input-area');
        if (metodo === 'dinheiro') inputArea.classList.remove('opacity-50', 'pointer-events-none');
        else inputArea.classList.add('opacity-50', 'pointer-events-none');
    }

    window.calcularTroco = () => {
        if (!currentPayOrder) return;
        const pago = parseFloat(document.getElementById('pay-input-value').value) || 0;
        const troco = pago - currentPayOrder.total;
        const display = troco > 0 ? `R$ ${troco.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
        const el = document.getElementById('pay-change-display');
        el.innerText = display;
        el.className = troco < 0 ? "text-xl font-bold text-red-400" : "text-xl font-bold text-green-500";
    }

window.confirmarPagamento = async () => {
    if (!currentPayOrder) return;
    
    try {
        const payload = {
            ...currentPayOrder,
            status: 'Finalizado',
            paymentStatus: 'paid',
            paymentMethod: currentPayMethod,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // Salva no Firebase
        const docRef = await addDoc(collection(db, "pedidos"), payload);
        
        showToast("Sucesso", "Venda realizada e gravada!");
        
        // Dispara Impressão
        window.imprimirPedidoDash(docRef.id);

        // Limpa tudo e volta
        fecharModalPagamento();
        window.navegarPara('view-pdv-wrapper');
        
    } catch(e) {
        console.error(e);
        showToast("Erro", "Falha ao gravar pedido.", true);
    }
}

    // === RENDERIZAÇÃO MESAS E PDV (MANTIDO DO ANTERIOR) ===
    window.renderizarAmbientes = () => {
        const container = document.getElementById('environments-bar');
        if(!container) return;
        container.innerHTML = '';
        
        if(!tablesConfig.environments || tablesConfig.environments.length === 0) {
            container.innerHTML = '<span class="text-gray-400 text-xs">Nenhum ambiente configurado</span>';
            return;
        }

        // Garante que existe um ID selecionado
        if (!currentEnvId) currentEnvId = tablesConfig.environments[0].id;

        tablesConfig.environments.forEach(env => {
            const btn = document.createElement('div');
            btn.className = `env-btn ${env.id === currentEnvId ? 'active' : ''}`;
            btn.innerHTML = `<span>${env.name}</span> <span class="bg-black/10 px-2 rounded-full text-[10px]">${env.tables.length}</span>`;
            btn.onclick = () => { 
                currentEnvId = env.id; 
                renderizarAmbientes(); 
            };
            container.appendChild(btn);
        });

        const addBtn = document.createElement('div');
        addBtn.className = "env-btn border-dashed text-cyan-600 hover:bg-cyan-50";
        addBtn.innerHTML = `<i class="fas fa-plus"></i> Novo`;
        addBtn.onclick = toggleConfigModal;
        container.appendChild(addBtn);

        renderizarGridMesas();
    }

    function renderizarGridMesas() {
        const container = document.getElementById('tables-grid');
        if(!container) return;
        container.innerHTML = '';

        const env = tablesConfig.environments.find(e => e.id === currentEnvId);
        if (!env) return;

        env.tables.forEach(num => {
            // Busca o pedido ativo desta mesa
            const activeOrder = allOrders.find(o => 
                o.method === 'mesa' && 
                parseInt(o.tableNumber) === parseInt(num) && 
                !['Finalizado', 'Rejeitado', 'Cancelado'].includes(o.status)
            );

            // Chama o componente passando número, ambiente e o pedido (se houver)
            container.innerHTML += MesaCard(num, env.name, activeOrder);
        });
        
        // Adiciona o botão de nova mesa ao final
        container.innerHTML += BotaoNovaMesa();
    }

    window.changePosQtd = (idx, delta) => {
        if(!currentTableOrder[idx]) return;
        currentTableOrder[idx].quantity += delta;
        if(currentTableOrder[idx].quantity <= 0) currentTableOrder.splice(idx, 1);
        window.atualizarComandaPDV();
    };

    window.confirmarPedidoMesa = async () => {
        if (currentTableOrder.length === 0) return alert("Adicione itens antes de enviar.");
        const total = currentTableOrder.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        const orderData = { method: 'mesa', tableNumber: currentTablePOS, items: currentTableOrder, total: total, status: 'Em Preparo', customer: { name: `Mesa ${currentTablePOS}`, phone: '-' }, paymentMethod: 'pendente', updatedAt: serverTimestamp() };
        try {
            const existing = allOrders.find(o => o.method === 'mesa' && o.tableNumber == currentTablePOS && o.status !== 'Finalizado' && o.status !== 'Rejeitado');
            if (existing) await updateDoc(doc(db, "pedidos", existing.id), orderData);
            else { orderData.createdAt = serverTimestamp(); await addDoc(collection(db, "pedidos"), orderData); }
            fecharMesaPDV();
        } catch (e) { console.error(e); alert("Erro ao enviar pedido: " + e.message); }
    }

    // === MODAL CONFIGURAÇÃO (AMBIENTES E MESAS) ===
    window.toggleConfigModal = () => {
        const modal = document.getElementById('config-modal');
        if (modal.classList.contains('hidden')) { renderConfigContent(); modal.classList.remove('hidden'); } 
        else modal.classList.add('hidden');
    }

    function renderConfigContent() {
        const container = document.getElementById('config-content');
        container.innerHTML = '';
        tablesConfig.environments.forEach((env, index) => {
            const envDiv = document.createElement('div');
            envDiv.className = "border rounded-lg overflow-hidden mb-4 bg-white shadow-sm";
            const header = `<div class="bg-gray-50 p-3 flex justify-between items-center border-b"><input type="text" value="${env.name}" onchange="updateEnvName(${index}, this.value)" class="bg-transparent font-bold text-gray-700 focus:outline-none border-b border-transparent focus:border-cyan-500 w-2/3"><div class="flex items-center gap-2"><span class="text-xs text-gray-500">${env.tables.length} mesas</span><button onclick="removeEnv(${index})" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash"></i></button></div></div>`;
            let tablesHtml = '<div class="p-3 grid grid-cols-4 gap-2">';
            env.tables.forEach((t, tIndex) => { tablesHtml += `<div class="flex items-center border rounded px-2 py-1 gap-1 bg-gray-50"><span class="text-xs font-bold text-gray-400">#</span><input type="number" value="${t}" onchange="updateTableNum(${index}, ${tIndex}, this.value)" class="w-full text-sm font-bold text-center outline-none bg-transparent"><button onclick="removeTable(${index}, ${tIndex})" class="text-red-300 hover:text-red-500 text-xs font-bold">&times;</button></div>`; });
            tablesHtml += `<button onclick="addTableToEnv(${index})" class="border border-dashed border-cyan-400 text-cyan-600 text-xs font-bold rounded px-2 py-1 hover:bg-cyan-50 flex items-center justify-center gap-1"><i class="fas fa-plus"></i> Mesa</button></div>`;
            envDiv.innerHTML = header + tablesHtml;
            container.appendChild(envDiv);
        });
        const addEnvBtn = document.createElement('button');
        addEnvBtn.className = "w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-bold hover:border-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 transition flex items-center justify-center gap-2";
        addEnvBtn.innerHTML = `<i class="fas fa-plus"></i> Adicionar Novo Ambiente`;
        addEnvBtn.onclick = addNewEnv;
        container.appendChild(addEnvBtn);
    }

    window.updateEnvName = (idx, val) => { tablesConfig.environments[idx].name = val; }
    window.updateTableNum = (envIdx, tblIdx, val) => { tablesConfig.environments[envIdx].tables[tblIdx] = parseInt(val); }
    window.removeTable = (envIdx, tblIdx) => { tablesConfig.environments[envIdx].tables.splice(tblIdx, 1); renderConfigContent(); }
    window.addTableToEnv = (envIdx) => { 
        const env = tablesConfig.environments[envIdx];
        const max = env.tables.length > 0 ? Math.max(...env.tables) : 0;
        env.tables.push(max + 1);
        renderConfigContent();
    }
    window.removeEnv = (idx) => { 
        if(confirm("Excluir ambiente e todas as suas mesas?")) {
            tablesConfig.environments.splice(idx, 1); 
            renderConfigContent();
        }
    }
    window.addNewEnv = () => {
        tablesConfig.environments.push({ id: `env-${Date.now()}`, name: 'Novo Ambiente', tables: [1, 2] });
        renderConfigContent();
    }

    window.salvarNovaConfiguracao = async () => {
        try {
            // Corrigido: O nome do documento deve ser o mesmo usado no carregar (loja_mesas)
            const docRef = doc(db, "config", "loja_mesas");
            
            // Corrigido: Usar 'tablesConfig' que é onde os dados realmente estão
            await setDoc(docRef, tablesConfig); 
            
            window.showToast("Sucesso", "Configuração de mesas salva!");
            toggleConfigModal();
            renderizarGridMesas(); // Atualiza a visualização na hora
        } catch (e) {
            console.error("Erro ao salvar ambientes:", e);
            window.showToast("Erro", "Falha ao salvar configuração.", true);
        }
    };

    window.handleFacadeUpload = async (input) => {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const loading = document.getElementById('facade-upload-loading');
            loading.classList.remove('hidden');

            try {
                const storageRef = ref(storage, `config/fachada_loja_${Date.now()}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                
                document.getElementById('facade-preview').src = url;
                document.getElementById('facade-preview').classList.remove('hidden');
                document.getElementById('facade-placeholder').classList.add('hidden');
                document.getElementById('info-facade-url').value = url;
                
                showToast("Sucesso", "Imagem da fachada carregada!");
            } catch (error) {
                console.error(error);
                showToast("Erro", "Falha ao subir imagem", true);
            } finally {
                loading.classList.add('hidden');
            }
        }
    }

    // 2. Carregar os dados (Sincronizando as duas tabelas)
    window.carregarConfigLoja = async () => {
        try {
            // Pega Banner e Status
            const snapLoja = await getDoc(doc(db, "config", "loja"));
            if(snapLoja.exists()) {
                const d = snapLoja.data();
                document.getElementById('store-title').value = d.titulo || '';
                document.getElementById('store-desc').value = d.descricao || '';
                document.getElementById('store-toggle').checked = d.aberto || false;
                
                const iconBg = document.getElementById('status-icon-bg');
                if(d.aberto) iconBg.className = "w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-green-100 text-green-600";
                else iconBg.className = "w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-red-100 text-red-600";
            }

            // Pega Info do Modal (Endereço, WhatsApp e Imagem)
            const snapInfo = await getDoc(doc(db, "config", "loja_info"));
            if(snapInfo.exists()) {
                const d = snapInfo.data();
                document.getElementById('info-address-input').value = d.endereco || '';
                document.getElementById('info-phone-input').value = d.whatsapp || '';
                document.getElementById('info-hours-input').value = d.horarioTexto || ''; // Texto editável do modal
                
                if(d.facadeUrl) {
                    document.getElementById('facade-preview').src = d.facadeUrl;
                    document.getElementById('facade-preview').classList.remove('hidden');
                    document.getElementById('facade-placeholder').classList.add('hidden');
                    document.getElementById('info-facade-url').value = d.facadeUrl;
                }
            }
        } catch(e) { console.error(e); }
    }
    window.salvarTudoBoasVindas = async () => {
        const btn = document.querySelector('button[onclick="salvarTudoBoasVindas()"]');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const dadosBanner = {
                titulo: document.getElementById('store-title').value,
                descricao: document.getElementById('store-desc').value,
                aberto: document.getElementById('store-toggle').checked
            };

            const dadosInfo = {
                endereco: document.getElementById('info-address-input').value,
                whatsapp: document.getElementById('info-phone-input').value,
                horarioTexto: document.getElementById('info-hours-input').value, // Salva o texto que você digitou
                facadeUrl: document.getElementById('info-facade-url').value
            };

            await setDoc(doc(db, "config", "loja"), dadosBanner, { merge: true });
            await setDoc(doc(db, "config", "loja_info"), dadosInfo, { merge: true });

            showToast("Sucesso", "Site atualizado com sucesso!");
            carregarConfigLoja();
        } catch (e) {
            showToast("Erro", "Falha ao salvar", true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    // ===============================================
    // BLOCO UNIFICADO: CONFIGURAÇÕES DE PEDIDOS E DELIVERY
    // ===============================================

    // 1. Função para atualizar o texto do rótulo (Ex: "Sem preço" -> "Preço Fixo")
    window.atualizarLabelPrecoDelivery = function(modo) {
        const label = document.getElementById('delivery-price-label');
        if (!label) return;

        const modos = {
            'free': 'Frete Grátis',
            'fixed': 'Preço Fixo',
            'district': 'Por Bairro',
            'distance': 'Por Distância',
            'ifood': 'Tabela iFood'
        };

        label.innerText = modos[modo] || 'Sem preço';
    };

    // 2. Carregar todas as configurações (Pedidos + Endereço da Empresa)
    window.carregarConfigPedidos = async () => {
        console.log("🔄 Carregando configurações de pedidos...");
        try {
            // Sincroniza Endereço da Empresa
            const infoSnap = await getDoc(doc(db, "config", "loja_info"));
            if (infoSnap.exists()) {
                const bizAddress = infoSnap.data().endereco || "Endereço não configurado";
                const el = document.getElementById('biz-address');
                if (el) el.innerText = bizAddress;
            }

            // Busca Regras de Pedido no Firebase
            const docSnap = await getDoc(doc(db, "config", "pedidos"));
            if(docSnap.exists()) {
                const d = docSnap.data();
                console.log("📦 Dados recebidos do Firebase:", d);
                
                // --- Helper para marcar checkbox com segurança ---
                const setCheck = (id, val) => {
                    const el = document.getElementById(id);
                    if(el) {
                        el.checked = (val === true);
                        console.log(`Setando ${id}: ${val}`); // Debug
                    } else {
                        console.warn(`Elemento ${id} não encontrado no HTML.`);
                    }
                };
                // --- Helper para definir valor numérico ---
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if(el) el.value = val || 0;
                };

                // 1. SWITCHES PRINCIPAIS
                setCheck('cfg-delivery-active', d.delivery !== false);
                setCheck('cfg-pickup-active', d.pickup !== false);
                setCheck('cfg-accept-orders', d.accept !== false);
                setCheck('cfg-local-active', d.local !== false);
                setCheck('cfg-table-active', d.table !== false);
                
                // 2. DELIVERY (Opções Avançadas)
                setVal('cfg-deliv-min', d.delivMin);
                setVal('cfg-deliv-free', d.delivFreeAbove);
                setVal('cfg-deliv-service', d.delivServiceFee);
                
                setCheck('cfg-deliv-extra', d.askExtraInfo);
                setCheck('cfg-deliv-comp', d.mandatoryComplement);
                
                // AQUI ESTÁ O AGENDAMENTO - Verifique no console se aparece "Setando cfg-deliv-sched: true/false"
                setCheck('cfg-deliv-sched', d.allowScheduled); 

                // 3. RETIRADA (Opções Avançadas)
                setCheck('cfg-pick-extra', d.pickupAskExtraInfo);
                setCheck('cfg-pick-service', d.pickupServiceFee);
                setCheck('cfg-pick-pack', d.pickupPackagingFee);
                setCheck('cfg-pick-sched', d.pickupAllowScheduled);

                // 4. NO LOCAL (Opções Avançadas)
                setCheck('cfg-ask-name', d.localAskName !== false);
                setCheck('cfg-local-extra', d.localAskExtraInfo);
                setCheck('cfg-local-service', d.localServiceFee);
                setCheck('cfg-scheduled-orders', d.localAllowScheduled);

                // 5. MESA (Avançado)
                setCheck('cfg-table-service-fee', d.tableServiceFeeActive);
                setVal('cfg-table-fee-value', d.tableServiceFeeValue || 10);

                // 6. Atualiza label visual do modo de entrega
                window.atualizarLabelPrecoDelivery(d.deliveryMode);
                
                if(typeof configEntregaAtual !== 'undefined') {
                    configEntregaAtual = d;
                }
            } else {
                console.log("⚠️ Documento 'config/pedidos' não existe no Firebase.");
            }
        } catch(e) { 
            console.error("❌ Erro ao carregar configurações de pedidos:", e); 
        }
    };

    // ===============================================
    // 2. SALVAR CONFIGURAÇÕES (Pega do HTML e manda pro Firebase)
    // ===============================================
    window.salvarConfigPedidos = async () => {
        console.log("💾 Salvando configurações...");
        const btn = document.querySelector('button[onclick="salvarConfigPedidos()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        // Helpers
        const check = (id) => {
            const el = document.getElementById(id);
            const val = el ? el.checked : false;
            console.log(`Lendo ${id}: ${val}`); // Debug
            return val;
        };
        const val = (id) => document.getElementById(id) ? Number(document.getElementById(id).value) : 0;

        const data = {
            // Switches Principais
            delivery: check('cfg-delivery-active'),
            pickup: check('cfg-pickup-active'),
            accept: check('cfg-accept-orders'),
            local: check('cfg-local-active'),
            table: check('cfg-table-active'),
            
            // Delivery
            delivMin: val('cfg-deliv-min'),
            delivFreeAbove: val('cfg-deliv-free'),
            delivServiceFee: val('cfg-deliv-service'),
            askExtraInfo: check('cfg-deliv-extra'),
            mandatoryComplement: check('cfg-deliv-comp'),
            
            // AQUI ESTÁ O AGENDAMENTO - Verifique se está lendo 'true' quando marcado
            allowScheduled: check('cfg-deliv-sched'), 

            // Retirada
            pickupAskExtraInfo: check('cfg-pick-extra'),
            pickupServiceFee: check('cfg-pick-service'),
            pickupPackagingFee: check('cfg-pick-pack'),
            pickupAllowScheduled: check('cfg-pick-sched'),

            // No Local
            localAskName: check('cfg-ask-name'),
            localAskExtraInfo: check('cfg-local-extra'),
            localServiceFee: check('cfg-local-service'),
            localAllowScheduled: check('cfg-scheduled-orders'),

            // Mesa
            tableServiceFeeActive: check('cfg-table-service-fee'),
            tableServiceFeeValue: val('cfg-table-fee-value'),
            
            updatedAt: serverTimestamp()
        };
        
        console.log("📤 Enviando para Firebase:", data);

        try {
            const docRef = doc(db, "config", "pedidos");
            // { merge: true } é essencial para não apagar configurações de bairros/preços
            await setDoc(docRef, data, { merge: true });
            
            window.showToast("Sucesso", "Configurações salvas com sucesso!");
            
            // Recarrega para confirmar visualmente
            await window.carregarConfigPedidos();

        } catch(e) { 
            console.error("❌ Erro ao salvar configurações:", e);
            window.showToast("Erro", "Não foi possível salvar as alterações.", true); 
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // 3. Salvar todas as configurações de uma vez
    window.salvarConfigPedidos = async () => {
        // Helper para pegar valor checkbox com segurança
        const check = (id) => document.getElementById(id)?.checked ?? false;
        // Helper para pegar valor numérico com segurança
        const val = (id) => Number(document.getElementById(id)?.value) || 0;

        const data = {
            // Switches Principais
            delivery: check('cfg-delivery-active'),
            pickup: check('cfg-pickup-active'),
            accept: check('cfg-accept-orders'),
            local: check('cfg-local-active'),
            table: check('cfg-table-active'),
            
            // Delivery - Valores e Checkboxes
            delivMin: val('cfg-deliv-min'),
            delivFreeAbove: val('cfg-deliv-free'),
            delivServiceFee: val('cfg-deliv-service'),
            askExtraInfo: check('cfg-deliv-extra'),
            mandatoryComplement: check('cfg-deliv-comp'),
            allowScheduled: check('cfg-deliv-sched'), // <--- O AGENDAMENTO É SALVO AQUI

            // Retirada
            pickupAskExtraInfo: check('cfg-pick-extra'),
            pickupServiceFee: check('cfg-pick-service'),
            pickupPackagingFee: check('cfg-pick-pack'),
            pickupAllowScheduled: check('cfg-pick-sched'),

            // No Local
            localAskName: check('cfg-ask-name'),
            localAskExtraInfo: check('cfg-local-extra'),
            localServiceFee: check('cfg-local-service'),
            localAllowScheduled: check('cfg-scheduled-orders'),

            // Mesa
            tableServiceFeeActive: check('cfg-table-service-fee'),
            tableServiceFeeValue: val('cfg-table-fee-value'),
            
            updatedAt: serverTimestamp()
        };

        try {
            const docRef = doc(db, "config", "pedidos");
            // { merge: true } garante que não apagamos configurações de modo de entrega (preço fixo, bairros, etc)
            await setDoc(docRef, data, { merge: true });
            
            window.showToast("Sucesso", "Todas as configurações foram salvas!");
            
            // Recarrega para confirmar visualmente
            await window.carregarConfigPedidos();

        } catch(e) { 
            console.error("Erro ao salvar configurações:", e);
            window.showToast("Erro", "Não foi possível salvar as alterações.", true); 
        }
    };
    window.renderizarListaBairrosConfig = () => {
        const container = document.getElementById('lista-bairros-config');
        if(!container) return;
        
        container.innerHTML = '';
        // Pega do seu objeto global de configuração (carregado do banco)
        const bairros = configEntregaAtual?.deliveryDistricts || []; 

        if(bairros.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center text-sm py-4">Nenhum bairro cadastrado.</p>';
            return;
        }

        bairros.forEach((b, idx) => {
            container.innerHTML += `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded mb-2 border">
                    <span class="text-sm font-bold text-gray-700">${b.nome}</span>
                    <div class="flex items-center gap-3">
                        <span class="text-green-600 font-bold text-sm">R$ ${parseFloat(b.custo).toFixed(2)}</span>
                        <button onclick="removerBairro(${idx})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
    };

    // 4. Seleção visual no Modal de Delivery
    window.selectDeliveryOption = (element, mode) => {
        // 1. Atualiza visualmente qual card está selecionado
        document.querySelectorAll('.delivery-option-card').forEach(c => {
            c.classList.remove('selected');
            // Limpa atributo de dados antigo para evitar conflito
            delete c.dataset.selectedType; 
        });
        
        element.classList.add('selected');
        
        // CORREÇÃO CRÍTICA: Salva o tipo no dataset do elemento para o botão Salvar encontrar depois
        element.dataset.selectedType = mode; 

        // 2. Lógica para abrir o modal correto
        if (mode === 'fixed') {
            document.getElementById('modal-fixed-price').classList.remove('hidden');
        } 
    else if (mode === 'district') {
            document.getElementById('modal-neighborhood-price').classList.remove('hidden');
            
            // Garante que a lista local esteja sincronizada com o que veio do banco, se ainda não estiver editada
            if (window.localBairros.length === 0 && configEntregaAtual.deliveryDistricts) {
                window.localBairros = configEntregaAtual.deliveryDistricts;
            }
            renderListaBairros();
        }
    };


    window.atualizarLabelPrecoDelivery = function(modo) {
        const label = document.getElementById('delivery-price-label');
        if (!label) return;

        const modos = {
            'free': 'Frete Grátis',
            'fixed': 'Preço Fixo',
            'district': 'Por Bairro',
            'distance': 'Por Distância',
            'ifood': 'Tabela iFood'
        };
        label.innerText = modos[modo] || 'Sem preço';
    };

    window.salvarConfigEntrega = async () => {
        const selected = document.querySelector('.delivery-option-card.selected');
        if(!selected) return;
        
        // Tenta pegar do dataset (se clicou agora) OU da variável global 
        let type = selected.dataset.selectedType || window.currentDeliveryMode;

        // FALLBACK DE SEGURANÇA:
        // Se o usuário abriu o modal e clicou "Salvar" direto sem mudar a opção, 
        // a variável 'type' pode estar vazia. Vamos pegar direto do atributo onclick do HTML.
        if (!type) {
            const clickAttr = selected.getAttribute('onclick'); // ex: "selectDeliveryOption(this, 'free')"
            if(clickAttr) {
                const match = clickAttr.match(/'([^']+)'/); // Extrai o texto entre aspas simples ('free')
                if(match) type = match[1];
            }
        }

        // Se ainda assim falhar, avisa o usuário
        if (!type) {
            return showToast("Atenção", "Selecione uma opção de entrega antes de salvar.", true);
        }

        try {
            // Agora salva no Firebase com o tipo correto
            await setDoc(doc(db, "config", "pedidos"), { deliveryMode: type }, { merge: true });
            
            document.getElementById('delivery-settings-modal').classList.add('hidden');
            
            // Recarrega para atualizar o label "Sem preço" para o novo modo
            carregarConfigPedidos(); 
            showToast("Sucesso", "Modo de entrega atualizado!");
        } catch(e) {
            console.error("Erro ao salvar entrega:", e);
            showToast("Erro", "Falha ao salvar modo de entrega. Verifique o console.", true);
        }
    }

    function aplicarEstiloImpressao(size) {
        const area = document.getElementById('receipt-area');
        if(area) {
            if(size === '58mm') {
                area.style.width = '58mm';
                area.style.fontSize = '10px';
            } else {
                area.style.width = '80mm';
                area.style.fontSize = '12px';
            }
        }
    }
    // dashboard.js

    // CORREÇÃO DO NOTIFY TOGGLE (Img 5)
    window.showToast = (title, msg, isError = false) => {
        const t = document.getElementById('toast');
        const tTitle = document.getElementById('toast-title');
        const tMsg = document.getElementById('toast-msg');
        
        if(!t || !tTitle || !tMsg) return;

        tTitle.innerText = title;
        tMsg.innerText = msg;
        
        // Ajusta as cores baseado no erro ou sucesso
        t.className = `fixed top-4 right-4 z-[100] shadow-xl rounded px-4 py-3 animate-fade-in-up border-l-4 ${isError ? 'bg-red-50 border-red-500 text-red-900' : 'bg-white border-green-500 text-gray-800'}`;
        
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 3000);
    };

    // 2. FUNÇÃO PARA EXPANDIR/RECOLHER OPÇÕES AVANÇADAS
    window.toggleAdvanced = (id, iconId) => {
        const content = document.getElementById(id);
        const icon = document.getElementById(iconId);
        
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            icon.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
        }
    };

    // 3. ATUALIZAÇÃO DO NOTIFY TOGGLE PARA USAR O NOVO SHOWTOAST
    window.notifyToggle = (elementId, label) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        const isChecked = el.checked;
        const status = isChecked ? "Ativado" : "Desativado";
        const msg = `${label} foi ${status.toLowerCase()} com sucesso!`;
        
        window.showToast(status, msg, !isChecked); 
    };

    // Gerenciamento de Entregadores
    let localEntregadores = [];
    window.abrirModalEntregadores = () => {
        document.getElementById('modal-entregadores').classList.remove('hidden');
        renderizarEntregadores();
    }

    window.adicionarEntregador = () => {
        const nome = document.getElementById('new-driver-name').value;
        if(!nome) return;
        localEntregadores.push(nome);
        document.getElementById('new-driver-name').value = '';
        renderizarEntregadores();
    }

    function renderizarEntregadores() {
        const container = document.getElementById('lista-entregadores');
        container.innerHTML = localEntregadores.map((n, i) => `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border">
                <span class="text-sm font-bold">${n}</span>
                <button onclick="localEntregadores.splice(${i}, 1); renderizarEntregadores();" class="text-red-500"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    }


    // --- PREÇO FIXO ---
    window.salvarPrecoFixo = async () => {
        const preco = parseFloat(document.getElementById('input-fixed-price').value) || 0;
        try {
            await setDoc(doc(db, "config", "pedidos"), { 
                deliveryFixedPrice: preco,
                deliveryMode: 'fixed' 
            }, { merge: true });
            showToast("Sucesso", "Preço fixo atualizado!");
            document.getElementById('modal-fixed-price').classList.add('hidden');
        } catch (e) { console.error(e); }
    };

    // --- PREÇO POR BAIRRO ---
    window.localBairros = [];

    window.adicionarBairroLista = () => {
        const nome = document.getElementById('bairro-nome').value;
        const custo = parseFloat(document.getElementById('bairro-custo').value) || 0;
        if(!nome) return;
        
        window.localBairros.push({ nome, custo });
        renderListaBairros();
        document.getElementById('bairro-nome').value = '';
        document.getElementById('bairro-custo').value = '';
    };
    window.removerBairroLista = (idx) => {
        window.localBairros.splice(idx, 1);
        renderListaBairros();
    };

    function renderListaBairros() {
        const container = document.getElementById('lista-bairros-config');
        if(!container) return;
        
        // Se a lista estiver vazia
        if (!window.localBairros || window.localBairros.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center text-sm py-4">Nenhum bairro configurado.</p>';
            return;
        }

        container.innerHTML = window.localBairros.map((b, idx) => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border mb-2">
                <span class="font-bold text-sm text-gray-700">${b.nome}</span>
                <div class="flex items-center gap-4">
                    <span class="font-bold text-cyan-700">R$ ${parseFloat(b.custo).toFixed(2)}</span>
                    <button onclick="removerBairroLista(${idx})" class="text-red-500 p-2 hover:bg-red-50 rounded-lg transition">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    window.salvarBairrosBanco = async () => {
        try {
            await setDoc(doc(db, "config", "pedidos"), { 
                deliveryDistricts: localBairros,
                deliveryMode: 'district'
            }, { merge: true });
            showToast("Sucesso", "Tabela de bairros salva!");
            document.getElementById('modal-neighborhood-price').classList.add('hidden');
        } catch (e) { console.error(e); }
    };
    window.salvarModoIfood = async () => {
        try {
            await setDoc(doc(db, "config", "pedidos"), { 
                deliveryMode: 'ifood' 
            }, { merge: true });
            showToast("Sucesso", "Tabela de preços iFood ativada!");
            document.getElementById('delivery-settings-modal').classList.add('hidden');
            carregarConfigPedidos();
        } catch (e) { console.error(e); }
    };
    // --- MÓDULO FINANCEIRO (Adicione ao final do js/dashboard.js) ---

    window.abrirModalFinanceiro = () => {
        document.getElementById('modal-financeiro').classList.remove('hidden');
        // Aproveita para recarregar a lista ao abrir
        renderizarFinanceiro();
    };

    window.fecharModalFinanceiro = () => {
        document.getElementById('modal-financeiro').classList.add('hidden');
        document.getElementById('form-financeiro').reset();
    };

    window.salvarLancamento = async () => {
        const desc = document.getElementById('fin-desc').value;
        const valor = parseFloat(document.getElementById('fin-valor').value);
        const tipo = document.getElementById('fin-tipo').value;

        if (!desc || isNaN(valor) || valor <= 0) return alert("Preencha os dados corretamente!");

        try {
            // Salva na coleção 'movimentacoes' do Firebase
            await addDoc(collection(db, "movimentacoes"), {
                descricao: desc,
                valor: valor,
                tipo: tipo,
                data: serverTimestamp()
            });

            if (typeof showToast === "function") {
                showToast("Financeiro", "Lançamento salvo com sucesso!");
            } else {
                alert("Salvo com sucesso!");
            }
            
            fecharModalFinanceiro();
            renderizarFinanceiro(); // Atualiza a tabela
        } catch (error) {
            console.error("Erro ao salvar financeiro:", error);
            alert("Erro ao salvar. Verifique o console.");
        }
    };

    window.renderizarFinanceiro = async () => {
        const tbody = document.getElementById('table-financeiro-body');
        if(!tbody) return;

        // Busca as últimas 20 movimentações
        try {
            const q = query(collection(db, "movimentacoes"), orderBy("data", "desc"), limit(20));
            const snapshot = await getDocs(q);
            
            let html = '';
            
            if(snapshot.empty){
                tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const dateObj = item.data ? item.data.toDate() : new Date();
                const dataFormatada = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                
                const isEntrada = item.tipo === 'entrada';
                const colorClass = isEntrada ? 'text-green-600' : 'text-red-600';
                const signal = isEntrada ? '+' : '-';
                
                html += `
                    <tr class="border-b hover:bg-gray-50 transition">
                        <td class="px-6 py-4 text-gray-500">${dataFormatada}</td>
                        <td class="px-6 py-4 font-bold text-gray-700">${item.descricao}</td>
                        <td class="px-6 py-4 font-bold ${colorClass}">${signal} R$ ${item.valor.toFixed(2).replace('.', ',')}</td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html;
        } catch (e) {
            console.error("Erro ao renderizar financeiro:", e);
        }
    };
    // --- Lógica de Histórico e Filtros do Caixa ---

    // Função chamada ao abrir a tela de caixa
    window.iniciarTelaCaixa = () => {
        // Define datas padrão no filtro (Início do mês até hoje)
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        document.getElementById('filter-data-fim').valueAsDate = hoje;
        document.getElementById('filter-data-ini').valueAsDate = inicioMes;

        carregarEstadoCaixa(); // Carrega o caixa atual (aberto/fechado)
        renderizarHistoricoCaixas(); // Carrega a tabela de baixo
    }

    // Renderiza a tabela de histórico (Img 4)
    window.renderizarHistoricoCaixas = async () => {
        const tbody = document.getElementById('lista-historico-caixa');
        const inputIni = document.getElementById('filter-data-ini').value; // Formato YYYY-MM-DD
        const inputFim = document.getElementById('filter-data-fim').value; // Formato YYYY-MM-DD
        
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400"><i class="fas fa-spinner fa-spin mb-2 text-2xl"></i><br>Buscando...</td></tr>';

        // DADOS FAKES (Simulando banco de dados)
        const historicoMock = [
            // Adicionando uma data de HOJE para você ver funcionar no teste imediato
            { id: 0, inicio: new Date().toISOString(), fim: new Date().toISOString(), operador: 'Você', inicial: 200.00, ifood: 150.00, loja: 500.00, final: 850.00, status: 'Fechado' },
            { id: 1, inicio: '2023-12-19T08:00:00', fim: '2023-12-19T18:00:00', operador: 'Wesley', inicial: 150.00, ifood: 450.50, loja: 1200.00, final: 1350.00, status: 'Fechado' },
            { id: 2, inicio: '2023-12-18T08:00:00', fim: '2023-12-18T22:00:00', operador: 'Admin', inicial: 100.00, ifood: 890.00, loja: 2100.00, final: 2200.00, status: 'Fechado' },
            { id: 3, inicio: '2023-12-01T08:00:00', fim: '2023-12-01T20:00:00', operador: 'Wesley', inicial: 50.00, ifood: 120.00, loja: 500.00, final: 670.00, status: 'Fechado' },
        ];

        // LÓGICA DE FILTRO CORRIGIDA (SEM ERRO DE FUSO)
        const listaFiltrada = historicoMock.filter(h => {
            if (!inputIni || !inputFim) return true;

            // Pega apenas a parte da data YYYY-MM-DD da string ISO do registro
            // Ex: '2023-12-19T08:00:00' vira '2023-12-19'
            const dataRegistro = h.inicio.split('T')[0]; 
            
            // Compara texto com texto (muito mais seguro para datas simples)
            return dataRegistro >= inputIni && dataRegistro <= inputFim;
        });

        tbody.innerHTML = '';

        if (listaFiltrada.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400">Nenhum fechamento encontrado neste período.</td></tr>';
            return;
        }

        let html = '';
        
        listaFiltrada.forEach(h => {
            const dataObj = new Date(h.inicio);
            const dataFimObj = new Date(h.fim);
            
            const dataFormatada = dataObj.toLocaleDateString('pt-BR');
            const horaIni = dataObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            const horaFim = dataFimObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            html += `
                <tr class="hover:bg-gray-50 transition cursor-pointer border-b border-gray-100">
                    <td class="px-6 py-4">
                        <p class="font-bold text-gray-800">${dataFormatada}</p>
                        <p class="text-xs text-gray-400">${horaIni} às ${horaFim}</p>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">${h.operador}</span>
                    </td>
                    <td class="px-6 py-4 text-right text-gray-500">R$ ${h.inicial.toFixed(2).replace('.', ',')}</td>
                    <td class="px-6 py-4 text-right font-bold text-red-500"><i class="fas fa-motorcycle text-[10px] mr-1"></i> R$ ${h.ifood.toFixed(2).replace('.', ',')}</td>
                    <td class="px-6 py-4 text-right font-bold text-green-600">R$ ${h.loja.toFixed(2).replace('.', ',')}</td>
                    <td class="px-6 py-4 text-right font-black text-gray-800">R$ ${h.final.toFixed(2).replace('.', ',')}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                            <i class="fas fa-check-circle"></i> Conferido
                        </span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };
    // Integração Visual com iFood
    let intervaloIfood = null;
    let totalVendasIfood = 0;

    window.sincronizarIfood = (btn) => {
        // Verifica estado atual pela cor do botão ou classe
        const estaAtivo = btn.classList.contains('bg-green-500');
        
        // Elementos visuais
        const statusText = document.getElementById('ifood-status-text');
        const dot = document.getElementById('ifood-dot');
        const ping = document.getElementById('ifood-ping');

        if (estaAtivo) {
            // --- DESCONECTAR ---
            if (intervaloIfood) clearInterval(intervaloIfood);
            intervaloIfood = null;

            // Visual Botão
            btn.innerHTML = '<i class="fas fa-sync"></i> <span>Sincronizar Agora</span>';
            btn.classList.remove('bg-green-500', 'hover:bg-green-600', 'shadow-green-200');
            btn.classList.add('bg-[#EA1D2C]', 'hover:bg-[#d91a28]', 'shadow-red-200');
            
            // Visual Status
            if(statusText) statusText.innerText = "Desconectado";
            if(statusText) statusText.className = "text-xs font-bold text-gray-400";
            if(dot) dot.className = "relative inline-flex rounded-full h-3 w-3 bg-gray-300";
            if(ping) ping.classList.add('opacity-0');

            showToast("iFood", "Integração pausada.");

        } else {
            // --- CONECTAR ---
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span>Conectando...</span>';
            btn.disabled = true;

            setTimeout(() => {
                // Visual Conectado
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-wifi"></i> <span>iFood Online</span>';
                btn.classList.remove('bg-[#EA1D2C]', 'hover:bg-[#d91a28]', 'shadow-red-200');
                btn.classList.add('bg-green-500', 'hover:bg-green-600', 'shadow-green-200');

                // Visual Status
                if(statusText) statusText.innerText = "Online • Monitorando";
                if(statusText) statusText.className = "text-xs font-bold text-green-600";
                if(dot) dot.className = "relative inline-flex rounded-full h-3 w-3 bg-green-500";
                if(ping) ping.classList.remove('opacity-0');

                showToast("Sucesso", "iFood conectado! Monitorando pedidos.");

                // INÍCIO DA SIMULAÇÃO (Loop)
                intervaloIfood = setInterval(() => {
                    simularPedidoIfood();
                }, 8000); // A cada 8 segundos

            }, 2000); // Delay fake de conexão
        }
    };
    function simularPedidoIfood() {
        // Gera valor aleatório
        const valorVenda = (Math.random() * 80) + 25; 
        totalVendasIfood += valorVenda;

        const display = document.getElementById('caixa-ifood-total');
        if(display) {
            // Efeito visual no texto
            display.style.transition = "all 0.3s";
            display.style.color = "#16a34a"; // Verde
            display.style.transform = "scale(1.1)";
            
            display.innerText = `R$ ${totalVendasIfood.toFixed(2).replace('.', ',')}`;
            
            // Toca som se existir
            const sound = document.getElementById('notif-sound');
            if(sound) sound.play().catch(e => {});

            // Cria notificação Toast
            showToast("Novo Pedido iFood", `Venda recebida: R$ ${valorVenda.toFixed(2).replace('.', ',')}`);

            // Volta o texto ao normal
            setTimeout(() => {
                display.style.color = "";
                display.style.transform = "scale(1)";
            }, 800);
        }
    }
    // --- CONFIGURAÇÕES DO NEGÓCIO ---

    window.salvarConfigNegocio = async () => {
        const btnSalvar = document.querySelector('button[onclick="salvarConfigNegocio()"]');
        const htmlOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btnSalvar.disabled = true;

        try {
            // Garante que pegamos o endereço correto (do input ou do texto se não editou)
            let enderecoFinal = document.getElementById('conf-endereco').value;
            if(!enderecoFinal) enderecoFinal = document.getElementById('display-endereco').innerText;

            const data = {
                nome: document.getElementById('conf-nome').value,
                whatsapp: document.getElementById('conf-whatsapp').value,
                endereco: enderecoFinal,
                moeda: document.getElementById('conf-moeda').value,
                idioma: document.getElementById('conf-idioma').value,
                esconderEndereco: document.getElementById('conf-hide-address').checked,
                horarios: horariosConfig,
                updatedAt: serverTimestamp()
            };

            // Salva na coleção 'config' documento 'loja_info'
            await setDoc(doc(db, "config", "loja_info"), data, { merge: true });
            
            showToast("Sucesso", "Informações da empresa salvas!");

        } catch (e) {
            console.error("Erro ao salvar:", e);
            showToast("Erro", "Falha ao salvar. Verifique o console.", true);
        } finally {
            btnSalvar.innerHTML = htmlOriginal;
            btnSalvar.disabled = false;
        }
    }

    // --- GESTÃO DE EQUIPE (Integrado com Entregadores) ---

    // Lista fictícia inicial (unindo Admin + Entregadores existentes)
    let teamMembers = [
        { id: 1, nome: 'Wesley Souza', email: 'wesleysouza.arq@gmail.com', role: 'admin' },
        { id: 2, nome: 'Atendente 01', email: 'caixa@tropyberry.com', role: 'caixa' }
    ];

    // Carrega os dados na tabela
    window.renderizarEquipe = async () => {
        const tbody = document.getElementById('team-list-body');
        if(!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Carregando equipe...</td></tr>';

        try {
            // 1. Busca usuários salvos no banco
            const querySnapshot = await getDocs(collection(db, "equipe"));
            
            // 2. Busca entregadores locais (do módulo de delivery) para mesclar, caso queira manter compatibilidade
            // Mas a prioridade agora é o banco "equipe"
            
            let html = '';

            if (querySnapshot.empty) {
                html = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhum membro encontrado. Adicione o primeiro!</td></tr>';
            } else {
                querySnapshot.forEach((docSnap) => {
                    const user = docSnap.data();
                    // O ID do documento será o email para garantir unicidade
                    html += criarLinhaTabelaEquipe(docSnap.id, user);
                });
            }

            tbody.innerHTML = html;

        } catch (error) {
            console.error("Erro ao carregar equipe:", error);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar dados.</td></tr>';
        }
    };

    function criarLinhaTabelaEquipe(emailDoc, user) {
        let roleBadge = '';
        let roleName = '';

        switch(user.role) {
            case 'admin': 
                roleBadge = 'bg-purple-100 text-purple-700'; roleName = 'Administrador'; break;
            case 'gerente': 
                roleBadge = 'bg-cyan-100 text-cyan-700'; roleName = 'Gerente'; break;
            case 'entregador': 
                roleBadge = 'bg-orange-100 text-orange-700'; roleName = 'Entregador'; break;
            case 'cozinha': 
                roleBadge = 'bg-yellow-100 text-yellow-700'; roleName = 'Cozinheiro'; break;
            default: 
                roleBadge = 'bg-green-100 text-green-700'; roleName = 'Caixa / Atendente';
        }

        // Nota: Adicionei user.nome nos parametros das funções onclick abaixo
        return `
            <tr class="hover:bg-gray-50 transition border-b group">
                <td class="px-6 py-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 uppercase">
                        ${user.nome ? user.nome.charAt(0) : '?'}
                    </div>
                    <div>
                        <span class="font-bold text-gray-700 block">${user.nome}</span>
                        <span class="text-[10px] text-gray-400 md:hidden">${user.email}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">${user.email}</td>
                <td class="px-6 py-4">
                    <span class="${roleBadge} px-2 py-1 rounded-full text-xs font-bold shadow-sm border border-black/5">
                        ${roleName}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                        <button onclick="abrirModalEditarFuncao('${emailDoc}', '${user.role}', '${user.nome}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg transition" title="Mudar Função">
                            <i class="fas fa-user-edit"></i>
                        </button>
                        <button onclick="abrirModalExcluirUsuario('${emailDoc}', '${user.nome}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition" title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
    window.abrirModalEditarFuncao = (email, currentRole, nome) => {
        document.getElementById('edit-role-email').value = email;
        document.getElementById('edit-role-username').innerText = nome;
        document.getElementById('select-edit-role').value = currentRole;
        document.getElementById('modal-edit-role').classList.remove('hidden');
    }
    window.abrirModalEditarFuncao = (email, currentRole, nome) => {
        document.getElementById('edit-role-email').value = email;
        document.getElementById('edit-role-username').innerText = nome;
        document.getElementById('select-edit-role').value = currentRole;
        document.getElementById('modal-edit-role').classList.remove('hidden');
    }

    window.confirmarEdicaoFuncao = async () => {
        const email = document.getElementById('edit-role-email').value;
        const newRole = document.getElementById('select-edit-role').value;
        const btn = document.querySelector('#modal-edit-role button');
        
        const originalText = btn.innerText;
        btn.innerText = "SALVANDO...";
        btn.disabled = true;

        try {
            await updateDoc(doc(db, "equipe", email), { role: newRole });
            
            // Sucesso: Fecha modal e mostra Toast
            document.getElementById('modal-edit-role').classList.add('hidden');
            showToast("Sucesso", "Permissão atualizada!");
            renderizarEquipe();
            
        } catch(e) {
            console.error(e);
            showToast("Erro", "Não foi possível atualizar.", true);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
    window.abrirModalExcluirUsuario = (email, nome) => {
        document.getElementById('delete-user-email').value = email;
        document.getElementById('delete-username').innerText = nome;
        document.getElementById('modal-delete-confirm').classList.remove('hidden');
    }
    window.executarRemocaoUsuario = async () => {
        const email = document.getElementById('delete-user-email').value;
        const btn = document.querySelector('#modal-delete-confirm button.bg-red-600');
        
        const originalText = btn.innerText;
        btn.innerText = "...";
        btn.disabled = true;

        try {
            await deleteDoc(doc(db, "equipe", email));
            
            // Sucesso: Fecha modal e mostra Toast
            document.getElementById('modal-delete-confirm').classList.add('hidden');
            showToast("Removido", "Usuário removido da equipe.");
            renderizarEquipe();
            
        } catch (e) {
            console.error(e);
            showToast("Erro", "Erro ao remover usuário.", true);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    window.adicionarUsuarioEquipe = async () => {
        const nome = document.getElementById('new-user-name').value;
        const email = document.getElementById('new-user-email').value.toLowerCase().trim(); // Email sempre minúsculo
        const role = document.getElementById('new-user-role').value;
        const phone = document.getElementById('new-user-phone').value;
        
        if(!nome || !email || !role) return showToast("Erro", "Preencha nome, email e função.", true);

        const btn = document.querySelector('#modal-add-user button[onclick="adicionarUsuarioEquipe()"]');
        const txtOriginal = btn.innerText;
        btn.innerText = "SALVANDO...";
        btn.disabled = true;

        try {
            // Salva na coleção 'equipe' usando o Email como ID (evita duplicatas)
            await setDoc(doc(db, "equipe", email), {
                nome: nome,
                email: email,
                role: role,
                phone: phone || '',
                createdAt: serverTimestamp()
            });

            // SE FOR ENTREGADOR: Sincroniza com a lista de Delivery (LocalStorage) para aparecer lá também
            if (role === 'entregador') {
                const currentDrivers = JSON.parse(localStorage.getItem('entregadores_proprios') || '[]');
                // Adiciona se não existir
                if (!currentDrivers.find(d => d.nome === nome)) {
                    currentDrivers.push({ nome: nome, status: 'disponivel' });
                    localStorage.setItem('entregadores_proprios', JSON.stringify(currentDrivers));
                }
            }

            showToast("Sucesso", "Usuário salvo e permissões atualizadas!");
            document.getElementById('modal-add-user').classList.add('hidden');
            
            // Limpa formulário
            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-email').value = '';
            document.getElementById('new-user-phone').value = '';
            
            renderizarEquipe();

        } catch (e) {
            console.error("Erro ao salvar usuário:", e);
            showToast("Erro", "Falha ao salvar no banco de dados.", true);
        } finally {
            btn.innerText = txtOriginal;
            btn.disabled = false;
        }
    };

    window.removerUsuarioEquipe = async (emailId) => {
        if(!confirm("Tem certeza? Isso removerá o acesso deste usuário imediatamente.")) return;

        try {
            await deleteDoc(doc(db, "equipe", emailId));
            showToast("Removido", "Usuário removido da equipe.");
            renderizarEquipe();
        } catch (e) {
            console.error(e);
            showToast("Erro", "Não foi possível remover.", true);
        }
    };

    // Adicionar um gancho para carregar a equipe sempre que abrir a tela
    let horariosConfig = {}; 

    // 1. CARREGAR DADOS (Atualizada)
    window.carregarConfigNegocio = async () => {
        try {
            const docRef = doc(db, "config", "loja_info");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Campos básicos
                if(document.getElementById('conf-nome')) document.getElementById('conf-nome').value = data.nome || '';
                if(document.getElementById('conf-whatsapp')) document.getElementById('conf-whatsapp').value = data.whatsapp || '';
                
                // Endereço (Preenche tanto o texto visual quanto o input oculto)
                const end = data.endereco || 'Endereço não configurado';
                const displayEl = document.getElementById('display-endereco');
                const inputEl = document.getElementById('conf-endereco');
                
                if(displayEl) displayEl.innerText = end;
                if(inputEl) inputEl.value = end;

                // Selects e Checkbox
                if(document.getElementById('conf-moeda')) document.getElementById('conf-moeda').value = data.moeda || 'BRL';
                if(document.getElementById('conf-idioma')) document.getElementById('conf-idioma').value = data.idioma || 'pt-BR';
                if(document.getElementById('conf-hide-address')) document.getElementById('conf-hide-address').checked = data.esconderEndereco || false;

                // Link GMB
                if(document.getElementById('conf-gmb-link') && data.slug) {
                    document.getElementById('conf-gmb-link').value = `https://${data.slug}.ola.click`; 
                }

                // Horários
                if(data.horarios) {
                    horariosConfig = data.horarios;
                } else {
                    inicializarHorariosPadrao();
                }
            } else {
                // Se não existe documento, inicia horários padrão
                inicializarHorariosPadrao();
            }
        } catch (e) {
            console.error("Erro load config:", e);
            showToast("Erro", "Falha ao carregar informações.", true);
        }
    }

    // 2. ALTERNAR EDIÇÃO DE ENDEREÇO
    window.toggleEditEndereco = () => {
        // Seleciona o container visual do endereço (a caixa com borda cinza)
        // Procuramos o elemento pai do texto que tem id 'display-endereco' e subimos níveis até a div da borda
        const displayElement = document.getElementById('display-endereco');
        const displayContainer = displayElement.closest('.border.border-gray-300'); // Busca o container mais próximo com borda
        const inputElement = document.getElementById('conf-endereco');
        
        if(displayContainer && inputElement) {
            displayContainer.classList.add('hidden'); // Esconde o visual
            inputElement.classList.remove('hidden');  // Mostra o input
            inputElement.focus();
        }
    }
    // Salva o endereço visualmente quando sai do input (blur)

    document.getElementById('conf-endereco')?.addEventListener('blur', function() {
        const val = this.value;
        const displayElement = document.getElementById('display-endereco');
        const displayContainer = displayElement.closest('.border.border-gray-300');
        
        if(val.trim() !== "") {
            displayElement.innerText = val;
        }
        
        // Esconde input, mostra visual
        this.classList.add('hidden'); 
        if(displayContainer) displayContainer.classList.remove('hidden');
    });
    // 3. LÓGICA DE HORÁRIOS (MODAL)
    function inicializarHorariosPadrao() {
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        dias.forEach(d => {
            horariosConfig[d] = { aberto: true, inicio: '08:00', fim: '18:00' };
        });
    }

    window.abrirModalHorarios = () => {
        if(Object.keys(horariosConfig).length === 0) inicializarHorariosPadrao();

        const container = document.getElementById('lista-dias-semana');
        container.innerHTML = '';

        const nomesDias = {
            'seg': 'Segunda-feira', 'ter': 'Terça-feira', 'qua': 'Quarta-feira',
            'qui': 'Quinta-feira', 'sex': 'Sexta-feira', 'sab': 'Sábado', 'dom': 'Domingo'
        };

        Object.keys(nomesDias).forEach(key => {
            const h = horariosConfig[key] || { aberto: true, inicio: '08:00', fim: '18:00' };
            
            const div = document.createElement('div');
            div.className = "flex items-center justify-between py-3 border-b last:border-0";
            div.innerHTML = `
                <div class="flex items-center gap-3 w-32">
                    <input type="checkbox" id="check-${key}" class="w-5 h-5 accent-cyan-600 cursor-pointer" 
                        ${h.aberto ? 'checked' : ''} onchange="toggleDiaHorario('${key}')">
                    <span class="font-bold text-gray-700 text-sm">${nomesDias[key]}</span>
                </div>
                <div class="flex items-center gap-2 ${h.aberto ? '' : 'opacity-50 pointer-events-none'}" id="inputs-${key}">
                    <input type="time" id="ini-${key}" value="${h.inicio}" class="border rounded p-1 text-sm text-gray-600 outline-none focus:border-cyan-500">
                    <span class="text-gray-400 font-bold">-</span>
                    <input type="time" id="fim-${key}" value="${h.fim}" class="border rounded p-1 text-sm text-gray-600 outline-none focus:border-cyan-500">
                </div>
            `;
            container.appendChild(div);
        });

        document.getElementById('modal-horarios').classList.remove('hidden');
    }

    window.toggleDiaHorario = (key) => {
        const isChecked = document.getElementById(`check-${key}`).checked;
        const inputsDiv = document.getElementById(`inputs-${key}`);
        
        if(isChecked) inputsDiv.classList.remove('opacity-50', 'pointer-events-none');
        else inputsDiv.classList.add('opacity-50', 'pointer-events-none');
    }

    window.salvarHorariosLocalmente = () => {
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        dias.forEach(key => {
            const check = document.getElementById(`check-${key}`);
            if(check) {
                horariosConfig[key] = {
                    aberto: check.checked,
                    inicio: document.getElementById(`ini-${key}`).value,
                    fim: document.getElementById(`fim-${key}`).value
                };
            }
        });
        
        document.getElementById('modal-horarios').classList.add('hidden');
        // Salva automaticamente no banco ao confirmar os horários
        salvarConfigNegocio(); 
    }

    window.salvarHorariosLocalmente = () => {
        const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        dias.forEach(key => {
            horariosConfig[key] = {
                aberto: document.getElementById(`check-${key}`).checked,
                inicio: document.getElementById(`ini-${key}`).value,
                fim: document.getElementById(`fim-${key}`).value
            };
        });
        
        document.getElementById('modal-horarios').classList.add('hidden');
        showToast("Horários", "Horários definidos temporariamente. Clique em Salvar para persistir.");
    }

    // 4. MÁSCARA DE TELEFONE (UX)
    const whatsappInput = document.getElementById('conf-whatsapp');
    if(whatsappInput) {
        whatsappInput.addEventListener('input', function (e) {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }
    window.copiarLinkGMB = () => {
        const input = document.getElementById("conf-gmb-link");
        input.select();
        input.setSelectionRange(0, 99999);
        
        navigator.clipboard.writeText(input.value).then(() => {
            showToast("Link Copiado", "Link copiado para a área de transferência.");
        }).catch(err => {
            console.error('Erro ao copiar: ', err);
        });
    }
    // ===============================================
    // INICIALIZAÇÃO INTELIGENTE (Adicione no final do dashboard.js)
    // ===============================================

    document.addEventListener('DOMContentLoaded', () => {
        monitorarEstadoAuth(async (user) => {
            if (!user || !(await verificarAdminNoBanco(user.email))) {
                window.location.href = 'index.html'; 
                return;
            }
            
            // Carrega infos do usuário no topo
            if(document.getElementById('header-user-name')) document.getElementById('header-user-name').innerText = user.displayName || 'Admin';
            if(document.getElementById('header-user-email')) document.getElementById('header-user-email').innerText = user.email;

            // Inicia monitores globais
            iniciarMonitoramentoPedidos();
            
            // RECUPERA A ÚLTIMA TELA ABERTA (Correção do F5)
            const ultimaTela = localStorage.getItem('painel_ultima_tela') || 'view-pdv-wrapper';
            navegarPara(ultimaTela);
        });
    });
    window.editarFuncaoUsuario = async (email, currentRole, nome) => {
        const newRole = prompt(`Alterar função de ${nome}.\nDigite: admin, gerente, caixa, cozinha ou entregador`, currentRole);
        
        if(newRole && newRole !== currentRole) {
            const validRoles = ['admin', 'gerente', 'caixa', 'cozinha', 'entregador'];
            if(!validRoles.includes(newRole.toLowerCase())) {
                return alert("Função inválida! Use: " + validRoles.join(", "));
            }

            try {
                await updateDoc(doc(db, "equipe", email), {
                    role: newRole.toLowerCase()
                });
                showToast("Sucesso", "Função atualizada!");
                renderizarEquipe();
            } catch(e) {
                console.error(e);
                alert("Erro ao atualizar função.");
            }
        }
    }
    // ===============================================
    // CONFIGURAÇÃO DE IMPRESSORAS E TICKETS
    // ===============================================

    // 1. Variável Global de Configuração de Impressão
    let printConfig = {
        width: '80mm',
        fontSize: '12px',
        copies: 1,
        autoPrint: false,
        logoUrl: '', // Agora armazenamos a URL da logo
        footerMsg: ''
    };

    // 2. Carregar Configurações do Banco
    window.carregarConfigImpressao = async () => {
        try {
            const docRef = doc(db, "config", "impressao");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                printConfig = docSnap.data();
                
                // 1. Papel (Radio Buttons)
                if(printConfig.width === '58mm') {
                    if(document.getElementById('print-58mm')) document.getElementById('print-58mm').checked = true;
                } else {
                    if(document.getElementById('print-80mm')) document.getElementById('print-80mm').checked = true;
                }

                // 2. Campos Simples
                if(document.getElementById('print-font-size')) document.getElementById('print-font-size').value = printConfig.fontSize || '12px';
                if(document.getElementById('print-copies')) {
                    document.getElementById('print-copies').value = printConfig.copies || 1;
                    document.getElementById('print-copies-display').innerText = printConfig.copies || 1;
                }
                if(document.getElementById('print-auto')) document.getElementById('print-auto').checked = printConfig.autoPrint || false;
                if(document.getElementById('print-footer-msg')) document.getElementById('print-footer-msg').value = printConfig.footerMsg || '';
                if(document.getElementById('print-footer-msg')) {
        document.getElementById('print-footer-msg').value = printConfig.footerMsg || '';
    }

                // 3. Lógica da Logo (Preview vs Upload)
                const placeholder = document.getElementById('logo-placeholder');
                const previewContainer = document.getElementById('logo-preview-container');
                const previewImg = document.getElementById('print-logo-preview');

                if (printConfig.logoUrl) {
                    // Tem logo salva
                    if(placeholder) placeholder.classList.add('hidden');
                    if(previewContainer) previewContainer.classList.remove('hidden');
                    if(previewImg) previewImg.src = printConfig.logoUrl;
                } else {
                    // Não tem logo
                    if(placeholder) placeholder.classList.remove('hidden');
                    if(previewContainer) previewContainer.classList.add('hidden');
                    if(previewImg) previewImg.src = '';
                }
            }
        } catch (e) {
            console.error("Erro ao carregar config impressão:", e);
        }
    }
    window.handleLogoUpload = async (input) => {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const placeholder = document.getElementById('logo-placeholder');
            
            // Feedback visual de carregamento
            placeholder.innerHTML = '<i class="fas fa-spinner fa-spin text-cyan-600 mb-2"></i><span class="text-xs font-bold text-gray-500">Enviando...</span>';

            try {
                // Upload para o Storage na pasta 'config/print_logo'
                const storageRef = ref(storage, `config/print_logo_${Date.now()}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                
                // Atualiza localmente e visualmente
                printConfig.logoUrl = url;
                
                // Atualiza UI
                document.getElementById('logo-placeholder').classList.add('hidden');
                document.getElementById('logo-preview-container').classList.remove('hidden');
                document.getElementById('print-logo-preview').src = url;
                
                // Restaura o placeholder original (caso remova depois)
                placeholder.innerHTML = `<div class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-2"><i class="fas fa-cloud-upload-alt text-cyan-600"></i></div><p class="text-xs font-bold text-gray-600">Clique para enviar a Logo</p><p class="text-[10px] text-gray-400">Ideal: Imagem P&B</p>`;

                showToast("Sucesso", "Logo enviada! Clique em SALVAR para confirmar.");

            } catch (error) {
                console.error("Erro upload logo:", error);
                showToast("Erro", "Falha ao enviar imagem.", true);
                // Restaura UI
                placeholder.innerHTML = `<div class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-2"><i class="fas fa-cloud-upload-alt text-cyan-600"></i></div><p class="text-xs font-bold text-gray-600">Clique para enviar a Logo</p><p class="text-[10px] text-gray-400">Erro no envio. Tente novamente.</p>`;
            }
        }
    }
    window.removerLogoImpressao = () => {
        printConfig.logoUrl = '';
        document.getElementById('logo-preview-container').classList.add('hidden');
        document.getElementById('logo-placeholder').classList.remove('hidden');
        document.getElementById('print-logo-input').value = ''; // Limpa o input file
    }

    // 3. Salvar Configurações
window.salvarConfigImpressao = async () => {
    const btn = document.querySelector('button[onclick="salvarConfigImpressao()"]');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;
    
    try {
        const width = document.querySelector('input[name="print-width"]:checked')?.value || '80mm';
        
        const data = {
            width: width,
            fontSize: document.getElementById('print-font-size').value,
            copies: parseInt(document.getElementById('print-copies').value),
            autoPrint: document.getElementById('print-auto').checked,
            logoUrl: document.getElementById('print-logo-preview').src, // Pega a URL do preview atual
            footerMsg: document.getElementById('print-footer-msg').value,
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, "config", "impressao"), data);
        printConfig = data; // Atualiza a variável na memória instantaneamente
        
        showToast("Sucesso", "Configurações salvas!");
    } catch (e) {
        showToast("Erro", "Falha ao salvar.", true);
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

    // 4. Ajustar Vias (Contador)
    window.ajustarVias = (delta) => {
        const input = document.getElementById('print-copies');
        const display = document.getElementById('print-copies-display');
        let val = parseInt(input.value) + delta;
        if(val < 1) val = 1;
        if(val > 5) val = 5; 
        input.value = val;
        display.innerText = val;
    }

    // 5. Função de Impressão Real (Injetando CSS dinâmico)
window.imprimirPedidoReal = (htmlCupom) => {
    let iframe = document.getElementById('print-frame');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-frame';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    
    // Configuração de Logo
    const logoHtml = printConfig.logoUrl 
        ? `<div style="text-align: center; margin-bottom: 5px;"><img src="${printConfig.logoUrl}" style="max-width: 40mm; height: auto;"></div>` 
        : '';

    doc.open();
    doc.write(`
        <html>
        <head>
            <style>
                @page { margin: 0; }
                body { 
                    font-family: 'Courier New', monospace; 
                    width: ${printConfig.width || '80mm'}; 
                    font-size: ${printConfig.fontSize || '12px'};
                    margin: 0; padding: 10px; color: black;
                }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                .info-loja { text-align: center; font-size: 0.9em; margin-bottom: 8px; line-height: 1.3; }
                .item-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .footer { margin-top: 15px; font-size: 0.85em; text-align: center; }
            </style>
        </head>
        <body>
            ${logoHtml}
            <div class="text-center font-bold" style="font-size: 1.3em;">TROPIBERRY</div>
            <div class="info-loja">
                Rua Ricardo Soares de Souza Neto, 456 - Gramame<br>
                Fone: (83) 92002-4786 | João Pessoa - PB<br>
                CNPJ: 58.335.245/0001-50
            </div>
            ${htmlCupom}
            ${printConfig.footerMsg ? `<div class="divider">--------------------------------</div><div class="footer">${printConfig.footerMsg}</div>` : ''}
            <div class="text-center">---   ---</div>
        </body>
        </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
    }, 800);
}
// 3. Atualize o salvarConfigImpressao para o botão funcionar
window.salvarConfigImpressao = async () => {
    const btn = document.querySelector('button[onclick="salvarConfigImpressao()"]');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;
    
    try {
        const width = document.querySelector('input[name="print-width"]:checked')?.value || '80mm';
        const data = {
            width: width,
            fontSize: document.getElementById('print-font-size').value,
            copies: parseInt(document.getElementById('print-copies').value),
            autoPrint: document.getElementById('print-auto').checked,
            logoUrl: document.getElementById('print-logo-preview').src,
            footerMsg: document.getElementById('print-footer-msg').value,
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, "config", "impressao"), data);
        printConfig = data; // Sincroniza em tempo real
        showToast("Sucesso", "Configurações salvas!");
    } catch (e) {
        showToast("Erro", "Falha ao salvar.", true);
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

    // 6. Teste de Impressão
    window.testarImpressao = () => {
        const html = `
            <div class="text-center font-bold" style="font-size: 1.2em">TESTE DE IMPRESSÃO</div>
            <div class="text-center">Largura: ${printConfig.width}</div>
            <div class="divider"></div>
            <div class="item-row"><span>Item Teste 1</span><span>R$ 10,00</span></div>
            <div class="item-row"><span>Item Teste 2</span><span>R$ 5,50</span></div>
            <div class="divider"></div>
            <div class="item-row font-bold"><span>TOTAL</span><span>R$ 15,50</span></div>
        `;
        imprimirPedidoReal(html);
    }   

    let ifoodToken = null;
    let ifoodPollingInterval = null;
    let ifoodMerchantId = null;
    window.carregarCredenciaisIfood = async () => {
        try {
            const docSnap = await getDoc(doc(db, "config", "ifood_api"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('ifood-client-id').value = data.clientId || '';
                document.getElementById('ifood-client-secret').value = data.clientSecret || '';
                document.getElementById('ifood-merchant-id').value = data.merchantId || '';
                
                // Se já tiver dados, tenta conectar automaticamente
                if (data.clientId && data.clientSecret) {
                    conectarAPIIfood(data.clientId, data.clientSecret, data.merchantId);
                }
            }
        } catch (e) { console.error("Erro config iFood:", e); }
    };
    window.salvarEConectarIfood = async () => {
        const clientId = document.getElementById('ifood-client-id').value.trim();
        const clientSecret = document.getElementById('ifood-client-secret').value.trim();
        const merchantId = document.getElementById('ifood-merchant-id').value.trim();

        if (!clientId || !clientSecret) return showToast("Erro", "Preencha Client ID e Secret.", true);

        const btn = document.querySelector('button[onclick="salvarEConectarIfood()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
        btn.disabled = true;

        try {
            // Salva as credenciais (CUIDADO: Em produção real, isso deveria ser criptografado no backend)
            await setDoc(doc(db, "config", "ifood_api"), {
                clientId, clientSecret, merchantId, updatedAt: serverTimestamp()
            });

            await conectarAPIIfood(clientId, clientSecret, merchantId);

        } catch (e) {
            console.error(e);
            showToast("Erro", "Falha ao salvar/conectar.", true);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
    async function conectarAPIIfood(clientId, clientSecret, merchantId) {
        ifoodMerchantId = merchantId;

        // URL Proxy para evitar erro de CORS em localhost/navegador (Obrigatório para testes sem backend)
        // Em produção real, você deve usar seu próprio servidor Node.js ou Firebase Functions
        const proxyUrl = "https://cors-anywhere.herokuapp.com/"; 
        const authUrl = "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token";

        try {
            const response = await fetch(proxyUrl + authUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grantType: 'client_credentials',
                    clientId: clientId,
                    clientSecret: clientSecret
                })
            });

            if (!response.ok) throw new Error("Falha na autenticação iFood. Verifique as credenciais.");

            const data = await response.json();
            ifoodToken = data.accessToken;

            // Sucesso Visual
            document.getElementById('ifood-login-area').classList.add('hidden');
            document.getElementById('ifood-connected-area').classList.remove('hidden');
            document.getElementById('ifood-status-badge').className = "bg-green-100 text-green-600 text-[10px] font-bold px-2 py-1 rounded border border-green-200 uppercase";
            document.getElementById('ifood-status-badge').innerText = "ONLINE";
            
            showToast("iFood Conectado", "Token de acesso gerado com sucesso!");

            // Inicia o ciclo de Polling (Busca de pedidos)
            iniciarPollingIfood();

        } catch (error) {
            console.error("Erro Auth iFood:", error);
            showToast("Erro de Conexão", "Não foi possível conectar ao iFood. Verifique o console.", true);
            // Dica para o usuário sobre o Proxy
            alert("Dica Técnica: Se deu erro de CORS, você precisa acessar 'cors-anywhere.herokuapp.com' e clicar em liberar acesso temporário, ou configurar um servidor backend.");
        }
    }
    function iniciarPollingIfood() {
        if (ifoodPollingInterval) clearInterval(ifoodPollingInterval);

        // Primeira execução imediata
        verificarEventosIfood();

        ifoodPollingInterval = setInterval(() => {
            verificarEventosIfood();
        }, 30000); // 30 segundos (Recomendado pelo iFood para evitar bloqueio)
    }
    async function verificarEventosIfood() {
        if (!ifoodToken) return;

        const proxyUrl = "https://cors-anywhere.herokuapp.com/";
        const pollingUrl = "https://merchant-api.ifood.com.br/order/v1.0/events:polling";

        try {
            // Atualiza horário da checagem na tela
            document.getElementById('ifood-last-check').innerText = new Date().toLocaleTimeString();

            const response = await fetch(proxyUrl + pollingUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${ifoodToken}` }
            });

            if (response.status === 204) return; // Nenhum evento novo

            const eventos = await response.json();
            
            // Filtra apenas eventos de "PEDIDO COLOCADO" (PLACED)
            const novosPedidos = eventos.filter(e => e.code === 'PLC');

            for (const evento of novosPedidos) {
                await baixarDetalhesPedidoIfood(evento.orderId);
            }

            // Se houver eventos, precisamos avisar o iFood que recebemos (Acknowledgment)
            if (eventos.length > 0) {
                await confirmarRecebimentoEventos(eventos);
            }

        } catch (error) {
            console.error("Erro no Polling:", error);
            // Se o token expirou (401), deveria renovar, mas por simplicidade vamos pedir reconexão
            if (error.message.includes("401")) {
                showToast("Sessão Expirada", "Reconectando ao iFood...");
                const data = await getDoc(doc(db, "config", "ifood_api"));
                if(data.exists()) conectarAPIIfood(data.data().clientId, data.data().clientSecret, data.data().merchantId);
            }
        }
    }async function baixarDetalhesPedidoIfood(orderId) {
        const proxyUrl = "https://cors-anywhere.herokuapp.com/";
        const detailsUrl = `https://merchant-api.ifood.com.br/order/v1.0/orders/${orderId}`;

        try {
            const response = await fetch(proxyUrl + detailsUrl, {
                headers: { 'Authorization': `Bearer ${ifoodToken}` }
            });
            const orderData = await response.json();

            // Converte o formato do iFood para o formato do seu sistema (TropyBerry)
            const novoPedido = {
                id: orderData.id, // Usa o ID do iFood
                method: 'delivery',
                origin: 'ifood', // Identificador visual
                status: 'Aguardando',
                customer: {
                    name: orderData.customer.name,
                    phone: orderData.customer.phone?.number || 'Não informado',
                    address: formatarEnderecoIfood(orderData.delivery?.deliveryAddress)
                },
                items: orderData.items.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    details: item.options ? item.options.map(o => o.name).join(', ') : ''
                })),
                total: orderData.total.orderAmount,
                createdAt: serverTimestamp(),
                paymentStatus: orderData.payments?.methods[0]?.type === 'ONLINE' ? 'paid' : 'pending'
            };

            // Salva na coleção 'pedidos' do Firebase
            // IMPORTANTE: Usamos setDoc com o ID do iFood para evitar duplicidade se o polling rodar 2x
            await setDoc(doc(db, "pedidos", orderData.id), novoPedido);

            showToast("Novo Pedido iFood!", `Cliente: ${novoPedido.customer.name} - R$ ${novoPedido.total}`);
            
            // Toca o som
            const sound = document.getElementById('notif-sound');
            if(sound) sound.play();

        } catch (e) {
            console.error("Erro ao baixar pedido iFood:", e);
        }
    }
    function formatarEnderecoIfood(addr) {
        if (!addr) return "Retirada ou Balcão";
        return `${addr.streetName}, ${addr.streetNumber} - ${addr.neighborhood} (${addr.reference || ''})`;
    }
    async function confirmarRecebimentoEventos(eventos) {
        const proxyUrl = "https://cors-anywhere.herokuapp.com/";
        const ackUrl = "https://merchant-api.ifood.com.br/order/v1.0/events/acknowledgment";
        
        const eventsToAck = eventos.map(e => ({ id: e.id }));

        await fetch(proxyUrl + ackUrl, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${ifoodToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventsToAck)
        });
    }
    // Substitua a função antiga por esta
    window.renderizarListaProdutos = () => {
        const container = document.getElementById('products-list-container');
        if (!container) return;
        container.innerHTML = '';

        allProducts.forEach(p => {
            const div = document.createElement('div');
            div.className = "bg-white border rounded-lg p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition";
            div.innerHTML = `
                <img src="${p.image || 'https://via.placeholder.com/100'}" class="w-16 h-16 rounded-lg object-cover bg-gray-100">
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800">${p.name}</h4>
                    <p class="text-xs text-gray-500 line-clamp-1">${p.description || 'Sem descrição'}</p>
                    <div class="mt-1 flex gap-2">
                        <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600 uppercase font-bold">${p.category}</span>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-cyan-700">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</p>
                    <button onclick="window.abrirModalEdicao('${p.id}')" class="text-xs text-blue-600 font-bold hover:underline">Editar</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

window.abrirModalNovoProduto = () => {
        // Preenche o select com as categorias puxadas do Firebase
        window.renderizarSeletorCategoriasModal(); 
        
        document.getElementById('form-produto').reset();
        document.getElementById('edit-id').value = '';
        document.getElementById('edit-image-url').value = '';
        document.getElementById('preview-image').classList.add('hidden');
        document.getElementById('icon-image').classList.remove('hidden');
        document.getElementById('modal-title').innerText = "Novo Produto";
        currentProductAttachedGroups = [];
        window.renderizarGruposVinculados();
        renderTagSelector();
        window.mudarAba('sobre');
        document.getElementById('product-modal').classList.remove('hidden');
    }

window.abrirModalEdicao = (id) => {
        const p = allProducts.find(x => x.id === id);
        if (!p) {
            window.showToast("Erro", "Produto não encontrado na memória.", true);
            return;
        }

        // Popula as categorias e já deixa selecionada a do produto
        window.renderizarSeletorCategoriasModal(p.category);
        
        // Preenche os inputs
        document.getElementById('edit-id').value = p.id;
        document.getElementById('edit-name').value = p.name;
        document.getElementById('edit-price').value = p.price;
        // Adiciona preenchimento para preço original caso exista no banco
        if(document.getElementById('edit-original-price')) document.getElementById('edit-original-price').value = p.originalPrice || '';
        document.getElementById('edit-desc').value = p.description || '';
        document.getElementById('edit-image-url').value = p.image || '';
        
        // Tratamento da Imagem
        if(p.image) {
            document.getElementById('preview-image').src = p.image;
            document.getElementById('preview-image').classList.remove('hidden');
            document.getElementById('icon-image').classList.add('hidden');
        } else {
            document.getElementById('preview-image').src = '';
            document.getElementById('preview-image').classList.add('hidden');
            document.getElementById('icon-image').classList.remove('hidden');
        }

        renderTagSelector();
        setSelectedTags(p.tags || []);

        currentProductAttachedGroups = p.complementIds || []; // <--- ADICIONE ESTA LINHA
        window.renderizarGruposVinculados(); // <--- E ESTA LINHA
        
        document.getElementById('modal-title').innerText = "Editar Produto";
        
        // CRÍTICO: Garante que o modal abra sempre na primeira aba, evitando travamentos
        window.mudarAba('sobre'); 
        
        document.getElementById('product-modal').classList.remove('hidden');
    }
window.salvarProduto = async function() {
        const id = document.getElementById('edit-id').value;
        const produto = {
            name: document.getElementById('edit-name').value,
            price: parseFloat(document.getElementById('edit-price').value) || 0,
            originalPrice: parseFloat(document.getElementById('edit-original-price')?.value) || 0,
            description: document.getElementById('edit-desc').value,
            image: document.getElementById('edit-image-url').value,
            tags: getSelectedTags(),
            complementIds: currentProductAttachedGroups, // Sincroniza os complementos com o banco
            updatedAt: serverTimestamp()
        };
        try {
            if (id) {
                await updateDoc(doc(db, "produtos", id), produto);
                window.showToast("Sucesso", "Produto atualizado!");
            } else {
                await addDoc(collection(db, "produtos"), produto);
                window.showToast("Sucesso", "Produto criado!");
            }
            document.getElementById('product-modal').classList.add('hidden');
        } catch (e) {
            window.showToast("Erro", "Falha ao salvar", true);
        }
    }
    // --- CONTROLES DO MODAL DE PRODUTO ---
    
    window.fecharModalProduto = () => {
        document.getElementById('product-modal').classList.add('hidden');
    };

    window.mudarAba = (aba) => {
        // 1. Esconde as duas áreas de conteúdo
        document.getElementById('tab-sobre').classList.add('hidden');
        document.getElementById('tab-complementos').classList.add('hidden');
        
        // 2. Reseta o estilo dos dois botões para o padrão inativo
        document.getElementById('tab-btn-sobre').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition";
        document.getElementById('tab-btn-complementos').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition";

        // 3. Ativa a aba e o botão correspondente
        if (aba === 'sobre') {
            document.getElementById('tab-sobre').classList.remove('hidden');
            document.getElementById('tab-btn-sobre').className = "flex-1 py-3 text-sm font-bold text-cyan-700 border-b-2 border-cyan-700 bg-cyan-50 transition";
        } else {
            document.getElementById('tab-complementos').classList.remove('hidden');
            document.getElementById('tab-btn-complementos').className = "flex-1 py-3 text-sm font-bold text-cyan-700 border-b-2 border-cyan-700 bg-cyan-50 transition";
        }
    };

    window.abrirGerenciadorGrupos = () => {
        document.getElementById('group-manager-modal').classList.remove('hidden');
    };

    window.deletarProduto = async () => {
        const id = document.getElementById('edit-id').value;
        if(!id) return;
        
        if(confirm("Tem certeza que deseja excluir este produto do cardápio? Essa ação não tem volta.")) {
            try {
                // A função deleteDoc e doc já estão importadas no topo do seu arquivo
                await deleteDoc(doc(db, "produtos", id));
                window.showToast("Sucesso", "Produto excluído com sucesso!");
                window.fecharModalProduto();
            } catch (e) {
                console.error("Erro ao deletar produto:", e);
                window.showToast("Erro", "Falha ao excluir produto.", true);
            }
        }
    };
    window.editarPedidoManual = (orderId) => {
        const order = allOrders.find(o => o.id === orderId);
        if (!order) return;

        // Carrega os dados para o estado do PDV
        currentTablePOS = order.tableNumber || "Balcão";
        currentTableOrder = [...order.items]; // Copia os itens para o carrinho
        
        // Abre a tela do PDV
        window.navegarPara('view-pos');
        window.renderizarCategoriasPOS();
        window.renderizarProdutosPOS();
        window.atualizarComandaPDV();
        
        // Altera o comportamento do botão de envio para ATUALIZAR em vez de criar novo
        const btnEnvio = document.querySelector('[onclick="confirmarPedidoMesa()"]');
        btnEnvio.innerHTML = `<i class="fas fa-save"></i> ATUALIZAR PEDIDO #${orderId.slice(-4)}`;
        btnEnvio.onclick = async () => {
            const total = currentTableOrder.reduce((acc, i) => acc + (i.price * i.quantity), 0);
            await updateDoc(doc(db, "pedidos", orderId), {
                items: currentTableOrder,
                total: total,
                updatedAt: serverTimestamp()
            });
            window.showToast("Sucesso", "Pedido atualizado!");
            fecharMesaPDV();
            // Restaura o botão original
            btnEnvio.innerHTML = `<i class="fas fa-paper-plane"></i> ENVIAR PARA COZINHA`;
            btnEnvio.onclick = confirmarPedidoMesa;
        };
    }
    window.abrirSimuladorMobile = function() {
        const modal = document.getElementById('modal-simulador-mobile');
        const iframe = document.getElementById('iframe-mobile');
        
        if (modal && iframe) {
            // Define a URL apenas ao abrir para recarregar o conteúdo
            iframe.src = 'index.html'; 
            
            modal.classList.remove('hidden');
            modal.classList.add('flex'); // Garante flex para centralizar
            document.body.style.overflow = 'hidden'; // Trava o scroll do dashboard
        }
    }

    // Função para fechar o simulador
    window.fecharSimuladorMobile = function() {
        const modal = document.getElementById('modal-simulador-mobile');
        const iframe = document.getElementById('iframe-mobile');
        
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            
            // Limpa o src para parar vídeos ou sons se houver
            if(iframe) iframe.src = '';
            
            document.body.style.overflow = ''; // Destrava o scroll
        }
    }
    window.prepararModalEntrega = async () => {
        // 1. Garante que temos os dados mais recentes
        try {
            const docSnap = await getDoc(doc(db, "config", "pedidos"));
            if (docSnap.exists()) {
                configEntregaAtual = docSnap.data();
            }
        } catch (e) {
            console.error("Erro ao buscar config:", e);
            return;
        }

        const mode = configEntregaAtual.deliveryMode || 'free'; // Padrão 'free' se não tiver
        const districts = configEntregaAtual.deliveryDistricts || [];
        
        // 2. Atualiza a seleção visual dos CARDS
        document.querySelectorAll('.delivery-option-card').forEach(card => {
            card.classList.remove('selected');
            // Verifica se o card tem o onclick correspondente ao modo salvo
            if (card.getAttribute('onclick').includes(`'${mode}'`)) {
                card.classList.add('selected');
                // Garante que o dataset esteja correto para o botão Salvar funcionar
                card.dataset.selectedType = mode; 
            }
        });

        // 3. Atualiza a variável global de controle
        window.currentDeliveryMode = mode;
        window.localBairros = districts; // Carrega os bairros salvos para a memória local de edição

        // 4. Se for modo 'district' ou 'fixed', mostra os inputs correspondentes
        document.getElementById('modal-fixed-price').classList.add('hidden');
        document.getElementById('modal-neighborhood-price').classList.add('hidden');

        if (mode === 'fixed') {
            // Preenche o input de preço fixo se houver
            if(document.getElementById('input-fixed-price')) {
                document.getElementById('input-fixed-price').value = configEntregaAtual.deliveryFixedPrice || 0;
            }
        } 
        else if (mode === 'district') {
            // Não abrimos o modal interno automaticamente, mas populamos a lista caso o usuário clique em editar
            renderListaBairros(); 
        }
        
        // Atualiza o texto do Label principal
        window.atualizarLabelPrecoDelivery(mode);
    };
    window.abrirModalConfigEntrega = async () => {
        // Primeiro carrega os dados
        await prepararModalEntrega();
        // Depois mostra o modal
        document.getElementById('delivery-settings-modal').classList.remove('hidden');
    }



    window.desconectarIfood = () => {
        ifoodToken = null;
        if (ifoodPollingInterval) clearInterval(ifoodPollingInterval);
        document.getElementById('ifood-connected-area').classList.add('hidden');
        document.getElementById('ifood-login-area').classList.remove('hidden');
        document.getElementById('ifood-status-badge').innerText = "Offline";
        document.getElementById('ifood-status-badge').className = "bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded border border-gray-200 uppercase";
    }
    // Função que abre a tela de pedidos da mesa
    window.abrirMesaPDV = (numero) => {
        console.log("Abrindo PDV para Mesa:", numero);
        currentTablePOS = numero;
        
        // 1. Procura o pedido ativo desta mesa
        const activeOrder = allOrders.find(o => 
            o.method === 'mesa' && 
            parseInt(o.tableNumber) === parseInt(numero) && 
            !['Finalizado', 'Rejeitado', 'Cancelado'].includes(o.status)
        );

        // 2. Atualiza o título na lateral (ex: Mesa 01)
        const titleEl = document.getElementById('pos-table-title');
        if(titleEl) titleEl.innerText = `Mesa ${numero}`;
        
        // 3. Carrega itens se já houver pedido, ou limpa a comanda
        currentTableOrder = (activeOrder && activeOrder.items) ? [...activeOrder.items] : [];
        
        // 4. RESET de filtros para abrir a mesa sempre com tudo visível
        categoriaAtivaPOS = 'todos';
        const searchInput = document.getElementById('pos-search');
        if(searchInput) searchInput.value = '';

        // 5. NAVEGAÇÃO E RENDERIZAÇÃO (O segredo para não dar tela branca)
        window.navegarPara('view-pos'); 
        window.renderizarCategoriasPOS(); // Desenha as abas (Açaís, Combos, etc)
        window.renderizarProdutosPOS();   // Desenha os cards dos produtos
        window.atualizarComandaPDV();     // Desenha o carrinho/lista lateral
    };
    window.renderizarCategoriasPOS = () => {
        const container = document.getElementById('pos-categories');
        if (!container) return;

        // Criamos uma lista de categorias únicas baseada nos produtos que você tem
        const categorias = ['todos', ...new Set(allProducts.map(p => p.category).filter(c => c))];

        container.innerHTML = categorias.map(cat => `
            <button onclick="window.filtrarPorCategoriaPOS('${cat}')" 
                class="px-5 py-2 rounded-full text-xs font-bold transition whitespace-nowrap shadow-sm border ${categoriaAtivaPOS === cat ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}">
                ${cat.toUpperCase()}
            </button>
        `).join('');
    };

    // Função para filtrar produtos ao clicar na categoria
    window.filtrarPorCategoriaPOS = (cat) => {
        categoriaAtivaPOS = cat;
        window.renderizarCategoriasPOS();
        window.renderizarProdutosPOS();
    };
    // Função para voltar das mesas para o painel
    window.fecharMesaPDV = () => {
        currentTablePOS = null;
        currentTableOrder = [];
        navegarPara('view-pdv-wrapper');
    };
    window.changePosQtd = (idx, delta) => {
        if(!currentTableOrder[idx]) return;
        currentTableOrder[idx].quantity += delta;
        if(currentTableOrder[idx].quantity <= 0) currentTableOrder.splice(idx, 1);
        window.atualizarComandaPDV();
    };

    window.atualizarComandaPDV = () => {
    const container = document.getElementById('pos-order-items');
    const totalEl = document.getElementById('pos-total');
    const subtotalEl = document.getElementById('pos-subtotal');
    const taxEl = document.getElementById('pos-tax');

    if(!container) return;
    
    container.innerHTML = '';
    let subtotal = 0;

    currentTableOrder.forEach((item, idx) => {
        subtotal += (item.price * item.quantity);
        container.innerHTML += `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2 border">
                <div class="flex-1">
                    <p class="text-xs font-bold text-gray-800">${item.name}</p>
                    <p class="text-[10px] text-cyan-600">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="window.changePosQtd(${idx}, -1)" class="w-7 h-7 bg-white border rounded text-red-500 hover:bg-red-50 font-bold">-</button>
                    <span class="text-xs font-bold w-4 text-center">${item.quantity}</span>
                    <button onclick="window.changePosQtd(${idx}, 1)" class="w-7 h-7 bg-white border rounded text-green-500 hover:bg-green-50 font-bold">+</button>
                </div>
            </div>
        `;
    });

    // Calcula 10% e o Total Final
    const taxaServico = subtotal * 0.10; 
    const total = subtotal + taxaServico;

    // Joga os valores na tela
    if(subtotalEl) subtotalEl.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if(taxEl) taxEl.innerText = `R$ ${taxaServico.toFixed(2).replace('.', ',')}`;
    if(totalEl) totalEl.innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;

    // SALVAMENTO AUTOMÁTICO NO BANCO (Mata o problema de sair e voltar)
    window.salvarComandaNoBanco(subtotal, taxaServico, total);
};
    window.renderizarProdutosPOS = (filtroTexto = '') => {
        const container = document.getElementById('pos-products-grid');
        if (!container) return;

        if (allProducts.length === 0) {
            container.innerHTML = '<p class="p-8 text-gray-400 text-sm text-center col-span-full">Nenhum produto cadastrado...</p>';
            return;
        }

        // Filtra por Categoria E por Texto da busca simultaneamente
        let filtrados = allProducts.filter(p => {
            const matchesTexto = p.name?.toLowerCase().includes(filtroTexto.toLowerCase());
            const matchesCategoria = categoriaAtivaPOS === 'todos' || p.category === categoriaAtivaPOS;
            return matchesTexto && matchesCategoria;
        });

        container.innerHTML = filtrados.map(p => `
            <div onclick="window.adicionarAoPedidoPOS('${p.id}')" 
                class="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col items-center text-center group active:scale-95">
                <div class="relative w-20 h-20 mb-2">
                    <img src="${p.image || 'img/placeholder.png'}" class="w-full h-full object-cover rounded-xl shadow-inner bg-gray-50">
                </div>
                <p class="text-[11px] font-bold text-gray-800 line-clamp-2 h-8 leading-tight">${p.name || 'Sem nome'}</p>
                <p class="text-xs font-black text-cyan-700 mt-1">R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}</p>
            </div>
        `).join('');
    };
    window.adicionarAoPedidoPOS = (id) => {
        const p = allProducts.find(x => x.id === id);
        if (!p) return;

        const existe = currentTableOrder.find(item => item.id === id);
        if (existe) {
            existe.quantity++;
        } else {
            currentTableOrder.push({
                id: p.id,
                name: p.name,
                price: parseFloat(p.price),
                quantity: 1,
                details: ''
            });
        }
        window.atualizarComandaPDV();
    };

    window.filtrarProdutosPOS = () => {
        const busca = document.getElementById('pos-search').value;
        window.renderizarProdutosPOS(busca);
    };
    // Função que prepara os dados do pedido para a impressora real
  let htmlCupomTemporario = "";

window.imprimirPedidoDash = (orderId) => {
        // Busca o pedido na lista global
        const order = allOrders.find(o => o.id === orderId);
        
        // Se não achar pelo ID direto, tenta buscar pelo ID curto (últimos 4 caracteres)
        const orderFallback = order || allOrders.find(o => o.id.slice(-4).toUpperCase() === orderId.toUpperCase());

        if (!orderFallback) {
            console.error("ID Buscado:", orderId, "Pedidos em memória:", allOrders);
            return window.showToast("Erro", "Pedido não encontrado", true);
        }

        const subtotal = orderFallback.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        const taxaEntrega = (orderFallback.total || 0) - subtotal;

        // Gera as linhas dos itens detalhadas e estruturadas
        const itensHtml = orderFallback.items.map(item => {
            let baseName = item.name;
            let extras = [];

            // 1. Se vier com detalhes separados (padrão iFood/App)
            if (item.details && item.details.trim() !== '') {
                extras = item.details.split(',').map(e => e.trim());
            } 
            // 2. Se os adicionais estiverem embutidos no nome entre parênteses (padrão PDV Manual)
            else if (item.name.includes('(') && item.name.includes(')')) {
                const startIdx = item.name.indexOf('(');
                const endIdx = item.name.lastIndexOf(')');
                baseName = item.name.substring(0, startIdx).trim();
                const extrasText = item.name.substring(startIdx + 1, endIdx);
                extras = extrasText.split(',').map(e => e.trim());
            }

            return `
                <div class="item-row" style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                    <span style="flex: 1;">${item.quantity}x ${baseName}</span>
                    <span style="margin-left: 10px;">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                </div>
                ${extras.length ? `
                    <div style="margin-left: 12px; font-size: 0.9em; color: #333; margin-bottom: 6px; line-height: 1.4;">
                        ${extras.map(ex => `
                            <div style="display: flex; justify-content: space-between; padding-left: 4px;">
                                <span>↳ ${ex}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
        }).join('');

        // Monta o esqueleto do cupom com o título alterado para CUPOM FISCAL
        htmlCupomTemporario = `
            <div style="text-align: center; font-weight: bold; font-size: 1.4em; margin-bottom: 5px;">TROPIBERRY</div>
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 10px; font-weight: bold;">CUPOM FISCAL</div>
            <div style="display: flex; justify-content: space-between;"><b>PEDIDO:</b> <span>#${orderFallback.id.slice(-4).toUpperCase()}</span></div>
            <div style="display: flex; justify-content: space-between;"><b>DATA:</b> <span>${orderFallback.createdAt ? orderFallback.createdAt.toDate().toLocaleString('pt-BR') : '--'}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 5px 0;"></div>
            <div style="margin-bottom: 5px;"><b>CLIENTE:</b> ${orderFallback.customer?.name || 'N/I'}</div>
            <div style="margin-bottom: 5px;"><b>END:</b> ${orderFallback.customer?.address || 'Retirada'}</div>

${orderFallback.scheduled ? `
    <div style="margin-bottom: 5px; font-weight: bold; color: #ea580c; text-transform: uppercase;">
        AGENDAMENTO: ${orderFallback.scheduled}
    </div>
` : ''}

<div style="border-bottom: 1px dashed #000; margin: 5px 0;"></div>
            <div style="font-weight: bold; margin-bottom: 8px;">ITENS:</div>
            ${itensHtml}
            <div style="border-bottom: 1px solid #000; margin: 8px 0;"></div>
            <div style="display: flex; justify-content: space-between;"><span>SUBTOTAL</span> <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>TAXA</span> <span>${taxaEntrega > 0 ? `R$ ${taxaEntrega.toFixed(2).replace('.', ',')}` : 'GRÁTIS'}</span></div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em; margin-top: 5px;">
                <span>TOTAL</span> <span>R$ ${orderFallback.total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
            <div style="text-align: center;"><b>PGTO:</b> ${orderFallback.paymentMethod?.toUpperCase() || 'A DEFINIR'}</div>
        `;

        // Se estiver no celular, abre a TELA AZUL
        if (window.innerWidth < 768) {
            document.getElementById('conteudo-recibo-mobile').innerHTML = htmlCupomTemporario;
            document.getElementById('modal-cupom-mobile').classList.remove('hidden');
        } else {
            // Se estiver no PC, imprime direto
            window.imprimirPedidoReal(htmlCupomTemporario);
        }
    };

    // Função para fechar a tela azul
    window.fecharCupomMobile = () => {
        document.getElementById('modal-cupom-mobile').classList.add('hidden');
    };

    // Função que o BOTÃO AMARELO chama
    window.executarImpressaoFinal = () => {
        window.imprimirPedidoReal(htmlCupomTemporario);
    };
    // =========================================================
    // MÓDULO DE MARKETING ÚNICO E LIMPO
    // =========================================================

    let marketingListenerActive = false;

    window.iniciarMonitorMarketing = () => {
        if(marketingListenerActive) return; 
        marketingListenerActive = true;

        // 1. MONITOR DE CUPONS
        onSnapshot(collection(db, "marketing_cupons"), (snapshot) => {
            const cupons = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const container = document.getElementById('coupons-container');
            if (container) {
                if(cupons.length === 0) {
                    container.innerHTML = '<p class="text-gray-400 p-4 text-sm">Nenhum cupom ativo no momento.</p>';
                } else {
                    container.innerHTML = cupons.map(c => {
                        let valorBadge = '';
                        if(c.tipo === 'fixo') valorBadge = `R$ ${parseFloat(c.valor || 0).toFixed(2)} OFF`;
                        else if(c.tipo === 'porcentagem') valorBadge = `${c.valor}% OFF`;
                        else if(c.tipo === 'frete') {
                            valorBadge = `FRETE GRÁTIS`;
                            if (c.kmLimit > 0) valorBadge += ` (Até ${c.kmLimit}km)`;
                        }

                        return `
                        <div class="group relative bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden p-6 ${c.ativo ? '' : 'opacity-50 grayscale'}">
                            <div class="ticket-notch notch-left"></div>
                            <div class="ticket-notch notch-right"></div>
                            <div class="flex items-center gap-4">
                                <div class="bg-cyan-600 w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg shrink-0">🎟️</div>
                                <div class="flex-1 overflow-hidden">
                                    <h3 class="font-black text-cyan-900 text-xl leading-none truncate">${c.titulo || c.title || 'Cupom'}</h3>
                                    <p class="text-gray-500 text-[10px] mt-1 line-clamp-2">${c.descricao || c.desc || 'Desconto'}</p>
                                    <p class="text-cyan-700 text-[10px] font-bold mt-1 bg-cyan-50 inline-block px-2 py-0.5 rounded">Mínimo: R$ ${parseFloat(c.min || 0).toFixed(2)}</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input type="checkbox" ${c.ativo ? 'checked' : ''} onchange="window.toggleStatusMarketing('marketing_cupons', '${c.id}', ${c.ativo})" class="sr-only peer">
                                    <div class="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                                </label>
                            </div>
                            <div class="mt-6 pt-4 border-t border-dashed flex justify-between items-center">
                                <span class="font-mono font-black text-cyan-600 tracking-tighter bg-cyan-50 px-3 py-1 rounded-lg">${c.code || c.id}</span>
                                    <span class="font-black text-orange-500 text-sm whitespace-nowrap">${valorBadge}</span>
    
                                <div class="flex gap-2">
                                    <button onclick="window.prepararEdicaoCupom('${c.id}')" class="text-blue-500 hover:text-blue-700 text-[10px] font-bold bg-blue-50 px-2 py-1 rounded transition">EDITAR</button>
                                    <button onclick="window.deletarItemMarketing('marketing_cupons', '${c.id}')" class="text-red-400 hover:text-red-600 text-[10px] font-bold bg-red-50 px-2 py-1 rounded transition">EXCLUIR</button>
                                </div>
                            </div>
                        </div>
                    `}).join('');
                }
            }
        });

        // 2. MONITOR DE DESTAQUES (BANNERS)
        onSnapshot(collection(db, "marketing_banners"), (snapshot) => {
            const banners = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const container = document.getElementById('banners-container');
            if (container) {
                if(banners.length === 0) {
                    container.innerHTML = `
                        <div class="w-full bg-orange-50 border-2 border-dashed border-orange-200 rounded-2xl p-6 text-center">
                            <p class="text-orange-600 font-bold mb-2">Nenhum destaque criado no banco de dados.</p>
                            <button onclick="window.gerarBannersPadrao()" class="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-600 transition shadow-lg">
                                GERAR BANNERS DO SITE AGORA
                            </button>
                        </div>
                    `;
                } else {
                    container.innerHTML = banners.map(b => `
                        <div class="min-w-[280px] w-80 h-40 rounded-2xl bg-gradient-to-br ${b.gradient || 'from-cyan-600 to-cyan-900'} relative overflow-hidden shadow-lg shrink-0 group ${b.ativo ? '' : 'opacity-50 grayscale'}">
                            <div class="absolute right-0 bottom-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                            <img src="${b.img}" class="absolute right-[-20px] bottom-[-20px] w-36 h-36 object-contain drop-shadow-2xl opacity-90 group-hover:scale-110 transition-transform">
                            
                            <div class="relative z-10 p-5 h-full flex flex-col justify-between">
                                <div>
                                    <span class="bg-yellow-400 text-cyan-950 text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm">${b.tag || 'DESTAQUE'}</span>
                                    <h3 class="text-xl font-black text-white leading-tight mt-2 italic uppercase tracking-tighter">${b.title}</h3>
                                    <p class="text-cyan-100 text-xs font-medium leading-tight max-w-[60%]">${b.subtitle}</p>
                                </div>
                                <div class="flex gap-2">
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" ${b.ativo ? 'checked' : ''} onchange="window.toggleStatusMarketing('marketing_banners', '${b.id}', ${b.ativo})" class="sr-only peer">
                                        <div class="w-7 h-4 bg-white/30 rounded-full peer peer-checked:bg-green-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                                    </label>
                                    <button onclick="window.deletarItemMarketing('marketing_banners', '${b.id}')" class="text-white/50 hover:text-red-400 transition"><i class="fas fa-trash text-xs"></i></button>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        });
    };

    window.gerarBannersPadrao = async () => {
        try {
            await addDoc(collection(db, "marketing_banners"), {
                title: "Clube do Açaí", subtitle: "Peça 10 e ganhe 1 grátis", tag: "FIDELIDADE",
                gradient: "from-cyan-600 to-cyan-900", img: "img/logo1.png", ativo: true, createdAt: serverTimestamp()
            });
            await addDoc(collection(db, "marketing_banners"), {
                title: "Combo Casal", subtitle: "Açaí em dobro com desconto", tag: "OFERTÃO",
                gradient: "from-yellow-400 to-orange-600", img: "img/principal2.png", ativo: true, createdAt: serverTimestamp()
            });
            window.showToast("Sucesso", "Destaques gerados com sucesso!");
        } catch(e) { 
            console.error(e); 
            alert("🚨 ERRO FIREBASE: " + e.message); // Dedo-duro ativado
            window.showToast("Erro", "Olhe o alerta na tela.", true); 
        }
    };

    window.criarNovoDestaque = async () => {
        const nome = prompt("Digite o Título do Novo Destaque (Ex: Promoção de Inverno):");
        if(!nome) return;
        try {
            await addDoc(collection(db, "marketing_banners"), {
                title: nome, subtitle: "Nova Promoção", tag: "NOVIDADE",
                gradient: "from-blue-600 to-blue-900", img: "img/logo1.png",
                ativo: true, createdAt: serverTimestamp()
            });
            window.showToast("Sucesso", "Novo destaque adicionado!");
        } catch(e) { 
            console.error(e); 
            alert("🚨 ERRO FIREBASE: " + e.message); 
            window.showToast("Erro", "Olhe o alerta na tela.", true); 
        }
    };

    window.criarNovoCupom = () => {
        document.getElementById('modal-novo-cupom').classList.remove('hidden');
        document.getElementById('cupom-codigo').value = '';
        document.getElementById('cupom-titulo').value = '';
        document.getElementById('cupom-desc').value = '';
        document.getElementById('cupom-tipo').value = 'fixo';
        document.getElementById('cupom-valor').value = '';
        document.getElementById('cupom-minimo').value = '';
        document.getElementById('cupom-km').value = ''; 
        window.mudarTipoCupom();
    };

    window.mudarTipoCupom = () => {
        const tipo = document.getElementById('cupom-tipo').value;
        const inputValor = document.getElementById('cupom-valor');
        const labelValor = document.getElementById('label-cupom-valor');
        const freteOpcoes = document.getElementById('cupom-frete-opcoes');

        if(tipo === 'frete') {
            inputValor.value = '0';
            inputValor.disabled = true;
            inputValor.classList.add('bg-gray-100', 'opacity-50');
            freteOpcoes.classList.remove('hidden'); 
        } else {
            inputValor.disabled = false;
            inputValor.classList.remove('bg-gray-100', 'opacity-50');
            labelValor.innerText = tipo === 'fixo' ? 'Valor do Desconto (R$)' : 'Porcentagem (%)';
            freteOpcoes.classList.add('hidden'); 
        }
    };

    window.salvarNovoCupom = async () => {
        const code = document.getElementById('cupom-codigo').value.trim().toUpperCase();
        const titulo = document.getElementById('cupom-titulo').value.trim();
        const desc = document.getElementById('cupom-desc').value.trim();
        const tipo = document.getElementById('cupom-tipo').value;
        const valor = parseFloat(document.getElementById('cupom-valor').value) || 0;
        const min = parseFloat(document.getElementById('cupom-minimo').value) || 0;
        const kmLimit = parseFloat(document.getElementById('cupom-km').value) || 0;
        
        // 1. ELE ADICIONA ESSA LINHA AQUI:
        const cupomEhSecreto = document.getElementById('cupom-secreto')?.checked || false;

        if(!code || !titulo) return window.showToast("Atenção", "Preencha o código e o título.", true);

        const btn = document.querySelector('#modal-novo-cupom button.bg-cyan-600');
        const txtOrg = btn ? btn.innerText : 'CRIAR CUPOM';
        if(btn) { btn.innerText = 'SALVANDO...'; btn.disabled = true; }

        const editId = document.getElementById('cupom-edit-id')?.value;
        const cupomData = {
            code: code, titulo: titulo, descricao: desc, tipo: tipo,
            valor: valor, min: min, kmLimit: tipo === 'frete' ? kmLimit : 0, 
            ativo: true, secreto: cupomEhSecreto 
        };

        try {
            if (editId) {
                // ATUALIZA O EXISTENTE
                await updateDoc(doc(db, "marketing_cupons", editId), cupomData);
                window.showToast("Sucesso", "Cupom atualizado!");
            } else {
                // CRIA UM NOVO
                cupomData.createdAt = serverTimestamp();
                await addDoc(collection(db, "marketing_cupons"), cupomData);
                window.showToast("Sucesso", "Cupom criado com sucesso!");
            }
            document.getElementById('modal-novo-cupom').classList.add('hidden');
        } catch (e) {
            console.error("Erro ao criar cupom:", e);
            alert("🚨 ERRO FIREBASE: " + e.message); // Dedo-duro ativado
            window.showToast("Erro", "Olhe o alerta na tela.", true);
        } finally {
            if(btn) { btn.innerText = txtOrg; btn.disabled = false; }
        }
    };

    window.toggleStatusMarketing = async (colecao, id, statusAtual) => {
        try { await updateDoc(doc(db, colecao, id), { ativo: !statusAtual }); } catch(e) { console.error(e); }
    };

window.deletarItemMarketing = async (colecao, id) => {
    const t = document.getElementById('toast');
    const tTitle = document.getElementById('toast-title');
    const tMsg = document.getElementById('toast-msg');

    if (!t || !tTitle || !tMsg) return;

    // Configura o toast como aviso (amarelo)
    tTitle.innerText = "Confirmar Exclusão";
    tMsg.innerHTML = `
        <div class="mt-2 text-gray-700 text-xs mb-3">Tem certeza que deseja excluir permanentemente este item?</div>
        <div class="flex gap-2">
            <button id="btn-toast-sim" class="bg-red-600 text-white px-3 py-1 rounded font-bold text-[10px]">SIM</button>
            <button id="btn-toast-nao" class="bg-gray-200 text-gray-700 px-3 py-1 rounded font-bold text-[10px]">CANCELAR</button>
        </div>
    `;
    t.className = `fixed top-4 right-4 z-[100] shadow-2xl rounded px-4 py-3 animate-fade-in-up border-l-4 bg-white border-yellow-500 text-gray-800`;
    t.classList.remove('hidden');

    // Ações dos botões
    document.getElementById('btn-toast-sim').onclick = async () => {
        t.classList.add('hidden');
        try {
            await deleteDoc(doc(db, colecao, id));
            window.showToast("Sucesso", "Item excluído com sucesso!");
        } catch(e) {
            console.error(e);
            window.showToast("Erro", "Falha ao excluir.", true);
        }
    };

    document.getElementById('btn-toast-nao').onclick = () => {
        t.classList.add('hidden');
    };
};

    window.voltarParaListaDeMesas = () => {
    // Usa a navegação existente para voltar para a tela de PDV principal (onde as mesas ficam)
    window.navegarPara('view-pdv-wrapper'); 
};

// No dashboard.js
window.abrirMesaParaPedido = (numeroMesa) => {
    // Define qual mesa está sendo editada
    window.currentTablePOS = numeroMesa;

    // Atualiza os títulos no HTML novo
    document.getElementById('current-table-number-title').innerText = numeroMesa;

    // Limpa a comanda e prepara para novos itens (mude isso conforme sua lógica de dados)
    // updateOrderDOM(); 

    // Navega para a tela que acabamos de criar
    window.navegarPara('view-pos');
};

// =========================================================
// NOVAS FUNÇÕES DO PDV DAS MESAS
// =========================================================

// 1. O SALVAMENTO AUTOMÁTICO DA MESA
// 1. O SALVAMENTO AUTOMÁTICO DA MESA (COM CORREÇÃO DE MESA LIVRE)
let timeoutSalvar;
window.salvarComandaNoBanco = (subtotal, taxaServico, total) => {
    clearTimeout(timeoutSalvar);
    timeoutSalvar = setTimeout(async () => {
        if (!currentTablePOS) return; 

        // Descobre se é uma mesa real ou um pedido manual (Balcão/Delivery)
        const isMesaReal = !isNaN(currentTablePOS);
        const metodoVenda = isMesaReal ? 'mesa' : (currentTablePOS.includes('DELIVERY') ? 'delivery' : 'retirada');

        const existingOrder = allOrders.find(o => 
            o.method === metodoVenda && 
            o.tableNumber == currentTablePOS && 
            !['Finalizado', 'Rejeitado', 'Cancelado'].includes(o.status)
        );

        // A MÁGICA DA MESA LIVRE AQUI:
        // Se a comanda ficou vazia e existia um pedido, a gente DELETA o pedido do banco!
        // Assim o sistema entende que a mesa esvaziou e muda a cor dela pra Livre.
        if (currentTableOrder.length === 0) {
            if (existingOrder) {
                try {
                    await deleteDoc(doc(db, "pedidos", existingOrder.id));
                    console.log("Mesa esvaziada! Pedido deletado.");
                } catch (e) { console.log("Erro ao liberar mesa:", e); }
            }
            return; // Para o código aqui pra ele não criar um pedido zerado de novo
        }

        // Se tem itens e já existia pedido -> ATUALIZA
        if (existingOrder) {
            try {
                await updateDoc(doc(db, "pedidos", existingOrder.id), {
                    items: currentTableOrder,
                    total: total,
                    taxaServico: taxaServico,
                    updatedAt: serverTimestamp()
                });
            } catch (e) { console.log("Erro ao salvar:", e); }
        } 
        // Se tem itens e não existia pedido -> CRIA O PEDIDO NOVO
        else if (currentTableOrder.length > 0) {
            try {
                await addDoc(collection(db, "pedidos"), { 
                    method: 'mesa', 
                    tableNumber: currentTablePOS, 
                    items: currentTableOrder, 
                    total: total, 
                    taxaServico: taxaServico,
                    status: 'Em Preparo', 
                    customer: { name: `Mesa ${currentTablePOS}`, phone: '-' }, 
                    paymentMethod: 'pendente', 
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp() 
                });
            } catch (e) { console.log("Erro ao criar:", e); }
        }
    }, 800); 
};

// =========================================================
// MODAL DE TAMANHOS DINÂMICO (PUXANDO DO FIREBASE)
// =========================================================

let produtoTempParaOpcoes = null;

// 1. CHAMA O MODAL SE O PREÇO FOR ZERO
window.adicionarAoPedidoPOS = async (id) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    let finalPrice = parseFloat(p.price || 0);
    
    // Se o preço base for R$ 0,00, ele tem complementos obrigatórios (tamanhos)
    if (finalPrice === 0) {
        produtoTempParaOpcoes = p;
        document.getElementById('modal-opcoes-titulo').innerText = p.name;
        
        // Mostra um "Carregando" estiloso enquanto vai no banco de dados
        document.getElementById('lista-opcoes-container').innerHTML = `
            <div class="text-center py-8 text-cyan-600 flex flex-col items-center">
                <i class="fas fa-spinner fa-spin text-4xl mb-3"></i>
                <p class="text-sm font-bold text-gray-500">Buscando tamanhos...</p>
            </div>
        `;
        document.getElementById('modal-opcoes-produto').classList.remove('hidden');
        
        // Dispara a busca no banco de dados
        await window.renderizarOpcoesDoBanco(p);
        return; 
    }

    // Se já tiver preço fixo, adiciona direto
    processarAdicaoItem(p, p.name, finalPrice);
};

// 2. FECHA O MODAL
window.fecharModalOpcoes = () => {
    document.getElementById('modal-opcoes-produto').classList.add('hidden');
    produtoTempParaOpcoes = null;
};

// 3. BUSCA OS TAMANHOS REAIS LÁ DO BANCO DE DADOS
window.renderizarOpcoesDoBanco = async (produto) => {
    const container = document.getElementById('lista-opcoes-container');
    
    // Verifica se o produto tem complementos vinculados a ele
    if (!produto.complementIds || produto.complementIds.length === 0) {
        container.innerHTML = '<p class="text-red-500 text-center py-4 font-bold">Nenhum tamanho vinculado a este produto no Cardápio.</p>';
        return;
    }

    try {
        let grupoTamanhos = null;

        // O dashboard.js já tem a variável "db" e a função "getDoc" importadas no topo.
        // Vamos varrer os grupos de complemento desse açaí específico
        for (const groupId of produto.complementIds) {
            // Importação dinâmica nativa caso não esteja no escopo
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            
            const docRef = doc(db, "complementos", groupId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const groupData = docSnap.data();
                
                // Pega o grupo que dita o preço (geralmente marcado como 'embalagem' ou que seja Obrigatório)
                if (groupData.internalCategory === 'embalagem' || groupData.title.toLowerCase().includes('tamanho') || groupData.title.toLowerCase().includes('copo')) {
                    grupoTamanhos = groupData;
                    break; // Achou o grupo certo, para de procurar!
                }
                // Backup: se não tiver o nome acima, pega o primeiro que for obrigatório
                if (!grupoTamanhos && groupData.required) {
                    grupoTamanhos = groupData;
                }
            }
        }

        // Se não achou opções válidas
        if (!grupoTamanhos || !grupoTamanhos.options || grupoTamanhos.options.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">As opções deste produto estão vazias no banco.</p>';
            return;
        }

        // 4. DESENHA OS BOTÕES COM OS DADOS REAIS
        const opcoesHtml = grupoTamanhos.options.map((opt) => {
            // Se a opção foi desativada no painel admin, ela não aparece aqui
            if (opt.available === false) return '';
            
            return `
                <button onclick="window.selecionarOpcaoProduto('${opt.name}', ${opt.price})" 
                        class="w-full flex justify-between items-center p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl hover:border-cyan-500 hover:bg-cyan-50 transition group active:scale-95 mb-2">
                    <span class="font-bold text-gray-700 group-hover:text-cyan-800 text-lg">${opt.name}</span>
                    <span class="font-black text-cyan-600 text-xl">R$ ${parseFloat(opt.price).toFixed(2).replace('.', ',')}</span>
                </button>
            `;
        }).join('');

        container.innerHTML = opcoesHtml || '<p class="text-gray-500 text-center py-4">Nenhum tamanho ativo disponível.</p>';

    } catch (erro) {
        console.error("Erro ao buscar complementos da mesa:", erro);
        container.innerHTML = '<p class="text-red-500 text-center py-4 font-bold">Erro de conexão ao buscar tamanhos.</p>';
    }
};

// 5. CLIQUE NO BOTÃO DE TAMANHO
window.selecionarOpcaoProduto = (nomeOpcao, precoOpcao) => {
    if (!produtoTempParaOpcoes) return;
    
    // Junta o nome original com o tamanho real vindo do banco. Ex: "Montar Copo (300ml)"
    const nomeFinal = `${produtoTempParaOpcoes.name} (${nomeOpcao})`;
    
    processarAdicaoItem(produtoTempParaOpcoes, nomeFinal, precoOpcao);
    window.fecharModalOpcoes();
};

// 6. JOGA PRA COMANDA E SALVA AUTOMÁTICO
function processarAdicaoItem(produtoBase, nomeFinal, precoFinal) {
    const existe = currentTableOrder.find(item => item.name === nomeFinal && item.price === precoFinal); 
    
    if (existe) {
        existe.quantity++;
    } else {
        currentTableOrder.push({
            id: produtoBase.id, 
            name: nomeFinal,    
            price: precoFinal,
            quantity: 1,
            details: ''
        });
    }
    window.atualizarComandaPDV(); // Salva no banco automaticamente e recalcula totais
}

// =========================================================
// LÓGICA DE LIMPAR COMANDA (MODAL BONITÃO)
// =========================================================

// 1. Clica no botão "Limpar Comanda" da interface
window.limparComandaMesa = () => {
    // Se a comanda já tá vazia, só avisa e não faz nada
    if (currentTableOrder.length === 0) {
        return showToast("Atenção", "A comanda já está vazia.", true);
    }
    
    // Abre o modal de confirmação
    document.getElementById('modal-confirmar-limpeza').classList.remove('hidden');
};

// 2. Clica no botão "Cancelar" do modal
window.fecharModalLimpeza = () => {
    document.getElementById('modal-confirmar-limpeza').classList.add('hidden');
};

// 3. Clica no botão Vermelho "Sim, Limpar"
window.confirmarLimpezaComanda = () => {
    currentTableOrder = []; // Zera a lista no código
    
    window.atualizarComandaPDV(); // Recalcula a tela (que aciona nosso auto-save que apaga do banco)
    
    showToast("Limpa", "A comanda foi esvaziada e a mesa liberada!");
    window.fecharModalLimpeza(); // Esconde o modal
};

// 4. FUNÇÃO DO BOTÃO "FINALIZAR E PAGAR"
window.prepararPagamentoMesa = () => {
        if (currentTableOrder.length === 0) {
            return showToast("Atenção", "A comanda está vazia. Adicione itens antes de pagar.", true);
        }

        // Acha o ID do pedido no banco de dados para abrir o Modal de pagamento
        const existingOrder = allOrders.find(o => 
            o.method === 'mesa' && 
            parseInt(o.tableNumber) === parseInt(currentTablePOS) && 
            !['Finalizado', 'Rejeitado', 'Cancelado'].includes(o.status)
        );

        if (existingOrder) {
            window.abrirModalPagamentoMesa(existingOrder.id);
        } else {
            showToast("Processando", "Aguarde o pedido ser salvo...");
        }
    };

// =========================================================
// LÓGICA DE PAGAMENTO DA MESA (Nomes isolados para evitar conflito global)
// =========================================================
let pedidoPagamentoAtual = null;

window.abrirModalPagamentoMesa = (pedidoId) => {
    // Busca o pedido na lista global
    const pedido = allOrders.find(o => o.id === pedidoId);
    if (!pedido) return showToast("Erro", "Pedido não encontrado.", true);

    pedidoPagamentoAtual = pedido;

    // Preenche os dados na tela
    document.getElementById('pagamento-numero-mesa').innerText = pedido.tableNumber;
    document.getElementById('pagamento-valor-total').innerText = `R$ ${pedido.total.toFixed(2).replace('.', ',')}`;

    // Mostra o modal
    document.getElementById('modal-pagamento-mesa').classList.remove('hidden');
};

window.fecharModalPagamentoMesa = () => {
    document.getElementById('modal-pagamento-mesa').classList.add('hidden');
    pedidoPagamentoAtual = null;
};

window.confirmarPagamentoMesa = async () => {
    if (!pedidoPagamentoAtual) return;

    // Descobre qual método o caixa escolheu
    const metodoEscolhido = document.querySelector('input[name="metodo-pagamento"]:checked').value;
    
    // Importa as funções do banco de dados (caso não estejam globais)
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");

    try {
        // Atualiza o pedido no Firebase para "Finalizado" e "Pago"
        await updateDoc(doc(db, "pedidos", pedidoPagamentoAtual.id), {
            status: 'Finalizado',
            paymentStatus: 'paid',
            paymentMethod: metodoEscolhido
        });

        showToast("Sucesso", "Venda finalizada com sucesso!");
        window.fecharModalPagamento();
        
        // Volta para a tela de listar as mesas e limpa o PDV aberto
        window.voltarParaListaDeMesas();
        currentTableOrder = [];

    } catch (e) {
        console.error("Erro ao finalizar:", e);
        showToast("Erro", "Falha ao processar pagamento.", true);
    }
};
// DESBLOQUEIO INVISÍVEL DE ÁUDIO (AUTOPLAY POLICY)
// ==========================================
// ==========================================
// DESBLOQUEIO INVISÍVEL DE ÁUDIO (AUTOPLAY POLICY)
// ==========================================
const desbloquearAudioSilencioso = function() {
    const audioAlarm = document.getElementById('alarm-sound');
    const audioNotif = document.getElementById('notif-sound');
    
    // Pede permissão para Push Notifications no celular silenciosamente
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    if (audioAlarm) {
        audioAlarm.play().then(() => {
            // SÓ PAUSA O ÁUDIO SE NÃO TIVER NENHUM PEDIDO AGUARDANDO
            // Se tiver pedido, ele engata o áudio e deixa tocando após o primeiro clique!
            if (!window.temPedidoAguardando) {
                audioAlarm.pause();
                audioAlarm.currentTime = 0;
            }
        }).catch(() => {});
    }
    
    if (audioNotif) {
        audioNotif.play().then(() => {
            audioNotif.pause();
            audioNotif.currentTime = 0;
        }).catch(() => {});
    }

    // Remove os ouvintes logo após o primeiro clique para não pesar a memória do site
    document.removeEventListener('click', desbloquearAudioSilencioso);
    document.removeEventListener('touchstart', desbloquearAudioSilencioso);
    document.removeEventListener('keydown', desbloquearAudioSilencioso);
    console.log("Áudio desbloqueado com sucesso via interação invisível.");
};

// Aguarda o usuário dar o primeiro clique, toque ou apertar tecla em qualquer lugar do site
document.addEventListener('click', desbloquearAudioSilencioso);
document.addEventListener('touchstart', desbloquearAudioSilencioso);
document.addEventListener('keydown', desbloquearAudioSilencioso);

// --- LÓGICA DE INTERFACE RESPONSIVA (ABRIR/FECHAR MENU) ---
window.toggleMobileSidebar = () => {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        // ABRIR
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Trava o scroll da página ao abrir
    } else {
        // FECHAR
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        overlay.classList.add('hidden');
        document.body.style.overflow = ''; // Libera o scroll
    }
};

// Ajuste na função navegarPara para fechar o menu automaticamente após clicar em uma opção
const originalNavegarPara = window.navegarPara;
window.navegarPara = (telaId) => {
    // Se estiver no celular e o menu estiver aberto, fecha ele
    const sidebar = document.getElementById('main-sidebar');
    if (window.innerWidth < 768 && sidebar && sidebar.classList.contains('translate-x-0')) {
        window.toggleMobileSidebar();
    }
    originalNavegarPara(telaId);
};
// =========================================================
// PDV MANUAL (BALCÃO / DELIVERY) - LOGICA INTEGRADA
// =========================================================
let manualCart = [];
let manualType = 'balcao';
let currentPDVItem = null;
let selectedPDVOptions = {};
let currentPDVQtd = 1;
let currentPDVContext = 'manual'; 

window.iniciarVendaPDV = (tipo) => {
    document.getElementById('modal-escolher-tipo-pdv').classList.add('hidden');
    
    if(tipo === 'mesa') {
        window.navegarPara('view-pdv-wrapper');
        window.mudarAbaServico('mesa');
        return;
    }

    manualType = tipo;
    manualCart = [];
    document.getElementById('manual-cust-name').value = '';
    document.getElementById('manual-cust-phone').value = '';
    document.getElementById('manual-cust-address').value = '';
    document.getElementById('manual-frete-val').value = (tipo === 'delivery' ? '5.00' : '0.00');

    document.getElementById('manual-pos-title').innerText = tipo === 'delivery' ? 'Novo Delivery' : 'Venda Balcão';
    document.getElementById('manual-pos-icon').className = tipo === 'delivery' ? 'fas fa-motorcycle' : 'fas fa-shopping-bag';
    document.getElementById('manual-delivery-fields').classList.toggle('hidden', tipo !== 'delivery');

    window.navegarPara('view-pdv-manual');
    window.renderizarCategoriasManual();
    window.renderizarProdutosManual();
    window.atualizarTotaisManual();
};

window.renderizarCategoriasManual = () => {
    const container = document.getElementById('manual-categories-nav');
    if(!container) return;
    const categorias = ['todos', ...new Set(allProducts.map(p => p.category).filter(c => c))];
    container.innerHTML = categorias.map(cat => `
        <button onclick="window.renderizarProdutosManual('${cat}')" class="px-4 py-2 rounded-full text-xs font-bold border bg-white text-gray-600 hover:bg-cyan-50 transition">${cat.toUpperCase()}</button>
    `).join('');
};

window.renderizarProdutosManual = (cat = 'todos') => {
    const container = document.getElementById('manual-products-grid');
    if(!container) return;
    let filtrados = cat === 'todos' ? allProducts : allProducts.filter(p => p.category === cat);
    
    container.innerHTML = filtrados.map(p => {
        let basePrice = parseFloat(p.price || 0);
        let displayPrice = basePrice;
        let prefix = "R$ ";

        if (basePrice === 0 && p.complementIds) {
            let min = Infinity;
            p.complementIds.forEach(id => {
                const grp = allComplements[id];
                if (grp && grp.internalCategory === 'embalagem') {
                    grp.options.forEach(o => { if(o.price < min) min = o.price; });
                }
            });
            if (min !== Infinity) { displayPrice = min; prefix = "A partir de R$ "; }
        }

        return `
            <div onclick="window.abrirModalProdutoPDV('${p.id}', 'manual')" class="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer flex flex-col items-center text-center active:scale-95 transition">
                <img src="${p.image || 'img/placeholder.png'}" class="w-16 h-16 object-cover rounded-xl mb-2">
                <p class="text-[11px] font-bold text-gray-800 line-clamp-2 h-8 leading-tight">${p.name}</p>
                <p class="text-xs font-black text-cyan-700 mt-1">${prefix}${displayPrice.toFixed(2).replace('.', ',')}</p>
            </div>`;
    }).join('');
};

window.abrirModalProdutoPDV = async (id, context) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    currentPDVItem = p;
    currentPDVContext = context;
    selectedPDVOptions = {};
    currentPDVQtd = 1;
    document.getElementById('pdv-modal-img').src = p.image || 'img/placeholder.png';
    document.getElementById('pdv-modal-name').innerText = p.name;
    document.getElementById('pdv-modal-desc').innerText = p.description || '';
    document.getElementById('pdv-modal-qtd').innerText = '1';
    const groupsContainer = document.getElementById('pdv-modal-groups');
    groupsContainer.innerHTML = '';
    if (p.complementIds) {
        p.complementIds.forEach(gid => {
            const group = allComplements[gid];
            if (group) {
                const type = group.max > 1 ? 'checkbox' : 'radio';
                groupsContainer.innerHTML += `
                    <div class="space-y-3">
                        <p class="font-black text-gray-800 uppercase text-[10px] tracking-widest">${group.title} ${group.required ? '<span class="text-red-500">*</span>' : ''}</p>
                        <div class="grid grid-cols-1 gap-2">
                            ${group.options.map((opt, i) => `
                                <label class="flex justify-between items-center p-3 border-2 border-gray-100 rounded-xl cursor-pointer hover:bg-cyan-50 transition">
                                    <div class="flex items-center gap-3">
                                        <input type="${type}" name="group-${group.id}" onchange="window.togglePDVOption('${group.id}', ${i}, '${type}')" class="w-5 h-5 accent-cyan-600">
                                        <span class="text-sm font-bold text-gray-700">${opt.name}</span>
                                    </div>
                                    <span class="text-xs font-black text-cyan-600">+ R$ ${parseFloat(opt.price).toFixed(2)}</span>
                                </label>`).join('')}
                        </div>
                    </div>`;
            }
        });
    }
    document.getElementById('modal-detalhe-pdv').classList.remove('hidden');
    atualizarTotalModalPDV();
};

window.togglePDVOption = (groupId, optIdx, type) => {
    const group = allComplements[groupId];
    const opt = group.options[optIdx];
    if (!selectedPDVOptions[groupId]) selectedPDVOptions[groupId] = [];
    if (type === 'radio') { selectedPDVOptions[groupId] = [opt]; }
    else {
        const index = selectedPDVOptions[groupId].findIndex(o => o.name === opt.name);
        if (index > -1) selectedPDVOptions[groupId].splice(index, 1);
        else if (selectedPDVOptions[groupId].length < group.max) selectedPDVOptions[groupId].push(opt);
    }
    atualizarTotalModalPDV();
};

window.mudarQtdPDV = (delta) => {
    currentPDVQtd = Math.max(1, currentPDVQtd + delta);
    document.getElementById('pdv-modal-qtd').innerText = currentPDVQtd;
    atualizarTotalModalPDV();
};

function atualizarTotalModalPDV() {
    let extra = 0;
    Object.values(selectedPDVOptions).forEach(list => list.forEach(o => extra += (o.price || 0)));
    const total = ((parseFloat(currentPDVItem.price) || 0) + extra) * currentPDVQtd;
    document.getElementById('pdv-modal-total-btn').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

window.confirmarAdicaoPDV = () => {
    let nomesExtras = [];
    let precoExtra = 0;
    Object.values(selectedPDVOptions).forEach(list => list.forEach(o => { nomesExtras.push(o.name); precoExtra += (o.price || 0); }));
    const itemFinal = {
        id: `${currentPDVItem.id}-${Date.now()}`,
        name: currentPDVItem.name + (nomesExtras.length ? ` (${nomesExtras.join(', ')})` : ''),
        price: (parseFloat(currentPDVItem.price) || 0) + precoExtra,
        quantity: currentPDVQtd
    };
    if (currentPDVContext === 'manual') { manualCart.push(itemFinal); window.atualizarTotaisManual(); }
    else { currentTableOrder.push(itemFinal); window.atualizarComandaPDV(); }
    window.fecharModalPDV();
};

window.fecharModalPDV = () => document.getElementById('modal-detalhe-pdv').classList.add('hidden');

window.atualizarTotaisManual = () => {
    const container = document.getElementById('manual-order-items');
    if(!container) return;
    container.innerHTML = manualCart.map((item, idx) => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-xl border border-gray-100 mb-2">
            <div class="flex-1"><p class="text-xs font-bold text-gray-800">${item.name}</p></div>
            <div class="flex items-center gap-2">
                <button onclick="manualCart[${idx}].quantity--; if(manualCart[${idx}].quantity<=0) manualCart.splice(${idx},1); window.atualizarTotaisManual();" class="w-6 h-6 bg-white border rounded text-red-500">-</button>
                <span class="text-xs font-bold w-4 text-center">${item.quantity}</span>
                <button onclick="manualCart[${idx}].quantity++; window.atualizarTotaisManual();" class="w-6 h-6 bg-white border rounded text-green-500">+</button>
            </div>
        </div>`).join('');
    const subtotal = manualCart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const frete = parseFloat(document.getElementById('manual-frete-val').value) || 0;
    const total = subtotal + frete;
    document.getElementById('manual-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.',',')}`;
    document.getElementById('manual-total').innerText = `R$ ${total.toFixed(2).replace('.',',')}`;
};

window.prepararPagamentoManual = () => {
    if(manualCart.length === 0) return showToast("Atenção", "O carrinho está vazio!", true);
    const subtotal = manualCart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const frete = parseFloat(document.getElementById('manual-frete-val').value) || 0;
    currentPayOrder = {
        id: `MANUAL-${Date.now()}`,
        total: subtotal + frete,
        items: manualCart,
        method: manualType,
        customer: {
            name: document.getElementById('manual-cust-name').value || 'Cliente Manual',
            phone: document.getElementById('manual-cust-phone').value || '',
            address: document.getElementById('manual-cust-address').value || ''
        }
    };
    document.getElementById('pay-total-display').innerText = `R$ ${currentPayOrder.total.toFixed(2).replace('.', ',')}`;
    document.getElementById('payment-modal').classList.remove('hidden');
};

window.fecharModalPagamentoManual = () => {
    document.getElementById('payment-modal').classList.add('hidden');
    currentPayOrder = null;
};

window.confirmarPagamentoManual = async () => {
    if (!currentPayOrder) return;
    const valorRecebido = parseFloat(document.getElementById('pay-input-value').value) || currentPayOrder.total;
    try {
        const payload = { ...currentPayOrder, status: 'Finalizado', paymentStatus: 'paid', amountPaid: valorRecebido, paymentMethod: 'dinheiro', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        const docRef = await addDoc(collection(db, "pedidos"), payload);
        await addDoc(collection(db, "movimentacoes"), { descricao: `Venda PDV #${docRef.id.slice(-4).toUpperCase()}`, valor: valorRecebido, tipo: "entrada", data: serverTimestamp() });
        window.atualizarSaldoCaixa("entrada", valorRecebido);
        showToast("Sucesso", "Venda finalizada!");
        window.fecharModalPagamentoManual();
        window.navegarPara('view-pdv-wrapper');
        window.imprimirPedidoDash(docRef.id);
    } catch(e) { console.error(e); showToast("Erro", "Falha ao gravar.", true); }
};
    // ==========================================
    // GERENCIAMENTO DE COMPLEMENTOS / GRUPOS
    // ==========================================

window.editandoGrupoId = null; // Variável global para controlar se estamos criando ou editando um complemento

    window.renderizarGruposVinculados = () => {
        const container = document.getElementById('attached-groups-list');
        if(!container) return;
        
        if(currentProductAttachedGroups.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Nenhum complemento vinculado.</p>';
            return;
        }

        container.innerHTML = currentProductAttachedGroups.map(gid => {
            const group = allComplements[gid];
            if(!group) return ''; 
            
            return `
                <div class="bg-gray-50 p-3 rounded-lg border flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-bold text-gray-700 text-sm">${group.title}</p>
                            <p class="text-[10px] text-gray-500 uppercase">${group.internalCategory || 'Adicional'} • ${group.required ? 'Obrigatório' : 'Opcional'} • Máx: ${group.max || 1}</p>
                        </div>
                        <div class="flex gap-1">
                            <button type="button" onclick="window.editarGrupo('${gid}')" class="text-blue-500 hover:text-blue-700 p-2" title="Editar Grupo"><i class="fas fa-edit"></i></button>
                            <button type="button" onclick="window.desvincularGrupo('${gid}')" class="text-red-500 hover:text-red-700 p-2" title="Desvincular do Produto"><i class="fas fa-unlink"></i></button>
                        </div>
                    </div>
                    <div class="space-y-2 mt-2">
    ${(group.options || []).map((opt, index) => `
        <div class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-cyan-300 transition-all ${opt.available === false ? 'opacity-50 grayscale' : ''}">
            ${opt.image ? `<img src="${opt.image}" class="w-10 h-10 rounded-lg object-cover shadow-sm">` : `<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400"><i class="fas fa-image"></i></div>`}
            
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm">${opt.name}</p>
                <p class="font-bold text-cyan-700 text-xs">+ R$ ${Number(opt.price || 0).toFixed(2).replace('.', ',')}</p>
            </div>

            <button type="button" 
                    onclick="window.toggleOptionAvailability('${gid}', ${index})" 
                    class="p-2 rounded-lg transition-colors ${opt.available !== false ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}">
                <i class="fas ${opt.available !== false ? 'fa-toggle-on' : 'fa-toggle-off'} text-xl"></i>
            </button>
        </div>
    `).join('')}
</div>
                </div>
            `;
        }).join('');
    };

window.abrirGerenciadorGrupos = () => {
        const container = document.getElementById('available-groups-list');
        const available = Object.values(allComplements).filter(g => !currentProductAttachedGroups.includes(g.id));
        
        if(available.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-xs text-center py-4 italic">Nenhum grupo disponível para vincular.</p>';
        } else {
            container.innerHTML = available.map(g => `
                <div class="flex justify-between items-center bg-white p-3 rounded border shadow-sm">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-gray-700">${g.title}</span>
                        <span class="text-[10px] text-gray-500">${g.options ? g.options.length : 0} opções cadastradas</span>
                    </div>
                    <div class="flex gap-2 items-center">
                        <button type="button" onclick="window.editarGrupo('${g.id}')" class="text-blue-500 hover:text-blue-700" title="Editar"><i class="fas fa-edit"></i></button>
                        <button type="button" onclick="window.deletarGrupo('${g.id}')" class="text-red-500 hover:text-red-700" title="Excluir Definitivamente"><i class="fas fa-trash"></i></button>
                        <button type="button" onclick="window.vincularGrupo('${g.id}')" class="text-xs bg-cyan-100 text-cyan-700 px-3 py-1 rounded font-bold hover:bg-cyan-200 ml-2">Vincular</button>
                    </div>
                </div>
            `).join('');
        }
        
        // Reseta estado para "Criação"
        window.editandoGrupoId = null;
        document.getElementById('form-new-group').reset();
        document.getElementById('new-group-options').innerHTML = '';
        const btnSalvar = document.querySelector('button[onclick="window.salvarNovoGrupo()"]');
        if(btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-save mr-1"></i> Criar e Vincular';
        
        document.getElementById('group-manager-modal').classList.remove('hidden');
    };

    window.vincularGrupo = (gid) => {
        if(!currentProductAttachedGroups.includes(gid)) {
            currentProductAttachedGroups.push(gid);
            window.renderizarGruposVinculados();
            window.abrirGerenciadorGrupos(); // Atualiza a lista removendo o que foi vinculado
        }
    };

    window.desvincularGrupo = (gid) => {
        currentProductAttachedGroups = currentProductAttachedGroups.filter(id => id !== gid);
        window.renderizarGruposVinculados();
    };

    // --- CRIAR OPÇÕES DO GRUPO (Botão + Opção) ---
// --- CRIAR OPÇÕES DO GRUPO (Botão + Opção) ---
// --- CRIAR OPÇÕES DO GRUPO (Padrão iFood) ---
    window.addOptionRow = (name = '', price = '', image = '') => {
        const container = document.getElementById('new-group-options');
        const div = document.createElement('div');
        div.className = "flex items-center gap-3 option-row mt-2 bg-white p-2 border-b border-gray-100 hover:bg-gray-50 transition-colors";
        div.innerHTML = `
            <label class="w-14 h-14 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-center cursor-pointer relative overflow-hidden shrink-0 group shadow-sm">
                <input type="file" accept="image/*" class="hidden" onchange="window.uploadOptionImage(this)">
                <input type="hidden" class="opt-image" value="${image}">
                
                <i class="fas fa-camera text-gray-400 z-10 group-hover:text-gray-600 transition-colors ${image ? 'hidden' : ''}"></i>
                <img src="${image || ''}" class="absolute inset-0 w-full h-full object-cover z-20 ${image ? '' : 'hidden'}" alt="Preview">
                
                <div class="loading-overlay hidden absolute inset-0 bg-black/60 z-30 flex items-center justify-center">
                    <i class="fas fa-spinner fa-spin text-white"></i>
                </div>
            </label>

            <div class="flex-1 flex flex-col justify-center gap-1">
                <input type="text" placeholder="Ex: Ouro Branco" value="${name}" class="w-full bg-transparent border-b border-transparent focus:border-cyan-600 outline-none p-1 text-sm font-semibold text-gray-700 opt-name transition-colors" required>
                <div class="flex items-center text-sm text-gray-500">
                    <span class="mr-1">R$</span>
                    <input type="number" step="0.01" placeholder="0,00" value="${price}" class="w-20 bg-transparent border-b border-transparent focus:border-cyan-600 outline-none p-1 opt-price transition-colors" required>
                </div>
            </div>

            <button type="button" onclick="this.parentElement.remove()" class="text-gray-300 hover:text-red-500 p-2 transition-colors shrink-0" title="Excluir Opção">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        container.appendChild(div);
    };

    // --- UPLOAD DA IMAGEM PARA O FIREBASE STORAGE ---
window.uploadOptionImage = async (fileInput) => {
        const file = fileInput.files[0];
        if (!file) return;

        const label = fileInput.parentElement;
        const overlay = label.querySelector('.loading-overlay');
        overlay.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('upload.php', {
                method: 'POST',
                body: formData
            });

            // Captura o texto puro para ver se o PHP está dando erro de servidor (500)
            const textResponse = await response.text(); 
            console.log("Resposta do servidor:", textResponse); // <--- ABRA O CONSOLE (F12) E VEJA ISSO

            const result = JSON.parse(textResponse);

            if (result.sucesso) {
                const hiddenInput = label.querySelector('.opt-image');
                const imgElement = label.querySelector('img');
                hiddenInput.value = result.url;
                imgElement.src = result.url;
                imgElement.classList.remove('hidden');
            } else {
                alert("Erro no upload: " + result.erro);
            }
        } catch (error) {
            console.error("Erro completo:", error);
            alert("Erro de conexão com o servidor. Verifique o console do navegador.");
        } finally {
            overlay.classList.add('hidden');
            fileInput.value = '';
        }
    };
    // --- SALVAR GRUPO NO BANCO (Criação de novos Complementos) ---
// --- SALVAR GRUPO NO BANCO (Criação e Edição) ---
    window.salvarNovoGrupo = async () => {
        const title = document.getElementById('new-group-title').value;
        const category = document.getElementById('new-group-category').value;
        const required = document.getElementById('new-group-required').value === 'true';
        const max = parseInt(document.getElementById('new-group-max').value) || 1;
        
        const rows = document.querySelectorAll('.option-row');
        if(!title || rows.length === 0) {
            window.showToast("Atenção", "Preencha o título e adicione pelo menos uma opção.", true);
            return;
        }

        const options = [];
        rows.forEach(r => {
            const name = r.querySelector('.opt-name').value;
            const price = parseFloat(r.querySelector('.opt-price').value) || 0;
            const image = r.querySelector('.opt-image').value || '';
            if(name) options.push({ name, price, image, available: true });
        });

        // Tenta pegar o botão tanto com window. quanto sem
        const btn = document.querySelector('button[onclick="window.salvarNovoGrupo()"]') || document.querySelector('button[onclick="salvarNovoGrupo()"]');
        const originalText = btn ? btn.innerHTML : 'Salvar';
        if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Salvando...'; btn.disabled = true; }

        try {
            const payload = {
                title: title,
                internalCategory: category,
                required: required,
                max: max,
                options: options,
                updatedAt: serverTimestamp()
            };

            if (window.editandoGrupoId) {
                // Modo Edição
                await updateDoc(doc(db, "complementos", window.editandoGrupoId), payload);
                window.showToast("Sucesso", "Complemento atualizado!");
                window.editandoGrupoId = null;
            } else {
                // Modo Criação
                payload.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(db, "complementos"), payload);
                window.vincularGrupo(docRef.id);
                window.showToast("Sucesso", "Novo complemento criado e vinculado!");
            }
            
            // Re-abre/Atualiza a visão do modal
            window.abrirGerenciadorGrupos(); 
            window.renderizarGruposVinculados();
            
        } catch (e) {
            console.error(e);
            window.showToast("Erro", "Falha ao salvar complemento.", true);
        } finally {
            if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    };

    window.prepararEdicaoCupom = async (id) => {
    // 1. Puxa os dados fresquinhos do Firebase
    const docRef = doc(db, "marketing_cupons", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return window.showToast("Erro", "Cupom não encontrado.", true);
    
    const c = snap.data();

    // 2. Preenche todos os campos
    document.getElementById('cupom-edit-id').value = id;
    document.getElementById('cupom-codigo').value = c.code || '';
    document.getElementById('cupom-titulo').value = c.titulo || '';
    document.getElementById('cupom-desc').value = c.descricao || '';
    document.getElementById('cupom-tipo').value = c.tipo || 'fixo';
    document.getElementById('cupom-valor').value = c.valor || 0;
    document.getElementById('cupom-minimo').value = c.min || 0;
    
    if(document.getElementById('cupom-km')) document.getElementById('cupom-km').value = c.kmLimit || '';
    if(document.getElementById('cupom-secreto')) document.getElementById('cupom-secreto').checked = c.secreto || false;

    // 3. Atualiza a interface e abre o modal
    if(typeof window.mudarTipoCupom === 'function') window.mudarTipoCupom(); 
    
    const tituloModal = document.querySelector('#modal-novo-cupom h3');
    if(tituloModal) tituloModal.innerText = 'Editar Cupom';
    
    const btnSalvar = document.querySelector('#modal-novo-cupom button.bg-cyan-600');
    if(btnSalvar) btnSalvar.innerText = 'ATUALIZAR CUPOM';

    document.getElementById('modal-novo-cupom').classList.remove('hidden');
};
    // --- LÓGICA DE EDIÇÃO E EXCLUSÃO DOS COMPLEMENTOS ---
    window.editarGrupo = (gid) => {
        const group = allComplements[gid];
        if(!group) return;

        window.editandoGrupoId = gid;
        
        // Abre o modal de gerenciamento se estiver fechado
        document.getElementById('group-manager-modal').classList.remove('hidden');

        // Preenche o formulário superior
        document.getElementById('new-group-title').value = group.title || '';
        document.getElementById('new-group-category').value = group.internalCategory || 'adicional';
        document.getElementById('new-group-required').value = group.required ? 'true' : 'false';
        document.getElementById('new-group-max').value = group.max || 1;

        // Limpa as opções atuais e injeta as do banco
        document.getElementById('new-group-options').innerHTML = '';
        if(group.options) {
            group.options.forEach(opt => {
                window.addOptionRow(opt.name, opt.price, opt.image || '');
            });
        } else {
            window.addOptionRow(); // se tiver vazio por algum erro, põe 1 em branco
        }

        // Muda visual do botão
        const btnSalvar = document.querySelector('button[onclick="window.salvarNovoGrupo()"]') || document.querySelector('button[onclick="salvarNovoGrupo()"]');
        if(btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-save mr-1"></i> Salvar Alterações';
    };

    window.deletarGrupo = async (gid) => {
        if(confirm("ATENÇÃO: Deseja apagar este complemento do Banco de Dados? Ele sumirá de TODOS os produtos que o utilizam.")) {
            try {
                await deleteDoc(doc(db, "complementos", gid));
                
                // Remove da lista do produto atual se estivesse lá
                window.desvincularGrupo(gid);
                
                window.showToast("Sucesso", "Complemento excluído com sucesso!");
                window.abrirGerenciadorGrupos(); // Atualiza a lista da tela
            } catch (e) {
                console.error("Erro ao excluir complemento:", e);
                window.showToast("Erro", "Falha ao excluir o complemento.", true);
            }
        }
    };
    window.abrirModalNovaCategoria = () => {
        document.getElementById('input-nova-categoria').value = '';
        document.getElementById('modal-nova-categoria-admin').classList.remove('hidden');
        setTimeout(() => document.getElementById('input-nova-categoria').focus(), 100);
    };

    window.salvarNovaCategoria = async () => {
        const inputCat = document.getElementById('input-nova-categoria');
        const nomeCategoria = inputCat.value.trim();
        
        if (!nomeCategoria) {
            return window.showToast("Atenção", "Digite um nome para a categoria.", true);
        }

        window.toggleLoading(true, "Salvando...");
        
        try {
            await addDoc(collection(db, "categorias"), { 
                nome: nomeCategoria, 
                createdAt: serverTimestamp() 
            });
            
            window.showToast("Sucesso", "Categoria criada com sucesso!");
            document.getElementById('modal-nova-categoria-admin').classList.add('hidden');
            
            // Força a categoria nova a ficar selecionada no select do produto
// Força a categoria nova a ficar selecionada no select do produto
            setTimeout(() => {
                // Atualiza todas as listagens caso o Firebase já tenha pego, mas não forçado
                window.renderizarSeletorCategoriasModal(nomeCategoria);
                const selectCat = document.getElementById('edit-category');
                // Se der tempo, ele seleciona o recém criado (caso o slug seja igual ao nome)
                if (selectCat) selectCat.value = nomeCategoria.toLowerCase().replace(/[^a-z0-9]/g, '-'); // Assumindo que você gera slug na criação
            }, 600); // Dá tempo do onSnapshot acima atualizar a UI
            
        } catch(e) {
            console.error("Erro ao criar categoria:", e);
            window.showToast("Erro", "Falha ao criar categoria.", true);
        } finally {
            window.toggleLoading(false);
        }
    };
window.renderizarSeletorCategoriasModal = (selectedCat = null) => {
    const select = document.getElementById('edit-category');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Selecione uma Categoria...</option>';

    allCategories.forEach(cat => {
        // Usa o nome ou o slug como valor (prefira slug se tiver, senao vai o nome mesmo)
        const valorCategoria = cat.slug || cat.nome;
        const nomeVisivel = cat.nome;
        
        const option = document.createElement('option');
        option.value = valorCategoria;
        option.innerText = nomeVisivel;
        
        // Mantém a categoria que já estava selecionada, se estivermos editando
        if (selectedCat && valorCategoria === selectedCat) {
            option.selected = true;
        }

        select.appendChild(option);
    });
};
window.deletarItemMarketing = async (colecao, id) => {
    const t = document.getElementById('toast');
    const tTitle = document.getElementById('toast-title');
    const tMsg = document.getElementById('toast-msg');

    if (!t || !tTitle || !tMsg) return;

    // Configura o toast como aviso (amarelo)
    tTitle.innerText = "Confirmar Exclusão";
    tMsg.innerHTML = `
        <div class="mt-2 text-gray-700 text-xs mb-3">Tem certeza que deseja excluir permanentemente este item?</div>
        <div class="flex gap-2">
            <button id="btn-toast-sim" class="bg-red-600 text-white px-3 py-1 rounded font-bold text-[10px]">SIM</button>
            <button id="btn-toast-nao" class="bg-gray-200 text-gray-700 px-3 py-1 rounded font-bold text-[10px]">CANCELAR</button>
        </div>
    `;
    t.className = `fixed top-4 right-4 z-[100] shadow-2xl rounded px-4 py-3 animate-fade-in-up border-l-4 bg-white border-yellow-500 text-gray-800`;
    t.classList.remove('hidden');

    // Ações dos botões
    document.getElementById('btn-toast-sim').onclick = async () => {
        t.classList.add('hidden');
        try {
            await deleteDoc(doc(db, colecao, id));
            window.showToast("Sucesso", "Item excluído com sucesso!");
        } catch(e) {
            console.error(e);
            window.showToast("Erro", "Falha ao excluir.", true);
        }
    };

    document.getElementById('btn-toast-nao').onclick = () => {
        t.classList.add('hidden');
    };
};
// Função para alternar disponibilidade de um item
window.toggleOptionAvailability = async (groupId, optionIndex) => {
    const group = allComplements[groupId];
    if (!group) return;

    // Inverte o status atual
    const isAvailable = group.options[optionIndex].available !== false;
    group.options[optionIndex].available = !isAvailable;

    try {
        // Atualiza o documento no Firestore
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
        const groupRef = doc(db, "complementos", groupId);
        
        await updateDoc(groupRef, {
            options: group.options
        });

        window.showToast("Sucesso", `Item ${!isAvailable ? 'disponível' : 'ocultado'}!`);
        window.renderizarGruposVinculados(); // Re-renderiza para aplicar estilo visual
        
    } catch (e) {
        console.error("Erro ao atualizar status:", e);
        window.showToast("Erro", "Não foi possível atualizar o item.", true);
    }
};