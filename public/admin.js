import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, writeBatch, getDocs, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { monitorarEstadoAuth, verificarAdminNoBanco, db as authDb } from './auth.js';
import { products as initialProducts } from './cardapio.js'; 

const db = authDb;
const storage = getStorage(authDb.app);

let allProducts = [];
let allCategories = [];
let allComplementGroups = []; // Todos os grupos existentes na loja
let currentProductAttachedGroups = []; // Grupos vinculados ao produto sendo editado agora
let currentCategoryFilter = 'all';

const AVAILABLE_TAGS = [
    "Vegano", "Vegetariano", "Orgânico", "Sem açúcar", "Sem lactose", "Sem glúten",
    "Bebida gelada", "Bebida alcoólica", "Natural", "Mais Vendido", "Promoção", "Ofertão",
    "Para Compartilhar"
];

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    monitorarEstadoAuth(async (user) => {
        // 1. Verificações de Segurança
        if (!user) { window.location.href = "login.html"; return; }
        
        const isAdmin = await verificarAdminNoBanco(user.email);
        if (!isAdmin) { alert("Acesso restrito."); window.location.href = "index.html"; return; }

        // 2. Configuração da UI do Admin
        document.getElementById('admin-user-info').innerText = `Admin: ${user.email}`;
        
        // 3. Inicia o monitoramento de dados do Firebase
        await carregarCategorias();
        iniciarMonitoramentoProdutos();
        iniciarMonitoramentoComplementos(); 
        renderTagSelector();

        // 4. (NOVO) Verifica se veio do atalho "Editar" na página do produto
        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit_product');

        if (editId) {
            console.log("Atalho de edição detectado para o ID:", editId);
            
            // Precisamos esperar a lista 'allProducts' carregar do Firebase antes de abrir o modal
            const checkLoaded = setInterval(() => {
                // allProducts é a variável global que definimos no início do arquivo
                if (allProducts.length > 0) {
                    clearInterval(checkLoaded); // Para o loop
                    abrirModalEdicao(editId);   // Abre o modal com os dados do produto
                    
                    // Limpa a URL para remover o ?edit_product=... e evitar abrir de novo ao recarregar
                    window.history.replaceState({}, document.title, "admin.html");
                }
            }, 500); // Verifica a cada meio segundo (500ms)
        }
    });
});

// === COMPLEMENTOS (NOVA LÓGICA) ===

function iniciarMonitoramentoComplementos() {
    onSnapshot(collection(db, "complementos"), (snapshot) => {
        allComplementGroups = [];
        snapshot.forEach(doc => allComplementGroups.push({ id: doc.id, ...doc.data() }));
        // Atualiza a lista lateral se estiver aberta
        renderAvailableGroupsList();
    });
}

window.abrirGerenciadorGrupos = () => {
    // Limpa form de criação
    document.getElementById('form-new-group').reset();
    document.getElementById('new-group-options').innerHTML = '';
    addOptionRow(); // Adiciona uma linha vazia por padrão
    
    renderAvailableGroupsList();
    document.getElementById('group-manager-modal').classList.remove('hidden');
}

