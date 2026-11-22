/* PaperTrail 核心逻辑自检：同一套断言可在 Node（tests/run-tests.mjs）与浏览器（产品说明 → 运行自检）中重复执行。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.selftest = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function run(deps) {
    var samples = deps.samples, parser = deps.parser, engine = deps.engine, exporter = deps.exporter;
    var results = [];
    function test(name, fn) {
      try { fn(); results.push({ name: name, pass: true, message: '通过' }); }
      catch (e) { results.push({ name: name, pass: false, message: e.message || String(e) }); }
    }
    function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }

    var analyzed = engine.analyze(samples.papers);
    var wp = analyzed.workpack;
    var count = function (t) { return analyzed.relations.filter(function (r) { return r.type === t; }).length; };

    test('示例数据：6 篇论文且 10 个字段齐全', function () {
      assert(samples.papers.length === 6, '示例数量应为 6');
      samples.papers.forEach(function (p) {
        ['title', 'authors', 'year', 'question', 'subjects', 'method', 'sampleSize', 'conclusion', 'limitations', 'tags'].forEach(function (k) {
          assert(p[k] !== undefined && p[k] !== null && p[k] !== '', p.id + ' 缺少字段 ' + k);
        });
        assert(p.evidence && p.evidence.length >= 1, p.id + ' 缺少证据片段');
      });
    });

    test('关系引擎：证据-断言绑定，避免误判支持/冲突', function () {
      assert(count('conflict') === 0, '示例中不应有确定冲突（P3 证据仅睡眠，不能判学习效率冲突）：' + count('conflict'));
      assert(count('needs_check') >= 1, '应至少 1 条「待核验」（P3-P5）');
      assert(count('supplement') >= 1, '应至少 1 条补充（P4-P6）');
      assert(count('related') >= 1, '应至少相关线索');
      assert(analyzed.incomparables.length >= 5, '应有若干不可直接比较项：' + analyzed.incomparables.length);
      assert(analyzed.gaps.length >= 2, '研究空白不足：' + analyzed.gaps.length);
    });

    test('关系可追溯：每条关系含理由与双方证据', function () {
      analyzed.relations.forEach(function (r) {
        assert(r.reason && r.reason.length > 5, r.id + ' 缺少理由');
        assert(r.evidence && r.evidence.length >= 2, r.id + ' 证据不足');
        var ids = r.evidence.map(function (e) { return e.paperId; });
        assert(ids.indexOf(r.aId) >= 0 && ids.indexOf(r.bId) >= 0, r.id + ' 证据未覆盖双方文献');
      });
    });

    test('工作包：模块齐全且结论附来源', function () {
      ['topic', 'synthesis', 'controversies', 'methodDifferences', 'gaps', 'questions', 'outline', 'references'].forEach(function (k) {
        assert(wp[k] !== undefined, '缺少模块 ' + k);
      });
      assert(wp.synthesis.length >= 1, '核心发现为空');
      wp.synthesis.forEach(function (s) { assert(s.paperIds.length >= 1, '核心发现缺少来源'); });
      wp.controversies.forEach(function (c) { assert(c.paperIds.length >= 2, '争议缺少双方来源'); });
      wp.outline.forEach(function (sec) {
        sec.points.forEach(function (pt) { assert(pt.sources && pt.sources.length >= 1, sec.heading + ' 存在无来源结论'); });
      });
      assert(wp.references.length === 6, '参考文献数量错误');
      assert(wp.synthesis.every(function (s) { return s.outcomeKey; }), '核心发现应按结果变量分组');
    });

    test('证据完整度：示例文献为 100%', function () {
      analyzed.papers.forEach(function (p) { assert(p.completeness === 100, p.id + ' 完整度=' + p.completeness); });
    });

    test('导出：Markdown 含生成时间与核验提示', function () {
      var md = exporter.toMarkdown(analyzed, { now: '2026-11-16T10:00:00' });
      assert(md.indexOf('生成时间：2026-11-16 10:00') >= 0, '缺少生成时间');
      assert(md.indexOf('请根据原文核验') >= 0, '缺少核验提示');
      ['一、研究主题', '二、文献共识', '三、主要争议', '四、方法差异', '五、研究空白', '六、可继续追问的问题', '七、综述文章结构提纲', '八、参考文献清单'].forEach(function (h) {
        assert(md.indexOf(h) >= 0, '缺少章节 ' + h);
      });
    });

    test('解析：分隔线 + 标注字段的两篇文献', function () {
      var text = '标题：短视频与注意力研究\n作者：张三, 李四\n年份：2023\n研究问题：短视频是否影响注意力？\n方法：问卷调查\n样本量：500 人\n结论：使用时长与注意力得分负相关，损害注意力维持。\n局限：横断面设计无法推断因果。\n证据片段：时长每增加1小时，注意力得分下降3分。\n标签：注意力, 问卷调查\n---\n标题：教育短视频实验\n作者：王五\n研究问题：教育内容能否促进学习？\n方法：随机对照实验\n样本量：120 人\n结论：教育类短视频显著提升后测成绩。\n局限：干预仅 4 周，长期效果未知。';
      var r = parser.parseText(text);
      assert(r.papers.length === 2, '应解析出 2 篇，实际 ' + r.papers.length);
      assert(r.errors.length === 0, '不应有错误');
      var p1 = r.papers[0];
      assert(p1.year === 2023, '年份提取错误');
      assert(p1.sampleSize === 500, '样本量提取错误：' + p1.sampleSize);
      assert(p1.methodType === '问卷调查', '方法类型错误：' + p1.methodType);
      assert(p1.stance === 'negative', '立场判断错误：' + p1.stance);
      assert(p1.evidence.length >= 1 && p1.evidence[0].id === 'E1-1', '证据编号错误');
      assert(r.papers[1].methodType === '随机对照实验', '第二篇方法类型错误');
    });

    test('解析：Markdown 多级标题自动分篇', function () {
      var md = '# 文献一：睡眠与短视频\n研究表明睡前使用短视频降低睡眠效率，损害次日学习效率。样本为 300 名大学生，采用日记法。\n\n# 文献二：限用干预\n准实验干预发现限用组学习投入改善，但样本仅 80 人且自愿报名。';
      var r = parser.parseText(md);
      assert(r.papers.length === 2, '标题分篇失败：' + r.papers.length);
      assert(r.papers[0].title.indexOf('睡眠') >= 0, '标题清洗失败');
    });

    test('解析：空输入给出原因与建议', function () {
      var r = parser.parseText('   ');
      assert(r.papers.length === 0 && r.errors.length === 1, '空输入应返回 1 条错误');
      assert(r.errors[0].reason && r.errors[0].suggestion, '错误缺少原因或建议');
    });

    test('解析：过短与无结构块给出明确错误', function () {
      var r = parser.parseText('短视频\n---\n这是一段完全没有任何研究信息的闲聊文字，随便写写而已。');
      assert(r.papers.length === 0, '不应产出文献');
      assert(r.errors.length === 2, '应返回 2 条错误，实际 ' + r.errors.length);
      r.errors.forEach(function (e) { assert(e.reason && e.suggestion, '错误缺少原因/建议'); });
    });

    test('解析：摘要式自由文本可抽取结论与立场', function () {
      var text = '短视频使用与大学生学习投入的关系研究\n本研究以 860 名本科生为对象，采用问卷调查与多元回归。结果显示，控制作息后短视频时长与学习投入无显著关联（p=0.38）。局限在于效率指标为自评。';
      var r = parser.parseText(text);
      assert(r.papers.length === 1, '自由文本应解析为 1 篇');
      var p = r.papers[0];
      assert(p.sampleSize === 860, '样本量错误：' + p.sampleSize);
      assert(p.stance === 'neutral', '立场应为 neutral，实际 ' + p.stance);
      assert(p.conclusion.length > 0, '未抽取到结论');
    });

    test('立场判断：负向 / 正向 / 无显著', function () {
      assert(parser.detectStance('使用时长显著降低注意力得分') === 'negative', '负向判断失败');
      assert(parser.detectStance('教育内容显著提升后测成绩') === 'positive', '正向判断失败');
      assert(parser.detectStance('控制变量后无显著关联（p=0.41）') === 'neutral', '中性判断失败');
    });

    test('引擎确定性：两次分析结果一致', function () {
      var a = engine.analyze(samples.papers), b = engine.analyze(samples.papers);
      assert(a.relations.length === b.relations.length && a.gaps.length === b.gaps.length, '结果不稳定');
      assert(JSON.stringify(a.workpack.stats) === JSON.stringify(b.workpack.stats), '统计不一致');
    });

    test('用户文献闭环：导入 → 关系 → 工作包 → 导出', function () {
      var text = '标题：碎片化使用与注意力\n研究问题：碎片化使用是否损害注意力？\n方法：问卷调查\n样本量：600 人\n结论：碎片化切换显著降低注意力维持，损害课堂专注。\n局限：横断面设计无法推断因果。\n---\n标题：教育内容的增益\n研究问题：教育短视频是否促进学习？\n方法：随机对照实验\n样本量：100 人\n结论：教育类短视频显著提升知识后测成绩。\n局限：干预仅 2 周。';
      var r = parser.parseText(text);
      var a = engine.analyze(r.papers);
      assert(a.papers.length === 2, '用户文献数量错误');
      assert(a.workpack.references.length === 2, '参考文献错误');
      var md = exporter.toMarkdown(a);
      assert(md.indexOf('请根据原文核验') >= 0, '用户数据导出缺少核验提示');
      assert(a.papers.every(function (p) { return !p.isSample; }), '用户文献不应带示例标记');
    });

    test('待核验/冲突：附比较维度、证据与差异说明', function () {
      var nc = analyzed.relations.filter(function (r) { return r.type === 'needs_check'; });
      assert(nc.length >= 1, '应至少 1 条待核验（P3-P5）');
      nc.forEach(function (r) {
        assert(r.dims && r.dims.length, r.id + ' 缺少比较维度');
        assert(r.reason && r.reason.length > 10, r.id + ' 缺少说明');
        assert(r.evidence && r.evidence.length >= 2, r.id + ' 缺少双方证据');
      });
      analyzed.relations.filter(function (r) { return r.type === 'conflict'; }).forEach(function (r) {
        assert(r.factors && r.factors.length >= 1, r.id + ' 冲突缺少差异因子');
      });
    });

    test('示例可比性判定：四组关键对照正确（不误判支持/冲突）', function () {
      function find(x, y) {
        var all = analyzed.relations.concat(analyzed.incomparables);
        return all.filter(function (r) { return (r.aId === x && r.bId === y) || (r.aId === y && r.bId === x); })[0];
      }
      var cases = [['P1', 'P2', 'incomparable'], ['P1', 'P5', 'related'], ['P2', 'P4', 'incomparable'], ['P1', 'P6', 'incomparable'], ['P4', 'P6', 'supplement'], ['P3', 'P5', 'needs_check']];
      cases.forEach(function (c) {
        var r = find(c[0], c[1]);
        assert(r, c[0] + '-' + c[1] + ' 未生成关系');
        assert(r.type === c[2], c[0] + '-' + c[1] + ' 期望 ' + c[2] + '，实际 ' + r.type);
      });
      [['P1', 'P2'], ['P1', 'P5'], ['P2', 'P4'], ['P1', 'P6'], ['P3', 'P5']].forEach(function (pr) {
        var r = find(pr[0], pr[1]);
        assert(r.type !== 'support' && r.type !== 'conflict', pr[0] + '-' + pr[1] + ' 不应判为支持/冲突');
      });
      var p35 = find('P3', 'P5');
      assert(p35.evidence.some(function (e) { return e.evidenceId === 'E3-1' && e.supports === 'sleep'; }), 'P3-P5 应引用 E3-1 并标记其支持睡眠（非学习效率）');
      assert(/学习效率/.test(p35.reason) && /睡眠|入睡/.test(p35.reason), '待核验理由应说明学习效率与睡眠证据的错配');
    });

    test('自定义三篇（A/B/C）：不误判冲突，工作包只引用自定义', function () {
      var custom = [
        { id: 'A', title: '娱乐短视频时长与课堂注意力', question: '娱乐短视频时长是否影响课堂注意力？', method: '自陈式横断面问卷', methodType: '问卷调查', sampleSize: 400, conclusion: '娱乐短视频时长与课堂注意力负相关。', limitations: '横断面无法推断因果；注意力为自评。', evidence: [{ id: 'EA1', text: '时长与注意力负相关 r=-0.3' }], tags: ['注意力', '娱乐'], stance: 'negative', aspect: '注意力' },
        { id: 'B', title: '教育短视频对课程测验成绩的随机实验', question: '教育短视频是否提升测验成绩？', method: '随机对照实验', methodType: '随机对照实验', sampleSize: 120, conclusion: '教育短视频显著提升测验成绩。', limitations: '干预仅 4 周。', evidence: [{ id: 'EB1', text: '后测 +9 分 p<0.05' }], tags: ['教育内容', '成绩'], stance: 'positive', aspect: '教育内容' },
        { id: 'C', title: '娱乐短视频总时长与 GPA 的纵向研究', question: '控制睡眠与学习投入后娱乐短视频总时长是否影响 GPA？', method: '纵向追踪', methodType: '纵向追踪', sampleSize: 900, conclusion: '控制后娱乐短视频总时长与 GPA 无显著关系。', limitations: 'GPA 客观但单一。', evidence: [{ id: 'EC1', text: 'β=0.02, p=0.5' }], tags: ['学业成绩', '娱乐'], stance: 'neutral', aspect: '学业成绩' }
      ];
      var a = engine.analyze(custom);
      assert(a.papers.length === 3, '应为 3 篇，实际 ' + a.papers.length);
      assert(a.relations.filter(function (r) { return r.type === 'conflict'; }).length === 0, 'A/B/C 不应判为冲突');
      assert(a.relations.filter(function (r) { return r.type === 'support'; }).length === 0, 'A/B/C 不应判为支持');
      assert(a.workpack.references.length === 3, '工作包应只引用 3 篇自定义');
      assert(a.papers.every(function (p) { return !p.isSample; }), '不应含示例标记');
      var md = exporter.toMarkdown(a);
      assert(md.indexOf('请根据原文核验') >= 0, '自定义导出缺少核验提示');
    });

    test('研究空白：三要素齐全且绑定来源局限', function () {
      analyzed.gaps.forEach(function (g) {
        assert(g.whyWorth && g.whyWorth.length > 5, g.id + ' 缺少「为什么值得继续研究」');
        assert(g.howVerify && g.howVerify.length > 5, g.id + ' 缺少「可以怎样验证」');
        assert(g.sourceLimitations && g.sourceLimitations.length >= 1, g.id + ' 缺少来源局限');
        assert(g.paperIds && g.paperIds.length >= 1, g.id + ' 未绑定来源文献');
        assert(g.derived === true, g.id + ' 应标记为整理推断的候选问题');
      });
    });

    test('完整度规则：公式说明与缺失字段列表', function () {
      var rule = engine.completenessRule();
      assert(rule.indexOf('10') >= 0 && rule.indexOf('90%') >= 0, '规则说明缺少阈值');
      var partial = { title: 'T', authors: 'A', year: 2024, evidence: [{ id: 'E1-1', text: 'x' }] };
      var a = engine.analyze([partial]);
      var p = a.papers[0];
      assert(p.completeness === 40, '4/10 字段应为 40%，实际 ' + p.completeness);
      assert(p.missing && p.missing.length === 6, '缺失字段数错误：' + (p.missing || []).length);
      assert(p.completenessLevel === '待补', '等级判断错误：' + p.completenessLevel);
    });

    test('导出文件名：含 PaperTrail 与主题、时间', function () {
      var name = exporter.fileName(analyzed, '大学生短视频使用与学习效率', new Date('2026-11-16T10:00:00'));
      assert(name.indexOf('PaperTrail-') === 0, '文件名缺少 PaperTrail 前缀');
      assert(name.indexOf('短视频') >= 0, '文件名缺少主题');
      assert(/20261116-1000\.md$/.test(name), '文件名缺少时间戳：' + name);
      var bad = exporter.fileName(analyzed, 'a/b\\c:d*e?f"g<h>i|j', new Date());
      assert(!/[\/\\:*?"<>|]/.test(bad), '文件名未清理非法字符：' + bad);
    });

    test('导出：示例证据标注「示例材料」，用户编辑不虚构来源', function () {
      var md = exporter.toMarkdown(analyzed, { now: '2026-11-16T10:00:00' });
      assert(md.indexOf('示例材料') >= 0, '示例证据缺少标注');
      var edited = JSON.parse(JSON.stringify(analyzed));
      edited.workpack.questions.push({ text: '用户新增的追问', sources: [], userEdited: true });
      edited.workpack.edited = true;
      var md2 = exporter.toMarkdown(edited, { now: '2026-11-16T10:00:00' });
      assert(md2.indexOf('用户新增的追问') >= 0, '编辑内容未进入导出');
      assert(md2.indexOf('用户补充') >= 0 || md2.indexOf('无自动来源') >= 0, '新增行缺少无来源说明');
    });

    test('回归 U7/U8/U9：睡眠不入学习汇总、测验成绩不并入效率', function () {
      function mk(id, title, q, m, con, ev, stance) {
        return { id: id, title: title, question: q, method: m, methodType: m, sampleSize: 300, conclusion: con, limitations: '', subjects: '大学生', evidence: ev.map(function (t, i) { return { id: id + 'E' + (i + 1), text: t }; }), tags: [], stance: stance };
      }
      var U7 = mk('U7', '睡前使用与睡眠时长', '睡前短视频是否影响睡眠时长？', '日记法', '睡前使用日日平均睡眠时长减少18分钟；未测学习表现。', ['睡前使用日平均睡眠时长减少18分钟（未测学习表现）。'], 'negative');
      var U8 = mk('U8', '控制投入后测验成绩', '控制学习投入后短视频时长与测验成绩是否相关？', '问卷+回归', '控制学习投入后，短视频时长与课程测验成绩不显著。', ['控制学习投入后，时长与测验成绩 β=-0.02，p=0.62。'], 'neutral');
      var U9 = mk('U9', '教育视频测验增益', '教育视频是否提升测验成绩？', '随机对照实验', '教育视频组一周后测验得分高于阅读组。', ['教育视频组测验得分比阅读组高5.2分（p=0.03）。'], 'positive');

      var r7 = engine.analyze([U7]);
      assert(r7.papers[0].cmp.outcome.key === 'sleep_duration', 'U7 应识别为睡眠时长，实际 ' + r7.papers[0].cmp.outcome.key);
      assert(r7.workpack.synthesis.length === 0, 'U7 不应进入学习结果汇总');
      assert(r7.workpack.sleepSynthesis.length === 1, 'U7 应进入「睡眠相关（非学习结果）」');

      var r8 = engine.analyze([U8]);
      assert(r8.papers[0].cmp.outcome.key === 'knowledge', 'U8 应识别为知识/测验成绩，实际 ' + r8.papers[0].cmp.outcome.key);
      var r9 = engine.analyze([U9]);
      assert(r9.papers[0].cmp.outcome.key === 'knowledge', 'U9 应识别为知识/测验成绩，实际 ' + r9.papers[0].cmp.outcome.key);

      var rM = engine.analyze([U7, U8, U9]);
      var learningText = rM.workpack.synthesis.map(function (s) { return s.statement; }).join(' ');
      assert(learningText.indexOf('睡眠时长') < 0, '学习结果汇总不应包含睡眠时长');
      assert(rM.workpack.sleepSynthesis.length === 1, '睡眠指标应单独列出');
      rM.papers.forEach(function (p) { if (p.id === 'U8' || p.id === 'U9') assert(p.cmp.outcome.class === 'learning', p.id + ' 应为学习结果'); });

      /* U8 与“学习效率自评”文献不得判为同量表冲突 */
      var U10 = mk('U10', '效率自评', '短视频是否影响学习效率？', '问卷', '短视频时长与学习效率负相关。', ['时长与学习效率得分负相关 r=-0.3。'], 'negative');
      var rE = engine.analyze([U8, U10]);
      var pair = rE.relations.concat(rE.incomparables).filter(function (r) { return (r.aId === 'U8' && r.bId === 'U10') || (r.aId === 'U10' && r.bId === 'U8'); })[0];
      assert(pair && pair.type !== 'conflict' && pair.type !== 'support', 'U8 与效率自评不应判为冲突/支持，实际 ' + (pair && pair.type));
    });

    test('回归 U1/U2/U3：未测边界排除、不同设计为并列结果', function () {
      function mk(id, title, q, m, mt, con, lim, ev, stance) {
        return { id: id, title: title, question: q, method: m, methodType: mt, subjects: '大学生', conclusion: con, limitations: lim, evidence: ev.map(function (t, i) { return { id: id + 'E' + (i + 1), text: t }; }), tags: [], stance: stance };
      }
      var U1 = mk('U1', '睡前短视频与睡眠时长', '睡前短视频是否减少睡眠时长？', '日记法', '日记法', '睡前使用日比未使用日平均睡眠时长少18分钟。研究未测量课程成绩、知识掌握或学习效率。', '研究未测量课程成绩、知识掌握或学习效率。', ['睡前使用日平均睡眠时长减少18分钟（未测学习结果）。'], 'negative');
      var U2 = mk('U2', '学习投入与测验成绩', '学习投入与课程测验成绩是否相关？', '纵向追踪', '纵向追踪', '控制既往成绩后，学习投入与课程测验成绩呈正相关，β=0.28，p=0.01。', '观察性。', ['控制既往成绩后，学习投入与测验成绩 β=0.28，p=0.01。'], 'positive');
      var U3 = mk('U3', '教育视频测验增益', '教育视频是否提升知识测验？', '随机对照实验', '随机对照实验', '教育视频组知识测验分数提高5.2分，p=0.03。', '仅一周。', ['教育视频组知识测验分数提高5.2分，p=0.03。'], 'positive');
      var a = engine.analyze([U1, U2, U3]);
      var u1 = a.papers.filter(function (p) { return p.id === 'U1'; })[0];
      assert(u1.cmp.outcome.key === 'sleep_duration', 'U1 应识别为睡眠时长，实际 ' + u1.cmp.outcome.key);
      var bkeys = (u1.boundaries || []).map(function (b) { return b.key; });
      assert(bkeys.indexOf('knowledge') >= 0 && bkeys.indexOf('efficiency') >= 0, 'U1 应记录知识/效率未测边界：' + bkeys.join(','));
      var learningText = a.workpack.synthesis.map(function (s) { return s.statement; }).join(' ');
      a.workpack.synthesis.forEach(function (s) { assert(s.paperIds.indexOf('U1') < 0, 'U1 不得作为学习结果方向样本：' + s.paperIds.join(',')); });
      assert((a.workpack.sleepSynthesis[0].paperIds || []).indexOf('U1') >= 0, 'U1 应作为睡眠结果的有效样本');
      var hasNeg = a.workpack.outline.some(function (o) { return /负向/.test(o.heading); });
      assert(!hasNeg, '无负向学习证据时不应生成负向证据章节');
      var u2 = a.papers.filter(function (p) { return p.id === 'U2'; })[0];
      var u3 = a.papers.filter(function (p) { return p.id === 'U3'; })[0];
      assert(u2.cmp.outcome.key === 'knowledge' && u3.cmp.outcome.key === 'knowledge', 'U2/U3 应为知识/测验成绩');
      var rel = a.relations.concat(a.incomparables).filter(function (r) { return (r.aId === 'U2' && r.bId === 'U3') || (r.aId === 'U3' && r.bId === 'U2'); })[0];
      assert(rel && rel.type === 'related', 'U2/U3 应为相关线索（不同自变量/设计），实际 ' + (rel && rel.type));
      assert(rel && /并列|自变量|设计/.test(rel.reason), 'U2/U3 理由需说明自变量/设计差异');
      var kn = a.workpack.synthesis.filter(function (s) { return s.outcomeKey === 'knowledge'; })[0];
      assert(kn && /并列结果/.test(kn.statement), '知识成绩汇总需标注并列结果');
      assert((a.workpack.dataBoundaries || []).length >= 2, '应列出数据边界');
    });

    return results;
  }

  return { run: run };
});