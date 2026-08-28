(function (global) {
  'use strict';

  const SCHEMA_VERSION = 1;

  const DEFAULT_NODE_TYPES = [
    ['person', 'Person', 'people'],
    ['role', 'Role', 'people'],
    ['team', 'Team', 'people'],
    ['organization', 'Organization', 'people'],
    ['capability', 'Capability', 'operational'],
    ['function', 'Function', 'operational'],
    ['service', 'Service', 'logical'],
    ['application', 'Application', 'logical'],
    ['logical_component', 'Logical Component', 'logical'],
    ['system', 'System', 'physical'],
    ['device', 'Device', 'physical'],
    ['server', 'Server', 'physical'],
    ['network', 'Network', 'physical'],
    ['gateway', 'Gateway', 'physical'],
    ['interface', 'Interface', 'physical'],
    ['facility', 'Facility', 'physical'],
    ['data_type', 'Data Type', 'data'],
    ['data_store', 'Data Store', 'data'],
    ['message', 'Message', 'data'],
    ['stream', 'Stream', 'data']
  ].map(([id, name, category]) => ({ id, name, category }));

  const EDGE_NAMES = {
    depends_on: 'Depends on', part_of: 'Part of', contains: 'Contains',
    provides: 'Provides', consumes: 'Consumes', implements: 'Implements',
    connected_to: 'Connected to', hosted_on: 'Hosted on', runs_on: 'Runs on',
    sends: 'Sends', receives: 'Receives', owns: 'Owns', manages: 'Manages',
    operates: 'Operates', supports: 'Supports', requires: 'Requires',
    interfaces_with: 'Interfaces with'
  };

  const DEFAULT_EDGE_TYPES = Object.entries(EDGE_NAMES).map(([id, name]) => ({
    id,
    name,
    direction: ['connected_to', 'interfaces_with'].includes(id) ? 'undirected' : 'directed'
  }));

  const DEFAULT_VIEWS = [
    ['view.overview', 'Default', []]
  ];

  function slugify(value, fallback = 'item') {
    const slug = String(value || '').normalize('NFKD').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
  }

  function uniqueId(prefix, name, existingIds) {
    const ids = new Set(existingIds || []);
    const base = `${prefix}.${slugify(name)}`;
    if (!ids.has(base)) return base;
    let suffix = 2;
    while (ids.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function compareIds(a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function createEmptyProject(name = 'Untitled Architecture') {
    return {
      schemaVersion: SCHEMA_VERSION,
      project: {
        id: `project.${slugify(name, 'untitled-architecture')}`,
        name,
        description: ''
      },
      nodeTypes: clone(DEFAULT_NODE_TYPES),
      edgeTypes: clone(DEFAULT_EDGE_TYPES),
      nodes: [],
      edges: [],
      views: DEFAULT_VIEWS.map(([id, viewName, categories]) => ({
        id,
        name: viewName,
        description: '',
        filter: categories.length ? { categories } : {},
        nodes: [],
        edges: []
      }))
    };
  }

  function sortObject(value) {
    if (Array.isArray(value)) return value.map(sortObject);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortObject(value[key]);
      return result;
    }, {});
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function normalizeNodeType(type) {
    return {
      id: text(type.id),
      name: text(type.name),
      category: text(type.category) || 'logical'
    };
  }

  function normalizeEdgeType(type) {
    const normalized = {
      id: text(type.id),
      name: text(type.name),
      direction: type.direction === 'undirected' ? 'undirected' : 'directed'
    };
    if (type.visual && Object.keys(type.visual).length) normalized.visual = sortObject(type.visual);
    return normalized;
  }

  function normalizeNode(node) {
    return {
      id: text(node.id),
      type: text(node.type),
      name: text(node.name),
      description: text(node.description),
      tags: [...new Set(Array.isArray(node.tags) ? node.tags.map(String).filter(Boolean) : [])].sort(),
      properties: sortObject(node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties) ? node.properties : {})
    };
  }

  function normalizeEdge(edge) {
    return {
      id: text(edge.id),
      source: text(edge.source),
      target: text(edge.target),
      type: text(edge.type),
      description: text(edge.description),
      properties: sortObject(edge.properties && typeof edge.properties === 'object' && !Array.isArray(edge.properties) ? edge.properties : {})
    };
  }

  function normalizeViewNode(record) {
    const x = Number(record.x);
    const y = Number(record.y);
    return {
      nodeId: text(record.nodeId),
      x: Number.isFinite(x) ? Math.round(x) : 0,
      y: Number.isFinite(y) ? Math.round(y) : 0,
      ...(record.hidden === true ? { hidden: true } : {})
    };
  }

  function normalizeFilter(filter) {
    const normalized = sortObject(filter && typeof filter === 'object' && !Array.isArray(filter) ? filter : {});
    for (const key of ['categories', 'nodeTypes', 'edgeTypes', 'tags']) {
      if (Array.isArray(normalized[key])) normalized[key] = [...new Set(normalized[key].map(String))].sort();
    }
    return normalized;
  }

  function normalizeView(view) {
    const result = {
      id: text(view.id),
      name: text(view.name),
      description: text(view.description),
      filter: normalizeFilter(view.filter),
      nodes: (Array.isArray(view.nodes) ? view.nodes : []).map(normalizeViewNode).sort((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0),
      edges: [...new Set(Array.isArray(view.edges) ? view.edges.map(String) : [])].sort()
    };
    return result;
  }

  function normalizeProject(input) {
    const data = input || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      project: {
        id: text(data.project && data.project.id),
        name: text(data.project && data.project.name),
        description: text(data.project && data.project.description)
      },
      nodeTypes: (Array.isArray(data.nodeTypes) ? data.nodeTypes : []).map(normalizeNodeType).sort(compareIds),
      edgeTypes: (Array.isArray(data.edgeTypes) ? data.edgeTypes : []).map(normalizeEdgeType).sort(compareIds),
      nodes: (Array.isArray(data.nodes) ? data.nodes : []).map(normalizeNode).sort(compareIds),
      edges: (Array.isArray(data.edges) ? data.edges : []).map(normalizeEdge).sort(compareIds),
      views: (Array.isArray(data.views) ? data.views : []).map(normalizeView).sort(compareIds)
    };
  }

  function canonicalSerialize(project) {
    return `${canonicalStringify(normalizeProject(project))}\n`;
  }

  const KEY_ORDERS = {
    '$': ['schemaVersion', 'project', 'nodeTypes', 'edgeTypes', 'nodes', 'edges', 'views'],
    '$.project': ['id', 'name', 'description'],
    '$.nodeTypes[]': ['id', 'name', 'category'],
    '$.edgeTypes[]': ['id', 'name', 'direction', 'visual'],
    '$.nodes[]': ['id', 'type', 'name', 'description', 'tags', 'properties'],
    '$.edges[]': ['id', 'source', 'target', 'type', 'description', 'properties'],
    '$.views[]': ['id', 'name', 'description', 'filter', 'nodes', 'edges'],
    '$.views[].nodes[]': ['nodeId', 'x', 'y', 'hidden']
  };

  function canonicalStringify(value, level = 0, path = '$') {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    const indent = '  '.repeat(level);
    const childIndent = '  '.repeat(level + 1);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      return `[\n${value.map(item => `${childIndent}${canonicalStringify(item, level + 1, `${path}[]`)}`).join(',\n')}\n${indent}]`;
    }
    const preferred = KEY_ORDERS[path] || [];
    const available = new Set(Object.keys(value));
    const keys = [...preferred.filter(key => available.delete(key)), ...[...available].sort()];
    if (!keys.length) return '{}';
    return `{\n${keys.map(key => `${childIndent}${JSON.stringify(key)}: ${canonicalStringify(value[key], level + 1, `${path}.${key}`)}`).join(',\n')}\n${indent}}`;
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') throw new Error('The project file must contain a JSON object.');
    if (data.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported schemaVersion ${JSON.stringify(data.schemaVersion)}. This app supports version ${SCHEMA_VERSION}.`);
    }
    return data;
  }

  function duplicates(items) {
    const seen = new Set();
    return items.map(item => item && item.id).filter(id => {
      if (!id || seen.has(id)) return seen.has(id);
      seen.add(id);
      return false;
    });
  }

  function dependencyCycles(project) {
    const relevant = new Set(['depends_on', 'requires']);
    const adjacency = new Map(project.nodes.map(node => [node.id, []]));
    project.edges.filter(edge => relevant.has(edge.type)).forEach(edge => {
      if (adjacency.has(edge.source)) adjacency.get(edge.source).push(edge.target);
    });
    const color = new Map();
    const stack = [];
    const found = new Set();
    function visit(id) {
      color.set(id, 1);
      stack.push(id);
      for (const next of adjacency.get(id) || []) {
        if (!color.get(next)) visit(next);
        else if (color.get(next) === 1) {
          const start = stack.indexOf(next);
          if (start >= 0) found.add([...stack.slice(start), next].join(' → '));
        }
      }
      stack.pop();
      color.set(id, 2);
    }
    adjacency.forEach((_, id) => { if (!color.get(id)) visit(id); });
    return [...found].sort();
  }

  function validateProject(input) {
    const errors = [];
    const warnings = [];
    const info = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { errors: ['Project must be a JSON object.'], warnings, info, cycles: [] };
    }
    if (input.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`);
    if (!input.project || !input.project.id) errors.push('Project ID is required.');
    if (!input.project || !input.project.name) errors.push('Project name is required.');
    for (const key of ['nodeTypes', 'edgeTypes', 'nodes', 'edges', 'views']) {
      if (!Array.isArray(input[key])) errors.push(`${key} must be an array.`);
    }
    if (errors.some(message => message.endsWith('must be an array.'))) return { errors, warnings, info, cycles: [] };

    for (const [label, items] of [['node type', input.nodeTypes], ['edge type', input.edgeTypes], ['node', input.nodes], ['edge', input.edges], ['view', input.views]]) {
      const duplicateIds = duplicates(items);
      if (duplicateIds.length) errors.push(`Duplicate ${label} ID${duplicateIds.length > 1 ? 's' : ''}: ${[...new Set(duplicateIds)].join(', ')}.`);
      items.forEach((item, index) => { if (!item || !item.id) errors.push(`${label} at index ${index} has no ID.`); });
    }

    const nodeIds = new Set(input.nodes.map(node => node.id));
    const nodeTypeIds = new Set(input.nodeTypes.map(type => type.id));
    const edgeTypeIds = new Set(input.edgeTypes.map(type => type.id));
    input.nodes.forEach(node => {
      if (!node.name) warnings.push(`Node ${node.id || '(unknown)'} has no name.`);
      if (!nodeTypeIds.has(node.type)) errors.push(`Node ${node.id} references unknown type ${node.type}.`);
      if (!node.description) info.push(`Node ${node.id} has no description.`);
    });
    input.edges.forEach(edge => {
      if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} has missing source ${edge.source}.`);
      if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} has missing target ${edge.target}.`);
      if (!edgeTypeIds.has(edge.type)) errors.push(`Edge ${edge.id} references unknown type ${edge.type}.`);
    });
    const usedNodes = new Set();
    input.views.forEach(view => {
      const memberIds = new Set();
      (view.nodes || []).forEach(record => {
        if (memberIds.has(record.nodeId)) errors.push(`View ${view.id} contains node ${record.nodeId} more than once.`);
        memberIds.add(record.nodeId);
        usedNodes.add(record.nodeId);
        if (!nodeIds.has(record.nodeId)) errors.push(`View ${view.id} references missing node ${record.nodeId}.`);
      });
    });
    const orphanNodes = input.nodes.filter(node => !usedNodes.has(node.id));
    if (orphanNodes.length) warnings.push(`${orphanNodes.length} object${orphanNodes.length === 1 ? '' : 's'} appear in no views.`);
    const names = new Map();
    input.nodes.forEach(node => names.set(String(node.name).toLowerCase(), (names.get(String(node.name).toLowerCase()) || 0) + 1));
    const duplicateNames = [...names.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    if (duplicateNames.length) warnings.push(`Duplicate object names: ${duplicateNames.join(', ')}.`);
    const cycles = dependencyCycles(input);
    if (cycles.length) warnings.push(`${cycles.length} dependency cycle${cycles.length === 1 ? '' : 's'} detected.`);
    info.unshift(`${input.nodes.length} objects, ${input.edges.length} relationships, ${input.views.length} views.`);
    return { errors, warnings, info, cycles };
  }

  function parseProject(source) {
    if (/^(<{7}|={7}|>{7})/m.test(source)) {
      throw new Error('This file contains unresolved Git merge conflicts. Resolve the conflict before importing the project.');
    }
    let parsed;
    try { parsed = JSON.parse(source); }
    catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    const migrated = migrate(parsed);
    const report = validateProject(migrated);
    if (report.errors.length) throw new Error(`Project validation failed:\n• ${report.errors.join('\n• ')}`);
    return normalizeProject(migrated);
  }

  function dependencyTraversal(project, startId, options = {}) {
    const direction = options.direction || 'both';
    const depth = options.depth === 'all' ? Infinity : Math.max(1, Number(options.depth) || 1);
    const allowedTypes = options.types && options.types.length ? new Set(options.types) : null;
    const visited = new Set([startId]);
    const edgeIds = new Set();
    let frontier = [startId];
    let hop = 0;
    while (frontier.length && hop < depth) {
      const next = [];
      project.edges.forEach(edge => {
        if (allowedTypes && !allowedTypes.has(edge.type)) return;
        let candidate = null;
        if ((direction === 'downstream' || direction === 'both') && frontier.includes(edge.source)) candidate = edge.target;
        if ((direction === 'upstream' || direction === 'both') && frontier.includes(edge.target)) candidate = edge.source;
        if (candidate) {
          edgeIds.add(edge.id);
          if (!visited.has(candidate)) { visited.add(candidate); next.push(candidate); }
        }
      });
      frontier = next;
      hop += 1;
    }
    return { nodeIds: [...visited].sort(), edgeIds: [...edgeIds].sort() };
  }

  function projectStats(project) {
    const typeMap = new Map(project.nodeTypes.map(type => [type.id, type.category]));
    const categories = { people: 0, operational: 0, logical: 0, physical: 0, data: 0 };
    project.nodes.forEach(node => {
      const category = typeMap.get(node.type) || 'logical';
      categories[category] = (categories[category] || 0) + 1;
    });
    const membership = new Set(project.views.flatMap(view => (view.nodes || []).map(record => record.nodeId)));
    return {
      nodes: project.nodes.length,
      edges: project.edges.length,
      views: project.views.length,
      categories,
      orphans: project.nodes.filter(node => !membership.has(node.id)).length,
      cycles: dependencyCycles(project).length
    };
  }

  const api = {
    SCHEMA_VERSION, DEFAULT_NODE_TYPES, DEFAULT_EDGE_TYPES, DEFAULT_VIEWS,
    slugify, uniqueId, clone, createEmptyProject, normalizeProject,
    canonicalSerialize, validateProject, parseProject, dependencyTraversal,
    dependencyCycles, projectStats
  };

  global.ArchitectureCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
