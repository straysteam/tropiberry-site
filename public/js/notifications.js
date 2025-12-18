import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, orderBy, query, getDoc, setDoc, addDoc, serverTimestamp, getDocs, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { monitorarEstadoAuth, verificarAdminNoBanco, db as authDb, fazerLogout } from './auth.js';

const db = authDb;
const storage = getStorage(authDb.app);

const notificationSound = document.getElementById('notif-sound');
let lastNotifCount = 0;

// === SISTEMA DE NOTIFICAÇÕES EM TEMPO REAL ===
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
                            <span class="font-bold text-sm text-gray-800">Novo Pedido #${docSnap.id.slice(0,4)}</span>
                            <span class="text-[10px] text-gray-400">${time}</span>
                        </div>
                        <p class="text-xs text-gray-600 mt-1">${order.customer?.name || 'Cliente'} - R$ ${(order.total || 0).toFixed(2)}</p>
                        <span class="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-bold mt-1 inline-block">Aguardando</span>
                    </div>
                `;
            }
        });

        const badge = document.getElementById('notif-badge');
        if (newCount > 0) {
            badge.innerText = newCount;
            badge.classList.remove('hidden');
            notifList.innerHTML = html;
            
            if (newCount > lastNotifCount) {
                try { notificationSound.play(); } catch(e) {}
            }
        } else {
            badge.classList.add('hidden');
            notifList.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs">Nenhuma notificação nova</div>';
        }
        lastNotifCount = newCount;
    });
}

// Funções de UI do Header
window.toggleNotificacoes = () => {
    const el = document.getElementById('notif-dropdown');
    el.classList.toggle('hidden');
    document.getElementById('perfil-dropdown').classList.add('hidden');
}

window.togglePerfil = () => {
    const el = document.getElementById('perfil-dropdown');
    el.classList.toggle('hidden');
    document.getElementById('notif-dropdown').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', iniciarNotificacoes);