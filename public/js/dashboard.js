import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, orderBy, query, getDoc, setDoc, addDoc, serverTimestamp, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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

// UI Control
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
            window.location.href = 'index.html'; return;
        }
        
        // Preenche info do header
        document.getElementById('header-user-name').innerText = user.displayName || 'Admin';
        document.getElementById('header-user-email').innerText = user.email;

        iniciarMonitoramentoPedidos();
        carregarConfigMesas();
        carregarProdutosECategorias(); 
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
    try {
        const pSnap = await getDocs(collection(db, "produtos"));
        allProducts = [];
        pSnap.forEach(d => allProducts.push({id: d.id, ...d.data()}));
        const cSnap = await getDocs(query(collection(db, "categorias"), orderBy("nome")));
        allCategories = [];
        cSnap.forEach(d => allCategories.push(d.data()));
    } catch(e) { console.error("Erro produtos:", e); }
}

// === NAVEGAÇÃO ===
window.mudarAbaServico = (aba) => {
    currentServiceTab = aba;
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${aba}`).classList.add('active');
    
    document.getElementById('view-lista').classList.add('hidden');
    document.getElementById('view-mesas').classList.add('hidden');
    
    if (aba === 'mesa') {
        document.getElementById('view-mesas').classList.remove('hidden');
        renderizarAmbientes(); 
    } else {
        document.getElementById('view-lista').classList.remove('hidden');
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
    // 1. LISTA ATUALIZADA: Adicionei 'view-kitchen' e 'view-inventory' aqui
    const telas = [
        'view-pdv-wrapper', 'view-pos', 'view-historico', 'view-relatorios', 
        'view-financeiro', 'view-caixa', 'view-nfce', 
        'view-produtos', 'view-boasvindas', 'view-config-pedidos',
        'view-kitchen', 'view-inventory', 'view-chatbot'
    ];
    
    // 2. Esconde todas as telas da lista
    telas.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.add('hidden');
            if(id === 'view-pos') el.classList.remove('flex');
        }
    });

    // 3. Mostra a tela alvo
    const target = document.getElementById(telaId);
    if(target) {
        target.classList.remove('hidden');
        if(telaId === 'view-pos') target.classList.add('flex');
    }

    // 4. Carrega os dados específicos (Gatilhos)
    if(telaId === 'view-historico') carregarHistorico();
    if(telaId === 'view-relatorios') renderizarRelatorios();
    if(telaId === 'view-financeiro') carregarFinanceiro();
    if(telaId === 'view-caixa') carregarEstadoCaixa();
    if(telaId === 'view-produtos') renderizarListaProdutos();
    if(telaId === 'view-boasvindas') carregarConfigLoja();
    if(telaId === 'view-config-pedidos') carregarConfigPedidos();
    
    // Gatilhos para as novas telas
    if(telaId === 'view-kitchen') iniciarMonitorCozinha(); 
    if(telaId === 'view-inventory') renderizarInventario(); 
}

// === MONITORAMENTO DE PEDIDOS ===
function iniciarMonitoramentoPedidos() {
    const q = query(collection(db, "pedidos"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        let counts = { retirada: 0, delivery: 0, mesa: 0, pendente: 0, curso: 0 };
        let total = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const order = { id: docSnap.id, ...data };
            allOrders.push(order);

            if (data.status !== 'Finalizado' && data.status !== 'Rejeitado') {
                if (data.method === 'retirada') counts.retirada++;
                if (data.method === 'delivery') counts.delivery++;
                if (data.method === 'mesa') counts.mesa++;
                if (data.status === 'Aguardando') counts.pendente++;
                if (data.status === 'Em Preparo' || data.status === 'Saiu para Entrega') counts.curso++;
                total += (data.total || 0);
            }
        });

        // Atualiza Badges
        updateBadge('badge-retirada', counts.retirada);
        updateBadge('badge-delivery', counts.delivery);
        updateBadge('badge-mesa', counts.mesa);
        
        const countPendente = document.getElementById('count-pendente');
        if(countPendente) countPendente.innerText = counts.pendente;
        const countCurso = document.getElementById('count-curso');
        if(countCurso) countCurso.innerText = counts.curso;
        const totalDia = document.getElementById('total-dia');
        if(totalDia) totalDia.innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;

        // Atualiza tela ativa
        if (!document.getElementById('view-lista').classList.contains('hidden')) renderizarPedidosLista();
        if (!document.getElementById('view-mesas').classList.contains('hidden')) renderizarGridMesas();
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
    tbody.innerHTML = '';
    const q = query(collection(db, "movimentacoes"), orderBy("data", "desc"));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
        const m = docSnap.data();
        const color = m.tipo === 'entrada' ? 'text-green-600' : 'text-red-600';
        const sinal = m.tipo === 'entrada' ? '+' : '-';
        tbody.innerHTML += `<tr class="bg-white border-b"><td class="px-6 py-3">${m.data ? m.data.toDate().toLocaleDateString() : '--'}</td><td class="px-6 py-3">${m.descricao}</td><td class="px-6 py-3 uppercase text-xs font-bold">${m.tipo}</td><td class="px-6 py-3 ${color} font-bold">${sinal} R$ ${m.valor.toFixed(2)}</td></tr>`;
    });
}

window.abrirModalFinanceiro = () => { document.getElementById('modal-financeiro').classList.remove('hidden'); }

window.salvarLancamento = async () => {
    const desc = document.getElementById('fin-desc').value;
    const tipo = document.getElementById('fin-tipo').value;
    const valor = parseFloat(document.getElementById('fin-valor').value);

    if(!desc || !valor) return alert("Preencha todos os campos");

    try {
        await addDoc(collection(db, "movimentacoes"), { descricao: desc, tipo, valor, data: serverTimestamp() });
        document.getElementById('modal-financeiro').classList.add('hidden');
        carregarFinanceiro();
        atualizarSaldoCaixa(tipo, valor);
    } catch(e) { console.error(e); alert("Erro ao salvar"); }
}

// === MÓDULO VENDAS: CAIXA ===
window.carregarEstadoCaixa = async () => {
    const storedCaixa = localStorage.getItem('caixa_status');
    if(storedCaixa) {
        const status = JSON.parse(storedCaixa);
        if(status.aberto) {
            document.getElementById('caixa-fechado-panel').classList.add('hidden');
            document.getElementById('caixa-aberto-panel').classList.remove('hidden');
            document.getElementById('caixa-inicio').innerText = new Date(status.inicio).toLocaleString();
            document.getElementById('caixa-saldo').innerText = `R$ ${status.saldo.toFixed(2)}`;
            return;
        }
    }
    document.getElementById('caixa-fechado-panel').classList.remove('hidden');
    document.getElementById('caixa-aberto-panel').classList.add('hidden');
}

window.abrirCaixa = () => {
    const inicial = prompt("Valor de abertura (Fundo de troco):", "0");
    if(inicial === null) return;
    
    const status = { aberto: true, inicio: Date.now(), saldo: parseFloat(inicial) || 0 };
    localStorage.setItem('caixa_status', JSON.stringify(status));
    carregarEstadoCaixa();
    addDoc(collection(db, "movimentacoes"), { descricao: "Abertura Caixa", tipo: "entrada", valor: status.saldo, data: serverTimestamp() });
}

window.fecharCaixa = () => {
    if(!confirm("Deseja fechar o caixa?")) return;
    localStorage.removeItem('caixa_status');
    carregarEstadoCaixa();
    addDoc(collection(db, "movimentacoes"), { descricao: "Fechamento Caixa", tipo: "neutro", valor: 0, data: serverTimestamp() });
}

function atualizarSaldoCaixa(tipo, valor) {
    const stored = localStorage.getItem('caixa_status');
    if(stored) {
        const status = JSON.parse(stored);
        if(status.aberto) {
            if(tipo === 'entrada') status.saldo += valor;
            else status.saldo -= valor;
            localStorage.setItem('caixa_status', JSON.stringify(status));
            document.getElementById('caixa-saldo').innerText = `R$ ${status.saldo.toFixed(2)}`;
        }
    }
}

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
    container.innerHTML = '';
    
    let filtered = allOrders.filter(o => o.method === currentServiceTab); 
    filtered = filtered.filter(o => {
        if (currentStatusFilter === 'todos') return o.status !== 'Finalizado' && o.status !== 'Rejeitado';
        if (currentStatusFilter === 'pendente') return o.status === 'Aguardando';
        if (currentStatusFilter === 'em_curso') return o.status === 'Em Preparo' || o.status === 'Saiu para Entrega';
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400">Nenhum pedido nesta seção.</div>`;
        return;
    }

    filtered.forEach(order => {
        const div = document.createElement('div');
        let borderClass = 'border-l-4 border-l-gray-300';
        if(order.status === 'Aguardando') borderClass = 'border-l-4 border-l-orange-500';
        if(order.status === 'Em Preparo') borderClass = 'border-l-4 border-l-blue-500';

        div.className = `bg-white border border-gray-200 rounded-lg shadow-sm grid grid-cols-12 mb-2 items-center hover:shadow-md transition ${borderClass}`;
        
        const time = order.createdAt ? order.createdAt.toDate().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
        let originBadge = `<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] border border-gray-200">WEB</span>`;
        if (order.origin === 'app') originBadge = `<span class="bg-purple-100 text-purple-600 px-2 py-0.5 rounded text-[10px] border border-purple-200">APP</span>`;
        
        let payStatus = order.paymentStatus === 'paid' ? 
            `<span class="bg-green-100 text-green-600 text-[10px] px-2 py-0.5 rounded font-bold">PAGO</span>` : 
            `<span class="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer" onclick="abrirModalPagamento('${order.id}')">NÃO PAGO</span>`;

        let actions = '';
        if(order.status === 'Aguardando') {
            actions = `<div class="flex gap-2 justify-end">
                <button onclick="atualizarStatus('${order.id}', 'Rejeitado')" class="border border-red-500 text-red-500 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-red-50">Rejeitar</button>
                <button onclick="abrirModalPagamento('${order.id}')" class="border border-blue-500 text-blue-500 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-50">Pagar</button>
                <button onclick="atualizarStatus('${order.id}', 'Em Preparo')" class="bg-green-500 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-green-600 shadow-sm">Aceitar</button>
            </div>`;
        } else if (order.status === 'Em Preparo') {
             actions = `<div class="flex gap-2 justify-end">
                <button onclick="abrirModalPagamento('${order.id}')" class="border border-blue-500 text-blue-500 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-50">Pagar</button>
                <button onclick="atualizarStatus('${order.id}', 'Saiu para Entrega')" class="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-700 shadow-sm">Despachar</button>
            </div>`;
        } else {
             actions = `<div class="flex gap-2 justify-end"><button onclick="atualizarStatus('${order.id}', 'Finalizado')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-bold">Concluir</button></div>`;
        }

        div.innerHTML = `
            <div class="col-span-2 p-3 text-xs border-r">
                <div class="font-bold text-gray-700 flex items-center gap-1">#${order.id.slice(0,4).toUpperCase()} ${originBadge}</div>
                <div class="text-gray-400 mt-1"><i class="far fa-clock"></i> ${time}</div>
            </div>
            <div class="col-span-2 p-3 text-xs font-bold border-r">
                <span class="${order.status === 'Aguardando' ? 'text-orange-600' : 'text-blue-600'} block mb-1">${order.status}</span>
                ${payStatus}
            </div>
            <div class="col-span-2 p-3 font-bold text-gray-700 border-r">R$ ${order.total.toFixed(2)}</div>
            <div class="col-span-4 p-3 text-xs border-r truncate">
                <div class="font-bold text-gray-800">${order.customer.name}</div>
                <div class="text-gray-500 text-[10px]">${order.items.length} itens</div>
            </div>
            <div class="col-span-2 p-3">${actions}</div>
        `;
        container.appendChild(div);
    });
}

