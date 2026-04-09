/**
 * ============================================================
 *  Azure DevOps Boards — Kanban (Vanilla JS)
 *  Persistência: localStorage
 *  Drag & Drop: API nativa HTML5
 * ============================================================
 */

// ────────────────────────────────────────────
// Constantes e Estado Inicial
// ────────────────────────────────────────────

/** Colunas fixas do board */
const COLUMNS = [
  'Fluxo de Entrada',
  'Negociação',
  'POC',
  'Desenvolvimento',
  'Teste',
  'Homologação',
  'Produção'
];

/** Cores para épicos (paleta rotativa) */
const EPIC_COLORS = [
  '#7c4dff', '#0288d1', '#e91e63', '#ff9800',
  '#4caf50', '#00bcd4', '#9c27b0', '#f44336',
  '#3f51b5', '#009688', '#ff5722', '#607d8b'
];

/** Chaves do localStorage */
const LS_EPICS = 'adb_epics';
const LS_STORIES = 'adb_stories';

// ────────────────────────────────────────────
// Helpers de persistência
// ────────────────────────────────────────────

/** Carrega dados do localStorage */
function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Salva dados no localStorage */
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/** Gera UUID v4 simples */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Formata data para exibição */
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ────────────────────────────────────────────
// Estado da aplicação
// ────────────────────────────────────────────

let epics = loadData(LS_EPICS, []);
let stories = loadData(LS_STORIES, []);

/** Callback pendente para confirmação */
let pendingConfirmAction = null;

// ────────────────────────────────────────────
// Referências DOM
// ────────────────────────────────────────────

const board = document.getElementById('board');
const searchInput = document.getElementById('searchInput');
const filterEpic = document.getElementById('filterEpic');

// Botões do header
const btnNewEpic = document.getElementById('btnNewEpic');
const btnNewStory = document.getElementById('btnNewStory');
const btnManageEpics = document.getElementById('btnManageEpics');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const fileImport = document.getElementById('fileImport');

// Modal Épico
const modalEpic = document.getElementById('modalEpic');
const modalEpicTitle = document.getElementById('modalEpicTitle');
const epicIdInput = document.getElementById('epicId');
const epicNameInput = document.getElementById('epicName');
const epicDescInput = document.getElementById('epicDesc');
const btnSaveEpic = document.getElementById('btnSaveEpic');

// Modal Gerenciar Épicos
const modalManageEpics = document.getElementById('modalManageEpics');
const epicsList = document.getElementById('epicsList');
const epicsEmpty = document.getElementById('epicsEmpty');

// Modal História
const modalStory = document.getElementById('modalStory');
const modalStoryTitle = document.getElementById('modalStoryTitle');
const storyIdInput = document.getElementById('storyId');
const storyNameInput = document.getElementById('storyName');
const storyEpicSelect = document.getElementById('storyEpic');
const storyDescInput = document.getElementById('storyDesc');
const storyStatusSelect = document.getElementById('storyStatus');
const storyEstimatedInput = document.getElementById('storyEstimated');
const storyWorkedInput = document.getElementById('storyWorked');
const commentsSection = document.getElementById('commentsSection');
const commentsList = document.getElementById('commentsList');
const commentTextInput = document.getElementById('commentText');
const btnAddComment = document.getElementById('btnAddComment');
const btnSaveStory = document.getElementById('btnSaveStory');
const btnDeleteStory = document.getElementById('btnDeleteStory');

// Modal Confirmação
const modalConfirm = document.getElementById('modalConfirm');
const confirmMsg = document.getElementById('confirmMsg');
const btnConfirmYes = document.getElementById('btnConfirmYes');

// Toast
const toastContainer = document.getElementById('toastContainer');

// ────────────────────────────────────────────
// Toast Notifications
// ────────────────────────────────────────────

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2500);
}

// ────────────────────────────────────────────
// Modais — abrir / fechar
// ────────────────────────────────────────────

function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// Fechar modais com botões [data-close]
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-close');
    closeModal(document.getElementById(modalId));
  });
});

// Fechar clicando no overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay);
  });
});

// ────────────────────────────────────────────
// Confirmação genérica
// ────────────────────────────────────────────

function confirmAction(msg, callback) {
  confirmMsg.textContent = msg;
  pendingConfirmAction = callback;
  openModal(modalConfirm);
}

btnConfirmYes.addEventListener('click', () => {
  closeModal(modalConfirm);
  if (pendingConfirmAction) {
    pendingConfirmAction();
    pendingConfirmAction = null;
  }
});

