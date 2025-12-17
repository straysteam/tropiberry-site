import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc, getDoc, onSnapshot, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { monitorarEstadoAuth, fazerLogout, verificarAdminNoBanco, db as authDb } from './auth.js'; 

let currentUserIsAdmin = false; 
let db = authDb; 
let products = [];
let categories = []; // Novas categorias dinâmicas
let cart = [];
let isStoreOpen = true; 
let currentOrder = { method: '', customer: {}, items: [], total: 0 };
let statusMap = null; 

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
window.copyPixScreen = copyPixScreen;
window.switchToStatus = switchToStatus;
window.toggleReceipt = toggleReceipt;
window.openOrderScreen = openOrderScreen; 
window.fazerLogout = fazerLogout;
window.compartilharSite = compartilharSite;
window.abrirEditorInformacoes = abrirEditorInformacoes;
window.salvarInformacoesLoja = salvarInformacoesLoja;

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Carrega Categorias Dinâmicas PRIMEIRO
    await carregarCategoriasSite();

    // 2. Carrega Produtos
    carregarProdutosDoBanco();

    // 3. Status Loja
    monitorarStatusLojaNoBanco();
    
    // 4. Auth
    monitorarEstadoAuth(async (user) => {
        const container = document.getElementById('auth-buttons-container');
        if (user) {
            currentUserIsAdmin = await verificarAdminNoBanco(user.email);
            let adminBtn = currentUserIsAdmin ? `<a href="admin.html" class="bg-cyan-800 border border-cyan-400 text-yellow-400 text-[10px] px-2 py-1 rounded font-bold uppercase ml-2 shadow-sm hover:bg-cyan-700 decoration-0">Painel Admin</a>` : '';
            if(container) {
                container.innerHTML = `
                    <div class="flex items-center">
                        <span class="text-xs font-bold text-white hidden md:block mr-2">${user.displayName || user.email.split('@')[0]}</span>
                        ${adminBtn}
                        <button onclick="fazerLogout()" class="bg-red-500/80 hover:bg-red-500 text-white text-xs px-3 py-1 ml-2 rounded-full font-bold transition">Sair</button>
                    </div>`;
            }
            atualizarInteratividadeBotaoLoja();
            atualizarElementosAdminUI();
        } else {
            currentUserIsAdmin = false;
            if(container) {
                container.innerHTML = `
                    <a href="login.html" class="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1 rounded-full font-bold transition">Entrar</a>
                    <a href="cadastro.html" class="bg-yellow-400 hover:bg-yellow-300 text-cyan-900 text-xs px-3 py-1 rounded-full font-bold transition">Cadastrar</a>`;
            }
            atualizarInteratividadeBotaoLoja();
            atualizarElementosAdminUI();
        }
    });
    updateStoreStatusUI();
    checkLastOrder();
});

// === CATEGORIAS DINÂMICAS ===
async function carregarCategoriasSite() {
    if(!db) return;
    try {
        const q = query(collection(db, "categorias"), orderBy("nome"));
        const snapshot = await getDocs(q);
        categories = [];
        snapshot.forEach(doc => categories.push(doc.data()));
        
        // Se estiver na página de cardápio, gera os botões
        if(window.location.pathname.includes('cardapio.html')) {
            renderizarBotoesCategorias();
        }
    } catch(e) { console.error("Erro categorias:", e); }
}

function renderizarBotoesCategorias() {
    const container = document.querySelector('section .flex.flex-wrap'); // Local onde ficam os botões no cardapio.html
    if(!container) return;

    let html = `<button onclick="renderProducts('product-grid', null)" class="btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition" data-cat="all">Todos</button>`;
    
    categories.forEach(cat => {
        html += `<button onclick="renderProducts('product-grid', '${cat.slug}')" class="btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition" data-cat="${cat.slug}">${cat.nome}</button>`;
    });

    container.innerHTML = html;
}

// === CARREGAR PRODUTOS ===
function carregarProdutosDoBanco() {
    if(!db) return;
    const colRef = collection(db, "produtos");
    onSnapshot(colRef, (snapshot) => {
        products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        
        // Atualiza a tela
        const grid = document.getElementById('product-grid');
        if (grid) {
            if (window.location.pathname.includes('cardapio.html')) {
                renderProducts('product-grid', null); 
            } else {
                renderProducts('product-grid', 'destaques'); // Na home, tenta pegar destaques se existir
            }
        }
    });
}

