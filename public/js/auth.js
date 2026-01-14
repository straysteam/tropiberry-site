// auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect, 
    getRedirectResult, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9j8xNgkb3l1YBQ0vG0Y9b6Am-3c8hZgE",
    authDomain: "tropiberry.firebaseapp.com",
    projectId: "tropiberry",
    storageBucket: "tropiberry.firebasestorage.app",
    messagingSenderId: "189248026578",
    appId: "1:189248026578:web:dac33920f93edba0adba0b",
    measurementId: "G-P1MLB08TZ8"
};

// Inicialização
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Descobre se estamos no App para manter o parâmetro ?platform=app nos links
const isApp = localStorage.getItem('isFromTropiApp') === 'true' || window.location.search.includes('platform=app');
const appParam = isApp ? "?platform=app" : "";

// --- FUNÇÃO AUXILIAR: TOAST PERSONALIZADO (VISUAL TROPIBERRY) ---
function mostrarToast(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    const toastIconContainer = toast.querySelector('div:first-child');
    const toastIcon = toastIconContainer.querySelector('i');
    const toastTitle = toast.querySelector('p.font-bold');

    // Configura as cores e ícones baseados no tipo
    if (tipo === 'sucesso') {
        toast.classList.replace('border-red-500', 'border-green-500');
        toastIconContainer.classList.replace('text-red-500', 'text-green-500');
        toastIconContainer.classList.replace('bg-red-100', 'bg-green-100');
        toastIcon.className = 'fas fa-check-circle text-xl';
        toastTitle.textContent = 'Sucesso!';
    } else {
        // Se for erro, garante que as classes de erro existam
        toast.classList.remove('border-green-500');
        toast.classList.add('border-red-500');
        toastIconContainer.classList.remove('text-green-500', 'bg-green-100');
        toastIconContainer.classList.add('text-red-500', 'bg-red-100');
        toastIcon.className = 'fas fa-exclamation-circle text-xl';
        toastTitle.textContent = 'Ops!';
    }

    toastMsg.textContent = mensagem;

    // Animação para mostrar (Remove as classes de esconder do Tailwind)
    toast.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');

    // Esconde após 4 segundos
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none');
    }, 4000);
}

// --- LÓGICA DE REDIRECIONAMENTO ---
getRedirectResult(auth)
    .then(async (result) => {
        if (result && result.user) {
            await salvarUsuarioNoBanco(result.user);
            window.location.href = "index.html" + appParam;
        }
    }).catch((error) => {
        console.error("Erro ao processar redirecionamento Google:", error);
    });

// --- FUNÇÃO AUXILIAR: SALVAR/GARANTIR USUÁRIO NO BANCO ---
async function salvarUsuarioNoBanco(user) {
    const userRef = doc(db, "usuarios", user.email);
    const messaging = getMessaging();
    
    try {
        // 1. Pega o Token do Celular (Endereço para notificações Push)
        let fcmToken = null;
        try {
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            fcmToken = await getToken(messaging, { 
        serviceWorkerRegistration: registration, // Passa o registro aqui
        vapidKey: 'BGjtkuoDdlHoWtS7I5YJ75WuO0n4_z4PNDo51FHin6tIRR6m1eeMkMLJCGHreTyipAjo0p_M-rI0930HFOngxy8' 
    });
        } catch (tokenErr) {
            console.log("Notificações negadas ou erro ao obter token.");
        }

        const docSnap = await getDoc(userRef);
        
        // Dados que SEMPRE devem ser salvos/atualizados
        const dadosUsuario = {
            email: user.email,
            nome: user.displayName || user.email.split('@')[0],
            ultimoAcesso: serverTimestamp()
        };

        // Se pegamos o token de notificação, adicionamos aos dados
        if (fcmToken) {
            dadosUsuario.fcmToken = fcmToken;
        }

        if (!docSnap.exists()) {
            // Se for usuário novo
            await setDoc(userRef, {
                ...dadosUsuario,
                admin: false, 
                criadoEm: serverTimestamp()
            });
        } else {
            // Se já existir, apenas atualiza (garante que o e-mail e o token estejam lá)
            await setDoc(userRef, dadosUsuario, { merge: true });
        }

        // Salva uma cópia rápida no LocalStorage para o checkout não falhar
        localStorage.setItem('tropyberry_user_email', user.email);

    } catch (error) {
        console.error("Erro ao verificar/salvar usuário:", error);
    }
}

// --- FUNÇÕES DE EXPORTAÇÃO ---

export async function criarConta(email, senha) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        await salvarUsuarioNoBanco(userCredential.user);
        window.location.href = "index.html" + appParam;
    } catch (error) {
        mostrarToast("Erro ao cadastrar: " + error.message, 'erro');
    }
}

export async function fazerLogin(email, senha) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        await salvarUsuarioNoBanco(userCredential.user);
        window.location.href = "index.html" + appParam;
    } catch (error) {
        mostrarToast("Email ou senha incorretos.", 'erro');
    }
}

export async function loginComGoogle() {
    try {
        if (isApp) {
            await signInWithRedirect(auth, googleProvider);
        } else {
            const result = await signInWithPopup(auth, googleProvider);
            await salvarUsuarioNoBanco(result.user);
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Erro Google:", error);
        mostrarToast("Erro ao entrar com Google.", 'erro');
    }
}

export async function recuperarSenha(email) {
    if(!email) {
        mostrarToast("Digite seu e-mail no campo acima.", 'erro');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        mostrarToast("Link de redefinição enviado para o seu e-mail!");
    } catch (error) {
        let msg = "Erro ao enviar e-mail.";
        if(error.code === 'auth/user-not-found') msg = "E-mail não cadastrado.";
        mostrarToast(msg, 'erro');
    }
}

export async function fazerLogout() {
    try {
        await signOut(auth);
        localStorage.setItem('logout_success', 'true');
        window.location.href = "index.html" + appParam; 
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
}

export function monitorarEstadoAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);

        if (user) {
            const url = window.location.href;
            if (url.includes("auth/handler") || url.includes("callback") || url.includes("login.html")) {
                console.log("Login detectado, redirecionando para Home...");
                window.location.replace("index.html?platform=app");
            }
        }
    });
}

export async function verificarAdminNoBanco(email) {
    if (!email) return false;
    try {
        const docRef = doc(db, "usuarios", email);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() && docSnap.data().admin === true;
    } catch (error) { 
        return false;
    }
}