// ────────────────────────────────────────────
// Utilitário — cor do épico
// ────────────────────────────────────────────

function getEpicColor(epicId) {
  const idx = epics.findIndex(e => e.id === epicId);
  if (idx === -1) return '#555';
  return EPIC_COLORS[idx % EPIC_COLORS.length];
}

function getEpicName(epicId) {
  const epic = epics.find(e => e.id === epicId);
  return epic ? epic.title : 'Sem Épico';
}

// ────────────────────────────────────────────
// Renderização do Board
// ────────────────────────────────────────────

function renderBoard() {
  board.innerHTML = '';
  const searchTerm = searchInput.value.toLowerCase().trim();
  const filterEpicId = filterEpic.value;

  COLUMNS.forEach(colName => {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.status = colName;

    // Filtra histórias desta coluna
    let colStories = stories.filter(s => s.status === colName);

    // Filtro por épico
    if (filterEpicId) {
      colStories = colStories.filter(s => s.epicId === filterEpicId);
    }
    // Filtro por busca
    if (searchTerm) {
      colStories = colStories.filter(s => s.title.toLowerCase().includes(searchTerm));
    }

    // Total real (sem filtro de busca/épico) para o counter
    const totalInColumn = stories.filter(s => s.status === colName).length;

    // Header da coluna
    const header = document.createElement('div');
    header.className = 'column-header';
    header.innerHTML = `
      <h3>${colName}</h3>
      <span class="column-count">${totalInColumn}</span>
    `;
    col.appendChild(header);

    // Body da coluna (droppable)
    const body = document.createElement('div');
    body.className = 'column-body';
    body.dataset.status = colName;

    // Drag & Drop — eventos no container
    body.addEventListener('dragover', handleDragOver);
    body.addEventListener('dragenter', handleDragEnter);
    body.addEventListener('dragleave', handleDragLeave);
    body.addEventListener('drop', handleDrop);

    // Renderiza cards
    colStories.forEach(story => {
      body.appendChild(createCard(story));
    });

    col.appendChild(body);
    board.appendChild(col);
  });
}

/** Cria elemento de card para uma história */
function createCard(story) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = story.id;

  const epicColor = getEpicColor(story.epicId);
  const epicName = getEpicName(story.epicId);
  const commentsCount = story.comments ? story.comments.length : 0;
  const estimated = story.estimatedHours || 0;
  const worked = story.workedHours || 0;
  const pct = estimated > 0 ? Math.min((worked / estimated) * 100, 100) : 0;

  // Cor da barra de progresso
  let barColor = 'var(--accent)';
  if (pct >= 100) barColor = 'var(--danger)';
  else if (pct >= 75) barColor = 'var(--warning)';
  else if (pct >= 50) barColor = 'var(--success)';

  card.innerHTML = `
    <span class="card-epic-tag" style="background:${epicColor}">${escapeHtml(epicName)}</span>
    <div class="card-title">${escapeHtml(story.title)}</div>
    <div class="card-meta">
      <span title="Horas: ${worked}h / ${estimated}h">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${worked}h / ${estimated}h
      </span>
      <span title="${commentsCount} comentário(s)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${commentsCount}
      </span>
    </div>
    ${estimated > 0 ? `
      <div class="hours-bar">
        <div class="hours-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
    ` : ''}
  `;

  // Clique para editar
  card.addEventListener('click', () => openEditStory(story.id));

  // Drag events
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ────────────────────────────────────────────
// Drag & Drop
// ────────────────────────────────────────────

let draggedCardId = null;

function handleDragStart(e) {
  draggedCardId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedCardId);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  draggedCardId = null;
  document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  // Só remove se realmente saiu do container
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  const storyId = e.dataTransfer.getData('text/plain');
  const newStatus = this.dataset.status;
  if (!storyId || !newStatus) return;

  const story = stories.find(s => s.id === storyId);
  if (story && story.status !== newStatus) {
    story.status = newStatus;
    persist();
    renderBoard();
    showToast(`Movido para "${newStatus}"`, 'success');
  }
}

// ────────────────────────────────────────────
// Persistência & Sincronização em Tempo Real
// ────────────────────────────────────────────

/**
 * BroadcastChannel: permite que todas as abas/janelas
 * do mesmo navegador se comuniquem em tempo real.
 * Quando uma aba salva dados, notifica as outras.
 */
