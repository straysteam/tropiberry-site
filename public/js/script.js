import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, // ADICIONE ISSO AQUI
    serverTimestamp, 
    query, 
    orderBy, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { monitorarEstadoAuth, fazerLogout, verificarAdminNoBanco, db as authDb } from './auth.js'; 
import { renderizarHeaderGlobal } from './components.js'; 

let currentUserIsAdmin = false;
// Usa o banco já inicializado no auth.js
let db = authDb; 

let products = [];
let categories = []; 
let cart = [];
let isStoreOpen = true; 
let currentOrder = { method: '', customer: {}, items: [], total: 0 };
let currentProductDetail = null;
let currentComplements = []; 
let selectedOptions = {}; 
let currentQtd = 1;
let configPedidos = {};
let currentDeliveryFee = 0;

// CACHE GLOBAL DE COMPLEMENTOS
let globalComplements = {}; 

// === MAPA DE ESTILOS DAS TAGS ===
const TAG_CONFIG = {
    'Bebida gelada': { icon: 'fas fa-snowflake', classes: 'bg-blue-100 text-blue-600 border border-blue-200' },
    'Vegano': { icon: 'fas fa-leaf', classes: 'bg-green-100 text-green-700 border border-green-200' },
    'Vegetariano': { icon: 'fas fa-seedling', classes: 'bg-green-50 text-green-600 border border-green-200' },
    'Sem açúcar': { icon: 'fas fa-ban', classes: 'bg-gray-100 text-gray-600 border border-gray-200' },
    'Promoção': { icon: 'fas fa-percent', classes: 'bg-orange-100 text-orange-600 border border-orange-200' },
    'Ofertão': { icon: 'fas fa-fire', classes: 'bg-red-100 text-red-600 border border-red-200' },
    'Mais Vendido': { icon: 'fas fa-star', classes: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
    'Natural': { icon: 'fas fa-carrot', classes: 'bg-emerald-100 text-emerald-600 border border-emerald-200' },
    'Para Compartilhar': { icon: 'fas fa-users', classes: 'bg-purple-100 text-purple-600 border border-purple-200' },
    'default': { icon: 'fas fa-tag', classes: 'bg-gray-100 text-gray-600 border border-gray-200' }
};

// Funções Globais
window.renderProducts = renderProducts;
window.addToCart = addToCart;
window.changeQuantity = changeQuantity;
window.toggleCart = toggleCart;
window.toggleStoreStatus = toggleStoreStatus;
window.toggleInfoModal = toggleInfoModal;
window.startCheckout = startCheckout;
window.closeCheckout = closeCheckout;
window.selectService = selectService;
window.goToPaymentMethod = goToPaymentMethod;
window.processPayment = processPayment;
window.useSavedAddress = useSavedAddress;
window.closeOrderScreen = closeOrderScreen;
window.fazerLogout = fazerLogout;
window.compartilharSite = compartilharSite;
window.abrirEditorInformacoes = abrirEditorInformacoes;
window.salvarInformacoesLoja = salvarInformacoesLoja;
window.mudarQtdDetalhe = mudarQtdDetalhe;
window.adicionarAoCarrinhoDetalhado = adicionarAoCarrinhoDetalhado;
window.toggleOption = toggleOption;
window.abrirModalRapido = abrirModalRapido;
window.fecharModalRapido = fecharModalRapido;

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', async () => {

    // 1. Renderiza o Header (Isso cria a div 'auth-buttons-container')
    renderizarHeaderGlobal();

    if (window.location.pathname.includes('produto.html')) {
        const params = new URLSearchParams(window.location.search);
        const productId = params.get('id');
        if (productId) {
            setTimeout(() => carregarPaginaProduto(productId), 500);
        } else {
            window.location.href = 'cardapio.html';
        }
    }

    await carregarCategoriasSite();
    
    // Inicia monitoramento
    monitorarComplementosGlobal(); 
    carregarProdutosDoBanco();
    monitorarStatusLojaNoBanco();
    
    // 2. Monitora o Login e preenche os botões no Header
    monitorarEstadoAuth(async (user) => {
        const container = document.getElementById('auth-buttons-container');
        if(!container) return;

        if (user) {
            currentUserIsAdmin = await verificarAdminNoBanco(user.email);
            
            // --- AQUI ESTÁ A MUDANÇA ---
            let adminButtons = '';
            if (currentUserIsAdmin) {
                adminButtons = `
                    <div class="hidden md:flex gap-2 ml-2">
                        <a href="dashboard.html" class="bg-cyan-900 border border-cyan-400 text-white text-[10px] px-3 py-1 rounded-lg font-bold uppercase shadow-sm hover:bg-cyan-800 flex items-center gap-1">
                            <i class="fas fa-columns"></i> Dashboard
                        </a>
                        <a href="admin.html" class="bg-cyan-700 border border-cyan-400 text-yellow-400 text-[10px] px-3 py-1 rounded-lg font-bold uppercase shadow-sm hover:bg-cyan-600">
                            Painel Admin
                        </a>
                    </div>
                `;
            }
            // ---------------------------
            
            container.innerHTML = `
                <div class="flex items-center">
                    <span class="text-xs font-bold text-white hidden md:block mr-2">Olá, ${user.displayName || user.email.split('@')[0]}</span>
                    ${adminButtons}
                    <button onclick="fazerLogout()" class="bg-red-500/80 hover:bg-red-500 text-white text-xs px-3 py-1 ml-2 rounded-full font-bold transition">Sair</button>
                </div>`;
                
            atualizarInteratividadeBotaoLoja();
            atualizarElementosAdminUI();
            if(currentProductDetail) verificarBotaoAdmin(currentProductDetail.id);
        } else {
            // ... (código de quando não está logado continua igual) ...
            currentUserIsAdmin = false;
            container.innerHTML = `
                <a href="login.html" class="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1 rounded-full font-bold transition">Entrar</a>
                <a href="cadastro.html" class="bg-yellow-400 hover:bg-yellow-300 text-cyan-900 text-xs px-3 py-1 rounded-full font-bold transition">Cadastrar</a>
            `;
            atualizarInteratividadeBotaoLoja();
            atualizarElementosAdminUI();
        }
    });

    updateStoreStatusUI();
    checkLastOrder();
});

// === FUNÇÃO REUTILIZÁVEL: GERA AS TAGS ===
function gerarHTMLTags(tags) {
    if (!tags || tags.length === 0) return '';
    let html = '<div class="flex flex-wrap gap-2 mt-2">';
    tags.forEach(tag => {
        const style = TAG_CONFIG[tag] || TAG_CONFIG['default'];
        html += `
            <span class="${style.classes} text-[10px] font-bold px-2 py-1 rounded-full shadow-sm uppercase flex items-center gap-1">
                <i class="${style.icon}"></i> ${tag}
            </span>`;
    });
    html += '</div>';
    return html;
}

