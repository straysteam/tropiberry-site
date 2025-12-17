// cardapio.js - Lista de produtos para Importação Inicial no Firebase
export const products = [
    // --- DESTAQUES ---
    { 
        id: 1, 
        name: "Açaí Tradicional", 
        description: "Copo 500ml com granola, banana e leite em pó.", 
        price: 15.00, 
        originalPrice: 18.00, 
        image: "https://images.unsplash.com/photo-1590301157890-4810c8765923?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60", 
        category: "destaques",
        tags: ["Mais Vendido", "Promoção"] 
    },
    { 
        id: 2, 
        name: "Açaí com Morango", 
        description: "Copo 500ml com morango fresco, calda de morango e leite condensado.", 
        price: 18.50, 
        originalPrice: null, 
        image: "https://images.unsplash.com/photo-1490885578174-acda8905c2c6?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60", 
        category: "destaques",
        tags: [] 
    },
    { 
        id: 3, 
        name: "Barca de Açaí", 
        description: "Barca média (750ml) com 5 acompanhamentos à sua escolha.", 
        price: 35.00, 
        originalPrice: 40.00,
        image: "https://images.unsplash.com/photo-1580915411954-282cb1b0d780?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60", 
        category: "destaques",
        tags: ["Para Compartilhar"]
    },

    // --- MONTE SEU COPO ---
    { 
        id: 4, 
        name: "Copo Pequeno (300ml)", 
        description: "Açaí puro, escolha seus adicionais na observação.", 
        price: 10.00, 
        originalPrice: null,
        image: "https://via.placeholder.com/500x400/591c36/ffffff?text=300ml", 
        category: "monte", 
        tags: [] 
    },
    { 
        id: 5, 
        name: "Copo Médio (500ml)", 
        description: "Açaí puro, escolha seus adicionais na observação.", 
        price: 14.00, 
        originalPrice: null,
        image: "https://via.placeholder.com/500x400/591c36/ffffff?text=500ml", 
        category: "monte", 
        tags: [] 
    },
    { 
        id: 6, 
        name: "Copo Grande (700ml)", 
        description: "Açaí puro, escolha seus adicionais na observação.", 
        price: 18.00, 
        originalPrice: null,
        image: "https://via.placeholder.com/500x400/591c36/ffffff?text=700ml", 
        category: "monte", 
        tags: [] 
    },

    // --- COMBOS ---
    { 
        id: 7, 
        name: "Combo Casal", 
        description: "2 Copos 500ml completos + 1 Água Mineral.", 
        price: 32.00, 
        originalPrice: 38.00, 
        image: "https://via.placeholder.com/500x400/591c36/ffffff?text=Combo+Casal", 
        category: "combos", 
        tags: ["Ofertão"] 
    },
    { 
        id: 8, 
        name: "Combo Família", 
        description: "1 Barca Grande + 3 Refrigerantes Lata.", 
        price: 55.00, 
        originalPrice: null,
        image: "https://via.placeholder.com/500x400/591c36/ffffff?text=Combo+Família", 
        category: "combos", 
        tags: [] 
    }
];

// Função placeholder (não é usada, mas evita erro se algum arquivo antigo importar)
export function renderProducts() {}