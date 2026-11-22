/* PaperTrail 状态层：单一数据源 + 订阅渲染。所有数据仅存在于内存（浏览器本地）。
   wpOverride 保存用户对工作包主题/追问/提纲的编辑，叠加在引擎生成结果之上。 */
(function (root) {
  'use strict';
  root.PT = root.PT || {};

  var state = {
    view: 'home',
    papers: [],
    result: null,
    generatedAt: null,
    loading: false,
    matrix: { query: '', tag: '', method: '', year: '', comp: '', sort: 'year-desc' },
    relFilter: { support: true, supplement: true, conflict: true, related: true, needs_check: true },
    selectedRelation: null,
    drawerPaperId: null,
    drawerEditing: false,
    importMode: 'append',
    parseReport: null,
    wpOverride: null,
    wpEditing: false,
    relExpanded: false,
    gapExpanded: false,
    demo: { detail: false, conflict: false, gap: false, pack: false }
  };

  function freshDemo() { return { detail: false, conflict: false, gap: false, pack: false }; }

  var listeners = [];
  function get() { return state; }
  function set(patch) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    listeners.forEach(function (fn) { fn(state); });
  }
  function subscribe(fn) { listeners.push(fn); }

  function reanalyze(papers) {
    var result = PT.engine.analyze(papers);
    return { papers: papers, result: result, generatedAt: new Date(), wpOverride: null };
  }

  function loadSamples() {
    var copies = PT.samples.papers.map(function (p) { return Object.assign({}, p, { evidence: p.evidence.map(function (e) { return Object.assign({}, e); }) }); });
    set(Object.assign(reanalyze(copies), { selectedRelation: null, drawerPaperId: null, drawerEditing: false, parseReport: null, wpEditing: false, relExpanded: false, gapExpanded: false, demo: freshDemo() }));
  }

  /* 材料指纹：标题 + 首条证据（去空白、小写），用于重复导入去重。 */
  function paperSig(p) {
    var t = String(p.title || '').replace(/\s+/g, '').toLowerCase();
    var e = ((p.evidence && p.evidence[0] && p.evidence[0].text) || '').replace(/\s+/g, '').toLowerCase();
    return t + '|' + e.slice(0, 60);
  }
  function paperSigsOf(list) {
    var seen = {};
    (list || []).forEach(function (p) { seen[paperSig(p)] = 1; });
    return seen;
  }

  function importPapers(newPapers, mode) {
    var base = mode === 'replace' ? [] : state.papers.slice();
    var total = (newPapers || []).length;
    var skipped = 0;
    var toAdd;
    if (mode === 'replace') {
      toAdd = (newPapers || []).slice();
    } else {
      var seen = paperSigsOf(base);
      toAdd = [];
      (newPapers || []).forEach(function (p) {
        var sig = paperSig(p);
        if (seen[sig]) { skipped++; return; }
        seen[sig] = 1;
        toAdd.push(p);
      });
    }
    var offset = base.length;
    var added = toAdd.map(function (p, i) {
      var n = offset + i + 1;
      var copy = Object.assign({}, p, { id: 'U' + n });
      copy.evidence = (p.evidence || []).map(function (e, j) { return { id: 'E' + n + '-' + (j + 1), text: e.text }; });
      return copy;
    });
    var merged = base.concat(added);
    /* 追加模式下全部重复：不改动现有状态（不重置演示进度/编辑） */
    if (mode !== 'replace' && added.length === 0) {
      return { total: total, added: 0, skipped: skipped, papers: state.papers };
    }
    set(Object.assign(reanalyze(merged), { selectedRelation: null, drawerPaperId: null, drawerEditing: false, relExpanded: false, gapExpanded: false, demo: freshDemo() }));
    return { total: total, added: added.length, skipped: skipped, papers: merged };
  }

  function updatePaper(id, patch) {
    var papers = state.papers.map(function (p) {
      if (p.id !== id) return p;
      var next = Object.assign({}, p, patch, { edited: true });
      return next;
    });
    set(Object.assign(reanalyze(papers), { drawerPaperId: id, drawerEditing: false }));
  }

  function removePaper(id) {
    var papers = state.papers.filter(function (p) { return p.id !== id; });
    set(Object.assign(reanalyze(papers), { selectedRelation: null, drawerPaperId: null, drawerEditing: false }));
  }

  function clearAll() {
    set({ papers: [], result: null, generatedAt: null, selectedRelation: null, drawerPaperId: null, drawerEditing: false, parseReport: null, wpOverride: null, wpEditing: false, relExpanded: false, gapExpanded: false, demo: freshDemo() });
  }

  function paperById(id) {
    if (!state.result) return null;
    return state.result.papers.filter(function (p) { return p.id === id; })[0] || null;
  }

  /* 生效工作包 = 引擎生成 + 用户编辑覆盖 */
  function effectiveWorkpack() {
    if (!state.result) return null;
    var wp = state.result.workpack;
    var o = state.wpOverride;
    if (!o) return wp;
    return Object.assign({}, wp, {
      topic: (o.topic != null && o.topic !== '') ? o.topic : wp.topic,
      questions: o.questions || wp.questions,
      outline: o.outline || wp.outline,
      edited: true
    });
  }
  function setWpOverride(o) { set({ wpOverride: o, wpEditing: false }); }

  root.PT.store = {
    get: get, set: set, subscribe: subscribe,
    loadSamples: loadSamples, importPapers: importPapers, updatePaper: updatePaper,
    removePaper: removePaper, clearAll: clearAll, paperById: paperById,
    effectiveWorkpack: effectiveWorkpack, setWpOverride: setWpOverride
  };
})(typeof self !== 'undefined' ? self : this);