function renderAvailableGroupsList() {
    const container = document.getElementById('available-groups-list');
    container.innerHTML = '';

    if (allComplementGroups.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400">Nenhum grupo criado.</p>';
        return;
    }

    allComplementGroups.forEach(group => {
        const isAttached = currentProductAttachedGroups.includes(group.id);
        const html = `
            <div class="flex items-center justify-between bg-white p-3 rounded border border-gray-100 shadow-sm mb-2">
                <div class="flex-1">
                    <p class="font-bold text-sm text-cyan-900">${group.title}</p>
                    <p class="text-[10px] text-gray-500">${group.options ? group.options.length : 0} opções • ${group.required ? 'Obrigatório' : 'Opcional'}</p>
                </div>
                
                <div class="flex items-center gap-2">
                    <button onclick="toggleGroupAttachment('${group.id}')" class="${isAttached ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'} text-xs font-bold px-3 py-1.5 rounded transition">
                        ${isAttached ? 'Remover' : 'Adicionar'}
                    </button>
                    
                    <button onclick="excluirGrupoComplemento('${group.id}')" class="bg-gray-100 hover:bg-red-500 hover:text-white text-gray-400 text-xs px-2 py-1.5 rounded transition" title="Excluir grupo do sistema">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        container.innerHTML += html;
    });
}

window.toggleGroupAttachment = (groupId) => {
    if (currentProductAttachedGroups.includes(groupId)) {
        currentProductAttachedGroups = currentProductAttachedGroups.filter(id => id !== groupId);
        showToast("Removido", "Grupo desvinculado do produto.");
    } else {
        currentProductAttachedGroups.push(groupId);
        showToast("Adicionado", "Grupo vinculado ao produto.");
    }
    renderAvailableGroupsList(); // Atualiza botões no modal lateral
    renderAttachedGroupsInProductModal(); // Atualiza lista no modal principal
}

function renderAttachedGroupsInProductModal() {
    const container = document.getElementById('attached-groups-list');
    container.innerHTML = '';

    if (currentProductAttachedGroups.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">Nenhum complemento.<br>Clique em Criar/Vincular acima.</div>';
        return;
    }

    currentProductAttachedGroups.forEach(groupId => {
        const group = allComplementGroups.find(g => g.id === groupId);
        if (!group) return;

        const html = `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="bg-white w-8 h-8 rounded-full flex items-center justify-center text-cyan-700 font-bold border border-gray-200">${group.options.length}</div>
                    <div>
                        <p class="font-bold text-sm text-gray-800">${group.title}</p>
                        <p class="text-xs text-gray-500">Max: ${group.max} • ${group.required ? 'Obrigatório' : 'Opcional'}</p>
                    </div>
                </div>
                <button type="button" onclick="toggleGroupAttachment('${group.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.innerHTML += html;
    });
}

// --- CRIAÇÃO DE NOVO GRUPO ---

window.addOptionRow = () => {
    const container = document.getElementById('new-group-options');
    const rowId = Date.now();
    const html = `
        <div class="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200" id="opt-row-${rowId}">
            <label class="w-8 h-8 flex-shrink-0 bg-white border border-gray-300 rounded cursor-pointer flex items-center justify-center hover:bg-gray-100 overflow-hidden">
                <input type="file" class="hidden" onchange="uploadOptionImage(this, 'img-${rowId}', 'input-${rowId}')">
                <img id="img-${rowId}" class="w-full h-full object-cover hidden">
                <i class="fas fa-camera text-gray-400 text-xs"></i>
                <input type="hidden" class="option-img-url" id="input-${rowId}">
            </label>
            
            <input type="text" class="option-name w-full border rounded p-1 text-xs" placeholder="Nome (ex: 300ml)">
            <input type="number" step="0.01" class="option-price w-20 border rounded p-1 text-xs" placeholder="R$ 0.00">
            <button type="button" onclick="document.getElementById('opt-row-${rowId}').remove()" class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

window.uploadOptionImage = async function(input, imgId, hiddenInputId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        try {
            const storageRef = ref(storage, `complementos/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            
            document.getElementById(imgId).src = url;
            document.getElementById(imgId).classList.remove('hidden');
            document.getElementById(hiddenInputId).value = url; // Salva URL
        } catch (e) {
            console.error(e);
            alert("Erro ao enviar imagem do complemento.");
        }
    }
}

window.salvarNovoGrupo = async function() {
    const title = document.getElementById('new-group-title').value;
    const required = document.getElementById('new-group-required').value === 'true';
    const max = parseInt(document.getElementById('new-group-max').value) || 1;
    const category = document.getElementById('new-group-category').value; // PEGA A CATEGORIA SELECIONADA
    
    // Coleta Opções
    const options = [];
    document.querySelectorAll('#new-group-options > div').forEach(row => {
        const name = row.querySelector('.option-name').value;
        const price = parseFloat(row.querySelector('.option-price').value) || 0;
        const image = row.querySelector('.option-img-url').value;
        if(name) options.push({ name, price, image });
    });

    if(!title || options.length === 0) return alert("Preencha o título e pelo menos uma opção.");

    try {
        // SALVA A CATEGORIA NO BANCO DE DADOS
        const docRef = await addDoc(collection(db, "complementos"), {
            title, 
            required, 
            max, 
            min: required ? 1 : 0, 
            options,
            internalCategory: category // Campo novo no Firebase
        });
        
        showToast("Sucesso", "Grupo de complementos criado!");
        
        toggleGroupAttachment(docRef.id);
        document.getElementById('group-manager-modal').classList.add('hidden');
        
    } catch(e) {
        console.error(e);
        showToast("Erro", "Erro ao salvar grupo.", true);
    }
}

