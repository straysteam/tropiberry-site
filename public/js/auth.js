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

const firebaseConfig = {
    apiKey: "AIzaSyD9j8xNgkb3l1YBQ0vG0Y9b6Am-3c8hZgE",
    authDomain: "tropiberry.firebaseapp.com",
    projectId: "tropiberry",
    storageBucket: "tropiberry.firebasestorage.app",
    messagingSenderId: "189248026578",
    appId: "1:189248026578:web:dac33920f93edba0adba0b",
    measurementId: "G-P1MLB08TZ8"
};

// Inicialização (Removido o nome "authApp" para evitar conflito com outras partes do site)
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Descobre se estamos no App para manter o parâmetro ?platform=app nos links
const isApp = localStorage.getItem('isFromTropiApp') === 'true' || window.location.search.includes('platform=app');
const appParam = isApp ? "?platform=app" : "";

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
    try {
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            await setDoc(userRef, {
                email: user.email,
                nome: user.displayName || user.email.split('@')[0],
                admin: false, 
                criadoEm: serverTimestamp()
            });
        }
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
        alert("Erro ao cadastrar: " + error.message);
    }
}

export async function fazerLogin(email, senha) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        await salvarUsuarioNoBanco(userCredential.user);
        window.location.href = "index.html" + appParam;
    } catch (error) {
        alert("Email ou senha incorretos.");
    }
}

export async function loginComGoogle() {
    try {
        // Se estiver no celular (WebView), usa Redirect. Se estiver no PC, usa Popup (melhor UX).
        if (isApp) {
            await signInWithRedirect(auth, googleProvider);
        } else {
            const result = await signInWithPopup(auth, googleProvider);
            await salvarUsuarioNoBanco(result.user);
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Erro Google:", error);
    }
}

export async function recuperarSenha(email) {
    if(!email) {
        alert("Digite seu e-mail primeiro.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        alert("E-mail de redefinição enviado!");
    } catch (error) {
        alert("Erro: " + error.message);
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
            // Se o usuário está logado E a URL atual for uma página de "sucesso" do Google ou login
            // Nós forçamos ele a voltar para a Home
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