window.atualizarStatus = async (id, status) => {
    try { 
        await updateDoc(doc(db, "pedidos", id), { status }); 
        
        // GATILHO DO BOT: Dispara a mensagem automática conforme o novo status
        if (typeof window.enviarNotificacaoWhats === "function") {
            window.enviarNotificacaoWhats(id, status);
        }
        
    } catch(e) { console.error(e); }
}

window.filtrarStatus = (filtro) => {
    currentStatusFilter = filtro;
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
    container.innerHTML = '';
    if(!tablesConfig.environments) return;
    tablesConfig.environments.forEach(env => {
        const btn = document.createElement('div');
        btn.className = `env-btn ${env.id === currentEnvId ? 'active' : ''}`;
        btn.innerHTML = `<span>${env.name}</span> <span class="bg-black/10 px-2 rounded-full text-[10px]">${env.tables.length}</span>`;
        btn.onclick = () => { currentEnvId = env.id; renderizarAmbientes(); };
        container.appendChild(btn);
    });
    const addBtn = document.createElement('div');
    addBtn.className = "env-btn border-dashed text-cyan-600 hover:bg-cyan-50";
    addBtn.innerHTML = `<i class="fas fa-plus"></i> Novo Ambiente`;
    addBtn.onclick = toggleConfigModal;
    container.appendChild(addBtn);
    renderizarGridMesas();
}

