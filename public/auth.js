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

// Inicialização
const app = initializeApp(firebaseConfig, "authApp");
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- FUNÇÃO AUXILIAR: SALVAR/GARANTIR USUÁRIO NO BANCO ---
async function salvarUsuarioNoBanco(user) {
    const userRef = doc(db, "usuarios", user.email);
    try {
        const docSnap = await getDoc(userRef);
        // Se o usuário não existe no banco, cria como 'admin: false'
        if (!docSnap.exists()) {
            await setDoc(userRef, {
                email: user.email,
                nome: user.displayName || user.email.split('@')[0],
                admin: false, 
                criadoEm: serverTimestamp()
            });
            console.log("Novo usuário registrado no Firestore.");
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
        window.location.href = "index.html";
    } catch (error) {
        console.error("Erro ao criar conta:", error);
        alert("Erro ao cadastrar: " + error.message);
    }
}

export async function fazerLogin(email, senha) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        await salvarUsuarioNoBanco(userCredential.user);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Erro ao logar:", error);
        alert("Email ou senha incorretos.");
    }
}

export async function loginComGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        await salvarUsuarioNoBanco(result.user);
        window.location.href = "index.html";
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
        // Salva no storage para o script.js mostrar o Toast após o reload
        localStorage.setItem('logout_success', 'true');
        window.location.reload(); 
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
}

export function monitorarEstadoAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

/**
 * Função para verificar se o usuário atual é admin direto no Firestore
 */
export async function verificarAdminNoBanco(email) {
    if (!email) return false;
    try {
        const docRef = doc(db, "usuarios", email);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().admin === true;
        }
        return false;
    } catch (error) {
        console.error("Erro ao consultar admin:", error);
        return false;
    }
}