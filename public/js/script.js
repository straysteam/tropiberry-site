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
    getDocs,
    where
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
let freteGoogleCalculado = 0; 
let googleDebounceTimer = null;


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
window.toggleReceipt = toggleReceipt;

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
    await carregarConfiguracoesSite();
    
    // Inicia monitoramento
    monitorarComplementosGlobal(); 
    carregarProdutosDoBanco();
    monitorarStatusLojaNoBanco();
    
    // 2. Monitora o Login e preenche os botões no Header
    monitorarEstadoAuth(async (user) => {
        const desktopAuthArea = document.getElementById('desktop-auth-area');
        
        // Elementos do Menu Dropdown/Modal
        const menuName = document.getElementById('menu-user-name');
        const menuEmail = document.getElementById('menu-user-email');
        const guestOptions = document.getElementById('menu-guest-options');
        const loggedOptions = document.getElementById('menu-logged-options');
        const adminLinks = document.getElementById('menu-admin-links');

        if (user) {
            currentUserIsAdmin = await verificarAdminNoBanco(user.email);
            
            // 1. Atualiza Header Desktop (Mostra Ícone e Nome)
            if(desktopAuthArea) {
                desktopAuthArea.innerHTML = `
                    <div class="flex items-center gap-3 cursor-pointer hover:bg-cyan-700 p-2 rounded-lg transition" onclick="toggleUserMenu()">
                        <div class="text-right hidden lg:block">
                            <p class="text-xs font-bold text-white leading-none">${user.displayName || 'Cliente'}</p>
                            <p class="text-[10px] text-cyan-200 leading-none">Minha Conta</p>
                        </div>
                        <div class="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white border border-white/30">
                            <i class="fas fa-user"></i>
                        </div>
                    </div>
                `;
            }

            // 2. Atualiza o Menu Dropdown/Modal (Conteúdo)
            if(menuName) menuName.innerText = user.displayName || 'Cliente TropyBerry';
            if(menuEmail) menuEmail.innerText = user.email;
            
            if(guestOptions) guestOptions.classList.add('hidden');
            if(loggedOptions) loggedOptions.classList.remove('hidden');
            
            // Mostra opções de admin se for admin
            if(adminLinks) {
                if(currentUserIsAdmin) adminLinks.classList.remove('hidden');
                else adminLinks.classList.add('hidden');
            }

            atualizarInteratividadeBotaoLoja();
            if(currentProductDetail) verificarBotaoAdmin(currentProductDetail.id);

        } else {
            currentUserIsAdmin = false;

            // 1. Header Desktop (Mostra botões Entrar/Cadastrar)
            if(desktopAuthArea) {
                desktopAuthArea.innerHTML = `
                    <a href="login.html" class="text-sm font-bold text-white hover:text-yellow-300 transition">Entrar</a>
                    <a href="cadastro.html" class="bg-white text-cyan-900 text-sm px-4 py-2 rounded-full font-bold hover:bg-gray-100 transition shadow-sm">Criar Conta</a>
                `;
            }

            // 2. Menu Dropdown (Modo Visitante)
            if(menuName) menuName.innerText = "Visitante";
            if(menuEmail) menuEmail.innerText = "Faça login para aproveitar";
            
            if(guestOptions) guestOptions.classList.remove('hidden');
            if(loggedOptions) loggedOptions.classList.add('hidden');
            
            atualizarInteratividadeBotaoLoja();
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

    // 1. Filtra por categoria (Lógica que já existia)
    let listaParaExibir = filterCategory ? products.filter(p => p.category === filterCategory) : products;

    // === 2. NOVO: FILTRO DE ESTOQUE (A MÁGICA ACONTECE AQUI) ===
    listaParaExibir = listaParaExibir.filter(p => {
        // Se o controle de estoque estiver ligado E o estoque for 0 ou menor -> ESCONDE
        if (p.stockControl === true && (p.stock || 0) <= 0) return false;
        
        // Se estiver marcado manualmente como indisponível -> ESCONDE
        if (p.available === false) return false;

        return true; // Mostra o resto
    });
    // ============================================================

    // Atualiza botões de filtro (Visual)
    if(window.location.pathname.includes('cardapio.html')) {
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const btnCat = btn.getAttribute('data-cat');
            if(btnCat === (filterCategory || 'all')) btn.className = "btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md";
            else btn.className = "btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition";
        });
    }

    // Se não sobrou nenhum produto após os filtros
    if (listaParaExibir.length === 0) {
        if (products.length > 0) {
             container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">Nenhum produto disponível nesta categoria.</div>`;
        } else {
             container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 flex flex-col items-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mb-2"></div>Carregando cardápio...</div>`;
        }
        return;
    }

    // Renderiza o HTML (Usei 'listaParaExibir' em vez de 'filtered')
    container.innerHTML = listaParaExibir.map(product => {
        // === LÓGICA DO PREÇO INTELIGENTE (FILTRO EMBALAGEM) ===
        const hasComplements = product.complementIds && product.complementIds.length > 0;
        let prefixPrice = hasComplements ? '<span class="text-[10px] text-gray-500 font-normal mr-1 block">A partir de</span>' : '';
        
        let displayPrice = parseFloat(product.price);

        if (displayPrice === 0 && hasComplements) {
            let minPackagingCost = 0;
            if(globalComplements) { // Verificação de segurança
                product.complementIds.forEach(grpId => {
                    const group = globalComplements[grpId];
                    if (group && group.required && group.internalCategory === 'embalagem' && group.options && group.options.length > 0) {
                        const cheapestOption = group.options.reduce((min, opt) => (opt.price < min ? opt.price : min), Infinity);
                        if (cheapestOption !== Infinity) minPackagingCost += cheapestOption;
                    }
                });
            }
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

        // === PEQUENO DETALHE: MOSTRAR SE TEM POUCO ESTOQUE (OPCIONAL) ===
        // Se quiser mostrar "Últimas unidades" para o cliente:
        let stockAlert = '';
        if (product.stockControl && product.stock <= 5 && product.stock > 0) {
            stockAlert = `<span class="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold animate-pulse z-10">Restam ${product.stock}</span>`;
        }

        return `
        <div onclick="window.location.href='produto.html?id=${product.id}'" class="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col h-full border border-gray-100 relative cursor-pointer">
            ${stockAlert}
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

    // 1. Adiciona ao array do carrinho
    cart.push(cartItem);
    
    // 2. Atualiza a interface (badge, lista interna)
    updateCartUI();
    
    // 3. DISPARA A ANIMAÇÃO DO COPINHO (Wesley, aqui está a mágica!)
    animarVooParaCarrinho(window.event);

    // 4. Mostra o aviso de sucesso
    showToast("Adicionado ao pedido!");
    
    // 5. Fecha o modal (se estiver aberto)
    fecharModalRapido();

    // OBS: A linha do toggleCart foi removida para o carrinho não abrir sozinho.
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
    // 1. Alterado para buscar o novo ID que criamos no HTML
    const container = document.getElementById('category-filters'); 
    
    if(!container) return;

    // 2. Adicionado 'whitespace-nowrap' e 'flex-shrink-0' para o scroll funcionar no celular
    let html = `<button onclick="renderProducts('product-grid', null)" class="btn-filter px-6 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md whitespace-nowrap flex-shrink-0" data-cat="all">Todos</button>`;
    
    // 3. Loop mantido idêntico, apenas atualizando as classes CSS dos botões gerados
    categories.forEach(cat => { 
        html += `<button onclick="renderProducts('product-grid', '${cat.slug}')" class="btn-filter px-6 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition whitespace-nowrap flex-shrink-0" data-cat="${cat.slug}">${cat.nome}</button>`; 
    });
    
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
        // === NOVO: BOTÃO DE LIMPAR CARRINHO ===
        // Inserimos o cabeçalho com o botão antes de listar os itens
        const headerHtml = `
            <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Itens do Pedido</span>
                <button onclick="limparCarrinho()" class="text-[10px] font-black text-red-500 hover:text-red-700 transition flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg">
                    <i class="fas fa-trash-alt"></i> LIMPAR TUDO
                </button>
            </div>
        `;
        cartItemsContainer.innerHTML = headerHtml;

        // 2. Renderiza cada item do carrinho (MANTIDO)
        cart.forEach(item => {
            const itemHtml = `
                <div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm group mb-2">
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

    // Mantendo a lógica de persistência e totais que seu script já possuía
    localStorage.setItem('tropyberry_cart', JSON.stringify(cart));

    const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    cartTotalElement.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    if (cartCountBadge) {
        const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
        cartCountBadge.innerText = totalItems;
        cartCountBadge.classList.toggle('hidden', totalItems === 0);
    }
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

// Atualiza Desktop
const badgeDesk = document.getElementById('cart-count-desktop'); // Mudei o ID no HTML acima
if(badgeDesk) {
    badgeDesk.innerText = totalItems;
    badgeDesk.classList.toggle('hidden', totalItems === 0);
}

// Atualiza Mobile
const badgeMob = document.getElementById('cart-count-mobile');
if(badgeMob) {
    badgeMob.innerText = totalItems;
    badgeMob.classList.toggle('hidden', totalItems === 0);
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
function selectService(type) { 
    currentOrder.method = type; 
    const f = document.getElementById('delivery-fields'); 
    if (type === 'retirada') f.classList.add('hidden'); 
    else f.classList.remove('hidden'); 
    
    showStep('step-address'); 
    renderReceipt(); // ADICIONE ESSA LINHA AQUI para atualizar o frete ao selecionar
}
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
    renderReceipt();     
});
async function processPayment() {
    const payMethod = document.querySelector('input[name="pay-method"]:checked')?.value;
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const frete = (typeof calcularFrete === 'function') ? calcularFrete() : 0;
    const totalFinal = subtotal + frete;
    const triggerGoogleCalc = () => {
    // Se o modo for Google Maps
    if (configPedidos && configPedidos.deliveryMode === 'google') {
        clearTimeout(googleDebounceTimer);
        googleDebounceTimer = setTimeout(() => {
            window.calcularDistanciaGoogle(); // Chama a API
        }, 1000); // Espera 1 segundo após parar de digitar
    } 
    // Se for modo Bairro ou Fixo
    else {
        renderReceipt(); // Recalcula na hora
    }
};

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
    // Se não for delivery, é zero
    if (!currentOrder.method || currentOrder.method !== 'delivery') {
        currentDeliveryFee = 0;
        return 0;
    }

    // Se as configurações não carregaram, usa um valor de segurança (ex: 5.00) ou 0
    if (!configPedidos || !configPedidos.deliveryMode) {
        console.warn("Configurações de entrega não carregadas.");
        return 0; 
    }

    const mode = configPedidos.deliveryMode;
    
    // --- IMPLEMENTAÇÃO DO MODO GOOGLE (ADICIONADO AQUI) ---
    if (mode === 'google') {
        currentDeliveryFee = freteGoogleCalculado;
        return currentDeliveryFee;
    }
    // -----------------------------------------------------

    // 1. MODO: FIXO (Mais simples)
    if (mode === 'fixed') {
        currentDeliveryFee = parseFloat(configPedidos.deliveryFixedPrice) || 0;
    } 
    // 2. MODO: POR BAIRRO (Recomendado para você)
    else if (mode === 'district') {
        const inputBairro = document.getElementById('input-district');
        // Normaliza o texto: remove espaços extras e acentos (ex: "Jardim América" vira "jardim america")
        const bairroCliente = inputBairro ? removerAcentos(inputBairro.value.trim().toLowerCase()) : "";
        
        // Procura na sua lista de bairros cadastrados
        const infoBairro = configPedidos.deliveryDistricts?.find(b => 
            removerAcentos(b.nome.toLowerCase()) === bairroCliente
        );
        
        // Se achou o bairro, cobra o valor dele. Se não achou, cobra uma taxa padrão ou avisa.
        // Aqui coloquei 0, mas você pode definir um "valor padrão para bairros desconhecidos" no admin
        currentDeliveryFee = infoBairro ? parseFloat(infoBairro.custo) : 0;
    } 
    // 3. MODO: IFOOD / DISTÂNCIA
    else if (mode === 'ifood' || mode === 'distance') {
        // ATENÇÃO: Como seu site não tem GPS, este modo não funciona automaticamente.
        // TENTATIVA DE SALVAMENTO: Vamos ver se o cliente digitou um bairro que você cadastrou.
        // Isso permite você usar a tabela "iFood" mas cobrar pelo Bairro se o GPS falhar.
        
        const inputBairro = document.getElementById('input-district');
        const bairroCliente = inputBairro ? removerAcentos(inputBairro.value.trim().toLowerCase()) : "";
        
        // Tenta achar o bairro na lista de distritos (caso você tenha cadastrado)
        const infoBairro = configPedidos.deliveryDistricts?.find(b => 
            removerAcentos(b.nome.toLowerCase()) === bairroCliente
        );

        if (infoBairro) {
            currentDeliveryFee = parseFloat(infoBairro.custo);
        } else {
            // Se não achou bairro e não tem GPS, cobra uma TAXA MÍNIMA em vez de Grátis
            // Cobra R$ 5,00 (ou o valor da primeira faixa da tabela ifood) para não sair perdendo
            currentDeliveryFee = 5.99; // Valor de segurança
        }
    } else {
        currentDeliveryFee = 0;
    }

    return currentDeliveryFee;
}
function removerAcentos(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

    // Prepara a lista de itens para o cupom de impressão
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

    // Injeta os dados no HTML de impressão
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

    // Atualiza a listagem que aparece na tela (Resumo da Conta)
    if (screenItemsList) {
        let screenHtml = '';
        items.forEach(item => {
            const itemTotal = item.price * item.quantity;
            screenHtml += `
                <div class="flex justify-between items-start mb-2 border-b border-gray-100 pb-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-cyan-700">${item.quantity}x</span> 
                            <span class="text-gray-800 font-semibold text-xs">${item.name}</span>
                        </div>
                        <p class="text-[10px] text-gray-400 italic leading-tight">${item.details || ''}</p>
                    </div>
                    <span class="text-gray-800 font-bold text-xs">R$ ${itemTotal.toFixed(2).replace('.', ',')}</span>
                </div>`;
        });
        screenItemsList.innerHTML = screenHtml;

        // --- CORREÇÃO DO FRETE NA TELA ---
        const valorFrete = total - subtotal;
        const deliveryEl = document.getElementById('receipt-delivery');
        
        if (deliveryEl) {
            if (valorFrete > 0) {
                deliveryEl.innerText = `R$ ${valorFrete.toFixed(2).replace('.', ',')}`;
                deliveryEl.classList.remove('text-green-600');
                deliveryEl.classList.add('text-gray-800');
            } else {
                deliveryEl.innerText = 'Grátis';
                deliveryEl.classList.add('text-green-600');
            }
        }

        document.getElementById('receipt-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        document.getElementById('receipt-total').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }
};
window.toggleReceipt = () => {
    const el = document.getElementById('receipt-details');
    const arr = document.getElementById('arrow-receipt');
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        arr.classList.add('rotate-180');
    } else {
        el.classList.add('hidden');
        arr.classList.remove('rotate-180');
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
// ============================================================
//  CARREGAR INFO DA LOJA (ENDEREÇO, HORÁRIOS) NO SITE
// ============================================================

function monitorarInfoLoja() {
    if(!db) return;
    
    // Escuta em tempo real o documento 'config/loja_info'
    onSnapshot(doc(db, "config", "loja_info"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            aplicarDadosLojaNoSite(data);
        }
    });
}

function aplicarDadosLojaNoSite(data) {
    // 1. Imagem da Fachada (Resolve a imagem quebrada)
    const facadeImg = document.querySelector('#info-modal img');
    if(facadeImg && data.facadeUrl) {
        facadeImg.src = data.facadeUrl;
        facadeImg.style.opacity = "1"; // Deixa a foto nítida
    }

    // 2. Horários (Usa o texto que você digitou no Dashboard)
    const hoursEl = document.getElementById('info-hours');
    if(hoursEl) {
        hoursEl.innerHTML = data.horarioTexto ? data.horarioTexto.replace(/\n/g, '<br>') : "Consulte nossos horários";
    }

    // 3. Outros campos
    if(document.getElementById('info-address')) document.getElementById('info-address').innerText = data.endereco || "";
    if(document.getElementById('info-phone')) document.getElementById('info-phone').innerText = data.whatsapp || "";
}
// Chame esta função na inicialização
document.addEventListener('DOMContentLoaded', () => {
    monitorarInfoLoja();
});
function animarVooParaCarrinho(event) {
    // 1. Identifica o ponto de partida (onde o usuário clicou)
    const startX = event.clientX;
    const startY = event.clientY + window.scrollY;

    // 2. Identifica o destino (Ícone do carrinho no cabeçalho)
    // Certifique-se de que o ícone do carrinho tenha a classe 'cart-icon-target' ou ID 'cart-btn'
    const cartBtn = document.querySelector('.fa-shopping-cart') || document.querySelector('#cart-btn');
    if (!cartBtn) return;

    const cartRect = cartBtn.getBoundingClientRect();
    const targetX = cartRect.left + (cartRect.width / 2);
    const targetY = cartRect.top + window.scrollY + (cartRect.height / 2);

    // 3. Cria o "Flyer" (Cópia do SVG que você mandou)
    const flyer = document.createElement('div');
    flyer.className = 'acai-flyer';
    flyer.style.left = `${startX - 20}px`;
    flyer.style.top = `${startY - 25}px`;

    // Variáveis CSS para o destino
    flyer.style.setProperty('--tx', `${targetX - startX}px`);
    flyer.style.setProperty('--ty', `${targetY - startY}px`);

    // Injeta o SVG do TropiBerry que você forneceu
    flyer.innerHTML = `
        <svg viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
            <ellipse cx="32" cy="74" rx="16" ry="3" fill="black" fillOpacity="0.1" />
            <path d="M14 18L20 70C20.5 73 23 75 26 75H38C41 75 43.5 73 44 70L50 18" fill="#E1F5F9" fillOpacity="0.8" stroke="#00838F" strokeWidth="1.5" />
            <path d="M20.5 65L21.5 71C21.8 73.5 24 75 26.5 75H37.5C40 75 42.2 73.5 42.5 71L43.5 65H20.5Z" fill="#00838F" />
            <path d="M19.5 55L20.5 65H43.5L44.5 55H19.5Z" fill="#F0FDFF" />
            <path d="M13 18C13 10 22 6 32 6C42 6 51 10 51 18H13Z" fill="white" fillOpacity="0.4" stroke="#00838F" strokeWidth="1" />
        </svg>
    `;

    document.body.appendChild(flyer);

    // 4. Feedback no ícone do carrinho ao "chegar"
    setTimeout(() => {
        cartBtn.classList.add('animate-cart-pulse');
        setTimeout(() => cartBtn.classList.remove('animate-cart-pulse'), 400);
        flyer.remove();
    }, 800);
}
window.adicionarAoCarrinhoRapido = function(event, produtoId) {
    event.stopPropagation(); // Impede de abrir a página do produto
    
    // Busca o produto na lista global
    const produto = products.find(p => p.id === produtoId);
    if (!produto) return;

    // Se o produto tiver complementos obrigatórios, obrigamos a abrir o modal
    const temObrigatorios = produto.complementIds && produto.complementIds.length > 0;
    if (temObrigatorios) {
        abrirModalRapido(produtoId);
        return;
    }

    // Cria o item para o carrinho
    const cartItem = {
        id: `${produto.id}-${Date.now()}`,
        originalId: produto.id,
        name: produto.name,
        price: produto.price,
        image: produto.image,
        quantity: 1,
        details: ""
    };

    // Adiciona ao carrinho global
    cart.push(cartItem);
    
    // Atualiza a interface
    updateCartUI();
    
    // DISPARA A ANIMAÇÃO!
    animarVooParaCarrinho(event);
    
    showToast("Adicionado!");
};
// Função para Limpar todo o Carrinho
window.limparCarrinho = function() {
    // Se o carrinho já estiver vazio, não faz nada
    if (cart.length === 0) return;

    // 1. LIMPA TUDO (Sem janelas de confirmação/alert)
    cart = []; 
    localStorage.removeItem('tropyberry_cart'); 
    
    // 2. ATUALIZA A TELA (Mostra "Carrinho vazio")
    updateCartUI(); 
    
    // 3. FEEDBACK VISUAL (Usa o seu sistema de Toast)
    showToast("Carrinho esvaziado!");

    // 4. FECHA O CARRINHO (Opcional - dá um tempo para o usuário ver que limpou)
    setTimeout(() => {
        const modal = document.getElementById('cart-modal');
        if (modal && !modal.classList.contains('hidden')) {
            toggleCart();
        }
    }, 800);
};  
async function carregarConfiguracoesSite() {
    const docSnap = await getDoc(doc(db, "config", "pedidos"));
    if (docSnap.exists()) {
        configPedidos = docSnap.data(); // Agora contém delivMin, delivServiceFee, etc.
    }
}
// --- CÁLCULO VIA GOOGLE MAPS ---
window.calcularDistanciaGoogle = () => {
    // 1. Pega os dados
    const rua = document.getElementById('input-street').value;
    const num = document.getElementById('input-number').value;
    const bairro = document.getElementById('input-district').value;
    
    // Se faltar dados, não calcula
    if(!rua || !num || !bairro) return;

    // 2. Monta os endereços
    // DICA: No "origin", coloque o endereço fixo da sua loja para ser mais preciso
    const origin = "Av. Exemplo, 123, João Pessoa, PB"; 
    const destination = `${rua}, ${num} - ${bairro}, João Pessoa, PB`;

    // Mostra que está pensando...
    const labelFrete = document.getElementById('receipt-delivery');
    if(labelFrete) {
        labelFrete.innerText = "Calculando...";
        labelFrete.classList.remove('text-green-600');
        labelFrete.classList.add('text-orange-500', 'animate-pulse');
    }

    // 3. Chama o Google
    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
        origins: [origin],
        destinations: [destination],
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.METRIC
    }, (response, status) => {
        if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
            
            // 4. Sucesso: Pega a distância
            const distanciaMetros = response.rows[0].elements[0].distance.value;
            const distanciaKm = distanciaMetros / 1000;
            
            // Pega o preço por KM configurado (ou usa 1.50 como padrão)
            const precoPorKm = configPedidos.deliveryPricePerKm || 1.50;
            
            // CÁLCULO FINAL
            let valorFrete = distanciaKm * precoPorKm;

            // Aplica um valor mínimo (ex: nunca ser menos que R$ 5,00)
            const valorMinimo = configPedidos.delivMin || 5.00;
            if (valorFrete < valorMinimo) valorFrete = valorMinimo;

            freteGoogleCalculado = valorFrete;
            console.log(`Google: ${distanciaKm}km = R$ ${valorFrete}`);

            // Atualiza a tela
            renderReceipt(); 

        } else {
            console.error("Erro Google Maps:", status);
            // Se der erro (endereço não achado), cobra um valor fixo de segurança
            freteGoogleCalculado = configPedidos.deliveryFixedPrice || 10.00; 
            renderReceipt();
        }
    });
};
// Função para abrir/fechar o Menu de Perfil (Unificado PC/Mobile)
window.toggleUserMenu = () => {
    const overlay = document.getElementById('user-menu-overlay');
    const menu = document.getElementById('user-menu-content');
    
    if (menu.classList.contains('hidden')) {
        // Abrir
        menu.classList.remove('hidden');
        if(window.innerWidth < 768) {
            // Animação Mobile (Sobe de baixo)
            menu.classList.add('animate-slide-up');
            overlay.classList.remove('hidden');
        } else {
            // Desktop (Dropdown simples, sem overlay escuro obrigatório, mas opcional)
            menu.classList.add('animate-fade-in'); 
            // overlay.classList.remove('hidden'); // Descomente se quiser fundo escuro no PC também
        }
    } else {
        // Fechar
        menu.classList.add('hidden');
        overlay.classList.add('hidden');
        menu.classList.remove('animate-slide-up', 'animate-fade-in');
    }
};
// =========================================
// MÓDULO MEUS PEDIDOS (CLIENTE)
// =========================================

// Variável para guardar o email do usuário logado (será preenchida no monitorarEstadoAuth)
let loggedUserEmail = null;

// Atualize o monitorarEstadoAuth no início do arquivo para salvar o email
// (Procure onde tem 'monitorarEstadoAuth' no seu código e adicione a linha marcada abaixo)
/* monitorarEstadoAuth(async (user) => {
        if (user) {
            loggedUserEmail = user.email; // <--- ADICIONE ISSO NA SUA FUNÇÃO EXISTENTE
            // ... resto do código
        }
    });
*/

window.abrirMeusPedidos = async () => {
    // Fecha o menu de perfil para não atrapalhar
    const userMenu = document.getElementById('user-menu-content');
    const overlay = document.getElementById('user-menu-overlay');
    if(userMenu) userMenu.classList.add('hidden');
    if(overlay) overlay.classList.add('hidden');

    const modal = document.getElementById('my-orders-modal');
    const list = document.getElementById('my-orders-list');
    
    if(!modal) return;
    modal.classList.remove('hidden');

    if (!loggedUserEmail) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                <i class="fas fa-user-lock text-4xl mb-3"></i>
                <p>Faça login para ver seus pedidos.</p>
                <button onclick="window.location.href='login.html'" class="mt-4 bg-cyan-600 text-white px-4 py-2 rounded-lg font-bold">Fazer Login</button>
            </div>`;
        return;
    }

    try {
        // Busca pedidos onde 'customer.email' é igual ao email do usuário logado
        // Importante: Requer índice composto no Firebase (Se der erro no console, clique no link que o Firebase gerar)
        const q = query(
            collection(db, "pedidos"), 
            where("customer.email", "==", loggedUserEmail),
            orderBy("createdAt", "desc") // Ordena do mais recente para o antigo
        );

        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                    <i class="fas fa-receipt text-4xl mb-3"></i>
                    <p>Você ainda não fez nenhum pedido.</p>
                    <button onclick="fecharMeusPedidos()" class="mt-4 text-cyan-600 font-bold hover:underline">Ir para o Cardápio</button>
                </div>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const order = doc.data();
            const date = order.createdAt ? order.createdAt.toDate().toLocaleDateString('pt-BR') + ' às ' + order.createdAt.toDate().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'Data desc.';
            
            // Definição de cores por status
            let statusColor = 'bg-gray-100 text-gray-600';
            let statusIcon = 'fa-clock';
            
            if(order.status === 'Aguardando') { statusColor = 'bg-orange-100 text-orange-600'; statusIcon = 'fa-hourglass-half'; }
            if(order.status === 'Em Preparo') { statusColor = 'bg-blue-100 text-blue-600'; statusIcon = 'fa-fire'; }
            if(order.status === 'Saiu para Entrega') { statusColor = 'bg-purple-100 text-purple-600'; statusIcon = 'fa-motorcycle'; }
            if(order.status === 'Finalizado') { statusColor = 'bg-green-100 text-green-600'; statusIcon = 'fa-check-circle'; }
            if(order.status === 'Cancelado' || order.status === 'Rejeitado') { statusColor = 'bg-red-100 text-red-600'; statusIcon = 'fa-times-circle'; }

            // Lista de itens resumida
            let itemsHtml = order.items.map(i => `<span class="block text-gray-600 text-xs">• ${i.quantity}x ${i.name}</span>`).join('');

            html += `
                <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition">
                    <div class="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                        <div>
                            <span class="text-xs font-bold text-gray-400">#${doc.id.slice(-5).toUpperCase()}</span>
                            <p class="text-xs text-gray-500">${date}</p>
                        </div>
                        <div class="${statusColor} px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            <i class="fas ${statusIcon}"></i> ${order.status}
                        </div>
                    </div>
                    
                    <div class="mb-3 pl-2 border-l-2 border-gray-100">
                        ${itemsHtml}
                    </div>

                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-gray-200">
                        <span class="text-sm font-bold text-gray-700">Total: R$ ${parseFloat(order.total).toFixed(2).replace('.', ',')}</span>
                        
                        <button onclick="openOrderScreen('${doc.id}')" class="text-cyan-600 text-xs font-bold hover:bg-cyan-50 px-3 py-1.5 rounded transition border border-cyan-200">
                            Ver Detalhes
                        </button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;

    } catch (e) {
        console.error("Erro ao carregar pedidos:", e);
        // Tratamento especial para o erro de índice do Firebase
        if(e.message.includes("requires an index")) {
            console.warn("⚠️ NECESSÁRIO CRIAR ÍNDICE NO FIREBASE. VEJA O LINK NO CONSOLE.");
        }
        list.innerHTML = '<p class="text-center text-red-500 py-4">Erro ao carregar pedidos. Tente novamente.</p>';
    }
};

window.fecharMeusPedidos = () => {
    document.getElementById('my-orders-modal').classList.add('hidden');
};