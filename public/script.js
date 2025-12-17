import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyD9j8xNgkb3l1YBQ0vG0Y9b6Am-3c8hZgE",
    authDomain: "tropiberry.firebaseapp.com",
    projectId: "tropiberry",
    storageBucket: "tropiberry.firebasestorage.app",
    messagingSenderId: "189248026578",
    appId: "1:189248026578:web:dac33920f93edba0adba0b",
    measurementId: "G-P1MLB08TZ8"
};

// Inicializa Firebase
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase conectado com sucesso!");
} catch (error) {
    console.error("Erro ao conectar Firebase.", error);
}

// --- DADOS DOS PRODUTOS (Imagens bonitas do Unsplash) ---
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
let isStoreOpen = true; 
let currentOrder = {
    method: '', 
    customer: {},
    items: [],
    total: 0
};

// Tornar funções acessíveis no HTML
window.addToCart = addToCart;
window.changeQuantity = changeQuantity;
window.toggleCart = toggleCart;
window.toggleStoreStatus = toggleStoreStatus;
window.toggleInfoModal = toggleInfoModal;
window.startCheckout = startCheckout;
window.closeCheckout = closeCheckout;
window.selectService = selectService;
window.goToPayment = goToPayment;

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateStoreStatusUI();
});

// --- RENDERIZAÇÃO ---
function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = products.map(product => `
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition transform hover:-translate-y-1 border border-cyan-50">
            <div class="h-48 overflow-hidden relative group">
                <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
                <button onclick="addToCart(${product.id})" class="absolute bottom-3 right-3 bg-yellow-400 text-cyan-900 w-12 h-12 rounded-full flex items-center justify-center shadow-lg font-bold hover:bg-yellow-300 hover:scale-110 transition z-10">
                    <i class="fas fa-plus text-xl"></i>
                </button>
            </div>
            <div class="p-5">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-lg font-bold text-cyan-900 leading-tight">${product.name}</h4>
                    <span class="text-lg font-bold text-cyan-600">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <p class="text-gray-500 text-sm line-clamp-2">${product.description}</p>
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
            modalBadge.className = "bg-green-100 text-green-800 px-4 py-1.5 rounded-full text-sm font-bold border border-green-200 shadow-sm";
            modalBadge.innerText = "Aberto";
        }
    } else {
        indicator.className = "w-2 h-2 rounded-full bg-red-500";
        text.innerText = "FECHADO";
        btn.className = "px-3 py-1 rounded-full text-xs font-bold border border-red-400 text-red-100 bg-red-600 transition flex items-center gap-2";
        banner.classList.remove('hidden');
        if(modalBadge) {
            modalBadge.className = "bg-red-100 text-red-800 px-4 py-1.5 rounded-full text-sm font-bold border border-red-200 shadow-sm";
            modalBadge.innerText = "Fechado";
        }
    }
}

// --- CARRINHO ---
function addToCart(id) {
    if (!isStoreOpen) {
        alert("⚠️ A loja está fechada no momento! Voltamos amanhã.");
        return;
    }
    const product = products.find(p => p.id === id);
    const item = cart.find(i => i.id === id);
    if (item) item.quantity++;
    else cart.push({ ...product, quantity: 1 });
    updateCartUI();
    
    // Animação no botão carrinho (topo)
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
        container.innerHTML = `
            <div class="text-center py-10">
                <i class="fas fa-shopping-basket text-4xl text-gray-200 mb-3"></i>
                <p class="text-gray-400">Seu carrinho está vazio.</p>
                <button onclick="toggleCart()" class="text-cyan-600 font-bold text-sm mt-2 hover:underline">Ver Cardápio</button>
            </div>
        `;
    } else {
        container.innerHTML = cart.map(item => `
            <div class="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                <div>
                    <h5 class="font-bold text-cyan-900 text-sm">${item.name}</h5>
                    <p class="text-xs text-gray-500">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</p>
                </div>
                <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-2 py-1">
                    <button onclick="changeQuantity(${item.id}, -1)" class="text-red-500 font-bold hover:bg-white rounded w-6 h-6 transition">-</button>
                    <span class="text-sm font-bold w-4 text-center">${item.quantity}</span>
                    <button onclick="changeQuantity(${item.id}, 1)" class="text-green-500 font-bold hover:bg-white rounded w-6 h-6 transition">+</button>
                </div>
            </div>
        `).join('');
    }
}

// --- CHECKOUT ---

function startCheckout() {
    if (cart.length === 0) return alert("Seu carrinho está vazio!");
    if (!isStoreOpen) return alert("Loja Fechada! Não é possível finalizar pedidos agora.");
    
    toggleCart(); 
    document.getElementById('checkout-modal').classList.remove('hidden');
    showStep('step-service');
}

function closeCheckout() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

function showStep(stepId) {
    ['step-service', 'step-address'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(stepId).classList.remove('hidden');
}

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

// LÓGICA DE PAGAMENTO (MERCADO PAGO)
async function goToPayment() {
    const name = document.getElementById('input-name').value;
    const phone = document.getElementById('input-phone').value;
    
    if (!name || !phone) return alert("Por favor, preencha seu Nome e Telefone.");

    currentOrder.customer = { name, phone };

    if (currentOrder.method === 'delivery') {
        const street = document.getElementById('input-street').value;
        const number = document.getElementById('input-number').value;
        const district = document.getElementById('input-district').value;
        const comp = document.getElementById('input-comp').value;

        if (!street || !number || !district) return alert("Preencha o endereço completo para entrega.");
        
        currentOrder.customer.address = `${street}, ${number} - ${district} (${comp})`;
    } else {
        currentOrder.customer.address = "Retirada na Loja";
    }

    const btn = document.getElementById('btn-finalizar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btn.disabled = true;

    try {
        await salvarPedidoInicial();

        // LINK DA SUA CLOUD FUNCTION (JÁ CONFIGUREI A CORRETA)
        const functionUrl = "https://us-central1-tropiberry.cloudfunctions.net/criarPagamento";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart,
                playerInfo: currentOrder.customer
            })
        });

        const data = await response.json();

        if (data.link) {
            window.location.href = data.link; // Redireciona
        } else {
            alert("Erro ao gerar link de pagamento. Tente novamente.");
            console.error(data);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error("Erro:", error);
        alert("Erro de conexão. Verifique sua internet.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function salvarPedidoInicial() {
    if(!db) return;
    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    try {
        await addDoc(collection(db, "pedidos"), {
            customer: currentOrder.customer,
            items: cart,
            method: currentOrder.method,
            total: total,
            status: "Aguardando Pagamento (Checkout)",
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Erro ao salvar backup:", e);
    }
}

// UTILS VISUAIS
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