console.log("Arquivo cardapio.js carregado com sucesso!");

// --- DADOS DOS PRODUTOS ---
export const products = [
    { 
        id: 1, 
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 2, 
        name: "Copo da Felicidade", 
        description: "Camadas de açaí, creme de ninho, nutella e brownie.", 
        price: 18.50, 
        image: "https://images.unsplash.com/photo-1623592534887-1959779df30f?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 3, 
        name: "Tigela Tropical", 
        description: "Açaí batido com banana, kiwi, manga e mel.", 
        price: 22.00, 
        image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 4, 
        name: "Vitaminado", 
        description: "Vitamina de açaí com paçoca e guaraná em pó.", 
        price: 15.00, 
        image: "https://images.unsplash.com/photo-1610612663363-d1df52b57574?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 5, 
        name: "Barca Gigante", 
        description: "1kg de açaí com 5 acompanhamentos para dividir.", 
        price: 45.00, 
        image: "https://images.unsplash.com/photo-1590301157890-4810ed352733?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 6, 
        name: "Zero Açúcar", 
        description: "Açaí orgânico, adoçado com stévia.", 
        price: 20.00, 
        image: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?ixlib=rb-4.0.3&w=600&q=80" 
    }
];

// --- FUNÇÃO QUE DESENHA O HTML DOS PRODUTOS ---
export function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) {
        console.error("ERRO CRÍTICO: Elemento 'product-grid' não encontrado no HTML.");
        return;
    }
    
    console.log("Renderizando", products.length, "produtos no cardápio...");

    grid.innerHTML = products.map(product => `
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition transform hover:-translate-y-1 border border-cyan-50">
            <div class="h-48 overflow-hidden relative group">
                <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
                <button onclick="addToCart(${product.id}, this)" class="absolute bottom-3 right-3 bg-yellow-400 text-cyan-900 w-12 h-12 rounded-full flex items-center justify-center shadow-lg font-bold hover:bg-yellow-300 hover:scale-110 transition z-10">
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