// === NOVO: MONITORAMENTO DE COMPLEMENTOS PARA O CARDÁPIO ===
function monitorarComplementosGlobal() {
    if(!db) return;
    onSnapshot(collection(db, "complementos"), (snapshot) => {
        globalComplements = {};
        snapshot.forEach(doc => {
            globalComplements[doc.id] = { id: doc.id, ...doc.data() };
        });
        // Se já tiver produtos carregados, atualiza o grid para corrigir preços
        if(products.length > 0) {
            const activeFilter = document.querySelector('.btn-filter.bg-cyan-600')?.getAttribute('data-cat') || null;
            renderProducts('product-grid', activeFilter);
        }
    });
}

// === RENDERIZAR CARDS (LISTAGEM) ===
function renderProducts(containerId, filterCategory) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const filtered = filterCategory ? products.filter(p => p.category === filterCategory) : products;

    if(window.location.pathname.includes('cardapio.html')) {
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const btnCat = btn.getAttribute('data-cat');
            if(btnCat === (filterCategory || 'all')) btn.className = "btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md";
            else btn.className = "btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition";
        });
    }

    if (filtered.length === 0) {
        // Se a lista estiver vazia (mas o array products tem itens), significa que o filtro não achou nada
        if (products.length > 0) {
             container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">Nenhum produto nesta categoria.</div>`;
        } else {
             // Se products estiver vazio mesmo, é pq ainda está carregando ou não tem nada no banco
             container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 flex flex-col items-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mb-2"></div>Carregando cardápio...</div>`;
        }
        return;
    }

    container.innerHTML = filtered.map(product => {
        // === LÓGICA DO PREÇO INTELIGENTE (FILTRO EMBALAGEM) ===
        const hasComplements = product.complementIds && product.complementIds.length > 0;
        let prefixPrice = hasComplements ? '<span class="text-[10px] text-gray-500 font-normal mr-1 block">A partir de</span>' : '';
        
        let displayPrice = parseFloat(product.price);

        // Se o preço for 0, busca o custo da EMBALAGEM
        if (displayPrice === 0 && hasComplements) {
            let minPackagingCost = 0;
            product.complementIds.forEach(grpId => {
                const group = globalComplements[grpId];
                
                // SÓ SOMA SE FOR OBRIGATÓRIO E A CATEGORIA FOR 'EMBALAGEM'
                if (group && group.required && group.internalCategory === 'embalagem' && group.options && group.options.length > 0) {
                    // Pega o menor preço dentro deste grupo
                    const cheapestOption = group.options.reduce((min, opt) => (opt.price < min ? opt.price : min), Infinity);
                    if (cheapestOption !== Infinity) {
                        minPackagingCost += cheapestOption;
                    }
                }
            });
            
            // Se achou custo de embalagem, usa ele
            if (minPackagingCost > 0) displayPrice = minPackagingCost;
        }

        let priceValueHtml = `R$ ${displayPrice.toFixed(2).replace('.',',')}`;

        let priceHtml = product.originalPrice && product.originalPrice > product.price 
            ? `<div class="flex flex-col items-end"><span class="text-xs text-gray-400 line-through">R$ ${parseFloat(product.originalPrice).toFixed(2).replace('.',',')}</span><span class="text-lg font-extrabold text-green-600 flex flex-col items-end leading-none">${prefixPrice}${priceValueHtml}</span></div>`
            : `<div class="flex flex-col items-end leading-none">${prefixPrice}<span class="text-lg font-extrabold text-cyan-900">${priceValueHtml}</span></div>`;

        // Tags
        let tagsHtml = '';
        if (product.tags && product.tags.length > 0) {
            tagsHtml = '<div class="flex flex-wrap gap-1 mt-2 mb-1">'; 
            product.tags.forEach(tag => {
                const style = TAG_CONFIG[tag] || TAG_CONFIG['default'];
                tagsHtml += `<span class="${style.classes} text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase flex items-center gap-1"><i class="${style.icon}"></i> ${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        let extraInfo = '';
        if(product.serves && product.serves > 1) extraInfo += `<span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mr-2"><i class="fas fa-user-friends text-cyan-600"></i> Serve ${product.serves}</span>`;
        if(product.weight) extraInfo += `<span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded"><i class="fas fa-weight-hanging text-cyan-600"></i> ${product.weight}${product.unit}</span>`;

        return `
        <div onclick="window.location.href='produto.html?id=${product.id}'" class="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col h-full border border-gray-100 relative cursor-pointer">
            <div class="h-40 relative overflow-hidden">
                <img src="${product.image || 'https://via.placeholder.com/300'}" alt="${product.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            
            <div class="p-4 flex flex-col justify-between flex-grow">
                <div>
                    <div class="flex justify-between items-start">
                        <div class="flex-1 mr-2">
                            <h3 class="text-lg font-bold text-cyan-900 leading-tight mb-1">${product.name}</h3>
                            ${tagsHtml}
                        </div>
                        ${priceHtml}
                    </div>
                    
                    <div class="mb-2 mt-2 flex flex-wrap gap-1">${extraInfo}</div>
                    <p class="text-gray-500 text-xs line-clamp-2 mb-3">${product.description || ''}</p>
                </div>
                
                <button onclick="event.stopPropagation(); abrirModalRapido('${product.id}')" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-md mt-auto text-sm">
                    <i class="fas fa-plus-circle"></i>
                    <span>Escolher</span>
                </button>
            </div>
        </div>
    `}).join('');
}

// === LÓGICA DO MODAL RÁPIDO & PÁGINA DE PRODUTO ===
async function carregarDadosProduto(id, containerPrefix) {
    if (!db) return;
    
    // IDs de controle de UI
    const loadingEl = document.getElementById(`${containerPrefix}-loading`);
    const contentEl = document.getElementById(`${containerPrefix}-content`);
    const detailContainer = document.getElementById('product-detail-container'); 
    
    if(loadingEl) loadingEl.classList.remove('hidden');
    if(contentEl) contentEl.classList.add('hidden');
    if(containerPrefix === 'detail' && detailContainer) detailContainer.classList.add('hidden');

    try {
        const docRef = doc(db, "produtos", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            if(loadingEl) loadingEl.innerHTML = '<p class="text-red-500">Produto não encontrado.</p>';
            return;
        }

        currentProductDetail = { id: docSnap.id, ...docSnap.data() };
        currentQtd = 1; 
        selectedOptions = {}; 

        // Preenche Imagem e Textos
        document.getElementById(`${containerPrefix}-img`).src = currentProductDetail.image || 'https://via.placeholder.com/400';
        document.getElementById(`${containerPrefix}-name`).innerText = currentProductDetail.name;
        document.getElementById(`${containerPrefix}-desc`).innerText = currentProductDetail.description || '';
        
        // Tags
        const tagsContainer = document.getElementById(`${containerPrefix}-tags`);
        if(tagsContainer && currentProductDetail.tags) {
            tagsContainer.innerHTML = generatingTagsHTML(currentProductDetail.tags);
        }

        // Info Extra
        const infoContainer = document.getElementById(`${containerPrefix}-extra-info`);
        if(infoContainer) {
            let infoHtml = '';
            if(currentProductDetail.serves > 1) infoHtml += `<span class="bg-blue-50 text-cyan-800 text-xs font-bold px-3 py-1 rounded-lg"><i class="fas fa-user-friends"></i> Serve ${currentProductDetail.serves}</span>`;
            if(currentProductDetail.weight) infoHtml += `<span class="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-lg"><i class="fas fa-weight-hanging"></i> ${currentProductDetail.weight}${currentProductDetail.unit}</span>`;
            infoHtml += `<span class="bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-lg"><i class="fas fa-motorcycle"></i> Entrega Disponível</span>`;
            infoContainer.innerHTML = infoHtml;
        }

        // --- CÁLCULO DE COMPLEMENTOS E PREÇO (FILTRO EMBALAGEM) ---
        const compsContainer = document.getElementById(`${containerPrefix}-complements`) || document.getElementById('complements-section');
        let minPackagingCost = 0; // Valor a somar apenas se for embalagem

        if (currentProductDetail.complementIds && currentProductDetail.complementIds.length > 0) {
            // Carrega visualmente E calcula o preço da embalagem
            minPackagingCost = await carregarComplementosDoProduto(currentProductDetail.complementIds, compsContainer, containerPrefix);
        } else {
            if(compsContainer) compsContainer.innerHTML = '';
        }

        // Define Preço para Exibição
        // Se o preço base for 0, usamos o mínimo APENAS das embalagens
        let basePriceDisplay = currentProductDetail.price;
        if (basePriceDisplay === 0 && minPackagingCost > 0) {
            basePriceDisplay = minPackagingCost;
        }

        const priceEl = document.getElementById(`${containerPrefix}-price`);
        const hasComplements = currentProductDetail.complementIds && currentProductDetail.complementIds.length > 0;
        
        if(priceEl) {
             if(hasComplements) {
                 priceEl.innerHTML = `<span class="text-sm text-gray-500 font-normal mr-1">A partir de</span> R$ ${basePriceDisplay.toFixed(2).replace('.', ',')}`;
             } else {
                 priceEl.innerText = `R$ ${basePriceDisplay.toFixed(2).replace('.', ',')}`;
             }
        }

        // Preço Original
        const op = document.getElementById(`${containerPrefix}-original-price`);
        if (op) {
            if (currentProductDetail.originalPrice > basePriceDisplay) {
                op.innerText = `R$ ${currentProductDetail.originalPrice.toFixed(2).replace('.', ',')}`;
                op.classList.remove('hidden');
            } else {
                op.classList.add('hidden');
            }
        }

        // Qtd
        const qtdEl = document.getElementById(`${containerPrefix}-qtd`);
        if(qtdEl) qtdEl.innerText = '1';

        // Mostra
        if(loadingEl) loadingEl.classList.add('hidden');
        if(contentEl) contentEl.classList.remove('hidden');
        if(containerPrefix === 'detail' && detailContainer) detailContainer.classList.remove('hidden');

        atualizarTotalDetalhe(containerPrefix);
        if(containerPrefix === 'detail') verificarBotaoAdmin(id);

    } catch (e) {
        console.error("Erro ao carregar produto:", e);
        if(loadingEl) loadingEl.innerHTML = '<p class="text-red-500">Erro ao carregar.</p>';
    }
}

// Helper para tags
function generatingTagsHTML(tags) {
    if(!tags) return '';
    let html = '';
    tags.forEach(tag => {
        const style = TAG_CONFIG[tag] || TAG_CONFIG['default'];
        html += `<span class="${style.classes} text-[10px] font-bold px-2 py-1 rounded-full shadow-sm uppercase flex items-center gap-1 w-max"><i class="${style.icon}"></i> ${tag}</span>`;
    });
    return html;
}

// Wrappers
async function abrirModalRapido(id) {
    const modal = document.getElementById('quick-view-modal');
    if(!modal) return;
    modal.classList.remove('hidden');
    await carregarDadosProduto(id, 'modal');
}
function fecharModalRapido() {
    const modal = document.getElementById('quick-view-modal');
    if(modal) modal.classList.add('hidden');
}
async function carregarPaginaProduto(id) {
    await carregarDadosProduto(id, 'detail');
}

// Carregar Complementos e Retornar Mínimo Obrigatório
async function carregarComplementosDoProduto(ids, containerElement, prefix) {
    if(!containerElement) return 0;
    containerElement.innerHTML = '';
    currentComplements = [];
    let packagingMinPrice = 0; // Soma apenas embalagens

    for (const groupId of ids) {
        try {
            const groupSnap = await getDoc(doc(db, "complementos", groupId));
            if (groupSnap.exists()) {
                const group = { id: groupSnap.id, ...groupSnap.data() };
                currentComplements.push(group);
                renderizarGrupoComplemento(group, containerElement, prefix);

                // AQUI A MÁGICA: Só soma ao "A partir de" se for 'embalagem'
                if (group.required && group.internalCategory === 'embalagem' && group.options && group.options.length > 0) {
                    const cheapestOption = group.options.reduce((min, opt) => (opt.price < min.price ? opt : min), group.options[0]);
                    packagingMinPrice += (cheapestOption.price || 0);
                }
            }
        } catch (e) { console.error(e); }
    }
    return packagingMinPrice;
}

function renderizarGrupoComplemento(group, container, prefix) {
    const isRequired = group.required;
    const type = group.max > 1 ? 'checkbox' : 'radio';
    
    let optionsHtml = '';
    group.options.forEach((opt, index) => {
        const uniqueId = `${prefix}-g-${group.id}-opt-${index}`; 
        const priceHtml = opt.price > 0 ? `<span class="text-cyan-700 font-bold">+ R$ ${opt.price.toFixed(2).replace('.',',')}</span>` : '<span class="text-green-600 font-bold text-xs">Grátis</span>';
        
        optionsHtml += `
            <label class="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-cyan-50 transition mb-2 bg-white" for="${uniqueId}">
                <div class="flex items-center gap-3">
                    <input type="${type}" name="${prefix}-group-${group.id}" id="${uniqueId}" 
                        value="${index}" 
                        onchange="toggleOption('${group.id}', ${index}, '${type}', '${prefix}')"
                        class="w-5 h-5 text-cyan-600 focus:ring-cyan-500 border-gray-300 ${type === 'radio' ? '' : 'rounded'}">
                    
                    ${opt.image ? `<img src="${opt.image}" class="w-10 h-10 rounded object-cover border">` : ''}
                    
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-700 text-sm">${opt.name}</span>
                    </div>
                </div>
                ${priceHtml}
            </label>
        `;
    });

    const html = `
        <div class="bg-gray-50 p-4 rounded-xl border border-gray-200" id="${prefix}-group-card-${group.id}">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-bold text-cyan-900 text-lg">${group.title}</h3>
                    <p class="text-xs text-gray-500">
                        ${isRequired ? '<span class="text-red-500 font-bold">OBRIGATÓRIO</span>' : '<span class="text-gray-400">Opcional</span>'} 
                        • Escolha até ${group.max}
                    </p>
                </div>
                <div id="${prefix}-badge-${group.id}" class="bg-gray-200 text-gray-500 text-[10px] px-2 py-1 rounded uppercase font-bold">
                    Pendente
                </div>
            </div>
            <div class="flex flex-col">
                ${optionsHtml}
            </div>
        </div>
    `;
    container.innerHTML += html;
}

function toggleOption(groupId, optIndex, type, prefix) {
    const group = currentComplements.find(g => g.id === groupId);
    if (!group) return;

    if (!selectedOptions[groupId]) selectedOptions[groupId] = [];
    const optionData = group.options[optIndex];

    if (type === 'radio') {
        selectedOptions[groupId] = [optionData];
    } else {
        const existingIndex = selectedOptions[groupId].findIndex(o => o.name === optionData.name);
        if (existingIndex > -1) selectedOptions[groupId].splice(existingIndex, 1);
        else {
            if (selectedOptions[groupId].length < group.max) selectedOptions[groupId].push(optionData);
            else {
                alert(`Máximo de ${group.max} opções.`);
                setTimeout(() => {
                   const checkbox = document.querySelector(`input[id="${prefix}-g-${groupId}-opt-${optIndex}"]`);
                   if(checkbox) checkbox.checked = false;
                }, 50);
                return;
            }
        }
    }
    validarGrupo(group, prefix);
    atualizarTotalDetalhe(prefix);
}

function validarGrupo(group, prefix) {
    const selected = selectedOptions[group.id] || [];
    const card = document.getElementById(`${prefix}-group-card-${group.id}`);
    const badge = document.getElementById(`${prefix}-badge-${group.id}`);
    if(!card || !badge) return;

    const isValid = group.required ? selected.length >= (group.min || 1) : true;

    if (isValid) {
        card.classList.remove('border-red-300', 'bg-red-50'); card.classList.add('border-green-300', 'bg-green-50');
        badge.className = "bg-green-500 text-white text-[10px] px-2 py-1 rounded uppercase font-bold"; badge.innerText = "OK";
    } else {
        card.classList.remove('border-green-300', 'bg-green-50');
        badge.className = "bg-gray-200 text-gray-500 text-[10px] px-2 py-1 rounded uppercase font-bold"; badge.innerText = "Pendente";
    }
}

function atualizarTotalDetalhe(prefix) {
    let addonsTotal = 0;
    Object.values(selectedOptions).forEach(list => list.forEach(opt => addonsTotal += (opt.price || 0)));

    const unitPrice = (currentProductDetail.price + addonsTotal);
    const finalTotal = unitPrice * currentQtd;

    const btn = document.getElementById(`${prefix}-total-btn`);
    if(btn) btn.innerText = `R$ ${finalTotal.toFixed(2).replace('.', ',')}`;
    
    // Atualiza botão mobile se estiver na página
    if(prefix === 'detail') {
        const btnMob = document.getElementById('detail-total-mobile');
        if(btnMob) btnMob.innerText = `R$ ${finalTotal.toFixed(2).replace('.', ',')}`;
    }

    const allRequiredMet = currentComplements.every(g => {
        if (!g.required) return true;
        const selected = selectedOptions[g.id] || [];
        return selected.length >= (g.min || 1);
    });

    const addBtn = document.getElementById(`${prefix}-btn-add`) || document.getElementById('btn-add-cart-detail');
    if(addBtn) {
        addBtn.disabled = !allRequiredMet;
        if(!allRequiredMet) addBtn.classList.add('opacity-50', 'cursor-not-allowed');
        else addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function mudarQtdDetalhe(delta, prefix = 'detail') {
    if(!prefix) prefix = (!document.getElementById('quick-view-modal').classList.contains('hidden')) ? 'modal' : 'detail';
    
    const novo = currentQtd + delta;
    if (novo >= 1) {
        currentQtd = novo;
        const el = document.getElementById(`${prefix}-qtd`);
        if(el) el.innerText = currentQtd;
        
        if(prefix === 'detail') {
            const elMob = document.getElementById('detail-qtd-mobile');
            if(elMob) elMob.innerText = currentQtd;
        }
        
        atualizarTotalDetalhe(prefix);
    }
}

function adicionarAoCarrinhoDetalhado() {
    if (!currentProductDetail) return;

    let complementsDescription = [];
    let addonsTotalPrice = 0;

    Object.values(selectedOptions).forEach(list => {
        list.forEach(opt => {
            complementsDescription.push(opt.name);
            addonsTotalPrice += (opt.price || 0);
        });
    });

    let obs = '';
    const modalObs = document.getElementById('modal-obs');
    const detailObs = document.getElementById('detail-obs');
    
    if(!document.getElementById('quick-view-modal').classList.contains('hidden') && modalObs) {
        obs = modalObs.value;
    } else if (detailObs) {
        obs = detailObs.value;
    }

    if (obs) complementsDescription.push(`Obs: ${obs}`);

    const hasComplements = complementsDescription.length > 0;
    const cartItemId = hasComplements ? `${currentProductDetail.id}-${Date.now()}` : currentProductDetail.id;

    const cartItem = {
        id: cartItemId,
        originalId: currentProductDetail.id,
        name: currentProductDetail.name,
        price: currentProductDetail.price + addonsTotalPrice, 
        image: currentProductDetail.image,
        quantity: currentQtd,
        details: complementsDescription.join(', ') 
    };

    cart.push(cartItem);
    updateCartUI();
    showToast("Adicionado ao pedido!");
    
    fecharModalRapido();
    setTimeout(() => toggleCart(), 500);
}

function carregarProdutosDoBanco() {
    if(!db) return;
    const colRef = collection(db, "produtos");
    onSnapshot(colRef, (snapshot) => {
        products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        const grid = document.getElementById('product-grid');
        if (grid) {
            if (window.location.pathname.includes('cardapio.html')) { renderProducts('product-grid', null); } 
            else { renderProducts('product-grid', 'destaques'); }
        }
    });
}
async function carregarCategoriasSite() {
    if(!db) return;
    try {
        const q = query(collection(db, "categorias"), orderBy("nome"));
        const snapshot = await getDocs(q);
        categories = [];
        snapshot.forEach(doc => categories.push(doc.data()));
        if(window.location.pathname.includes('cardapio.html')) { renderizarBotoesCategorias(); }
    } catch(e) { console.error("Erro categorias:", e); }
}
function renderizarBotoesCategorias() {
    const container = document.querySelector('section .flex.flex-wrap'); 
    if(!container) return;
    let html = `<button onclick="renderProducts('product-grid', null)" class="btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition" data-cat="all">Todos</button>`;
    categories.forEach(cat => { html += `<button onclick="renderProducts('product-grid', '${cat.slug}')" class="btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition" data-cat="${cat.slug}">${cat.nome}</button>`; });
    container.innerHTML = html;
}
function monitorarStatusLojaNoBanco() {
    if(!db) return;
    try {
        const docRef = doc(db, "config", "loja");
        onSnapshot(docRef, (docSnap) => { if (docSnap.exists()) { isStoreOpen = docSnap.data().aberto; updateStoreStatusUI(); } });
    } catch (e) { console.error(e); }
}
async function toggleStoreStatus() {
    if (!currentUserIsAdmin) return showToast("Apenas a loja pode alterar isso!", true);
    try { await setDoc(doc(db, "config", "loja"), { aberto: !isStoreOpen, modificadoPor: "Admin", data: serverTimestamp() }); showToast(!isStoreOpen ? "Loja Aberta!" : "Loja Fechada!"); } catch (error) { showToast("Erro de permissão!", true); }
}
function updateStoreStatusUI() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('store-status-btn');
    const banner = document.getElementById('closed-banner');
    if(!indicator) return;
    if (isStoreOpen) {
        indicator.className = "w-2 h-2 rounded-full bg-green-400 animate-pulse"; text.innerText = "ABERTO";
        btn.className = `px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-2 ${currentUserIsAdmin ? 'cursor-pointer hover:scale-105' : 'cursor-default'} border-green-400 bg-green-600 text-green-100`;
        if(banner) banner.classList.add('hidden');
    } else {
        indicator.className = "w-2 h-2 rounded-full bg-red-500"; text.innerText = "FECHADO";
        btn.className = `px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-2 ${currentUserIsAdmin ? 'cursor-pointer hover:scale-105' : 'cursor-default'} border-red-400 bg-red-600 text-red-100`;
        if(banner) banner.classList.remove('hidden');
    }
}
function atualizarInteratividadeBotaoLoja() {
    const storeBtn = document.getElementById('store-status-btn'); if(!storeBtn) return;
    if(currentUserIsAdmin) { storeBtn.classList.remove('cursor-default'); storeBtn.classList.add('cursor-pointer'); } 
    else { storeBtn.classList.remove('cursor-pointer'); storeBtn.classList.add('cursor-default'); }
    updateStoreStatusUI();
}
function atualizarElementosAdminUI() {
    const adminActionsInfo = document.getElementById('admin-info-actions');
    const btnOpenEditor = document.getElementById('btn-open-menu-editor');
    if (adminActionsInfo) adminActionsInfo.classList.toggle('hidden', !currentUserIsAdmin);
    if (btnOpenEditor) {
        if (currentUserIsAdmin) { btnOpenEditor.classList.remove('hidden'); btnOpenEditor.onclick = function() { window.location.href = 'admin.html'; }; } 
        else { btnOpenEditor.classList.add('hidden'); }
    }
}
function toggleInfoModal() { const modal = document.getElementById('info-modal'); if(modal) modal.classList.toggle('hidden'); document.getElementById('edit-info-modal')?.classList.add('hidden'); }
function compartilharSite() { const text = "Venha conhecer a TropiBerry!"; const url = window.location.origin; if (navigator.share) navigator.share({ title: 'TropiBerry', text, url }).catch((e) => {}); else navigator.clipboard.writeText(`${text} ${url}`).then(() => showToast("Link copiado!"), () => {}); }
function abrirEditorInformacoes() { document.getElementById('edit-address-input').value = document.getElementById('info-address').innerText; document.getElementById('edit-hours-input').value = document.getElementById('info-hours').innerText.replace('<br>', '\n'); document.getElementById('edit-phone-input').value = document.getElementById('info-phone').innerText; document.getElementById('edit-info-modal').classList.remove('hidden'); }
function salvarInformacoesLoja() { if (!currentUserIsAdmin) return showToast("Sem permissão.", true); showToast("Simulação: Informações salvas!"); document.getElementById('edit-info-modal').classList.add('hidden'); toggleInfoModal(); }
function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification'); const msgElement = document.getElementById('toast-message'); const titleElement = toast.querySelector('p.font-bold'); const iconElement = toast.querySelector('i');
    if (toast && msgElement) {
        msgElement.innerText = message;
        if (isError) { toast.classList.add('error'); titleElement.innerText = "Erro!"; iconElement.className = "fas fa-times-circle text-xl"; } 
        else { toast.classList.remove('error'); titleElement.innerText = "Sucesso!"; iconElement.className = "fas fa-check-circle text-xl"; }
        toast.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none'); setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none'); }, 3000);
    }
}
function addToCart(id) { /* Função legada, agora usamos adicionarAoCarrinhoDetalhado */ }
function changeQuantity(id, delta) { const item = cart.find(i => i.id === id); if (item) { item.quantity += delta; if (item.quantity <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); } }
function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    const cartCountBadge = document.getElementById('cart-count');

    if (!cartItemsContainer || !cartTotalElement) return;

    // 1. Limpa o container antes de renderizar
    cartItemsContainer.innerHTML = '';
    
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                <i class="fas fa-shopping-basket text-4xl mb-3"></i>
                <p class="text-sm font-medium">Seu carrinho está vazio</p>
            </div>`;
    } else {
        // 2. Renderiza cada item do carrinho
        cart.forEach(item => {
            const itemHtml = `
                <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm group">
                    <img src="${item.image || 'https://via.placeholder.com/100'}" class="w-16 h-16 object-cover rounded-lg border">
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <h4 class="text-sm font-bold text-gray-800 leading-tight">${item.name}</h4>
                            <button onclick="changeQuantity('${item.id}', -100)" class="text-gray-300 hover:text-red-500 transition">
                                <i class="fas fa-trash-alt text-xs"></i>
                            </button>
                        </div>
                        <p class="text-[10px] text-gray-500 line-clamp-1 mb-1 italic">${item.details || ''}</p>
                        <div class="flex justify-between items-center mt-1">
                            <span class="text-sm font-black text-cyan-700 font-sans">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                            <div class="flex items-center gap-2 bg-gray-100 rounded-lg px-2 py-1 scale-90">
                                <button onclick="changeQuantity('${item.id}', -1)" class="text-red-500 font-bold w-4 hover:bg-white rounded transition">-</button>
                                <span class="text-xs font-bold w-4 text-center">${item.quantity}</span>
                                <button onclick="changeQuantity('${item.id}', 1)" class="text-green-500 font-bold w-4 hover:bg-white rounded transition">+</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            cartItemsContainer.insertAdjacentHTML('beforeend', itemHtml);
        });
    }
    localStorage.setItem('tropyberry_cart', JSON.stringify(cart));

    // 3. Cálculo e atualização do Total
    const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    cartTotalElement.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    // 4. Atualiza o Badge do carrinho (número vermelho no topo)
    if (cartCountBadge) {
        const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
        cartCountBadge.innerText = totalItems;
        cartCountBadge.classList.toggle('hidden', totalItems === 0);
    }
}
function startCheckout() {
    if (cart.length === 0) return showToast("Carrinho vazio!");
    if (!isStoreOpen) return showToast("Loja Fechada!");

    const checkoutModal = document.getElementById('checkout-modal');
    
    if (!checkoutModal) {
        // Se o modal não existe nesta página (ex: produto.html), vai para a home
        window.location.href = 'index.html?action=checkout';
        return;
    }

    // Se estiver na index.html, abre o modal direto
    checkoutModal.classList.remove('hidden');
    showStep('step-service');
}
function closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); }
function showStep(stepId) { ['step-service', 'step-address', 'step-payment-method'].forEach(id => document.getElementById(id).classList.add('hidden')); document.getElementById(stepId).classList.remove('hidden'); if (stepId === 'step-address') checkSavedAddress(); }
function selectService(type) { currentOrder.method = type; const f = document.getElementById('delivery-fields'); if (type === 'retirada') f.classList.add('hidden'); else f.classList.remove('hidden'); showStep('step-address'); }
function checkSavedAddress() { const s = localStorage.getItem('tropyberry_user'); if (s) { const d = JSON.parse(s); document.getElementById('input-name').value = d.name || ''; document.getElementById('input-phone').value = d.phone || ''; document.getElementById('input-street').value = d.street || ''; document.getElementById('input-number').value = d.number || ''; document.getElementById('input-district').value = d.district || ''; document.getElementById('input-comp').value = d.comp || ''; if(d.street) { document.getElementById('saved-address-card').classList.remove('hidden'); document.getElementById('saved-address-card').classList.add('flex'); document.getElementById('saved-address-text').innerText = `${d.street}, ${d.number}`; } } }
function useSavedAddress() { goToPaymentMethod(); }
function goToPaymentMethod() {
    const n = document.getElementById('input-name').value; 
    const p = document.getElementById('input-phone').value; 
    const e = document.getElementById('input-email').value; // Captura o email que você adicionou no HTML

    if (!n || !p || !e) return showToast("Preencha Nome, Telefone e E-mail.");

    // Armazena os dados do cliente
    currentOrder.customer = { name: n, phone: p, email: e };

    if (currentOrder.method === 'delivery') {
        const s = document.getElementById('input-street').value; 
        const num = document.getElementById('input-number').value; 
        const d = document.getElementById('input-district').value; 
        const c = document.getElementById('input-comp').value;
        
        if (!s || !num) return showToast("Endereço incompleto."); 
        currentOrder.customer.address = `${s}, ${num} - ${d} (${c})`; 
    } else { 
        currentOrder.customer.address = "Retirada na Loja"; 
    }
    showStep('step-payment-method');
}
document.getElementById('input-district')?.addEventListener('input', () => {
    updateCartUI();     
});
async function processPayment() {
    const payMethod = document.querySelector('input[name="pay-method"]:checked')?.value;
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const frete = (typeof calcularFrete === 'function') ? calcularFrete() : 0;
    const totalFinal = subtotal + frete;

    if (!payMethod) return showToast("Selecione um método de pagamento", true);

    const btn = document.getElementById('btn-generate-pay');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PIX...';

    try {
        let pixData = { qr_code: null, qr_code_base64: null };

        if (payMethod === 'pix') {
            const response = await fetch("https://us-central1-tropiberry.cloudfunctions.net/criarPagamento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
        method: payMethod, 
        total: totalFinal, 
        playerInfo: currentOrder.customer, // AQUI: Mudei de 'customer' para 'playerInfo'
        items: cart 
    })
});

            const data = await response.json();
            console.log("Resposta da API:", data); // VEJA O ERRO NO CONSOLE DO NAVEGADOR (F12)

            if (data.success) {
                pixData.qr_code = data.qr_code;
                pixData.qr_code_base64 = data.qr_code_base64;
            } else {
                throw new Error(data.error || "Erro na API de pagamento");
            }
        }

        const docRef = await addDoc(collection(db, "pedidos"), {
    customer: currentOrder.customer,
    items: cart,
    total: totalFinal,
    paymentMethod: payMethod,
    method: currentOrder.method, // ESTA LINHA ESTAVA FALTANDO! (delivery ou retirada)
    status: 'Aguardando',
    paymentStatus: 'pending',    // Adicionado para o dashboard reconhecer como "NÃO PAGO"
    pixCode: pixData.qr_code,
    pixQR: pixData.qr_code_base64,
    createdAt: serverTimestamp()
});
        
        saveLastOrder(docRef.id);
        cart = [];
        updateCartUI();
        closeCheckout();
        openOrderScreen(docRef.id);
        showToast("Pedido enviado!");

    } catch (e) {
        console.error("Erro completo:", e);
        showToast("Falha ao gerar PIX. Verifique os dados ou tente outro método.", true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Finalizar Pedido</span><i class="fas fa-check-circle"></i>';
    }
}
let countdownInterval = null;

   window.openOrderScreen = (orderId) => {
    const screen = document.getElementById('order-screen');
    if(!screen) return;
    screen.classList.remove('hidden');

    // Inicializa o mapa (Leaflet) - MANTIDO
    setTimeout(() => {
        const mapContainer = document.getElementById('final-map');
        if (mapContainer) {
            if (window.currentMap) window.currentMap.remove();
            window.currentMap = L.map('final-map').setView([-7.1195, -34.8450], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.currentMap);
            L.marker([-7.1195, -34.8450]).addTo(window.currentMap).bindPopup('Seu pedido está sendo preparado!').openPopup();
        }
    }, 400);

    // Escuta mudanças no Firebase em tempo real - MANTIDO
    onSnapshot(doc(db, "pedidos", orderId), (docSnap) => {
        if (!docSnap.exists()) return;
        const order = docSnap.data();

        // Atualiza IDs e Nomes na tela - MANTIDO
        document.getElementById('status-order-id').innerText = orderId.slice(-5).toUpperCase();
        document.getElementById('status-client-name').innerText = order.customer.name;
        document.getElementById('status-client-phone').innerText = order.customer.phone;
        document.getElementById('status-client-address').innerText = order.customer.address;

        // === INSERÇÃO: LÓGICA DA BARRA DE PROGRESSO (ÍCONES) ===
        const steps = document.querySelectorAll('#order-screen .relative.z-10.flex.flex-col.items-center');
        const setStepActive = (index, active) => {
            if (!steps[index]) return;
            const circle = steps[index].querySelector('.w-8.h-8');
            if (active) {
                steps[index].classList.remove('opacity-40');
                circle.classList.add('bg-green-500', 'text-white');
                circle.classList.remove('bg-gray-200', 'text-gray-500');
            } else {
                steps[index].classList.add('opacity-40');
                circle.classList.remove('bg-green-500', 'text-white');
                circle.classList.add('bg-gray-200', 'text-gray-500');
            }
        };
        setStepActive(0, true); // Recebido
        setStepActive(1, ['Em Preparo', 'Pronto', 'Saiu para Entrega', 'Finalizado'].includes(order.status));
        setStepActive(2, ['Saiu para Entrega', 'Finalizado'].includes(order.status));
        setStepActive(3, order.status === 'Finalizado');

        // === INSERÇÃO: ATUALIZAÇÃO DO BADGE DE PAGAMENTO ===
        const payBadge = document.getElementById('status-payment-badge');
        if (payBadge) {
            if (order.status === 'Cancelado' || order.status === 'Rejeitado') {
                payBadge.innerText = 'CANCELADO';
                payBadge.className = "bg-red-100 text-red-600 text-xs px-3 py-1 rounded-full font-bold border border-red-200";
            } else if (order.paymentStatus === 'paid') {
                payBadge.innerText = 'PAGO';
                payBadge.className = "bg-green-100 text-green-600 text-xs px-3 py-1 rounded-full font-bold border border-green-200";
            } else {
                payBadge.innerText = 'PENDENTE';
                payBadge.className = "bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full font-bold border border-orange-200";
            }
        }

        // WhatsApp Button - MANTIDO
        const whatsappBtn = document.getElementById('btn-whatsapp-status');
        if (whatsappBtn) {
            const orderIdShort = orderId.slice(-5).toUpperCase();
            const textoMsg = `Olá! Gostaria de suporte para o meu pedido *#${orderIdShort}*.\n\n` +
                             `*Status:* ${order.status}\n` +
                             `*Cliente:* ${order.customer.name}\n` +
                             `*Total:* R$ ${order.total.toFixed(2).replace('.', ',')}`;
            whatsappBtn.href = `https://wa.me/5583996025703?text=${encodeURIComponent(textoMsg)}`;
        }

        const pixArea = document.getElementById('pix-qr-container');
        const pixSlot = document.getElementById('pix-qr-image-slot');
        
        // Lógica do PIX e do Timer - MANTIDO
        if (order.paymentMethod === 'pix' && order.status === 'Aguardando' && order.paymentStatus !== 'paid') {
            if (!order.createdAt) return; 

            pixArea.classList.remove('hidden');
            if (order.pixQR) {
                pixSlot.innerHTML = `<img src="data:image/jpeg;base64,${order.pixQR}" class="w-48 h-48 rounded-lg shadow-lg border-4 border-white mx-auto">`;
            }
            if (order.pixCode) {
                document.getElementById('pix-copy-paste-screen').value = order.pixCode;
            }
            if (!countdownInterval) {
                iniciarContagemRegressiva(orderId, order.createdAt);
            }
        } else {
            pixArea.classList.add('hidden');
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }
        
        // Atualiza os itens e o total no resumo da conta - MANTIDO E CORRIGIDO
        renderReceiptFromOrder(order.items, order.total, order, orderId);
    });
};