const syncChannel = new BroadcastChannel('adb_sync');

function persist() {
  saveData(LS_EPICS, epics);
  saveData(LS_STORIES, stories);
  // Notifica outras abas via BroadcastChannel
  syncChannel.postMessage({ type: 'sync', timestamp: Date.now() });
}

/** Recebe notificação de outra aba e recarrega dados */
syncChannel.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'sync') {
    epics = loadData(LS_EPICS, []);
    stories = loadData(LS_STORIES, []);
    refreshEpicSelectors();
    renderBoard();
    flashSyncIndicator();
  }
});

/**
 * Fallback: evento 'storage' dispara quando OUTRA aba
 * altera o localStorage (não dispara na mesma aba).
 * Cobre navegadores que não suportam BroadcastChannel.
 */
window.addEventListener('storage', (e) => {
  if (e.key === LS_EPICS || e.key === LS_STORIES) {
    epics = loadData(LS_EPICS, []);
    stories = loadData(LS_STORIES, []);
    refreshEpicSelectors();
    renderBoard();
    flashSyncIndicator();
  }
});

/** Pisca o indicador de sync ao receber atualização */
function flashSyncIndicator() {
  const dot = document.querySelector('.sync-dot');
  const label = document.querySelector('.sync-label');
  if (!dot || !label) return;
  dot.style.background = 'var(--accent)';
  label.textContent = 'Sync!';
  label.style.color = 'var(--accent)';
  setTimeout(() => {
    dot.style.background = 'var(--success)';
    label.textContent = 'Live';
    label.style.color = 'var(--success)';
  }, 1200);
}

// ────────────────────────────────────────────
// ÉPICOS — CRUD
// ────────────────────────────────────────────

/** Abre modal para novo épico */
btnNewEpic.addEventListener('click', () => {
  modalEpicTitle.textContent = 'Novo Épico';
  epicIdInput.value = '';
  epicNameInput.value = '';
  epicDescInput.value = '';
  openModal(modalEpic);
  epicNameInput.focus();
});

/** Salva épico (criar ou editar) */
btnSaveEpic.addEventListener('click', () => {
  const title = epicNameInput.value.trim();
  if (!title) {
    showToast('Informe o título do épico.', 'error');
    return;
  }

  const id = epicIdInput.value;
  if (id) {
    // Editar
    const epic = epics.find(e => e.id === id);
    if (epic) {
      epic.title = title;
      epic.description = epicDescInput.value.trim();
      showToast('Épico atualizado!', 'success');
    }
  } else {
    // Criar
    epics.push({
      id: uuid(),
      title,
      description: epicDescInput.value.trim(),
      createdAt: new Date().toISOString()
    });
    showToast('Épico criado!', 'success');
  }

  persist();
  closeModal(modalEpic);
  refreshEpicSelectors();
  renderBoard();
  renderEpicsList();
});

/** Abre modal de gerenciamento de épicos */
btnManageEpics.addEventListener('click', () => {
  renderEpicsList();
  openModal(modalManageEpics);
});

