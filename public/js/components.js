
export function renderizarHeaderGlobal() {
    const headerPlaceholder = document.getElementById('global-header-placeholder');
    if (!headerPlaceholder) return;

    const headerHTML = `
    <header class="bg-cyan-600 text-white relative shadow-lg z-40 pb-16 sticky top-0 transition-all duration-300">
        <div class="container mx-auto px-4 py-4 flex justify-between items-center relative z-10">
            <div class="flex items-center gap-2 cursor-pointer" onclick="window.location.href='index.html'">
                <div class="bg-yellow-400 p-2 rounded-full text-cyan-800"><i class="fas fa-ice-cream text-2xl"></i></div>
                <h1 class="hidden md:block text-3xl font-bold tracking-wide brand-font text-yellow-300 drop-shadow-md">TROPIBERRY</h1>
            </div>
            
            <div class="flex items-center gap-3 relative">
                <div id="auth-buttons-container" class="flex items-center gap-2 mr-2"></div>
                
                <button id="store-status-btn" onclick="toggleStoreStatus()" class="px-3 py-1 rounded-full text-xs font-bold border border-white transition flex items-center gap-2 cursor-pointer hover:scale-105">
                    <div id="status-indicator" class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span id="status-text">ABERTO</span>
                </button>
                <button onclick="toggleInfoModal()" class="text-white hover:text-yellow-300 text-xl transition p-2"><i class="fas fa-info-circle"></i></button>
                
                <div class="relative">
                    <button onclick="toggleCart()" class="relative bg-yellow-400 text-cyan-900 px-4 py-2 rounded-full font-bold hover:bg-yellow-300 transition shadow-md flex items-center gap-2 z-20">
                        <i class="fas fa-shopping-cart"></i>
                        <span class="hidden md:inline">Carrinho</span>
                        <span id="cart-count" class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full border-2 border-white">0</span>
                    </button>

                    <button id="last-order-btn" onclick="abrirUltimoPedido()" class="hidden absolute top-12 right-0 w-32 bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg hover:bg-cyan-400 transition flex items-center justify-between gap-1 border border-cyan-400 animate-bounce z-10">
                        <span>Último pedido</span> 
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="wave-container">
            <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" class="shape-fill"></path>
            </svg>
        </div>
    </header>
    `;

    headerPlaceholder.innerHTML = headerHTML;
}