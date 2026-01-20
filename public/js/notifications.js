import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    orderBy, 
    query, 
    getDoc, 
    setDoc, 
    addDoc, 
    serverTimestamp, 
    getDocs, 
    deleteDoc, 
    limit,
    where 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { monitorarEstadoAuth, verificarAdminNoBanco, db as authDb, fazerLogout } from './auth.js';

const db = authDb;
const storage = getStorage(authDb.app);

const notificationSound = document.getElementById('notif-sound');
let lastNotifCount = 0;

// Cache para o Cliente: Evita que notificações antigas disparem ao carregar a página
let statusAnteriorPedidos = {};

// === 1. SISTEMA DE NOTIFICAÇÕES PARA A LOJA (ADMIN) ===
function iniciarNotificacoes() {
    const q = query(collection(db, "pedidos"), orderBy("createdAt", "desc"), limit(20));
    
    onSnapshot(q, (snapshot) => {
        let newCount = 0;
        const notifList = document.getElementById('notif-list');
        let html = '';

        snapshot.forEach(docSnap => {
            const order = docSnap.data();
            if (order.status === 'Aguardando') {
                newCount++;
                const time = order.createdAt ? order.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Agora';
                html += `
                    <div class="p-3 border-b hover:bg-blue-50 cursor-pointer transition" onclick="navegarPara('view-pdv-wrapper')">
                        <div class="flex justify-between items-start">
                            <span class="font-bold text-sm text-gray-800">Novo Pedido #${docSnap.id.slice(-4)}</span>
                            <span class="text-[10px] text-gray-400">${time}</span>
                        </div>
                        <p class="text-xs text-gray-600 mt-1">${order.customer?.name || 'Cliente'} - R$ ${(order.total || 0).toFixed(2)}</p>
                        <span class="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-bold mt-1 inline-block">Aguardando</span>
                    </div>
                `;
            }
        });

        const badge = document.getElementById('notif-badge');
        if (badge) {
            if (newCount > 0) {
                badge.innerText = newCount;
                badge.classList.remove('hidden');
                if (notifList) notifList.innerHTML = html;
                
                if (newCount > lastNotifCount) {
                    try { notificationSound.play(); } catch(e) {}
                }
            } else {
                badge.classList.add('hidden');
                if (notifList) notifList.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs">Nenhuma notificação nova</div>';
            }
        }
        lastNotifCount = newCount;
    });
}

// === 2. SISTEMA DE NOTIFICAÇÕES PARA O CLIENTE ===
// Esta função "escuta" apenas os pedidos do cliente logado
export function iniciarMonitoramentoPedidosCliente(emailCliente) {
    if (!emailCliente) return;

    // Filtra pedidos do cliente que mudaram para status de ação
    const q = query(
        collection(db, "pedidos"),
        where("customer.email", "==", emailCliente)
    );

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const pedido = change.doc.data();
            const pedidoId = change.doc.id;
            const statusAtual = pedido.status;

            // Se o pedido foi modificado e o status é diferente do que tínhamos no cache
            if (change.type === "modified") {
                if (statusAnteriorPedidos[pedidoId] && statusAnteriorPedidos[pedidoId] !== statusAtual) {
                    enviarAlertaCliente(statusAtual, pedidoId);
                }
            }

            // Atualiza o cache com o status atual
            statusAnteriorPedidos[pedidoId] = statusAtual;
        });
    });
}

function enviarAlertaCliente(status, id) {
    let msg = "";
    let som = true;

    switch (status) {
        case 'Em Preparo':
            msg = "Seu pedido foi aceito e está sendo preparado! 👨‍🍳";
            break;
        case 'Saiu para Entrega':
            msg = "🛵 Saiu! Seu pedido está a caminho da sua casa.";
            break;
        case 'Pronto':
            msg = "Seu pedido está pronto para retirada! 🛍️";
            break;
        case 'Finalizado':
            msg = "Pedido entregue. Bom apetite! ❤️";
            som = false; // Não tocar som ao finalizar se preferir
            break;
        case 'Cancelado':
            msg = "Infelizmente seu pedido foi cancelado pela loja. ❌";
            break;
    }

    if (msg) {
        // 1. Notificação Visual (Toast do seu script.js)
        if (window.showToast) {
            window.showToast(msg, status === 'Cancelado');
        }

        // 2. Notificação Nativa (Push do Celular/App)
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("TropiBerry Açaí", {
                body: msg,
                icon: "img/logosf.png",
                tag: id // Evita notificações duplicadas do mesmo pedido
            });
        }
        
        // 3. Som de notificação (Opcional: usa o mesmo som do admin)
        if (som) {
            try { notificationSound.play(); } catch(e) {}
        }
    }
}

// Funções de UI do Header
window.toggleNotificacoes = () => {
    const el = document.getElementById('notif-dropdown');
    if(el) {
        el.classList.toggle('hidden');
        document.getElementById('perfil-dropdown')?.classList.add('hidden');
    }
}

window.togglePerfil = () => {
    const el = document.getElementById('perfil-dropdown');
    if(el) {
        el.classList.toggle('hidden');
        document.getElementById('notif-dropdown')?.classList.add('hidden');
    }
}

// Inicializa o Admin se houver os elementos na tela
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('notif-list')) {
        iniciarNotificacoes();
    }
});

export async function pedirPermissaoNotificacao() {
    if (!("Notification" in window)) {
        console.log("Navegador não suporta notificações nativas.");
        return;
    }

    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            if (window.showToast) window.showToast("Notificações ativadas!");
        }
    }
}
// === 3. MONITOR DE FIDELIDADE (SELOS) ===
export function iniciarMonitoramentoFidelidade(emailCliente) {
    if (!emailCliente) return;

    // Escuta mudanças no documento do usuário específico
    const userRef = doc(db, "usuarios", emailCliente);

    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const selosAtuais = dados.fidelidade || 0;

            // Recupera quanto tínhamos no cache para comparar
            const selosAntigos = parseInt(localStorage.getItem('cache_selos') || "0");

            // Só dispara se o número de selos aumentou
            if (selosAtuais > selosAntigos) {
                verificarProgressoFidelidade(emailCliente);
            }

            // Atualiza o cache para a próxima mudança
            localStorage.setItem('cache_selos', selosAtuais.toString());
        }
    });
}