// === UPLOAD IMAGEM PRINCIPAL ===
window.handleImageUpload = async function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        document.getElementById('upload-loading').classList.remove('hidden');
        try {
            const storageRef = ref(storage, `produtos/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            document.getElementById('preview-image').src = url;
            document.getElementById('preview-image').classList.remove('hidden');
            document.getElementById('icon-image').classList.add('hidden');
            document.getElementById('edit-image-url').value = url;
        } catch (error) {
            console.error(error);
            showToast("Erro", "Falha no upload", true);
        } finally {
            document.getElementById('upload-loading').classList.add('hidden');
        }
    }
}

// === CRUD PRODUTOS (ATUALIZADO) ===

window.abrirModalNovoProduto = () => {
    document.getElementById('form-produto').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('edit-image-url').value = '';
    document.getElementById('preview-image').classList.add('hidden');
    document.getElementById('icon-image').classList.remove('hidden');
    document.getElementById('modal-title').innerText = "Novo Produto";
    
    // Limpa grupos
    currentProductAttachedGroups = [];
    renderAttachedGroupsInProductModal();

    // Reseta tags
    document.querySelectorAll('.tag-item').forEach(b => {
        b.classList.remove('tag-selected');
        b.classList.add('tag-default');
    });

    mudarAba('sobre');
    document.getElementById('product-modal').classList.remove('hidden');
}

window.abrirModalEdicao = (id) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    // Campos básicos
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-category').value = p.category;
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-original-price').value = p.originalPrice || '';
    document.getElementById('edit-desc').value = p.description || '';
    
    // Imagem
    document.getElementById('edit-image-url').value = p.image || '';
    if(p.image) {
        document.getElementById('preview-image').src = p.image;
        document.getElementById('preview-image').classList.remove('hidden');
        document.getElementById('icon-image').classList.add('hidden');
    } else {
        document.getElementById('preview-image').classList.add('hidden');
        document.getElementById('icon-image').classList.remove('hidden');
    }

    // Novos Campos
    document.getElementById('edit-serves').value = p.serves || '1';
    document.getElementById('edit-weight').value = p.weight || '';
    document.getElementById('edit-unit').value = p.unit || 'ml';

    // Tags
    setSelectedTags(p.tags || []);

    // COMPLEMENTOS: Carrega IDs salvos
    currentProductAttachedGroups = p.complementIds || [];
    renderAttachedGroupsInProductModal();

    document.getElementById('modal-title').innerText = "Editar Produto";
    mudarAba('sobre');
    document.getElementById('product-modal').classList.remove('hidden');
}

window.salvarProduto = async function() {
    const id = document.getElementById('edit-id').value;
    
    // Pegamos o valor cru do input para validar se está vazio
    const priceInput = document.getElementById('edit-price').value;

    const produto = {
        name: document.getElementById('edit-name').value,
        category: document.getElementById('edit-category').value,
        price: parseFloat(priceInput), // Converte para número (0 vira 0.0)
        originalPrice: document.getElementById('edit-original-price').value ? parseFloat(document.getElementById('edit-original-price').value) : null,
        description: document.getElementById('edit-desc').value,
        image: document.getElementById('edit-image-url').value,
        tags: getSelectedTags(),
        serves: document.getElementById('edit-serves').value,
        weight: document.getElementById('edit-weight').value,
        unit: document.getElementById('edit-unit').value,
        complementIds: currentProductAttachedGroups 
    };

    // CORREÇÃO:
    // 1. Trocamos o alert por showToast com isError = true
    // 2. Mudamos a validação do preço: agora aceita 0, só bloqueia se for NaN (vazio ou texto inválido)
    if (!produto.name || priceInput === "" || isNaN(produto.price)) {
        return showToast("Erro", "Nome e Preço são obrigatórios.", true);
    }

    toggleLoading(true, "Salvando...");
    try {
        if (id) {
            await updateDoc(doc(db, "produtos", id), produto);
            showToast("Atualizado", "Produto salvo!");
        } else {
            await addDoc(collection(db, "produtos"), produto);
            showToast("Criado", "Produto criado!");
        }
        fecharModalProduto();
    } catch (e) {
        console.error(e);
        showToast("Erro", "Erro ao salvar", true);
    }
    toggleLoading(false);
}

// === FUNÇÕES AUXILIARES (MANTIDAS) ===
function iniciarMonitoramentoProdutos() {
    toggleLoading(true);
    onSnapshot(collection(db, "produtos"), (snapshot) => {
        allProducts = [];
        snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
        if (allProducts.length === 0) document.getElementById('btn-importar').classList.remove('hidden');
        else document.getElementById('btn-importar').classList.add('hidden');
        renderizarLista(currentCategoryFilter);
        toggleLoading(false);
    });
}

// Categorias
async function carregarCategorias() {
    const q = query(collection(db, "categorias"), orderBy("nome"));
    const snapshot = await getDocs(q);
    allCategories = [];
    snapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));
    if (allCategories.length === 0) await criarCategoriasPadrao();
    atualizarUIdeCategorias();
}
async function criarCategoriasPadrao() {
    const padrao = ["Destaques", "Monte seu Copo", "Combos"];
    const batch = writeBatch(db);
    padrao.forEach(nome => {
        const ref = doc(collection(db, "categorias"));
        const slug = nome.toLowerCase().replace(/ /g, '-'); 
        batch.set(ref, { nome: nome, slug: slug });
    });
    await batch.commit();
    await carregarCategorias();
}
window.adicionarNovaCategoria = function() {
    const input = document.getElementById('new-category-name');
    input.value = ''; // Limpa o campo
    document.getElementById('category-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 100); // Foca no campo para digitar direto
}

// Salva e mostra o Toast
window.confirmarNovaCategoria = async function() {
    const nome = document.getElementById('new-category-name').value.trim();
    
    if (!nome) {
        return showToast("Atenção", "Digite um nome para a categoria.", true);
    }

    toggleLoading(true, "Criando...");
    
    try {
        const slug = nome.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        await addDoc(collection(db, "categorias"), { nome, slug });
        await carregarCategorias(); // Recarrega a lista lateral
        
        showToast("Sucesso", "Categoria criada!");
        document.getElementById('category-modal').classList.add('hidden');
        
    } catch (e) {
        console.error(e);
        showToast("Erro", "Falha ao criar categoria.", true);
    } finally {
        toggleLoading(false);
    }
}
function atualizarUIdeCategorias() {
    const list = document.getElementById('category-list');
    list.innerHTML = `<button onclick="filtrarCategoria('all')" class="w-full text-left px-3 py-2 rounded text-sm font-bold bg-cyan-100 text-cyan-900 mb-1">Todos</button>`;
    const select = document.getElementById('edit-category');
    select.innerHTML = '';
    allCategories.forEach(cat => {
        list.innerHTML += `<button onclick="filtrarCategoria('${cat.slug}')" class="w-full text-left px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100 mb-1 hover:text-cyan-700">${cat.nome}</button>`;
        const option = document.createElement('option');
        option.value = cat.slug; option.innerText = cat.nome; select.appendChild(option);
    });
}

// Tags
function renderTagSelector() {
    const container = document.getElementById('tags-container');
    container.innerHTML = '';
    AVAILABLE_TAGS.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-item border rounded-full px-3 py-1 text-xs font-bold transition tag-default cursor-pointer mb-1 mr-1';
        btn.innerText = tag;
        btn.onclick = () => toggleTag(btn);
        container.appendChild(btn);
    });
}
window.toggleTag = function(btn) {
    if (btn.classList.contains('tag-selected')) { btn.classList.remove('tag-selected'); btn.classList.add('tag-default'); } 
    else { btn.classList.add('tag-selected'); btn.classList.remove('tag-default'); }
}
function getSelectedTags() {
    const selected = [];
    document.querySelectorAll('.tag-item.tag-selected').forEach(btn => selected.push(btn.innerText));
    return selected;
}
function setSelectedTags(tagsArray) {
    if (!tagsArray) return;
    document.querySelectorAll('.tag-item').forEach(btn => {
        if (tagsArray.includes(btn.innerText)) { btn.classList.add('tag-selected'); btn.classList.remove('tag-default'); } 
        else { btn.classList.remove('tag-selected'); btn.classList.add('tag-default'); }
    });
}

// UI Geral
window.filtrarCategoria = (slug) => { currentCategoryFilter = slug; renderizarLista(slug); }
window.mudarAba = (aba) => {
    document.getElementById('tab-btn-sobre').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50";
    document.getElementById('tab-btn-complementos').className = "flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50";
    document.getElementById('tab-sobre').classList.add('hidden');
    document.getElementById('tab-complementos').classList.add('hidden');
    document.getElementById(`tab-btn-${aba}`).className = "flex-1 py-3 text-sm font-bold text-cyan-700 border-b-2 border-cyan-700 bg-cyan-50";
    document.getElementById(`tab-${aba}`).classList.remove('hidden');
}
window.fecharModalProduto = () => { document.getElementById('product-modal').classList.add('hidden'); }
window.deletarProduto = async function() {
    const id = document.getElementById('edit-id').value;
    if(!confirm("Excluir produto permanentemente?")) return;
    try { await deleteDoc(doc(db, "produtos", id)); showToast("Excluído", "Produto removido"); fecharModalProduto(); } catch(e) { console.error(e); }
}
window.importarProdutosIniciais = async function() {
    if(!confirm("Importar produtos padrão?")) return;
    toggleLoading(true, "Importando...");
    const batch = writeBatch(db);
    initialProducts.forEach(p => { const { id, ...data } = p; batch.set(doc(collection(db, "produtos")), data); });
    await batch.commit();
    toggleLoading(false);
}
function renderizarLista(filter) {
    const container = document.getElementById('products-container');
    container.innerHTML = '';
    const list = filter === 'all' ? allProducts : allProducts.filter(p => p.category === filter);
    if(list.length === 0) { container.innerHTML = '<p class="text-gray-400 text-center">Nenhum produto aqui.</p>'; return; }
    list.forEach(p => {
        const html = `
            <div class="bg-white border rounded-lg shadow-sm hover:shadow-md transition flex p-4 items-center gap-4 cursor-pointer" onclick="abrirModalEdicao('${p.id}')">
                <img src="${p.image || 'https://via.placeholder.com/100'}" class="w-16 h-16 rounded object-cover bg-gray-100">
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800">${p.name}</h4>
                    <p class="text-xs text-gray-500">${p.description || ''}</p>
                    <div class="mt-1 flex gap-2">
                        <span class="text-xs bg-gray-100 px-2 rounded text-gray-600">${p.category}</span>
                        ${p.complementIds && p.complementIds.length > 0 ? `<span class="text-xs bg-blue-100 text-blue-600 px-2 rounded font-bold">${p.complementIds.length} Grupos de Adicionais</span>` : ''}
                    </div>
                </div>
                <div class="font-bold text-cyan-900">R$ ${p.price.toFixed(2)}</div>
            </div>`;
        container.innerHTML += html;
    });
}
function toggleLoading(show, text="Carregando...") {
    const el = document.getElementById('loading-overlay');
    if(show) { document.getElementById('loading-text').innerText = text; el.classList.remove('hidden'); } 
    else { el.classList.add('hidden'); }
}
function showToast(title, msg, isError = false) {
    const t = document.getElementById('toast');
    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-msg').innerText = msg;
    t.className = `fixed top-4 right-4 z-[70] shadow-xl rounded px-4 py-3 animate-fade-in-up border-l-4 ${isError ? 'bg-red-50 border-red-500 text-red-900' : 'bg-white border-green-500'}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
window.excluirGrupoComplemento = async (id) => {
    if(!confirm("⚠️ ATENÇÃO: Tem certeza que deseja excluir este grupo? \nIsso removerá esta opção de TODOS os produtos vinculados.")) return;
    
    toggleLoading(true, "Excluindo...");
    try {
        await deleteDoc(doc(db, "complementos", id));
        showToast("Sucesso", "Grupo de complementos excluído.");
    } catch (e) {
        console.error(e);
        showToast("Erro", "Não foi possível excluir.", true);
    } finally {
        toggleLoading(false);
    }
}