function renderizarGridMesas() {
    const container = document.getElementById('tables-grid');
    container.innerHTML = '';
    if(!tablesConfig.environments || tablesConfig.environments.length === 0) return;
    const env = tablesConfig.environments.find(e => e.id === currentEnvId);
    if (!env) return;
    env.tables.forEach(num => {
        const activeOrder = allOrders.find(o => o.method === 'mesa' && o.tableNumber == num && o.status !== 'Finalizado' && o.status !== 'Rejeitado');
        const card = document.createElement('div');
        card.className = `table-card ${activeOrder ? 'occupied' : ''}`;
        let content = `<span class="text-2xl font-bold text-gray-400 group-hover:text-cyan-600">${num}</span>`;
        if (activeOrder) {
            content = `<span class="text-xl font-bold text-red-500">${num}</span><div class="mt-1 flex flex-col items-center"><span class="text-xs font-bold text-gray-700">R$ ${activeOrder.total.toFixed(2)}</span><span class="text-[10px] text-gray-400">Em aberto</span></div>`;
        }
        card.innerHTML = content;
        card.onclick = () => abrirMesaPDV(num, activeOrder); 
        container.appendChild(card);
    });
    const addCard = document.createElement('div');
    addCard.className = "table-card add-new";
    addCard.innerHTML = `<i class="fas fa-plus text-2xl"></i><span class="text-xs font-bold mt-2">Nova mesa</span>`;
    addCard.onclick = toggleConfigModal; 
    container.appendChild(addCard);
}

