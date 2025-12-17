import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc, getDoc, onSnapshot, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { monitorarEstadoAuth, fazerLogout, verificarAdminNoBanco, db as authDb } from './auth.js'; 

let currentUserIsAdmin = false; 
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

// CACHE GLOBAL DE COMPLEMENTOS (Para calcular preço no cardápio)
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
    monitorarComplementosGlobal(); // NOVO: Carrega complementos para memória
    carregarProdutosDoBanco();
    monitorarStatusLojaNoBanco();
    
    monitorarEstadoAuth(async (user) => {
        const container = document.getElementById('auth-buttons-container');
        if (user) {
            currentUserIsAdmin = await verificarAdminNoBanco(user.email);
            let adminBtn = currentUserIsAdmin ? `<a href="admin.html" class="bg-cyan-800 border border-cyan-400 text-yellow-400 text-[10px] px-2 py-1 rounded font-bold uppercase ml-2 shadow-sm hover:bg-cyan-700 decoration-0">Painel Admin</a>` : '';
            if(container) container.innerHTML = `<div class="flex items-center"><span class="text-xs font-bold text-white hidden md:block mr-2">${user.displayName || user.email.split('@')[0]}</span>${adminBtn}<button onclick="fazerLogout()" class="bg-red-500/80 hover:bg-red-500 text-white text-xs px-3 py-1 ml-2 rounded-full font-bold transition">Sair</button></div>`;
            atualizarInteratividadeBotaoLoja();
            atualizarElementosAdminUI();
            if(currentProductDetail) verificarBotaoAdmin(currentProductDetail.id);
        } else {
            currentUserIsAdmin = false;
            if(container) container.innerHTML = `<a href="login.html" class="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1 rounded-full font-bold transition">Entrar</a><a href="cadastro.html" class="bg-yellow-400 hover:bg-yellow-300 text-cyan-900 text-xs px-3 py-1 rounded-full font-bold transition">Cadastrar</a>`;
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
        container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">Nenhum produto encontrado.</div>`;
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

function renderizarHeaderGlobal() {
    const headerPlaceholder = document.getElementById('global-header-placeholder');
    if (!headerPlaceholder) return;
    const headerHTML = `
    <header class="bg-cyan-600 text-white relative shadow-lg z-40 pb-16 sticky top-0 transition-all duration-300">
        <div class="container mx-auto px-4 py-4 flex justify-between items-center relative z-10">
            <div class="flex items-center gap-2 cursor-pointer" onclick="window.location.href='index.html'">
                <div class="bg-yellow-400 p-2 rounded-full text-cyan-800"><i class="fas fa-ice-cream text-2xl"></i></div>
                <h1 class="hidden md:block text-3xl font-bold tracking-wide brand-font text-yellow-300 drop-shadow-md">TROPYBERRY</h1>
            </div>
            <div class="flex items-center gap-3 relative">
                <div id="auth-buttons-container" class="flex items-center gap-2 mr-2"></div>
                <button id="store-status-btn" onclick="toggleStoreStatus()" class="px-3 py-1 rounded-full text-xs font-bold border border-white transition flex items-center gap-2 cursor-pointer hover:scale-105"><div id="status-indicator" class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div><span id="status-text">ABERTO</span></button>
                <button onclick="toggleInfoModal()" class="text-white hover:text-yellow-300 text-xl transition p-2"><i class="fas fa-info-circle"></i></button>
                <div class="relative">
                    <button onclick="toggleCart()" class="relative bg-yellow-400 text-cyan-900 px-4 py-2 rounded-full font-bold hover:bg-yellow-300 transition shadow-md flex items-center gap-2 z-20"><i class="fas fa-shopping-cart"></i><span class="hidden md:inline">Carrinho</span><span id="cart-count" class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full border-2 border-white">0</span></button>
                    <button id="last-order-btn" onclick="openOrderScreen('status')" class="hidden absolute top-12 right-0 w-32 bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg hover:bg-cyan-400 transition flex items-center justify-between gap-1 border border-cyan-400 animate-bounce z-10"><span>Último pedido</span> <i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
        </div>
        <div class="wave-container"><svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" class="shape-fill"></path></svg></div>
    </header>`;
    headerPlaceholder.innerHTML = headerHTML;
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
    const counters = document.querySelectorAll('#cart-count'); const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0); counters.forEach(c => c.innerText = totalCount);
    const containers = document.querySelectorAll('#cart-items'); const total = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const totalDisplays = document.querySelectorAll('#cart-total'); totalDisplays.forEach(t => t.innerText = 'R$ ' + total.toFixed(2).replace('.', ','));
    containers.forEach(container => {
        if (cart.length === 0) container.innerHTML = `<p class="text-center text-gray-400 py-10">Carrinho vazio</p>`;
        else {
            container.innerHTML = cart.map(item => `
                <div class="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border mb-2">
                    <div><h5 class="font-bold text-cyan-900 text-sm">${item.name}</h5><p class="text-[10px] text-gray-500 max-w-[150px] truncate">${item.details || ''}</p><p class="text-xs text-gray-500">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</p></div>
                    <div class="flex items-center gap-2 bg-gray-50 rounded px-2"><button onclick="changeQuantity('${item.id}', -1)" class="text-red-500 font-bold w-6">-</button><span class="text-sm font-bold w-4 text-center">${item.quantity}</span><button onclick="changeQuantity('${item.id}', 1)" class="text-green-500 font-bold w-6">+</button></div>
                </div>`).join('');
        }
    });
}
function startCheckout() { if (cart.length === 0) return showToast("Carrinho vazio!"); if (!isStoreOpen) return showToast("Loja Fechada!"); const cartModal = document.getElementById('cart-modal'); if(cartModal && !cartModal.classList.contains('hidden')) toggleCart(); const checkoutModal = document.getElementById('checkout-modal'); if(!checkoutModal) { window.location.href = 'index.html?action=checkout'; return; } checkoutModal.classList.remove('hidden'); showStep('step-service'); }
function closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); }
function showStep(stepId) { ['step-service', 'step-address', 'step-payment-method'].forEach(id => document.getElementById(id).classList.add('hidden')); document.getElementById(stepId).classList.remove('hidden'); if (stepId === 'step-address') checkSavedAddress(); }
function selectService(type) { currentOrder.method = type; const f = document.getElementById('delivery-fields'); if (type === 'retirada') f.classList.add('hidden'); else f.classList.remove('hidden'); showStep('step-address'); }
function checkSavedAddress() { const s = localStorage.getItem('tropyberry_user'); if (s) { const d = JSON.parse(s); document.getElementById('input-name').value = d.name || ''; document.getElementById('input-phone').value = d.phone || ''; document.getElementById('input-street').value = d.street || ''; document.getElementById('input-number').value = d.number || ''; document.getElementById('input-district').value = d.district || ''; document.getElementById('input-comp').value = d.comp || ''; if(d.street) { document.getElementById('saved-address-card').classList.remove('hidden'); document.getElementById('saved-address-card').classList.add('flex'); document.getElementById('saved-address-text').innerText = `${d.street}, ${d.number}`; } } }
function useSavedAddress() { goToPaymentMethod(); }
function goToPaymentMethod() {
    const n = document.getElementById('input-name').value; const p = document.getElementById('input-phone').value; if (!n || !p) return showToast("Preencha Nome e Telefone.");
    currentOrder.customer = { name: n, phone: p };
    if (currentOrder.method === 'delivery') {
        const s = document.getElementById('input-street').value; const num = document.getElementById('input-number').value; const d = document.getElementById('input-district').value; const c = document.getElementById('input-comp').value;
        if (!s || !num) return showToast("Endereço incompleto."); currentOrder.customer.address = `${s}, ${num} - ${d} (${c})`; localStorage.setItem('tropyberry_user', JSON.stringify({ name: n, phone: p, street: s, number: num, district: d, comp: c }));
    } else { currentOrder.customer.address = "Retirada na Loja"; localStorage.setItem('tropyberry_user', JSON.stringify({ name: n, phone: p })); }
    showStep('step-payment-method');
}
async function processPayment() {
    if(!db) return showToast("Erro de conexão.", true);
    const btn = document.getElementById('btn-generate-pay'); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; btn.disabled = true;
    const method = document.querySelector('input[name="pay-method"]:checked').value; const total = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    try {
        const orderRef = await addDoc(collection(db, "pedidos"), { customer: currentOrder.customer, items: cart, method: currentOrder.method, total, status: 'Aguardando', createdAt: serverTimestamp() });
        const response = await fetch("https://us-central1-tropiberry.cloudfunctions.net/criarPagamento", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart, playerInfo: currentOrder.customer, total, method }) });
        const data = await response.json();
        if (data.success) { closeCheckout(); saveLastOrder(orderRef.id); if (data.type === 'pix') openOrderScreen(orderRef?.id || 'TEMP', 'pix_pending', data.qr_code); else if (data.type === 'card_link') window.location.href = data.link; } else { alert("Erro: " + data.error); }
    } catch (error) { console.error(error); alert("Erro de conexão."); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}
