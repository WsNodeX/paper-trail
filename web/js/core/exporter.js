/* PaperTrail 导出逻辑：把综述工作包渲染为 Markdown / 打印报告文本。
   所有导出均包含生成时间与核验提示。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.exporter = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERIFY_NOTE = '本报告由 PaperTrail 本地规则引擎基于输入材料辅助整理，不构成科学结论。引用前请根据原文核验每一条证据与结论。';

  function fmtTime(d) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function paperLabel(result, id) {
    var p = result.papers.filter(function (x) { return x.id === id; })[0];
    return p ? id + '《' + p.title + '》' : id;
  }

  function sources(result, ids) {
    return (ids || []).map(function (id) { return paperLabel(result, id); }).join('、');
  }

  function evidenceLines(result, ev) {
    return (ev || []).map(function (e) {
      var p = result.papers.filter(function (x) { return x.id === e.paperId; })[0];
      var tag = p && p.isSample ? '（示例材料）' : '';
      return '> [' + (e.evidenceId || e.paperId) + '] ' + e.text + tag + ' —— ' + paperLabel(result, e.paperId);
    }).join('\n');
  }

  function userMark(item) { return item && item.userEdited ? '（用户编辑）' : ''; }

  /* 下载文件名：PaperTrail + 主题短名 + 时间戳 */
  function fileName(result, topic, now) {
    var d = now ? new Date(now) : new Date();
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    var slug = String(topic || '综述工作包').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || '综述工作包';
    return 'PaperTrail-' + slug + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.md';
  }

  function toMarkdown(result, opts) {
    opts = opts || {};
    var now = opts.now ? new Date(opts.now) : new Date();
    var wp = result.workpack;
    var L = [];
    L.push('# PaperTrail 综述工作包：' + wp.topic);
    L.push('');
    L.push('- 生成时间：' + fmtTime(now));
    L.push('- 整理引擎：' + (result.engine || 'local-rules-v2') + '（本地规则，无外部模型）');
    L.push('- 文献数量：' + result.papers.length + ' 篇；可判定关系：支持 ' + wp.stats.support + ' / 冲突 ' + wp.stats.conflict + ' / 待核验 ' + wp.stats.needs_check + ' / 补充 ' + wp.stats.supplement + ' / 相关线索 ' + wp.stats.related + '；不可直接比较 ' + wp.stats.incomparable + ' 组；研究空白 ' + wp.stats.gap + ' 项');
    L.push('');
    L.push('> ⚠ ' + VERIFY_NOTE);
    L.push('> 证据状态区分：材料直接内容（证据原文）/ 跨材料归纳（多篇方向一致但结果变量可能不同）/ 候选推断（研究空白与追问）。');
    L.push('');

    L.push('## 一、研究主题');
    L.push('');
    L.push('核心主题：**' + wp.topic + '**');
    if (wp.topicBasis) L.push('主题口径：' + wp.topicBasis);
    if (result.papers.some(function (p) { return p.isSample; })) L.push('（含虚构示例文献，仅供演示流程。）');
    L.push('');
    if (wp.methodDistribution && wp.methodDistribution.length) {
      L.push('**方法分布**（与主题分离统计）：');
      wp.methodDistribution.forEach(function (m) {
        L.push('- ' + m.method + '：' + m.count + ' 篇（' + (m.design || '') + '）来源：' + sources(result, m.paperIds));
      });
      L.push('');
    }

    L.push('## 二、文献共识（跨材料归纳）');
    L.push('');
    var synth = wp.synthesis || wp.consensus || [];
    if (!synth.length) L.push('当前材料不足以形成跨材料归纳。');
    synth.forEach(function (c, i) {
      L.push('### 核心发现 ' + (i + 1) + '（证据状态：' + (c.status || '跨材料归纳') + '）');
      L.push(c.statement);
      L.push('来源：' + sources(result, c.paperIds));
      L.push(evidenceLines(result, c.evidence));
      L.push('');
    });

    L.push('## 三、主要争议与待核验');
    L.push('');
    if (wp.needsCheck && wp.needsCheck.length) {
      L.push('### 待核验（结果变量相同，但证据未直接对应，暂不判冲突）');
      wp.needsCheck.forEach(function (c) {
        L.push('- ' + (c.paperIds || []).join(' ↔ ') + '：' + c.statement + '（来源：' + sources(result, c.paperIds) + '）');
      });
      L.push('');
    }
    if (!wp.controversies.length) L.push('当前材料中未识别出「同结果变量 + 测量可比 + 方向相反且证据对应」的争议。');
    wp.controversies.forEach(function (c, i) {
      L.push('### 争议 ' + (i + 1) + '（证据状态：跨材料归纳；结果变量相同、测量可比、证据对应）');
      L.push(c.statement);
      L.push('来源：' + sources(result, c.paperIds));
      L.push(evidenceLines(result, c.evidence));
      L.push('');
    });
    var related = (result.relations || []).filter(function (r) { return r.type === 'related'; });
    if (related.length) {
      L.push('### 相关线索（结果变量不同，不能相互作为同一命题证据）');
      related.forEach(function (r) { L.push('- ' + r.aId + ' ↔ ' + r.bId + '：' + r.reason); });
      L.push('');
    }
    (wp.supplements || []).forEach(function (sp, i) {
      L.push('### 补充视角 ' + (i + 1) + '（不同问题、互补）');
      L.push(sp.statement);
      L.push('来源：' + sources(result, sp.paperIds));
      L.push('');
    });
    if (wp.boundaryGroups && wp.boundaryGroups.length) {
      L.push('### 不可直接比较（差异说明）');
      wp.boundaryGroups.forEach(function (g) {
        L.push('**' + g.label + '（' + g.count + ' 组）**');
        g.items.forEach(function (r) { L.push('- ' + r.aId + ' ↔ ' + r.bId + '：' + r.reason); });
        L.push('');
      });
    }

    if (wp.dataBoundaries && wp.dataBoundaries.length) {
      L.push('### 数据边界（未测量 / 未报告，不计入方向统计）');
      wp.dataBoundaries.forEach(function (b) { L.push('- ' + b.paperId + '「' + b.label + '」：' + b.text); });
      L.push('');
    }
    if (wp.sleepSynthesis && wp.sleepSynthesis.length) {
      L.push('### 睡眠相关指标（非学习结果，不计入学习结论）');
      wp.sleepSynthesis.forEach(function (x) { L.push('- ' + x.statement); });
      L.push('');
    }

    L.push('## 四、方法差异（方法分布）');
    L.push('');
    (wp.methodDistribution || wp.methodDifferences || []).forEach(function (m) {
      L.push('- **' + m.method + '**：' + m.note + ' 来源：' + sources(result, m.paperIds));
    });
    L.push('');

    L.push('## 五、研究空白（候选问题，候选推断）');
    L.push('');
    if (!wp.gaps.length) L.push('未从局限字段中识别出可归纳的研究空白，建议补充各文献的局限说明。');
    wp.gaps.forEach(function (g, i) {
      L.push('### 空白 ' + (i + 1) + '：' + g.title + '（证据状态：候选推断）');
      L.push(g.description);
      if (g.whyWorth) L.push('- 为什么值得继续研究：' + g.whyWorth);
      if (g.howVerify) L.push('- 可以怎样验证：' + g.howVerify);
      L.push('来源局限：' + sources(result, g.paperIds));
      L.push('');
    });

    L.push('## 六、可继续追问的问题');
    L.push('');
    wp.questions.forEach(function (q, i) {
      L.push((i + 1) + '. ' + q.text + userMark(q) + '（证据状态：候选推断；来源：' + (q.sources && q.sources.length ? sources(result, q.sources) : '用户补充，无自动来源') + '）');
    });
    L.push('');

    L.push('## 七、综述文章结构提纲');
    L.push('');
    wp.outline.forEach(function (sec) {
      L.push('### ' + sec.heading);
      sec.points.forEach(function (pt) {
        L.push('- ' + pt.text + userMark(pt) + (pt.status ? '（' + pt.status + '）' : '') + '（来源：' + (pt.sources && pt.sources.length ? sources(result, pt.sources) : '用户补充，无自动来源') + '）');
      });
      L.push('');
    });

    L.push('## 八、参考文献清单');
    L.push('');
    wp.references.forEach(function (r, i) {
      L.push('[' + (i + 1) + '] ' + r.text + (r.isSample ? '（虚构示例）' : ''));
    });
    L.push('');

    L.push('## 附录：证据片段索引');
    L.push('');
    result.papers.forEach(function (p) {
      L.push('### ' + p.id + '《' + p.title + '》' + (p.isSample ? '（示例结构化结果）' : '') + (p.edited ? '（用户编辑）' : ''));
      (p.evidence || []).forEach(function (e) {
        L.push('- [' + e.id + '] ' + e.text + (p.isSample ? '（示例材料）' : ''));
      });
      L.push('');
    });

    L.push('---');
    L.push('生成时间：' + fmtTime(now) + ' · ' + VERIFY_NOTE);
    return L.join('\n');
  }

  return { toMarkdown: toMarkdown, fmtTime: fmtTime, fileName: fileName, VERIFY_NOTE: VERIFY_NOTE };
});