function renderProducts(containerId, filterCategory) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const filtered = filterCategory ? products.filter(p => p.category === filterCategory) : products;

    // Atualiza Visual dos Botões
    if(window.location.pathname.includes('cardapio.html')) {
        const buttons = document.querySelectorAll('.btn-filter');
        buttons.forEach(btn => {
            const btnCat = btn.getAttribute('data-cat');
            const target = filterCategory || 'all';
            
            if(btnCat === target) {
                btn.className = "btn-filter px-4 py-2 bg-cyan-600 text-white rounded-full text-sm font-bold hover:bg-cyan-700 transition shadow-md";
            } else {
                btn.className = "btn-filter px-4 py-2 bg-white border border-cyan-600 text-cyan-600 rounded-full text-sm font-bold hover:bg-cyan-50 transition";
            }
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">Nenhum produto encontrado.</div>`;
        return;
    }

    container.innerHTML = filtered.map(product => {
        let priceHtml = '';
        if (product.originalPrice && product.originalPrice > product.price) {
            priceHtml = `
                <div class="flex flex-col items-end">
                    <span class="text-xs text-gray-400 line-through">R$ ${parseFloat(product.originalPrice).toFixed(2).replace('.',',')}</span>
                    <span class="text-lg font-extrabold text-green-600">R$ ${parseFloat(product.price).toFixed(2).replace('.',',')}</span>
                </div>`;
        } else {
            priceHtml = `<span class="text-lg font-extrabold text-cyan-900">R$ ${parseFloat(product.price).toFixed(2).replace('.',',')}</span>`;
        }

        let tagsHtml = '';
        if (product.tags && product.tags.length > 0) {
            tagsHtml = '<div class="absolute top-2 left-2 flex flex-col gap-1 z-10">';
            product.tags.forEach(tag => {
                let color = tag.includes('Veg') || tag.includes('Natural') ? 'bg-green-500' : (tag.includes('Ofert') ? 'bg-red-500' : 'bg-orange-400');
                tagsHtml += `<span class="${color} text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        // Info Extra (Serve / Peso)
        let extraInfo = '';
        if(product.serves && product.serves > 1) extraInfo += `<span class="text-xs text-gray-500 mr-2"><i class="fas fa-user-friends"></i> ${product.serves}</span>`;
        if(product.weight) extraInfo += `<span class="text-xs text-gray-500"><i class="fas fa-weight-hanging"></i> ${product.weight}${product.unit}</span>`;

        return `
        <div class="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col h-full border border-gray-100 relative">
            ${tagsHtml}
            <div class="h-48 relative overflow-hidden">
                <img src="${product.image || 'https://via.placeholder.com/300'}" alt="${product.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            
            <div class="p-5 flex flex-col justify-between flex-grow">
                <div>
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-lg font-bold text-cyan-900 leading-tight">${product.name}</h3>
                        ${priceHtml}
                    </div>
                    <div class="mb-2">${extraInfo}</div>
                    <p class="text-gray-500 text-sm line-clamp-3 mb-4">${product.description || ''}</p>
                </div>
                
                <button onclick="addToCart('${product.id}', this)" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-md mt-auto">
                    <i class="fas fa-cart-plus"></i>
                    <span>Adicionar</span>
                </button>
            </div>
        </div>
    `}).join('');
}

// ... (Mantenha o restante das funções: monitorarStatusLojaNoBanco, toggleStoreStatus, carrinho, checkout, etc. IGUAIS) ...
function monitorarStatusLojaNoBanco() {
    if(!db) return;
    try {
        const docRef = doc(db, "config", "loja");
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                isStoreOpen = data.aberto;
                updateStoreStatusUI();
            }
        });
    } catch (e) { console.error(e); }
}

async function toggleStoreStatus() {
    if (!currentUserIsAdmin) return showToast("Apenas a loja pode alterar isso!", true);
    if(!db) return showToast("Erro de conexão.", true);
    const novoStatus = !isStoreOpen;
    try {
        await setDoc(doc(db, "config", "loja"), { aberto: novoStatus, modificadoPor: "Admin", data: serverTimestamp() });
        showToast(novoStatus ? "Loja Aberta!" : "Loja Fechada!");
    } catch (error) { showToast("Erro de permissão!", true); }
}

function updateStoreStatusUI() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('store-status-btn');
    const banner = document.getElementById('closed-banner');
    if(!indicator) return;
    if (isStoreOpen) {
        indicator.className = "w-2 h-2 rounded-full bg-green-400 animate-pulse";
        text.innerText = "ABERTO";
        btn.className = `px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-2 ${currentUserIsAdmin ? 'cursor-pointer hover:scale-105' : 'cursor-default'} border-green-400 bg-green-600 text-green-100`;
        if(banner) banner.classList.add('hidden');
    } else {
        indicator.className = "w-2 h-2 rounded-full bg-red-500";
        text.innerText = "FECHADO";
        btn.className = `px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-2 ${currentUserIsAdmin ? 'cursor-pointer hover:scale-105' : 'cursor-default'} border-red-400 bg-red-600 text-red-100`;
        if(banner) banner.classList.remove('hidden');
    }
}

function atualizarInteratividadeBotaoLoja() {
    const storeBtn = document.getElementById('store-status-btn');
    if(!storeBtn) return;
    if(currentUserIsAdmin) {
        storeBtn.classList.remove('cursor-default'); storeBtn.classList.add('cursor-pointer'); storeBtn.title = "Admin: Clique para Abrir/Fechar";
    } else {
        storeBtn.classList.remove('cursor-pointer'); storeBtn.classList.add('cursor-default'); storeBtn.title = "Status da Loja";
    }
    updateStoreStatusUI();
}

function atualizarElementosAdminUI() {
    const adminActionsInfo = document.getElementById('admin-info-actions');
    if (adminActionsInfo) {
        if (currentUserIsAdmin) adminActionsInfo.classList.remove('hidden');
        else adminActionsInfo.classList.add('hidden');
    }
    const btnOpenEditor = document.getElementById('btn-open-menu-editor');
    if (btnOpenEditor) {
        if (currentUserIsAdmin) {
            btnOpenEditor.classList.remove('hidden');
            btnOpenEditor.onclick = function() { window.location.href = 'admin.html'; };
        } else {
            btnOpenEditor.classList.add('hidden');
        }
    }
}

function toggleInfoModal() { 
    const modal = document.getElementById('info-modal');
    if(modal) modal.classList.toggle('hidden'); 
    document.getElementById('edit-info-modal')?.classList.add('hidden');
}
function compartilharSite() {
    const text = "Venha conhecer a TropiBerry! O melhor açaí da cidade.";
    const url = window.location.origin;
    if (navigator.share) navigator.share({ title: 'TropiBerry Açaí', text: text, url: url }).catch((e) => console.log('Erro share', e));
    else navigator.clipboard.writeText(`${text} ${url}`).then(() => showToast("Link copiado!"), () => showToast("Erro ao copiar.", true));
}
function abrirEditorInformacoes() {
    document.getElementById('edit-address-input').value = document.getElementById('info-address').innerText;
    document.getElementById('edit-hours-input').value = document.getElementById('info-hours').innerText.replace('<br>', '\n');
    document.getElementById('edit-phone-input').value = document.getElementById('info-phone').innerText;
    document.getElementById('edit-info-modal').classList.remove('hidden');
}
function salvarInformacoesLoja() {
    if (!currentUserIsAdmin) return showToast("Sem permissão.", true);
    showToast("Simulação: Informações salvas!");
    document.getElementById('edit-info-modal').classList.add('hidden');
    toggleInfoModal();
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    const msgElement = document.getElementById('toast-message');
    const titleElement = toast.querySelector('p.font-bold');
    const iconElement = toast.querySelector('i');
    if (toast && msgElement) {
        msgElement.innerText = message;
        if (isError) {
            toast.classList.add('error'); titleElement.innerText = "Erro!"; iconElement.className = "fas fa-times-circle text-xl";
        } else {
            toast.classList.remove('error'); titleElement.innerText = "Sucesso!"; iconElement.className = "fas fa-check-circle text-xl";
        }
        toast.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
        setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none'); }, 3000);
    }
}

function addToCart(id, btnElement) {
    if (!isStoreOpen) return showToast("⚠️ Loja fechada!");
    const product = products.find(p => p.id === id); 
    if(!product) return showToast("Erro ao adicionar.", true);
    const item = cart.find(i => i.id === id);
    if (item) item.quantity++; else cart.push({ ...product, quantity: 1 });
    updateCartUI();
    showToast(`${product.name} adicionado!`);
    if(btnElement) { btnElement.classList.add('animate-click'); setTimeout(() => btnElement.classList.remove('animate-click'), 200); }
}

function changeQuantity(id, delta) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) cart = cart.filter(i => i.id !== id);
        updateCartUI();
    }
}

function updateCartUI() {
    const counters = document.querySelectorAll('#cart-count');
    const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
    counters.forEach(c => c.innerText = totalCount);
    const containers = document.querySelectorAll('#cart-items');
    const total = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const totalDisplays = document.querySelectorAll('#cart-total');
    totalDisplays.forEach(t => t.innerText = 'R$ ' + total.toFixed(2).replace('.', ','));
    containers.forEach(container => {
        if (cart.length === 0) container.innerHTML = `<p class="text-center text-gray-400 py-10">Carrinho vazio</p>`;
        else {
            container.innerHTML = cart.map(item => `
                <div class="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border mb-2">
                    <div><h5 class="font-bold text-cyan-900 text-sm">${item.name}</h5><p class="text-xs text-gray-500">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</p></div>
                    <div class="flex items-center gap-2 bg-gray-50 rounded px-2">
                        <button onclick="changeQuantity('${item.id}', -1)" class="text-red-500 font-bold w-6">-</button>
                        <span class="text-sm font-bold w-4 text-center">${item.quantity}</span>
                        <button onclick="changeQuantity('${item.id}', 1)" class="text-green-500 font-bold w-6">+</button>
                    </div>
                </div>`).join('');
        }
    });
}

function startCheckout() {
    if (cart.length === 0) return showToast("Carrinho vazio!");
    if (!isStoreOpen) return showToast("Loja Fechada!");
    const cartModal = document.getElementById('cart-modal');
    if(cartModal && !cartModal.classList.contains('hidden')) toggleCart();
    const checkoutModal = document.getElementById('checkout-modal');
    if(!checkoutModal) { window.location.href = 'index.html?action=checkout'; return; }
    checkoutModal.classList.remove('hidden'); showStep('step-service');
}
function closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); }
function showStep(stepId) {
    ['step-service', 'step-address', 'step-payment-method'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(stepId).classList.remove('hidden');
    if (stepId === 'step-address') checkSavedAddress();
}
function selectService(type) {
    currentOrder.method = type;
    const f = document.getElementById('delivery-fields');
    if (type === 'retirada') f.classList.add('hidden'); else f.classList.remove('hidden');
    showStep('step-address');
}
function checkSavedAddress() {
    const s = localStorage.getItem('tropyberry_user');
    if (s) {
        const d = JSON.parse(s);
        document.getElementById('input-name').value = d.name || ''; document.getElementById('input-phone').value = d.phone || '';
        document.getElementById('input-street').value = d.street || ''; document.getElementById('input-number').value = d.number || '';
        document.getElementById('input-district').value = d.district || ''; document.getElementById('input-comp').value = d.comp || '';
        if(d.street) { document.getElementById('saved-address-card').classList.remove('hidden'); document.getElementById('saved-address-card').classList.add('flex'); document.getElementById('saved-address-text').innerText = `${d.street}, ${d.number}`; }
    }
}
function useSavedAddress() { goToPaymentMethod(); }
function goToPaymentMethod() {
    const n = document.getElementById('input-name').value; const p = document.getElementById('input-phone').value;
    if (!n || !p) return showToast("Preencha Nome e Telefone.");
    currentOrder.customer = { name: n, phone: p };
    if (currentOrder.method === 'delivery') {
        const s = document.getElementById('input-street').value; const num = document.getElementById('input-number').value; 
        const d = document.getElementById('input-district').value; const c = document.getElementById('input-comp').value;
        if (!s || !num) return showToast("Endereço incompleto.");
        currentOrder.customer.address = `${s}, ${num} - ${d} (${c})`;
        localStorage.setItem('tropyberry_user', JSON.stringify({ name: n, phone: p, street: s, number: num, district: d, comp: c }));
    } else {
        currentOrder.customer.address = "Retirada na Loja";
        localStorage.setItem('tropyberry_user', JSON.stringify({ name: n, phone: p }));
    }
    showStep('step-payment-method');
}
async function processPayment() {
    if(!db) return showToast("Erro de conexão.", true);
    const btn = document.getElementById('btn-generate-pay');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; btn.disabled = true;
    const method = document.querySelector('input[name="pay-method"]:checked').value;
    const total = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    try {
        const orderRef = await addDoc(collection(db, "pedidos"), { customer: currentOrder.customer, items: cart, method: currentOrder.method, total, status: 'Aguardando', createdAt: serverTimestamp() });
        const response = await fetch("https://us-central1-tropiberry.cloudfunctions.net/criarPagamento", {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart, playerInfo: currentOrder.customer, total, method })
        });
        const data = await response.json();
        if (data.success) {
            closeCheckout(); saveLastOrder(orderRef.id);
            if (data.type === 'pix') openOrderScreen(orderRef?.id || 'TEMP', 'pix_pending', data.qr_code);
            else if (data.type === 'card_link') window.location.href = data.link;
        } else { alert("Erro: " + data.error); }
    } catch (error) { console.error(error); alert("Erro de conexão."); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}
async function openOrderScreen(orderId, statusType, pixCode = null) {
    const screen = document.getElementById('order-screen');
    if(!screen) return;
    screen.classList.remove('hidden');
    document.getElementById('status-order-id').innerText = orderId.slice(0, 5).toUpperCase();
    const now = new Date();
    document.getElementById('status-order-time').innerText = `${now.getHours()}:${now.getMinutes()<10?'0'+now.getMinutes():now.getMinutes()}`;
    document.getElementById('status-client-name').innerText = currentOrder.customer.name;
    document.getElementById('status-client-phone').innerText = currentOrder.customer.phone;
    document.getElementById('status-client-address').innerText = currentOrder.customer.address;
    const badge = document.getElementById('status-payment-badge');
    if (statusType === 'pix_pending') {
        badge.className = "bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full font-bold border border-orange-200";
        badge.innerText = "Aguardando Pagamento";
        if(pixCode) {
            showToast("Copie o código PIX na próxima tela!");
            const pixScreen = document.getElementById('pix-copy-paste-screen');
            if(pixScreen) pixScreen.value = pixCode;
        }
    } else {
        badge.className = "bg-green-100 text-green-600 text-xs px-3 py-1 rounded-full font-bold border border-green-200";
        badge.innerText = "Pago";
    }
    renderReceipt();
    const msg = `Pedido #${orderId.slice(0,5)}. Status?`;
    document.getElementById('btn-whatsapp-status').href = `https://wa.me/5583999999999?text=${encodeURIComponent(msg)}`;
    if (!statusMap) {
        statusMap = L.map('final-map', { zoomControl: false }).setView([-7.1195, -34.8450], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(statusMap);
    }
    setTimeout(() => statusMap.invalidateSize(), 500);
}
function renderReceipt() {
    const list = document.getElementById('receipt-items-list'); list.innerHTML = ''; let subtotal = 0;
    cart.forEach(item => {
        const t = item.price * item.quantity; subtotal += t;
        list.innerHTML += `<div class="flex justify-between items-start mb-2"><div><span class="font-bold text-gray-700">${item.quantity}x</span> <span class="text-gray-600">${item.name}</span></div><span class="text-gray-800 font-medium">R$ ${t.toFixed(2).replace('.', ',')}</span></div>`;
    });
    document.getElementById('receipt-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    document.getElementById('receipt-total').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
}
function toggleReceipt() {
    const el = document.getElementById('receipt-details'); const arr = document.getElementById('arrow-receipt');
    if (el.classList.contains('hidden')) { el.classList.remove('hidden'); arr.classList.add('rotate-180'); }
    else { el.classList.add('hidden'); arr.classList.remove('rotate-180'); }
}
function closeOrderScreen() { document.getElementById('order-screen').classList.add('hidden'); }
function switchToStatus() { openOrderScreen('STATUS', 'paid'); }
function copyPixScreen() { const inp = document.getElementById('pix-copy-paste-screen'); if(inp) { inp.select(); document.execCommand('copy'); showToast("Código PIX copiado!"); } }
function toggleCart() {
    const m = document.getElementById('cart-modal'); const p = document.getElementById('cart-panel'); const btn = document.getElementById('last-order-btn');
    if(!m) return;
    if (m.classList.contains('hidden')) { m.classList.remove('hidden'); setTimeout(() => p.classList.remove('translate-x-full'), 10); if(btn) btn.classList.add('hidden'); } 
    else { p.classList.add('translate-x-full'); setTimeout(() => m.classList.add('hidden'), 300); checkLastOrder(); }
}
function saveLastOrder(id) { localStorage.setItem('tropyberry_last_order', JSON.stringify({ id, timestamp: Date.now() })); checkLastOrder(); }
function checkLastOrder() {
    const saved = localStorage.getItem('tropyberry_last_order'); const btn = document.getElementById('last-order-btn'); const cart = document.getElementById('cart-modal');
    if (cart && !cart.classList.contains('hidden')) { if(btn) btn.classList.add('hidden'); return; }
    if (saved && btn) { const d = JSON.parse(saved); if ((Date.now() - d.timestamp) / 1000 / 60 < 15) btn.classList.remove('hidden'); else { btn.classList.add('hidden'); localStorage.removeItem('tropyberry_last_order'); } } else if (btn) btn.classList.add('hidden');
}
setInterval(checkLastOrder, 60000);