// FUNÇÃO DE CÓPIA COM ANIMAÇÃO
window.copyPixScreen = () => {
    const input = document.getElementById('pix-copy-paste-screen');
    const overlay = document.getElementById('copy-animation-overlay');
    
    if (!input || !input.value || input.value.includes("Aguardando")) return;

    // Copia para a área de transferência
    navigator.clipboard.writeText(input.value).then(() => {
        showToast("Código PIX copiado!");
        
        // Mostra a animação de sucesso sobre o campo
        if (overlay) {
            overlay.classList.remove('opacity-0', 'pointer-events-none');
            overlay.classList.add('opacity-100');
            setTimeout(() => {
                overlay.classList.add('opacity-0', 'pointer-events-none');
                overlay.classList.remove('opacity-100');
            }, 2000);
        }
    }).catch(err => {
        console.error("Erro ao copiar: ", err);
    });
};
function iniciarContagemRegressiva(orderId, createdAt) {
    if (countdownInterval) clearInterval(countdownInterval);

    const timerDisplay = document.getElementById('pix-countdown-timer');
    if (!timerDisplay) return;

    // 1. Calcula o tempo de expiração real (Criação + 5 min)
    const tempoCriacao = createdAt.seconds * 1000;
    const tempoExpiracao = tempoCriacao + (5 * 60 * 1000);

    // Função interna para atualizar a tela
    const atualizarTela = async () => {
        const agora = Date.now();
        let restante = tempoExpiracao - agora;

        // CORREÇÃO DO PULO PARA 7 MINUTOS:
        // Se o relógio do usuário está atrasado e o cálculo deu mais de 5 min, trava em 5 min.
        if (restante > (5 * 60 * 1000)) {
            restante = (5 * 60 * 1000);
        }

        if (restante <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            timerDisplay.innerText = "00:00";
            
            // Cancela o pedido no Firebase
            try {
                await updateDoc(doc(db, "pedidos", orderId), { 
                    status: 'Cancelado', 
                    motivo: 'Tempo de pagamento expirado' 
                });
                showToast("Pedido expirado!", true);
            } catch (e) { console.error(e); }
            return;
        }

        const minutos = Math.floor(restante / 60000);
        const segundos = Math.floor((restante % 60000) / 1000);
        timerDisplay.innerText = `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    };

    // Executa uma vez imediatamente para evitar o "flicker" de 05:00
    atualizarTela(); 
    countdownInterval = setInterval(atualizarTela, 1000);
}


// Função para o botão "Voltar para o pedido" funcionar
window.abrirUltimoPedido = () => {
    const saved = localStorage.getItem('tropyberry_last_order');
    if (saved) {
        const d = JSON.parse(saved);
        // Busca o status atual (se ele já pagou ou não) para carregar o link certo
        const statusType = d.status === 'Pago' ? 'paid' : 'pix_pending';
        window.openOrderScreen(d.id, statusType);
    } else {
        showToast("Nenhum pedido recente encontrado.", true);
    }
};

// Chame monitorarConfiguracoes() no DOMContentLoaded
// === CARREGAMENTO INICIAL COM PERSISTÊNCIA ===
document.addEventListener('DOMContentLoaded', () => {
    // Carrega o carrinho do banco local
    const savedCart = localStorage.getItem('tropyberry_cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        
        // Pequeno atraso para garantir que o Header Global já foi injetado no HTML
        setTimeout(() => {
            updateCartUI();
            
            // VERIFICAÇÃO DE CHECKOUT: Abre o modal se o link tiver ?action=checkout
            const params = new URLSearchParams(window.location.search);
            if (params.get('action') === 'checkout' && cart.length > 0) {
                startCheckout();
            }
        }, 300); // 300ms é o tempo suficiente para o Header "nascer"
    }
});
function renderTicketBooster() {
    if (!configPedidos.ticketBooster || cart.length === 0) return '';

    // Filtra produtos que NÃO estão no carrinho e ordena por preço (menor primeiro)
    const cartIds = cart.map(item => item.originalId);
    const sugestoes = products
        .filter(p => !cartIds.includes(p.id))
        .sort((a, b) => a.price - b.price)
        .slice(0, 3); // Pega os 3 mais baratos

    if (sugestoes.length === 0) return '';

    return `
        <div class="mt-6 border-t pt-4 animate-fade-in">
            <p class="text-xs font-bold text-cyan-700 uppercase mb-3 flex items-center gap-2">
                <i class="fas fa-rocket text-yellow-500"></i> Que tal adicionar?
            </p>
            <div class="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                ${sugestoes.map(p => `
                    <div class="min-w-[140px] bg-white border rounded-xl p-2 shadow-sm">
                        <img src="${p.image}" class="w-full h-20 object-cover rounded-lg mb-2">
                        <h4 class="text-[10px] font-bold text-gray-700 truncate">${p.name}</h4>
                        <div class="flex justify-between items-center mt-1">
                            <span class="text-xs font-bold text-green-600">R$ ${p.price.toFixed(2)}</span>
                            <button onclick="abrirModalRapido('${p.id}')" class="bg-cyan-100 text-cyan-600 p-1 rounded-lg hover:bg-cyan-600 hover:text-white transition">
                                <i class="fas fa-plus text-[10px]"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
function calcularFrete() {
    if (currentOrder.method !== 'delivery') {
        currentDeliveryFee = 0;
        return 0;
    }

    const mode = configPedidos.deliveryMode;
    
    if (mode === 'fixed') {
        currentDeliveryFee = configPedidos.deliveryFixedPrice || 0;
    } 
    else if (mode === 'district') {
        const bairroCliente = document.getElementById('input-district').value.trim().toLowerCase();
        const infoBairro = configPedidos.deliveryDistricts?.find(b => b.nome.toLowerCase() === bairroCliente);
        
        if (infoBairro) {
            currentDeliveryFee = infoBairro.custo;
        } else {
            // Se não achar o bairro, você pode definir um padrão ou avisar
            currentDeliveryFee = 0; 
        }
    } else {
        currentDeliveryFee = 0;
    }

    return currentDeliveryFee;
}

function renderReceipt() { const list = document.getElementById('receipt-items-list'); list.innerHTML = ''; let subtotal = 0; cart.forEach(item => { const t = item.price * item.quantity; subtotal += t; list.innerHTML += `<div class="flex justify-between items-start mb-2"><div><span class="font-bold text-gray-700">${item.quantity}x</span> <span class="text-gray-600">${item.name}</span></div><span class="text-gray-800 font-medium">R$ ${t.toFixed(2).replace('.', ',')}</span></div>`; }); document.getElementById('receipt-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`; document.getElementById('receipt-total').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`; }
function toggleReceipt() { const el = document.getElementById('receipt-details'); const arr = document.getElementById('arrow-receipt'); if (el.classList.contains('hidden')) { el.classList.remove('hidden'); arr.classList.add('rotate-180'); } else { el.classList.add('hidden'); arr.classList.remove('rotate-180'); } }
function closeOrderScreen() { document.getElementById('order-screen').classList.add('hidden'); }
function switchToStatus() { openOrderScreen('STATUS', 'paid'); }
function copyPixScreen() { const inp = document.getElementById('pix-copy-paste-screen'); if(inp) { inp.select(); document.execCommand('copy'); showToast("Código PIX copiado!"); } }
function toggleCart() { const m = document.getElementById('cart-modal'); const p = document.getElementById('cart-panel'); const btn = document.getElementById('last-order-btn'); if(!m) return; if (m.classList.contains('hidden')) { m.classList.remove('hidden'); setTimeout(() => p.classList.remove('translate-x-full'), 10); if(btn) btn.classList.add('hidden'); } else { p.classList.add('translate-x-full'); setTimeout(() => m.classList.add('hidden'), 300); checkLastOrder(); } }
function saveLastOrder(id) { localStorage.setItem('tropyberry_last_order', JSON.stringify({ id, timestamp: Date.now() })); checkLastOrder(); }
function checkLastOrder() { const saved = localStorage.getItem('tropyberry_last_order'); const btn = document.getElementById('last-order-btn'); const cart = document.getElementById('cart-modal'); if (cart && !cart.classList.contains('hidden')) { if(btn) btn.classList.add('hidden'); return; } if (saved && btn) { const d = JSON.parse(saved); if ((Date.now() - d.timestamp) / 1000 / 60 < 15) btn.classList.remove('hidden'); else { btn.classList.add('hidden'); localStorage.removeItem('tropyberry_last_order'); } } else if (btn) btn.classList.add('hidden'); }
setInterval(checkLastOrder, 60000);
async function verificarBotaoAdmin(productId) { if (currentUserIsAdmin) { const btn = document.getElementById('admin-edit-shortcut'); if(btn) { btn.classList.remove('hidden'); btn.onclick = () => { window.location.href = `admin.html?edit_product=${productId}`; }; } } }

// 1. Função que renderiza os dados tanto na tela quanto no cupom de impressão
window.renderReceiptFromOrder = (items, total, orderData, orderId) => {
    const printItemsList = document.getElementById('print-items-list');
    const screenItemsList = document.getElementById('receipt-items-list');
    
    let html = '';
    let subtotal = 0;

    // Prepara a lista de itens para o cupom
    items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        html += `
            <tr style="border-bottom: 0.5px solid #eee;">
                <td style="padding: 8px 0; vertical-align: top;">${item.quantity}x</td>
                <td style="padding: 8px 0;">
                    <div style="font-weight: bold;">${item.name}</div>
                    <div style="font-size: 10px; color: #555;">${item.details || ''}</div>
                </td>
                <td style="padding: 8px 0; text-align: right; vertical-align: top;">R$ ${itemTotal.toFixed(2).replace('.', ',')}</td>
            </tr>
        `;
    });

    // Injeta os dados no HTML de impressão (aquele que criamos no index.html)
    if (printItemsList) {
        printItemsList.innerHTML = html;
        document.getElementById('print-order-id').innerText = orderId.slice(-5).toUpperCase();
        document.getElementById('print-order-date').innerText = new Date().toLocaleString('pt-BR');
        document.getElementById('print-customer-name').innerText = orderData.customer.name;
        document.getElementById('print-customer-phone').innerText = orderData.customer.phone;
        document.getElementById('print-customer-address').innerText = orderData.customer.address;
        document.getElementById('print-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('print-delivery').innerText = total > subtotal ? `R$ ${(total - subtotal).toFixed(2).replace('.', ',')}` : 'Grátis';
        document.getElementById('print-total').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
        document.getElementById('print-pay-method').innerText = orderData.paymentMethod === 'pix' ? 'PIX' : 'CARTÃO';
    }

    // Atualiza também a listagem que aparece na tela do navegador
    if (screenItemsList) {
        let screenHtml = '';
        items.forEach(item => {
            screenHtml += `<div class="flex justify-between items-start mb-2"><div><span class="font-bold text-gray-700">${item.quantity}x</span> <span class="text-gray-600">${item.name}</span></div><span class="text-gray-800 font-medium">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span></div>`;
        });
        screenItemsList.innerHTML = screenHtml;
        document.getElementById('receipt-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('receipt-total').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }
};

window.prepararImpressao = () => {
    window.print();
};
// 2. Função chamada pelo botão de imprimir
window.prepararImpressao = () => {
    // Apenas dispara o print. O CSS @media print cuidará de esconder o resto.
    window.print();
};