async function openOrderScreen(orderId, statusType, pixCode = null) {
    const screen = document.getElementById('order-screen'); if(!screen) return; screen.classList.remove('hidden'); document.getElementById('status-order-id').innerText = orderId.slice(0, 5).toUpperCase();
    const now = new Date(); document.getElementById('status-order-time').innerText = `${now.getHours()}:${now.getMinutes()<10?'0'+now.getMinutes():now.getMinutes()}`; document.getElementById('status-client-name').innerText = currentOrder.customer.name; document.getElementById('status-client-phone').innerText = currentOrder.customer.phone; document.getElementById('status-client-address').innerText = currentOrder.customer.address;
    const badge = document.getElementById('status-payment-badge');
    if (statusType === 'pix_pending') { badge.className = "bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full font-bold border border-orange-200"; badge.innerText = "Aguardando Pagamento"; if(pixCode) { showToast("Copie o código PIX!"); const pixScreen = document.getElementById('pix-copy-paste-screen'); if(pixScreen) pixScreen.value = pixCode; } } 
    else { badge.className = "bg-green-100 text-green-600 text-xs px-3 py-1 rounded-full font-bold border border-green-200"; badge.innerText = "Pago"; }
    renderReceipt(); document.getElementById('btn-whatsapp-status').href = `https://wa.me/5583999999999?text=${encodeURIComponent(`Pedido #${orderId.slice(0,5)}. Status?`)}`;
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