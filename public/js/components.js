export function renderizarHeaderGlobal() {
    const headerPlaceholder = document.getElementById('global-header-placeholder');
    if (!headerPlaceholder) return;

    const headerHTML = `
    <header class="bg-cyan-600 text-white relative shadow-lg z-50 sticky top-0 transition-all duration-300">
        <div class="container mx-auto px-4 py-3 flex justify-between items-center relative z-10">
            
            <div class="flex items-center gap-2 cursor-pointer" onclick="window.location.href='index.html'">
                <img src="img/logosf.png" alt="Logo" class="h-10 md:h-12 w-auto object-contain">
                <h1 class="block text-lg md:text-2xl font-bold tracking-wide brand-font text-yellow-300 drop-shadow-md">TROPIBERRY</h1>
            </div>

            <div class="flex items-center gap-4 relative">
                
                <div id="desktop-auth-area" class="hidden md:flex items-center gap-3">
                    </div>

                <button onclick="toggleCart()" class="hidden md:flex bg-yellow-400 text-cyan-900 px-4 py-2 rounded-full font-bold hover:bg-yellow-300 transition shadow-md items-center gap-2 relative">
                    <i class="fas fa-shopping-cart"></i>
                    <span>Carrinho</span>
                    <span id="cart-count-desktop" class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full border-2 border-white hidden">0</span>
                </button>

                <div id="user-menu-content" class="hidden fixed md:absolute z-[70] bg-white shadow-2xl overflow-hidden transition-all duration-300
                    bottom-0 left-0 w-full rounded-t-3xl border-t border-gray-200
                    md:bottom-auto md:left-auto md:top-full md:right-0 md:mt-2 md:w-72 md:rounded-xl md:border md:border-gray-100">
                    
                    <div class="bg-cyan-600 p-4 text-white flex items-center gap-4">
                        <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="overflow-hidden">
                            <p id="menu-user-name" class="font-bold text-lg truncate">Visitante</p>
                            <p id="menu-user-email" class="text-xs opacity-80 truncate">Faça login</p>
                        </div>
                    </div>

                    <div class="p-2 text-gray-700">
                        <div id="menu-guest-options" class="hidden space-y-2 p-2">
                            <a href="login.html" class="block w-full bg-cyan-600 text-white text-center py-3 rounded-lg font-bold">Entrar</a>
                            <a href="cadastro.html" class="block w-full border border-cyan-600 text-cyan-600 text-center py-3 rounded-lg font-bold">Criar Conta</a>
                        </div>

                        <div id="menu-logged-options" class="hidden">
                            <button onclick="abrirMeusPedidos()" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition rounded-lg text-left">
                                <div class="w-8 h-8 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center"><i class="fas fa-history"></i></div>
                                <span class="font-medium text-gray-700">Meus Pedidos</span>
                            </button>
                            
                            <div id="menu-admin-links" class="hidden border-t border-gray-100 mt-1 pt-1">
                                <a href="dashboard.html" class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-cyan-800 font-bold transition rounded-lg">
                                    <div class="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center"><i class="fas fa-chart-pie"></i></div>
                                    <span>Dashboard</span>
                                </a>
                                <a href="admin.html" class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-cyan-800 font-bold transition rounded-lg">
                                    <div class="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center"><i class="fas fa-cog"></i></div>
                                    <span>Painel Admin</span>
                                </a>
                            </div>

                            <div class="border-t border-gray-100 mt-2 pt-2">
                                <button onclick="fazerLogout()" class="w-full text-left flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 font-bold transition rounded-lg">
                                    <div class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center"><i class="fas fa-sign-out-alt"></i></div>
                                    <span>Sair da Conta</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div> </div>
        </div>
    </header>

    <div id="user-menu-overlay" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] hidden transition-opacity" onclick="toggleUserMenu()"></div>
    
    <nav class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 flex justify-around items-center py-3 pb-safe">
        <a href="index.html" class="flex flex-col items-center text-gray-400 hover:text-cyan-600 ${window.location.pathname.includes('index') ? 'text-cyan-600 font-bold' : ''}">
            <i class="fas fa-home text-xl mb-1"></i>
            <span class="text-[10px]">Início</span>
        </a>
        
        <a href="cardapio.html" class="flex flex-col items-center text-gray-400 hover:text-cyan-600 ${window.location.pathname.includes('cardapio') ? 'text-cyan-600 font-bold' : ''}">
            <i class="fas fa-utensils text-xl mb-1"></i>
            <span class="text-[10px]">Cardápio</span>
        </a>

        <div class="relative -top-6">
            <button onclick="toggleCart()" class="w-14 h-14 bg-cyan-600 rounded-full text-white shadow-lg flex items-center justify-center border-4 border-gray-50 transform active:scale-95 transition">
                <i class="fas fa-shopping-basket text-xl"></i>
                <span id="cart-count-mobile" class="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-cyan-600 hidden">0</span>
            </button>
        </div>

        <button onclick="toggleUserMenu()" class="flex flex-col items-center text-gray-400 hover:text-cyan-600">
            <i class="fas fa-user text-xl mb-1"></i>
            <span class="text-[10px]">Perfil</span>
        </button>

        <button onclick="toggleInfoModal()" class="flex flex-col items-center text-gray-400 hover:text-cyan-600">
            <i class="fas fa-info-circle text-xl mb-1"></i>
            <span class="text-[10px]">Ajuda</span>
        </button>
    </nav>
    <div class="md:hidden h-20"></div>
    `;

    headerPlaceholder.innerHTML = headerHTML;
}