(function () {
  'use strict';

  const Core = window.ArchitectureCore;
  const NODE_W = 184;
  const NODE_H = 72;
  const CATEGORIES = ['people', 'operational', 'logical', 'physical', 'data'];
  const CATEGORY_LABELS = { people: 'People', operational: 'Operational', logical: 'Logical', physical: 'Physical', data: 'Data' };
  const CATEGORY_COLORS = {
    people: ['#8767e8', '#f0ecff'], operational: ['#e4932e', '#fff3df'], logical: ['#3877e3', '#eaf2ff'],
    physical: ['#1c9a83', '#e4f7f2'], data: ['#d05084', '#fceaf2']
  };

  const $ = id => document.getElementById(id);
  const els = {
    projectName: $('projectName'), dirtyStatus: $('dirtyStatus'), globalSearch: $('globalSearch'), searchShortcutHint: $('searchShortcutHint'), searchResults: $('searchResults'),
    undoBtn: $('undoBtn'), redoBtn: $('redoBtn'), newProjectBtn: $('newProjectBtn'), openProjectBtn: $('openProjectBtn'),
    projectFileInput: $('projectFileInput'), validateBtn: $('validateBtn'), exportBtn: $('exportBtn'), viewList: $('viewList'),
    newViewBtn: $('newViewBtn'), layerFilters: $('layerFilters'), nodeCount: $('nodeCount'), edgeCount: $('edgeCount'),
    viewCount: $('viewCount'), categoryBars: $('categoryBars'), healthLine: $('healthLine'), helpBtn: $('helpBtn'),
    activeViewName: $('activeViewName'), viewMeta: $('viewMeta'), viewMenuBtn: $('viewMenuBtn'), addExistingBtn: $('addExistingBtn'),
    addObjectBtn: $('addObjectBtn'), canvasViewport: $('canvasViewport'), graphCanvas: $('graphCanvas'), canvasGrid: $('canvasGrid'),
    viewportGroup: $('viewportGroup'), edgeLayer: $('edgeLayer'), nodeLayer: $('nodeLayer'), interactionLayer: $('interactionLayer'),
    emptyState: $('emptyState'), emptyAddObject: $('emptyAddObject'), emptyAddExisting: $('emptyAddExisting'), selectTool: $('selectTool'),
    connectTool: $('connectTool'), zoomOutBtn: $('zoomOutBtn'), zoomInBtn: $('zoomInBtn'), zoomLabel: $('zoomLabel'), fitBtn: $('fitBtn'),
    autoArrangeBtn: $('autoArrangeBtn'), layoutDirectionBtn: $('layoutDirectionBtn'), contextMenu: $('contextMenu'), toastRegion: $('toastRegion'),
    propertiesEmpty: $('propertiesEmpty'), propertiesPanel: $('propertiesPanel'), formDialog: $('formDialog'), modalForm: $('modalForm'),
    modalEyebrow: $('modalEyebrow'), modalTitle: $('modalTitle'), modalBody: $('modalBody'), modalLeftActions: $('modalLeftActions'), modalSubmit: $('modalSubmit'),
    reportDialog: $('reportDialog'), reportBody: $('reportBody'), reportClose: $('reportClose'), reportDone: $('reportDone'),
    confirmDialog: $('confirmDialog'), confirmEyebrow: $('confirmEyebrow'), confirmTitle: $('confirmTitle'), confirmBody: $('confirmBody'),
    confirmCancel: $('confirmCancel'), confirmAction: $('confirmAction')
  };

  const state = {
    project: Core.createEmptyProject(),
    activeViewId: 'view.overview',
    selectedNodeIds: new Set(),
    selectedEdgeId: null,
    tool: 'select',
    connectSourceId: null,
    zoom: 1,
    pan: { x: 80, y: 60 },
    layoutDirection: 'LR',
    past: [],
    future: [],
    baseline: '',
    exportedJustNow: false,
    saveTimer: null,
    db: null,
    drag: null,
    panDrag: null,
    modalCallback: null,
    confirmCallback: null
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function attr(value) { return escapeHtml(value); }
  function titleCase(value) { return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
  function activeView() { return state.project.views.find(view => view.id === state.activeViewId) || state.project.views[0]; }
  function nodeById(id) { return state.project.nodes.find(node => node.id === id); }
  function edgeById(id) { return state.project.edges.find(edge => edge.id === id); }
  function nodeType(id) { return state.project.nodeTypes.find(type => type.id === id); }
  function edgeType(id) { return state.project.edgeTypes.find(type => type.id === id); }
  function categoryOf(node) { return (nodeType(node && node.type) || {}).category || 'logical'; }
  function typeName(node) { return (nodeType(node && node.type) || {}).name || titleCase(node && node.type); }
  function edgeTypeName(edge) { return (edgeType(edge && edge.type) || {}).name || titleCase(edge && edge.type); }
  function categoryVars(category) {
    const [color, soft] = CATEGORY_COLORS[category] || CATEGORY_COLORS.logical;
    return `--cat-color:${color};--cat-soft:${soft}`;
  }
  function iconLetter(node) { return (typeName(node).match(/[A-Z]/g) || [typeName(node)[0] || '?']).slice(0, 2).join(''); }
  function currentCanonical() { return Core.canonicalSerialize(state.project); }

  class WorkspaceRepository {
    async open() {
      if (!('indexedDB' in window)) return null;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('architecture-graph-v1', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ['project', 'nodeTypes', 'edgeTypes', 'nodes', 'edges', 'views', 'preferences', 'recovery']) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async load() {
      if (!state.db) return null;
      const names = ['project', 'nodeTypes', 'edgeTypes', 'nodes', 'edges', 'views', 'preferences', 'recovery'];
      return new Promise((resolve, reject) => {
        const tx = state.db.transaction(names, 'readonly');
        const result = {};
        names.forEach(name => {
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => { result[name] = req.result; };
        });
        tx.oncomplete = () => {
          if (!result.project || !result.project.length) return resolve(null);
          const root = result.project[0];
          const preference = (result.preferences || []).find(item => item.id === 'workspace') || {};
          const recovery = (result.recovery || []).find(item => item.id === 'canonical') || {};
          resolve({
            project: Core.normalizeProject({
              schemaVersion: root.schemaVersion,
              project: root.project,
              nodeTypes: result.nodeTypes || [], edgeTypes: result.edgeTypes || [], nodes: result.nodes || [],
              edges: result.edges || [], views: result.views || []
            }),
            activeViewId: preference.activeViewId,
            baseline: recovery.baseline
          });
        };
        tx.onerror = () => reject(tx.error);
      });
    }

    async save(project, activeViewId, baseline) {
      if (!state.db) return;
      const names = ['project', 'nodeTypes', 'edgeTypes', 'nodes', 'edges', 'views', 'preferences', 'recovery'];
      return new Promise((resolve, reject) => {
        const tx = state.db.transaction(names, 'readwrite');
        names.forEach(name => tx.objectStore(name).clear());
        tx.objectStore('project').put({ id: 'current', schemaVersion: project.schemaVersion, project: Core.clone(project.project) });
        project.nodeTypes.forEach(item => tx.objectStore('nodeTypes').put(Core.clone(item)));
        project.edgeTypes.forEach(item => tx.objectStore('edgeTypes').put(Core.clone(item)));
        project.nodes.forEach(item => tx.objectStore('nodes').put(Core.clone(item)));
        project.edges.forEach(item => tx.objectStore('edges').put(Core.clone(item)));
        project.views.forEach(item => tx.objectStore('views').put(Core.clone(item)));
        tx.objectStore('preferences').put({ id: 'workspace', activeViewId });
        tx.objectStore('recovery').put({ id: 'canonical', baseline });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction was rolled back.'));
      });
    }
  }

  const repository = new WorkspaceRepository();

  async function initialize() {
    renderPlatformShortcuts();
    try {
      state.db = await repository.open();
      const saved = await repository.load();
      if (saved) {
        state.project = saved.project;
        state.activeViewId = state.project.views.some(view => view.id === saved.activeViewId) ? saved.activeViewId : state.project.views[0].id;
        state.baseline = saved.baseline || Core.canonicalSerialize(saved.project);
      } else {
        state.baseline = currentCanonical();
        scheduleSave();
      }
    } catch (error) {
      state.baseline = currentCanonical();
      toast(`Local autosave is unavailable: ${error.message}`, 'warning', 6000);
    }
    bindStaticEvents();
    renderAll();
    requestAnimationFrame(() => fitToScreen(false));
  }

  function renderPlatformShortcuts() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
    const isApple = /mac|iphone|ipad|ipod/i.test(platform);
    els.searchShortcutHint.textContent = isApple ? '⌘ K' : 'Ctrl K';
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      try { await repository.save(state.project, state.activeViewId, state.baseline); }
      catch (error) { toast(`Autosave failed: ${error.message}`, 'error', 5000); }
    }, 180);
  }

  function checkpoint() {
    state.past.push({ project: Core.clone(state.project), activeViewId: state.activeViewId });
    if (state.past.length > 80) state.past.shift();
    state.future = [];
    state.exportedJustNow = false;
  }

  function commit(change, options = {}) {
    if (options.history !== false) checkpoint();
    change();
    state.project = Core.normalizeProject(state.project);
    ensureActiveView();
    renderAll();
    scheduleSave();
  }

  function ensureActiveView() {
    if (!state.project.views.length) {
      state.project.views.push({ id: 'view.overview', name: 'Default', description: '', filter: {}, nodes: [], edges: [] });
    }
    if (!state.project.views.some(view => view.id === state.activeViewId)) state.activeViewId = state.project.views[0].id;
  }

  function undo() {
    if (!state.past.length) return;
    state.future.push({ project: Core.clone(state.project), activeViewId: state.activeViewId });
    const previous = state.past.pop();
    state.project = previous.project;
    state.activeViewId = previous.activeViewId;
    clearSelection();
    state.exportedJustNow = false;
    renderAll();
    scheduleSave();
    toast('Undid last change');
  }

  function redo() {
    if (!state.future.length) return;
    state.past.push({ project: Core.clone(state.project), activeViewId: state.activeViewId });
    const next = state.future.pop();
    state.project = next.project;
    state.activeViewId = next.activeViewId;
    clearSelection();
    state.exportedJustNow = false;
    renderAll();
    scheduleSave();
    toast('Redid change');
  }

  function clearSelection(render = false) {
    state.selectedNodeIds.clear();
    state.selectedEdgeId = null;
    if (render) { renderGraph(); renderProperties(); }
  }

  function visibleGraph() {
    const view = activeView();
    if (!view) return { records: [], nodes: [], edges: [] };
    const categories = Array.isArray(view.filter && view.filter.categories) ? new Set(view.filter.categories) : null;
    const visibleTypes = Array.isArray(view.filter && view.filter.nodeTypes) ? new Set(view.filter.nodeTypes) : null;
    const tags = Array.isArray(view.filter && view.filter.tags) ? new Set(view.filter.tags) : null;
    const records = view.nodes.filter(record => {
      const node = nodeById(record.nodeId);
      if (!node || record.hidden) return false;
      if (categories && !categories.has(categoryOf(node))) return false;
      if (visibleTypes && !visibleTypes.has(node.type)) return false;
      if (tags && !node.tags.some(tag => tags.has(tag))) return false;
      return true;
    });
    const ids = new Set(records.map(record => record.nodeId));
    const allowedEdges = Array.isArray(view.filter && view.filter.edgeTypes) ? new Set(view.filter.edgeTypes) : null;
    const edges = state.project.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && (!allowedEdges || allowedEdges.has(edge.type)));
    return { records, nodes: records.map(record => nodeById(record.nodeId)), edges };
  }

  function renderAll() {
    renderTopbar();
    renderViews();
    renderLayers();
    renderOverview();
    renderGraph();
    renderProperties();
    els.undoBtn.disabled = !state.past.length;
    els.redoBtn.disabled = !state.future.length;
  }

  function renderTopbar() {
    els.projectName.textContent = state.project.project.name;
    document.title = `${state.project.project.name} — Architecture Graph`;
    const changed = currentCanonical() !== state.baseline;
    els.dirtyStatus.className = 'status-badge';
    if (changed) {
      els.dirtyStatus.classList.add('modified');
      els.dirtyStatus.textContent = 'Modified';
    } else if (state.exportedJustNow) {
      els.dirtyStatus.classList.add('exported');
      els.dirtyStatus.textContent = 'Exported';
    } else {
      els.dirtyStatus.classList.add('local');
      els.dirtyStatus.textContent = 'Saved locally';
    }
  }

  function viewIcon(name) {
    const value = name.toLowerCase();
    if (value.includes('people')) return '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 7.5a2.5 2.5 0 0 1 0 5M17 15a4 4 0 0 1 3.5 4"></path></svg>';
    if (value.includes('data')) return '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"></ellipse><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path></svg>';
    if (value.includes('physical')) return '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect><path d="M8 7h.01M8 17h.01"></path></svg>';
    if (value.includes('logical')) return '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="6" rx="1"></rect><rect x="14" y="14" width="7" height="6" rx="1"></rect><path d="M10 7h4a3 3 0 0 1 3 3v4"></path></svg>';
    return '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="6" r="2.5"></circle><circle cx="18" cy="18" r="2.5"></circle><path d="m8.4 10.8 7.2-3.6M8.4 13.2l7.2 3.6"></path></svg>';
  }

  function renderViews() {
    els.viewList.innerHTML = state.project.views.map(view => `
      <button class="view-item ${view.id === state.activeViewId ? 'active' : ''}" data-view-id="${attr(view.id)}">
        ${viewIcon(view.name)}<span class="view-name">${escapeHtml(view.name)}</span><span class="view-count">${view.nodes.length}</span>
      </button>`).join('');
    els.viewList.querySelectorAll('[data-view-id]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewId)));
    const view = activeView();
    if (view) els.activeViewName.textContent = view.name;
  }

  function renderLayers() {
    const view = activeView();
    const selected = new Set(Array.isArray(view && view.filter.categories) ? view.filter.categories : CATEGORIES);
    const counts = CATEGORIES.reduce((result, category) => {
      result[category] = state.project.nodes.filter(node => categoryOf(node) === category).length;
      return result;
    }, {});
    els.layerFilters.innerHTML = CATEGORIES.map(category => `
      <label class="layer-check" style="${categoryVars(category)}">
        <input type="checkbox" value="${category}" ${selected.has(category) ? 'checked' : ''}>
        <span class="layer-dot"></span><span>${CATEGORY_LABELS[category]}</span><small>${counts[category]}</small>
      </label>`).join('');
    els.layerFilters.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      const categories = [...els.layerFilters.querySelectorAll('input:checked')].map(item => item.value);
      commit(() => { activeView().filter = { ...activeView().filter, categories }; });
    }));
  }

  function renderOverview() {
    const stats = Core.projectStats(state.project);
    els.nodeCount.textContent = stats.nodes;
    els.edgeCount.textContent = stats.edges;
    els.viewCount.textContent = stats.views;
    const maximum = Math.max(1, ...Object.values(stats.categories));
    els.categoryBars.innerHTML = CATEGORIES.filter(category => category !== 'operational').map(category => `
      <div class="category-row" style="${categoryVars(category)}">
        <span>${CATEGORY_LABELS[category]}</span><div class="category-track"><span style="--width:${Math.round(stats.categories[category] / maximum * 100)}%"></span></div><b>${stats.categories[category]}</b>
      </div>`).join('');
    const issues = stats.orphans + stats.cycles;
    els.healthLine.className = `health-line${issues ? ' warn' : ''}`;
    els.healthLine.innerHTML = `<span class="health-dot"></span><span>${issues ? `${stats.orphans} orphan${stats.orphans === 1 ? '' : 's'} · ${stats.cycles} cycle${stats.cycles === 1 ? '' : 's'}` : 'No structural warnings'}</span>`;
  }

  function graphTransform() { return `translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`; }

  function renderGraph() {
    const graph = visibleGraph();
    els.viewportGroup.setAttribute('transform', graphTransform());
    els.canvasGrid.setAttribute('transform', graphTransform());
    els.graphCanvas.classList.toggle('connecting', state.tool === 'connect');
    els.selectTool.classList.toggle('active', state.tool === 'select');
    els.connectTool.classList.toggle('active', state.tool === 'connect');
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    els.layoutDirectionBtn.textContent = state.layoutDirection;
    els.emptyState.classList.toggle('hidden', graph.records.length > 0);
    els.viewMeta.textContent = `${graph.nodes.length} object${graph.nodes.length === 1 ? '' : 's'} · ${graph.edges.length} relationship${graph.edges.length === 1 ? '' : 's'}`;

    const recordMap = new Map(graph.records.map(record => [record.nodeId, record]));
    els.edgeLayer.innerHTML = graph.edges.map(edge => renderEdgeSvg(edge, recordMap)).join('');
    els.nodeLayer.innerHTML = graph.records.map(record => renderNodeSvg(nodeById(record.nodeId), record)).join('');

    els.edgeLayer.querySelectorAll('.graph-edge').forEach(group => {
      group.addEventListener('pointerdown', event => { event.stopPropagation(); selectEdge(group.dataset.edgeId); });
      group.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); selectEdge(group.dataset.edgeId); showEdgeContext(event.clientX, event.clientY, group.dataset.edgeId); });
    });
    els.nodeLayer.querySelectorAll('.graph-node').forEach(group => {
      group.addEventListener('pointerdown', event => nodePointerDown(event, group.dataset.nodeId));
      group.addEventListener('dblclick', event => { event.stopPropagation(); selectNode(group.dataset.nodeId); focusPropertyName(); });
      group.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); selectNode(group.dataset.nodeId); showNodeContext(event.clientX, event.clientY, group.dataset.nodeId); });
    });
  }

  function renderEdgeSvg(edge, recordMap) {
    const source = recordMap.get(edge.source);
    const target = recordMap.get(edge.target);
    if (!source || !target) return '';
    const d = shortestPortRoute(source, target);
    const mid = bezierMidpoint(d, source, target);
    const label = edgeTypeName(edge);
    const labelWidth = Math.max(48, label.length * 5.6 + 14);
    const selected = edge.id === state.selectedEdgeId;
    const directed = (edgeType(edge.type) || {}).direction !== 'undirected';
    return `<g class="graph-edge ${selected ? 'selected' : ''}" data-edge-id="${attr(edge.id)}">
      <path class="graph-edge-hit" d="${d}"></path>
      <path class="graph-edge-line" d="${d}" ${directed ? `marker-end="url(#${selected ? 'arrowSelected' : 'arrowDefault'})"` : ''}></path>
      <rect class="edge-label-bg" x="${mid.x - labelWidth / 2}" y="${mid.y - 9}" width="${labelWidth}" height="18" rx="8"></rect>
      <text class="edge-label" x="${mid.x}" y="${mid.y + .5}">${escapeHtml(label)}</text>
    </g>`;
  }

  function shortestPortRoute(source, target) {
    const sourceCenter = { x: source.x + NODE_W / 2, y: source.y + NODE_H / 2 };
    const targetCenter = { x: target.x + NODE_W / 2, y: target.y + NODE_H / 2 };
    const targetIsRight = targetCenter.x >= sourceCenter.x;
    const targetIsBelow = targetCenter.y >= sourceCenter.y;
    const horizontal = {
      start: { x: source.x + (targetIsRight ? NODE_W : 0), y: sourceCenter.y },
      end: { x: target.x + (targetIsRight ? 0 : NODE_W), y: targetCenter.y },
      sourceDirection: targetIsRight ? 1 : -1,
      targetDirection: targetIsRight ? -1 : 1
    };
    const vertical = {
      start: { x: sourceCenter.x, y: source.y + (targetIsBelow ? NODE_H : 0) },
      end: { x: targetCenter.x, y: target.y + (targetIsBelow ? 0 : NODE_H) },
      sourceDirection: targetIsBelow ? 1 : -1,
      targetDirection: targetIsBelow ? -1 : 1
    };
    const distance = route => Math.hypot(route.end.x - route.start.x, route.end.y - route.start.y);
    const useHorizontal = distance(horizontal) <= distance(vertical);
    const route = useHorizontal ? horizontal : vertical;
    const axisGap = useHorizontal ? Math.abs(route.end.x - route.start.x) : Math.abs(route.end.y - route.start.y);
    const bend = Math.max(36, Math.min(160, axisGap * .45));
    if (useHorizontal) {
      return `M ${route.start.x} ${route.start.y} C ${route.start.x + route.sourceDirection * bend} ${route.start.y}, ${route.end.x + route.targetDirection * bend} ${route.end.y}, ${route.end.x} ${route.end.y}`;
    }
    return `M ${route.start.x} ${route.start.y} C ${route.start.x} ${route.start.y + route.sourceDirection * bend}, ${route.end.x} ${route.end.y + route.targetDirection * bend}, ${route.end.x} ${route.end.y}`;
  }

  function bezierMidpoint(path, source, target) {
    const numbers = path.match(/-?[\d.]+/g).map(Number);
    if (numbers.length >= 8) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers;
      return { x: (x0 + 3*x1 + 3*x2 + x3) / 8, y: (y0 + 3*y1 + 3*y2 + y3) / 8 };
    }
    return { x: (source.x + target.x + NODE_W) / 2, y: (source.y + target.y + NODE_H) / 2 };
  }

  function renderNodeSvg(node, record) {
    if (!node) return '';
    const category = categoryOf(node);
    const [color, soft] = CATEGORY_COLORS[category] || CATEGORY_COLORS.logical;
    const selected = state.selectedNodeIds.has(node.id);
    const tag = node.tags && node.tags[0];
    const safeName = node.name.length > 25 ? `${node.name.slice(0, 24)}…` : node.name;
    const safeType = typeName(node).length > 23 ? `${typeName(node).slice(0, 22)}…` : typeName(node);
    const tagSvg = tag ? `<rect class="node-tag-bg" x="${NODE_W - 57}" y="46" width="45" height="15" rx="7"></rect><text class="node-tag-text" x="${NODE_W - 34.5}" y="54">${escapeHtml(tag.length > 8 ? `${tag.slice(0, 7)}…` : tag)}</text>` : '';
    return `<g class="graph-node ${selected ? 'selected' : ''} ${state.connectSourceId === node.id ? 'connect-source' : ''}" data-node-id="${attr(node.id)}" transform="translate(${record.x} ${record.y})" style="--cat-color:${color};--cat-soft:${soft}">
      <rect class="node-body" width="${NODE_W}" height="${NODE_H}" rx="10"></rect>
      <path class="node-accent" d="M10 0h4v72h-4A10 10 0 0 1 0 62V10A10 10 0 0 1 10 0z"></path>
      <rect class="node-icon-bg" x="23" y="17" width="36" height="36" rx="9"></rect>
      <text class="node-icon-glyph" x="41" y="35">${escapeHtml(iconLetter(node))}</text>
      <text class="node-name" x="70" y="30">${escapeHtml(safeName)}</text>
      <text class="node-type" x="70" y="48">${escapeHtml(safeType)}</text>
      ${tagSvg}
      <circle class="node-handle" cx="${NODE_W}" cy="${NODE_H / 2}" r="4"></circle>
      <circle class="node-handle" cx="0" cy="${NODE_H / 2}" r="4"></circle>
    </g>`;
  }

  function renderProperties() {
    const selectedNodes = [...state.selectedNodeIds].map(nodeById).filter(Boolean);
    const edge = state.selectedEdgeId && edgeById(state.selectedEdgeId);
    if (!selectedNodes.length && !edge) {
      els.propertiesEmpty.classList.remove('hidden');
      els.propertiesPanel.classList.add('hidden');
      return;
    }
    els.propertiesEmpty.classList.add('hidden');
    els.propertiesPanel.classList.remove('hidden');
    if (selectedNodes.length > 1) return renderMultiProperties(selectedNodes);
    if (selectedNodes.length === 1) return renderNodeProperties(selectedNodes[0]);
    renderEdgeProperties(edge);
  }

  function renderMultiProperties(nodes) {
    els.propertiesPanel.innerHTML = `
      <div class="property-header"><div class="property-type-icon" style="${categoryVars('logical')}">${nodes.length}</div><div class="property-heading"><h2>${nodes.length} objects selected</h2><span>Multi-selection</span></div></div>
      <div class="property-body"><section class="property-section"><div class="property-section-title">Selection</div>
        <div class="membership-list">${nodes.map(node => `<button class="membership-item" data-focus-node="${attr(node.id)}"><span class="membership-dot"></span><span>${escapeHtml(node.name)}</span></button>`).join('')}</div>
      </section><section class="property-section property-actions"><button id="multiRemoveView" class="button secondary">Remove selection from view</button><button id="multiDeleteModel" class="button secondary danger-zone">Delete selection from model</button></section></div>`;
    els.propertiesPanel.querySelectorAll('[data-focus-node]').forEach(button => button.addEventListener('click', () => selectNode(button.dataset.focusNode)));
    $('multiRemoveView').addEventListener('click', () => removeNodesFromView(nodes.map(node => node.id)));
    $('multiDeleteModel').addEventListener('click', () => confirmDeleteNodes(nodes.map(node => node.id)));
  }

  function renderNodeProperties(node) {
    const category = categoryOf(node);
    const incoming = state.project.edges.filter(edge => edge.target === node.id);
    const outgoing = state.project.edges.filter(edge => edge.source === node.id);
    const memberships = state.project.views.filter(view => view.nodes.some(record => record.nodeId === node.id));
    const properties = Object.entries(node.properties || {});
    els.propertiesPanel.innerHTML = `
      <div class="property-header" style="${categoryVars(category)}">
        <div class="property-type-icon">${escapeHtml(iconLetter(node))}</div>
        <div class="property-heading"><h2>${escapeHtml(node.name)}</h2><span>${escapeHtml(CATEGORY_LABELS[category])} · ${escapeHtml(typeName(node))}</span></div>
        <button id="nodeMoreBtn" class="icon-button property-menu-button" title="More actions"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg></button>
      </div>
      <div class="property-body">
        <section class="property-section">
          <div class="property-section-title">Object details</div>
          <div class="field"><label>Name</label><input id="propName" value="${attr(node.name)}"></div>
          <div class="field"><label>Type</label><select id="propType">${nodeTypeOptions(node.type)}</select></div>
          <div class="field"><label>Stable ID</label><input value="${attr(node.id)}" readonly title="IDs do not change when an object is renamed"></div>
          <div class="field"><label>Description</label><textarea id="propDescription" placeholder="What is this object responsible for?">${escapeHtml(node.description)}</textarea></div>
        </section>
        <section class="property-section">
          <div class="property-section-title">Tags</div>
          <div class="tag-list">${node.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}<button data-remove-tag="${attr(tag)}" title="Remove tag">×</button></span>`).join('')}</div>
          <input id="tagInput" class="property-inline-input" placeholder="Type a tag and press Enter">
        </section>
        <section class="property-section">
          <div class="property-section-title"><span>Custom properties</span><button id="addPropertyBtn" class="add-row-button">+ Add</button></div>
          <div id="customPropertyRows">${properties.map(([key, value]) => propertyRow(key, value)).join('') || '<div class="empty-microcopy">No custom metadata yet.</div>'}</div>
        </section>
        <section class="property-section">
          <div class="property-section-title"><span>Relationships</span><button id="addRelationBtn" class="add-row-button">+ Connect</button></div>
          ${relationshipList(node, incoming, outgoing)}
        </section>
        <section class="property-section">
          <div class="property-section-title">Appears in ${memberships.length} view${memberships.length === 1 ? '' : 's'}</div>
          <div class="membership-list">${memberships.map(view => `<button class="membership-item" data-open-view="${attr(view.id)}"><span class="membership-dot"></span><span>${escapeHtml(view.name)}</span></button>`).join('') || '<div class="empty-microcopy">This object is not currently placed in a view.</div>'}</div>
        </section>
        <section class="property-section property-actions">
          <button id="dependenciesBtn" class="button secondary">Show dependencies</button>
          <button id="removeViewBtn" class="button secondary">Remove from this view</button>
          <button id="deleteModelBtn" class="button secondary danger-zone">Delete from model…</button>
        </section>
      </div>`;
    bindNodePropertyEvents(node);
  }

  function nodeTypeOptions(selectedId, allowCustom = false) {
    const groups = {};
    state.project.nodeTypes.forEach(type => { (groups[type.category] ||= []).push(type); });
    const options = CATEGORIES.map(category => groups[category] ? `<optgroup label="${CATEGORY_LABELS[category]}">${groups[category].map(type => `<option value="${attr(type.id)}" ${type.id === selectedId ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</optgroup>` : '').join('');
    return `${options}${allowCustom ? '<option value="__custom">＋ Create custom type…</option>' : ''}`;
  }

  function propertyRow(key, value) {
    return `<div class="property-row" data-original-key="${attr(key)}"><input data-property-key value="${attr(key)}" placeholder="Key"><input data-property-value value="${attr(typeof value === 'object' ? JSON.stringify(value) : value)}" placeholder="Value"><button data-remove-property title="Remove">×</button></div>`;
  }

  function relationshipList(node, incoming, outgoing) {
    const items = [
      ...outgoing.map(edge => ({ edge, direction: '→', other: nodeById(edge.target), label: `Outgoing · ${edgeTypeName(edge)}` })),
      ...incoming.map(edge => ({ edge, direction: '←', other: nodeById(edge.source), label: `Incoming · ${edgeTypeName(edge)}` }))
    ];
    if (!items.length) return '<div class="empty-microcopy">No relationships yet.</div>';
    return `<div class="relation-list">${items.map(item => `<button class="relation-item" data-edge-select="${attr(item.edge.id)}"><span class="relation-direction">${item.direction}</span><span class="relation-copy"><strong>${escapeHtml(item.other ? item.other.name : 'Missing object')}</strong><span>${escapeHtml(item.label)}</span></span></button>`).join('')}</div>`;
  }

  function bindNodePropertyEvents(node) {
    $('propName').addEventListener('change', event => updateNodeField(node.id, 'name', event.target.value.trim() || node.name));
    $('propType').addEventListener('change', event => updateNodeField(node.id, 'type', event.target.value));
    $('propDescription').addEventListener('change', event => updateNodeField(node.id, 'description', event.target.value));
    $('tagInput').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const tag = event.target.value.trim();
      if (tag && !node.tags.includes(tag)) commit(() => { nodeById(node.id).tags.push(tag); });
    });
    els.propertiesPanel.querySelectorAll('[data-remove-tag]').forEach(button => button.addEventListener('click', () => commit(() => {
      nodeById(node.id).tags = nodeById(node.id).tags.filter(tag => tag !== button.dataset.removeTag);
    })));
    $('addPropertyBtn').addEventListener('click', () => commit(() => {
      const target = nodeById(node.id); let index = 1; let key = 'property';
      while (Object.prototype.hasOwnProperty.call(target.properties, key)) key = `property${++index}`;
      target.properties[key] = '';
    }));
    els.propertiesPanel.querySelectorAll('.property-row').forEach(row => {
      const keyInput = row.querySelector('[data-property-key]');
      const valueInput = row.querySelector('[data-property-value]');
      const update = () => {
        const oldKey = row.dataset.originalKey;
        const newKey = keyInput.value.trim();
        if (!newKey) return toast('Property keys cannot be empty.', 'warning');
        commit(() => {
          const target = nodeById(node.id);
          if (newKey !== oldKey) delete target.properties[oldKey];
          target.properties[newKey] = valueInput.value;
        });
      };
      keyInput.addEventListener('change', update);
      valueInput.addEventListener('change', update);
      row.querySelector('[data-remove-property]').addEventListener('click', () => commit(() => { delete nodeById(node.id).properties[row.dataset.originalKey]; }));
    });
    els.propertiesPanel.querySelectorAll('[data-edge-select]').forEach(button => button.addEventListener('click', () => selectEdge(button.dataset.edgeSelect)));
    els.propertiesPanel.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => { switchView(button.dataset.openView); selectNode(node.id); centerNode(node.id); }));
    $('addRelationBtn').addEventListener('click', () => openRelationshipDialog(node.id));
    $('dependenciesBtn').addEventListener('click', () => openDependencyDialog(node.id));
    $('removeViewBtn').addEventListener('click', () => removeNodesFromView([node.id]));
    $('deleteModelBtn').addEventListener('click', () => confirmDeleteNodes([node.id]));
    $('nodeMoreBtn').addEventListener('click', event => showNodeContext(event.clientX, event.clientY, node.id));
  }

  function renderEdgeProperties(edge) {
    if (!edge) return clearSelection(true);
    const source = nodeById(edge.source);
    const target = nodeById(edge.target);
    const properties = Object.entries(edge.properties || {});
    els.propertiesPanel.innerHTML = `
      <div class="property-header" style="${categoryVars('logical')}"><div class="property-type-icon">↗</div><div class="property-heading"><h2>${escapeHtml(edgeTypeName(edge))}</h2><span>Relationship</span></div></div>
      <div class="property-body">
        <section class="property-section"><div class="property-section-title">Relationship details</div>
          <div class="field"><label>Type</label><select id="edgePropType">${state.project.edgeTypes.map(type => `<option value="${attr(type.id)}" ${type.id === edge.type ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Source</label><input value="${attr(source ? source.name : edge.source)}" readonly></div>
          <div class="field"><label>Target</label><input value="${attr(target ? target.name : edge.target)}" readonly></div>
          <div class="field"><label>Stable ID</label><input value="${attr(edge.id)}" readonly></div>
          <div class="field"><label>Description</label><textarea id="edgePropDescription" placeholder="Describe this relationship…">${escapeHtml(edge.description)}</textarea></div>
        </section>
        <section class="property-section"><div class="property-section-title"><span>Custom properties</span><button id="addEdgePropertyBtn" class="add-row-button">+ Add</button></div>
          <div>${properties.map(([key, value]) => propertyRow(key, value)).join('') || '<div class="empty-microcopy">No custom metadata yet.</div>'}</div>
        </section>
        <section class="property-section property-actions">
          <button id="goSourceBtn" class="button secondary">Select ${escapeHtml(source ? source.name : 'source')}</button>
          <button id="goTargetBtn" class="button secondary">Select ${escapeHtml(target ? target.name : 'target')}</button>
          <button id="deleteEdgeBtn" class="button secondary danger-zone">Delete relationship</button>
        </section>
      </div>`;
    $('edgePropType').addEventListener('change', event => updateEdgeField(edge.id, 'type', event.target.value));
    $('edgePropDescription').addEventListener('change', event => updateEdgeField(edge.id, 'description', event.target.value));
    $('addEdgePropertyBtn').addEventListener('click', () => commit(() => {
      const targetEdge = edgeById(edge.id); let index = 1; let key = 'property';
      while (Object.prototype.hasOwnProperty.call(targetEdge.properties, key)) key = `property${++index}`;
      targetEdge.properties[key] = '';
    }));
    els.propertiesPanel.querySelectorAll('.property-row').forEach(row => {
      const keyInput = row.querySelector('[data-property-key]'); const valueInput = row.querySelector('[data-property-value]');
      const update = () => commit(() => {
        const targetEdge = edgeById(edge.id); const oldKey = row.dataset.originalKey; const newKey = keyInput.value.trim();
        if (!newKey) return;
        if (newKey !== oldKey) delete targetEdge.properties[oldKey];
        targetEdge.properties[newKey] = valueInput.value;
      });
      keyInput.addEventListener('change', update); valueInput.addEventListener('change', update);
      row.querySelector('[data-remove-property]').addEventListener('click', () => commit(() => { delete edgeById(edge.id).properties[row.dataset.originalKey]; }));
    });
    $('goSourceBtn').addEventListener('click', () => selectNode(edge.source));
    $('goTargetBtn').addEventListener('click', () => selectNode(edge.target));
    $('deleteEdgeBtn').addEventListener('click', () => deleteEdge(edge.id));
  }

  function updateNodeField(id, field, value) { commit(() => { nodeById(id)[field] = value; }); }
  function updateEdgeField(id, field, value) { commit(() => { edgeById(id)[field] = value; }); }

  function switchView(id) {
    if (state.activeViewId === id) return;
    state.activeViewId = id;
    clearSelection();
    state.connectSourceId = null;
    state.pan = { x: 70, y: 55 };
    state.zoom = 1;
    renderAll();
    scheduleSave();
    requestAnimationFrame(() => fitToScreen(false));
  }

  function selectNode(id, additive = false) {
    state.selectedEdgeId = null;
    if (!additive) state.selectedNodeIds.clear();
    if (additive && state.selectedNodeIds.has(id)) state.selectedNodeIds.delete(id); else state.selectedNodeIds.add(id);
    renderGraph();
    renderProperties();
  }

  function selectEdge(id) {
    state.selectedNodeIds.clear();
    state.selectedEdgeId = id;
    renderGraph();
    renderProperties();
  }

  function nodePointerDown(event, nodeId) {
    event.stopPropagation();
    hideContextMenu();
    if (state.tool === 'connect') {
      if (!state.connectSourceId) {
        state.connectSourceId = nodeId;
        selectNode(nodeId);
        toast('Choose a target object');
      } else if (state.connectSourceId === nodeId) {
        state.connectSourceId = null;
        renderGraph();
      } else {
        const sourceId = state.connectSourceId;
        state.connectSourceId = null;
        setTool('select');
        openRelationshipDialog(sourceId, nodeId);
      }
      return;
    }
    if (!state.selectedNodeIds.has(nodeId)) selectNode(nodeId, event.shiftKey || event.metaKey || event.ctrlKey);
    else if (event.shiftKey || event.metaKey || event.ctrlKey) { selectNode(nodeId, true); return; }
    const graphPoint = screenToGraph(event.clientX, event.clientY);
    const view = activeView();
    const originals = [...state.selectedNodeIds].map(id => {
      const record = view.nodes.find(item => item.nodeId === id);
      return record && { id, x: record.x, y: record.y };
    }).filter(Boolean);
    checkpoint();
    state.drag = { start: graphPoint, originals, moved: false };
    window.addEventListener('pointermove', nodePointerMove);
    window.addEventListener('pointerup', nodePointerUp, { once: true });
  }

  function nodePointerMove(event) {
    if (!state.drag) return;
    const point = screenToGraph(event.clientX, event.clientY);
    const dx = point.x - state.drag.start.x;
    const dy = point.y - state.drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.drag.moved = true;
    state.drag.originals.forEach(original => {
      const record = activeView().nodes.find(item => item.nodeId === original.id);
      if (record) { record.x = Math.round(original.x + dx); record.y = Math.round(original.y + dy); }
    });
    renderGraph();
  }

  function nodePointerUp() {
    window.removeEventListener('pointermove', nodePointerMove);
    if (state.drag && state.drag.moved) {
      state.project = Core.normalizeProject(state.project);
      state.future = [];
      state.exportedJustNow = false;
      renderAll();
      scheduleSave();
    } else if (state.drag) {
      state.past.pop();
      renderProperties();
    }
    state.drag = null;
  }

  function startPan(event) {
    if (event.button !== 0 || event.target.closest('.graph-node, .graph-edge')) return;
    hideContextMenu();
    clearSelection(true);
    state.panDrag = { x: event.clientX, y: event.clientY, origin: { ...state.pan } };
    els.graphCanvas.classList.add('dragging');
    window.addEventListener('pointermove', movePan);
    window.addEventListener('pointerup', endPan, { once: true });
  }

  function movePan(event) {
    if (!state.panDrag) return;
    state.pan.x = state.panDrag.origin.x + event.clientX - state.panDrag.x;
    state.pan.y = state.panDrag.origin.y + event.clientY - state.panDrag.y;
    updateViewportTransform();
  }

  function endPan() {
    window.removeEventListener('pointermove', movePan);
    els.graphCanvas.classList.remove('dragging');
    state.panDrag = null;
  }

  function screenToGraph(clientX, clientY) {
    const rect = els.graphCanvas.getBoundingClientRect();
    return { x: (clientX - rect.left - state.pan.x) / state.zoom, y: (clientY - rect.top - state.pan.y) / state.zoom };
  }

  function updateViewportTransform() {
    els.viewportGroup.setAttribute('transform', graphTransform());
    els.canvasGrid.setAttribute('transform', graphTransform());
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = els.graphCanvas.getBoundingClientRect();
    const px = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
    const py = (clientY == null ? rect.top + rect.height / 2 : clientY) - rect.top;
    const graphX = (px - state.pan.x) / state.zoom;
    const graphY = (py - state.pan.y) / state.zoom;
    state.zoom = Math.min(2.25, Math.max(.3, state.zoom * factor));
    state.pan.x = px - graphX * state.zoom;
    state.pan.y = py - graphY * state.zoom;
    updateViewportTransform();
  }

  function fitToScreen(animated = true) {
    const records = visibleGraph().records;
    if (!records.length) { state.zoom = 1; state.pan = { x: 70, y: 55 }; return updateViewportTransform(); }
    const rect = els.canvasViewport.getBoundingClientRect();
    const minX = Math.min(...records.map(record => record.x));
    const minY = Math.min(...records.map(record => record.y));
    const maxX = Math.max(...records.map(record => record.x + NODE_W));
    const maxY = Math.max(...records.map(record => record.y + NODE_H));
    const width = Math.max(1, maxX - minX); const height = Math.max(1, maxY - minY);
    state.zoom = Math.min(1.25, Math.max(.3, Math.min((rect.width - 130) / width, (rect.height - 130) / height)));
    state.pan = { x: (rect.width - width * state.zoom) / 2 - minX * state.zoom, y: (rect.height - height * state.zoom) / 2 - minY * state.zoom };
    if (animated) els.viewportGroup.style.transition = 'transform .22s ease';
    updateViewportTransform();
    if (animated) setTimeout(() => { els.viewportGroup.style.transition = ''; }, 240);
  }

  function centerNode(id) {
    const record = activeView().nodes.find(item => item.nodeId === id);
    if (!record) return;
    const rect = els.canvasViewport.getBoundingClientRect();
    state.pan = { x: rect.width / 2 - (record.x + NODE_W / 2) * state.zoom, y: rect.height / 2 - (record.y + NODE_H / 2) * state.zoom };
    updateViewportTransform();
  }

  function setTool(tool) {
    state.tool = tool;
    if (tool !== 'connect') state.connectSourceId = null;
    renderGraph();
  }

  function autoArrange() {
    const graph = visibleGraph();
    if (!graph.records.length) return;
    commit(() => {
      const ids = new Set(graph.records.map(record => record.nodeId));
      const incoming = new Map([...ids].map(id => [id, 0]));
      state.project.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).forEach(edge => incoming.set(edge.target, incoming.get(edge.target) + 1));
      let frontier = [...ids].filter(id => incoming.get(id) === 0).sort();
      if (!frontier.length) frontier = [[...ids].sort()[0]];
      const layer = new Map(); let depth = 0; const seen = new Set();
      while (frontier.length) {
        const next = [];
        frontier.forEach(id => {
          if (seen.has(id)) return; seen.add(id); layer.set(id, depth);
          state.project.edges.filter(edge => edge.source === id && ids.has(edge.target)).forEach(edge => { if (!seen.has(edge.target)) next.push(edge.target); });
        });
        frontier = [...new Set(next)].sort(); depth += 1;
      }
      [...ids].filter(id => !seen.has(id)).sort().forEach((id, index) => layer.set(id, depth + index % 2));
      const groups = new Map();
      [...ids].sort().forEach(id => { const value = layer.get(id) || 0; if (!groups.has(value)) groups.set(value, []); groups.get(value).push(id); });
      [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([column, group]) => group.forEach((id, row) => {
        const record = activeView().nodes.find(item => item.nodeId === id);
        if (state.layoutDirection === 'LR') { record.x = 70 + column * 270; record.y = 70 + row * 125; }
        else { record.x = 70 + row * 245; record.y = 70 + column * 145; }
      }));
    });
    requestAnimationFrame(() => fitToScreen());
    toast(`Arranged ${graph.records.length} objects ${state.layoutDirection === 'LR' ? 'left to right' : 'top to bottom'}`);
  }

  function openForm({ eyebrow = '', title, body, submit = 'Save', onSubmit, wide = false, footerAction = null }) {
    state.modalCallback = onSubmit;
    els.modalEyebrow.textContent = eyebrow;
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = body;
    els.modalLeftActions.innerHTML = '';
    if (footerAction) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'modalAuxAction';
      button.className = `button ${footerAction.className || 'secondary'}`;
      button.textContent = footerAction.label;
      button.addEventListener('click', footerAction.onClick);
      els.modalLeftActions.appendChild(button);
    }
    els.modalSubmit.textContent = submit;
    els.modalSubmit.disabled = false;
    els.formDialog.style.width = wide ? 'min(600px, calc(100vw - 40px))' : '';
    els.formDialog.showModal();
    requestAnimationFrame(() => {
      const first = els.modalBody.querySelector('input:not([type=hidden]), textarea, select');
      if (first) first.focus();
    });
  }

  function openNewProjectDialog() {
    openForm({ eyebrow: 'New workspace', title: 'Create a new project', submit: 'Create project', body: `
      <div class="modal-note">Your current workspace stays in browser storage. Export it first if you need a portable copy.</div>
      <div class="field"><label for="newProjectName">Project name</label><input id="newProjectName" required value="Untitled Architecture"></div>
      <div class="field"><label for="newProjectDescription">Description</label><textarea id="newProjectDescription" placeholder="Purpose and scope of this architecture…"></textarea></div>`,
      onSubmit: () => {
        const name = $('newProjectName').value.trim(); if (!name) return false;
        const project = Core.createEmptyProject(name); project.project.description = $('newProjectDescription').value.trim();
        state.project = project; state.activeViewId = 'view.overview'; state.past = []; state.future = []; clearSelection();
        state.baseline = Core.canonicalSerialize(project); state.exportedJustNow = false; state.pan = { x: 70, y: 55 }; state.zoom = 1;
        renderAll(); scheduleSave(); toast('New project created'); return true;
      }
    });
  }

  function openProjectDetailsDialog() {
    const project = state.project.project;
    openForm({ eyebrow: 'Project settings', title: 'Project details', submit: 'Save changes', body: `
      <div class="field"><label>Project name</label><input id="editProjectName" required value="${attr(project.name)}"></div>
      <div class="field"><label>Stable ID</label><input value="${attr(project.id)}" readonly></div>
      <div class="field"><label>Description</label><textarea id="editProjectDescription">${escapeHtml(project.description)}</textarea></div>`,
      onSubmit: () => {
        const name = $('editProjectName').value.trim(); if (!name) return false;
        commit(() => { state.project.project.name = name; state.project.project.description = $('editProjectDescription').value; }); return true;
      }
    });
  }

  function defaultPosition() {
    const rect = els.canvasViewport.getBoundingClientRect();
    const point = screenToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const offset = activeView().nodes.length % 6;
    return { x: Math.round(point.x - NODE_W / 2 + offset * 16), y: Math.round(point.y - NODE_H / 2 + offset * 16) };
  }

  function openNewObjectDialog() {
    openForm({ eyebrow: `Add to ${activeView().name}`, title: 'Create a canonical object', submit: 'Create object', body: `
      <div class="field"><label>Name</label><input id="newNodeName" required placeholder="e.g. Identity Service" autocomplete="off"></div>
      <div id="similarObjects"></div>
      <div class="modal-grid"><div class="field"><label>Type</label><select id="newNodeType">${nodeTypeOptions('service', true)}</select></div><div class="field"><label>Tags</label><input id="newNodeTags" placeholder="core, production"></div></div>
      <div id="customNodeTypeFields" class="modal-grid hidden"><div class="field"><label>Custom type name</label><input id="customNodeTypeName" placeholder="e.g. Sensor"></div><div class="field"><label>Layer</label><select id="customNodeCategory">${CATEGORIES.map(category => `<option value="${category}">${CATEGORY_LABELS[category]}</option>`).join('')}</select></div></div>
      <div class="field"><label>Description</label><textarea id="newNodeDescription" placeholder="Describe its responsibility or purpose…"></textarea></div>`,
      onSubmit: () => {
        const name = $('newNodeName').value.trim(); if (!name) return false;
        let type = $('newNodeType').value;
        let customType = null;
        if (type === '__custom') {
          const customName = $('customNodeTypeName').value.trim();
          if (!customName) { toast('Enter a name for the custom type.', 'warning'); return false; }
          type = Core.uniqueId('custom', customName, state.project.nodeTypes.map(item => item.id));
          customType = { id: type, name: customName, category: $('customNodeCategory').value };
        }
        const id = Core.uniqueId(type, name, state.project.nodes.map(node => node.id));
        const position = defaultPosition();
        commit(() => {
          if (customType) state.project.nodeTypes.push(customType);
          state.project.nodes.push({ id, type, name, description: $('newNodeDescription').value.trim(), tags: $('newNodeTags').value.split(',').map(tag => tag.trim()).filter(Boolean), properties: {} });
          activeView().nodes.push({ nodeId: id, ...position });
        });
        selectNode(id); toast(`${name} created`); return true;
      }
    });
    $('newNodeName').addEventListener('input', event => {
      const value = event.target.value.trim().toLowerCase();
      const matches = value.length > 2 ? state.project.nodes.filter(node => node.name.toLowerCase().includes(value) || value.includes(node.name.toLowerCase())).slice(0, 3) : [];
      $('similarObjects').innerHTML = matches.length ? `<div class="similar-warning"><strong>Similar objects already exist:</strong><br>${matches.map(node => escapeHtml(node.name)).join(', ')}. Consider adding an existing object instead.</div>` : '';
    });
    $('newNodeType').addEventListener('change', event => $('customNodeTypeFields').classList.toggle('hidden', event.target.value !== '__custom'));
  }

  function openBrowseExistingDialog() {
    const present = new Set(activeView().nodes.map(record => record.nodeId));
    const selected = new Set();
    const selectedIds = () => [...selected].filter(id => nodeById(id));
    const addableIds = () => selectedIds().filter(id => !present.has(id));
    const updateActions = () => {
      const addableCount = addableIds().length;
      const selectedCount = selectedIds().length;
      els.modalSubmit.textContent = addableCount ? `Add to ${activeView().name} (${addableCount})` : `Add to ${activeView().name}`;
      els.modalSubmit.disabled = addableCount === 0;
      const deleteButton = $('modalAuxAction');
      if (deleteButton) {
        deleteButton.textContent = selectedCount ? `Delete selected (${selectedCount})…` : 'Delete selected…';
        deleteButton.disabled = selectedCount === 0;
      }
    };
    openForm({ eyebrow: 'Canonical model', title: 'Browse existing objects', submit: `Add to ${activeView().name}`, wide: true, body: `
      <div class="field"><label>Find an object</label><input id="existingSearch" type="search" placeholder="Search by name, ID, type, or tag…"></div>
      <div id="objectPicker" class="object-picker"></div>`,
      onSubmit: () => {
        const addable = addableIds();
        if (!addable.length) { toast('Select an object that is not already in this view.', 'warning'); return false; }
        commit(() => addable.forEach((id, index) => { const position = defaultPosition(); activeView().nodes.push({ nodeId: id, x: position.x + (index % 3) * 220, y: position.y + Math.floor(index / 3) * 110 }); }));
        toast(`${addable.length} object${addable.length === 1 ? '' : 's'} added to ${activeView().name}`); return true;
      },
      footerAction: {
        label: 'Delete selected…',
        className: 'secondary danger-zone',
        onClick: () => {
          const ids = selectedIds();
          if (!ids.length) return;
          els.formDialog.close();
          confirmDeleteNodes(ids);
        }
      }
    });
    const draw = query => {
      const words = query.toLowerCase();
      const matches = state.project.nodes.filter(node => !words || searchableNode(node).includes(words));
      $('objectPicker').innerHTML = matches.map(node => {
        const memberships = state.project.views.filter(view => view.nodes.some(record => record.nodeId === node.id));
        const membershipNames = memberships.map(view => view.name);
        const compactViews = memberships.slice(0, 2).map(view => `<span class="object-view-chip ${view.id === state.activeViewId ? 'current' : ''}">${escapeHtml(view.name)}</span>`).join('');
        const moreViews = memberships.length > 2 ? `<span class="object-view-more">+${memberships.length - 2}</span>` : '';
        const viewSummary = memberships.length ? `${compactViews}${moreViews}` : '<span class="object-view-chip orphan">No views</span>';
        const category = categoryOf(node);
        return `<label class="object-pick-item" style="${categoryVars(category)}"><span class="object-pick-icon">${escapeHtml(iconLetter(node))}</span><span class="object-pick-copy"><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(typeName(node))} · ${escapeHtml(node.id)}</span></span><span class="object-pick-meta"><span class="object-pick-views" title="${attr(membershipNames.join(', ') || 'Appears in no views')}">${viewSummary}</span><input data-pick-object type="checkbox" value="${attr(node.id)}" ${selected.has(node.id) ? 'checked' : ''}></span></label>`;
      }).join('') || `<div class="search-empty">${state.project.nodes.length ? 'No matching objects' : 'No canonical objects yet. Create your first object from the canvas.'}</div>`;
      $('objectPicker').querySelectorAll('[data-pick-object]').forEach(input => input.addEventListener('change', () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        updateActions();
      }));
    };
    draw(''); updateActions(); $('existingSearch').addEventListener('input', event => draw(event.target.value));
  }

  function openRelationshipDialog(sourceId, fixedTargetId = null) {
    const source = nodeById(sourceId); if (!source) return;
    const candidates = state.project.nodes.filter(node => node.id !== sourceId);
    if (!candidates.length) return toast('Create another object before adding a relationship.', 'warning');
    openForm({ eyebrow: 'Typed relationship', title: `Connect from ${source.name}`, submit: 'Create relationship', body: `
      <div class="field"><label>Source</label><input value="${attr(source.name)}" readonly></div>
      <div class="field"><label>Relationship type</label><select id="newEdgeType">${state.project.edgeTypes.map(type => `<option value="${attr(type.id)}" ${type.id === 'depends_on' ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}<option value="__custom">＋ Create custom relationship type…</option></select></div>
      <div id="customEdgeTypeFields" class="modal-grid hidden"><div class="field"><label>Custom type name</label><input id="customEdgeTypeName" placeholder="e.g. Secures"></div><div class="field"><label>Direction</label><select id="customEdgeDirection"><option value="directed">Directed</option><option value="undirected">Undirected</option></select></div></div>
      <div class="field"><label>Target</label><select id="newEdgeTarget" ${fixedTargetId ? 'disabled' : ''}>${candidates.map(node => `<option value="${attr(node.id)}" ${node.id === fixedTargetId ? 'selected' : ''}>${escapeHtml(node.name)} — ${escapeHtml(typeName(node))}</option>`).join('')}</select></div>
      <div class="field"><label>Description</label><textarea id="newEdgeDescription" placeholder="Optional context for this relationship…"></textarea></div>`,
      onSubmit: () => {
        const targetId = fixedTargetId || $('newEdgeTarget').value; let type = $('newEdgeType').value; let customType = null;
        if (!targetId || targetId === sourceId) return false;
        if (type === '__custom') {
          const customName = $('customEdgeTypeName').value.trim();
          if (!customName) { toast('Enter a name for the custom relationship type.', 'warning'); return false; }
          type = Core.uniqueId('custom', customName, state.project.edgeTypes.map(item => item.id));
          customType = { id: type, name: customName, direction: $('customEdgeDirection').value };
        }
        const typeSlug = type.replace(/_/g, '-');
        const base = `edge.${Core.slugify(sourceId)}.${typeSlug}.${Core.slugify(targetId)}`;
        let id = base; let suffix = 2; const ids = new Set(state.project.edges.map(edge => edge.id)); while (ids.has(id)) id = `${base}-${suffix++}`;
        commit(() => {
          if (customType) state.project.edgeTypes.push(customType);
          state.project.edges.push({ id, source: sourceId, target: targetId, type, description: $('newEdgeDescription').value.trim(), properties: {} });
          if (!activeView().nodes.some(record => record.nodeId === targetId)) { const position = defaultPosition(); activeView().nodes.push({ nodeId: targetId, x: position.x + 260, y: position.y }); }
        });
        selectEdge(id); toast('Relationship created'); return true;
      }
    });
    $('newEdgeType').addEventListener('change', event => $('customEdgeTypeFields').classList.toggle('hidden', event.target.value !== '__custom'));
  }

  function openNewViewDialog() {
    openForm({ eyebrow: 'Presentation view', title: 'Create a new view', submit: 'Create view', body: `
      <div class="field"><label>View name</label><input id="newViewName" required placeholder="e.g. Mission dependency map"></div>
      <div class="field"><label>Description</label><textarea id="newViewDescription" placeholder="What question does this view answer?"></textarea></div>
      <div class="field"><label>Starting layers</label><div class="checkbox-list">${CATEGORIES.map(category => `<label><input type="checkbox" data-new-view-category value="${category}" checked>${CATEGORY_LABELS[category]}</label>`).join('')}</div></div>`,
      onSubmit: () => {
        const name = $('newViewName').value.trim(); if (!name) return false;
        const id = Core.uniqueId('view', name, state.project.views.map(view => view.id));
        const categories = [...els.modalBody.querySelectorAll('[data-new-view-category]:checked')].map(input => input.value);
        commit(() => state.project.views.push({ id, name, description: $('newViewDescription').value.trim(), filter: { categories }, nodes: [], edges: [] }));
        switchView(id); toast(`${name} created`); return true;
      }
    });
  }

  function openDependencyDialog(nodeId) {
    const node = nodeById(nodeId); if (!node) return;
    openForm({ eyebrow: 'Dependency exploration', title: `Explore ${node.name}`, submit: 'Build dependency view', wide: true, body: `
      <div class="modal-note">Creates a normal, reusable view. Canonical objects and relationships are referenced—not duplicated.</div>
      <div class="field"><label>View name</label><input id="dependencyViewName" value="${attr(node.name)} dependencies"></div>
      <div class="modal-grid">
        <div class="field"><label>Direction</label><div class="choice-row"><label><input type="radio" name="direction" value="upstream"><span class="choice-card">Upstream</span></label><label><input type="radio" name="direction" value="both" checked><span class="choice-card">Both</span></label><label><input type="radio" name="direction" value="downstream"><span class="choice-card">Downstream</span></label></div></div>
        <div class="field"><label>Depth</label><select id="dependencyDepth"><option value="1">1 hop</option><option value="2" selected>2 hops</option><option value="3">3 hops</option><option value="all">All connected</option></select></div>
      </div>
      <div class="field"><label>Relationship types</label><div class="checkbox-list">${state.project.edgeTypes.map(type => `<label><input type="checkbox" data-dependency-type value="${attr(type.id)}" checked>${escapeHtml(type.name)}</label>`).join('')}</div></div>`,
      onSubmit: () => {
        const name = $('dependencyViewName').value.trim() || `${node.name} dependencies`;
        const direction = els.modalBody.querySelector('[name=direction]:checked').value;
        const depth = $('dependencyDepth').value;
        const types = [...els.modalBody.querySelectorAll('[data-dependency-type]:checked')].map(input => input.value);
        const result = Core.dependencyTraversal(state.project, nodeId, { direction, depth, types });
        const id = Core.uniqueId('view', name, state.project.views.map(view => view.id));
        commit(() => {
          state.project.views.push({ id, name, description: `${direction} dependencies from ${node.name}, depth ${depth}`, filter: {}, nodes: result.nodeIds.map((id, index) => ({ nodeId: id, x: 60 + (index % 3) * 270, y: 60 + Math.floor(index / 3) * 125 })), edges: result.edgeIds });
        });
        switchView(id); selectNode(nodeId); autoArrange(); toast(`Dependency view created with ${result.nodeIds.length} objects`); return true;
      }
    });
  }

  function openRenameViewDialog() {
    const view = activeView();
    openForm({ eyebrow: 'View settings', title: 'Rename view', submit: 'Save changes', body: `
      <div class="field"><label>Name</label><input id="renameViewName" required value="${attr(view.name)}"></div>
      <div class="field"><label>Stable ID</label><input value="${attr(view.id)}" readonly></div>
      <div class="field"><label>Description</label><textarea id="renameViewDescription">${escapeHtml(view.description)}</textarea></div>`,
      onSubmit: () => { const name = $('renameViewName').value.trim(); if (!name) return false; commit(() => { activeView().name = name; activeView().description = $('renameViewDescription').value; }); return true; }
    });
  }

  function openViewFiltersDialog() {
    const view = activeView();
    const categories = new Set(Array.isArray(view.filter.categories) ? view.filter.categories : CATEGORIES);
    const nodeTypes = new Set(Array.isArray(view.filter.nodeTypes) ? view.filter.nodeTypes : state.project.nodeTypes.map(type => type.id));
    const edgeTypes = new Set(Array.isArray(view.filter.edgeTypes) ? view.filter.edgeTypes : state.project.edgeTypes.map(type => type.id));
    const tags = Array.isArray(view.filter.tags) ? view.filter.tags.join(', ') : '';
    openForm({ eyebrow: 'View projection', title: `Filters for ${view.name}`, submit: 'Apply filters', wide: true, body: `
      <div class="modal-note">Filters affect only this view. They never delete or change canonical objects and relationships.</div>
      <div class="modal-grid">
        <div class="field"><label>Layers</label><div class="checkbox-list">${CATEGORIES.map(category => `<label><input type="checkbox" data-filter-category value="${category}" ${categories.has(category) ? 'checked' : ''}>${CATEGORY_LABELS[category]}</label>`).join('')}</div></div>
        <div class="field"><label>Object types</label><div class="checkbox-list">${state.project.nodeTypes.map(type => `<label><input type="checkbox" data-filter-node-type value="${attr(type.id)}" ${nodeTypes.has(type.id) ? 'checked' : ''}>${escapeHtml(type.name)}</label>`).join('')}</div></div>
      </div>
      <div class="field"><label>Relationship types</label><div class="checkbox-list">${state.project.edgeTypes.map(type => `<label><input type="checkbox" data-filter-edge-type value="${attr(type.id)}" ${edgeTypes.has(type.id) ? 'checked' : ''}>${escapeHtml(type.name)}</label>`).join('')}</div></div>
      <div class="field"><label>Required tags (match any)</label><input id="filterTags" value="${attr(tags)}" placeholder="Leave empty to show every tag"></div>`,
      onSubmit: () => {
        const nextCategories = [...els.modalBody.querySelectorAll('[data-filter-category]:checked')].map(input => input.value);
        const nextNodeTypes = [...els.modalBody.querySelectorAll('[data-filter-node-type]:checked')].map(input => input.value);
        const nextEdgeTypes = [...els.modalBody.querySelectorAll('[data-filter-edge-type]:checked')].map(input => input.value);
        const nextTags = $('filterTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
        commit(() => {
          activeView().filter = { categories: nextCategories, nodeTypes: nextNodeTypes, edgeTypes: nextEdgeTypes };
          if (nextTags.length) activeView().filter.tags = nextTags;
        });
        toast('View filters applied'); return true;
      }
    });
  }

  function duplicateView() {
    const source = activeView(); const name = `${source.name} copy`; const id = Core.uniqueId('view', name, state.project.views.map(view => view.id));
    commit(() => { const copy = Core.clone(source); copy.id = id; copy.name = name; state.project.views.push(copy); }); switchView(id); toast('View duplicated');
  }

  function confirmDeleteView() {
    if (state.project.views.length <= 1) return toast('A project must contain at least one view.', 'warning');
    const view = activeView();
    confirmAction({ title: `Delete “${view.name}”?`, body: 'The view and its layout will be removed. Canonical objects and relationships will remain in the model.', action: 'Delete view', onConfirm: () => {
      commit(() => { state.project.views = state.project.views.filter(item => item.id !== view.id); }); clearSelection(); toast('View deleted');
    }});
  }

  function removeNodesFromView(ids) {
    const present = ids.filter(id => activeView().nodes.some(record => record.nodeId === id));
    if (!present.length) return;
    commit(() => { activeView().nodes = activeView().nodes.filter(record => !present.includes(record.nodeId)); });
    clearSelection(); renderAll(); toast(`${present.length} object${present.length === 1 ? '' : 's'} removed from this view`);
  }

  function confirmDeleteNodes(ids) {
    const nodes = ids.map(nodeById).filter(Boolean); if (!nodes.length) return;
    const relationships = state.project.edges.filter(edge => ids.includes(edge.source) || ids.includes(edge.target));
    const appearances = state.project.views.reduce((sum, view) => sum + view.nodes.filter(record => ids.includes(record.nodeId)).length, 0);
    confirmAction({ eyebrow: 'Delete canonical object', title: nodes.length === 1 ? `Delete “${nodes[0].name}” from the model?` : `Delete ${nodes.length} objects from the model?`,
      body: `This permanently removes ${nodes.length === 1 ? 'the object' : 'these objects'} from all views (${appearances} appearance${appearances === 1 ? '' : 's'}) and deletes ${relationships.length} associated relationship${relationships.length === 1 ? '' : 's'}. This action can be undone during this session.`, action: 'Delete from model', onConfirm: () => {
        commit(() => {
          state.project.nodes = state.project.nodes.filter(node => !ids.includes(node.id));
          state.project.edges = state.project.edges.filter(edge => !ids.includes(edge.source) && !ids.includes(edge.target));
          state.project.views.forEach(view => { view.nodes = view.nodes.filter(record => !ids.includes(record.nodeId)); });
        });
        clearSelection(); renderAll(); toast(`${nodes.length} object${nodes.length === 1 ? '' : 's'} deleted`);
      }
    });
  }

  function deleteEdge(id) {
    const edge = edgeById(id); if (!edge) return;
    commit(() => { state.project.edges = state.project.edges.filter(item => item.id !== id); state.project.views.forEach(view => { view.edges = view.edges.filter(edgeId => edgeId !== id); }); });
    clearSelection(); renderAll(); toast('Relationship deleted');
  }

  function confirmAction({ eyebrow = 'Confirm action', title, body, action, onConfirm }) {
    state.confirmCallback = onConfirm;
    els.confirmEyebrow.textContent = eyebrow;
    els.confirmTitle.textContent = title;
    els.confirmBody.innerHTML = `<p>${escapeHtml(body)}</p>`;
    els.confirmAction.textContent = action;
    els.confirmDialog.showModal();
  }

  function showNodeContext(clientX, clientY, nodeId) {
    const node = nodeById(nodeId); if (!node) return;
    showContext(clientX, clientY, `
      <button data-action="connect"><svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3"></circle><circle cx="18" cy="7" r="3"></circle><path d="m8.5 15.3 7-6.5"></path></svg>Create relationship</button>
      <button data-action="dependencies"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="m7 11 9-4M7 13l9 4"></path></svg>Show dependencies</button>
      <hr><button data-action="remove"><svg viewBox="0 0 24 24"><path d="M4 12h16"></path></svg>Remove from view</button>
      <button class="danger-text" data-action="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"></path></svg>Delete from model…</button>`);
    els.contextMenu.querySelector('[data-action=connect]').onclick = () => { hideContextMenu(); openRelationshipDialog(nodeId); };
    els.contextMenu.querySelector('[data-action=dependencies]').onclick = () => { hideContextMenu(); openDependencyDialog(nodeId); };
    els.contextMenu.querySelector('[data-action=remove]').onclick = () => { hideContextMenu(); removeNodesFromView([nodeId]); };
    els.contextMenu.querySelector('[data-action=delete]').onclick = () => { hideContextMenu(); confirmDeleteNodes([nodeId]); };
  }

  function showEdgeContext(clientX, clientY, edgeId) {
    showContext(clientX, clientY, `<button class="danger-text" data-action="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"></path></svg>Delete relationship</button>`);
    els.contextMenu.querySelector('[data-action=delete]').onclick = () => { hideContextMenu(); deleteEdge(edgeId); };
  }

  function showViewContext(clientX, clientY) {
    showContext(clientX, clientY, `<button data-action="filters">Configure filters…</button><button data-action="rename">Rename view</button><button data-action="duplicate">Duplicate view</button><hr><button class="danger-text" data-action="delete">Delete view…</button>`);
    els.contextMenu.querySelector('[data-action=filters]').onclick = () => { hideContextMenu(); openViewFiltersDialog(); };
    els.contextMenu.querySelector('[data-action=rename]').onclick = () => { hideContextMenu(); openRenameViewDialog(); };
    els.contextMenu.querySelector('[data-action=duplicate]').onclick = () => { hideContextMenu(); duplicateView(); };
    els.contextMenu.querySelector('[data-action=delete]').onclick = () => { hideContextMenu(); confirmDeleteView(); };
  }

  function showContext(clientX, clientY, html) {
    const rect = els.canvasViewport.getBoundingClientRect();
    els.contextMenu.innerHTML = html;
    els.contextMenu.classList.remove('hidden');
    const x = Math.min(rect.width - 210, Math.max(8, clientX - rect.left));
    const y = Math.min(rect.height - 170, Math.max(8, clientY - rect.top));
    els.contextMenu.style.left = `${x}px`; els.contextMenu.style.top = `${y}px`;
  }

  function hideContextMenu() { els.contextMenu.classList.add('hidden'); }

  function searchableNode(node) {
    return [node.name, node.id, node.description, node.type, typeName(node), ...(node.tags || []), ...Object.keys(node.properties || {}), ...Object.values(node.properties || {}).map(String)].join(' ').toLowerCase();
  }

  function renderSearch(query) {
    const words = query.trim().toLowerCase();
    if (!words) return els.searchResults.classList.add('hidden');
    const matches = state.project.nodes.filter(node => words.split(/\s+/).every(word => searchableNode(node).includes(word))).slice(0, 12);
    els.searchResults.innerHTML = matches.length ? matches.map(node => {
      const views = state.project.views.filter(view => view.nodes.some(record => record.nodeId === node.id)); const category = categoryOf(node);
      return `<button class="search-result" data-search-node="${attr(node.id)}" style="${categoryVars(category)}"><span class="result-icon">${escapeHtml(iconLetter(node))}</span><span class="result-copy"><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(typeName(node))} · ${escapeHtml(node.id)}</span></span><span class="result-view">${views.length} view${views.length === 1 ? '' : 's'}</span></button>`;
    }).join('') : '<div class="search-empty">No objects found</div>';
    els.searchResults.classList.remove('hidden');
    els.searchResults.querySelectorAll('[data-search-node]').forEach(button => button.addEventListener('click', () => chooseSearchResult(button.dataset.searchNode)));
  }

  function chooseSearchResult(id) {
    els.searchResults.classList.add('hidden'); els.globalSearch.value = '';
    const inCurrent = activeView().nodes.some(record => record.nodeId === id);
    if (!inCurrent) {
      const containing = state.project.views.find(view => view.nodes.some(record => record.nodeId === id));
      if (containing) switchView(containing.id);
    }
    selectNode(id);
    if (activeView().nodes.some(record => record.nodeId === id)) centerNode(id);
  }

  function validateAndShow() {
    const report = Core.validateProject(state.project);
    const group = (title, items, className) => items.length ? `<section class="report-group ${className}"><h3>${title}</h3>${items.map(item => `<div class="report-item">${escapeHtml(item)}</div>`).join('')}</section>` : '';
    els.reportBody.innerHTML = `<div class="report-summary"><div><strong>${report.errors.length}</strong><span>Blocking errors</span></div><div><strong>${report.warnings.length}</strong><span>Warnings</span></div><div><strong>${report.info.length}</strong><span>Information</span></div></div>
      ${!report.errors.length && !report.warnings.length ? '<div class="modal-note">Project structure is valid and no warnings were found.</div>' : ''}
      ${group('Errors', report.errors, 'errors')}${group('Warnings', report.warnings, 'warnings')}${group('Information', report.info, 'info')}${group('Dependency cycles', report.cycles, 'warnings')}`;
    els.reportDialog.showModal();
  }

  function exportProject() {
    const report = Core.validateProject(state.project);
    if (report.errors.length) { validateAndShow(); toast('Fix structural errors before exporting.', 'error'); return; }
    const serialized = currentCanonical();
    const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${state.project.project.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'Project'}.arch.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.baseline = serialized; state.exportedJustNow = true; renderTopbar(); scheduleSave();
    toast('Deterministic project file exported');
  }

  async function importProject(file) {
    if (!file) return;
    try {
      const source = await file.text();
      const project = Core.parseProject(source);
      state.project = project; state.activeViewId = project.views[0].id; state.past = []; state.future = []; clearSelection();
      state.baseline = Core.canonicalSerialize(project); state.exportedJustNow = true; state.pan = { x: 70, y: 55 }; state.zoom = 1;
      renderAll(); scheduleSave(); requestAnimationFrame(() => fitToScreen(false));
      toast(`${project.project.name} imported`);
    } catch (error) {
      toast(error.message, 'error', 9000);
      els.confirmEyebrow.textContent = 'Import failed'; els.confirmTitle.textContent = 'Could not open project'; els.confirmBody.innerHTML = `<p>${escapeHtml(error.message).replace(/\n/g, '<br>')}</p>`;
      els.confirmAction.classList.add('hidden'); els.confirmCancel.textContent = 'Close'; els.confirmDialog.showModal();
    } finally { els.projectFileInput.value = ''; }
  }

  function toast(message, type = 'success', duration = 3200) {
    const element = document.createElement('div'); element.className = `toast ${type}`;
    element.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
    els.toastRegion.appendChild(element);
    setTimeout(() => element.remove(), duration);
  }

  function focusPropertyName() {
    requestAnimationFrame(() => { const input = $('propName'); if (input) { input.focus(); input.select(); } });
  }

  function bindStaticEvents() {
    els.modalForm.addEventListener('submit', event => {
      event.preventDefault();
      if (event.submitter && event.submitter.value === 'cancel') return els.formDialog.close();
      try { if (!state.modalCallback || state.modalCallback() !== false) els.formDialog.close(); }
      catch (error) { toast(error.message, 'error'); }
    });
    els.reportClose.addEventListener('click', () => els.reportDialog.close());
    els.reportDone.addEventListener('click', () => els.reportDialog.close());
    els.confirmCancel.addEventListener('click', () => { els.confirmDialog.close(); els.confirmAction.classList.remove('hidden'); els.confirmCancel.textContent = 'Cancel'; });
    els.confirmAction.addEventListener('click', () => { els.confirmDialog.close(); if (state.confirmCallback) state.confirmCallback(); state.confirmCallback = null; });
    els.projectName.addEventListener('click', openProjectDetailsDialog);
    els.newProjectBtn.addEventListener('click', openNewProjectDialog);
    els.openProjectBtn.addEventListener('click', () => els.projectFileInput.click());
    els.projectFileInput.addEventListener('change', event => importProject(event.target.files[0]));
    els.validateBtn.addEventListener('click', validateAndShow);
    els.exportBtn.addEventListener('click', exportProject);
    els.newViewBtn.addEventListener('click', openNewViewDialog);
    els.addObjectBtn.addEventListener('click', openNewObjectDialog);
    els.emptyAddObject.addEventListener('click', openNewObjectDialog);
    els.addExistingBtn.addEventListener('click', openBrowseExistingDialog);
    els.emptyAddExisting.addEventListener('click', openBrowseExistingDialog);
    els.viewMenuBtn.addEventListener('click', event => showViewContext(event.clientX, event.clientY));
    els.undoBtn.addEventListener('click', undo); els.redoBtn.addEventListener('click', redo);
    els.selectTool.addEventListener('click', () => setTool('select')); els.connectTool.addEventListener('click', () => setTool(state.tool === 'connect' ? 'select' : 'connect'));
    els.graphCanvas.addEventListener('pointerdown', startPan);
    els.graphCanvas.addEventListener('wheel', event => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.1 : .9, event.clientX, event.clientY); }, { passive: false });
    els.zoomOutBtn.addEventListener('click', () => zoomAt(.85)); els.zoomInBtn.addEventListener('click', () => zoomAt(1.15));
    els.zoomLabel.addEventListener('click', () => { state.zoom = 1; updateViewportTransform(); }); els.fitBtn.addEventListener('click', () => fitToScreen());
    els.autoArrangeBtn.addEventListener('click', autoArrange);
    els.layoutDirectionBtn.addEventListener('click', () => { state.layoutDirection = state.layoutDirection === 'LR' ? 'TB' : 'LR'; renderGraph(); toast(`Layout direction: ${state.layoutDirection === 'LR' ? 'left to right' : 'top to bottom'}`); });
    els.globalSearch.addEventListener('input', event => renderSearch(event.target.value));
    els.globalSearch.addEventListener('keydown', event => { if (event.key === 'Escape') { els.searchResults.classList.add('hidden'); els.globalSearch.blur(); } if (event.key === 'Enter') { const first = els.searchResults.querySelector('[data-search-node]'); if (first) chooseSearchResult(first.dataset.searchNode); } });
    els.helpBtn.addEventListener('click', () => openForm({ eyebrow: 'Quick guide', title: 'Architecture Graph basics', submit: 'Got it', body: `
      <div class="modal-note"><strong>One graph, many views.</strong> Every object is canonical. A view stores only membership, layout, and filters.</div>
      <div class="report-item">Create objects with <strong>New object</strong>, then connect them with the relationship tool.</div>
      <div class="report-item"><strong>Delete</strong> removes selected objects from this view. <strong>Shift+Delete</strong> deletes them from the canonical model.</div>
      <div class="report-item">Use <strong>Show dependencies</strong> to generate a reusable graph from any object.</div>
      <div class="report-item"><strong>Export</strong> creates deterministic <code>.arch.json</code> for Git. Browser autosave never overwrites that file.</div>
      <div class="report-item">Shortcuts: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo, V select, C connect, 0 fit, Delete remove from view.</div>`, onSubmit: () => true }));
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.context-menu, #viewMenuBtn, #nodeMoreBtn')) hideContextMenu();
      if (!event.target.closest('.search-wrap')) els.searchResults.classList.add('hidden');
    });
    window.addEventListener('keydown', handleKeyboard);
  }

  function handleKeyboard(event) {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els.globalSearch.focus(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (editing) return;
    if (event.key.toLowerCase() === 'v') setTool('select');
    if (event.key.toLowerCase() === 'c') setTool('connect');
    if (event.key === '0') fitToScreen();
    if (event.key === 'Escape') { clearSelection(true); setTool('select'); hideContextMenu(); }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (state.selectedEdgeId) return deleteEdge(state.selectedEdgeId);
      const ids = [...state.selectedNodeIds];
      if (event.shiftKey) confirmDeleteNodes(ids); else removeNodesFromView(ids);
    }
  }

  initialize();
})();