// PDV Functions
window.abrirMesaPDV = (tableNum, existingOrder) => {
    currentTablePOS = tableNum;
    currentTableOrder = [];
    document.getElementById('pos-table-title').innerText = `Mesa ${tableNum}`;
    if (existingOrder) currentTableOrder = JSON.parse(JSON.stringify(existingOrder.items));
    const catContainer = document.getElementById('pos-categories');
    catContainer.innerHTML = `<button onclick="filtrarProdPDV('all')" class="px-4 py-2 bg-cyan-600 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap hover:bg-cyan-700 transition">Todos</button>`;
    allCategories.forEach(cat => { catContainer.innerHTML += `<button onclick="filtrarProdPDV('${cat.slug}')" class="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 whitespace-nowrap transition">${cat.nome}</button>`; });
    filtrarProdPDV('all');
    atualizarComandaPDV();
    document.getElementById('view-mesas').classList.add('hidden');
    document.getElementById('view-pos').classList.remove('hidden');
    document.getElementById('view-pos').classList.add('flex');
}

window.fecharMesaPDV = () => {
    document.getElementById('view-pos').classList.add('hidden');
    document.getElementById('view-pos').classList.remove('flex');
    document.getElementById('view-mesas').classList.remove('hidden');
    currentTablePOS = null;
}

