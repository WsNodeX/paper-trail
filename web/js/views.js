/* PaperTrail 视图层：纯函数渲染 HTML 字符串，事件由 app.js 统一委托。 */
(function (root) {
  'use strict';
  root.PT = root.PT || {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var REL_META = {
    support: { label: '支持', shape: '●', color: 'var(--support)', hex: '#1a7f5a', chip: 'chip-support' },
    supplement: { label: '补充', shape: '◆', color: 'var(--supplement)', hex: '#2b6cb0', chip: 'chip-supplement' },
    conflict: { label: '冲突', shape: '▲', color: 'var(--conflict)', hex: '#b4432f', chip: 'chip-conflict' },
    needs_check: { label: '待核验', shape: '?', color: 'var(--copper)', hex: '#a5522a', chip: 'chip-needs' },
    related: { label: '相关线索', shape: '◇', color: 'var(--warn)', hex: '#a06a12', chip: 'chip-warn' },
    incomparable: { label: '不可直接比较', shape: '▨', color: 'var(--gap)', hex: '#7c5cbf', chip: 'chip-gap' }
  };

  /* 证据片段是否直接支撑该关系的结果变量；不支撑则明确标注，避免误用相邻/中介证据。 */
  function evSupportNote(r, e) {
    if (!r.outcomeKey || !e || !e.supports) return '';
    var ok = (String(r.outcomeKey).indexOf('sleep') === 0) ? (e.supports === 'sleep') : (e.supports === r.outcomeKey);
    return ok ? '' : ' <span class="ev-mismatch" title="该证据片段不支持当前结论的结果变量">该片段不直接支持此结论</span>';
  }

  function relTypeChip(t) {
    var m = REL_META[t];
    if (!m) return '';
    return '<span class="chip ' + m.chip + '"><span class="rel-shape" aria-hidden="true">' + m.shape + '</span>' + m.label + '</span>';
  }

  function anyRelationById(s, id) {
    if (!s.result) return null;
    var all = (s.result.relations || []).concat(s.result.incomparables || []);
    return all.filter(function (x) { return x.id === id; })[0] || null;
  }

  /* 比较维度：紧凑标签（差异维度）/ 详情表格 */
  function dimsCompact(r) {
    var diff = (r.dims || []).filter(function (d) { return !d.same; });
    if (!diff.length) return '<span class="dim-pill same">关键维度一致</span>';
    return diff.map(function (d) {
      return '<span class="dim-pill" title="' + esc(d.label + '：' + d.a + ' vs ' + d.b) + '">' + esc(d.label) + '不同</span>';
    }).join('');
  }
  function dimsTable(r) {
    var rows = (r.dims || []).map(function (d) {
      return '<tr class="' + (d.same ? 'same' : 'diff') + '"><td class="cmp-k">' + esc(d.label) + '</td><td>' + esc(d.a) + '</td><td>' + esc(d.b) + '</td><td class="cmp-flag">' + (d.same ? '✓ 相近' : '差异') + '</td></tr>';
    }).join('');
    return '<table class="cmp-table"><thead><tr><th>比较维度</th><th>' + esc(r.aId) + '</th><th>' + esc(r.bId) + '</th><th>是否可比</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  var ICONS = {
    lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v6"/></svg>',
    warn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2.5 20h19L12 3z" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m4.5 12.5 5 5 10-11"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>',
    doc: '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 3h9l5 5v13H5z" stroke-linejoin="round"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/></svg>',
    graph: '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="8" r="2.6"/><circle cx="10" cy="18" r="2.6"/><path d="M8.4 6.8 15.5 7.6M7 8.4l2.2 7M16.6 10.2l-4.4 6"/></svg>',
    pack: '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3.5 12h17"/></svg>',
    upload: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke-linejoin="round"/></svg>'
  };

  function sourceLabel(p) {
    if (p.isSample) return '示例材料';
    return p.edited ? '用户导入 · 已编辑' : '用户导入';
  }
  function sourceChip(p) {
    return '<span class="chip ' + (p.isSample ? 'chip-sample' : 'chip-teal') + '" style="font-size:10.5px;min-height:18px;padding:1px 7px">' + esc(sourceLabel(p)) + '</span>';
  }

  function privacyBanner() {
    return '<div class="banner banner-privacy">' + ICONS.lock + '<span><b>本页面不会上传你的材料。</b>所有解析、整理与导出均在浏览器本地完成，刷新页面后数据即清空。</span></div>';
  }

  function emptyState(icon, title, desc, withSample) {
    return '<div class="empty">' + ICONS[icon] + '<h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p>' +
      '<button class="btn btn-primary" data-action="load-sample">一键体验示例</button>' +
      (withSample ? '<button class="btn btn-secondary" data-action="go" data-view="import">导入我的材料</button>' : '') +
      '</div>';
  }

  function srcChips(ids) {
    if (!ids || !ids.length) return '<span class="chip" style="font-size:11px">用户补充 · 无自动来源</span>';
    return '<span class="wp-sources">' + ids.map(function (id) {
      return '<button class="src-chip" data-action="open-paper" data-id="' + esc(id) + '" aria-label="查看文献 ' + esc(id) + ' 的详情" title="查看文献详情">' + esc(id) + '</button>';
    }).join('') + '</span>';
  }

  /* 示例/导入混合时的来源徽标（矩阵与工作包共用，避免文案漂移）。非混合返回 ''。 */
  function mixedBadge(s, cls) {
    var nS = (s.papers || []).filter(function (p) { return p.isSample; }).length;
    var nU = (s.papers || []).length - nS;
    if (!nS || !nU) return '';
    return '<span class="' + (cls || 'mixed-hint') + '" style="color:var(--warn)">' + nS + ' 篇示例 + ' + nU + ' 篇导入 · 混在一起分析</span>';
  }

  function evidenceBlock(ev, result) {
    return (ev || []).map(function (e) {
      var p = result.papers.filter(function (x) { return x.id === e.paperId; })[0];
      return '<blockquote class="ev-direct"><span class="ev-id">' + esc(e.evidenceId || e.paperId) + '</span> ' + esc(e.text) +
        (p && p.isSample ? ' <span class="chip chip-sample" style="font-size:10px;min-height:16px;padding:0 6px">示例材料</span>' : '') +
        '<div class="ev-src">—— ' + esc(e.paperId) + (p ? '《' + esc(p.title) + '》' : '') + ' · 材料直接内容</div></blockquote>';
    }).join('');
  }

  function compBar(p) {
    var cls = p.completeness >= 90 ? '' : p.completeness >= 60 ? ' mid' : ' low';
    return '<div class="completeness"><span class="comp-bar' + cls + '"><i style="width:' + p.completeness + '%"></i></span><span class="comp-num">' + p.completeness + '%</span><span class="chip" style="font-size:10.5px;min-height:18px;padding:1px 7px">' + esc(p.completenessLevel) + '</span></div>';
  }

  /* ================= 首页 ================= */
  function home(s) {
    var hasData = s.papers.length > 0;
    var sampleAnalysis = PT.engine.analyze(PT.samples.papers);
    var sstats = sampleAnalysis.workpack.stats;
    var sampleRows = PT.samples.papers.map(function (p) {
      return '<div class="preview-row"><span class="pid">' + p.id + '</span><span class="pt">' + esc(p.title.length > 26 ? p.title.slice(0, 26) + '…' : p.title) + '</span><span class="py">' + p.year + '</span></div>';
    }).join('');
    return '' +
      '<section class="hero">' +
      '<div class="hero-grid">' +
      '<div>' +
      '<div class="eyebrow">StudyHack · 学习科研赛道</div>' +
      '<h1>把一堆论文，整理成一份<em>可追溯的证据工作包</em></h1>' +
      '<p class="hero-lead"><b>PaperTrail 论文证据链工作台</b>面向正在写课程论文、毕业论文与科研综述的大学生：把 5～20 篇论文的摘要或笔记交给它，得到文献证据矩阵、观点关系图与可以直接继续写作的综述提纲——每一条结论都能回溯到原文证据。</p>' +
      '<div class="hero-cta">' +
      '<button class="btn btn-primary btn-lg" data-action="load-sample"' + (s.loading === 'sample' ? ' disabled' : '') + '>' +
      (s.loading === 'sample' ? '<span class="spin"></span>正在整理示例材料…' : '⚡ 一键体验示例（6 篇模拟论文）') + '</button>' +
      '<button class="btn btn-secondary btn-lg" data-action="go" data-view="import">导入我的材料</button>' +
      '</div>' +
      '<div class="hero-privacy">' + ICONS.lock + ' 无需注册 · 无需 API Key · 材料只在浏览器本地处理，不会上传</div>' +
      (hasData ? '<div class="banner banner-success" style="margin-top:16px">' + ICONS.check + '<span>工作台已有 <b>' + s.papers.length + '</b> 篇文献。<button class="btn btn-sm btn-secondary" style="margin-left:8px" data-action="go" data-view="matrix">继续整理 →</button></span></div>' : '') +
      '</div>' +
      '<div class="hero-side">' +
      '<div class="card preview-card">' +
      '<h3>' + ICONS.doc.replace('width="46" height="46"', 'width="18" height="18"') + ' 示例主题：大学生短视频使用与学习效率</h3>' +
      sampleRows +
      '<div class="preview-rel">' +
      '<span class="chip chip-support">支持 ×' + sstats.support + '</span><span class="chip chip-conflict">冲突 ×' + sstats.conflict + '</span><span class="chip chip-supplement">补充 ×' + sstats.supplement + '</span><span class="chip chip-warn">相关线索 ×' + sstats.related + '</span><span class="chip chip-gap">研究空白 ×' + sstats.gap + '</span>' +
      '</div>' +
      '<p style="font-size:11.5px;color:var(--ink-faint);margin:10px 0 0">预计体验结果：6 篇文献矩阵 + ' + (sstats.relations + sstats.incomparable) + ' 组可比性分析（' + sstats.relations + ' 条可判定关系、' + sstats.incomparable + ' 组不可直接比较）+ ' + sstats.gap + ' 项空白 + 八模块综述工作包。示例论文均为虚构数据。</p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="hero-facts" style="margin-top:26px">' +
      fact('给谁用', '写课程论文、毕业论文、科研综述的大学生，尤其是已收集 5～20 篇文献、不知从何下笔的人。') +
      fact('解决什么', '把「读了一堆论文却理不清」变成「每篇研究了什么、证据是什么、彼此支持还是冲突、空白在哪里」。') +
      fact('输入什么', '多篇论文摘要、结构化笔记，或 TXT / Markdown 文件；支持粘贴与上传，自动识别分篇。') +
      fact('得到什么', '文献证据矩阵 + 观点关系图 + 八模块综述工作包，可复制 / 下载 Markdown、打印 A4 报告。') +
      '</div>' +
      '<div class="steps">' +
      step(1, '输入材料', '粘贴摘要或上传 TXT / Markdown，本地规则引擎自动分篇并抽取字段。') +
      step(2, '分析证据', '在证据矩阵中逐篇核对，在关系图中查看支持、补充、冲突与研究空白。') +
      step(3, '输出工作包', '生成带来源引用的综述提纲，可编辑后导出 Markdown 或打印 A4 报告。') +
      '</div>' +
      '</section>';
  }
  function fact(title, body) {
    return '<div class="fact"><b><span class="dot"></span>' + esc(title) + '</b><p>' + esc(body) + '</p></div>';
  }
  function step(n, title, body) {
    return '<div class="card step"><div class="step-num">0' + n + '</div><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' +
      (n < 3 ? '<span class="step-arrow">→</span>' : '') + '</div>';
  }

  /* ================= 导入材料 ================= */
  var EXAMPLE_FORMAT = '标题：短视频碎片化使用与大学生注意力\n作者：张三, 李四\n年份：2024\n研究问题：碎片化使用是否损害课堂注意力？\n研究对象：某高校 600 名本科生\n方法：横断面问卷调查\n样本量：600 人\n结论：碎片化切换频率与课堂走神次数正相关，损害注意力维持。\n局限：横断面设计无法推断因果；注意力为自评。\n证据片段：切换频率每增加 1 次/小时，走神次数 +0.8（p<0.05）。\n标签：注意力, 碎片化使用\n---\n标题：教育类短视频的学习增益实验\n作者：王五\n方法：随机对照实验\n样本量：120 人\n结论：教育类短视频显著提升知识后测成绩。\n局限：干预仅 4 周，长期效果未知。';

  function fieldRecognition(p) {
    var got = [], miss = p.missing || [];
    [['title', '标题'], ['authors', '作者'], ['year', '年份'], ['question', '研究问题'], ['subjects', '研究对象'], ['method', '方法'], ['sampleSize', '样本量'], ['conclusion', '结论'], ['limitations', '局限'], ['evidence', '证据']].forEach(function (f) {
      var v = p[f[0]];
      var has = f[0] === 'evidence' ? (v && v.length) : (v !== null && v !== undefined && v !== '');
      if (has) got.push(f[1]);
    });
    return '<div class="fr-line"><span class="fr-got">已识别：' + esc(got.join('、') || '无') + '</span>' +
      (miss.length ? '<span class="fr-miss">缺失：' + esc(miss.join('、')) + '</span>' : '<span class="fr-got">字段齐全</span>') + '</div>';
  }

  function importView(s) {
    var report = s.parseReport;
    var reportHtml = '';
    if (s.loading === 'parse') {
      reportHtml = '<div class="banner banner-privacy" style="margin-top:16px"><span class="spin" style="border-color:rgba(14,116,102,.25);border-top-color:var(--teal)"></span> 正在本地解析材料…</div>';
    } else if (report) {
      if (report.papers.length) {
        reportHtml += '<div class="banner banner-success" style="margin-top:16px">' + ICONS.check + '<span>成功识别 <b>' + report.papers.length + '</b> 篇文献' +
          (report.fileNames && report.fileNames.length ? '（来自 ' + report.fileNames.length + ' 个文件）' : '') +
          '，已' + (s.importMode === 'replace' ? '替换' : '追加到') + '工作台，共 ' + s.papers.length + ' 篇。矩阵 / 关系 / 工作包已同步更新。' +
          '<span style="display:block;margin-top:6px;color:var(--warn);font-weight:600">⚠ 数据只在当前页面内存中：刷新或关闭页面会清空，建议先到「综述工作包」复制 / 下载 Markdown 留档。</span>' +
          '<button class="btn btn-sm btn-secondary" style="margin-top:8px" data-action="go" data-view="matrix">前往文献矩阵 →</button></span></div>' +
          '<ul class="parse-success-list">' + report.papers.map(function (p) {
            return '<li style="flex-wrap:wrap"><span class="pid">' + esc(p.id) + '</span><span>' + esc(p.title) + '</span>' + sourceChip(p) +
              '<span class="chip" style="margin-left:auto">' + esc(p.completenessLevel) + ' ' + p.completeness + '%</span>' +
              '<button class="btn btn-sm btn-ghost" data-action="open-paper" data-id="' + esc(p.id) + '">查看 / 编辑字段</button>' +
              fieldRecognition(p) + '</li>';
          }).join('') + '</ul>';
      }
      if (report.errors.length) {
        reportHtml += '<div class="parse-errors"><div class="banner banner-error">' + ICONS.warn + '<span><b>' + report.errors.length + ' 个段落解析失败</b>，未计入工作台。请按以下建议修复后重新导入：</span></div>' +
          report.errors.map(function (e) {
            return '<div class="parse-error-item"><div class="pe-reason">✕ ' + esc(e.reason) + '</div>' +
              (e.preview ? '<div class="pe-preview">问题段落开头：' + esc(e.preview) + '…</div>' : '') +
              '<p class="pe-fix">修复建议：' + esc(e.suggestion) + '</p></div>';
          }).join('') +
          '<details class="pe-format"><summary>查看可识别的格式示例</summary><pre>' + esc(EXAMPLE_FORMAT.split('---')[0].trim()) + '</pre></details>' +
          '<button class="btn btn-secondary btn-sm" data-action="focus-input">重新导入（回到输入框）</button>' +
          '</div>';
      }
    }

    return '' +
      '<div class="section-head"><div><h2>导入材料</h2><p class="sub">粘贴多篇摘要，或上传 TXT / Markdown 文件。支持「标题：」标注格式、--- 分隔线与 Markdown 标题自动分篇。</p></div>' +
      (s.papers.length ? '<button class="btn btn-danger-ghost btn-sm" data-action="clear-all">清空当前材料（' + s.papers.length + ' 篇）</button>' : '') + '</div>' +
      privacyBanner() +
      '<div class="import-grid">' +
      '<div class="card card-pad">' +
      '<label for="material-input" style="font-weight:600;font-size:14px;display:block;margin-bottom:8px">粘贴论文摘要 / 笔记</label>' +
      '<textarea id="material-input" class="material-input" placeholder="在此粘贴一篇或多篇论文摘要。多篇之间用 --- 分隔，或以「标题：」/ Markdown 标题开头。也可以直接粘贴自由格式的摘要段落，引擎会尽力抽取字段。">' + esc(s.importText || '') + '</textarea>' +
      '<div class="dropzone" id="dropzone" data-action="choose-files" role="button" tabindex="0" aria-label="上传 TXT 或 Markdown 文件">' +
      ICONS.upload +
      '<div class="dz-title">点击选择或拖拽文件到此处</div>' +
      '<p>支持 .txt / .md / .markdown，可多选；单文件建议 &lt; 2MB；每个文件默认视为一篇文献</p>' +
      '<input type="file" id="file-input" accept=".txt,.md,.markdown,text/plain,text/markdown" multiple hidden>' +
      '</div>' +
      '<div class="import-actions">' +
      '<div class="import-mode" role="group" aria-label="导入方式" style="flex-basis:100%">' +
      '<button data-action="set-import-mode" data-mode="append" aria-pressed="' + (s.importMode === 'append') + '" title="保留现有材料，新导入并入（结果会混合两组材料）">模式：追加到现有材料（点此切换为替换）</button>' +
      '<button data-action="set-import-mode" data-mode="replace" aria-pressed="' + (s.importMode === 'replace') + '" title="清空现有材料，仅保留本次导入">模式：替换现有材料（点此切换为追加）</button>' +
      '</div>' +
      (function () {
        var n = s.papers.length, label;
        if (s.loading === 'parse') label = '<span class="spin"></span>解析中…';
        else if (s.importMode === 'append') label = '解析并追加到现有 ' + n + ' 篇';
        else label = n ? ('解析并替换现有 ' + n + ' 篇为新材料') : '解析并导入';
        return '<button class="btn btn-primary" data-action="parse-text"' + (s.loading === 'parse' ? ' disabled' : '') + '>' + label + '</button>';
      })() +
      '<button class="btn btn-ghost" data-action="fill-example">填入格式示例</button>' +
      '<button class="btn btn-ghost" data-action="load-sample">载入 6 篇示例</button>' +
      '</div>' +
      reportHtml +
      '</div>' +
      '<div class="card card-pad help-card">' +
      '<h3 style="font-size:15px">识别规则说明</h3>' +
      '<details open><summary>推荐的标注格式（识别最准确）</summary><pre>' + esc(EXAMPLE_FORMAT.split('---')[0].trim()) + '</pre></details>' +
      '<details><summary>自动分篇的三种方式</summary><p style="font-size:13px;color:var(--ink-soft)">① 分隔线：单独一行的 ---、===、***；② Markdown 标题：# 或 ## 开头的文献标题；③ 编号 / 标注：「1.」「文献2」「标题：」开头。无任何标记时，整段视为一篇文献。</p></details>' +
      '<details><summary>字段如何抽取与完整度</summary><p style="font-size:13px;color:var(--ink-soft)">优先读取「研究问题：」「方法：」「结论：」等标注；无标注时按关键词与句式启发式抽取。' + esc(PT.engine.completenessRule()) + '</p></details>' +
      '<details><summary>隐私与数据边界</summary><p style="font-size:13px;color:var(--ink-soft)">材料只存在于当前页面内存中，不写入服务器、不写入本地存储，刷新即清空。当前版本使用本地规则引擎，不调用任何外部模型。</p></details>' +
      '</div>' +
      '</div>';
  }

  /* ================= 文献矩阵 ================= */
  function filteredPapers(s) {
    if (!s.result) return [];
    var q = (s.matrix.query || '').trim().toLowerCase();
    var m = s.matrix;
    var list = s.result.papers.filter(function (p) {
      if (m.tag && (p.tags || []).indexOf(m.tag) < 0) return false;
      if (m.method && (p.methodType || '方法未识别') !== m.method) return false;
      if (m.year && String(p.year || '') !== m.year) return false;
      if (m.comp) {
        if (m.comp === 'full' && p.completeness < 90) return false;
        if (m.comp === 'mid' && (p.completeness < 60 || p.completeness >= 90)) return false;
        if (m.comp === 'low' && p.completeness >= 60) return false;
      }
      if (!q) return true;
      var hay = [p.title, p.authors, p.question, p.conclusion, p.method, p.limitations, (p.tags || []).join(' '), String(p.year || '')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var sort = m.sort;
    list.sort(function (a, b) {
      switch (sort) {
        case 'year-asc': return (a.year || 0) - (b.year || 0);
        case 'completeness-desc': return b.completeness - a.completeness;
        case 'sample-desc': return (b.sampleSize || 0) - (a.sampleSize || 0);
        case 'title-asc': return a.title.localeCompare(b.title, 'zh');
        default: return (b.year || 0) - (a.year || 0);
      }
    });
    return list;
  }

  function matrixCards(s, list) {
    return '<div class="matrix-cards">' + list.map(function (p) {
      return '<div class="card m-card" data-action="open-paper" data-id="' + esc(p.id) + '" role="button" tabindex="0">' +
        '<div class="mc-head"><span class="pid">' + esc(p.id) + '</span>' + sourceChip(p) + '<span class="mc-year">' + (p.year || '—') + '</span></div>' +
        '<div class="mc-title">' + esc(p.title) + '</div>' +
        '<div class="mc-auth">' + esc(p.authors || '作者待补') + '</div>' +
        '<div class="mc-tags">' + (p.tags || []).map(function (t) { return '<span class="chip" style="font-size:10.5px;min-height:18px;padding:1px 7px">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<dl class="mc-fields">' +
        '<div><dt>研究问题</dt><dd>' + esc(p.question || '待补') + '</dd></div>' +
        '<div><dt>研究对象</dt><dd>' + esc(p.subjects || '待补') + '</dd></div>' +
        '<div><dt>方法 / 样本</dt><dd>' + esc(p.methodType || p.method || '待识别') + ' · ' + (p.sampleSize ? p.sampleSize.toLocaleString() + ' 人' : '样本待补') + '</dd></div>' +
        '<div><dt>核心结论</dt><dd>' + esc(p.conclusion || '待补') + '</dd></div>' +
        '<div><dt>局限</dt><dd>' + esc(p.limitations || '待补') + '</dd></div>' +
        '</dl>' +
        compBar(p) +
        '<div class="mc-more">查看证据与详情 →</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function matrixTable(s, list) {
    function arrow(key) {
      var map = { 'year-desc': 'year', 'year-asc': 'year', 'sample-desc': 'sample', 'completeness-desc': 'comp' };
      if (map[s.matrix.sort] !== key) return '';
      return '<span class="arrow">' + (s.matrix.sort === 'year-asc' ? '▲' : '▼') + '</span>';
    }
    var rows = list.map(function (p) {
      return '<tr data-action="open-paper" data-id="' + esc(p.id) + '" tabindex="0" role="button" aria-label="查看 ' + esc(p.title) + ' 详情">' +
        '<td class="cell-title"><span class="t"><span class="pid">' + esc(p.id) + '</span>' + esc(p.title) + '</span><span class="a">' + esc(p.authors || '作者待补') + '</span></td>' +
        '<td class="num">' + (p.year || '—') + '</td>' +
        '<td><div class="cell-clamp">' + esc(p.question || '待补') + '</div></td>' +
        '<td><div class="cell-clamp">' + esc(p.subjects || '待补') + '</div></td>' +
        '<td><div class="cell-clamp">' + esc(p.methodType || p.method || '待识别') + '</div></td>' +
        '<td class="num">' + (p.sampleSize ? p.sampleSize.toLocaleString() + ' 人' : '—') + '</td>' +
        '<td><div class="cell-clamp">' + esc(p.conclusion || '待补') + '</div></td>' +
        '<td><div class="cell-clamp">' + esc(p.limitations || '待补') + '</div></td>' +
        '<td>' + compBar(p) + '</td>' +
        '<td class="cell-src">' + sourceChip(p) + '<div class="src-tags">' + (p.tags || []).slice(0, 3).map(function (t) { return '<span class="chip" style="font-size:10px;min-height:16px;padding:0 6px">' + esc(t) + '</span>'; }).join('') + '</div></td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="matrix"><thead><tr>' +
      '<th>文献</th>' +
      '<th class="sortable" data-action="sort-matrix" data-sort="year">年份' + arrow('year') + '</th>' +
      '<th>研究问题</th><th>研究对象</th><th>方法</th>' +
      '<th class="sortable" data-action="sort-matrix" data-sort="sample">样本' + arrow('sample') + '</th>' +
      '<th>核心结论</th><th>局限</th>' +
      '<th class="sortable" data-action="sort-matrix" data-sort="comp">证据完整度' + arrow('comp') + '</th>' +
      '<th>来源标签</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function matrixBody(s) {
    var list = filteredPapers(s);
    if (!s.papers.length) {
      return emptyState('doc', '工作台还没有文献', '先导入你的论文摘要，或一键载入 6 篇示例论文体验完整流程。', true);
    }
    if (!list.length) {
      return '<div class="empty">' + ICONS.search + '<h3>没有匹配的文献</h3><p>试试更换关键词，或清除方法 / 年份 / 完整度 / 主题筛选。</p><button class="btn btn-secondary" data-action="reset-matrix-filter">清除全部筛选</button></div>';
    }
    return matrixTable(s, list) + matrixCards(s, list) +
      '<details class="comp-rule"><summary>证据完整度如何计算？</summary><p>' + esc(PT.engine.completenessRule()) + '</p></details>' +
      '<p style="font-size:12px;color:var(--ink-faint);margin-top:8px">点击任意一行 / 卡片查看文献详情与可追溯证据片段。桌面为宽表，手机自动切换为文献卡片。</p>';
  }

  /* 演示进度引导：进入示例后在矩阵顶部提示 3 分钟闭环路线，逐步标记完成。 */
  function demoGuide(s) {
    if (!s.papers.length) return '';
    return demoGuideInner(s);
  }
  function demoGuideInner(s) {
    var d = s.demo || {};
    var steps = [
      { key: 'detail', action: 'demo-detail', label: '查看文献详情', desc: '核对字段与证据片段' },
      { key: 'conflict', action: 'demo-conflict', label: '打开冲突关系', desc: '看两篇为何结论相反' },
      { key: 'gap', action: 'demo-gap', label: '查看研究空白', desc: '来源局限归纳的候选问题' },
      { key: 'pack', action: 'demo-pack', label: '生成工作包', desc: '八模块底稿，可导出' }
    ];
    var doneCount = steps.filter(function (st) { return d[st.key]; }).length;
    var nextIdx = -1;
    for (var i = 0; i < steps.length; i++) { if (!d[steps[i].key]) { nextIdx = i; break; } }
    var allDone = doneCount === steps.length;
    return '<div class="demo-guide" role="region" aria-label="演示路线">' +
      '<div class="dg-head">' +
      '<span class="dg-title"><span class="dg-dot"></span>演示路线 · 约 3 分钟闭环</span>' +
      '<span class="dg-progress' + (allDone ? ' done' : '') + '">' + (allDone ? '✓ 四步已完成，可导出工作包' : '已完成 ' + doneCount + ' / 4 步') + '</span>' +
      '</div>' +
      '<div class="dg-steps">' +
      steps.map(function (st, i) {
        var done = !!d[st.key], isNext = i === nextIdx;
        return '<button class="dg-step' + (done ? ' done' : '') + (isNext ? ' next' : '') + '" data-action="' + st.action + '" aria-label="' + st.label + (done ? '（已完成）' : '') + '">' +
          '<span class="dg-num">' + (done ? '✓' : (i + 1)) + '</span>' +
          '<span class="dg-text"><b>' + st.label + '</b><small>' + st.desc + '</small></span>' +
          (isNext ? '<span class="dg-next">下一步 →</span>' : '') +
          '</button>';
      }).join('') +
      '</div>' +
      '</div>';
  }

  function matrixView(s) {
    var tags = [], methods = [], years = [];
    if (s.result) s.result.papers.forEach(function (p) {
      (p.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
      var mt = p.methodType || '方法未识别'; if (methods.indexOf(mt) < 0) methods.push(mt);
      if (p.year && years.indexOf(String(p.year)) < 0) years.push(String(p.year));
    });
    years.sort(function (a, b) { return b - a; });
    var list = filteredPapers(s);
    function sel(id, label, opts, cur) {
      return '<select class="control" id="' + id + '" aria-label="' + label + '"><option value="">' + label + '：全部</option>' +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }
    return '' +
      '<div class="section-head"><div><h1 class="view-title">文献矩阵</h1><p class="sub">研究问题、对象、方法、样本、结论、局限与来源一览；证据完整度反映字段可追溯程度，不代表研究质量。</p></div>' +
      '<button class="btn btn-secondary btn-sm" data-action="go" data-view="import">+ 导入更多</button></div>' +
      demoGuide(s) +
      (s.papers.length ? privacyBanner() : '') +
      '<div class="matrix-toolbar">' +
      '<div class="search-box">' + ICONS.search + '<input id="matrix-search" type="search" placeholder="搜索标题、作者、研究问题、结论…" value="' + esc(s.matrix.query) + '" aria-label="搜索文献"></div>' +
      '<span class="matrix-count" id="matrix-count">' + list.length + ' / ' + s.papers.length + ' 篇</span>' +
      mixedBadge(s, 'mixed-hint') +
      '</div>' +
      '<div class="matrix-filters">' +
      sel('filter-method', '方法', methods.map(function (m) { return [m, m]; }), s.matrix.method) +
      sel('filter-year', '年份', years.map(function (y) { return [y, y]; }), s.matrix.year) +
      sel('filter-comp', '完整度', [['full', '完整 ≥90%'], ['mid', '较全 60–89%'], ['low', '待补 <60%']], s.matrix.comp) +
      '<select class="control" id="matrix-sort" aria-label="排序方式">' +
      [['year-desc', '年份：新 → 旧'], ['year-asc', '年份：旧 → 新'], ['completeness-desc', '完整度：高 → 低'], ['sample-desc', '样本量：大 → 小'], ['title-asc', '标题：拼音顺序']].map(function (o) {
        return '<option value="' + o[0] + '"' + (s.matrix.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<button class="btn btn-ghost btn-sm" data-action="reset-matrix-filter">清除筛选</button>' +
      '</div>' +
      (tags.length ? '<div class="tag-filter" id="tag-filter"><button class="chip' + (!s.matrix.tag ? ' chip-teal' : '') + '" data-action="matrix-tag" data-tag="">全部主题</button>' +
        tags.map(function (t) { return '<button class="chip' + (s.matrix.tag === t ? ' chip-teal' : '') + '" data-action="matrix-tag" data-tag="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
      '<div id="matrix-table-wrap">' + matrixBody(s) + '</div>';
  }

  /* ================= 观点关系 ================= */
  function graphSVG(s) {
    var papers = s.result.papers;
    var n = papers.length;
    var W = 860, H = 600, cx = W / 2, cy = H / 2 - 10, rx = Math.min(330, 140 + n * 32), ry = 210;
    var pos = {};
    papers.forEach(function (p, i) {
      var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      pos[p.id] = { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
    });
    var rels = s.result.relations.filter(function (r) { return s.relFilter[r.type]; });
    var edges = rels.map(function (r, idx) {
      var a = pos[r.aId], b = pos[r.bId];
      if (!a || !b) return '';
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = 26 + (idx % 3) * 16;
      var sign = idx % 2 === 0 ? 1 : -1;
      var cxp = mx + (-dy / len) * off * sign, cyp = my + (dx / len) * off * sign;
      var lx = 0.25 * a.x + 0.5 * cxp + 0.25 * b.x, ly = 0.25 * a.y + 0.5 * cyp + 0.25 * b.y;
      var meta = REL_META[r.type];
      var sel = s.selectedRelation === r.id;
      var dash = r.type === 'conflict' ? ' stroke-dasharray="7 4"' : (r.type === 'related' ? ' stroke-dasharray="2 5"' : '');
      return '<g class="graph-edge' + (sel ? ' selected' : '') + '" data-action="select-relation" data-id="' + r.id + '" tabindex="0" role="button" aria-label="' + meta.label + '关系 ' + r.aId + ' 与 ' + r.bId + '">' +
        '<path class="hit" d="M' + a.x + ' ' + a.y + ' Q' + cxp + ' ' + cyp + ' ' + b.x + ' ' + b.y + '"/>' +
        '<path class="line" d="M' + a.x + ' ' + a.y + ' Q' + cxp + ' ' + cyp + ' ' + b.x + ' ' + b.y + '" stroke="' + meta.hex + '"' + dash + '/>' +
        '<text class="elabel" x="' + lx + '" y="' + ly + '" fill="' + meta.hex + '">' + meta.label + '</text>' +
        '</g>';
    }).join('');
    var nodes = papers.map(function (p) {
      var pt = pos[p.id];
      var short = p.title.length > 12 ? p.title.slice(0, 12) + '…' : p.title;
      var sel = s.drawerPaperId === p.id;
      return '<g class="graph-node' + (sel ? ' selected' : '') + '" data-action="open-paper" data-id="' + esc(p.id) + '" tabindex="0" role="button" aria-label="文献 ' + esc(p.id) + ' ' + esc(p.title) + '">' +
        '<circle class="body" cx="' + pt.x + '" cy="' + pt.y + '" r="27"/>' +
        '<text class="pid" x="' + pt.x + '" y="' + (pt.y + 5) + '">' + esc(p.id) + '</text>' +
        '<text class="ptitle" x="' + pt.x + '" y="' + (pt.y + 44) + '">' + esc(short) + '</text>' +
        '<text class="pyear" x="' + pt.x + '" y="' + (pt.y + 58) + '">' + (p.year || '年份不详') + '</text>' +
        '</g>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="文献观点关系图">' + edges + nodes + '</svg>';
  }

  function relationDetail(s) {
    var r = anyRelationById(s, s.selectedRelation);
    if (!r) {
      return '<div class="card rel-detail" id="rel-detail"><div class="rel-placeholder">点击图中连线、关系卡片或“不可直接比较”条目，<br>查看双方文献、比较维度、判断理由与对应证据。</div></div>';
    }
    var meta = REL_META[r.type];
    var a = PT.store.paperById(r.aId), b = PT.store.paperById(r.bId);
    function paperCard(p) {
      if (!p) return '';
      return '<div class="rel-paper" data-action="open-paper" data-id="' + esc(p.id) + '" role="button" tabindex="0">' +
        '<div class="rp-t"><span class="ev-id" style="color:var(--teal);background:var(--teal-soft);border-color:rgba(14,116,102,.25)">' + esc(p.id) + '</span> ' + esc(p.title) + '</div>' +
        '<div class="rp-m">' + esc(p.authors || '佚名') + ' · ' + (p.year || '年份不详') + ' · ' + esc(p.methodType || '方法未识别') + ' · ' + PT.engine.stanceLabel(p.stance) + ' ' + sourceChip(p) + '</div></div>';
    }
    var factorsHtml = '';
    if (r.factors && r.factors.length) {
      factorsHtml = '<div class="factor-head">' + (r.type === 'conflict' ? '差异可能来自' : '为何不可直接比较') + '</div>' +
        r.factors.map(function (f) {
          return '<div class="factor-item"><span class="chip ' + meta.chip + '" style="font-size:10.5px;min-height:18px;padding:1px 7px">' + esc(f.label) + '</span><span>' + esc(f.text) + '</span></div>';
        }).join('');
    }
    return '<div class="card rel-detail mobile-open" id="rel-detail">' +
      '<h3>' + relTypeChip(r.type) + ' ' + esc(r.aId) + ' ↔ ' + esc(r.bId) +
      '<button class="drawer-close" style="margin-left:auto;width:34px;height:34px" data-action="close-rel-detail" aria-label="关闭关系详情">✕</button></h3>' +
      '<div class="rel-pair">' + paperCard(a) + paperCard(b) + '</div>' +
      '<div class="rel-reason"><span class="chip rr-tag">整理推断</span>' + esc(r.reason) +
      (r.scope ? '<div class="rel-scope">可比性：' + esc(r.scope) + '</div>' : '') + '</div>' +
      factorsHtml +
      '<div class="dim-head">比较维度</div>' + dimsTable(r) +
      '<div class="dim-head">对应证据（材料直接内容）</div>' +
      r.evidence.map(function (e) {
        var pp = PT.store.paperById(e.paperId);
        return '<div class="rel-ev"><span class="ev-id">' + esc(e.evidenceId) + '</span> ' + esc(e.text) +
          (pp && pp.isSample ? ' <span class="chip chip-sample" style="font-size:10px;min-height:16px;padding:0 6px">示例材料</span>' : '') +
          evSupportNote(r, e) +
          '<div class="ev-src">—— ' + esc(e.paperId) + (pp ? '《' + esc(pp.title) + '》' : '') + ' · 材料直接内容</div></div>';
      }).join('') +
      '</div>';
  }

  /* 关系总览：支持/冲突/补充/相关线索（可筛选）+ 不可比较 + 研究空白。文字+形状+色块，不只靠颜色。 */
  function relOverview(s, counts, gapCount, incCount) {
    function tile(t, filterable) {
      var m = REL_META[t];
      var attrs = filterable
        ? 'data-action="toggle-rel-filter" data-type="' + t + '" aria-pressed="' + s.relFilter[t] + '"'
        : 'data-action="goto-boundaries"';
      var state = filterable ? (s.relFilter[t] ? '显示中' : '已隐藏') : '查看 →';
      return '<button class="ro-tile ro-' + t + '" ' + attrs + ' title="' + m.label + '">' +
        '<span class="ro-count">' + (filterable ? counts[t] : incCount) + '</span>' +
        '<span class="ro-label"><span class="rel-shape" style="color:' + m.hex + '">' + m.shape + '</span>' + m.label + '</span>' +
        '<span class="ro-state">' + state + '</span>' +
        '</button>';
    }
    return '<div class="rel-overview">' +
      tile('support', true) + tile('conflict', true) + tile('supplement', true) + tile('related', true) + tile('needs_check', true) +
      tile('incomparable', false) +
      '<button class="ro-tile ro-gap" data-action="demo-gap" title="查看研究空白">' +
      '<span class="ro-count">' + gapCount + '</span>' +
      '<span class="ro-label"><span class="rel-shape" style="color:var(--gap)">▨</span>研究空白</span>' +
      '<span class="ro-state">查看 →</span></button>' +
      '</div>';
  }

  /* 富关系卡片：类型(文字+形状) + 双方文献 + 比较维度 + 理由 + 证据片段（+差异因子）。 */
  function relFeatureCard(r, s) {
    var meta = REL_META[r.type];
    var a = PT.store.paperById(r.aId), b = PT.store.paperById(r.bId);
    function paperLine(p) {
      if (!p) return '';
      return '<div class="rr-paper"><span class="ev-id rr-pid">' + esc(p.id) + '</span><span class="rr-pt">' + esc(p.title) + '</span>' + sourceChip(p) + '</div>';
    }
    var evHtml = (r.evidence || []).slice(0, 2).map(function (e) {
      var pp = PT.store.paperById(e.paperId);
      return '<div class="rr-ev"><span class="ev-id">' + esc(e.evidenceId) + '</span> ' + esc(e.text) +
        (pp && pp.isSample ? ' <span class="chip chip-sample" style="font-size:10px;min-height:16px;padding:0 6px">示例材料</span>' : '') +
        evSupportNote(r, e) +
        '<div class="ev-src">—— ' + esc(e.paperId) + ' · 材料直接内容</div></div>';
    }).join('');
    var factorsHtml = '';
    if (r.factors && r.factors.length) {
      factorsHtml = '<div class="rr-factors"><b>' + (r.type === 'conflict' ? '差异可能来自：' : (r.type === 'needs_check' ? '待核验原因：' : '不可直接比较：')) + '</b>' + r.factors.map(function (f) {
        return '<span class="chip ' + meta.chip + '" style="font-size:10.5px;min-height:18px;padding:1px 7px" title="' + esc(f.text) + '">' + esc(f.label) + '</span>';
      }).join('') + '</div>';
    }
    var outcomeBadge = r.outcomeKey ? '<span class="chip rr-outcome" title="本条断言共享的结果变量">结果变量：' + esc(r.outcomeLabel) + '</span>' : '';
    return '<div class="card rel-rich type-' + r.type + '" data-action="select-relation" data-id="' + r.id + '" role="button" tabindex="0" aria-label="' + meta.label + '：' + r.aId + ' 与 ' + r.bId + '，查看详情">' +
      '<div class="rr-head">' + relTypeChip(r.type) + '<span class="rr-pair">' + esc(r.aId) + ' ↔ ' + esc(r.bId) + '</span><span class="rr-more">查看详情 →</span></div>' +
      '<div class="rr-titles">' + paperLine(a) + paperLine(b) + '</div>' +
      (outcomeBadge ? '<div class="rr-outcome-row">' + outcomeBadge + '</div>' : '') +
      '<div class="rr-dims">' + dimsCompact(r) + '</div>' +
      '<div class="rr-reason"><span class="chip rr-tag">整理推断</span>' + esc(r.reason) +
      (r.scope ? '<div class="rr-scope">可比性：' + esc(r.scope) + '</div>' : '') + '</div>' +
      factorsHtml +
      '<div class="rr-evs">' + evHtml + '</div>' +
      '</div>';
  }

  function featuredRelations(s) {
    var rels = s.result.relations.filter(function (r) { return s.relFilter[r.type]; });
    var picked = [], seen = {};
    ['conflict', 'needs_check', 'supplement', 'related', 'support'].forEach(function (t) {
      if (picked.length >= 3) return;
      var r = rels.filter(function (x) { return x.type === t; })[0];
      if (r && !seen[r.id]) { picked.push(r); seen[r.id] = true; }
    });
    var featIds = picked.map(function (r) { return r.id; });
    var rest = rels.filter(function (r) { return featIds.indexOf(r.id) < 0; });
    return { all: rels, featured: picked, rest: rest };
  }

  function gapCard(g) {
    return '<div class="card gap-card"><h4><span class="chip chip-gap">' + esc(g.id) + '</span>' + esc(g.title) +
      '<span class="chip" style="font-size:10px;min-height:16px;padding:0 6px;margin-left:auto">候选问题 · 整理推断</span></h4>' +
      '<p>' + esc(g.description) + '</p>' +
      '<div class="gap-part"><b>来源局限</b>' + (g.sourceLimitations || []).map(function (sl) {
        return '<div class="gap-lim"><span class="ev-id" style="color:var(--teal);background:var(--teal-soft);border-color:rgba(14,116,102,.25)">' + esc(sl.paperId) + '</span> ' + esc(sl.text) + '</div>';
      }).join('') + '</div>' +
      '<div class="gap-part"><b>为什么值得继续研究</b><p style="margin:0">' + esc(g.whyWorth || '') + '</p></div>' +
      '<div class="gap-part"><b>可以怎样验证</b><p style="margin:0">' + esc(g.howVerify || '') + '</p></div>' +
      '<div style="margin-top:8px">来源：' + srcChips(g.paperIds) + '</div>' +
      '</div>';
  }

  /* 不可直接比较：按原因分组的紧凑列表，点击查看逐维对比。 */
  function boundarySection(s) {
    var inc = s.result.incomparables || [];
    if (!inc.length) return '';
    var groups = (s.result.workpack && s.result.workpack.boundaryGroups) || [];
    var body = groups.map(function (g, gi) {
      return '<details class="boundary-group"' + (gi === 0 ? ' open' : '') + '><summary><span class="bg-label">' + esc(g.label) + '</span><span class="bg-count">' + g.count + ' 组</span><span class="wf-caret" aria-hidden="true">▾</span></summary>' +
        '<div class="bg-list">' + g.items.map(function (r) {
          return '<button class="bg-item" data-action="select-relation" data-id="' + r.id + '">' +
            '<span class="ev-id rr-pid">' + esc(r.aId) + ' ↔ ' + esc(r.bId) + '</span>' +
            '<span class="bg-rt">' + esc(r.reason) + '</span></button>';
        }).join('') + '</div></details>';
    }).join('');
    return '<div class="boundary-section" id="boundary-section">' +
      '<div class="section-head"><div><h3 style="font-size:16px">不可直接比较（' + inc.length + ' 组）</h3>' +
      '<p class="sub">这些研究看起来方向不同，但结果变量 / 内容类型 / 设计不同，不能当作同一命题的正反证据。按原因分组，点击查看逐维对比。</p></div></div>' +
      body + '</div>';
  }

  function relationsView(s) {
    if (!s.papers.length) {
      return '<div class="section-head"><div><h1 class="view-title">观点关系</h1><p class="sub">识别文献之间的支持、补充、冲突、相关线索与研究空白。</p></div></div>' +
        emptyState('graph', '还没有可分析的文献', '导入至少两篇文献后，这里会展示观点关系；也可以先载入示例体验。', true);
    }
    var gaps = s.result.gaps;
    var counts = { support: 0, supplement: 0, conflict: 0, related: 0, needs_check: 0 };
    s.result.relations.forEach(function (r) { if (counts[r.type] != null) counts[r.type]++; });
    var incCount = (s.result.incomparables || []).length;
    var fr = featuredRelations(s);
    var featuredHtml = fr.featured.length
      ? '<div class="rel-rich-grid">' + fr.featured.map(function (r) { return relFeatureCard(r, s); }).join('') + '</div>'
      : '<div class="banner banner-note">' + ICONS.info + '<span>当前材料在「同结果变量 + 测量可比」的标准下，未识别出可直接判定为支持或冲突的关系；不同研究多属「相关线索」或「不可直接比较」，见下方。</span></div>';
    var expandBtn = '';
    if (fr.rest.length) {
      expandBtn = '<button class="btn btn-secondary btn-sm rel-expand" data-action="toggle-rel-expand" aria-expanded="' + s.relExpanded + '">' +
        (s.relExpanded ? '收起，只看推荐 ' + fr.featured.length + ' 条 ↑' : '查看其余 ' + fr.rest.length + ' 条可判定关系 ↓') + '</button>';
    }
    var restHtml = (s.relExpanded && fr.rest.length) ? '<div class="rel-rich-grid rel-rest">' + fr.rest.map(function (r) { return relFeatureCard(r, s); }).join('') + '</div>' : '';

    var gapFeatured = gaps.slice(0, 2), gapRest = gaps.slice(2);
    var gapExpandBtn = gapRest.length ? '<button class="btn btn-secondary btn-sm rel-expand" data-action="toggle-gap-expand" aria-expanded="' + s.gapExpanded + '">' +
      (s.gapExpanded ? '收起，只看前 2 项 ↑' : '查看全部 ' + gaps.length + ' 项研究空白（还有 ' + gapRest.length + ' 项）↓') + '</button>' : '';
    var gapRestHtml = (s.gapExpanded && gapRest.length) ? '<div class="gap-grid" style="margin-top:14px">' + gapRest.map(gapCard).join('') + '</div>' : '';

    return '' +
      '<div class="section-head"><div><h1 class="view-title">观点关系</h1><p class="sub">共 ' + s.result.relations.length + ' 条可判定关系 · ' + incCount + ' 组不可直接比较 · ' + gaps.length + ' 项研究空白。先按结果变量与测量口径判断可比性，再判定关系。</p></div></div>' +
      '<div class="banner banner-note">' + ICONS.info + '<span><b>关系判断先看可比性，再看证据绑定：</b>仅当两篇的<b>结果变量相同、测量口径可比、且双方证据片段直接对应此结果变量</b>时才判「支持 / 冲突」；若证据只覆盖中介或相邻结果（如睡眠/入睡延迟），会标注「该片段不直接支持此结论」并降级为「待核验」。不同结果变量或内容类型不同则标为「相关线索 / 不可直接比较」。证据片段为「材料直接内容」，关系判断为「整理推断」。</span></div>' +
      demoGuideInner(s) +
      relOverview(s, counts, gaps.length, incCount) +
      '<div class="rel-cat-legend">' +
      '<span class="rcl rcl-direct"><span class="rcl-bar"></span>材料直接内容 = 证据原文片段</span>' +
      '<span class="rcl rcl-derived"><span class="rcl-bar"></span>整理推断 = 关系判断 / 可比性说明</span>' +
      '<span class="rcl-note">● 支持 · ▲ 冲突 · ◆ 补充 · ◇ 相关线索 · ? 待核验 · ▨ 不可比较 · 桌面可点节点看详情</span>' +
      '</div>' +
      '<div class="rel-layout">' +
      '<div class="card graph-card">' + graphSVG(s) + '<div class="graph-hint">节点为文献（含年份），连线为可判定关系；「不可直接比较」不画入连线，见下方分组</div></div>' +
      relationDetail(s) +
      '</div>' +
      '<div class="rel-feature">' +
      '<div class="rf-head"><h3>推荐先看这 ' + fr.featured.length + ' 条</h3><p>优先展示冲突 / 补充 / 相关线索各一条，附比较维度与证据；其余折叠。</p></div>' +
      featuredHtml + expandBtn + restHtml +
      '</div>' +
      boundarySection(s) +
      '<div class="gap-section" id="gap-section"><div class="section-head"><div><h2 style="font-size:18px">研究空白</h2><p class="sub">由来源局限归纳的候选问题，均绑定来源文献，并给出研究价值与验证思路。默认展示前 2 项。</p></div></div>' +
      (gaps.length ? '<div class="gap-grid">' + gapFeatured.map(gapCard).join('') + '</div>' + gapExpandBtn + gapRestHtml : '<div class="banner banner-note">' + ICONS.info + '<span>未从局限字段中识别出研究空白。为文献补充「局限：…」字段可获得更完整的归纳。</span></div>') +
      '</div>';
  }

  /* ================= 综述工作包 ================= */
  function workpackView(s) {
    if (!s.papers.length) {
      return '<div class="section-head"><div><h1 class="view-title">综述工作包</h1><p class="sub">八模块综述写作底稿，每条结论附来源文献。</p></div></div>' +
        emptyState('pack', '先导入材料或体验示例', '导入文献后，这里会自动生成研究主题、共识、争议、方法差异、空白、追问、提纲与参考文献；不会生成空壳报告。', true);
    }
    var wp = PT.store.effectiveWorkpack();
    var r = s.result;
    var timeStr = PT.exporter.fmtTime(s.generatedAt || new Date());

    function fold(num, title, count, body, open) {
      return '<details class="wp-fold"' + (open ? ' open' : '') + '><summary><span class="mod-num">' + num + '</span><span class="wf-title">' + title + '</span>' +
        (count ? '<span class="wf-count">' + count + '</span>' : '') + '<span class="wf-caret" aria-hidden="true">▾</span></summary>' +
        '<div class="wp-fold-body">' + body + '</div></details>';
    }

    var res = s.result;
    function evStatus(status) {
      if (!status) return '';
      var cls = /核验/.test(status) ? 'st-warn' : status === '材料直接内容' ? 'st-direct' : status === '候选推断' ? 'st-derive' : 'st-synth';
      return '<span class="ev-status ' + cls + '">' + esc(status) + '</span>';
    }
    function relLine(r) {
      return '<div class="wp-item"><div class="wi-title">' + relTypeChip(r.type) + ' ' + esc(r.aId) + ' ↔ ' + esc(r.bId) + '</div>' +
        '<div class="rr-dims" style="margin:5px 0">' + dimsCompact(r) + '</div>' +
        '<div class="wi-body">' + esc(r.reason) + '</div>' +
        (r.scope ? '<div class="wi-sub">可比性：' + esc(r.scope) + '</div>' : '') +
        evidenceBlock((r.evidence || []).slice(0, 2), res) +
        '<div>来源：' + srcChips([r.aId, r.bId]) + '</div></div>';
    }

    var findingsBody = wp.synthesis.length ? wp.synthesis.map(function (f, i) {
      return '<div class="wp-item"><div class="wi-title">核心发现 ' + (i + 1) + ' ' + evStatus(f.status) + '</div><div class="wi-body">' + esc(f.statement) + '</div>' +
        evidenceBlock((f.evidence || []).slice(0, 2), res) + '<div>来源：' + srcChips(f.paperIds) + '</div></div>';
    }).join('') : '<p style="font-size:13px;color:var(--ink-soft)">材料不足以形成跨材料归纳。</p>';

    var rels = res.relations;
    var needsBody = (wp.needsCheck && wp.needsCheck.length) ? '<div class="wp-subhead">待核验（结果变量相同，但证据未直接对应，暂不判冲突）</div>' + wp.needsCheck.map(function (c) {
      return '<div class="wp-item"><div class="wi-title">' + relTypeChip('needs_check') + ' ' + esc(c.paperIds.join(' ↔ ')) + '</div>' +
        '<div class="rr-dims" style="margin:5px 0">' + dimsCompact(c) + '</div>' +
        '<div class="wi-body">' + esc(c.statement) + '</div>' +
        evidenceBlock((c.evidence || []).slice(0, 2), res) + '<div>来源：' + srcChips(c.paperIds) + '</div></div>';
    }).join('') : '';
    var relBody = needsBody + (
      wp.controversies.length ? '<div class="wp-subhead">争议（同结果变量、测量可比、方向相反、证据对应）</div>' + wp.controversies.map(function (c) {
        return '<div class="wp-item"><div class="wi-title">' + evStatus('跨材料归纳') + '</div><div class="wi-body">' + esc(c.statement) + '</div>' + evidenceBlock((c.evidence || []).slice(0, 2), res) + '<div>来源：' + srcChips(c.paperIds) + '</div></div>';
      }).join('') : ''
    ) + (
      wp.supplements.length ? '<div class="wp-subhead">补充视角（不同问题、互补）</div>' + wp.supplements.map(function (sp) {
        return '<div class="wp-item"><div class="wi-title">' + evStatus('跨材料归纳') + '</div><div class="wi-body">' + esc(sp.statement) + '</div>' + evidenceBlock((sp.evidence || []).slice(0, 2), res) + '<div>来源：' + srcChips(sp.paperIds) + '</div></div>';
      }).join('') : ''
    ) + (function () {
      var rel = rels.filter(function (r) { return r.type === 'related'; });
      return rel.length ? '<div class="wp-subhead">相关线索（结果变量不同，不能相互作为同一命题证据）</div>' + rel.map(relLine).join('') : '';
    })() + (function () {
      var sup = rels.filter(function (r) { return r.type === 'support'; });
      return sup.length ? '<div class="wp-subhead">支持（同结果变量、测量可比、方向一致、证据对应）</div>' + sup.map(relLine).join('') : '';
    })();
    if (!relBody) relBody = '<p style="font-size:13px;color:var(--ink-soft)">未识别出可判定的支持 / 冲突 / 补充 / 待核验关系。</p>';

    var sleepBody = (wp.sleepSynthesis && wp.sleepSynthesis.length) ? wp.sleepSynthesis.map(function (f, i) {
      return '<div class="wp-item"><div class="wi-title">睡眠相关 ' + (i + 1) + ' ' + evStatus(f.status) + '</div><div class="wi-body">' + esc(f.statement) + '</div>' +
        evidenceBlock((f.evidence || []).slice(0, 2), res) + '<div>来源：' + srcChips(f.paperIds) + '</div></div>';
    }).join('') : '';

    var boundaryDataBody = (wp.dataBoundaries && wp.dataBoundaries.length) ? '<p class="wi-sub" style="margin-bottom:8px">以下结果变量被文献明确标注为「未测量 / 未报告」，<b>不计入方向统计与正负结论</b>，仅作为数据边界列出。</p>' +
      wp.dataBoundaries.map(function (b) {
        return '<div class="wp-item"><div class="wi-title">' + relTypeChip('incomparable') + ' ' + esc(b.label) + ' · <span class="chip" style="font-size:10px;min-height:16px;padding:0 6px">未测量</span></div><div class="wi-body">' + esc(b.text) + '</div><div>来源：' + srcChips([b.paperId]) + '</div></div>';
      }).join('') : '';

    var boundaryBody = (wp.boundaryGroups || []).length ? wp.boundaryGroups.map(function (g) {
      return '<div class="wp-subhead">' + esc(g.label) + '（' + g.count + ' 组）</div>' + g.items.map(function (r) {
        return '<div class="wp-item"><div class="wi-title">' + relTypeChip('incomparable') + ' ' + esc(r.aId) + ' ↔ ' + esc(r.bId) + '</div><div class="rr-dims" style="margin:5px 0">' + dimsCompact(r) + '</div><div class="wi-body">' + esc(r.reason) + '</div><div>来源：' + srcChips([r.aId, r.bId]) + '</div></div>';
      }).join('');
    }).join('') : '<p style="font-size:13px;color:var(--ink-soft)">未发现需要特别标注的「不可直接比较」组合。</p>';

    var methodBody = wp.methodDistribution.map(function (m) {
      return '<div class="wp-item"><div class="wi-title">' + esc(m.method) + ' <span class="chip" style="font-size:10px;min-height:16px;padding:0 6px">' + m.count + ' 篇 · ' + esc(m.design) + '</span></div><div class="wi-body">' + esc(m.note) + '</div><div>来源：' + srcChips(m.paperIds) + '</div></div>';
    }).join('');

    var gapBody = wp.gaps.length ? wp.gaps.map(function (g) {
      return '<div class="wp-item"><div class="wi-title"><span class="chip chip-gap" style="margin-right:6px">' + esc(g.id) + '</span>' + esc(g.title) + evStatus('候选推断') + '</div><div class="wi-body">' + esc(g.description) + '</div>' +
        '<div class="wi-sub"><b>为什么值得：</b>' + esc(g.whyWorth || '') + '</div>' +
        '<div class="wi-sub"><b>怎样验证：</b>' + esc(g.howVerify || '') + '</div>' +
        '<div>来源局限：' + srcChips(g.paperIds) + '</div></div>';
    }).join('') : '<p style="font-size:13px;color:var(--ink-soft)">未识别出可归纳的研究空白，建议补充各文献的局限说明。</p>';

    var questionBody = '<ol class="wp-questions">' + wp.questions.map(function (q) {
      return '<li>' + esc(q.text) + (q.userEdited ? ' <span class="chip chip-teal" style="font-size:10px;min-height:16px;padding:0 6px">用户编辑</span>' : '') + evStatus('候选推断') + '<div>来源：' + srcChips(q.sources) + '</div></li>';
    }).join('') + '</ol>';

    var outlineBody = wp.outline.map(function (sec) {
      return '<div class="wp-outline-sec"><h4>' + esc(sec.heading) + '</h4><ul>' + sec.points.map(function (pt) {
        return '<li>' + esc(pt.text) + (pt.userEdited ? ' <span class="chip chip-teal" style="font-size:10px;min-height:16px;padding:0 6px">用户编辑</span>' : '') + evStatus(pt.status) + ' ' + srcChips(pt.sources) + '</li>';
      }).join('') + '</ul></div>';
    }).join('');

    var refsBody = '<ol class="wp-refs">' + (wp.references || []).map(function (ref, i) {
      return '<li><span class="ref-n">[' + (i + 1) + ']</span><span>' + esc(ref.text) + (ref.isSample ? ' <span class="chip chip-sample" style="font-size:10.5px;min-height:18px;padding:1px 7px">虚构示例</span>' : '') + '</span></li>';
    }).join('') + '</ol>';

    function dirLabel(d) { return { negative: '负向', positive: '正向', neutral: '无显著', unknown: '方向未知' }[d] || '方向未知'; }

  /* 摘要：核心发现 / 主要分歧 / 优先空白 / 推荐结构 + 方法分布 */
    var FIND_CAP = 8;
    var findAll = wp.synthesis || [];
    var findShown = findAll.slice(0, FIND_CAP);
    var sumFindings = findShown.map(function (f) {
      var meta = '<span class="ws-meta-line">' + (f.validCount != null ? ('有效 ' + f.validCount + ' 篇') : '篇数待核') +
        ' · ' + esc(dirLabel(f.direction)) +
        (f.unverified && f.unverified.length ? (' · 待核验 ' + esc(f.unverified.join('、'))) : '') +
        (f.boundaryExcluded && f.boundaryExcluded.length ? (' · 未测边界 ' + esc(f.boundaryExcluded.join('、'))) : '') +
        '</span>';
      return '<li>' + evStatus(f.status) + '<span class="ws-st">' + esc(f.statement) + '</span>' + meta +
        '<div class="ws-src">来源：' + srcChips(f.paperIds) + '</div></li>';
    }).join('') || '<li class="ws-none">材料不足以形成跨材料归纳。</li>';
    if (findAll.length > FIND_CAP) {
      sumFindings += '<li class="ws-none">另有 ' + (findAll.length - FIND_CAP) + ' 条，展开「一、核心发现」查看。</li>';
    }
    var divItems = (wp.needsCheck || []).map(function (c) { return { statement: c.statement, paperIds: c.paperIds, status: '待核验' }; })
      .concat(wp.controversies.map(function (c) { return { statement: c.statement, paperIds: c.paperIds, status: '跨材料归纳' }; }));
    var sumDivergence = divItems.slice(0, 3).map(function (c) {
      return '<li>' + evStatus(c.status) + '<span class="ws-st">' + esc(c.statement) + '</span><div class="ws-src">来源：' + srcChips(c.paperIds) + '</div></li>';
    }).join('') || '<li class="ws-none">未识别出明显争议；不同研究多为相关线索或不可比较。</li>';
    var sumGaps = wp.gaps.slice(0, 2).map(function (g) {
      return '<li>' + evStatus('候选推断') + '<span class="ws-st"><span class="chip chip-gap" style="font-size:10px;min-height:16px;padding:0 6px;margin-right:5px">' + esc(g.id) + '</span>' + esc(g.title) + '</span>' +
        '<div class="ws-why">' + esc(g.whyWorth || '') + '</div><div class="ws-src">来源：' + srcChips(g.paperIds) + '</div></li>';
    }).join('') || '<li class="ws-none">未识别出可归纳的研究空白。</li>';
    var sumOutline = wp.outline.map(function (sec, i) {
      return '<li><span class="ws-ol-n">' + (i + 1) + '</span>' + esc(sec.heading) + '</li>';
    }).join('');

    var nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    var ni = 0;
    function nextNum() {
      var v = nums[ni] || String(ni + 1);
      ni += 1;
      return v;
    }
    var foldsHtml = '';
    foldsHtml += fold(nextNum(), '核心发现（按结果变量归纳）', wp.synthesis.length + ' 条', findingsBody);
    foldsHtml += fold(nextNum(), '主要分歧与待核验（争议 / 待核验 / 补充 / 相关线索）', rels.length + ' 条', relBody);
    if (wp.sleepSynthesis && wp.sleepSynthesis.length) foldsHtml += fold(nextNum(), '睡眠相关指标（非学习结果）', wp.sleepSynthesis.length + ' 条', sleepBody);
    if (wp.dataBoundaries && wp.dataBoundaries.length) foldsHtml += fold(nextNum(), '数据边界（未测量 / 未报告，不计入方向统计）', wp.dataBoundaries.length + ' 项', boundaryDataBody);
    foldsHtml += fold(nextNum(), '不可直接比较（分组说明）', wp.stats.incomparable + ' 组', boundaryBody);
    foldsHtml += fold(nextNum(), '方法分布', (wp.methodDistribution || []).length + ' 类', methodBody);
    foldsHtml += fold(nextNum(), '研究空白', wp.gaps.length + ' 项', gapBody);
    foldsHtml += fold(nextNum(), '可继续追问的问题', wp.questions.length + ' 条', questionBody);
    foldsHtml += fold(nextNum(), '综述文章结构提纲', wp.outline.length + ' 章', outlineBody);
    foldsHtml += fold(nextNum(), '参考文献清单', (wp.references || []).length + ' 篇', refsBody);

    return '' +
      '<div class="section-head"><div><h1 class="view-title">综述工作包</h1><p class="sub">先看下方摘要快速了解「这份工作包给了我什么」，再展开各模块查看完整内容；每条结论标注证据状态，来源编号可点击回溯。</p></div></div>' +
      demoGuideInner(s) +
      '<div class="wp-actionbar">' +
      '<button class="btn btn-primary" data-action="copy-md">复制 Markdown</button>' +
      '<button class="btn btn-secondary" data-action="download-md">下载 Markdown</button>' +
      '<button class="btn btn-secondary" data-action="edit-wp">' + ICONS.edit + ' 编辑工作包</button>' +
      '<span class="wp-meta">生成时间：' + esc(timeStr) + (wp.edited ? ' · 含用户编辑' : '') + '<br>规则引擎辅助整理 · 请根据原文核验</span>' +
      '</div>' +
      '<div class="card wp-summary">' +
      '<div class="ws-topic">' +
      '<div class="eyebrow">研究主题（归纳自研究问题与变量，不含方法名）' + (wp.edited && s.wpOverride && s.wpOverride.topic ? ' · 用户编辑' : '') + '</div>' +
      '<h3>' + esc(wp.topic) + '</h3>' +
      '<div class="ws-tags">' + (wp.topTags || []).map(function (t) { return '<span class="chip chip-teal" style="margin:2px 4px 2px 0">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '<div class="ws-methods"><span class="ws-methods-label">方法分布</span>' + (wp.methodDistribution || []).map(function (m) { return '<span class="chip">' + esc(m.method) + ' ' + m.count + ' 篇</span>'; }).join('') + '</div>' +
      '<div class="ws-stats">' +
      '<span class="ws-stat"><b>' + wp.stats.papers + '</b>文献</span>' +
      '<span class="ws-stat s-conflict"><b>' + wp.stats.conflict + '</b>冲突</span>' +
      '<span class="ws-stat s-supplement"><b>' + wp.stats.supplement + '</b>补充</span>' +
      '<span class="ws-stat" style="color:var(--warn)"><b>' + wp.stats.related + '</b>相关线索</span>' +
      '<span class="ws-stat" style="color:var(--copper)"><b>' + wp.stats.needs_check + '</b>待核验</span>' +
      '<span class="ws-stat" style="color:var(--gap)"><b>' + wp.stats.incomparable + '</b>不可比较</span>' +
      '<span class="ws-stat s-gap"><b>' + wp.stats.gap + '</b>空白</span>' +
      mixedBadge(s, 'ws-stat') +
      (wp.dataBoundaries && wp.dataBoundaries.length ? '<span class="ws-stat" style="color:var(--warn)"><b>' + wp.dataBoundaries.length + '</b>未测边界</span>' : '') +
      '</div>' +
      '</div>' +
      '<div class="ws-grid">' +
      '<div class="ws-col"><h4>核心发现 <small>按结果变量 · 共 ' + wp.synthesis.length + ' 条</small></h4><ul class="ws-list">' + sumFindings + '</ul></div>' +
      '<div class="ws-col"><h4>主要分歧 / 待核验 <small>前 3</small></h4><ul class="ws-list">' + sumDivergence + '</ul></div>' +
      '<div class="ws-col"><h4>优先研究空白 <small>候选推断 · 前 2</small></h4><ul class="ws-list">' + sumGaps + '</ul></div>' +
      '<div class="ws-col"><h4>推荐综述结构 <small>章节提纲</small></h4><ol class="ws-list ws-outline">' + sumOutline + '</ol></div>' +
      '</div>' +
      '</div>' +
      '<div class="banner banner-note">' + ICONS.warn + '<span>本工作包由<b>本地规则引擎</b>基于输入材料辅助整理；「证据状态」区分<b>材料直接内容 / 跨材料归纳 / 候选推断</b>。支持/冲突需「结果变量相同 + 测量可比 + 双方证据片段直接对应」；证据只覆盖中介或相邻结果时降级为<b>待核验</b>，<b>睡眠指标不计入学习结果</b>。引用前请根据原文核验；证据完整度仅反映字段可追溯程度，不代表研究质量。</span></div>' +
      '<div class="wp-export">' +
      '<div><b>导出完整报告</b><p>打印 A4 报告包含全部模块与证据片段索引，自动隐藏导航与按钮；复制 / 下载请使用顶部动作栏。</p></div>' +
      '<button class="btn btn-secondary" data-action="print-report">打印 A4 报告</button>' +
      '</div>' +
      '<div class="wp-folds">' + foldsHtml + '</div>';
  }

  /* 工作包编辑弹窗 */
  function editWpModal(s) {
    var wp = PT.store.effectiveWorkpack();
    return '<h2>编辑综述工作包<button class="drawer-close" data-action="close-edit-wp" aria-label="关闭编辑">✕</button></h2>' +
      '<p>修改主题、追问与提纲文字。原有来源引用按位置保留；新增行标记为「用户编辑 / 用户补充」，不会凭空添加来源。导出与打印将使用编辑后的内容。</p>' +
      '<label class="edit-label" for="edit-topic">研究主题</label>' +
      '<input id="edit-topic" class="edit-input" type="text" value="' + esc(wp.topic) + '">' +
      '<label class="edit-label" for="edit-questions">可继续追问的问题（每行一条）</label>' +
      '<textarea id="edit-questions" class="edit-textarea" rows="6">' + esc(wp.questions.map(function (q) { return q.text; }).join('\n')) + '</textarea>' +
      '<label class="edit-label">综述文章结构提纲（每行一个要点，章节标题保留）</label>' +
      wp.outline.map(function (sec, i) {
        return '<div class="edit-sec"><div class="edit-sec-h">' + esc(sec.heading) + '</div>' +
          '<textarea class="edit-textarea" data-sec="' + i + '" rows="3">' + esc(sec.points.map(function (p) { return p.text; }).join('\n')) + '</textarea></div>';
      }).join('') +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-action="save-edit-wp">保存编辑</button>' +
      '<button class="btn btn-ghost" data-action="reset-edit-wp">恢复自动生成</button>' +
      '<button class="btn btn-ghost" data-action="close-edit-wp">取消</button>' +
      '</div>';
  }

  /* ================= 文献详情抽屉 ================= */
  function drawer(s) {
    var p = s.drawerPaperId && PT.store.paperById(s.drawerPaperId);
    if (!p) return '';
    if (s.drawerEditing) return drawerEdit(p);
    function field(k, v) {
      return '<div class="drawer-field"><div class="df-k">' + k + '</div><div class="df-v' + (v ? '' : ' missing') + '">' + (v ? esc(v) : '待补 —— 导入时未识别到该字段') + '</div></div>';
    }
    var rels = s.result.relations.filter(function (r) { return r.aId === p.id || r.bId === p.id; });
    return '<div class="drawer-head"><div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
      '<span class="chip chip-teal">' + esc(p.id) + '</span>' +
      (p.isSample ? '<span class="chip chip-sample">示例结构化结果</span>' : '<span class="chip">用户导入 · 本地解析</span>') +
      (p.edited ? '<span class="chip chip-teal">已编辑</span>' : '') +
      '<span class="chip">' + esc(p.completenessLevel) + ' ' + p.completeness + '%</span>' +
      '</div>' +
      '<h2>' + esc(p.title) + '</h2>' +
      '<div style="font-size:13px;color:var(--ink-soft)">' + esc(p.authors || '作者待补') + ' · ' + (p.year || '年份不详') + '</div>' +
      '</div><button class="drawer-close" data-action="close-drawer" aria-label="关闭详情">✕</button></div>' +
      '<div class="drawer-meta">' + (p.tags || []).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') +
      '<span class="chip ' + (p.stance === 'negative' ? 'chip-conflict' : p.stance === 'positive' ? 'chip-support' : p.stance === 'neutral' ? 'chip-supplement' : '') + '">结论方向：' + PT.engine.stanceLabel(p.stance) + '</span></div>' +
      field('研究问题', p.question) +
      field('研究对象', p.subjects) +
      field('方法', p.method) +
      field('样本量', p.sampleSize ? p.sampleSize.toLocaleString() + ' 人' : '') +
      field('主要结论', p.conclusion) +
      field('局限', p.limitations) +
      '<div class="drawer-field"><div class="df-k">可追溯证据片段</div>' +
      ((p.evidence || []).length ? p.evidence.map(function (e) {
        return '<div class="drawer-ev"><div class="ev-head"><span class="ev-id">' + esc(e.id) + '</span><span style="font-size:11.5px;color:var(--ink-faint)">来源：' + esc(p.id) + ' · ' + (p.isSample ? '示例材料' : '输入材料') + '</span></div>' + esc(e.text) + '</div>';
      }).join('') : '<div class="df-v missing">未识别到证据片段</div>') +
      '</div>' +
      '<div class="drawer-field"><div class="df-k">证据完整度</div>' + compBar(p) +
      '<p style="font-size:12px;color:var(--ink-soft);margin:6px 0 0">' + esc(PT.engine.completenessRule()) + '</p>' +
      ((p.missing || []).length ? '<p style="font-size:12px;color:var(--warn);margin:4px 0 0">缺失字段：' + esc(p.missing.join('、')) + '</p>' : '') +
      '</div>' +
      (rels.length ? '<div class="drawer-field"><div class="df-k">相关观点关系（' + rels.length + '）</div><div class="drawer-rels">' + rels.map(function (r) {
        var other = r.aId === p.id ? r.bId : r.aId;
        var m = REL_META[r.type];
        return '<div class="drawer-rel-item" data-action="select-relation" data-id="' + r.id + '" role="button" tabindex="0"><span class="chip ' + m.chip + '" style="font-size:10.5px;min-height:18px;padding:1px 7px">' + m.label + '</span><span class="dr-text">与 ' + esc(other) + '：' + esc(r.reason.length > 46 ? r.reason.slice(0, 46) + '…' : r.reason) + '</span></div>';
      }).join('') + '</div></div>' : '') +
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-secondary btn-sm" data-action="edit-paper" data-id="' + esc(p.id) + '">' + ICONS.edit + ' 编辑字段</button>' +
      '<button class="btn btn-secondary btn-sm" data-action="select-relation-from-drawer" data-id="' + esc(p.id) + '">在关系图中查看</button>' +
      (!p.isSample ? '<button class="btn btn-danger-ghost btn-sm" data-action="remove-paper" data-id="' + esc(p.id) + '">从工作台移除</button>' : '') +
      '</div>';
  }

  function drawerEdit(p) {
    function inp(id, label, val, type) {
      return '<label class="edit-label" for="pf-' + id + '">' + label + '</label>' +
        '<input id="pf-' + id + '" class="edit-input" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '">';
    }
    function ta(id, label, val) {
      return '<label class="edit-label" for="pf-' + id + '">' + label + '</label>' +
        '<textarea id="pf-' + id + '" class="edit-textarea" rows="2">' + esc(val || '') + '</textarea>';
    }
    return '<div class="drawer-head"><div><h2>编辑文献字段 · ' + esc(p.id) + '</h2>' +
      '<p style="font-size:12.5px;color:var(--ink-soft)">修改后保存将重新计算完整度、关系与工作包。证据片段保持不变。</p></div>' +
      '<button class="drawer-close" data-action="cancel-edit-paper" aria-label="取消编辑">✕</button></div>' +
      inp('title', '标题', p.title) +
      inp('authors', '作者', p.authors) +
      inp('year', '年份', p.year, 'number') +
      ta('question', '研究问题', p.question) +
      inp('subjects', '研究对象', p.subjects) +
      ta('method', '方法', p.method) +
      inp('sampleSize', '样本量（数字）', p.sampleSize, 'number') +
      ta('conclusion', '核心结论', p.conclusion) +
      ta('limitations', '局限', p.limitations) +
      inp('tags', '主题标签（逗号分隔）', (p.tags || []).join(', ')) +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-action="save-paper" data-id="' + esc(p.id) + '">保存修改</button>' +
      '<button class="btn btn-ghost" data-action="cancel-edit-paper">取消</button>' +
      '</div>';
  }

  /* ================= 产品说明 ================= */
  function aboutModal() {
    return '<h2>产品说明<button class="drawer-close" data-action="close-about" aria-label="关闭产品说明">✕</button></h2>' +
      '<p>PaperTrail「论文证据链工作台」是 2026 Qoder 高校创造力大赛 · StudyHack 学习科研赛道的参赛作品，面向写课程论文、毕业论文与科研综述的大学生。</p>' +
      '<h3>数据处理方式</h3><ul>' +
      '<li>所有材料<b>仅在浏览器内存中处理</b>：不上传服务器、不写入本地存储、不调用任何外部 API，刷新页面即清空。</li>' +
      '<li>当前版本使用<b>本地规则引擎</b>（关键词、句式与结构化标注匹配）完成分篇、字段抽取、关系识别与工作包生成，无需 API Key。</li>' +
      '<li>导出（复制 / 下载 / 打印）同样在本地完成，文件直接保存到你的设备。</li>' +
      '</ul>' +
      '<h3>证据完整度计算规则</h3><p>' + esc(PT.engine.completenessRule()) + '</p>' +
      '<h3>产品边界</h3><ul>' +
      '<li>关系与空白是<b>基于输入材料整理的候选问题</b>，不是科学结论；证据片段为材料直接内容，二者在界面中分别标注。</li>' +
      '<li>「支持 / 冲突」要求<b>结果变量相同、测量口径可比、且双方证据片段直接对应此结果变量</b>；若证据只覆盖中介或相邻结果（如睡眠/入睡延迟），会标注「该片段不直接支持此结论」并降级为<b>待核验</b>。睡眠指标不计入学习结果汇总。</li>' +
      '<li>字段抽取依赖输入质量：自由文本可能漏抽字段，矩阵与抽屉会如实列出缺失字段。</li>' +
      '<li>内置 6 篇示例论文均为<b>虚构数据</b>，证据标注「示例材料」，仅用于演示流程。</li>' +
      '<li>每条导出结论都附有来源文献与证据编号，并带「请根据原文核验」提示；用户编辑内容单独标注。</li>' +
      '</ul>' +
      '<h3>为模型接入预留的接口</h3>' +
      '<p>规则引擎入口为 <code>PT.engine.analyze(papers)</code>，返回 <code>{ papers, relations, gaps, workpack }</code>。后续接入大模型时，只需实现 <code>window.PaperTrailAdapter.analyze(papers)</code> 并返回同构结果，界面与导出无需改动。</p>' +
      '<h3>核心逻辑自检</h3>' +
      '<p>同一套断言可在浏览器与 Node（<code>node tests/run-tests.mjs</code>）中重复执行，覆盖解析、关系、空白、工作包与导出。</p>' +
      '<button class="btn btn-secondary btn-sm" data-action="run-selftest">运行自检</button>' +
      '<div id="selftest-output"></div>';
  }

  /* ================= 打印报告 ================= */
  function printReport(s) {
    var wp = PT.store.effectiveWorkpack(), r = s.result;
    function src(ids) { return '<span class="pr-src">来源：' + (ids && ids.length ? ids.map(function (id) { return esc(id); }).join('、') : '用户补充，无自动来源') + '</span>'; }
    function ev(evList) {
      return (evList || []).map(function (e) {
        var p = r.papers.filter(function (x) { return x.id === e.paperId; })[0];
        return '<blockquote>[' + esc(e.evidenceId || e.paperId) + '] ' + esc(e.text) + (p && p.isSample ? '（示例材料）' : '') + ' —— ' + esc(e.paperId) + '</blockquote>';
      }).join('');
    }
    function um(x) { return x && x.userEdited ? '（用户编辑）' : ''; }
    var h = '<h1>PaperTrail 综述工作包：' + esc(wp.topic) + '</h1>' +
      '<p class="pr-meta">生成时间：' + esc(PT.exporter.fmtTime(s.generatedAt || new Date())) + ' · 整理引擎：本地规则（无外部模型） · 文献 ' + wp.stats.papers + ' 篇 · 冲突 ' + wp.stats.conflict + ' / 待核验 ' + wp.stats.needs_check + ' / 补充 ' + wp.stats.supplement + ' / 相关线索 ' + wp.stats.related + ' / 不可比较 ' + wp.stats.incomparable + ' · 研究空白 ' + wp.stats.gap + ' 项' + (wp.edited ? ' · 含用户编辑' : '') + '</p>' +
      '<div class="pr-note">⚠ ' + esc(PT.exporter.VERIFY_NOTE) + '（证据状态区分：材料直接内容 / 跨材料归纳 / 候选推断）</div>';
    var synth = wp.synthesis || wp.consensus || [];
    h += '<section><h2>一、研究主题</h2><p>' + esc(wp.topic) + '</p>' +
      (wp.topicBasis ? '<p class="pr-meta">' + esc(wp.topicBasis) + '</p>' : '') +
      '<p><b>方法分布：</b>' + (wp.methodDistribution || []).map(function (m) { return esc(m.method) + ' ' + m.count + ' 篇'; }).join('；') + '</p></section>';
    h += '<section><h2>二、文献共识（跨材料归纳）</h2>' + (synth.length ? synth.map(function (c, i) {
      return '<h3>核心发现 ' + (i + 1) + '（' + esc(c.status || '跨材料归纳') + '）</h3><p>' + esc(c.statement) + '</p>' + ev(c.evidence) + '<p>' + src(c.paperIds) + '</p>';
    }).join('') : '<p>材料不足以形成跨材料归纳。</p>') + '</section>';
    h += '<section><h2>三、主要争议与待核验</h2>' +
      (function () {
        var nc = wp.needsCheck || [];
        return nc.length ? '<h3>待核验（结果变量相同，但证据未直接对应，暂不判冲突）</h3>' + nc.map(function (c) {
          return '<p><b>' + esc(c.paperIds.join(' ↔ ')) + '</b>：' + esc(c.statement) + '</p>' + ev(c.evidence) + '<p>' + src(c.paperIds) + '</p>';
        }).join('') : '';
      })() +
      (wp.controversies.length ? wp.controversies.map(function (c, i) {
        return '<h3>争议 ' + (i + 1) + '（同结果变量、测量可比、方向相反、证据对应）</h3><p>' + esc(c.statement) + '</p>' + ev(c.evidence) + '<p>' + src(c.paperIds) + '</p>';
      }).join('') : '<p>未识别出「同结果变量 + 测量可比 + 方向相反且证据对应」的争议。</p>') +
      (function () {
        var rel = (r.relations || []).filter(function (x) { return x.type === 'related'; });
        return rel.length ? '<h3>相关线索（结果变量不同，不能相互作为同一命题证据）</h3><ul>' + rel.map(function (x) { return '<li>' + esc(x.aId) + ' ↔ ' + esc(x.bId) + '：' + esc(x.reason) + '</li>'; }).join('') + '</ul>' : '';
      })() +
      (wp.supplements && wp.supplements.length ? '<h3>补充视角（不同问题、互补）</h3>' + wp.supplements.map(function (sp) { return '<p>' + esc(sp.statement) + '</p><p>' + src(sp.paperIds) + '</p>'; }).join('') : '') +
      (wp.boundaryGroups && wp.boundaryGroups.length ? '<h3>不可直接比较（差异说明）</h3>' + wp.boundaryGroups.map(function (g) {
        return '<p><b>' + esc(g.label) + '（' + g.count + ' 组）</b></p><ul>' + g.items.map(function (x) { return '<li>' + esc(x.aId) + ' ↔ ' + esc(x.bId) + '：' + esc(x.reason) + '</li>'; }).join('') + '</ul>';
      }).join('') : '') +
      (wp.dataBoundaries && wp.dataBoundaries.length ? '<h3>数据边界（未测量 / 未报告，不计入方向统计）</h3><ul>' + wp.dataBoundaries.map(function (b) { return '<li>' + esc(b.paperId) + '「' + esc(b.label) + '」：' + esc(b.text) + '</li>'; }).join('') + '</ul>' : '') +
      (wp.sleepSynthesis && wp.sleepSynthesis.length ? '<h3>睡眠相关指标（非学习结果，不计入学习结论）</h3><ul>' + wp.sleepSynthesis.map(function (x) { return '<li>' + esc(x.statement) + '</li>'; }).join('') + '</ul>' : '') +
      '</section>';
    h += '<section><h2>四、方法差异（方法分布）</h2><ul>' + (wp.methodDistribution || wp.methodDifferences || []).map(function (m) {
      var cnt = m.count != null ? '（' + m.count + ' 篇）' : '';
      return '<li><b>' + esc(m.method) + '</b>' + cnt + '：' + esc(m.note || '') + ' ' + src(m.paperIds) + '</li>';
    }).join('') + '</ul></section>';
    h += '<section><h2>五、研究空白（候选问题）</h2>' + wp.gaps.map(function (g) {
      return '<h3>' + esc(g.id) + ' ' + esc(g.title) + '</h3><p>' + esc(g.description) + '</p>' +
        '<p><b>来源局限：</b>' + (g.sourceLimitations || []).map(function (sl) { return esc(sl.paperId) + '：' + esc(sl.text); }).join('；') + '</p>' +
        '<p><b>为什么值得继续研究：</b>' + esc(g.whyWorth || '') + '</p>' +
        '<p><b>可以怎样验证：</b>' + esc(g.howVerify || '') + '</p><p>' + src(g.paperIds) + '</p>';
    }).join('') + '</section>';
    h += '<section><h2>六、可继续追问的问题</h2><ol>' + wp.questions.map(function (q) {
      return '<li>' + esc(q.text) + um(q) + ' ' + src(q.sources) + '</li>';
    }).join('') + '</ol></section>';
    h += '<section><h2>七、综述文章结构提纲</h2>' + wp.outline.map(function (sec) {
      return '<h3>' + esc(sec.heading) + '</h3><ul>' + sec.points.map(function (pt) { return '<li>' + esc(pt.text) + um(pt) + ' ' + src(pt.sources) + '</li>'; }).join('') + '</ul>';
    }).join('') + '</section>';
    h += '<section><h2>八、参考文献清单</h2><ol>' + wp.references.map(function (ref) {
      return '<li>' + esc(ref.text) + (ref.isSample ? '（虚构示例）' : '') + '</li>';
    }).join('') + '</ol></section>';
    h += '<section><h2>附录：证据片段索引</h2>' + r.papers.map(function (p) {
      return '<h3>' + esc(p.id) + '《' + esc(p.title) + '》' + (p.isSample ? '（示例结构化结果）' : '') + (p.edited ? '（用户编辑）' : '') + '</h3><ul>' + (p.evidence || []).map(function (e) { return '<li>[' + esc(e.id) + '] ' + esc(e.text) + (p.isSample ? '（示例材料）' : '') + '</li>'; }).join('') + '</ul>';
    }).join('') + '</section>';
    h += '<p class="pr-meta">生成时间：' + esc(PT.exporter.fmtTime(s.generatedAt || new Date())) + ' · ' + esc(PT.exporter.VERIFY_NOTE) + '</p>';
    return h;
  }

  root.PT.views = {
    home: home, import: importView, matrix: matrixView, relations: relationsView, workpack: workpackView,
    drawer: drawer, aboutModal: aboutModal, printReport: printReport, editWpModal: editWpModal,
    matrixBody: matrixBody, filteredPapers: filteredPapers,
    esc: esc, REL_META: REL_META, EXAMPLE_FORMAT: EXAMPLE_FORMAT, sourceLabel: sourceLabel
  };
})(typeof self !== 'undefined' ? self : this);