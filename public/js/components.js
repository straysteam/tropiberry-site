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

                <button onclick="toggleInfoModal()" class="hidden md:flex items-center gap-2 text-white hover:text-yellow-300 transition font-bold text-sm ml-2">
                    <i class="fas fa-info-circle text-lg"></i> <span>Ajuda</span>
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

export function MesaCard(num, ambiente, order = null) {
    const isOccupied = order !== null;
    
    let statusStyles = {
        bg: 'bg-white',
        border: 'border-gray-200',
        icon: '<i class="fas fa-chair text-gray-300 text-3xl"></i>',
        text: 'text-green-600',
        label: 'Livre',
        extra: ''
    };

    if (isOccupied) {
        statusStyles = {
            bg: 'bg-red-50',
            border: 'border-red-500',
            icon: '<i class="fas fa-utensils text-red-500 text-3xl"></i>',
            text: 'text-red-600',
            label: 'Ocupada',
            extra: `
                <div class="text-center mt-2 w-full pt-2 border-t border-red-200">
                    <p class="text-sm font-bold text-gray-800">R$ ${parseFloat(order.total || 0).toFixed(2).replace('.', ',')}</p>
                    <p class="text-[10px] text-gray-400">Pedido #${order.id.slice(-4).toUpperCase()}</p>
                </div>`
        };
    }

    return `
        <div onclick="window.abrirMesaPDV(${num})" 
             class="table-card relative p-4 rounded-2xl border-2 ${statusStyles.border} ${statusStyles.bg} flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition transform hover:-translate-y-1 h-48">
            
            <div class="absolute top-2 left-3 font-bold text-gray-400 text-[10px] uppercase tracking-wider">${ambiente || 'Salão'}</div>
            <div class="absolute top-2 right-3 font-bold text-gray-800 text-sm">#${num}</div>
            
            <div class="mb-3">${statusStyles.icon}</div>
            
            <h4 class="font-bold text-gray-700 text-lg mb-1">Mesa ${num}</h4>
            <span class="text-xs font-bold ${statusStyles.text} uppercase tracking-wider bg-white/50 px-2 py-1 rounded-full">
                ${statusStyles.label}
            </span>

            ${statusStyles.extra}
        </div>
    `;
}

export function BotaoNovaMesa() {
    return `
        <div onclick="alert('Funcionalidade: Adicionar nova mesa ao mapa')" 
             class="h-48 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-400 hover:text-cyan-600 transition group">
            <div class="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-cyan-100 flex items-center justify-center mb-2 transition">
                <i class="fas fa-plus text-xl"></i>
            </div>
            <span class="text-xs font-bold">Adicionar Mesa</span>
        </div>
    `;
}