window.filtrarProdPDV = (cat) => {
    const container = document.getElementById('pos-products-grid');
    container.innerHTML = '';
    const term = document.getElementById('pos-search').value.toLowerCase();
    const filtered = allProducts.filter(p => {
        const matchCat = cat === 'all' || p.category === cat;
        const matchSearch = p.name.toLowerCase().includes(term);
        return matchCat && matchSearch;
    });
    filtered.forEach(p => {
        const el = document.createElement('div');
        el.className = "bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:border-cyan-500 transition flex flex-col items-center text-center h-full";
        el.onclick = () => addItemMesa(p);
        el.innerHTML = `<img src="${p.image || 'https://via.placeholder.com/100'}" class="w-20 h-20 rounded-md object-cover mb-2 bg-gray-100"><h4 class="text-xs font-bold text-gray-800 line-clamp-2 leading-tight">${p.name}</h4><span class="text-cyan-700 font-bold text-sm mt-auto pt-2">R$ ${p.price.toFixed(2)}</span>`;
        container.appendChild(el);
    });
    document.getElementById('pos-search').onkeyup = () => filtrarProdPDV(cat);
}

function addItemMesa(product) {
    const existing = currentTableOrder.find(i => i.originalId === product.id);
    if (existing) existing.quantity++;
    else currentTableOrder.push({ id: Date.now().toString(), originalId: product.id, name: product.name, price: product.price, quantity: 1, details: '' });
    atualizarComandaPDV();
}

