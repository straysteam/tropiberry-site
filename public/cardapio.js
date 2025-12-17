// --- DADOS DOS PRODUTOS COM CATEGORIAS ---
export const products = [
    // --- DESTAQUES ---
    { 
        id: 1, 
        category: "destaques",
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 2, 
        category: "destaques",
        name: "Copo da Felicidade", 
        description: "Camadas de açaí, creme de ninho, nutella e brownie.", 
        price: 18.50, 
        image: "https://images.unsplash.com/photo-1623592534887-1959779df30f?ixlib=rb-4.0.3&w=600&q=80" 
    },
       { 
        id: 3, 
        category: "destaques",
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 4, 
        category: "destaques",
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 5, 
        category: "destaques",
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 6, 
        category: "destaques",
        name: "Barca Clássica", 
        description: "Açaí puro, banana, morango, leite condensado e granola.", 
        price: 25.00, 
        image: "https://images.unsplash.com/photo-1596560548464-f010549b84d7?ixlib=rb-4.0.3&w=600&q=80" 
    },

    // --- MONTE SEU COPO (Opções Base) ---
    { 
        id: 10, 
        category: "monte",
        name: "Copo 300ml", 
        description: "Escolha até 3 acompanhamentos grátis.", 
        price: 12.00, 
        image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 11, 
        category: "monte",
        name: "Copo 500ml", 
        description: "Escolha até 4 acompanhamentos grátis.", 
        price: 16.00, 
        image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?ixlib=rb-4.0.3&w=600&q=80" 
    },

    // --- COMBOS ---
    { 
        id: 20, 
        category: "combos",
        name: "Combo Casal", 
        description: "2 Copos de 500ml + 1 Refrigerante 1L.", 
        price: 35.00, 
        image: "https://images.unsplash.com/photo-1590301157890-4810ed352733?ixlib=rb-4.0.3&w=600&q=80" 
    },
    { 
        id: 21, 
        category: "combos",
        name: "Combo Família", 
        description: "1 Barca Gigante + 3 Refrigerantes Lata.", 
        price: 55.00, 
        image: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?ixlib=rb-4.0.3&w=600&q=80" 
    }
];

// --- FUNÇÃO DE RENDERIZAÇÃO (Genérica) ---
export function renderProducts(gridId, categoryFilter = null) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    
    let itemsToShow = [];

    // Lógica: 
    // 1. Se tiver filtro (ex: clicou no botão "Combos"), mostra só aquela categoria.
    // 2. Se NÃO tiver filtro (é a carga inicial da Home), pega 'destaques' e limita a 6.
    // 3. Se for a página cardapio.html (chamada com null no script), mostra tudo ou filtra lá.

    if (categoryFilter) {
        // Se tem categoria específica (ex: clicou no botão ou é filtro da home)
        itemsToShow = products.filter(p => p.category === categoryFilter);
    } else {
        // Se não passou filtro, assume que é para mostrar tudo (Cardápio Completo)
        itemsToShow = products;
    }

    // TRUQUE DO LIMITE NA HOME
    // Se estivermos renderizando na Home (grid existe) E o filtro for 'destaques' (padrão da home)
    // Limitamos a 6 itens.
    const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
    
    if (isHomePage && categoryFilter === 'destaques') {
        itemsToShow = itemsToShow.slice(0, 6); // Pega apenas os 6 primeiros
    }

    grid.innerHTML = itemsToShow.map(product => `
        <div class="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition border border-gray-100 flex flex-col h-full">
            <div class="h-40 overflow-hidden relative group">
                <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
                <button onclick="addToCart(${product.id}, this)" class="absolute bottom-2 right-2 bg-yellow-400 text-cyan-900 w-10 h-10 rounded-full flex items-center justify-center shadow-lg font-bold hover:bg-yellow-300 hover:scale-110 transition z-10">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <div class="p-4 flex flex-col flex-grow">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="font-bold text-cyan-900 text-sm leading-tight">${product.name}</h4>
                    <span class="font-bold text-cyan-600 text-sm whitespace-nowrap ml-2">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <p class="text-gray-500 text-xs line-clamp-2 mt-1">${product.description}</p>
            </div>
        </div>
    `).join('');
}