// Mantendo sua função original, mas a abaixo (garantirModaisGlobais) é a que o script.js usa
export function injetarModaisGlobais() {
    if (document.getElementById('my-orders-modal')) return;

    const modaisHTML = `
        <div id="my-orders-modal" class="fixed inset-0 bg-gray-900 bg-opacity-90 hidden z-[80] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm">
            <div class="bg-white w-full h-full md:h-auto md:max-w-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div class="bg-cyan-600 p-5 border-b flex justify-between items-center text-white">
                    <h3 class="font-bold text-lg flex items-center gap-2"><i class="fas fa-history"></i> Meus Pedidos</h3>
                    <button onclick="document.getElementById('my-orders-modal').classList.add('hidden')" class="hover:text-yellow-300 transition text-2xl">&times;</button>
                </div>
                <div id="my-orders-list" class="flex-grow overflow-y-auto p-4 bg-gray-50 space-y-4 min-h-[300px]">
                    </div>
            </div>
        </div>

        <div id="order-screen" class="fixed inset-0 z-[90] hidden bg-white md:bg-gray-100 overflow-y-auto">
            <div class="max-w-lg mx-auto bg-white min-h-screen shadow-xl relative">
                <button onclick="document.getElementById('order-screen').classList.add('hidden')" class="absolute top-4 right-4 z-20 bg-red-500 text-white p-2 rounded-full">
                    <i class="fas fa-times"></i>
                </button>
                <div id="status-content">
                    </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modaisHTML);
}

// Esta é a função que o script.js está chamando
export function garantirModaisGlobais() {
    // 1. Modais de Pedido e Histórico
    if (!document.getElementById('my-orders-modal')) {
        const modaisHTML = `
            <div id="my-orders-modal" class="fixed inset-0 bg-gray-900 bg-opacity-90 hidden z-[80] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm">
                <div class="bg-white w-full h-full md:h-auto md:max-w-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    <div class="bg-cyan-600 p-5 border-b flex justify-between items-center text-white">
                        <h3 class="font-bold text-lg flex items-center gap-2"><i class="fas fa-history"></i> Meus Pedidos</h3>
                        <button onclick="fecharMeusPedidos()" class="hover:text-yellow-300 transition text-2xl">&times;</button>
                    </div>
                    <div id="my-orders-list" class="flex-grow overflow-y-auto p-4 bg-gray-50 space-y-4 min-h-[300px]">
                        <p class="text-center text-gray-400 py-10">Carregando...</p>
                    </div>
                </div>
            </div>

            <div id="order-screen" class="fixed inset-0 z-[90] hidden bg-white md:bg-gray-100 overflow-y-auto">
                <div class="max-w-lg mx-auto bg-white min-h-screen shadow-xl relative p-6">
                    <button onclick="closeOrderScreen()" class="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full z-20 shadow-lg"><i class="fas fa-times"></i></button>
                    <div id="status-content">
                        <div class="text-center py-20"><i class="fas fa-spinner fa-spin text-3xl text-cyan-600"></i></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modaisHTML);
    }

    // 2. Modal de Informações (AJUDA) - Injetado caso não exista na página (ex: cardapio.html)
    if (!document.getElementById('info-modal')) {
        const infoModalHTML = `
        <div id="info-modal" class="fixed inset-0 bg-black/60 z-50 hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                <div class="relative h-32 bg-cyan-900 flex items-center justify-center overflow-hidden">
                    <img src="https://via.placeholder.com/400x200/0e7490/ffffff?text=TropiBerry" alt="Fachada TropiBerry" class="absolute inset-0 w-full h-full object-cover opacity-50">
                    <div class="relative z-10 text-center p-4">
                        <h2 class="text-2xl font-bold text-yellow-400 mb-1 drop-shadow-lg">TropiBerry Açaí</h2>
                        <p class="text-white text-sm drop-shadow-md">O melhor sabor da cidade!</p>
                    </div>
                    
                    <div class="absolute top-2 right-2 flex gap-2 z-20">
                        <button onclick="compartilharSite()" class="text-white bg-white/20 hover:bg-white/40 rounded-full w-8 h-8 flex items-center justify-center transition" title="Compartilhar">
                            <i class="fas fa-share-alt text-sm"></i>
                        </button>
                        <button onclick="toggleInfoModal()" class="text-white bg-black/30 hover:bg-black/50 rounded-full w-8 h-8 flex items-center justify-center transition">
                            <i class="fas fa-times text-sm"></i>
                        </button>
                    </div>
                </div>

                <div class="p-6 space-y-5">
                    <div class="space-y-3">
                        <div class="flex items-start gap-3">
                            <i class="fas fa-map-marker-alt text-cyan-900 text-lg mt-1 w-6 text-center"></i>
                            <div>
                                <h4 class="font-bold text-cyan-900 text-sm">Endereço</h4>
                                <p id="info-address" class="text-gray-600 text-sm leading-relaxed">Carregando endereço...</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <i class="fas fa-clock text-cyan-900 text-lg mt-1 w-6 text-center"></i>
                            <div>
                                <h4 class="font-bold text-cyan-900 text-sm">Horário de Funcionamento</h4>
                                <p id="info-hours" class="text-gray-600 text-sm leading-relaxed">Carregando horários...</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <i class="fas fa-phone-alt text-cyan-900 text-lg mt-1 w-6 text-center"></i>
                            <div>
                                <h4 class="font-bold text-cyan-900 text-sm">Contato</h4>
                                <p id="info-phone" class="text-gray-600 text-sm">...</p>
                            </div>
                        </div>
                    </div>

                    <div id="admin-info-actions" class="hidden border-t pt-4 mt-4">
                        <p class="text-center text-xs text-gray-400 font-bold uppercase mb-3">—— Área da Loja ——</p>
                        <div class="grid grid-cols-1 gap-3">
                            <button onclick="abrirEditorInformacoes()" class="bg-cyan-100 hover:bg-cyan-200 text-cyan-900 text-sm font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2">
                                <i class="fas fa-edit"></i> Editar Informações da Loja
                            </button>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 p-3 text-center">
                    <p class="text-xs text-gray-500">TropiBerry v2.2</p>
                </div>
            </div>
        </div>

        <div id="edit-info-modal" class="fixed inset-0 bg-black/60 z-[60] hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in-up">
                <h3 class="text-lg font-bold text-cyan-900 mb-4">Editar Informações da Loja</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-sm font-bold text-gray-700">Novo Endereço</label>
                        <textarea id="edit-address-input" rows="2" class="w-full border rounded p-2 text-sm"></textarea>
                    </div>
                    <div>
                        <label class="text-sm font-bold text-gray-700">Novos Horários</label>
                        <textarea id="edit-hours-input" rows="2" class="w-full border rounded p-2 text-sm"></textarea>
                    </div>
                    <div>
                        <label class="text-sm font-bold text-gray-700">Novo Telefone</label>
                        <input type="text" id="edit-phone-input" class="w-full border rounded p-2 text-sm">
                    </div>
                </div>
                <div class="flex justify-end gap-3 mt-6">
                    <button onclick="document.getElementById('edit-info-modal').classList.add('hidden')" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition">Cancelar</button>
                    <button onclick="salvarInformacoesLoja()" class="px-4 py-2 text-sm bg-cyan-900 text-white rounded hover:bg-cyan-800 transition font-bold">Salvar (Simulação)</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', infoModalHTML);
    }
}