function atualizarComandaPDV() {
    const container = document.getElementById('pos-order-items');
    container.innerHTML = '';
    let total = 0;
    if (currentTableOrder.length === 0) container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="fas fa-basket-shopping text-3xl mb-2 opacity-20"></i><p class="text-xs">Comanda vazia</p></div>`;
    currentTableOrder.forEach((item, idx) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        container.innerHTML += `<div class="flex justify-between items-start border-b border-gray-100 pb-2 mb-2"><div class="flex-1"><div class="font-bold text-gray-800 text-sm">${item.name}</div><div class="text-xs text-gray-400">R$ ${item.price.toFixed(2)} un.</div></div><div class="flex items-center gap-2"><div class="flex items-center bg-gray-100 rounded"><button onclick="changePosQtd(${idx}, -1)" class="px-2 text-red-500 font-bold hover:bg-gray-200 rounded-l">-</button><span class="text-xs font-bold w-6 text-center">${item.quantity}</span><button onclick="changePosQtd(${idx}, 1)" class="px-2 text-green-500 font-bold hover:bg-gray-200 rounded-r">+</button></div><span class="text-sm font-bold text-gray-700 w-16 text-right">R$ ${itemTotal.toFixed(2)}</span></div></div>`;
    });
    document.getElementById('pos-subtotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    document.getElementById('pos-total').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

window.changePosQtd = (idx, delta) => {
    const item = currentTableOrder[idx];
    item.quantity += delta;
    if (item.quantity <= 0) currentTableOrder.splice(idx, 1);
    atualizarComandaPDV();
}

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
        const cleanConfig = {
            environments: tablesConfig.environments.map(env => ({
                id: env.id || `env-${Date.now()}`,
                name: env.name || 'Novo Ambiente',
                tables: env.tables.map(t => parseInt(t) || 0)
            }))
        };
        await setDoc(doc(db, "config", "loja_mesas"), cleanConfig);
        tablesConfig = cleanConfig; 
        alert("Configuração salva com sucesso!");
        toggleConfigModal();
        if (!tablesConfig.environments.find(e => e.id === currentEnvId) && tablesConfig.environments.length > 0) currentEnvId = tablesConfig.environments[0].id;
        renderizarAmbientes();
    } catch (e) { console.error(e); alert("Erro ao salvar: " + e.message); }
}
// ===============================================
// LÓGICA DO CARDÁPIO E CONFIGURAÇÕES (NOVO CÓDIGO)
// ===============================================

// 1. GERENCIAR PRODUTOS
// ===============================================
// FUNÇÕES NOVAS (CARDÁPIO, LOJA, ENTREGAS)
// ===============================================

// 1. GERENCIAMENTO DE PRODUTOS
function renderizarListaProdutos() {
    const container = document.getElementById('products-list-container');
    if(!container) return; // Proteção
    container.innerHTML = '';
    
    if(allProducts.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-10">Nenhum produto cadastrado.</div>';
        return;
    }
    
    allProducts.forEach(p => {
        container.innerHTML += `
            <div class="bg-white border rounded-lg p-4 flex items-center justify-between shadow-sm hover:shadow-md transition mb-3">
                <div class="flex items-center gap-4">
                    <img src="${p.image || 'https://via.placeholder.com/100'}" class="w-16 h-16 rounded object-cover bg-gray-100 border">
                    <div>
                        <h4 class="font-bold text-gray-800">${p.name}</h4>
                        <div class="flex gap-2 text-xs text-gray-500">
                            <span class="bg-gray-100 px-2 py-0.5 rounded">${p.category}</span>
                        </div>
                        <p class="font-bold text-cyan-900 mt-1">R$ ${p.price.toFixed(2)}</p>
                    </div>
                </div>
                <button onclick="abrirModalEdicao('${p.id}')" class="text-gray-400 hover:text-cyan-600 p-2 border rounded hover:bg-cyan-50">
                    <i class="fas fa-edit text-lg"></i>
                </button>
            </div>
        `;
    });
}

// Controle de Abas do Modal Produto
window.mudarAba = (aba) => {
    document.getElementById('tab-btn-sobre').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 border-b-2 border-transparent";
    document.getElementById('tab-btn-complementos').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 border-b-2 border-transparent";
    document.getElementById('tab-sobre').classList.add('hidden');
    document.getElementById('tab-complementos').classList.add('hidden');
    
    document.getElementById(`tab-btn-${aba}`).className = "flex-1 py-3 text-sm font-bold text-cyan-700 border-b-2 border-cyan-700 bg-cyan-50";
    document.getElementById(`tab-${aba}`).classList.remove('hidden');
}

window.abrirModalNovoProduto = () => {
    document.getElementById('form-produto').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('edit-image-url').value = '';
    document.getElementById('preview-image').classList.add('hidden');
    document.getElementById('modal-product-title').innerText = "Novo Produto";
    
    // Popula categorias
    const select = document.getElementById('edit-category');
    select.innerHTML = '';
    allCategories.forEach(cat => { select.innerHTML += `<option value="${cat.slug}">${cat.nome}</option>`; });

    mudarAba('sobre');
    document.getElementById('product-modal').classList.remove('hidden');
}

window.abrirModalEdicao = (id) => {
    const p = allProducts.find(x => x.id === id);
    if(!p) return;
    
    // Popula categorias
    const select = document.getElementById('edit-category');
    select.innerHTML = '';
    allCategories.forEach(cat => { select.innerHTML += `<option value="${cat.slug}">${cat.nome}</option>`; });

    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-desc').value = p.description || '';
    document.getElementById('edit-category').value = p.category;
    document.getElementById('edit-image-url').value = p.image || '';
    
    if(p.image) {
        document.getElementById('preview-image').src = p.image;
        document.getElementById('preview-image').classList.remove('hidden');
    } else {
        document.getElementById('preview-image').classList.add('hidden');
    }
    
    document.getElementById('modal-product-title').innerText = "Editar Produto";
    mudarAba('sobre');
    document.getElementById('product-modal').classList.remove('hidden');
}

window.fecharModalProduto = () => document.getElementById('product-modal').classList.add('hidden');

window.handleImageUpload = async (input) => {
    if(input.files && input.files[0]) {
        const file = input.files[0];
        // Mostra status visual simples
        const btn = input.parentElement; 
        btn.style.opacity = '0.5';
        
        try {
            const storageRef = ref(storage, `produtos/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            document.getElementById('edit-image-url').value = url;
            document.getElementById('preview-image').src = url;
            document.getElementById('preview-image').classList.remove('hidden');
        } catch(e) { console.error(e); alert('Erro no upload da imagem'); }
        finally { btn.style.opacity = '1'; }
    }
}

