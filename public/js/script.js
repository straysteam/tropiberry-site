    import { 
        getFirestore, 
        collection, 
        onSnapshot, 
        doc, 
        getDoc, 
        setDoc, 
        addDoc, 
        updateDoc, 
        serverTimestamp, 
        query, 
        orderBy, 
        getDocs,
        deleteDoc,
        where
    } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

    import { monitorarEstadoAuth, fazerLogout, verificarAdminNoBanco, db as authDb } from './auth.js'; 
    import { renderizarHeaderGlobal, garantirModaisGlobais } from './components.js';
    import { iniciarMonitoramentoPedidosCliente } from './notifications.js';
    import { pedirPermissaoNotificacao } from './notifications.js';

    // 1. Defina o Token do Mapbox e a Origem
const MAPBOX_TOKEN = 'pk.eyJ1Ijoib2Zmd2V4bGV5IiwiYSI6ImNtcDZma3YwNDFtZ2IydXB2dTd4ejdrYXAifQ.UXcdVBrrvAq1n7IqgVVo1g';
const ORIGEM_COORD = [-34.870621816331834, -7.200324786180237]; // [Longitude, Latitude] da TropiBerry

    let currentUserIsAdmin = false;
    // Usa o banco já inicializado no auth.js
    let db = authDb; 
    let monitorPedidoAtivo = null;

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
    let distanciaConfirmada = false;
    let ultimoEnderecoCalculado = "";


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


    // Variável para guardar o email do usuário logado
    let loggedUserEmail = null;

    // === INICIALIZAÇÃO ===
    document.addEventListener('DOMContentLoaded', async () => {

        // 1. Renderiza o Header (Isso cria a div 'auth-buttons-container')
        renderizarHeaderGlobal();
        garantirModaisGlobais();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/firebase-messaging-sw.js')
            .then((registration) => {
                console.log('Service Worker registrado com sucesso:', registration.scope);
            })
            .catch((err) => {
                console.log('Falha ao registrar o Service Worker:', err);
            });
        }

    // Procure por essa verificação no início ou no monitoramento de página do script.js
    if (window.location.pathname.includes('produto')) { // Removido o .html
        const params = new URLSearchParams(window.location.search);
        const productId = params.get('id');
        
        if (productId) {
            // No Firebase, precisamos garantir que o Firebase Auth/DB carregou antes de pedir o produto
            setTimeout(() => {
                if (typeof carregarPaginaProduto === 'function') {
                    carregarPaginaProduto(productId);
                }
            }, 500); 
        }
    }

        await carregarCategoriasSite();
        await carregarConfiguracoesSite();
        
        // Inicia monitoramento
        monitorarComplementosGlobal(); 
        carregarProdutosDoBanco();
        monitorarStatusLojaNoBanco();
        monitorarInfoLoja();
        
    monitorarEstadoAuth(async (user) => {
            const desktopAuthArea = document.getElementById('desktop-auth-area');
            const menuName = document.getElementById('menu-user-name');
            const menuEmail = document.getElementById('menu-user-email');
            const guestOptions = document.getElementById('menu-guest-options');
            const loggedOptions = document.getElementById('menu-logged-options');
            const adminLinks = document.getElementById('menu-admin-links');

            if (user) {
                // USUÁRIO LOGADO
                loggedUserEmail = user.email;
                
                // Lógica de Fidelidade (Corrigido de 'usuario' para 'user')
                if (typeof monitorarFidelidadeUser === 'function') {
                    monitorarFidelidadeUser(user.email);
                }

                currentUserIsAdmin = await verificarAdminNoBanco(user.email);

                // Preenche e-mail no checkout
                const emailInput = document.getElementById('input-email');
                if (emailInput && !emailInput.value) {
                    emailInput.value = user.email;
                }

                // Inicialização de Notificações e Pedidos
                iniciarMonitoramentoPedidosCliente(user.email);
                
                if ("Notification" in window) {
                    Notification.requestPermission();
                }

                if (window.location.pathname.includes('pedidos.html')) {
                    abrirMeusPedidos(); 
                }
                
                // Define o nome de exibição (fallback para o email se não houver nome)
                const userName = user.displayName || user.email.split('@')[0];

                // 1. Atualiza Header Desktop
                if(desktopAuthArea) {
                    desktopAuthArea.innerHTML = `
                        <div class="flex items-center gap-3 cursor-pointer hover:bg-cyan-700 p-2 rounded-lg transition" onclick="toggleUserMenu()">
                            <div class="text-right hidden lg:block">
                                <p class="text-xs font-bold text-white leading-none">${userName}</p>
                                <p class="text-[10px] text-cyan-200 leading-none">Minha Conta</p>
                            </div>
                            <div class="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white border border-white/30 font-bold">
                                ${userName.charAt(0).toUpperCase()}
                            </div>
                        </div>
                    `;
                }

                // 2. Atualiza o Menu Dropdown/Modal
                if(menuName) menuName.innerText = userName;
                if(menuEmail) menuEmail.innerText = user.email;
                
                if(guestOptions) guestOptions.classList.add('hidden');
                if(loggedOptions) loggedOptions.classList.remove('hidden');
                
                if(adminLinks) {
                    if(currentUserIsAdmin) adminLinks.classList.remove('hidden');
                    else adminLinks.classList.add('hidden');
                }

                atualizarInteratividadeBotaoLoja();
                if(currentProductDetail) verificarBotaoAdmin(currentProductDetail.id);

            } else {
                // USUÁRIO DESLOGADO
                currentUserIsAdmin = false;
                loggedUserEmail = null;

                if (window.location.pathname.includes('pedidos.html')) {
                    window.location.href = 'login.html';
                }

                if(desktopAuthArea) {
                    desktopAuthArea.innerHTML = `
                        <a href="login.html" class="text-sm font-bold text-white hover:text-yellow-300 transition">Entrar</a>
                        <a href="cadastro.html" class="bg-white text-cyan-900 text-sm px-4 py-2 rounded-full font-bold hover:bg-gray-100 transition shadow-sm">Criar Conta</a>
                    `;
                }

                if(menuName) menuName.innerText = "Visitante";
                if(menuEmail) menuEmail.innerText = "Faça login para aproveitar";
                
                if(guestOptions) guestOptions.classList.remove('hidden');
                if(loggedOptions) loggedOptions.classList.add('hidden');
                
                atualizarInteratividadeBotaoLoja();
            }

            if (typeof updateStoreStatusUI === 'function') updateStoreStatusUI();
            if (typeof checkLastOrder === 'function') checkLastOrder();
        });

        // Sincronização de Cupons
        if (typeof monitorarCuponsDoBanco === 'function') {
            monitorarCuponsDoBanco();
        }
    });
    function calcularDescontoCupom(subtotal, frete, cupom) {
        if (!cupom) return 0;
        let desconto = 0;

        if (cupom.tipo === 'fixo') {
            desconto = parseFloat(cupom.valor) || 0;
        } else if (cupom.tipo === 'porcentagem') {
            const fator = cupom.valor > 1 ? cupom.valor / 100 : cupom.valor;
            desconto = subtotal * fator;
        } else if (cupom.tipo === 'frete') {
            if (frete !== null) {
                const kmAtual = window.distanciaKmGlobal || 0;
                // Se o kmLimit for 0 (ilimitado) ou o KM do cliente for menor que o limite
                if (cupom.kmLimit === 0 || kmAtual <= cupom.kmLimit) {
                    desconto = frete;
                } else {
                    desconto = 0;
                }
            }
        }
        return Math.max(0, desconto);
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

        // 1. Filtra por categoria
        let listaParaExibir = filterCategory ? products.filter(p => p.category === filterCategory) : products;

        // 2. FILTRO DE ESTOQUE
        listaParaExibir = listaParaExibir.filter(p => {
            if (p.stockControl === true && (p.stock || 0) <= 0) return false;
            if (p.available === false) return false;
            return true;
        });


    if(window.location.pathname.includes('cardapio')) {
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const btnCat = btn.getAttribute('data-cat');
            // Se a categoria do botão for a selecionada (ou se for 'all' quando o filtro for nulo)
            if(btnCat === (filterCategory || 'all')) {
                btn.className = "btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md";
            } else {
                btn.className = "btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition";
            }
        });
    }

        if (listaParaExibir.length === 0) {
            if (products.length > 0) {
                container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">Nenhum produto disponível nesta categoria.</div>`;
            } else {
                container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 flex flex-col items-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mb-2"></div>Carregando cardápio...</div>`;
            }
            return;
        }

        // Renderiza o HTML
        container.innerHTML = listaParaExibir.map(product => {
            const hasComplements = product.complementIds && product.complementIds.length > 0;
            let prefixPrice = hasComplements ? '<span class="text-[10px] text-gray-500 font-normal mr-1 block">A partir de</span>' : '';
            
            let displayPrice = parseFloat(product.price);

            if (displayPrice === 0 && hasComplements) {
                let minPackagingCost = 0;
                if(globalComplements) {
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

            let stockAlert = '';
            if (product.stockControl && product.stock <= 5 && product.stock > 0) {
                stockAlert = `<span class="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold animate-pulse z-10">Restam ${product.stock}</span>`;
            }

            return `
            <div onclick="window.location.href='produto.html?id=${product.id}'" class="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col h-full border border-gray-100 relative cursor-pointer">
                ${stockAlert}
                
                <div class="h-40 w-full relative overflow-hidden bg-gray-100 shrink-0">
                    <img 
                        src="${product.image || 'https://via.placeholder.com/300'}" 
                        alt="${product.name}" 
                        class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                    >
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
        
        // IDs de controle de UI - Captura de forma segura
        const loadingEl = document.getElementById(`${containerPrefix}-loading`);
        const contentEl = document.getElementById(`${containerPrefix}-content`);
        const detailContainer = document.getElementById('product-detail-container') || document.getElementById('detail-content'); 
        
        // Mostra o loading e esconde o conteúdo antes de começar
        if(loadingEl) loadingEl.classList.remove('hidden');
        if(contentEl) contentEl.classList.add('hidden');
        // Se estivermos na página de detalhes, garante que o container principal suma durante a busca
        if(containerPrefix === 'detail' && detailContainer) detailContainer.classList.add('hidden');

        try {
            const docRef = doc(db, "produtos", id);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                if(loadingEl) loadingEl.innerHTML = '<p class="text-red-500 font-bold p-10">Produto não encontrado.</p>';
                return;
            }

            currentProductDetail = { id: docSnap.id, ...docSnap.data() };
            currentQtd = 1; 
            selectedOptions = {}; 

            // Preenche Imagem e Textos com verificação de existência do elemento
            const imgEl = document.getElementById(`${containerPrefix}-img`);
            if(imgEl) imgEl.src = currentProductDetail.image || 'https://via.placeholder.com/400';
            
            const nameEl = document.getElementById(`${containerPrefix}-name`);
            if(nameEl) nameEl.innerText = currentProductDetail.name;
            
            const descEl = document.getElementById(`${containerPrefix}-desc`);
            if(descEl) descEl.innerText = currentProductDetail.description || '';
            
            // Tags
            const tagsContainer = document.getElementById(`${containerPrefix}-tags`);
            if(tagsContainer && currentProductDetail.tags) {
                tagsContainer.innerHTML = generatingTagsHTML(currentProductDetail.tags);
            }

            // Info Extra (Serve X pessoas, Peso, etc)
            const infoContainer = document.getElementById(`${containerPrefix}-extra-info`);
            if(infoContainer) {
                let infoHtml = '';
                if(currentProductDetail.serves > 1) infoHtml += `<span class="bg-blue-50 text-cyan-800 text-xs font-bold px-3 py-1 rounded-lg"><i class="fas fa-user-friends"></i> Serve ${currentProductDetail.serves}</span>`;
                if(currentProductDetail.weight) infoHtml += `<span class="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-lg"><i class="fas fa-weight-hanging"></i> ${currentProductDetail.weight}${currentProductDetail.unit || 'g'}</span>`;
                infoContainer.innerHTML = infoHtml;
            }

            // --- CÁLCULO DE COMPLEMENTOS E PREÇO ---
            const compsContainer = document.getElementById(`${containerPrefix}-complements`) || document.getElementById('complements-section');
            let minPackagingCost = 0; 

            // O uso do || [] evita que o código quebre se o produto não tiver complementos
            if (currentProductDetail.complementIds && currentProductDetail.complementIds.length > 0) {
                minPackagingCost = await carregarComplementosDoProduto(currentProductDetail.complementIds || [], compsContainer, containerPrefix);
            } else {
                if(compsContainer) compsContainer.innerHTML = '';
            }

            // Define Preço para Exibição
            let basePriceDisplay = currentProductDetail.price || 0;
            if (basePriceDisplay === 0 && minPackagingCost > 0) {
                basePriceDisplay = minPackagingCost;
            }

            const priceEl = document.getElementById(`${containerPrefix}-price`);
            const hasComplements = currentProductDetail.complementIds && currentProductDetail.complementIds.length > 0;
            
            if(priceEl) {
                if(hasComplements && basePriceDisplay > 0) {
                    priceEl.innerHTML = `<span class="text-sm text-gray-500 font-normal mr-1">A partir de</span> R$ ${basePriceDisplay.toFixed(2).replace('.', ',')}`;
                } else {
                    priceEl.innerText = `R$ ${basePriceDisplay.toFixed(2).replace('.', ',')}`;
                }
            }

            // Preço Original (Desconto)
            const op = document.getElementById(`${containerPrefix}-original-price`);
            if (op) {
                if (currentProductDetail.originalPrice > basePriceDisplay) {
                    op.innerText = `R$ ${currentProductDetail.originalPrice.toFixed(2).replace('.', ',')}`;
                    op.classList.remove('hidden');
                } else {
                    op.classList.add('hidden');
                }
            }

            // Quantidade inicial
            const qtdEl = document.getElementById(`${containerPrefix}-qtd`) || document.getElementById(`${containerPrefix}-qtd-mobile`);
            if(qtdEl) qtdEl.innerText = '1';

            // === FINALIZAÇÃO: Esconde o loading e mostra os dados ===
            if(loadingEl) loadingEl.classList.add('hidden');
            if(contentEl) contentEl.classList.remove('hidden');
            // Importante: Mostra o container que foi escondido no início
            if(detailContainer) detailContainer.classList.remove('hidden');

            atualizarTotalDetalhe(containerPrefix);
            if(containerPrefix === 'detail') verificarBotaoAdmin(id);

        } catch (e) {
            console.error("Erro fatal ao carregar produto:", e);
            if(loadingEl) loadingEl.innerHTML = '<p class="text-red-500 p-10">Erro de conexão. Verifique sua internet.</p>';
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
        let packagingMinPrice = 0; 

        for (const groupId of ids) {
            try {
                const groupSnap = await getDoc(doc(db, "complementos", groupId));
                if (groupSnap.exists()) {
                    const group = { id: groupSnap.id, ...groupSnap.data() };
                    currentComplements.push(group);
                    renderizarGrupoComplemento(group, containerElement, prefix);

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
            // --- REGRA DE OCULTAR: Se o item estiver com 'available: false' no Admin, ele não será renderizado ---
            if (opt.available === false) return; 

            const uniqueId = `${prefix}-g-${group.id}-opt-${index}`; 
            const priceHtml = opt.price > 0 ? `<span class="text-cyan-700 font-bold text-xs">+ R$ ${opt.price.toFixed(2).replace('.',',')}</span>` : '<span class="text-green-600 font-bold text-xs">Grátis</span>';
            
            // Estrutura limpa: Apenas o seletor, a imagem (se houver) e o nome do item
            optionsHtml += `
                <div class="flex items-center gap-2 mb-2">
                    <label class="flex-1 flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-cyan-50 transition bg-white" for="${uniqueId}">
                        <div class="flex items-center gap-3">
                            <input type="${type}" name="${prefix}-group-${group.id}" id="${uniqueId}" 
                                value="${index}" 
                                onchange="toggleOption('${group.id}', ${index}, '${type}', '${prefix}')"
                                class="w-5 h-5 text-cyan-600 focus:ring-cyan-500 border-gray-300 ${type === 'radio' ? '' : 'rounded'}">
                            
                            <div class="flex items-center gap-3">
                                ${opt.image ? `<img src="${opt.image}" class="w-10 h-10 rounded-lg object-cover border shadow-sm">` : ''}
                                <div class="flex flex-col">
                                    <span class="font-bold text-gray-700 text-sm">${opt.name}</span>
                                </div>
                            </div>
                        </div>
                        ${priceHtml}
                    </label>
                </div>
            `;
        });

        const html = `
            <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200" id="${prefix}-group-card-${group.id}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-bold text-cyan-900 text-lg">${group.title}</h3>
                        <p class="text-[10px] font-bold ${isRequired ? 'text-red-500' : 'text-gray-400'} uppercase">
                            ${isRequired ? 'OBRIGATÓRIO' : 'Opcional'} • Escolha até ${group.max}
                        </p>
                    </div>
                    <div id="${prefix}-badge-${group.id}" class="bg-gray-200 text-gray-500 text-[10px] px-2 py-1 rounded-full uppercase font-bold">
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
        
        // 1. Calcula o preço dos adicionais
        Object.values(selectedOptions).forEach(list => {
            if(list && Array.isArray(list)) {
                list.forEach(opt => addonsTotal += (opt.price || 0));
            }
        });

        const unitPrice = (currentProductDetail.price + addonsTotal);
        const finalTotal = unitPrice * currentQtd;

        // 2. Atualiza os textos de preço
        const btn = document.getElementById(`${prefix}-total-btn`);
        if(btn) btn.innerText = `R$ ${finalTotal.toFixed(2).replace('.', ',')}`;
        
        if(prefix === 'detail') {
            const btnMob = document.getElementById('detail-total-mobile');
            if(btnMob) btnMob.innerText = `R$ ${finalTotal.toFixed(2).replace('.', ',')}`;
        }

        // 3. TRAVA DE SEGURANÇA VISUAL (Desabilita o botão)
        const allRequiredMet = currentComplements.every(g => {
            // Se o grupo não é obrigatório, passa direto
            if (!g.required) return true;
            
            // Verifica se selecionou a quantidade mínima (geralmente 1)
            const selected = selectedOptions[g.id] || [];
            return selected.length >= (g.min || 1);
        });

        const addBtn = document.getElementById(`${prefix}-btn-add`) || document.getElementById('btn-add-cart-detail');
        
        if(addBtn) {
            addBtn.disabled = !allRequiredMet; // Se não cumpriu os requisitos, DESABILITA (True)
            
            if(!allRequiredMet) {
                // Estilo visual de bloqueado
                addBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
                addBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                if(btn) btn.innerText = "Escolha os itens";
            } else {
                // Estilo visual de liberado
                addBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
                addBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
            }
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

        // === TRAVA FINAL DE SEGURANÇA ===
        const pendencias = currentComplements.filter(g => {
            if (!g.required) return false;
            const selected = selectedOptions[g.id] || [];
            return selected.length < (g.min || 1);
        });

        if (pendencias.length > 0) {
            showToast(`Selecione: ${pendencias[0].title}`, true);
            
            const cardFaltante = document.getElementById(`modal-group-card-${pendencias[0].id}`) || document.getElementById(`detail-group-card-${pendencias[0].id}`);
            if(cardFaltante) {
                cardFaltante.scrollIntoView({ behavior: 'smooth', block: 'center' });
                cardFaltante.classList.add('border-red-500', 'animate-pulse');
                setTimeout(() => cardFaltante.classList.remove('border-red-500', 'animate-pulse'), 2000);
            }
            return; 
        }

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
const quickModal = document.getElementById('quick-view-modal'); // Puxa o elemento com segurança

// Verifica se o modal existe na página ANTES de checar o classList
if(quickModal && !quickModal.classList.contains('hidden') && modalObs) {
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
        animarVooParaCarrinho(window.event);
        showToast("Adicionado ao pedido!");
        fecharModalRapido();
    }

    function carregarProdutosDoBanco() {
        if(!db) return;
        const colRef = collection(db, "produtos");
        onSnapshot(colRef, (snapshot) => {
            products = [];
            snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
            const grid = document.getElementById('product-grid');
            if (grid) {
                // --- MUDANÇA AQUI: Remova o .html ---
                if (window.location.pathname.includes('cardapio')) { 
                    renderProducts('product-grid', null); 
                } 
                else { 
                    renderProducts('product-grid', 'destaques'); 
                }
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

            // --- MUDANÇA AQUI: Remova o .html ---
            // Agora ele funciona em "cardapio.html" (Local) e "/cardapio" (Firebase)
            if(window.location.pathname.includes('cardapio')) { 
                renderizarBotoesCategorias(); 
            }
        } catch(e) { console.error("Erro categorias:", e); }
    }
    function renderizarBotoesCategorias() {
        const container = document.getElementById('category-filters'); 
        
        if(!container) return;

        let html = `<button onclick="renderProducts('product-grid', null)" class="btn-filter px-6 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md whitespace-nowrap flex-shrink-0" data-cat="all">Todos</button>`;
        
        categories.forEach(cat => { 
            html += `<button onclick="renderProducts('product-grid', '${cat.slug}')" class="btn-filter px-6 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition whitespace-nowrap flex-shrink-0" data-cat="${cat.slug}">${cat.nome}</button>`; 
        });
        
        container.innerHTML = html;
    }   
    // Substitua a função monitorarStatusLojaNoBanco no arquivo js/script.js

    function monitorarStatusLojaNoBanco() {
        if(!db) return;
        try {
            const docRef = doc(db, "config", "loja");
            onSnapshot(docRef, (docSnap) => { 
                if (docSnap.exists()) { 
                    const dados = docSnap.data();
                    isStoreOpen = dados.aberto; 
                    
                    updateStoreStatusUI(); 

                    // === O TOQUE MÁGICO AO VIVO (CORREÇÃO) ===
                    const checkoutModal = document.getElementById('checkout-modal');
                    if (checkoutModal && !checkoutModal.classList.contains('hidden')) {
                        // Se a loja fechar e NÃO aceitar agendamento, fecha o modal na cara do cliente e avisa
                        if (!isStoreOpen && !configPedidos.allowScheduled) {
                            closeCheckout();
                            showToast("A loja acabou de fechar!", true);
                        } 
                        // Se aceitar agendamento, atualiza a tela na hora pra bloquear a opção "Agora"
                        else if (currentOrder.method) {
                            selectService(currentOrder.method);
                        }
                    }
                    // ==========================================

                    // === LÓGICA DO MODAL DE AVISO (Aparece 1x se fechado) ===
                    if (!isStoreOpen) {
                        const jaMostrou = sessionStorage.getItem('aviso_loja_fechada_mostrado');
                        
                        if (!jaMostrou) {
                            const modalFechado = document.getElementById('closed-store-modal');
                            if (modalFechado) {
                                modalFechado.classList.remove('hidden');
                                sessionStorage.setItem('aviso_loja_fechada_mostrado', 'true');
                            }
                        }
                    } else {
                        sessionStorage.removeItem('aviso_loja_fechada_mostrado');
                    }
                    // ========================================================
                } 
            });
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
    function addToCart(id) { /* Função legada */ }
    function changeQuantity(id, delta) { const item = cart.find(i => i.id === id); if (item) { item.quantity += delta; if (item.quantity <= 0) cart = cart.filter(i => i.id !== id); updateCartUI(); } }

    function updateCartUI() {
        // 1. SALVA NA MEMÓRIA ANTES DE QUALQUER VERIFICAÇÃO HTML (Garante os dados!)
        localStorage.setItem('tropyberry_cart', JSON.stringify(cart));

        // 2. ATUALIZA OS BADGES DO CABEÇALHO (Presentes em todas as páginas)
        const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
        
        const cartCountBadge = document.getElementById('cart-count');
        if (cartCountBadge) {
            cartCountBadge.innerText = totalItems;
            cartCountBadge.classList.toggle('hidden', totalItems === 0);
        }
        
        const badgeDesk = document.getElementById('cart-count-desktop'); 
        if(badgeDesk) {
            badgeDesk.innerText = totalItems;
            badgeDesk.classList.toggle('hidden', totalItems === 0);
        }
        
        const badgeMob = document.getElementById('cart-count-mobile');
        if(badgeMob) {
            badgeMob.innerText = totalItems;
            badgeMob.classList.toggle('hidden', totalItems === 0);
        }

        // 3. SE NÃO TIVER O HTML DO CARRINHO NA PÁGINA (ex: produto.html), PARA AQUI E TUDO BEM!
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotalElement = document.getElementById('cart-total');
        if (!cartItemsContainer || !cartTotalElement) return;

        // 4. RENDERIZAÇÃO DO CARRINHO (Apenas nas páginas onde o modal existe)
        cartItemsContainer.innerHTML = '';
        
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                    <i class="fas fa-shopping-basket text-4xl mb-3"></i>
                    <p class="text-sm font-medium">Seu carrinho está vazio</p>
                </div>`;
        } else {
            const headerHtml = `
                <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                    <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Itens do Pedido</span>
                    <button onclick="limparCarrinho()" class="text-[10px] font-black text-red-500 hover:text-red-700 transition flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg">
                        <i class="fas fa-trash-alt"></i> LIMPAR TUDO
                    </button>
                </div>
            `;
            cartItemsContainer.innerHTML = headerHtml;

            cart.forEach(item => {
                const detailsHtml = `<p class="text-[10px] text-gray-500 line-clamp-1 mb-1 italic">${item.details || ''}</p>`;

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
                            
                            ${detailsHtml}

                            <div class="flex justify-between items-center mt-2">
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

        const savedOrder = localStorage.getItem('tropyberry_last_order');
        if (savedOrder) {
            const orderData = JSON.parse(savedOrder);
            if ((Date.now() - orderData.timestamp) / 1000 / 60 < 30) {
                const backBtnHtml = `
                    <div class="mt-4 pt-2 border-t border-gray-100 text-center animate-fade-in-up">
                        <button onclick="abrirUltimoPedido()" class="w-full bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2 hover:bg-yellow-200 transition">
                            <i class="fas fa-bell animate-pulse"></i> Acompanhar Pedido Anterior
                        </button>
                    </div>
                `;
                cartItemsContainer.insertAdjacentHTML('beforeend', backBtnHtml);
            }
        }

        // === CÁLCULO DE VALORES (SUBTOTAL / FRETE / CUPOM) ===
        const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
        let valorFrete = 0;
        let valorDesconto = 0;

        const rowFrete = document.getElementById('row-cart-delivery');
        const valFrete = document.getElementById('cart-delivery-val');
        
        if (loggedUserEmail && cart.length > 0) {
            const backupMethod = currentOrder.method;
            currentOrder.method = 'delivery'; 
            const freteCalculado = calcularFrete();
            valorFrete = (freteCalculado === null) ? 0 : freteCalculado;

            if (rowFrete && valFrete) {
                rowFrete.classList.remove('hidden');
                if (freteCalculado === null) {
                    valFrete.innerText = "Calculando...";
                    valFrete.className = "text-orange-500 animate-pulse text-xs font-bold";
                } else {
                    valFrete.innerText = freteCalculado > 0 ? `R$ ${freteCalculado.toFixed(2).replace('.', ',')}` : "Grátis";
                    valFrete.className = freteCalculado > 0 ? "text-gray-700 font-bold" : "text-green-600 font-bold";
                }
            }
        }

        if (cupomAtivo) {
            // MUDANÇA AQUI: Adicionamos o "cart.length === 0" e a proteção "(cupomAtivo.min || 0)"
            if (cart.length === 0 || subtotal < (cupomAtivo.min || 0)) {
                
                cupomAtivo = null;
                localStorage.removeItem('tropyberry_cupom');
                const couponText = document.getElementById('coupon-selected-text');
                if(couponText) {
                    couponText.innerText = "Cupom de desconto";
                    couponText.classList.remove('text-cyan-600');
                }
                document.getElementById('row-discount')?.classList.add('hidden');
            } else {
                if (cupomAtivo.tipo === 'fixo') {
                    valorDesconto = cupomAtivo.valor;
                } else if (cupomAtivo.tipo === 'porcentagem') {
                    const fator = cupomAtivo.valor > 1 ? cupomAtivo.valor / 100 : cupomAtivo.valor;
                    valorDesconto = subtotal * fator;
                } else if (cupomAtivo.tipo === 'frete') {
                    const limiteCupom = parseFloat((cupomAtivo.valor || 4.99).toFixed(2));
                    if (valorFrete <= limiteCupom) {
                        valorDesconto = valorFrete;
                    } else {
                        valorDesconto = 0;
                    }
                }

                const rowDiscount = document.getElementById('row-discount');
                const discountValueEl = document.getElementById('cart-discount');
                if (rowDiscount) {
                    if (valorDesconto > 0) {
                        rowDiscount.classList.remove('hidden');
                        if (discountValueEl) discountValueEl.innerText = `- R$ ${valorDesconto.toFixed(2).replace('.', ',')}`;
                    } else {
                        rowDiscount.classList.add('hidden');
                    }
                }
            }
        }

        const totalFinal = (subtotal + valorFrete) - valorDesconto;

        const subtotalEl = document.getElementById('cart-subtotal');
        if (subtotalEl) subtotalEl.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        cartTotalElement.innerText = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
    }

    // Sua função startCheckout atualizada:
    function startCheckout() {
        // FIX: Chama o pedido de permissão assim que o usuário clica
        pedirPermissaoNotificacao(); 

        if (cart.length === 0) return showToast("Carrinho vazio!");
        
        // CORREÇÃO: Só bloqueia de vez se a loja estiver fechada E não aceitar agendamento!
        if (!isStoreOpen && !configPedidos.allowScheduled) {
            return showToast("Loja Fechada!");
        }

        const checkoutModal = document.getElementById('checkout-modal');
        
        if (!checkoutModal) {
            window.location.href = 'index.html?action=checkout';
            return;
        }
        if (loggedUserEmail && !distanciaConfirmada && cart.length > 0) {
            window.calcularDistanciaGoogle();
        }

        checkoutModal.classList.remove('hidden');
        showStep('step-service');
    }
    function closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); }
    function selectService(type) { 
        currentOrder.method = type; 
        const f = document.getElementById('delivery-fields'); 
        
        if (type === 'retirada') {
            f.classList.add('hidden'); 
        } else { 
            f.classList.remove('hidden'); 

            // --- EXIBIÇÃO DINÂMICA ---
            const extraContainer = document.getElementById('extra-info-container');
            
            // O ID correto no seu HTML é 'timing-selector'
            const timingContainer = document.getElementById('timing-selector');

            if (extraContainer) {
                configPedidos.askExtraInfo ? extraContainer.classList.remove('hidden') : extraContainer.classList.add('hidden');
            }

            // Lógica de Agendamento e Loja Fechada
            if (timingContainer) {
                if (configPedidos.allowScheduled) {
                    timingContainer.classList.remove('hidden');

                    // Se a loja estiver FECHADA, bloqueia a opção "Agora"
                    if (!isStoreOpen) {
                        const radioNow = document.querySelector('input[name="order-timing"][value="now"]');
                        const radioSchedule = document.querySelector('input[name="order-timing"][value="schedule"]');
                        const divNow = document.getElementById('option-now');

                        if (radioNow) {
                            radioNow.disabled = true;
                            radioNow.parentElement.classList.add('pointer-events-none');
                        }
                        if (divNow) {
                            divNow.classList.add('opacity-50', 'bg-gray-100');
                            divNow.innerHTML = '<i class="fas fa-lock text-xl mb-1 block"></i><span class="text-xs font-bold">Fechado</span>';
                        }
                        
                        // Força marcar "Agendar"
                        if (radioSchedule) {
                            radioSchedule.checked = true;
                            // FIX: Chamamos explicitamente a função para abrir os campos de data/hora
                            // Usamos um pequeno atraso (timeout) para garantir que o HTML já esteja visível
                            setTimeout(() => {
                                if(typeof toggleTimingUI === 'function') toggleTimingUI();
                            }, 50);
                        }
                    } else {
                        // Se a loja estiver ABERTA, reseta o botão "Agora"
                        const radioNow = document.querySelector('input[name="order-timing"][value="now"]');
                        const divNow = document.getElementById('option-now');
                        
                        if (radioNow) {
                            radioNow.disabled = false;
                            radioNow.parentElement.classList.remove('pointer-events-none');
                        }
                        if (divNow) {
                            divNow.classList.remove('opacity-50', 'bg-gray-100');
                            divNow.innerHTML = '<i class="fas fa-stopwatch text-xl mb-1 block"></i><span class="text-xs font-bold">Agora</span>';
                        }
                        
                        // Se estiver aberta, chamamos para garantir que os campos sumam caso "Agora" esteja marcado
                        toggleTimingUI();
                    }
                } else {
                    timingContainer.classList.add('hidden');
                }
            }
        }
        
        showStep('step-address'); 
        renderReceipt(); 
    }
    function checkSavedAddress() { 
        const s = localStorage.getItem('tropyberry_user'); 
        if (s) { 
            const d = JSON.parse(s);
            
            // Preenchimento dos campos básicos
            if (document.getElementById('input-name')) document.getElementById('input-name').value = d.name || ''; 
            if (document.getElementById('input-phone')) document.getElementById('input-phone').value = d.phone || ''; 
            if (document.getElementById('input-email')) document.getElementById('input-email').value = d.email || ''; 
            
            // Preenchimento do endereço
            if (document.getElementById('input-street')) document.getElementById('input-street').value = d.street || ''; 
            if (document.getElementById('input-number')) document.getElementById('input-number').value = d.number || ''; 
            if (document.getElementById('input-district')) document.getElementById('input-district').value = d.district || ''; 
            if (document.getElementById('input-comp')) document.getElementById('input-comp').value = d.comp || ''; 
            
            // Lógica visual: Mostra o card de endereço salvo se ele existir no seu HTML
            if(d.street && document.getElementById('saved-address-card')) { 
                document.getElementById('saved-address-card').classList.remove('hidden'); 
                document.getElementById('saved-address-card').classList.add('flex'); 
                document.getElementById('saved-address-text').innerText = `${d.street}, ${d.number}`; 
            }

            // Gatilho automático para o Frete:
            // Se já temos rua, número e bairro, dispara o cálculo do Google imediatamente
            if(d.street && d.number && d.district) {
                console.log("Endereço salvo detectado, calculando frete...");
                setTimeout(() => {
                    // Chama a função global que você definiu para o Google Maps
                    if (typeof window.calcularDistanciaGoogle === 'function') {
                        window.calcularDistanciaGoogle();
                    }
                }, 500);
            }
        } 
    }
    function useSavedAddress() { goToSummary(); }
    function goToPaymentMethod() {
        // 1. Calcula o subtotal atual para validar a trava de valor mínimo
        const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        
        // 2. Captura e limpa os campos básicos de identificação
        const n = document.getElementById('input-name').value.trim(); 
        const p = document.getElementById('input-phone').value.trim(); 
        const e = document.getElementById('input-email').value.trim();

        // Validação básica obrigatória para qualquer tipo de pedido
        if (!n || !p || !e) {
            return showToast("Preencha Nome, Telefone e E-mail para continuar.", true);
        }

        // Inicializa o objeto do cliente no pedido atual
        currentOrder.customer = { name: n, phone: p, email: e };

        // 3. Lógica específica para o modo DELIVERY
        if (currentOrder.method === 'delivery') {
            
            // --- TRAVA: Valor Mínimo para entrega ---
            if (configPedidos.delivMin > 0 && subtotal < configPedidos.delivMin) {
                return showToast(`O valor mínimo para entrega é R$ ${configPedidos.delivMin.toFixed(2).replace('.', ',')}`, true);
            }

            // --- TRAVA: Informação Adicional Obrigatória ---
            if (configPedidos.askExtraInfo) {
                const extraInput = document.getElementById('input-extra-info').value.trim();
                if (!extraInput) {
                    showToast("Por favor, preencha a Informação Adicional obrigatória.", true);
                    document.getElementById('input-extra-info').focus();
                    return;
                }
                currentOrder.customer.extraInfo = extraInput;
            }

            // --- TRAVA: Agendamento de Pedido (CORRIGIDO) ---
            if (configPedidos.allowScheduled) {
                // Verifica se escolheu "Agora" ou "Agendar"
                const timing = document.querySelector('input[name="order-timing"]:checked')?.value;
                
                // Só cobra a data se o cliente escolheu "Agendar"
                if (timing === 'schedule') {
                    const date = document.getElementById('input-schedule-date').value;
                    const time = document.getElementById('input-schedule-time').value;
                    
                    if (!date || !time) {
                        return showToast("Selecione a data e o horário para o agendamento.", true);
                    }
                    
                    // Validação extra: Data futura com antecedência (TRAVA SENIOR)
                    const selectedDate = new Date(`${date}T${time}:00`);
                    const dataMinima = new Date();
                    
                    // Define o tempo mínimo de preparo em minutos
                    const tempoPreparoMinutos = 40;
                    dataMinima.setMinutes(dataMinima.getMinutes() + tempoPreparoMinutos);

                    if (selectedDate < dataMinima) {
                        return showToast(`O agendamento requer pelo menos ${tempoPreparoMinutos} min de antecedência.`, true);
                    }

                    const dataFormatada = date.split('-').reverse().join('/');
                    currentOrder.scheduled = `${dataFormatada} às ${time}`;
                } else {
                    // Se for "Agora", remove qualquer agendamento
                    delete currentOrder.scheduled;
                }
            }

            // --- VALIDAÇÃO DE ENDEREÇO ---
            const s = document.getElementById('input-street').value.trim(); 
            const num = document.getElementById('input-number').value.trim(); 
            const d = document.getElementById('input-district').value.trim(); 
            const c = document.getElementById('input-comp').value.trim();
            
            // Rua, Número e Bairro são sempre obrigatórios no Delivery
            if (!s || !num || !d) {
                return showToast("Endereço incompleto. Rua, Número e Bairro são obrigatórios.", true); 
            }

            // Monta a string final de endereço
            currentOrder.customer.address = `${s}, ${num} - ${d}${c ? ' (' + c + ')' : ''}`; 

        } else { 
            // 4. Lógica para modo RETIRADA
            currentOrder.customer.address = "Retirada na Loja"; 
        }

        // 5. Avança para a etapa de pagamento
        showStep('step-payment-method');

        // 6. Atualiza o recibo final
        if (typeof renderReceipt === 'function') {
            renderReceipt();
        }
    }
    document.getElementById('input-district')?.addEventListener('change', () => {
        updateCartUI();
        renderReceipt();
        if (typeof window.calcularDistanciaGoogle === 'function') window.calcularDistanciaGoogle();
    });
    
    document.getElementById('input-street')?.addEventListener('change', () => {
        if (typeof window.calcularDistanciaGoogle === 'function') window.calcularDistanciaGoogle();
    });
    
    document.getElementById('input-number')?.addEventListener('change', () => {
        if (typeof window.calcularDistanciaGoogle === 'function') window.calcularDistanciaGoogle();
    });

    // === PROCESSAMENTO DE PAGAMENTO (CORRIGIDO) ===
    async function processPayment() {
        const payMethod = document.querySelector('input[name="pay-method"]:checked')?.value;

        // 1. Recalcula Subtotal
        const subtotal = cart.reduce((acc, item) => {
            let p = item.price;
            if (typeof p === 'string') p = parseFloat(p.replace('R$', '').replace(',', '.').trim());
            return acc + (p * item.quantity);
        }, 0);

        // 2. Recalcula Frete (Garante 0 se for null)
        const frete = (typeof calcularFrete === 'function') ? (calcularFrete() || 0) : 0;

        // 3. NOVO: Calcula o Desconto do Cupom (Sincronizado com o carrinho e resumo)
        const valorDesconto = (typeof calcularDescontoCupom === 'function') 
            ? calcularDescontoCupom(subtotal, frete, cupomAtivo) 
            : 0;

        // 4. Define Total Final Líquido (Subtotal + Frete - Cupom)
        const totalFinal = (subtotal + frete) - valorDesconto;

        if (!payMethod) return showToast("Selecione um método de pagamento", true);

        const btn = document.getElementById('btn-generate-pay');

        // =================================================================
        // CARTÃO DE CRÉDITO
        // =================================================================
        if (payMethod === 'card') {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Processando...';

            try {
                // 1. LIMPEZA ABSOLUTA DOS DADOS (Mantendo seus passos originais)
                const cleanItems = cart.map(item => {
                    let strPrice = String(item.price);
                    strPrice = strPrice.replace(/[^0-9.,]/g, '');
                    strPrice = strPrice.replace(',', '.');
                    let finalPrice = parseFloat(strPrice);
                    if (isNaN(finalPrice)) finalPrice = 1.00;
                    finalPrice = Number(finalPrice.toFixed(2));

                    return {
                        id: String(item.originalId || item.id),
                        title: String(item.name).substring(0, 250),
                        quantity: parseInt(item.quantity),
                        unit_price: finalPrice,
                        currency_id: "BRL",
                        description: String(item.details || 'Sem adicionais').substring(0, 200)
                    };
                });

                // Adiciona Frete como item
                if (frete > 0) {
                    cleanItems.push({
                        id: "frete",
                        title: "Taxa de Entrega",
                        quantity: 1,
                        unit_price: Number(frete.toFixed(2)),
                        currency_id: "BRL",
                        description: "Entrega Delivery"
                    });
                }

                // NOVO: Adiciona o Desconto como um item negativo (Padrão iFood/Mercado Pago)
                if (valorDesconto > 0) {
                    cleanItems.push({
                        id: "cupom_desconto",
                        title: `Cupom: ${cupomAtivo.code}`,
                        quantity: 1,
                        unit_price: -Number(valorDesconto.toFixed(2)),
                        currency_id: "BRL",
                        description: "Desconto aplicado"
                    });
                }

                const dadosParaEnvio = {
                    method: 'card',
                    total: Number(totalFinal.toFixed(2)),
                    playerInfo: {
                        email: currentOrder.customer.email || 'cliente@tropiberry.com',
                        name: currentOrder.customer.name || 'Cliente',
                        phone: currentOrder.customer.phone,
                        cpf: currentOrder.customer.cpf || ''
                    },
                    items: cleanItems
                };

                // 🕵️ DEBUGGER DA VERDADE
                console.log("📤 Enviando para API (Cartão):", JSON.stringify(dadosParaEnvio, null, 2));

                // 2. CHAMA API
                // Substitua pela sua URL na Locaweb
const response = await fetch("https://tropiberry.site/pagamento.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dadosParaEnvio)
});

                const data = await response.json();

                // 3. SUCESSO OU ERRO
                if (data.init_point || data.sandbox_init_point) {
                    // Salva no Banco com detalhes de Cupom e Frete
    const docRef = await addDoc(collection(db, "pedidos"), {
        customer: currentOrder.customer,
        items: cart,
        frete: frete,
        desconto: valorDesconto,
        cupom: cupomAtivo ? cupomAtivo.code : null,
        total: totalFinal,
        paymentMethod: 'card',
        method: currentOrder.method,
        status: 'Aguardando Pagamento', // Este status agora é ignorado pelo dashboard até o webhook mudar para 'Aguardando' ou 'Pago'
        paymentStatus: 'pending',
        createdAt: serverTimestamp()
    });

                    if (typeof saveLastOrder === 'function') saveLastOrder(docRef.id);
                    localStorage.setItem('temp_cart_backup', JSON.stringify(cart));
                    cart = [];
                    if (typeof updateCartUI === 'function') updateCartUI();
                    
                    window.location.href = data.init_point || data.sandbox_init_point;
                    return;
                } else {
                    throw new Error(data.error || "Erro desconhecido na API.");
                }
            } catch (e) {
                console.error("❌ ERRO NO PROCESSO:", e);
                showToast("Erro: " + (e.message || "Tente novamente"), true);
                btn.disabled = false;
                btn.innerHTML = '<span>Finalizar Pedido</span><i class="fas fa-check-circle"></i>';
            }
        }

    // =================================================================
        // PIX
        // =================================================================
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Gerando PIX...';

        try {
            let pixData = { qr_code: null, qr_code_base64: null };

            if (payMethod === 'pix') {
                const cleanItems = cart.map(item => {
                    let p = String(item.price).replace(/[^0-9.,]/g, '').replace(',', '.');
                    let finalPrice = Number(parseFloat(p).toFixed(2));
                    return {
                        id: String(item.originalId || item.id),
                        title: item.name,
                        unit_price: finalPrice,
                        quantity: parseInt(item.quantity),
                        currency_id: "BRL"
                    };
                });

                if (frete > 0) {
                    cleanItems.push({ id: "frete", title: "Taxa de Entrega", unit_price: Number(frete.toFixed(2)), quantity: 1, currency_id: "BRL" });
                }

                // NOVO: Adiciona desconto no PIX
                if (valorDesconto > 0) {
                    cleanItems.push({ id: "cupom", title: "Desconto Cupom", unit_price: -Number(valorDesconto.toFixed(2)), quantity: 1, currency_id: "BRL" });
                }

                const response = await fetch("https://tropiberry.site/pagamento.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        method: payMethod,
        total: totalFinal,
        playerInfo: currentOrder.customer,
        items: cleanItems
    })
});

                const data = await response.json();
                if (data.success || data.qr_code) {
                    pixData.qr_code = data.qr_code;
                    pixData.qr_code_base64 = data.qr_code_base64;
                } else {
                    throw new Error(data.error || "Erro na API PIX");
                }
            }

    const docRef = await addDoc(collection(db, "pedidos"), {
        customer: currentOrder.customer,
                items: cart,
                frete: frete,
                desconto: valorDesconto,
                cupom: cupomAtivo ? cupomAtivo.code : null,
                total: totalFinal,
                paymentMethod: payMethod,
                method: currentOrder.method,
    status: 'Aguardando Pagamento', // Alterado de 'Aguardando' para 'Aguardando Pagamento'
        paymentStatus: 'pending',
        pixCode: pixData.qr_code,
                pixQR: pixData.qr_code_base64,
                createdAt: serverTimestamp()
            });

            if (typeof saveLastOrder === 'function') saveLastOrder(docRef.id);
            cart = [];
            if (typeof updateCartUI === 'function') updateCartUI();
            if (typeof closeCheckout === 'function') closeCheckout();
            if (typeof openOrderScreen === 'function') openOrderScreen(docRef.id);
            showToast("Pedido enviado!");

        } catch (e) {
            console.error("Erro completo:", e); 
            showToast("Falha ao gerar pedido: " + e.message, true);
        } finally {
            if (payMethod !== 'card') {
                btn.disabled = false;
                btn.innerHTML = '<span>Finalizar Pedido</span><i class="fas fa-check-circle"></i>';
            }
        }
    }

    let countdownInterval = null;

    window.buscarCep = async () => {
    let cep = document.getElementById('input-cep')?.value.replace(/\D/g, '');
    if (cep.length !== 8) return showToast("CEP inválido!", true);

    showToast("Buscando endereço...", "info");
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        
        if (data.erro) {
            showToast("CEP não encontrado!", true);
            return;
        }

        document.getElementById('input-street').value = data.logradouro;
        document.getElementById('input-district').value = data.bairro;
        document.getElementById('input-number').focus();
        showToast("Endereço preenchido!");

    } catch (e) {
        showToast("Erro ao buscar CEP.", true);
    }
};

    window.openOrderScreen = (orderId) => {
        // === FIX: FECHA O MODAL DE LISTA DE PEDIDOS CASO ESTEJA ABERTO ===
        const modalMeusPedidos = document.getElementById('my-orders-modal');
        if (modalMeusPedidos) {
            modalMeusPedidos.classList.add('hidden');
        }

        // 1. Garante que a tela existe (caso tenha sido injetada agora)
        const screen = document.getElementById('order-screen');
        if(!screen) return;
        screen.classList.remove('hidden');

        // 2. CORREÇÃO: Limpa o monitoramento anterior para não misturar pedidos
        if (monitorPedidoAtivo) {
            monitorPedidoAtivo(); // Para de escutar o pedido velho
            monitorPedidoAtivo = null;
        }

        setTimeout(() => {
            const mapContainer = document.getElementById('final-map');
            if (mapContainer) {
                if (window.currentMap) window.currentMap.remove();
                window.currentMap = L.map('final-map').setView([-7.1195, -34.8450], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.currentMap);
                L.marker([-7.1195, -34.8450]).addTo(window.currentMap).bindPopup('Seu pedido está sendo preparado!').openPopup();
            }
        }, 400);

        // 3. Inicia o novo monitoramento e guarda na variável global
        monitorPedidoAtivo = onSnapshot(doc(db, "pedidos", orderId), (docSnap) => {
            if (!docSnap.exists()) return;
            const order = docSnap.data();

            // Seus preenchimentos originais
            document.getElementById('status-order-id').innerText = orderId.slice(-5).toUpperCase();
            
        // Verifica se os elementos existem antes de preencher (segurança extra)
            if(document.getElementById('status-client-name')) document.getElementById('status-client-name').innerText = order.customer?.name || 'Cliente';
            if(document.getElementById('status-client-phone')) document.getElementById('status-client-phone').innerText = order.customer?.phone || '';
            if(document.getElementById('status-client-address')) document.getElementById('status-client-address').innerText = order.customer?.address || '';

            // --- LÓGICA DE RASTREIO DE 5 PASSOS (Mantida Original) ---
            const steps = document.querySelectorAll('#order-screen .relative.z-10.flex.flex-col.items-center');
            const setStepActive = (index, active) => {
                if (!steps[index]) return;
                const circle = steps[index].querySelector('.w-8.h-8');
                if (active) {
                    steps[index].classList.remove('opacity-40');
                    if(circle) {
                        circle.classList.add('bg-green-500', 'text-white');
                        circle.classList.remove('bg-gray-200', 'text-gray-500');
                    }
                } else {
                    steps[index].classList.add('opacity-40');
                    if(circle) {
                        circle.classList.remove('bg-green-500', 'text-white');
                        circle.classList.add('bg-gray-200', 'text-gray-500');
                    }
                }
            };

            const status = order.status;
            setStepActive(0, true); 
            setStepActive(1, ['Em Preparo', 'Pronto', 'Saiu para Entrega', 'Finalizado'].includes(status)); 
            setStepActive(2, ['Pronto', 'Saiu para Entrega', 'Finalizado'].includes(status)); 
            setStepActive(3, ['Saiu para Entrega', 'Finalizado'].includes(status)); 
            setStepActive(4, status === 'Finalizado'); 

            // --- BADGE DE PAGAMENTO (Mantido Original) ---
            const payBadge = document.getElementById('status-payment-badge');
            if (payBadge) {
                if (order.status === 'Cancelado' || order.status === 'Rejeitado') {
                    payBadge.innerText = 'CANCELADO';
                    payBadge.className = "bg-red-100 text-red-600 text-[10px] px-3 py-1 rounded-full font-bold border border-red-200";
                } else if (order.paymentStatus === 'paid') {
                    payBadge.innerText = 'PAGO';
                    payBadge.className = "bg-green-100 text-green-600 text-[10px] px-3 py-1 rounded-full font-bold border border-green-200";
                } else {
                    payBadge.innerText = 'PENDENTE';
                    payBadge.className = "bg-orange-100 text-orange-600 text-[10px] px-3 py-1 rounded-full font-bold border border-orange-200";
                }
            }

    const whatsappBtn = document.getElementById('btn-whatsapp-status');
            if (whatsappBtn) {
                const orderIdShort = orderId.slice(-5).toUpperCase();
                const textoMsg = `Olá! Gostaria de suporte para o meu pedido *#${orderIdShort}*.\n\n` +
                                `*Status:* ${order.status}\n` +
                                `*Cliente:* ${order.customer?.name || 'Cliente'}\n` +
                                `*Total:* R$ ${(order.total || 0).toFixed(2).replace('.', ',')}`;
                whatsappBtn.href = `https://wa.me/5583920024786?text=${encodeURIComponent(textoMsg)}`;
            }

    const pixArea = document.getElementById('pix-qr-container');
            const pixSlot = document.getElementById('pix-qr-image-slot');
            
            if (pixArea && pixSlot) {
                if (order.paymentMethod === 'pix' && (order.status === 'Aguardando Pagamento' || order.status === 'Aguardando') && order.paymentStatus !== 'paid') {
                    if (order.createdAt) {
                        pixArea.classList.remove('hidden');
                        if (order.pixQR) {
                            pixSlot.innerHTML = `<img src="data:image/jpeg;base64,${order.pixQR}" class="w-48 h-48 rounded-lg shadow-lg border-4 border-white mx-auto">`;
                        }
                        if (order.pixCode) {
                            const copyInput = document.getElementById('pix-copy-paste-screen');
                            if(copyInput) copyInput.value = order.pixCode;
                        }
                        if (!countdownInterval) {
                            iniciarContagemRegressiva(orderId, order.createdAt);
                        }
                    }
                } else {
                    pixArea.classList.add('hidden');
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                }
            }
            
            renderReceiptFromOrder(order.items, order.total, order, orderId);
        });
    };

    window.copyPixScreen = () => {
        const input = document.getElementById('pix-copy-paste-screen');
        const overlay = document.getElementById('copy-animation-overlay');
        
        if (!input || !input.value || input.value.includes("Aguardando")) return;

        navigator.clipboard.writeText(input.value).then(() => {
            showToast("Código PIX copiado!");
            
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

        // Extrai os milissegundos de forma segura dependendo do formato do Timestamp do Firebase
        const tempoCriacao = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : (createdAt.seconds * 1000);
        const tempoExpiracao = tempoCriacao + (5 * 60 * 1000); // 5 Minutos

        const atualizarTela = async () => {
            const agora = Date.now();
            const restante = tempoExpiracao - agora;

            if (restante <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                timerDisplay.innerText = "00:00";
                
                try {
                    await updateDoc(doc(db, "pedidos", orderId), { 
                        status: 'Cancelado', 
                        motivo: 'Tempo de pagamento expirado',
                        updatedAt: serverTimestamp()
                    });
                    showToast("Pedido expirado!", true);
                } catch (e) { console.error(e); }
                return;
            }

            // A Mágica: Criamos um limite APENAS para exibição na tela. 
            // O cálculo do backend continua rolando solto por trás, evitando o congelamento.
            const visualRestante = Math.min(restante, 5 * 60 * 1000);
            
            const minutos = Math.floor(visualRestante / 60000);
            const segundos = Math.floor((visualRestante % 60000) / 1000);
            timerDisplay.innerText = `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
        };

        atualizarTela(); 
        countdownInterval = setInterval(atualizarTela, 1000);
    }


    window.abrirUltimoPedido = () => {
        const saved = localStorage.getItem('tropyberry_last_order');
        if (saved) {
            const d = JSON.parse(saved);
            const statusType = d.status === 'Pago' ? 'paid' : 'pix_pending';
            window.openOrderScreen(d.id, statusType);
        } else {
            showToast("Nenhum pedido recente encontrado.", true);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const savedCart = localStorage.getItem('tropyberry_cart');
        const savedCupom = localStorage.getItem('tropyberry_cupom'); // <-- Busca o cupom na memória
        
        // Se tinha cupom antes de recarregar a tela, ativa ele de novo!
        if (savedCupom) {
            cupomAtivo = JSON.parse(savedCupom); 
        }

        if (savedCart) {
            cart = JSON.parse(savedCart);
            
            setTimeout(() => {
                updateCartUI();
                
                const params = new URLSearchParams(window.location.search);
                if (params.get('action') === 'checkout' && cart.length > 0) {
                    startCheckout();
                }
            }, 300); 
        }
    });

    function calcularFrete() {
        // 1. Se não tiver configuração carregada
        if (!configPedidos || !configPedidos.deliveryMode) {
            return 0;
        }

        const mode = configPedidos.deliveryMode;
        
        // --- PRIORIDADE: Verificação de modos automáticos (Google/iFood) ---
        if (mode === 'distance' || mode === 'google' || mode === 'ifood') {
            // Se o Google já respondeu, retorna o valor salvo
            if (distanciaConfirmada) {
                return freteGoogleCalculado;
            }
            // Se ainda não confirmou, retorna NULL para mostrar "Calculando..." no carrinho
            return null; 
        }

        // 2. Se não for delivery, para os outros modos (Fixo/Bairro), frete é zero
        if (!currentOrder.method || currentOrder.method !== 'delivery') {
            currentDeliveryFee = 0;
            return 0;
        }

        // 3. Preço Fixo
        if (mode === 'fixed') {
            currentDeliveryFee = parseFloat(configPedidos.deliveryFixedPrice) || 0;
        } 
        // 4. Por Bairro
        else if (mode === 'district') {
            const inputBairro = document.getElementById('input-district');
            const bairroCliente = inputBairro ? removerAcentos(inputBairro.value.trim().toLowerCase()) : "";
            const infoBairro = configPedidos.deliveryDistricts?.find(b => removerAcentos(b.nome.toLowerCase()) === bairroCliente);
            currentDeliveryFee = infoBairro ? parseFloat(infoBairro.custo) : 10.00; 
        } else {
            currentDeliveryFee = 0; 
        }

        return currentDeliveryFee;
    }
    function removerAcentos(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function renderReceipt() {
        const list = document.getElementById('receipt-items-list');
        const deliveryEl = document.getElementById('receipt-delivery');
        const totalEl = document.getElementById('receipt-total');
        const subtotalEl = document.getElementById('receipt-subtotal');
        const serviceRow = document.getElementById('receipt-service-row');
        const serviceFeeEl = document.getElementById('receipt-service-fee');
        const discountRow = document.getElementById('receipt-discount-row');
        const discountValueEl = document.getElementById('receipt-discount-value');

        // IDs da tela de Resumo Final (Checkout)
        const summaryTotalEl = document.getElementById('summary-total');
        const summarySubtotalEl = document.getElementById('summary-subtotal');
        const summaryDeliveryEl = document.getElementById('summary-delivery');
        const summaryDiscountRow = document.getElementById('summary-discount-row');
        const summaryDiscountVal = document.getElementById('summary-discount');

        if (!list) return;

        list.innerHTML = '';
        let subtotal = 0;

        cart.forEach(item => {
            const t = item.price * item.quantity;
            subtotal += t;
            list.innerHTML += `
                <div class="flex justify-between items-start mb-2 border-b border-gray-50 pb-2">
                    <div>
                        <span class="font-bold text-gray-700">${item.quantity}x</span> 
                        <span class="text-gray-600 text-sm">${item.name}</span>
                        <p class="text-[10px] text-gray-400 italic">${item.details || ''}</p>
                    </div>
                    <span class="text-gray-800 font-bold text-sm">R$ ${t.toFixed(2).replace('.', ',')}</span>
                </div>`;
        });

        let frete = calcularFrete();
        const valorFreteNum = (frete === null) ? 0 : frete;

        if (currentOrder.method === 'delivery' && configPedidos.delivFreeAbove > 0) {
            if (subtotal >= configPedidos.delivFreeAbove) frete = 0;
        }

        let taxaServico = 0;
        if (currentOrder.method === 'delivery' && configPedidos.delivServiceFee > 0) {
            taxaServico = parseFloat(configPedidos.delivServiceFee);
            if (serviceRow) serviceRow.classList.remove('hidden');
            if (serviceFeeEl) serviceFeeEl.innerText = `R$ ${taxaServico.toFixed(2).replace('.', ',')}`;
        } else {
            if (serviceRow) serviceRow.classList.add('hidden');
        }

        // === CÁLCULO DE DESCONTO UNIFICADO (CORREÇÃO CIRÚRGICA) ===
        let valorDesconto = 0;
        if (cupomAtivo) {
            const minVal = parseFloat(cupomAtivo.min) || 0;
            const limiteCupom = parseFloat(cupomAtivo.valor) || 4.99;

            if (subtotal >= minVal) {
                if (cupomAtivo.tipo === 'fixo') {
                    valorDesconto = cupomAtivo.valor;
                } else if (cupomAtivo.tipo === 'porcentagem') {
                    const fator = cupomAtivo.valor > 1 ? cupomAtivo.valor / 100 : cupomAtivo.valor;
                    valorDesconto = subtotal * fator;
                } else if (cupomAtivo.tipo === 'frete') {
                    if (frete !== null) {
                        const kmAtual = window.distanciaKmGlobal || 0;
                        if (cupomAtivo.kmLimit === 0 || kmAtual <= cupomAtivo.kmLimit) {
                            valorDesconto = valorFreteNum;
                        } else {
                            valorDesconto = 0;
                        }
                    }
                }
            }
        }

        // --- ATUALIZA UI DE DESCONTO (CARRINHO E RESUMO) ---
        const atualizarLinhaDesconto = (row, valEl) => {
            if (row && valEl) {
                if (valorDesconto > 0) {
                    row.classList.remove('hidden');
                    // Adiciona a classe flex caso o seu CSS precise para alinhar
                    row.style.display = 'flex'; 
                    valEl.innerText = `- R$ ${valorDesconto.toFixed(2).replace('.', ',')}`;
                } else {
                    row.classList.add('hidden');
                    row.style.display = 'none';
                }
            }
        };
        
        // Aplica nos IDs do carrinho lateral
        atualizarLinhaDesconto(discountRow, discountValueEl);
        // Aplica nos IDs do modal de resumo final
        atualizarLinhaDesconto(summaryDiscountRow, summaryDiscountVal);

        // --- ATUALIZA SUBTOTAL EM AMBOS OS LUGARES ---
        if (subtotalEl) subtotalEl.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        if (summarySubtotalEl) summarySubtotalEl.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

        // --- ATUALIZA FRETE EM AMBOS OS LUGARES ---
        const formatFrete = (el) => {
            if (!el) return;
            if (frete === null) { 
                el.innerText = "Calculando..."; 
                el.className = "text-orange-500 animate-pulse text-[10px] font-bold"; 
            } else if (frete > 0) { 
                el.innerText = `R$ ${frete.toFixed(2).replace('.', ',')}`; 
                el.className = "text-gray-800 font-bold text-sm"; 
            } else { 
                el.innerText = 'Grátis'; 
                el.className = "text-green-600 font-bold text-sm"; 
            }
        };
        formatFrete(deliveryEl);
        formatFrete(summaryDeliveryEl);

        // --- CÁLCULO TOTAL FINAL (O ponto mais importante) ---
        // Agora o total final subtrai o valorDesconto corretamente
        const totalFinal = (subtotal + valorFreteNum + taxaServico) - valorDesconto;
        
        if (totalEl) totalEl.innerText = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
        if (summaryTotalEl) summaryTotalEl.innerText = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
        
        // Salva o total correto no objeto global para o processamento de pagamento
        currentOrder.total = totalFinal;
        if (cupomAtivo) currentOrder.coupon = cupomAtivo.id;
    }
    function toggleReceipt() { const el = document.getElementById('receipt-details'); const arr = document.getElementById('arrow-receipt'); if (el.classList.contains('hidden')) { el.classList.remove('hidden'); arr.classList.add('rotate-180'); } else { el.classList.add('hidden'); arr.classList.remove('rotate-180'); } }
    function closeOrderScreen() { document.getElementById('order-screen').classList.add('hidden'); }
    function switchToStatus() { openOrderScreen('STATUS', 'paid'); }
    function copyPixScreen() { const inp = document.getElementById('pix-copy-paste-screen'); if(inp) { inp.select(); document.execCommand('copy'); showToast("Código PIX copiado!"); } }

    function toggleCart() { 
        const m = document.getElementById('cart-modal'); 
        const p = document.getElementById('cart-panel'); 
        
        if(!m) return; 
        
        if (m.classList.contains('hidden')) { 
            // === AUTO-CÁLCULO DE FRETE AO ABRIR O CARRINHO ===
            if (configPedidos && ['ifood','distance','google'].includes(configPedidos.deliveryMode)) {
                if (!distanciaConfirmada) {
                    // Tenta pegar dos inputs ou do localStorage através da função de cálculo
                    console.log("📦 Carrinho aberto → Verificando necessidade de cálculo de frete...");
                    window.calcularDistanciaGoogle();
                }
            }

            m.classList.remove('hidden'); 
            setTimeout(() => p.classList.remove('translate-x-full'), 10); 
            
            // Garante que a UI esteja atualizada ao abrir
            updateCartUI(); 
        } else { 
            p.classList.add('translate-x-full'); 
            setTimeout(() => m.classList.add('hidden'), 300); 
            checkLastOrder(); 
        } 
    }
    function saveLastOrder(id) { localStorage.setItem('tropyberry_last_order', JSON.stringify({ id, timestamp: Date.now() })); checkLastOrder(); }
    function checkLastOrder() { 
        const saved = localStorage.getItem('tropyberry_last_order'); 
        const btn = document.getElementById('last-order-btn'); 
        
        // Se o botão não existe na tela, não faz nada
        if (!btn) return;

        if (saved) { 
            const d = JSON.parse(saved); 
            // Mostra o botão se o pedido for recente (15 min)
            if ((Date.now() - d.timestamp) / 1000 / 60 < 15) {
                btn.classList.remove('hidden'); 
            } else { 
                // btn.classList.add('hidden'); // Opcional: pode deixar visivel se quiser
                localStorage.removeItem('tropyberry_last_order'); 
            } 
        } else {
            btn.classList.add('hidden'); 
        }
    }
    setInterval(checkLastOrder, 60000);

   async function verificarBotaoAdmin(productId) { if (currentUserIsAdmin) { const btn = document.getElementById('admin-edit-shortcut'); if(btn) { btn.classList.remove('hidden'); btn.onclick = () => { window.location.href = `dashboard.html?edit_product=${productId}`; }; } } }

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
            document.getElementById('print-customer-name').innerText = orderData.customer?.name || 'Cliente';
            document.getElementById('print-customer-phone').innerText = orderData.customer?.phone || '';
            document.getElementById('print-customer-address').innerText = orderData.customer?.address || '';
            document.getElementById('print-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
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

    function monitorarInfoLoja() {
        if(!db) return;
        onSnapshot(doc(db, "config", "loja_info"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                aplicarDadosLojaNoSite(data);
            }
        });
    }

    function aplicarDadosLojaNoSite(data) {
        const facadeImg = document.querySelector('#info-modal img');
        if(facadeImg && data.facadeUrl) {
            facadeImg.src = data.facadeUrl;
            facadeImg.style.opacity = "1"; 
        }
        const hoursEl = document.getElementById('info-hours');
        if(hoursEl) {
            hoursEl.innerHTML = data.horarioTexto ? data.horarioTexto.replace(/\n/g, '<br>') : "Consulte nossos horários";
        }
        if(document.getElementById('info-address')) document.getElementById('info-address').innerText = data.endereco || "";
        if(document.getElementById('info-phone')) document.getElementById('info-phone').innerText = data.whatsapp || "";
    }

    function animarVooParaCarrinho(event) {
        const startX = event.clientX;
        const startY = event.clientY + window.scrollY;

        const cartBtn = document.querySelector('.fa-shopping-cart') || document.querySelector('#cart-btn');
        if (!cartBtn) return;

        const cartRect = cartBtn.getBoundingClientRect();
        const targetX = cartRect.left + (cartRect.width / 2);
        const targetY = cartRect.top + window.scrollY + (cartRect.height / 2);

        const flyer = document.createElement('div');
        flyer.className = 'acai-flyer';
        flyer.style.left = `${startX - 20}px`;
        flyer.style.top = `${startY - 25}px`;

        flyer.style.setProperty('--tx', `${targetX - startX}px`);
        flyer.style.setProperty('--ty', `${targetY - startY}px`);

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

        setTimeout(() => {
            cartBtn.classList.add('animate-cart-pulse');
            setTimeout(() => cartBtn.classList.remove('animate-cart-pulse'), 400);
            flyer.remove();
        }, 800);
    }
    window.adicionarAoCarrinhoRapido = function(event, produtoId) {
        event.stopPropagation(); 
        
        const produto = products.find(p => p.id === produtoId);
        if (!produto) return;

        const temObrigatorios = produto.complementIds && produto.complementIds.length > 0;
        if (temObrigatorios) {
            abrirModalRapido(produtoId);
            return;
        }

        const cartItem = {
            id: `${produto.id}-${Date.now()}`,
            originalId: produto.id,
            name: produto.name,
            price: produto.price,
            image: produto.image,
            quantity: 1,
            details: ""
        };

        cart.push(cartItem);
        updateCartUI();
        animarVooParaCarrinho(event);
        showToast("Adicionado!");
    };

    window.limparCarrinho = function() {
        if (cart.length === 0) return;
        cart = []; 
        localStorage.removeItem('tropyberry_cart'); 

        cupomAtivo = null;
        localStorage.removeItem('tropyberry_cupom');
        const couponText = document.getElementById('coupon-selected-text');
        if(couponText) {
            couponText.innerText = "Cupom de desconto";
            couponText.classList.remove('text-cyan-600', 'font-bold');
        }

        updateCartUI(); 
        showToast("Carrinho esvaziado!");

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
            configPedidos = docSnap.data(); 
        }
    }

    // Variável global para controle de loop (adicione no topo do arquivo)
    let ultimoEnderecoProcessado = "";

    window.calcularDistanciaGoogle = async () => {
    let rua = document.getElementById('input-street')?.value || "";
    let num = document.getElementById('input-number')?.value || "";
    let bairro = document.getElementById('input-district')?.value || "";
    
    if (!rua || !num || !bairro) {
        const salvo = localStorage.getItem('tropyberry_user');
        if (salvo) {
            const d = JSON.parse(salvo);
            rua = d.street || ""; num = d.number || ""; bairro = d.district || "";
        }
    }

    if(!rua || !num || !bairro) return;

    // Trecho corrigido
    const enderecoAtual = `${rua}${num}${bairro}`;
    if (enderecoAtual === ultimoEnderecoCalculado && distanciaConfirmada) return;
    ultimoEnderecoCalculado = enderecoAtual;

    const labelFrete = document.getElementById('receipt-delivery');
    if(labelFrete) labelFrete.innerText = "Calculando...";

    try {
        // PASSO 1: Geocoding (Texto -> Coordenadas)
        const queryEndereco = encodeURIComponent(`${rua}, ${num} - ${bairro}, João Pessoa, PB`);
        const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${queryEndereco}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=br`);
        const geoData = await geoRes.json();

        if (!geoData.features || geoData.features.length === 0) throw new Error("Endereço não encontrado");

        const destinoCoord = geoData.features[0].center; 

        // PASSO 2: Directions (Cálculo da Rota Real)
        const dirRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${ORIGEM_COORD[0]},${ORIGEM_COORD[1]};${destinoCoord[0]},${destinoCoord[1]}?access_token=${MAPBOX_TOKEN}`);
        const dirData = await dirRes.json();

        if (dirData.code !== 'Ok') throw new Error("Erro no cálculo de rota");

        const distanciaKm = dirData.routes[0].distance / 1000;
        let valorFrete = 0;
        const km = distanciaKm;

        window.distanciaKmGlobal = km;
        // Tabela de Preços
        if (km <= 1.0) valorFrete = 4.99;
        else if (km <= 2.0) valorFrete = 6.99;
        else if (km <= 3.0) valorFrete = 7.99;
        else if (km <= 4.0) valorFrete = 8.99;
        else if (km <= 5.0) valorFrete = 10.99;
        else if (km <= 6.0) valorFrete = 12.99;
        else if (km <= 7.0) valorFrete = 14.99;
        else if (km <= 10.0) valorFrete = 20.99;
        else valorFrete = 24.99;

        freteGoogleCalculado = valorFrete;
        distanciaConfirmada = true; 
        
        console.log(`✅ Mapbox: ${km.toFixed(2)}km -> R$ ${valorFrete}`);

        if (typeof updateCartUI === 'function') updateCartUI();
        if (typeof renderReceipt === 'function') renderReceipt();

    } catch (error) {
        console.error("Erro Mapbox:", error);
        // Se der erro, assume a taxa mínima da loja (R$ 4.99) em vez de 7.00
        freteGoogleCalculado = 4.99; 
        distanciaConfirmada = true;
        if (typeof updateCartUI === 'function') updateCartUI();
        if (typeof renderReceipt === 'function') renderReceipt();
    }
};
    window.toggleUserMenu = () => {
        const overlay = document.getElementById('user-menu-overlay');
        const menu = document.getElementById('user-menu-content');
        
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            if(window.innerWidth < 768) {
                menu.classList.add('animate-slide-up');
                overlay.classList.remove('hidden');
            } else {
                menu.classList.add('animate-fade-in'); 
            }
        } else {
            menu.classList.add('hidden');
            overlay.classList.add('hidden');
            menu.classList.remove('animate-slide-up', 'animate-fade-in');
        }
    };

    window.abrirMeusPedidos = async () => {
        // 1. Esconde o menu de usuário e o overlay (útil se o acesso for pelo perfil)
        const userMenu = document.getElementById('user-menu-content');
        const overlay = document.getElementById('user-menu-overlay');
        if(userMenu) userMenu.classList.add('hidden');
        if(overlay) overlay.classList.add('hidden');

        // 2. Identifica os elementos da tela
        const modal = document.getElementById('my-orders-modal');
        const list = document.getElementById('my-orders-list');
        
        // Se houver um modal (versão antiga), abre ele. Se não houver, o código continua para a página.
        if(modal) modal.classList.remove('hidden');

        // Se não houver onde listar os pedidos (erro de ID), interrompe
        if(!list) return;

        // 3. Verifica se o usuário está logado
    // 3. Define o e-mail de busca (Usuário Logado OU Salvo no LocalStorage do Visitante)
            let emailDeBusca = loggedUserEmail;
            
            if (!emailDeBusca) {
                const visitanteSalvo = localStorage.getItem('tropyberry_user');
                if (visitanteSalvo) {
                    try {
                        const dadosVisitante = JSON.parse(visitanteSalvo);
                        if (dadosVisitante.email) {
                            emailDeBusca = dadosVisitante.email; // Puxa o e-mail que o visitante digitou no checkout
                        }
                    } catch (e) { console.error("Erro ao ler dados do visitante"); }
                }
            }

            // Se realmente não tiver e-mail em lugar nenhum, mostra o bloqueio
            if (!emailDeBusca) {
                list.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
                        <i class="fas fa-user-secret text-5xl mb-4"></i>
                        <p class="font-bold text-gray-600">Nenhum pedido encontrado</p>
                        <p class="text-sm px-4 mt-2">Não encontramos um histórico recente neste dispositivo. Faça login para recuperar.</p>
                        <div class="flex flex-col gap-3 mt-6">
                            <button onclick="window.location.href='login.html'" class="bg-cyan-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-cyan-700 transition">Fazer Login</button>
                            <button onclick="window.location.href='cardapio.html'" class="text-cyan-600 font-bold hover:underline">Ver Cardápio</button>
                        </div>
                    </div>`;
                return;
            }

            try {
                // 4. Busca no Firebase: Pedidos Atuais + Histórico (ordenado pelos mais novos)
                const q = query(
                    collection(db, "pedidos"), 
                    where("customer.email", "==", emailDeBusca), // Usa a nova variável de e-mail dinâmica
                    orderBy("createdAt", "desc") 
                );

            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                list.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-gray-400">
                        <i class="fas fa-receipt text-5xl mb-4"></i>
                        <p class="font-bold text-gray-600">Nenhum pedido encontrado</p>
                        <p class="text-sm">Você ainda não realizou pedidos conosco.</p>
                        <button onclick="window.location.href='cardapio.html'" class="mt-6 text-cyan-600 font-bold hover:underline flex items-center gap-2">
                            <i class="fas fa-arrow-left"></i> Ir para o Cardápio
                        </button>
                    </div>`;
                return;
            }

            let html = '';
            querySnapshot.forEach((doc) => {
                const order = doc.data();
                const date = order.createdAt ? order.createdAt.toDate().toLocaleDateString('pt-BR') + ' às ' + order.createdAt.toDate().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 'Data desc.';
                
                // Configuração de cores e ícones baseada no status
                let statusColor = 'bg-gray-100 text-gray-600';
                let statusIcon = 'fa-clock';
                let pulseClass = ''; // Para animar pedidos ativos
                
                if(order.status === 'Aguardando') { 
                    statusColor = 'bg-orange-100 text-orange-600'; 
                    statusIcon = 'fa-hourglass-half';
                    pulseClass = 'animate-pulse';
                }
                if(order.status === 'Em Preparo') { 
                    statusColor = 'bg-blue-100 text-blue-600'; 
                    statusIcon = 'fa-fire';
                    pulseClass = 'animate-pulse';
                }
                if(order.status === 'Saiu para Entrega') { 
                    statusColor = 'bg-purple-100 text-purple-600'; 
                    statusIcon = 'fa-motorcycle';
                    pulseClass = 'animate-bounce';
                }
                if(order.status === 'Finalizado') { 
                    statusColor = 'bg-green-100 text-green-600'; 
                    statusIcon = 'fa-check-circle'; 
                }
                if(order.status === 'Cancelado' || order.status === 'Rejeitado') { 
                    statusColor = 'bg-red-100 text-red-600'; 
                    statusIcon = 'fa-times-circle'; 
                }

                const itemsHtml = order.items.map(i => `<span class="block text-gray-600 text-xs font-medium">• ${i.quantity}x ${i.name}</span>`).join('');

                // Card do pedido (Destaque para pedidos ativos)
                html += `
                    <div class="bg-white border-2 ${order.status !== 'Finalizado' && order.status !== 'Cancelado' ? 'border-cyan-100 shadow-md' : 'border-gray-100'} rounded-2xl p-5 hover:shadow-lg transition-all duration-300">
                        <div class="flex justify-between items-start mb-4 border-b border-gray-50 pb-3">
                            <div>
                                <span class="text-[10px] font-black text-gray-400 tracking-widest uppercase">Pedido #${doc.id.slice(-5).toUpperCase()}</span>
                                <p class="text-xs text-gray-500 font-medium mt-1"><i class="far fa-calendar-alt mr-1"></i> ${date}</p>
                            </div>
                            <div class="${statusColor} ${pulseClass} px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 uppercase tracking-wide border border-current/10">
                                <i class="fas ${statusIcon}"></i> ${order.status}
                            </div>
                        </div>
                        
                        <div class="mb-4 pl-3 border-l-2 border-cyan-50 space-y-1">
                            ${itemsHtml}
                        </div>

                        <div class="flex justify-between items-center mt-2 pt-3 border-t border-dashed border-gray-100">
                            <div class="flex flex-col">
                                <span class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Valor Total</span>
                                <span class="text-lg font-black text-gray-800">R$ ${parseFloat(order.total).toFixed(2).replace('.', ',')}</span>
                            </div>
                            
                            <button onclick="openOrderScreen('${doc.id}')" class="bg-cyan-50 text-cyan-700 text-xs font-black py-2.5 px-5 rounded-xl hover:bg-cyan-600 hover:text-white transition-all shadow-sm border border-cyan-100 active:scale-95">
                                ACOMPANHAR <i class="fas fa-arrow-right ml-1"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

        } catch (e) {
            console.error("Erro ao carregar pedidos:", e);
            if(e.message.includes("requires an index")) {
                console.warn("⚠️ NECESSÁRIO CRIAR ÍNDICE NO FIREBASE. VEJA O LINK NO CONSOLE.");
            }
            list.innerHTML = `
                <div class="text-center py-10">
                    <div class="bg-red-50 text-red-500 p-4 rounded-xl inline-block mb-4">
                        <i class="fas fa-exclamation-triangle text-2xl"></i>
                    </div>
                    <p class="text-gray-700 font-bold">Ops! Algo deu errado.</p>
                    <p class="text-xs text-gray-500 px-10">Não conseguimos carregar seus pedidos agora. Tente atualizar a página.</p>
                </div>`;
        }
    };

    window.fecharMeusPedidos = () => {
        document.getElementById('my-orders-modal').classList.add('hidden');
    };
    // Função para salvar os dados do cliente no navegador (Local Storage)
    window.salvarDadosClienteAutomatico = function() {
        const dados = {
            name: document.getElementById('input-name')?.value || '',
            email: document.getElementById('input-email')?.value || '', // Salvando o e-mail aqui
            phone: document.getElementById('input-phone')?.value || '',
            street: document.getElementById('input-street')?.value || '',
            number: document.getElementById('input-number')?.value || '',
            district: document.getElementById('input-district')?.value || '',
            comp: document.getElementById('input-comp')?.value || ''
        };
        localStorage.setItem('tropyberry_user', JSON.stringify(dados));
    };

    // Função que abre a tela de Resumo
    window.goToSummary = function() {
        // 1. Validações básicas
        const name = document.getElementById('input-name').value;
        if(!name) return showToast("Por favor, informe seu nome.", true);
        
        // 2. Captura dados para o objeto do pedido
        currentOrder.customer = {
            name: name,
            phone: document.getElementById('input-phone').value,
            email: document.getElementById('input-email').value
        };

        if (currentOrder.method === 'delivery') {
            const rua = document.getElementById('input-street').value;
            const num = document.getElementById('input-number').value;
            const bairro = document.getElementById('input-district').value;
            
            if(!rua || !num || !bairro) return showToast("Preencha o endereço completo!", true);
            
            const modo = configPedidos.deliveryMode;
            if (modo === 'ifood' || modo === 'distance' || modo === 'google') {
                if (!distanciaConfirmada || freteGoogleCalculado === 0) {
                    showToast("Calculando frete... Aguarde a confirmação da distância.", false);
                    window.calcularDistanciaGoogle();
                    setTimeout(() => { if(distanciaConfirmada) window.goToSummary(); }, 1500);
                    return;
                }
            }
            currentOrder.customer.address = `${rua}, ${num} - ${bairro}`;
        } else {
            currentOrder.customer.address = "Retirada na Loja";
        }

        window.salvarDadosClienteAutomatico();

        // === CÁLCULO DE VALORES COM CUPOM NO RESUMO (REVISADO) ===
        const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const frete = calcularFrete();
        const valorFreteReal = (frete === null) ? 0 : frete;
        
        // Lógica do Desconto (Cupom) - Garantindo que subtraia do Total Final
        let valorDesconto = 0;
        if (cupomAtivo) {
            // Converte para número para evitar erros de comparação de texto
            const minCarrinho = parseFloat(cupomAtivo.min) || 0;
            
            if (subtotal >= minCarrinho) {
                if (cupomAtivo.tipo === 'fixo') {
                    valorDesconto = parseFloat(cupomAtivo.valor);
                } else if (cupomAtivo.tipo === 'porcentagem') {
                    const fator = cupomAtivo.valor > 1 ? cupomAtivo.valor / 100 : cupomAtivo.valor;
                    valorDesconto = subtotal * fator;
                } else if (cupomAtivo.tipo === 'frete') {
                    const kmAtual = window.distanciaKmGlobal || 0;
                    if (cupomAtivo.kmLimit === 0 || kmAtual <= cupomAtivo.kmLimit) {
                        valorDesconto = valorFreteReal;
                    }
                }
            }
        }

        const taxaServico = (currentOrder.method === 'delivery') ? (parseFloat(configPedidos.delivServiceFee) || 0) : 0;
        
        // AQUI O TOTAL FINAL RECEBE A SUBTRAÇÃO DO DESCONTO (Sincronizado com o carrinho)
        const totalFinal = (subtotal + valorFreteReal + taxaServico) - valorDesconto;
        
        currentOrder.total = totalFinal;

        // --- ATUALIZAÇÃO DA UI DO MODAL DE RESUMO ---
        document.getElementById('summary-address-display').innerText = currentOrder.customer.address;
        document.getElementById('summary-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        
        const deliveryDisplay = document.getElementById('summary-delivery');
        if (frete === null) {
            deliveryDisplay.innerText = "Calculando...";
        } else if (valorFreteReal > 0) {
            deliveryDisplay.innerText = `R$ ${valorFreteReal.toFixed(2).replace('.', ',')}`;
            deliveryDisplay.classList.remove('text-green-600');
        } else {
            deliveryDisplay.innerText = "Grátis";
            deliveryDisplay.classList.add('text-green-600');
        }

        // EXIBIÇÃO DO DESCONTO NO RESUMO
        const summaryDiscountRow = document.getElementById('summary-discount-row');
        const summaryDiscountVal = document.getElementById('summary-discount');
        if (summaryDiscountRow && summaryDiscountVal) {
            if (valorDesconto > 0) {
                summaryDiscountRow.classList.remove('hidden');
                summaryDiscountVal.innerText = `- R$ ${valorDesconto.toFixed(2).replace('.', ',')}`;
            } else {
                summaryDiscountRow.classList.add('hidden');
            }
        }

        // Atualiza o Total Final com o desconto aplicado (Garante o R$ 15,00 na tela)
        document.getElementById('summary-total').innerText = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;

        const itemsContainer = document.getElementById('summary-items');
        if (itemsContainer) {
            itemsContainer.innerHTML = cart.map(item => `
                <div class="flex justify-between border-b border-gray-50 pb-1">
                    <span class="text-gray-600">${item.quantity}x ${item.name}</span>
                    <span class="font-bold">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                </div>
            `).join('');
        }

        showStep('step-summary');
    };

    // Atualização da função de passos para incluir o resumo
    window.showStep = function(stepId) { 
        const steps = ['step-service', 'step-address', 'step-summary', 'step-payment-method'];
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden'); 
        });

        const target = document.getElementById(stepId);
        if (target) target.classList.remove('hidden');

        const btnAddress = document.getElementById('btn-next-address'); 
        const btnSummary = document.getElementById('btn-next-summary'); 
        const btnEdit = document.getElementById('btn-edit-summary');    
        const btnPay = document.getElementById('btn-generate-pay');     

        if(btnAddress) btnAddress.classList.add('hidden');
        if(btnSummary) btnSummary.classList.add('hidden');
        if(btnEdit) btnEdit.classList.add('hidden');
        if(btnPay) btnPay.classList.add('hidden');

        if (stepId === 'step-address') {
            if(btnAddress) btnAddress.classList.remove('hidden');
            checkSavedAddress();

            // FIX: Toda vez que entrar na tela de endereço, 
            // força a atualização visual do agendamento após a tela aparecer
            setTimeout(() => {
                if (typeof window.toggleTimingUI === 'function') {
                    window.toggleTimingUI();
                }
            }, 50);
        }
        else if (stepId === 'step-summary') {
            if(btnSummary) btnSummary.classList.remove('hidden');
            if(btnEdit) btnEdit.classList.remove('hidden');
        }
        else if (stepId === 'step-payment-method') {
            if(btnPay) btnPay.classList.remove('hidden');
        }
    };
    window.voltarCheckout = function() {
        const steps = ['step-service', 'step-address', 'step-summary', 'step-payment-method'];
        let currentStepId = "";
        
        // Encontra qual etapa está visível no momento
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) currentStepId = id;
        });

        if (currentStepId === 'step-service' || currentStepId === "") {
            closeCheckout(); // Se for a primeira etapa, fecha o modal
        } else {
            // Se estiver em qualquer outra etapa, volta para a anterior
            const currentIndex = steps.indexOf(currentStepId);
            showStep(steps[currentIndex - 1]);
        }
    };
    window.toggleTimingUI = function() {
        const timing = document.querySelector('input[name="order-timing"]:checked')?.value;
        const inputsDiv = document.getElementById('schedule-inputs');
        if (timing === 'schedule') {
            inputsDiv.classList.remove('hidden');
        } else {
            inputsDiv.classList.add('hidden');
            document.getElementById('input-schedule-date').value = '';
            document.getElementById('input-schedule-time').value = '';
        }
    };
    let currentSlide = 0;
    let autoPlayTimer;

    window.renderizarBannersSite = function() {
        const container = document.getElementById('marketing-banners-site');
        const indicatorContainer = document.getElementById('carousel-indicators');
        if (!container) return;

        const banners = [
            { title: "Clube do Açai", subtitle: "10% OFF e Prioridade", tag: "O QUERIDINHO", grad: "from-cyan-600 to-cyan-900", img: "img/logosf.png", action: "window.abrirModalClube()" },
            { title: "Combo Casal", subtitle: "2 Copos de 500ml", tag: "COMBO TOP", grad: "from-pink-500 to-red-600", img: "img/destaques/copo2.png", action: "window.location.href='cardapio.html'" },
            { title: "Monte seu Copo", subtitle: "Do seu jeito!", tag: "DO SEU JEITO", grad: "from-purple-600 to-cyan-700", img: "img/destaques/copo1.png", action: "window.location.href='cardapio.html'" },
            { title: "Fidelidade Tropi", subtitle: "Ganhe 1 Açaí Grátis", tag: "GANHE PRÊMIOS", grad: "from-yellow-400 to-orange-600", img: "img/destaques/fidelidade.png", action: "window.abrirModalFidelidade()" }
        ];

        // 1. Injeta os Banners
        container.innerHTML = banners.map(b => `
            <div class="banner-card group cursor-pointer" onclick="${b.action}">
                <div class="banner-bg bg-gradient-to-br ${b.grad}">
                    <div class="shine-effect"></div>
                </div>
                <div class="relative z-20 flex flex-col justify-between h-full p-5 text-white">
                    <div>
                        <span class="bg-white/20 text-[9px] font-black px-2 py-1 rounded-full border border-white/10 uppercase">${b.tag}</span>
                        <h2 class="text-xl font-black mt-2 leading-tight italic uppercase">${b.title}</h2>
                        <p class="text-white/80 text-[10px] font-medium">${b.subtitle}</p>
                    </div>
                    <button class="bg-white text-cyan-950 px-4 py-1.5 rounded-xl text-[10px] font-black w-fit shadow-md uppercase">Conferir</button>
                </div>
                <div class="pop-out-image absolute -right-3 -bottom-3">
                    <img src="${b.img}" class="w-28 h-28 object-contain ${b.title.includes('Casal') || b.title.includes('Monte') ? 'rounded-full' : ''}">
                </div>
            </div>
        `).join('');

        // 2. Injeta os Tracinhos
        if(indicatorContainer) {
            indicatorContainer.innerHTML = banners.map((_, i) => `
                <div class="indicator-bar ${i === 0 ? 'active' : ''}" id="ind-${i}">
                    <div class="indicator-progress"></div>
                </div>
            `).join('');
        }

        // 3. Detectar Scroll Manual (Dedo no mobile)
        container.addEventListener('scroll', () => {
            const width = container.children[0].offsetWidth + 16;
            const index = Math.round(container.scrollLeft / width);
            if (index !== currentSlide) {
                currentSlide = index;
                atualizarIndicadores(currentSlide);
            }
        });

        iniciarAutoPlay(banners.length);
    }

    // Função das Setas
    window.moverCarrossel = (direcao) => {
        const container = document.getElementById('marketing-banners-site');
        if (!container || container.children.length === 0) return;

        const total = container.children.length;
        currentSlide = (currentSlide + direcao + total) % total;
        
        const cardWidth = container.children[0].offsetWidth + 16; 
        container.scrollTo({ left: currentSlide * cardWidth, behavior: 'smooth' });
        
        atualizarIndicadores(currentSlide);
        resetAutoPlay(total);
    };

    function atualizarIndicadores(idx) {
        document.querySelectorAll('.indicator-bar').forEach((el, i) => {
            el.classList.toggle('active', i === idx);
            const progress = el.querySelector('.indicator-progress');
            if(progress) {
                progress.style.transition = 'none';
                progress.style.width = '0%';
                if (i === idx) {
                    setTimeout(() => {
                        progress.style.transition = 'width 5s linear';
                        progress.style.width = '100%';
                    }, 10);
                }
            }
        });
    }

    function iniciarAutoPlay(total) {
        if (autoPlayTimer) clearInterval(autoPlayTimer);
        autoPlayTimer = setInterval(() => window.moverCarrossel(1), 5000);
    }

    function resetAutoPlay(total) {
        iniciarAutoPlay(total);
    }

    // --- FUNÇÕES DOS MODAIS ---

    window.abrirModalClube = () => {
        document.getElementById('modal-clube')?.classList.remove('hidden');
    };

    window.abrirModalFidelidade = () => {
        // Se você não criou o modal de fidelidade no HTML ainda, ele não vai abrir.
        // Certifique-se de que o ID 'modal-fidelidade' existe no seu index.html
        document.getElementById('modal-fidelidade')?.classList.remove('hidden');
    };

    // --- INICIALIZAÇÃO ÚNICA ---
    // Remova as chamadas duplicadas e deixe apenas estas duas:
    renderizarBannersSite();
    renderizarCuponsSite();

    // Faz a ponte com o Mercado Pago através da sua Cloud Function
    window.assinarClube = async () => {
        // Verifica se o usuário está logado
        if (!loggedUserEmail) {
            showToast("Faça login para participar do clube!", true);
            setTimeout(() => window.location.href = 'login.html', 1500);
            return;
        }

        const btn = document.getElementById('btn-assinar-clube');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSANDO...';

        try {
            const response = await fetch("https://tropiberry.site/pagamento.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        method: 'subscription', 
        total: 30.00,
        planName: 'Assinatura Mensal Clube TropiBerry',
        playerInfo: {
            email: loggedUserEmail,
            name: "Membro do Clube"
        }
    })
});

            const data = await response.json();

            if (data.init_point) {
                // Redireciona para o checkout do Mercado Pago configurado como recorrência
                window.location.href = data.init_point;
            } else {
                throw new Error("Erro no link de pagamento");
            }

        } catch (e) {
            console.error(e);
            showToast("Erro ao gerar assinatura. Tente novamente.", true);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> ADERIR AO CLUBE';
        }
    };
    // Chame a função no início do script.js ou dentro do DOMContentLoaded
    renderizarBannersSite();
    // Função para renderizar os cupons no Index (Site do Cliente)
    function renderizarCuponsSite() {
    const container = document.getElementById('marketing-coupons-site');
    const sectionArea = document.getElementById('section-cupons-area'); 

    if (!container || !db) return;

    onSnapshot(query(collection(db, "marketing_cupons"), where("ativo", "==", true)), (snapshot) => {
        let cupons = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 🔥 A MÁGICA 2: Tira os secretos da vitrine da página inicial
        cupons = cupons.filter(c => !c.secreto);
        
        if (cupons.length === 0) {
            if(sectionArea) sectionArea.classList.add('hidden');
            return;
        } else {
            if(sectionArea) sectionArea.classList.remove('hidden');
        }

        container.innerHTML = cupons.map(c => `
            <div class="bg-white rounded-xl p-4 border-2 border-dashed border-cyan-200 flex items-center justify-between relative overflow-hidden group hover:border-cyan-400 transition-colors cursor-pointer" onclick="copiarCupomSite('${c.code}')">
                <div class="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-50 rounded-full border-r border-cyan-200"></div>
                <div class="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-50 rounded-full border-l border-cyan-200"></div>
                
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg ${c.color || 'bg-cyan-600'} text-white flex items-center justify-center text-lg shadow-sm">
                        ${c.icon || '🎟️'}
                    </div>
                    <div>
                        <p class="font-bold text-gray-800 text-sm leading-none">${c.title}</p>
                        <p class="text-xs text-gray-500 mt-1">${c.desc}</p>
                    </div>
                </div>
                
                <div class="bg-cyan-50 text-cyan-700 font-mono font-bold text-sm px-3 py-1 rounded border border-cyan-100 group-hover:bg-cyan-600 group-hover:text-white transition">
                    ${c.code}
                </div>
            </div>
        `).join('');
    });
}

    // Função para copiar o código ao clicar
    window.copiarCupomSite = (codigo) => {
        navigator.clipboard.writeText(codigo).then(() => {
            // Usa o seu sistema de Toast existente
            if(typeof showToast === 'function') {
                showToast(`Cupom ${codigo} copiado!`);
            } else {
                alert(`Cupom ${codigo} copiado!`);
            }
        });
    };
    // =========================================================
    // SISTEMA DE CUPONS INTEGRADO (COM FIREBASE)
    // =========================================================
    let cupomAtivo = null;
    let listaCupons = [];

    // 1. O site "escuta" o Firebase e salva os cupons ativos
    window.monitorarCuponsDoBanco = () => {
        if (!db) return;
        onSnapshot(collection(db, "marketing_cupons"), (snapshot) => {
            listaCupons = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(c => c.ativo === true);
        });
    };

    // 2. Auxiliar para ver quanto deu o carrinho
    function obterSubtotalCart() {
        return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    // 3. Abre o modal que o cliente vê
    window.abrirModalCupons = () => {
        const modal = document.getElementById('coupon-modal');
        if (modal) {
            modal.classList.remove('hidden');
            window.renderizarListaCupons();
        }
    };

    window.fecharModalCupons = () => {
        const modal = document.getElementById('coupon-modal');
        if (modal) modal.classList.add('hidden');
    };

    window.renderizarListaCupons = () => {
    const container = document.getElementById('coupons-list');
    if (!container) return;
    
    const subtotal = obterSubtotalCart();
    
    // 🔥 A MÁGICA AQUI: Filtra a lista pra exibir SÓ os que NÃO são secretos
    const cuponsVisiveis = listaCupons.filter(c => !c.secreto);

    if(cuponsVisiveis.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4 font-bold">Nenhum cupom disponível no momento.</p>';
        return;
    }

    // Passa o .map na lista filtrada em vez da lista completa
    container.innerHTML = cuponsVisiveis.map(cupom => {
        const subtotalInvalido = subtotal < (cupom.min || 0);
        const kmAtual = window.distanciaKmGlobal || 0;
        const freteInvalido = cupom.tipo === 'frete' && cupom.kmLimit > 0 && kmAtual > cupom.kmLimit;
        const bloqueado = subtotalInvalido || freteInvalido;
        const isAtivo = cupomAtivo?.id === cupom.id;

            let msgErro = "";
            if (subtotalInvalido) msgErro = `Mínimo R$ ${(cupom.min || 0).toFixed(2).replace('.', ',')}`;
            else if (freteInvalido) msgErro = `Válido apenas até ${cupom.kmLimit}km`;
        
        return `
            <div class="bg-white p-4 rounded-xl border-2 ${isAtivo ? 'border-cyan-500 bg-cyan-50' : 'border-gray-100'} ${bloqueado ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-cyan-300 transition'}" 
                onclick="${!bloqueado ? `window.aplicarCupom('${cupom.id}')` : `showToast('${msgErro}', true)'`}">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-black text-cyan-900 text-lg">${cupom.titulo || cupom.code}</h4>
                        <p class="text-xs text-gray-500">${cupom.descricao || 'Desconto'}</p>
                        <p class="text-[10px] font-bold text-orange-500 mt-1 uppercase">
                            ${msgErro ? msgErro : 'Disponível para você'}
                        </p>
                    </div>
                    ${isAtivo ? '<i class="fas fa-check-circle text-cyan-600 text-3xl"></i>' : (bloqueado ? '<i class="fas fa-lock text-gray-400 text-xl"></i>' : '<i class="fas fa-ticket-alt text-cyan-600 text-xl"></i>')}
                </div>
            </div>
        `;
    }).join('');
};

    // 5. Clicou no cupom ou digitou o código = Aplica e salva!
    window.aplicarCupom = (cupomId) => {
        // NOVO: Se clicar no mesmo cupom que já está ativo, ele remove!
        if (cupomAtivo && cupomAtivo.id === cupomId) {
            cupomAtivo = null;
            localStorage.removeItem('tropyberry_cupom');
            const textoBotao = document.getElementById('coupon-selected-text');
            if (textoBotao) {
                textoBotao.innerText = "Cupom de desconto";
                textoBotao.classList.remove('text-cyan-600', 'font-bold');
            }
            window.fecharModalCupons();
            if (typeof updateCartUI === 'function') updateCartUI();
            if (typeof renderReceipt === 'function') renderReceipt();
            showToast("Cupom removido com sucesso!");
            return;
        }

        const cupom = listaCupons.find(c => c.id === cupomId);
        if (!cupom) return;

        const kmAtual = window.distanciaKmGlobal || 0;
        if (cupom.tipo === 'frete' && cupom.kmLimit > 0 && kmAtual > cupom.kmLimit) {
            return showToast(`Cupom válido apenas para entregas até ${cupom.kmLimit}km`, true);
        }

        cupomAtivo = cupom;
        
        // A MÁGICA AQUI: Salva no HD do navegador pro reload não esquecer!
        localStorage.setItem('tropyberry_cupom', JSON.stringify(cupom)); 
        
        const textoBotao = document.getElementById('coupon-selected-text');
        if (textoBotao) {
            textoBotao.innerText = `Cupom: ${cupom.code}`;
            textoBotao.classList.add('text-cyan-600', 'font-bold');
        }
        
        window.fecharModalCupons();
        
        if (typeof updateCartUI === 'function') updateCartUI(); 
        if (typeof renderReceipt === 'function') renderReceipt();
        
        showToast(`Cupom ${cupom.code} aplicado com sucesso!`);
    };

    // 6. Cliente tentou digitar o código na mão
    window.validarCupomManual = () => {
        const codigoInput = document.getElementById('input-coupon-code')?.value.toUpperCase().trim();
        if (!codigoInput) return showToast("Digite um código", true);

        const cupom = listaCupons.find(c => c.code === codigoInput);
        const subtotal = obterSubtotalCart();
        const kmAtual = window.distanciaKmGlobal || 0;

        if (!cupom) {
            showToast("Cupom inválido ou inativo", true);
        } else if (subtotal < (cupom.min || 0)) {
            showToast(`Valor mínimo do pedido: R$ ${(cupom.min || 0).toFixed(2).replace('.', ',')}`, true);
        } else if (cupom.tipo === 'frete' && cupom.kmLimit > 0 && kmAtual > cupom.kmLimit) {
            showToast(`Este cupom é válido apenas para entregas até ${cupom.kmLimit}km`, true);
        } else {
            window.aplicarCupom(cupom.id); 
            document.getElementById('input-coupon-code').value = '';
        }
    };
    // Função auxiliar para evitar que o cálculo dispare mil vezes seguidas
    function debounce(func, timeout = 1000) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }
    // --- Adicione estas variáveis no topo do script.js ---
    let userSeals = 0;
    let currentMonthRef = new Date().toISOString().slice(0, 7); // Formato "2026-01"

    // --- Adicione estas funções ao final do arquivo ---

    // Expõe a função para o HTML poder usar o onclick
    window.gerenciarInicioFidelidade = () => {
        if (!loggedUserEmail) {
            showToast("Faça login para começar a ganhar selos!", true);
            setTimeout(() => window.location.href = 'login.html', 1200);
            return;
        }
        document.getElementById('modal-fidelidade').classList.add('hidden');
        showToast("Você já está participando! Selos válidos apenas para este mês.");
    };

    function monitorarFidelidadeUser(email) {
        if(!db || !email) return;
        
        const userRef = doc(db, "usuarios", email);
        const currentMonth = new Date().toISOString().slice(0, 7); // Formato "2026-01"

        onSnapshot(userRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                let selos = data.selosFidelidade || 0;
                const mesBanco = data.mesReferenciaFidelidade || "";

                // RESET MENSAL AUTOMÁTICO (Se o mês mudou e não completou 10)
                if (mesBanco !== "" && mesBanco !== currentMonth && selos < 10) {
                    selos = 0;
                    await updateDoc(userRef, { 
                        selosFidelidade: 0, 
                        mesReferenciaFidelidade: currentMonth 
                    });
                } else if (mesBanco === "") {
                    // Primeira vez: marca o mês atual
                    await updateDoc(userRef, { mesReferenciaFidelidade: currentMonth }, { merge: true });
                }

                renderizarSelosVisual(selos);
            }
        });
    }

    function renderizarSelosVisual(count) {
        const container = document.getElementById('selos-container');
        const statusTxt = document.getElementById('fidelidade-status-texto');
        const btn = document.getElementById('btn-fidelidade-acao');
        if (!container) return;
        
        let html = '';
        for (let i = 1; i <= 10; i++) {
            if (i <= count) {
                html += `<div class="aspect-square bg-orange-500 rounded-full flex items-center justify-center text-white border-2 border-orange-600 shadow-md animate-pop-up"><i class="fas fa-check"></i></div>`;
            } else {
                html += `<div class="aspect-square bg-gray-100 rounded-full border-2 border-dashed border-gray-300"></div>`;
            }
        }
        container.innerHTML = html;

        if (count >= 10) {
            if(statusTxt) statusTxt.innerHTML = "🎁 <span class='animate-bounce text-green-400'>AÇAÍ GRÁTIS DISPONÍVEL!</span>";
            if(btn) btn.innerText = "BRINDE LIBERADO!";
        }
    }
    // Abre o modal em vez do confirm()
    window.solicitarReembolsoCliente = function() {
        document.getElementById('modal-reembolso').classList.remove('hidden');
    };

    // Executa a ação real após a confirmação no modal
    window.confirmarReembolsoFluxo = function() {
        const orderId = document.getElementById('status-order-id')?.innerText || 'DESCONHECIDO';
        const telefoneLoja = "5583920024786"; 
        
        // Esconde o modal
        document.getElementById('modal-reembolso').classList.add('hidden');

        // Mostra o Toast de Sucesso
        showToast("Solicitação iniciada! Redirecionando...", "info");

        setTimeout(() => {
            const mensagem = `Olá, gostaria de solicitar o *REEMBOLSO* do pedido *#${orderId}*.\n\n*Motivo:* `;
            const link = `https://wa.me/${telefoneLoja}?text=${encodeURIComponent(mensagem)}`;
            window.open(link, '_blank');
        }, 1500);
    };

    // Sistema de Toast Aprimorado (Clean e Bonito)
    window.showToast = function(message, type = "success") {
        const toast = document.getElementById('toast-notification');
        const toastMsg = document.getElementById('toast-message');
        const toastIcon = toast.querySelector('.fas');
        const toastBorder = toast;

        // Ajusta cores e ícones conforme o tipo
        if (type === "success") {
            toastBorder.style.borderLeftColor = "#22c55e";
            toastIcon.className = "fas fa-check-circle text-xl text-green-500";
        } else if (type === "info") {
            toastBorder.style.borderLeftColor = "#0891b2";
            toastIcon.className = "fas fa-info-circle text-xl text-cyan-600";
        } else {
            toastBorder.style.borderLeftColor = "#ef4444";
            toastIcon.className = "fas fa-times-circle text-xl text-red-500";
        }

        toastMsg.innerText = message;
        
        // Animação de entrada
        toast.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
        toast.classList.add('translate-x-0', 'opacity-100');

        // Auto-hide após 4 segundos
        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none');
            toast.classList.remove('translate-x-0', 'opacity-100');
        }, 4000);
    };

    // Expõe para o HTML (Necessário por causa do type="module")
    window.abrirModalCupons = abrirModalCupons;
    window.fecharModalCupons = fecharModalCupons;
    window.aplicarCupom = aplicarCupom;
    window.validarCupomManual = validarCupomManual;
    window.gerenciarInicioFidelidade = gerenciarInicioFidelidade;
