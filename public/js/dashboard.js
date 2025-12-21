
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, orderBy, query, getDoc, setDoc, addDoc, serverTimestamp, getDocs, deleteDoc, limit, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { monitorarEstadoAuth, verificarAdminNoBanco, db as authDb, fazerLogout } from './auth.js';
const db = authDb;
const storage = getStorage(authDb.app);
const notificationSound = document.getElementById('notif-sound');

// Estado Global
let allOrders = [];
let allProducts = [];
let allCategories = [];
let tablesConfig = { environments: [] };

let currentServiceTab = 'retirada'; 
let currentStatusFilter = 'todos';  
let currentEnvId = null;
let currentTablePOS = null; 
let currentTableOrder = []; 
let currentPayOrder = null;
let currentPayMethod = 'dinheiro';
let salesChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    monitorarEstadoAuth(async (user) => {
        if (!user || !(await verificarAdminNoBanco(user.email))) {
            window.location.href = 'index.html'; 
            return;
        }
        if(document.getElementById('header-user-name')) document.getElementById('header-user-name').innerText = user.displayName || 'Admin';
        if(document.getElementById('header-user-email')) document.getElementById('header-user-email').innerText = user.email;

        // Gatilhos Iniciais
        await carregarProdutosECategorias(); 
        iniciarMonitoramentoPedidos();
        
        const ultimaTela = localStorage.getItem('painel_ultima_tela') || 'view-pdv-wrapper';
        window.navegarPara(ultimaTela);
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

window.navegarPara = (telaId) => {
    // 1. Salva a tela atual para o F5
    localStorage.setItem('painel_ultima_tela', telaId);

    // 2. Lista COMPLETA de todas as telas (não falta nenhuma aqui)
    const telas = [
        'view-pdv-wrapper', 'view-pos', 'view-historico', 'view-relatorios', 
        'view-financeiro', 'view-caixa', 'view-nfce', 
        'view-produtos', 'view-boasvindas', 'view-config-pedidos',
        'view-kitchen', 'view-inventory', 'view-chatbot', 
        'view-config-business', 'view-config-team', 
        'view-config-printers', 'view-config-interactions'
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

    // 6. GATILHOS DE CARREGAMENTO (AQUI RESOLVE O CAIXA E OS PRODUTOS)
    if(telaId === 'view-caixa') iniciarTelaCaixa(); // Chama saldo + histórico
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
}

// === MONITORAMENTO DE PEDIDOS ===
function iniciarMonitoramentoPedidos() {
    const q = query(collection(db, "pedidos"), orderBy("createdAt", "desc"));
    
    // MONITOR DE PEDIDOS (Lógica original mantida 100%)
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        let counts = { retirada: 0, delivery: 0, mesa: 0, pendente: 0, curso: 0 };
        let total = 0;

        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                if (!snapshot.metadata.fromCache && notificationSound) {
                    notificationSound.play().catch(e => console.log("Erro som:", e));
                    if (typeof window.showToast === "function") {
                        window.showToast("Novo Pedido", "Um novo pedido acabou de chegar!", false);
                    }
                }
            }
        });

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const order = { id: docSnap.id, ...data };
            allOrders.push(order);

            if (data.status !== 'Finalizado' && data.status !== 'Rejeitado' && data.status !== 'Cancelado') {
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

    // MONITOR DE PRODUTOS (Separado para não bugar a memória e os produtos aparecerem!)
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        allProducts = [];
        snapshot.forEach(d => allProducts.push({id: d.id, ...d.data()}));
        if(!document.getElementById('view-produtos').classList.contains('hidden')) {
            renderizarListaProdutos();
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
    let filtered = allOrders.filter(o => o.method === currentServiceTab); 

    // 2. Aplica o filtro de Status
    filtered = filtered.filter(o => {
        if (currentStatusFilter === 'todos') {
            // Mostra tudo que está "em andamento" (Aguardando, Preparo, Saiu entrega, Pronto)
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

        div.className = `bg-white border border-gray-200 rounded-lg shadow-sm grid grid-cols-12 mb-2 items-center hover:shadow-md transition ${borderClass}`;
        
        const time = order.createdAt ? order.createdAt.toDate().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
        let originBadge = order.origin === 'app' ? 
            `<span class="bg-purple-100 text-purple-600 px-2 py-0.5 rounded text-[10px] border border-purple-200">APP</span>` :
            `<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] border border-gray-200">WEB</span>`;
        
        let payStatus = order.paymentStatus === 'paid' ? 
            `<span class="bg-green-100 text-green-600 text-[10px] px-2 py-0.5 rounded font-bold">PAGO</span>` : 
            `<span class="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer" onclick="abrirModalPagamento('${order.id}')">NÃO PAGO</span>`;

        // Lógica de Botões de Ação
        let actions = '';
        if (order.status === 'Finalizado' || order.status === 'Cancelado' || order.status === 'Rejeitado') {
            actions = `<span class="text-[10px] font-bold text-gray-400 uppercase">Pedido Encerrado</span>`;
        } else if(order.status === 'Aguardando') {
            actions = `
                <div class="flex gap-2 justify-end">
                    <button onclick="atualizarStatus('${order.id}', 'Rejeitado')" class="border border-red-500 text-red-500 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-red-50">Rejeitar</button>
                    <button onclick="atualizarStatus('${order.id}', 'Em Preparo')" class="bg-green-500 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-green-600 shadow-sm">Aceitar</button>
                </div>`;
        } else {
            actions = `<div class="flex gap-2 justify-end"><button onclick="atualizarStatus('${order.id}', 'Finalizado')" class="bg-cyan-900 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-cyan-800">Concluir</button></div>`;
        }

        div.innerHTML = `
            <div class="col-span-2 p-3 text-xs border-r">
                <div class="font-bold text-gray-700 flex items-center gap-1">#${order.id.slice(-4).toUpperCase()} ${originBadge}</div>
                <div class="text-gray-400 mt-1"><i class="far fa-clock"></i> ${time}</div>
            </div>
            <div class="col-span-2 p-3 text-xs font-bold border-r">
                <span class="${['Cancelado', 'Rejeitado'].includes(order.status) ? 'text-red-600' : 'text-blue-600'} block mb-1">${order.status}</span>
                ${payStatus}
            </div>
            <div class="col-span-2 p-3 font-bold text-gray-700 border-r">R$ ${order.total.toFixed(2)}</div>
            <div class="col-span-4 p-3 text-xs border-r truncate">
                <div class="font-bold text-gray-800">${order.customer?.name || 'Cliente'}</div>
                <div class="text-gray-500 text-[10px]">${order.items?.length || 0} itens</div>
            </div>
            <div class="col-span-2 p-3 text-right">${actions}</div>
        `;
        container.appendChild(div);
    });
}

window.atualizarStatus = async (id, status) => {
    try { 
        await updateDoc(doc(db, "pedidos", id), { 
            status: status,
            updatedAt: serverTimestamp() // Isso força o onSnapshot do cliente a disparar
        }); 
        
        // Notificação opcional no Dashboard
        window.showToast("Status Atualizado", `Pedido #${id.slice(0,4)} movido para ${status}`);

        // GATILHO DO BOT: Dispara a mensagem automática conforme o novo status
        if (typeof window.enviarNotificacaoWhats === "function") {
            window.enviarNotificacaoWhats(id, status);
        }
        
    } catch(e) { console.error("Erro ao atualizar status:", e); }
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

window.confirmarPagamento = async (aceitarPedidoJunto) => {
    if (!currentPayOrder) return;
    try {
        const updateData = {
            paymentStatus: 'paid',
            paymentMethod: currentPayMethod,
            amountPaid: parseFloat(document.getElementById('pay-input-value').value) || currentPayOrder.total,
            updatedAt: serverTimestamp()
        };
        if (aceitarPedidoJunto) updateData.status = 'Em Preparo';
        await updateDoc(doc(db, "pedidos", currentPayOrder.id), updateData);
        alert("Pagamento registrado!");
        
        // Registra entrada no financeiro se for pago
        addDoc(collection(db, "movimentacoes"), {
            descricao: `Venda #${currentPayOrder.id.slice(0,4)}`,
            tipo: "entrada",
            valor: updateData.amountPaid,
            data: serverTimestamp()
        });
        atualizarSaldoCaixa("entrada", updateData.amountPaid);

        fecharModalPagamento();
    } catch(e) { console.error(e); alert("Erro ao registrar pagamento."); }
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
    if (!env) {
        container.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400">Selecione um ambiente acima</div>';
        return;
    }

    env.tables.forEach(num => {
        // Busca pedido ativo para esta mesa
        const activeOrder = allOrders.find(o => 
            o.method === 'mesa' && 
            o.tableNumber == num && 
            !['Finalizado', 'Rejeitado', 'Cancelado'].includes(o.status)
        );

        const card = document.createElement('div');
        card.className = `table-card ${activeOrder ? 'occupied' : ''}`;
        
        let content = `<span class="text-2xl font-bold text-gray-400">${num}</span>`;
        if (activeOrder) {
            content = `
                <span class="text-xl font-bold text-red-500">${num}</span>
                <div class="mt-1 flex flex-col items-center">
                    <span class="text-xs font-bold text-gray-700">R$ ${activeOrder.total.toFixed(2)}</span>
                    <span class="text-[10px] text-gray-400">Ocupada</span>
                </div>`;
        }
        
        card.innerHTML = content;
        card.onclick = () => abrirMesaPDV(num, activeOrder); 
        container.appendChild(card);
    });
}

window.changePosQtd = (idx, delta) => {
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

window.fecharModalProduto = () => document.getElementById('product-modal').classList.add('hidden');

// 2. CONFIGURAÇÕES DA LOJA (BOAS-VINDAS)
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
    try {
        // Sincroniza Endereço
        const infoSnap = await getDoc(doc(db, "config", "loja_info"));
        if (infoSnap.exists()) {
            const bizAddress = infoSnap.data().endereco || "Endereço não configurado";
            const el = document.getElementById('biz-address');
            if (el) el.innerText = bizAddress;
        }

        // Busca Regras de Pedido
        const docSnap = await getDoc(doc(db, "config", "pedidos"));
        if(docSnap.exists()) {
            const d = docSnap.data();
            
            // Switches
            if(document.getElementById('cfg-delivery-active')) document.getElementById('cfg-delivery-active').checked = d.delivery !== false;
            if(document.getElementById('cfg-pickup-active')) document.getElementById('cfg-pickup-active').checked = d.pickup !== false;
            if(document.getElementById('cfg-accept-orders')) document.getElementById('cfg-accept-orders').checked = d.accept !== false;
            
            // Valores Avançados
            if(document.getElementById('cfg-deliv-min')) document.getElementById('cfg-deliv-min').value = d.delivMin || 0;
            if(document.getElementById('cfg-deliv-free')) document.getElementById('cfg-deliv-free').value = d.delivFreeAbove || 0;
            if(document.getElementById('cfg-deliv-service')) document.getElementById('cfg-deliv-service').value = d.delivServiceFee || 0;
            
            // Checkboxes
            if(document.getElementById('cfg-deliv-extra')) document.getElementById('cfg-deliv-extra').checked = d.askExtraInfo || false;
            if(document.getElementById('cfg-deliv-comp')) document.getElementById('cfg-deliv-comp').checked = d.mandatoryComplement || false;
            if(document.getElementById('cfg-deliv-sched')) document.getElementById('cfg-deliv-sched').checked = d.allowScheduled || false;

            window.atualizarLabelPrecoDelivery(d.deliveryMode);
        }
    } catch(e) { console.error(e); }
};

// 3. Salvar todas as configurações de uma vez
window.salvarConfigPedidos = async () => {
    const data = {
        delivery: document.getElementById('cfg-delivery-active')?.checked,
        pickup: document.getElementById('cfg-pickup-active')?.checked,
        accept: document.getElementById('cfg-accept-orders')?.checked,
        
        delivMin: parseFloat(document.getElementById('cfg-deliv-min')?.value) || 0,
        delivFreeAbove: parseFloat(document.getElementById('cfg-deliv-free')?.value) || 0,
        delivServiceFee: parseFloat(document.getElementById('cfg-deliv-service')?.value) || 0,
        
        askExtraInfo: document.getElementById('cfg-deliv-extra')?.checked,
        mandatoryComplement: document.getElementById('cfg-deliv-comp')?.checked,
        allowScheduled: document.getElementById('cfg-deliv-sched')?.checked,
        
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "config", "pedidos"), data, { merge: true });
        window.showToast("Sucesso", "Configurações salvas!");
    } catch(e) { window.showToast("Erro", "Falha ao salvar", true); }
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
    document.querySelectorAll('.delivery-option-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');

    // 2. Lógica para abrir o modal correto
    if (mode === 'fixed') {
        // Abre o modal de Preço Fixo
        document.getElementById('modal-fixed-price').classList.remove('hidden');
    } 
    else if (mode === 'district') {
        // Abre o modal de Preço por Bairro
        document.getElementById('modal-neighborhood-price').classList.remove('hidden');
        renderizarListaBairrosConfig(); // Garante que a lista apareça
    }
    // Para 'free', 'ifood' ou 'distance', apenas salva a seleção na memória
    else {
        console.log("Modo selecionado: " + mode);
    }
    
    // (Opcional) Salva o modo escolhido numa variável global para depois enviar ao banco
    window.currentDeliveryMode = mode;
};;


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
    
    const type = selected.dataset.selectedType;
    try {
        await setDoc(doc(db, "config", "pedidos"), { deliveryMode: type }, { merge: true });
        document.getElementById('delivery-settings-modal').classList.add('hidden');
        
        // Recarrega para atualizar o label "Sem preço" para o novo modo
        carregarConfigPedidos(); 
        showToast("Sucesso", "Modo de entrega atualizado!");
    } catch(e) {
        showToast("Erro", "Falha ao salvar modo de entrega.", true);
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
    container.innerHTML = window.localBairros.map((b, idx) => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border mb-2">
            <span class="font-bold text-sm text-gray-700">${b.nome}</span>
            <div class="flex items-center gap-4">
                <span class="font-bold text-cyan-700">R$ ${b.custo.toFixed(2)}</span>
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
            logoUrl: printConfig.logoUrl, // Salva a URL da imagem
            footerMsg: document.getElementById('print-footer-msg').value,
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, "config", "impressao"), data);
        printConfig = data; // Sincroniza
        
        showToast("Sucesso", "Configurações de impressão salvas!");
        
    } catch (e) {
        console.error(e);
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
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    
    // Constrói o HTML da Logo se existir
    const logoHtml = printConfig.logoUrl 
        ? `<div class="text-center"><img src="${printConfig.logoUrl}" class="logo"></div>` 
        : '';

    doc.open();
    doc.write(`
        <html>
        <head>
            <style>
                @page { margin: 0; }
                body { 
                    font-family: 'Courier New', monospace; 
                    width: ${printConfig.width}; 
                    font-size: ${printConfig.fontSize};
                    margin: 0; 
                    padding: 5px;
                    color: black;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                .item-row { display: flex; justify-content: space-between; }
                .footer { margin-top: 10px; font-size: 0.9em; text-align: center; }
                img.logo { max-width: 60%; height: auto; display: block; margin: 0 auto 5px auto; }
            </style>
        </head>
        <body>
            ${logoHtml}
            ${htmlCupom}
            ${printConfig.footerMsg ? `<div class="divider"></div><div class="footer">${printConfig.footerMsg}</div>` : ''}
            <div class="text-center" style="margin-top:10px;">.</div>
        </body>
        </html>
    `);
    doc.close();

    // Aguarda carregamento da imagem antes de imprimir
    iframe.contentWindow.focus();
    setTimeout(() => {
        iframe.contentWindow.print();
    }, 800);
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
// Função que desenha os produtos na aba "Produtos" do Dashboard
window.renderizarListaProdutos = () => {
    const container = document.getElementById('products-list-container');
    if (!container) return;

    container.innerHTML = '';

    if (allProducts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="text-gray-500">Nenhum produto encontrado no banco de dados.</p>
                <button onclick="navegarPara('view-config-business')" class="text-cyan-600 underline text-sm">Verificar configurações</button>
            </div>`;
        return;
    }

    allProducts.forEach(p => {
        const div = document.createElement('div');
        div.className = "bg-white border rounded-lg p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition";
        
        div.innerHTML = `
            <img src="${p.image || 'https://via.placeholder.com/100'}" class="w-16 h-16 rounded-lg object-cover bg-gray-100">
            <div class="flex-1">
                <h4 class="font-bold text-gray-800">${p.name}</h4>
                <p class="text-xs text-gray-500 line-clamp-1">${p.description || 'Sem descrição'}</p>
                <div class="mt-1">
                    <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600 uppercase font-bold">${p.category}</span>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-cyan-700">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</p>
                <button onclick="abrirModalEdicaoDash('${p.id}')" class="text-xs text-blue-600 font-bold hover:underline">Editar</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Atalho para abrir o modal de edição que já existe no HTML
window.abrirModalEdicaoDash = (id) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    // Preenche os campos básicos
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-category').value = p.category || '';
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-original-price').value = p.originalPrice || '';
    document.getElementById('edit-desc').value = p.description || '';
    
    // Preenche campos de tamanho/peso
    if(document.getElementById('edit-serves')) document.getElementById('edit-serves').value = p.serves || '1';
    if(document.getElementById('edit-weight')) document.getElementById('edit-weight').value = p.weight || '';
    if(document.getElementById('edit-unit')) document.getElementById('edit-unit').value = p.unit || 'ml';

    // Gerencia a pré-visualização da imagem
    const preview = document.getElementById('preview-image');
    const icon = document.getElementById('icon-image');
    const inputUrl = document.getElementById('edit-image-url');

    if(p.image) {
        preview.src = p.image;
        preview.classList.remove('hidden');
        icon.classList.add('hidden');
        inputUrl.value = p.image;
    } else {
        preview.classList.add('hidden');
        icon.classList.remove('hidden');
        inputUrl.value = '';
    }

    // Altera o título do modal e mostra
    document.getElementById('modal-title').innerText = "Editar Produto";
    document.getElementById('product-modal').classList.remove('hidden');
    
    // Garante que comece na aba "Sobre"
    if (typeof window.mudarAba === 'function') window.mudarAba('sobre');
};
// Função para Salvar/Atualizar o produto no Firebase (usada pelo botão do modal)
// Função que faz o upload da imagem do produto para o Firebase Storage
window.handleImageUpload = async (input) => {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const loading = document.getElementById('upload-loading');
        
        if(loading) loading.classList.remove('hidden');

        try {
            // Cria uma referência única no Storage
            const storageRef = ref(storage, `produtos/${Date.now()}_${file.name}`);
            
            // Faz o upload
            await uploadBytes(storageRef, file);
            
            // Pega a URL para salvar no banco
            const url = await getDownloadURL(storageRef);
            
            // Atualiza a visualização no modal
            const preview = document.getElementById('preview-image');
            const icon = document.getElementById('icon-image');
            const inputHidden = document.getElementById('edit-image-url');

            if(preview) {
                preview.src = url;
                preview.classList.remove('hidden');
            }
            if(icon) icon.classList.add('hidden');
            if(inputHidden) inputHidden.value = url;
            
            showToast("Sucesso", "Imagem carregada!");

        } catch (error) {
            console.error("Erro no upload da imagem:", error);
            showToast("Erro", "Falha ao enviar imagem.", true);
        } finally {
            if(loading) loading.classList.add('hidden');
        }
    }
};  
window.salvarProduto = async function() {
    const id = document.getElementById('edit-id').value;
    const priceInput = document.getElementById('edit-price').value;

    const produto = {
        name: document.getElementById('edit-name').value,
        category: document.getElementById('edit-category').value,
        price: parseFloat(priceInput),
        originalPrice: document.getElementById('edit-original-price').value ? parseFloat(document.getElementById('edit-original-price').value) : null,
        description: document.getElementById('edit-desc').value,
        image: document.getElementById('edit-image-url').value,
        serves: document.getElementById('edit-serves').value,
        weight: document.getElementById('edit-weight').value,
        unit: document.getElementById('edit-unit').value
    };

    if (!produto.name || isNaN(produto.price)) {
        return showToast("Erro", "Nome e Preço são obrigatórios.", true);
    }

    try {
        if (id) {
            await updateDoc(doc(db, "produtos", id), produto);
            showToast("Atualizado", "Produto salvo com sucesso!");
        } else {
            await addDoc(collection(db, "produtos"), produto);
            showToast("Criado", "Novo produto adicionado!");
        }
        document.getElementById('product-modal').classList.add('hidden');
        // Atualiza a lista após salvar
        renderizarListaProdutos(); 
    } catch (e) {
        // O ERRO ESTAVA AQUI: você usava 'error' mas declarou 'e'
        console.error("Erro ao salvar produto:", e); 
        showToast("Erro", "Falha ao salvar no banco de dados.", true);
    }
};

// Função para Excluir o produto (usada pelo botão do modal)
window.deletarProduto = async function() {
    const id = document.getElementById('edit-id').value;
    if(!id) return;
    if(!confirm("Deseja excluir este produto permanentemente?")) return;

    try {
        await deleteDoc(doc(db, "produtos", id));
        showToast("Excluído", "Produto removido com sucesso.");
        document.getElementById('product-modal').classList.add('hidden');
    } catch(e) {
        console.error(e);
        showToast("Erro", "Erro ao excluir produto.", true);
    }
};
// Função para abrir o simulador
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


window.desconectarIfood = () => {
    ifoodToken = null;
    if (ifoodPollingInterval) clearInterval(ifoodPollingInterval);
    document.getElementById('ifood-connected-area').classList.add('hidden');
    document.getElementById('ifood-login-area').classList.remove('hidden');
    document.getElementById('ifood-status-badge').innerText = "Offline";
    document.getElementById('ifood-status-badge').className = "bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded border border-gray-200 uppercase";
}