window.salvarProduto = async () => {
    const id = document.getElementById('edit-id').value;
    const data = {
        name: document.getElementById('edit-name').value,
        price: parseFloat(document.getElementById('edit-price').value) || 0,
        description: document.getElementById('edit-desc').value,
        category: document.getElementById('edit-category').value,
        image: document.getElementById('edit-image-url').value
    };
    
    if(!data.name) return alert("Nome é obrigatório");

    try {
        if(id) await updateDoc(doc(db, "produtos", id), data);
        else await addDoc(collection(db, "produtos"), data);
        
        fecharModalProduto();
        // Recarregar lista
        const pSnap = await getDocs(collection(db, "produtos"));
        allProducts = [];
        pSnap.forEach(d => allProducts.push({id: d.id, ...d.data()}));
        renderizarListaProdutos();
        alert("Salvo com sucesso!");
    } catch(e) { console.error(e); alert("Erro ao salvar"); }
}

window.deletarProduto = async () => {
    const id = document.getElementById('edit-id').value;
    if(!id) return;
    if(!confirm("Tem certeza que deseja excluir?")) return;
    try {
        await deleteDoc(doc(db, "produtos", id));
        fecharModalProduto();
        const pSnap = await getDocs(collection(db, "produtos"));
        allProducts = [];
        pSnap.forEach(d => allProducts.push({id: d.id, ...d.data()}));
        renderizarListaProdutos();
    } catch(e) { console.error(e); alert("Erro ao excluir"); }
}

// 2. CONFIGURAÇÕES DA LOJA (BOAS-VINDAS)
window.carregarConfigLoja = async () => {
    try {
        const docSnap = await getDoc(doc(db, "config", "loja"));
        if(docSnap.exists()) {
            const d = docSnap.data();
            document.getElementById('store-title').value = d.titulo || '';
            document.getElementById('store-desc').value = d.descricao || '';
            document.getElementById('store-phone').value = d.whatsapp || '';
            document.getElementById('store-toggle').checked = d.aberto || false;
        }
    } catch(e) { console.error(e); }
}

window.salvarConfigLoja = async () => {
    const data = {
        titulo: document.getElementById('store-title').value,
        descricao: document.getElementById('store-desc').value,
        whatsapp: document.getElementById('store-phone').value,
        aberto: document.getElementById('store-toggle').checked
    };
    await setDoc(doc(db, "config", "loja"), data);
    alert("Configurações salvas!");
}

// 3. CONFIGURAÇÕES DE PEDIDOS
window.carregarConfigPedidos = async () => {
    try {
        const docSnap = await getDoc(doc(db, "config", "pedidos"));
        if(docSnap.exists()) {
            const d = docSnap.data();
            if(document.getElementById('cfg-delivery-active')) document.getElementById('cfg-delivery-active').checked = d.delivery !== false;
            if(document.getElementById('cfg-accept-orders')) document.getElementById('cfg-accept-orders').checked = d.accept !== false;
            if(document.getElementById('cfg-whatsapp-number')) document.getElementById('cfg-whatsapp-number').value = d.whatsapp || '';
            
            // Label de preço de entrega
            const labels = { 'free': 'Sem preço', 'fixed': 'Preço fixo', 'district': 'Por Bairro', 'distance': 'Por Distância' };
            if(d.deliveryMode && document.getElementById('delivery-price-label')) {
                document.getElementById('delivery-price-label').innerText = labels[d.deliveryMode] || 'Sem preço';
            }
            
            aplicarEstiloImpressao(d.paperSize);
        }
    } catch(e) { console.error(e); }
}

