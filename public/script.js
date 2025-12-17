// Importações do Firebase (Usando sintaxe ES6 Modules no script type="module")
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- CONFIGURAÇÃO DO FIREBASE (VOCÊ PRECISA COLAR SEUS DADOS AQUI) ---
// Vá em console.firebase.google.com -> Criar Projeto -> Adicionar Web App
  const firebaseConfig = {
    apiKey: "AIzaSyD9j8xNgkb3l1YBQ0vG0Y9b6Am-3c8hZgE",
    authDomain: "tropiberry.firebaseapp.com",
    projectId: "tropiberry",
    storageBucket: "tropiberry.firebasestorage.app",
    messagingSenderId: "189248026578",
    appId: "1:189248026578:web:dac33920f93edba0adba0b",
    measurementId: "G-P1MLB08TZ8"
  };

// Inicializa Firebase (Tenta inicializar apenas se a config estiver correta)
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase conectado com sucesso!");
} catch (error) {
    console.error("Erro ao conectar Firebase. Verifique as configurações.", error);
}

// --- DADOS DOS PRODUTOS ---
const products = [
    { id: 1, name: "Barca Clássica", description: "Açaí puro, banana, morango, leite condensado e granola.", price: 25.00, image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" },
    { id: 2, name: "Copo da Felicidade", description: "Camadas de açaí, creme de ninho, nutella e brownie.", price: 18.50, image: "https://images.unsplash.com/photo-1623592534887-1959779df30f?ixlib=rb-4.0.3&w=600&q=80" },
    { id: 3, name: "Tigela Tropical", description: "Açaí batido com banana, kiwi, manga e mel.", price: 22.00, image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?ixlib=rb-4.0.3&w=600&q=80" },
    { id: 4, name: "Vitaminado", description: "Vitamina de açaí com paçoca e guaraná em pó.", price: 15.00, image: "https://images.unsplash.com/photo-1610612663363-d1df52b57574?ixlib=rb-4.0.3&w=600&q=80" },
    { id: 5, name: "Barca Gigante", description: "1kg de açaí com 5 acompanhamentos para dividir.", price: 45.00, image: "https://images.unsplash.com/photo-1590301157890-4810ed352733?ixlib=rb-4.0.3&w=600&q=80" },
    { id: 6, name: "Zero Açúcar", description: "Açaí orgânico, adoçado com stévia.", price: 20.00, image: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?ixlib=rb-4.0.3&w=600&q=80" }
];

// --- ESTADO GERAL ---
let cart = [];
let isStoreOpen = true; // Variável de controle da loja
let currentOrder = {
    method: '', // 'retirada' ou 'delivery'
    customer: {},
    items: [],
    total: 0
};

// Tornar funções acessíveis globalmente (necessário por causa do type="module")
window.addToCart = addToCart;
window.changeQuantity = changeQuantity;
window.toggleCart = toggleCart;
window.toggleStoreStatus = toggleStoreStatus;
window.toggleInfoModal = toggleInfoModal;
window.startCheckout = startCheckout;
window.closeCheckout = closeCheckout;
window.selectService = selectService;
window.goToPayment = goToPayment;
window.copyPix = copyPix;
window.confirmOrder = confirmOrder;

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateStoreStatusUI();
});

// --- RENDERIZAÇÃO ---
function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = products.map(product => `
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition transform hover:-translate-y-1 border border-cyan-100">
            <div class="h-48 overflow-hidden relative">
                <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover">
                <button onclick="addToCart(${product.id})" class="absolute bottom-2 right-2 bg-yellow-400 text-cyan-900 w-10 h-10 rounded-full flex items-center justify-center shadow-lg font-bold hover:bg-yellow-300 transition">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <div class="p-5">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-lg font-bold text-cyan-900">${product.name}</h4>
                    <span class="text-lg font-bold text-cyan-700">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <p class="text-gray-600 text-xs mb-0">${product.description}</p>
            </div>
        </div>
    `).join('');
}

// --- CONTROLE DA LOJA ---
function toggleStoreStatus() {
    isStoreOpen = !isStoreOpen;
    updateStoreStatusUI();
}