/** Renderiza lista de épicos no modal de gerenciamento */
function renderEpicsList() {
  epicsList.innerHTML = '';
  if (epics.length === 0) {
    epicsEmpty.style.display = 'block';
    return;
  }
  epicsEmpty.style.display = 'none';

  epics.forEach((epic, idx) => {
    const item = document.createElement('div');
    item.className = 'epic-item';
    item.style.borderLeftColor = EPIC_COLORS[idx % EPIC_COLORS.length];
    const storyCount = stories.filter(s => s.epicId === epic.id).length;

    item.innerHTML = `
      <div class="epic-item-info">
        <strong>${escapeHtml(epic.title)}</strong>
        <small>${escapeHtml(epic.description || 'Sem descrição')} · ${storyCount} história(s) · Criado em ${formatDate(epic.createdAt)}</small>
      </div>
      <div class="epic-item-actions">
        <button class="btn-icon" title="Editar" data-edit-epic="${epic.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" title="Excluir" data-delete-epic="${epic.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    // Editar épico
    item.querySelector('[data-edit-epic]').addEventListener('click', () => {
      closeModal(modalManageEpics);
      modalEpicTitle.textContent = 'Editar Épico';
      epicIdInput.value = epic.id;
      epicNameInput.value = epic.title;
      epicDescInput.value = epic.description || '';
      openModal(modalEpic);
    });

    // Excluir épico
    item.querySelector('[data-delete-epic]').addEventListener('click', () => {
      confirmAction(`Excluir o épico "${epic.title}" e todas as suas histórias?`, () => {
        stories = stories.filter(s => s.epicId !== epic.id);
        epics = epics.filter(e => e.id !== epic.id);
        persist();
        refreshEpicSelectors();
        renderBoard();
        renderEpicsList();
        showToast('Épico excluído.', 'info');
      });
    });

    epicsList.appendChild(item);
  });
}

// ────────────────────────────────────────────
// HISTÓRIAS — CRUD
// ────────────────────────────────────────────

/** Atualiza selects de épicos em toda a UI */
function refreshEpicSelectors() {
  // Filtro do header
  const currentFilter = filterEpic.value;
  filterEpic.innerHTML = '<option value="">Todos</option>';
  epics.forEach(e => {
    filterEpic.innerHTML += `<option value="${e.id}">${escapeHtml(e.title)}</option>`;
  });
  filterEpic.value = currentFilter;

  // Select no modal de história
  storyEpicSelect.innerHTML = '';
  epics.forEach(e => {
    storyEpicSelect.innerHTML += `<option value="${e.id}">${escapeHtml(e.title)}</option>`;
  });

  // Select de status
  storyStatusSelect.innerHTML = '';
  COLUMNS.forEach(col => {
    storyStatusSelect.innerHTML += `<option value="${col}">${col}</option>`;
  });
}

/** Abre modal para nova história */
btnNewStory.addEventListener('click', () => {
  if (epics.length === 0) {
    showToast('Crie um Épico antes de adicionar histórias.', 'error');
    return;
  }
  modalStoryTitle.textContent = 'Nova História';
  storyIdInput.value = '';
  storyNameInput.value = '';
  storyDescInput.value = '';
  storyEstimatedInput.value = 0;
  storyWorkedInput.value = 0;
  refreshEpicSelectors();
  storyStatusSelect.value = COLUMNS[0];
  commentsSection.style.display = 'none';
  btnDeleteStory.style.display = 'none';
  openModal(modalStory);
  storyNameInput.focus();
});

/** Abre modal para editar história */
function openEditStory(storyId) {
  const story = stories.find(s => s.id === storyId);
  if (!story) return;

  modalStoryTitle.textContent = 'Editar História';
  storyIdInput.value = story.id;
  refreshEpicSelectors();
  storyNameInput.value = story.title;
  storyEpicSelect.value = story.epicId;
  storyDescInput.value = story.description || '';
  storyStatusSelect.value = story.status;
  storyEstimatedInput.value = story.estimatedHours || 0;
  storyWorkedInput.value = story.workedHours || 0;

  // Comentários
  commentsSection.style.display = 'block';
  btnDeleteStory.style.display = 'inline-flex';
  renderComments(story);
  openModal(modalStory);
}

/** Salva história */
btnSaveStory.addEventListener('click', () => {
  const title = storyNameInput.value.trim();
  if (!title) {
    showToast('Informe o título da história.', 'error');
    return;
  }
  if (!storyEpicSelect.value) {
    showToast('Selecione um Épico.', 'error');
    return;
  }

  const id = storyIdInput.value;
  if (id) {
    // Editar
    const story = stories.find(s => s.id === id);
    if (story) {
      story.title = title;
      story.epicId = storyEpicSelect.value;
      story.description = storyDescInput.value.trim();
      story.status = storyStatusSelect.value;
      story.estimatedHours = parseFloat(storyEstimatedInput.value) || 0;
      story.workedHours = parseFloat(storyWorkedInput.value) || 0;
      showToast('História atualizada!', 'success');
    }
  } else {
    // Criar
    stories.push({
      id: uuid(),
      title,
      epicId: storyEpicSelect.value,
      description: storyDescInput.value.trim(),
      status: storyStatusSelect.value,
      estimatedHours: parseFloat(storyEstimatedInput.value) || 0,
      workedHours: parseFloat(storyWorkedInput.value) || 0,
      comments: [],
      createdAt: new Date().toISOString()
    });
    showToast('História criada!', 'success');
  }

  persist();
  closeModal(modalStory);
  renderBoard();
});

/** Exclui história */
btnDeleteStory.addEventListener('click', () => {
  const id = storyIdInput.value;
  if (!id) return;
  const story = stories.find(s => s.id === id);
  if (!story) return;
  confirmAction(`Excluir a história "${story.title}"?`, () => {
    stories = stories.filter(s => s.id !== id);
    persist();
    closeModal(modalStory);
    renderBoard();
    showToast('História excluída.', 'info');
  });
});

// ────────────────────────────────────────────
// COMENTÁRIOS
// ────────────────────────────────────────────

function renderComments(story) {
  commentsList.innerHTML = '';
  if (!story.comments || story.comments.length === 0) {
    commentsList.innerHTML = '<p class="empty-msg" style="padding:10px 0;font-size:.8rem;">Nenhum comentário ainda.</p>';
    return;
  }
  // Ordena do mais recente para o mais antigo
  const sorted = [...story.comments].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `<p>${escapeHtml(c.text)}</p><small>${formatDate(c.date)}</small>`;
    commentsList.appendChild(item);
  });
}

btnAddComment.addEventListener('click', () => {
  const text = commentTextInput.value.trim();
  if (!text) return;
  const storyId = storyIdInput.value;
  const story = stories.find(s => s.id === storyId);
  if (!story) return;

  if (!story.comments) story.comments = [];
  story.comments.push({
    id: uuid(),
    text,
    date: new Date().toISOString()
  });

  commentTextInput.value = '';
  persist();
  renderComments(story);
  renderBoard();
  showToast('Comentário adicionado!', 'success');
});

// ────────────────────────────────────────────
// FILTRO & BUSCA
// ────────────────────────────────────────────

searchInput.addEventListener('input', () => renderBoard());
filterEpic.addEventListener('change', () => renderBoard());

// ────────────────────────────────────────────
// EXPORTAÇÃO JSON
// ────────────────────────────────────────────

btnExport.addEventListener('click', () => {
  // Monta estrutura completa: Épicos → Histórias → Comentários
  const data = {
    exportedAt: new Date().toISOString(),
    epics: epics.map(e => ({
      ...e,
      stories: stories.filter(s => s.epicId === e.id).map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: s.status,
        estimatedHours: s.estimatedHours,
        workedHours: s.workedHours,
        comments: s.comments || [],
        createdAt: s.createdAt
      }))
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `devops-board-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Dados exportados com sucesso!', 'success');
});

// ────────────────────────────────────────────
// IMPORTAÇÃO JSON
// ────────────────────────────────────────────

/** Abre seletor de arquivo ao clicar no botão Importar */
btnImport.addEventListener('click', () => {
  fileImport.value = '';
  fileImport.click();
});

/** Processa o arquivo JSON selecionado */
fileImport.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.json')) {
    showToast('Selecione um arquivo .json válido.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      // Valida estrutura básica
      if (!data.epics || !Array.isArray(data.epics)) {
        showToast('Formato inválido: campo "epics" não encontrado.', 'error');
        return;
      }

      confirmAction(
        'Importar dados irá SUBSTITUIR todos os dados atuais. Deseja continuar?',
        () => {
          // Extrai épicos e histórias do JSON importado
          const importedEpics = [];
          const importedStories = [];

          data.epics.forEach(epic => {
            importedEpics.push({
              id: epic.id || uuid(),
              title: epic.title || 'Sem título',
              description: epic.description || '',
              createdAt: epic.createdAt || new Date().toISOString()
            });

            if (epic.stories && Array.isArray(epic.stories)) {
              epic.stories.forEach(story => {
                importedStories.push({
                  id: story.id || uuid(),
                  title: story.title || 'Sem título',
                  epicId: epic.id,
                  description: story.description || '',
                  status: COLUMNS.includes(story.status) ? story.status : COLUMNS[0],
                  estimatedHours: story.estimatedHours || 0,
                  workedHours: story.workedHours || 0,
                  comments: Array.isArray(story.comments) ? story.comments : [],
                  createdAt: story.createdAt || new Date().toISOString()
                });
              });
            }
          });

          epics = importedEpics;
          stories = importedStories;
          persist();
          refreshEpicSelectors();
          renderBoard();

          const totalStories = importedStories.length;
          showToast(
            `Importado: ${importedEpics.length} épico(s), ${totalStories} história(s)!`,
            'success'
          );
        }
      );
    } catch (err) {
      showToast('Erro ao ler o arquivo JSON: ' + err.message, 'error');
    }
  };

  reader.readAsText(file);
});

// ────────────────────────────────────────────
// Atalhos de teclado
// ────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
  }
});

// ────────────────────────────────────────────
// Inicialização
// ────────────────────────────────────────────

(function init() {
  refreshEpicSelectors();
  renderBoard();
})();