window.salvarConfigPedidos = async () => {
    const data = {
        accept: document.getElementById('cfg-accept-orders')?.checked,
        receiveMode: document.querySelector('input[name="receive-mode"]:checked')?.value,
        whatsapp: document.getElementById('cfg-whatsapp-number')?.value,
        entryStatus: document.querySelector('input[name="entry-status"]:checked')?.value,
        
        ticketBooster: document.getElementById('cfg-ticket-booster')?.checked,
        
        delivery: document.getElementById('cfg-delivery-active')?.checked,
        pickup: document.getElementById('cfg-pickup-active')?.checked,
        
        localService: {
            active: document.getElementById('cfg-local-active')?.checked,
            qrType: document.querySelector('input[name="qr-type"]:checked')?.value,
            askName: document.getElementById('cfg-ask-name')?.checked,
            scheduled: document.getElementById('cfg-scheduled-orders')?.checked
        },
        
        tableService: {
            feeActive: document.getElementById('cfg-table-service-fee')?.checked,
            feeValue: parseFloat(document.getElementById('cfg-table-fee-value')?.value) || 0
        },
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "config", "pedidos"), data, { merge: true });
        alert("Configurações salvas com sucesso!");
    } catch(e) { 
        console.error(e); 
        alert("Erro ao salvar configurações.");
    }
}

// 4. CONFIGURAÇÃO DE ENTREGA (MODAL)
window.selectDeliveryOption = (el, type) => {
    document.querySelectorAll('.delivery-option-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    el.dataset.selectedType = type;

    // Abre o sub-modal específico conforme a escolha (Img 3 e 4)
    if (type === 'fixed') {
        document.getElementById('modal-fixed-price').classList.remove('hidden');
    } else if (type === 'district') {
        document.getElementById('modal-neighborhood-price').classList.remove('hidden');
        // Carrega os bairros já salvos para edição
        if (configPedidos.deliveryDistricts) {
            localBairros = [...configPedidos.deliveryDistricts];
            renderListaBairros();
        }
    }
}

window.salvarConfigEntrega = async () => {
    const selected = document.querySelector('.delivery-option-card.selected');
    if(!selected) return;
    
    const type = selected.dataset.selectedType;
    await setDoc(doc(db, "config", "pedidos"), { deliveryMode: type }, { merge: true });
    
    document.getElementById('delivery-settings-modal').classList.add('hidden');
    carregarConfigPedidos(); 
    alert("Configuração de entrega salva!");
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
window.salvarConfigPedidos = async () => {
    const data = {
        accept: document.getElementById('cfg-accept-orders')?.checked,
        delivery: document.getElementById('cfg-delivery-active')?.checked,
        pickup: document.getElementById('cfg-pickup-active')?.checked,
        // Opções avançadas
        delivMin: parseFloat(document.getElementById('cfg-deliv-min').value) || 0,
        delivFreeAbove: parseFloat(document.getElementById('cfg-deliv-free').value) || 0,
        pickupSched: document.getElementById('cfg-pick-sched').checked,
        tableFee: parseFloat(document.getElementById('cfg-table-fee-value')?.value) || 0,
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "config", "pedidos"), data, { merge: true });
        // TIREI O ALERT E COLOQUEI O TOAST (Img 2)
        showToast("Sucesso", "Configurações salvas com sucesso!");
    } catch(e) { 
        showToast("Erro", "Não foi possível salvar.", true);
    }
}

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
let localBairros = [];

window.adicionarBairroLista = () => {
    const nome = document.getElementById('bairro-nome').value;
    const custo = parseFloat(document.getElementById('bairro-custo').value) || 0;
    
    if(!nome) return;
    
    localBairros.push({ nome, custo });
    renderListaBairros();
    document.getElementById('bairro-nome').value = '';
    document.getElementById('bairro-custo').value = '';
};

function renderListaBairros() {
    const container = document.getElementById('lista-bairros-config');
    container.innerHTML = localBairros.map((b, idx) => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border mb-2">
            <span class="font-bold text-sm text-gray-700">${b.nome}</span>
            <div class="flex items-center gap-4">
                <span class="font-bold text-cyan-700">R$ ${b.custo.toFixed(2)}</span>
                <button onclick="localBairros.splice(${idx}, 1); renderListaBairros();" class="text-red-500">
                    <i class="fas fa-times"></i>
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