function updateStoreStatusUI() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('store-status-btn');
    const banner = document.getElementById('closed-banner');
    const modalBadge = document.getElementById('modal-status-badge');

    if (isStoreOpen) {
        indicator.className = "w-2 h-2 rounded-full bg-green-400 animate-pulse";
        text.innerText = "ABERTO";
        btn.className = "px-3 py-1 rounded-full text-xs font-bold border border-green-400 text-green-100 bg-green-600 transition flex items-center gap-2";
        banner.classList.add('hidden');
        if(modalBadge) {
            modalBadge.className = "bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold border border-green-200";
            modalBadge.innerText = "Aberto";
        }
    } else {
        indicator.className = "w-2 h-2 rounded-full bg-red-500";
        text.innerText = "FECHADO";
        btn.className = "px-3 py-1 rounded-full text-xs font-bold border border-red-400 text-red-100 bg-red-600 transition flex items-center gap-2";
        banner.classList.remove('hidden');
        if(modalBadge) {
            modalBadge.className = "bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-bold border border-red-200";
            modalBadge.innerText = "Fechado";
        }
    }
}

// --- CARRINHO ---
function addToCart(id) {
    if (!isStoreOpen) {
        alert("Desculpe, a loja está fechada no momento!");
        return;
    }
    const product = products.find(p => p.id === id);
    const item = cart.find(i => i.id === id);
    if (item) item.quantity++;
    else cart.push({ ...product, quantity: 1 });
    updateCartUI();
    
    // Animação no botão carrinho
    const cartBtn = document.querySelector('header .fa-shopping-cart').parentElement;
    cartBtn.classList.add('animate-bounce');
    setTimeout(() => cartBtn.classList.remove('animate-bounce'), 1000);
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
    document.getElementById('cart-count').innerText = cart.reduce((sum, i) => sum + i.quantity, 0);
    const container = document.getElementById('cart-items');
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    document.getElementById('cart-total').innerText = 'R$ ' + total.toFixed(2).replace('.', ',');

    if (cart.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 mt-10">Carrinho vazio 🍧</p>`;
    } else {
        container.innerHTML = cart.map(item => `
            <div class="flex justify-between items-center bg-white p-3 rounded shadow-sm border-l-4 border-yellow-400">
                <div>
                    <h5 class="font-bold text-cyan-900 text-sm">${item.name}</h5>
                    <p class="text-xs text-gray-500">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="flex items-center gap-2 bg-gray-100 rounded-full px-2">
                    <button onclick="changeQuantity(${item.id}, -1)" class="text-red-500 font-bold">-</button>
                    <span class="text-sm font-bold w-4 text-center">${item.quantity}</span>
                    <button onclick="changeQuantity(${item.id}, 1)" class="text-green-500 font-bold">+</button>
                </div>
            </div>
        `).join('');
    }
}

// --- LÓGICA DE CHECKOUT (O CORAÇÃO DO SISTEMA) ---

// 1. Abrir Checkout
function startCheckout() {
    if (cart.length === 0) return alert("Carrinho vazio!");
    if (!isStoreOpen) return alert("Loja Fechada!");
    
    toggleCart(); // Fecha lateral
    document.getElementById('checkout-modal').classList.remove('hidden');
    showStep('step-service');
}

function closeCheckout() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

