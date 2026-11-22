/* PaperTrail 应用层：启动、渲染调度、事件委托、文件读取、导出动作。 */
(function () {
  'use strict';
  var store = PT.store, views = PT.views;
  var viewEl = document.getElementById('view');
  var drawerEl = document.getElementById('drawer');
  var drawerScrim = document.getElementById('drawer-scrim');
  var aboutScrim = document.getElementById('about-scrim');
  var aboutModal = document.getElementById('about-modal');
  var editScrim = document.getElementById('edit-scrim');
  var editModal = document.getElementById('edit-modal');
  var toastWrap = document.getElementById('toast-wrap');
  var printRoot = document.getElementById('print-root');
  var lastView = null;

  /* ---------- 渲染 ---------- */
  function syncTopbarHeight() {
    var tb = document.getElementById('topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-real', tb.offsetHeight + 'px');
  }
  function render() {
    var s = store.get();
    syncTopbarHeight();
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === s.view);
      if (t.dataset.view === s.view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    var bm = document.getElementById('badge-matrix');
    var br = document.getElementById('badge-relations');
    bm.hidden = !s.papers.length; bm.textContent = s.papers.length;
    br.hidden = !s.result || !s.result.relations.length;
    br.textContent = s.result ? s.result.relations.length : 0;

    viewEl.innerHTML = views[s.view](s);

    if (s.drawerPaperId) {
      drawerEl.innerHTML = views.drawer(s);
      drawerEl.hidden = false; drawerScrim.hidden = false;
    } else {
      drawerEl.hidden = true; drawerScrim.hidden = true;
    }

    if (s.wpEditing && s.result) {
      editModal.innerHTML = views.editWpModal(s);
      editScrim.hidden = false;
    } else {
      editScrim.hidden = true;
    }
    document.body.style.overflow = (s.drawerPaperId || !editScrim.hidden || !aboutScrim.hidden) ? 'hidden' : '';

    if (lastView !== s.view) {
      window.scrollTo({ top: 0 });
      lastView = s.view;
    }
  }
  store.subscribe(render);
  window.addEventListener('resize', syncTopbarHeight);

  /* 数据只在内存：离开/刷新前若已有材料，提醒先导出，避免无提示丢失。 */
  window.addEventListener('beforeunload', function (e) {
    var s = store.get();
    if (s.papers && s.papers.length) { e.preventDefault(); e.returnValue = ''; return ''; }
  });

  /* 演示进度：标记某一步已完成（叠加在现有 demo 状态上）。 */
  function withDemo(s, key) {
    var d = Object.assign({}, s.demo);
    d[key] = true;
    return d;
  }

  /* 若当前工作包有未导出的编辑，导入 / 替换 / 清空会丢弃编辑，先确认。 */
  function guardEdit() {
    var s = store.get();
    if (s.wpOverride) return window.confirm('当前工作包有未导出的编辑。导入 / 替换 / 清空会丢弃这些编辑，且不会自动恢复。确定继续？');
    return true;
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.innerHTML = '<span class="t-icon">' + (type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ') + '</span><span>' + views.esc(msg) + '</span>';
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, 3400);
  }

  /* ---------- 示例载入 ---------- */
  function loadSample() {
    var s = store.get();
    if (s.loading) return;
    if (!guardEdit()) return;
    store.set({ loading: 'sample' });
    setTimeout(function () {
      store.loadSamples();
      var r = store.get().result;
      store.set({ loading: false, view: 'matrix' });
      toast('已载入 6 篇示例文献：识别出 ' + r.relations.length + ' 条观点关系、' + r.gaps.length + ' 项研究空白', 'success');
    }, 450);
  }

  /* ---------- 导入 ---------- */
  function currentInputText() {
    var ta = document.getElementById('material-input');
    return ta ? ta.value : (store.get().importText || '');
  }

  function finishImport(parsed, fileNames) {
    var s = store.get();
    var report = { papers: [], errors: parsed.errors || [], fileNames: fileNames || [], added: 0, skipped: 0 };
    var res = null;
    if (parsed.papers.length) {
      res = store.importPapers(parsed.papers, s.importMode);
      report.added = res.added; report.skipped = res.skipped;
      var result = store.get().result;
      report.papers = res.added ? result.papers.slice(result.papers.length - res.added) : [];
    }
    store.set({ loading: false, parseReport: report });
    var errCount = report.errors.length;
    if (parsed.papers.length) {
      if (res && res.added === 0 && res.skipped > 0) {
        toast('这批材料已经在矩阵里了，跳过 ' + res.skipped + ' 篇重复材料', 'success');
      } else if (res && res.skipped > 0) {
        toast('成功导入 ' + res.added + ' 篇文献，跳过 ' + res.skipped + ' 篇重复材料', 'success');
      } else if (errCount) {
        toast('导入 ' + res.added + ' 篇，另有 ' + errCount + ' 个段落失败，见下方建议', 'error');
      } else {
        toast('成功导入 ' + res.added + ' 篇文献，矩阵与关系已更新', 'success');
      }
    } else {
      toast('解析失败：' + (report.errors[0] ? report.errors[0].reason : '未识别到文献'), 'error');
    }
  }

  function parseTextAction() {
    var s = store.get();
    if (s.loading) return;
    if (!guardEdit()) return;
    if (s.importMode === 'replace' && s.papers.length) {
      if (!window.confirm('将清空现有 ' + s.papers.length + ' 篇并替换为新导入的材料，继续？')) return;
    }
    var text = currentInputText();
    store.set({ loading: 'parse', importText: text });
    setTimeout(function () {
      var parsed = PT.parser.parseText(text);
      finishImport(parsed, []);
    }, 350);
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (!guardEdit()) return;
    var valid = files.filter(function (f) { return /\.(txt|md|markdown)$/i.test(f.name) || /^text\//.test(f.type); });
    if (!valid.length) {
      toast('仅支持 TXT / Markdown 文件（.txt / .md / .markdown）。PDF / Word 请先复制摘要文本粘贴到左侧输入框。', 'error');
      return;
    }
    if (valid.length !== files.length) toast('已跳过 ' + (files.length - valid.length) + ' 个不支持的文件', 'error');
    var sizeErrors = [];
    var readable = valid.filter(function (f) {
      if (f.size > 2 * 1024 * 1024) {
        sizeErrors.push({ blockIndex: -1, preview: f.name, reason: '文件「' + f.name + '」超过 2MB（约 ' + (f.size / 1024 / 1024).toFixed(1) + 'MB），可能包含全文而非摘要。', suggestion: '建议只保留每篇的标题与摘要部分，拆分为多个小文件分批导入，或直接粘贴文本到输入框。' });
        return false;
      }
      return true;
    });
    if (!readable.length) {
      store.set({ loading: false, parseReport: { papers: [], errors: sizeErrors, fileNames: valid.map(function (f) { return f.name; }) } });
      toast('文件过大，未导入。请见下方处理建议', 'error');
      return;
    }
    store.set({ loading: 'parse' });
    var readers = readable.map(function (f) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve({ name: f.name, content: String(fr.result || '') }); };
        fr.onerror = function () { resolve({ name: f.name, content: '', error: true }); };
        fr.readAsText(f, 'UTF-8');
      });
    });
    Promise.all(readers).then(function (results) {
      var papers = [], errors = sizeErrors.slice();
      results.forEach(function (r) {
        if (r.error) {
          errors.push({ blockIndex: -1, preview: r.name, reason: '文件「' + r.name + '」读取失败。', suggestion: '请确认文件未损坏，且为 UTF-8 编码的文本文件；可尝试用记事本另存为 UTF-8 后重新上传。' });
          return;
        }
        if (!r.content.trim()) {
          errors.push({ blockIndex: -1, preview: r.name, reason: '文件「' + r.name + '」内容为空。', suggestion: '请确认文件里有文字；若是从 PDF 复制，可能复制到了图片，请改用文本粘贴。' });
          return;
        }
        var parsed = PT.parser.parseFile(r.name, r.content);
        papers = papers.concat(parsed.papers);
        parsed.errors.forEach(function (e) {
          errors.push(Object.assign({}, e, { reason: '文件「' + r.name + '」：' + e.reason, preview: e.preview || r.name }));
        });
      });
      finishImport({ papers: papers, errors: errors }, valid.map(function (f) { return f.name; }));
    });
  }

  /* ---------- 导出（始终使用「引擎生成 + 用户编辑」的生效工作包） ---------- */
  function buildMarkdown() {
    var s = store.get();
    var wp = store.effectiveWorkpack();
    return PT.exporter.toMarkdown(Object.assign({}, s.result, { workpack: wp }), { now: s.generatedAt });
  }

  function copyMarkdown(btn) {
    if (!store.get().result) { toast('请先生成工作包', 'error'); return; }
    var md = buildMarkdown();
    function done() {
      toast('已复制 Markdown（含生成时间与核验提示）', 'success');
      if (btn) {
        var old = btn.textContent;
        btn.textContent = '✓ 已复制';
        btn.disabled = true;
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1600);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(done, function () { fallbackCopy(md, done); });
    } else fallbackCopy(md, done);
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('复制失败，请改用「下载 Markdown」', 'error'); }
    ta.remove();
  }

  function downloadMarkdown() {
    var s = store.get();
    if (!s.result) { toast('请先生成工作包', 'error'); return; }
    var md = buildMarkdown();
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = PT.exporter.fileName(s.result, store.effectiveWorkpack().topic, s.generatedAt || new Date());
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Markdown 报告已开始下载：' + a.download, 'success');
  }

  /* P1-4：打印走独立隐藏 iframe，分块注入 + 点击与主线程解耦，避免主框架卡死；失败降级为 Markdown 下载 */
  var PRINT_CHUNK = 24;
  function printReport() {
    var s = store.get();
    if (!s.result) { toast('请先生成工作包', 'error'); return; }
    var html;
    try {
      html = views.printReport(s);
    } catch (e) {
      fallbackPrint('报告生成失败，已改为下载 Markdown 文件');
      return;
    }
    var frame = document.getElementById('print-frame');
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    frame = document.createElement('iframe');
    frame.id = 'print-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);

    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      cleanup();
      fallbackPrint('打印准备超时，已改为下载 Markdown 文件');
    }, 8000);

    function cleanup() {
      clearTimeout(timer);
      setTimeout(function () {
        var f = document.getElementById('print-frame');
        if (f && f.parentNode) f.parentNode.removeChild(f);
      }, 1500);
    }
    function fallbackPrint(msg) {
      toast(msg, 'error');
      downloadMarkdown();
    }

    try {
      var doc = frame.contentDocument || frame.contentWindow.document;
      var styles = Array.prototype.map.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) {
        return n.outerHTML;
      }).join('');
      doc.open();
      doc.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>PaperTrail 工作包</title>' + styles + '</head><body class="printing"></body></html>');
      doc.close();

      // 分块注入：每帧写一段，主线程每段之间可响应用户操作
      var parts = html.split(/(?=<\/(?:section|h2)>)/);
      var idx = 0;
      var holder = doc.createElement('div');
      holder.className = 'print-root';
      doc.body.appendChild(holder);
      function chunk() {
        var slice = parts.slice(idx, idx + PRINT_CHUNK).join('');
        var frag = doc.createElement('div');
        frag.innerHTML = slice;
        while (frag.firstChild) holder.appendChild(frag.firstChild);
        idx += PRINT_CHUNK;
        if (idx < parts.length) { setTimeout(chunk, 0); return; }
        if (done) return;
        done = true;
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          toast('已打开打印对话框，请选择 A4 纸张；如未弹出请改用「下载 Markdown」', 'info');
        } catch (err) {
          fallbackPrint('打印对话框未打开，已改为下载 Markdown 文件');
        }
        cleanup();
      }
      setTimeout(chunk, 0);
    } catch (err) {
      if (!done) { done = true; cleanup(); fallbackPrint('打印环境不可用，已改为下载 Markdown 文件'); }
    }
  }
  window.addEventListener('beforeprint', function () {
    if (document.getElementById('print-frame')) return;
    var s = store.get();
    if (s.result) printRoot.innerHTML = views.printReport(s);
  });

  /* ---------- 产品说明与自检 ---------- */
  function openAbout() {
    aboutModal.innerHTML = views.aboutModal();
    aboutScrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeAbout() {
    aboutScrim.hidden = true;
    var s = store.get();
    if (!s.drawerPaperId && !s.wpEditing) document.body.style.overflow = '';
  }
  function runSelftest() {
    var out = document.getElementById('selftest-output');
    if (!out) return;
    var results = PT.selftest.run(PT);
    var failed = results.filter(function (r) { return !r.pass; }).length;
    out.innerHTML = '<div class="selftest-results">' + results.map(function (r) {
      return '<div class="selftest-row ' + (r.pass ? 'pass' : 'fail') + '"><span class="st-mark">' + (r.pass ? '✓' : '✕') + '</span><span>' + views.esc(r.name) + (r.pass ? '' : ' — ' + views.esc(r.message)) + '</span></div>';
    }).join('') + '</div><div class="selftest-summary" style="color:' + (failed ? 'var(--danger)' : 'var(--support)') + '">' + (results.length - failed) + '/' + results.length + ' 项通过' + (failed ? '，存在失败项' : '，核心逻辑正常') + '</div>';
    toast(failed ? '自检存在 ' + failed + ' 项失败' : '自检 ' + results.length + '/' + results.length + ' 全部通过', failed ? 'error' : 'success');
  }

  /* ---------- 工作包编辑 ---------- */
  function lines(text) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function saveWpEdit() {
    var s = store.get();
    if (!s.result) return;
    var wp = s.result.workpack;
    var topicEl = document.getElementById('edit-topic');
    var qEl = document.getElementById('edit-questions');
    if (!topicEl || !qEl) return;
    var topic = topicEl.value.trim();
    if (!topic) { toast('研究主题不能为空', 'error'); topicEl.focus(); return; }
    var qLines = lines(qEl.value);
    /* 允许无追问：部分材料（无研究空白/争议）本就没有自动追问，主题编辑仍应可保存。 */
    var questions = qLines.map(function (text, i) {
      var old = wp.questions[i];
      return { text: text, sources: old ? old.sources : [], userEdited: !old || old.text !== text };
    });
    var outline = wp.outline.map(function (sec, i) {
      var ta = editModal.querySelector('textarea[data-sec="' + i + '"]');
      var pts = ta ? lines(ta.value) : sec.points.map(function (p) { return p.text; });
      if (!pts.length) pts = sec.points.map(function (p) { return p.text; });
      return {
        heading: sec.heading,
        points: pts.map(function (text, j) {
          var old = sec.points[j];
          return { text: text, sources: old ? old.sources : [], userEdited: !old || old.text !== text };
        })
      };
    });
    store.setWpOverride({ topic: topic, questions: questions, outline: outline });
    toast('已保存编辑：导出与打印将使用修改后的内容', 'success');
  }

  /* ---------- 文献字段编辑 ---------- */
  function savePaper(id) {
    function val(k) { var el = document.getElementById('pf-' + k); return el ? el.value.trim() : ''; }
    var title = val('title');
    if (!title) { toast('标题不能为空', 'error'); var t = document.getElementById('pf-title'); if (t) t.focus(); return; }
    var yearRaw = val('year'), sizeRaw = val('sampleSize');
    var year = yearRaw ? parseInt(yearRaw, 10) : null;
    if (yearRaw && (isNaN(year) || year < 1900 || year > 2100)) { toast('年份请填写 1900–2100 之间的数字，或留空表示待补', 'error'); return; }
    var sampleSize = sizeRaw ? parseInt(sizeRaw.replace(/[,，\s]/g, ''), 10) : null;
    if (sizeRaw && (isNaN(sampleSize) || sampleSize < 0)) { toast('样本量请填写非负数字，或留空表示待补', 'error'); return; }
    var tags = val('tags').split(/[,，、;；]/).map(function (t) { return t.trim(); }).filter(Boolean);
    store.updatePaper(id, {
      title: title, authors: val('authors'), year: year,
      question: val('question'), subjects: val('subjects'), method: val('method'),
      sampleSize: sampleSize, conclusion: val('conclusion'), limitations: val('limitations'),
      tags: tags
    });
    toast('已保存 ' + id + ' 的修改，完整度、关系与工作包已重新计算', 'success');
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    var s = store.get();
    /* 点击弹窗内部空白处不应触发遮罩的关闭动作 */
    if ((action === 'close-about' || action === 'close-edit-wp') && el.classList.contains('modal-scrim') && e.target !== el) return;

    switch (action) {
      case 'go': {
        e.preventDefault();
        var gv = el.dataset.view;
        var gpatch = { view: gv, drawerPaperId: null, drawerEditing: false, wpEditing: false };
        if (gv === 'workpack' && s.papers.length) gpatch.demo = withDemo(s, 'pack');
        store.set(gpatch);
        break;
      }
      case 'load-sample': loadSample(); break;
      case 'parse-text': parseTextAction(); break;
      case 'choose-files': {
        var fi = document.getElementById('file-input');
        if (fi) fi.click();
        break;
      }
      case 'set-import-mode': store.set({ importMode: el.dataset.mode }); break;
      case 'fill-example': {
        var ta = document.getElementById('material-input');
        if (ta) { ta.value = views.EXAMPLE_FORMAT; store.get().importText = views.EXAMPLE_FORMAT; }
        toast('已填入格式示例，点击「解析并导入」试试', 'info');
        break;
      }
      case 'focus-input': {
        store.set({ view: 'import' });
        setTimeout(function () {
          var ta = document.getElementById('material-input');
          if (ta) { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 60);
        break;
      }
      case 'clear-all':
        if (window.confirm('确定清空工作台的全部文献？此操作不可撤销' + (s.wpOverride ? '，且会丢弃当前工作包的未导出编辑' : '') + '。')) {
          store.clearAll();
          toast('工作台已清空', 'info');
        }
        break;
      case 'open-paper': store.set({ drawerPaperId: el.dataset.id, drawerEditing: false, demo: withDemo(s, 'detail') }); break;
      case 'close-drawer': store.set({ drawerPaperId: null, drawerEditing: false }); break;
      case 'edit-paper': store.set({ drawerPaperId: el.dataset.id || s.drawerPaperId, drawerEditing: true }); break;
      case 'cancel-edit-paper': store.set({ drawerEditing: false }); break;
      case 'save-paper': savePaper(el.dataset.id); break;
      case 'remove-paper':
        if (window.confirm('确定从工作台移除文献 ' + el.dataset.id + '？')) {
          store.removePaper(el.dataset.id);
          toast('已移除 ' + el.dataset.id + '，关系与工作包已重新计算', 'info');
        }
        break;
      case 'select-relation': {
        var rid = el.dataset.id;
        var rel0 = s.result && s.result.relations.filter(function (r) { return r.id === rid; })[0];
        var rpatch = { selectedRelation: rid, drawerPaperId: null, drawerEditing: false, view: 'relations' };
        if (rel0 && rel0.type === 'conflict') rpatch.demo = withDemo(s, 'conflict');
        store.set(rpatch);
        break;
      }
      case 'select-relation-from-drawer': {
        var pid = el.dataset.id;
        var rel = s.result.relations.filter(function (r) { return r.aId === pid || r.bId === pid; })[0];
        var dpatch = { view: 'relations', drawerPaperId: null, selectedRelation: rel ? rel.id : null };
        if (rel && rel.type === 'conflict') dpatch.demo = withDemo(s, 'conflict');
        store.set(dpatch);
        if (!rel) toast('该文献暂无已识别的关系', 'info');
        break;
      }
      case 'close-rel-detail': store.set({ selectedRelation: null }); break;
      case 'toggle-rel-filter': {
        var t = el.dataset.type;
        var filter = Object.assign({}, s.relFilter);
        filter[t] = !filter[t];
        var sel = s.selectedRelation;
        if (sel && s.result) {
          var sr = s.result.relations.filter(function (r) { return r.id === sel; })[0];
          if (sr && !filter[sr.type]) sel = null;
        }
        store.set({ relFilter: filter, selectedRelation: sel });
        break;
      }
      case 'toggle-rel-expand': store.set({ relExpanded: !s.relExpanded }); break;
      case 'toggle-gap-expand': store.set({ gapExpanded: !s.gapExpanded, demo: withDemo(s, 'gap') }); break;
      case 'goto-boundaries': {
        var bs = document.getElementById('boundary-section');
        if (bs) {
          bs.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var d0 = bs.querySelector('details');
          if (d0) d0.open = true;
        }
        break;
      }
      case 'demo-detail': {
        var p0 = s.result && s.result.papers[0];
        if (p0) store.set({ drawerPaperId: p0.id, drawerEditing: false, demo: withDemo(s, 'detail') });
        else toast('请先载入示例或导入材料', 'info');
        break;
      }
      case 'demo-conflict': {
        var cr = s.result && s.result.relations.filter(function (r) { return r.type === 'conflict'; })[0];
        store.set({ view: 'relations', selectedRelation: cr ? cr.id : null, drawerPaperId: null, drawerEditing: false, demo: withDemo(s, 'conflict') });
        if (!cr) toast('当前材料未识别出冲突关系', 'info');
        break;
      }
      case 'demo-gap':
        store.set({ view: 'relations', gapExpanded: true, drawerPaperId: null, demo: withDemo(s, 'gap') });
        setTimeout(function () {
          var g = document.getElementById('gap-section');
          if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 90);
        break;
      case 'demo-pack':
        store.set({ view: 'workpack', drawerPaperId: null, drawerEditing: false, wpEditing: false, demo: withDemo(s, 'pack') });
        break;
      case 'matrix-tag': store.set({ matrix: Object.assign({}, s.matrix, { tag: el.dataset.tag }) }); break;
      case 'reset-matrix-filter': store.set({ matrix: Object.assign({}, s.matrix, { query: '', tag: '', method: '', year: '', comp: '' }) }); break;
      case 'sort-matrix': {
        var key = el.dataset.sort;
        var next = key === 'year' ? (s.matrix.sort === 'year-desc' ? 'year-asc' : 'year-desc')
          : key === 'sample' ? 'sample-desc' : 'completeness-desc';
        store.set({ matrix: Object.assign({}, s.matrix, { sort: next }) });
        break;
      }
      case 'copy-md': copyMarkdown(el); break;
      case 'download-md': downloadMarkdown(); break;
      case 'print-report': printReport(); break;
      case 'edit-wp': store.set({ wpEditing: true }); break;
      case 'close-edit-wp': store.set({ wpEditing: false }); break;
      case 'save-edit-wp': saveWpEdit(); break;
      case 'reset-edit-wp':
        store.setWpOverride(null);
        toast('已恢复为规则引擎自动生成的内容', 'info');
        break;
      case 'about': openAbout(); break;
      case 'close-about': closeAbout(); break;
      case 'run-selftest': runSelftest(); break;
    }
  });

  /* 键盘可达性：role=button 的非按钮元素支持 Enter / Space */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var s = store.get();
      if (!editScrim.hidden) store.set({ wpEditing: false });
      else if (!aboutScrim.hidden) closeAbout();
      else if (s.drawerEditing) store.set({ drawerEditing: false });
      else if (s.drawerPaperId) store.set({ drawerPaperId: null });
      else if (s.selectedRelation) store.set({ selectedRelation: null });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      var el = e.target.closest ? e.target.closest('[data-action]') : null;
      if (el && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
        e.preventDefault();
        el.click();
      }
    }
  });

  /* 搜索：局部刷新表格，避免输入框失焦 */
  document.addEventListener('input', function (e) {
    if (e.target.id === 'matrix-search') {
      var s = store.get();
      s.matrix.query = e.target.value;
      var wrap = document.getElementById('matrix-table-wrap');
      var count = document.getElementById('matrix-count');
      if (wrap) wrap.innerHTML = views.matrixBody(s);
      if (count) count.textContent = views.filteredPapers(s).length + ' / ' + s.papers.length + ' 篇';
    } else if (e.target.id === 'material-input') {
      store.get().importText = e.target.value;
    }
  });

  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'matrix-sort' || id === 'filter-method' || id === 'filter-year' || id === 'filter-comp') {
      var s = store.get();
      var key = id === 'matrix-sort' ? 'sort' : id.replace('filter-', '');
      var patch = {}; patch[key] = e.target.value;
      store.set({ matrix: Object.assign({}, s.matrix, patch) });
    } else if (id === 'file-input') {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  });

  /* 拖拽上传 */
  document.addEventListener('dragover', function (e) {
    var dz = e.target.closest && e.target.closest('#dropzone');
    if (dz) { e.preventDefault(); dz.classList.add('dragover'); }
  });
  document.addEventListener('dragleave', function (e) {
    var dz = e.target.closest && e.target.closest('#dropzone');
    if (dz) dz.classList.remove('dragover');
  });
  document.addEventListener('drop', function (e) {
    var dz = e.target.closest && e.target.closest('#dropzone');
    if (dz) {
      e.preventDefault();
      dz.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    }
  });

  /* 启动 */
  render();
})();