// Utilitário para trocar telas dentro do modal
function showStep(stepId) {
    ['step-service', 'step-address', 'step-payment'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(stepId).classList.remove('hidden');
}

// 2. Escolher Serviço
function selectService(type) {
    currentOrder.method = type;
    
    const deliveryFields = document.getElementById('delivery-fields');
    if (type === 'retirada') {
        deliveryFields.classList.add('hidden');
    } else {
        deliveryFields.classList.remove('hidden');
    }
    
    showStep('step-address');
}

// 3. Validar Endereço e Ir para Pagamento
function goToPayment() {
    const name = document.getElementById('input-name').value;
    const phone = document.getElementById('input-phone').value;
    
    if (!name || !phone) return alert("Preencha nome e telefone!");

    currentOrder.customer = { name, phone };

    if (currentOrder.method === 'delivery') {
        const street = document.getElementById('input-street').value;
        const number = document.getElementById('input-number').value;
        const district = document.getElementById('input-district').value;
        const comp = document.getElementById('input-comp').value;

        if (!street || !number || !district) return alert("Preencha o endereço completo!");
        
        currentOrder.customer.address = `${street}, ${number} - ${district} (${comp})`;
    } else {
        currentOrder.customer.address = "Retirada na Loja";
    }

    // Preparar dados do PIX
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    currentOrder.total = total;
    
    document.getElementById('pix-total-value').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    
    // Gerar QR Code (API Gratuita para teste)
    // Na vida real você usaria uma API de banco ou payload estático CRC16
    const pixPayload = "00020126360014BR.GOV.BCB.PIX0114+5583999999995204000053039865802BR5913TROPYBERRY6009JOAOPESSOA62070503***6304ABCD"; 
    // ^ Payload fake para exemplo
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`;
    document.getElementById('pix-qrcode').src = qrUrl;

    showStep('step-payment');

    // Inicializar Mapa Leaflet (Correção para renderizar corretamente)
    setTimeout(() => {
        if(!window.checkoutMap) {
            window.checkoutMap = L.map('map').setView([-7.1194958, -34.8450118], 15); // Ex: Coordenadas de JP
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(window.checkoutMap);
            
            // Marcador da Loja
            L.marker([-7.1194958, -34.8450118]).addTo(window.checkoutMap)
                .bindPopup('<b>TROPYBERRY</b><br>Nossa loja aqui!').openPopup();
        }
        window.checkoutMap.invalidateSize();
    }, 100);
}

// 4. Copiar Pix
function copyPix() {
    const text = document.getElementById('pix-code-text').innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert("Código PIX copiado!");
    });
}

// 5. Finalizar e Salvar no Firebase
async function confirmOrder() {
    if(!db) {
        alert("Erro de conexão com o Banco de Dados. Pedido será enviado via WhatsApp.");
        sendToWhatsApp();
        return;
    }

    const btn = event.target;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btn.disabled = true;

    try {
        // Salvar no Firebase
        const docRef = await addDoc(collection(db, "pedidos"), {
            customer: currentOrder.customer,
            items: cart,
            method: currentOrder.method,
            total: currentOrder.total,
            status: "Pendente Pagamento",
            createdAt: serverTimestamp()
        });

        console.log("Pedido salvo ID: ", docRef.id);
        
        // Sucesso
        alert("Pedido Realizado com Sucesso! Aguardando confirmação do pagamento.");
        sendToWhatsApp(docRef.id); // Envia para o zap como backup/notificação
        
        // Reset
        cart = [];
        updateCartUI();
        closeCheckout();
        window.location.reload();

    } catch (e) {
        console.error("Erro ao adicionar documento: ", e);
        alert("Houve um erro ao salvar o pedido. Tente novamente.");
        btn.innerHTML = 'Tentar Novamente';
        btn.disabled = false;
    }
}

function sendToWhatsApp(orderId = "N/A") {
    const phoneStore = "5583999999999"; // SEU NÚMERO
    let msg = `*NOVO PEDIDO #${orderId.slice(0,5)}* 🍧\n\n`;
    msg += `*Cliente:* ${currentOrder.customer.name}\n`;
    msg += `*Tipo:* ${currentOrder.method.toUpperCase()}\n`;
    if(currentOrder.method === 'delivery') msg += `*End:* ${currentOrder.customer.address}\n`;
    msg += `\n*Itens:*\n`;
    cart.forEach(i => msg += `▪ ${i.quantity}x ${i.name}\n`);
    msg += `\n*Total:* R$ ${currentOrder.total.toFixed(2)}\n`;
    msg += `\n_Pagamento via Pix informado._`;

    window.open(`https://wa.me/${phoneStore}?text=${encodeURIComponent(msg)}`, '_blank');
}

// UI UTILS
function toggleCart() {
    const modal = document.getElementById('cart-modal');
    const panel = document.getElementById('cart-panel');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => panel.classList.remove('translate-x-full'), 10);
    } else {
        panel.classList.add('translate-x-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function toggleInfoModal() {
    const m = document.getElementById('info-modal');
    m.classList.toggle('hidden');
}