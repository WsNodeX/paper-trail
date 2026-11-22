/* PaperTrail 规则引擎：文献补全、观点关系识别、研究空白归纳、综述工作包生成。
   当前版本为纯本地规则引擎；预留 window.PaperTrailAdapter.analyze(papers) 接口，
   未来接入模型时返回同构结果即可，UI 无需改动。

   v2 关系匹配（本轮重点）：在判定「支持 / 冲突」前，先逐维比较两篇研究：
   自变量（研究操作）、结果变量、测量口径、内容类型、研究设计、研究对象、时间范围。
   仅当「结果变量相同 + 测量口径可比」时，才允许判为支持或冲突；否则降级为
   「相关线索」或「不可直接比较」，并给出具体差异说明，避免仅凭宽泛主题相近就下结论。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.engine = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var FAMILY_MAP = {
    '注意力': '使用与学习损耗', '学业成绩': '使用与学习损耗', '时间挤占': '使用与学习损耗',
    '睡眠质量': '使用与学习损耗', '学习效率': '使用与学习损耗',
    '学习动机': '内容类型与学习增益', '教育内容': '内容类型与学习增益',
    '干预策略': '干预与自我管理', '学习投入': '干预与自我管理'
  };

  var TOKEN_DESC = {
    '时长负向': '短视频使用时长与注意力、学业表现等学习指标呈负向关联',
    '时间挤占': '短视频使用通过挤占学习与睡眠时间影响学业',
    '睡眠中介': '睡眠质量在短视频使用与学习效率之间起中介作用',
    '注意力损耗': '碎片化使用与注意力维持困难相关',
    '内容增益': '教育类内容对知识掌握与学习动机有正向作用',
    '动机提升': '教育类短视频可提升学习动机',
    '无显著关联': '控制混淆变量后，使用时长与学习效率无显著关联',
    '混淆变量': '既有结论可能受生活方式等混淆变量影响',
    '干预有效': '限用干预可短期改善学习投入与专注时长',
    '效果衰减': '干预效果随时间衰减，需要持续支持'
  };

  /* 关系类型元信息（供 UI 复用）：颜色 + 图标/形状 + 文字，避免只靠颜色区分。 */
  var REL_TYPES = {
    support: { label: '支持', shape: '●', color: '#1a7f5a', soft: 'support-soft' },
    conflict: { label: '冲突', shape: '▲', color: '#b4432f', soft: 'conflict-soft' },
    supplement: { label: '补充', shape: '◆', color: '#2b6cb0', soft: 'supplement-soft' },
    related: { label: '相关线索', shape: '◇', color: '#a06a12', soft: 'warn-soft' },
    incomparable: { label: '不可直接比较', shape: '▨', color: '#7c5cbf', soft: 'gap-soft' }
  };

  var GAP_RULES = [
    { key: 'causal', re: /横断面|无法推断因果|因果推断|相关设计/, title: '因果证据不足', description: '现有负向结论多来自横断面或相关设计，无法确定「短视频使用导致学习变差」还是「学习状态差的学生更爱刷短视频」。', suggestion: '可追问：能否用交叉滞后面板或随机限用实验分离因果方向？', why: '因果方向决定干预是否有效：若为反向因果，限用短视频并不能改善学习，政策与个人建议都会写错。', how: '用交叉滞后面板模型（两学期以上）或随机分配限用干预，比较因果路径系数。' },
    { key: 'sample', re: /单一院校|单所高校|样本来自单一|选择偏差|自愿报名|代表性有限/, title: '样本代表性有限', description: '部分研究仅覆盖单一院校或自愿报名者，结论难以推广到不同层次、不同专业的大学生群体。', suggestion: '可追问：跨院校、跨专业的分层样本是否会改变效应大小？', why: '单一院校/自愿样本会高估或低估效应，综述若直接推广会误导读者对普遍性的判断。', how: '按院校层次、专业、年级分层抽样复测，比较效应量的组间差异与置信区间。' },
    { key: 'measure', re: /自我报告|自评|自测/, title: '缺乏客观测量', description: '注意力与学习效率多依赖自评量表，主观偏差可能放大或掩盖真实效应。', suggestion: '可追问：用课堂行为编码、注意力测验或教务成绩等客观指标复核，结论是否一致？', why: '自评与客观指标可能给出相反结论，测量方式本身就是争议来源，需要单独检验。', how: '同一批被试同时采集自评量表与客观指标（注意力测验/教务 GPA/行为编码），做一致性分析。' },
    { key: 'content', re: /未区分.{0,8}内容|内容类型.{0,10}(缺陷|不足)|测量粒度/, title: '内容类型分层不足', description: '多数研究只统计总时长，未区分娱乐、社交与教育内容，「看什么」的差异被平均掉了。', suggestion: '可追问：按内容类型分层后，娱乐与教育使用的效应方向是否相反？', why: '娱乐与教育内容效应可能方向相反，混在一起会相互抵消，掩盖真实关系。', how: '按内容类型（娱乐/社交/教育）分层回归或分组实验，比较各层效应方向与大小。' },
    { key: 'longterm', re: /长期随访|长期效果|仅.{0,4}\d+\s*周|随访.{0,6}衰减|效果衰减/, title: '长期效果未知', description: '干预与实验研究周期普遍较短，改善效果能否维持一个月以上仍不清楚。', suggestion: '可追问：延长随访至一学期，干预收益是否持续？衰减的边界条件是什么？', why: '短期收益若快速衰减，则干预的实践价值有限，综述需要给出可持续性边界。', how: '延长随访至一学期并设置多个测量点，拟合效果衰减曲线，识别维持效果的边界条件。' }
  ];

  var FIELD_KEYS = ['title', 'authors', 'year', 'question', 'subjects', 'method', 'sampleSize', 'conclusion', 'limitations', 'evidence'];

  function completeness(p) {
    var filled = 0;
    FIELD_KEYS.forEach(function (k) {
      var v = p[k];
      if (k === 'evidence') { if (v && v.length) filled++; }
      else if (k === 'sampleSize' || k === 'year') { if (v !== null && v !== undefined && v !== '') filled++; }
      else if (v) filled++;
    });
    return Math.round(filled / FIELD_KEYS.length * 100);
  }

  function completenessLevel(score) {
    if (score >= 90) return '完整';
    if (score >= 60) return '较全';
    return '待补';
  }

  var COMPLETENESS_FIELDS = [
    ['title', '标题'], ['authors', '作者'], ['year', '年份'], ['question', '研究问题'],
    ['subjects', '研究对象'], ['method', '方法'], ['sampleSize', '样本量'],
    ['conclusion', '核心结论'], ['limitations', '局限'], ['evidence', '证据片段']
  ];
  function completenessRule() {
    return '证据完整度 = 已识别字段数 ÷ 10 × 100%。十字段为：' +
      COMPLETENESS_FIELDS.map(function (f) { return f[1]; }).join('、') +
      '。每存在一项计 10%；≥90% 记「完整」，60–89% 记「较全」，<60% 记「待补」。该分数只反映字段可追溯程度，不代表研究质量。';
  }
  function missingFields(p) {
    return COMPLETENESS_FIELDS.filter(function (f) {
      var v = p[f[0]];
      if (f[0] === 'evidence') return !(v && v.length);
      return v === null || v === undefined || v === '';
    }).map(function (f) { return f[1]; });
  }

  function familyOf(p) {
    return FAMILY_MAP[p.aspect] || '其他视角';
  }

  /* ---------- 比较维度派生：结果变量 / 自变量 / 测量 / 内容 / 设计 ---------- */
  function fullText(p) {
    return [p.title, p.question, p.method, p.conclusion, p.limitations].join(' ');
  }

  var OUTCOME_KEYWORDS = {
    gpa: /GPA|学业成绩|期末成绩|绩点/i,
    knowledge: /知识(后测|掌握|测验|保持|得分)|测验成绩|后测成绩|课程成绩|知识测验/,
    efficiency: /学习效率/,
    engagement: /学习投入|专注时长/,
    attention: /课堂注意力|注意力维持|走神|注意力得分|注意力测验/,
    motivation: /学习动机|动机/,
    sleep_duration: /睡眠时长|睡眠时间|睡眠总时长/,
    sleep_onset: /入睡延迟|入睡时间|入睡困难|入睡/,
    sleep_quality: /睡眠质量|睡眠效率/
  };
  var OUTCOME_LABELS = { gpa: '学业成绩（GPA）', knowledge: '知识掌握／测验成绩', efficiency: '学习效率（自评）', engagement: '学习投入／专注时长', attention: '课堂注意力', motivation: '学习动机', sleep_duration: '睡眠时长', sleep_onset: '入睡延迟', sleep_quality: '睡眠质量' };
  function outLabel(k) { return OUTCOME_LABELS[k] || k; }
  var NEG_TRIGGER = /未测量|未测|未报告|未评估|没有(测量|测|收集|报告|评估)|未收集|未记录|未分析|未考察|并未(测|测量)|没有收集/;
  var LEARNING_KEYS = ['gpa', 'knowledge', 'efficiency', 'engagement', 'attention', 'motivation'];

  /* 明确否定表述 -> 数据边界：这些结果变量被声明为“未测量/未报告”，不得当作实测结果或方向。 */
  function deriveBoundaries(p) {
    var text = fullText(p);
    var clauses = text.split(/[。；;！？\n]/);
    var found = {};
    clauses.forEach(function (cl) {
      if (!NEG_TRIGGER.test(cl)) return;
      Object.keys(OUTCOME_KEYWORDS).forEach(function (k) {
        if (!found[k] && OUTCOME_KEYWORDS[k].test(cl)) found[k] = cl.trim();
      });
      if (/课程成绩|课程分数/.test(cl) && !found.gpa) found.gpa = cl.trim();
      if (/未测(量)?(学习表现|学习结果|学业表现|学习指标|任何学习)|没有(测|收集).{0,8}学习/.test(cl)) {
        LEARNING_KEYS.forEach(function (k) { if (!found[k]) found[k] = '整体声明：该研究未测量学习结果'; });
      }
    });
    return Object.keys(found).map(function (k) { return { key: k, label: outLabel(k), text: found[k] }; });
  }

  /* 去除“未测量…”等否定句后再抽取结果变量，避免把未测变量当成实测变量。 */
  function sanitizeNegated(text) {
    return String(text || '').split(/[。；;！？\n]/).filter(function (cl) { return !NEG_TRIGGER.test(cl); }).join('。');
  }

  /* 结果变量：在「未被否定的句子」上按字段权重打分——结论/问题/标题提到才算主结果，方法与局限提到不加分 */
  function deriveOutcome(p) {
    var fields = [
      p.conclusion,
      p.question,
      p.evidence ? (p.evidence || []).map(function (e) { return e.text; }).join('。') : '',
      p.title
    ];
    var all = [
      ['gpa', OUTCOME_KEYWORDS.gpa, OUTCOME_LABELS.gpa, 'learning'],
      ['knowledge', OUTCOME_KEYWORDS.knowledge, OUTCOME_LABELS.knowledge, 'learning'],
      ['efficiency', OUTCOME_KEYWORDS.efficiency, OUTCOME_LABELS.efficiency, 'learning'],
      ['engagement', OUTCOME_KEYWORDS.engagement, OUTCOME_LABELS.engagement, 'learning'],
      ['attention', OUTCOME_KEYWORDS.attention, OUTCOME_LABELS.attention, 'learning'],
      ['motivation', OUTCOME_KEYWORDS.motivation, OUTCOME_LABELS.motivation, 'learning'],
      ['sleep_onset', OUTCOME_KEYWORDS.sleep_onset, OUTCOME_LABELS.sleep_onset, 'sleep'],
      ['sleep_duration', OUTCOME_KEYWORDS.sleep_duration, OUTCOME_LABELS.sleep_duration, 'sleep'],
      ['sleep_quality', OUTCOME_KEYWORDS.sleep_quality, OUTCOME_LABELS.sleep_quality, 'sleep']
    ];
    function firstIn(text) {
      var cleaned = sanitizeNegated(text || '');
      if (!cleaned) return null;
      for (var i = 0; i < all.length; i++) {
        if (all[i][1].test(cleaned)) return all[i];
      }
      return null;
    }
    /* 顺序：结论 → 研究问题 → 证据 → 标题；命中的第一个变量即主结果变量 */
    for (var i = 0; i < fields.length; i++) {
      var row = firstIn(fields[i]);
      if (row) return { key: row[0], label: row[2], class: row[3] };
    }
    return { key: 'unknown', label: '未识别结果变量', class: 'unknown' };
  }

  function deriveContent(p) {
    var t = fullText(p);
    var unclassified = /未区分.{0,12}(娱乐|教育|内容)|未分内容|总时长|内容类型.{0,6}(缺陷|不足|未)/.test(t);
    var edu = /教育类|教育内容|教育短视频|知识类|课程内容/.test(t);
    var ent = /娱乐/.test(t);
    if (unclassified) return '未区分';
    if (edu && !ent) return '教育';
    if (ent && !edu) return '娱乐';
    if (edu && ent) return '混合';
    return '未区分';
  }

  function deriveMeasure(p) {
    var t = [p.method, p.limitations, p.conclusion].join(' ');
    if (/GPA|教务|测验|后测|客观成绩|课堂行为编码|成绩数据/.test(t)) return '客观成绩';
    if (/自评|自我报告|自陈|自测|量表|问卷/.test(t)) return '自评';
    if (/专注时长|行为日志|屏幕时间|手环|行为编码|日均/.test(t)) return '行为记录';
    return '未识别';
  }

  /* 证据片段直接支持的变量：用于“该片段是否支撑某条断言”的绑定判断。 */
  function evidenceVar(text) {
    var t = String(text || '');
    if (/入睡|睡眠|睡前|睡得更/.test(t)) return 'sleep';          // 睡眠优先，避免“睡眠效率”被当成学习效率
    if (/未测|未报告|未评估|未收集|未记录|未分析|未考察|没有测|没有收集/.test(t)) return 'other'; // 纯否定句不构成结果证据
    if (/走神|课堂注意力|注意力得分|注意力维持|注意力/.test(t)) return 'attention';
    if (/测验|后测|知识掌握|知识保持|知识得分/.test(t)) return 'knowledge';
    if (/GPA|教务|成绩变化|学期.*成绩/i.test(t)) return 'gpa';
    if (/专注时长|学习投入|投入量表/.test(t)) return 'engagement';
    if (/学习效率|效率/.test(t)) return 'efficiency';
    if (/动机/.test(t)) return 'motivation';
    return 'other';
  }
  /* 证据变量是否与某结果变量可兼容（睡眠类彼此兼容，其余需一致） */
  var LEARN_VARS = ['attention', 'knowledge', 'gpa', 'engagement', 'efficiency', 'motivation'];
  function evidenceMatches(varKey, outcomeKey) {
    if (!outcomeKey || outcomeKey === 'unknown') return false;
    if (outcomeKey.indexOf('sleep') === 0) return varKey === 'sleep';
    if (varKey === outcomeKey) return true;
    /* 证据片段是结论原句，常同时提到学习投入与测验成绩；二者属同一学习结果家族时按家族兼容 */
    if (LEARN_VARS.indexOf(varKey) >= 0 && LEARN_VARS.indexOf(outcomeKey) >= 0) return true;
    return false;
  }

  function deriveExposure(p) {
    var t = (p.title || '') + ' ' + (p.question || '') + ' ' + (p.conclusion || '');
    if (/限用|断舍离|限制使用/.test(t)) return { key: 'intervene', label: '限用干预' };
    if (/教育类|教育内容|教育短视频/.test(t)) return { key: 'edu', label: '教育内容使用' };
    if (/碎片化|切换频率/.test(t)) return { key: 'fragment', label: '碎片化使用' };
    if (/睡前/.test(t)) return { key: 'bedtime', label: '睡前使用' };
    if (/使用时长|总时长|时长|日均|屏幕时间|使用时间/.test(t)) return { key: 'duration', label: '使用时长' };
    if (/学习投入|专注时长/.test(t)) return { key: 'engagement', label: '学习投入' };
    return { key: 'use', label: '使用行为' };
  }

  function designClass(p) {
    var m = p.methodType || p.method || '';
    if (/实验|干预|RCT|随机对照|准实验/.test(m)) return '实验/干预';
    if (/纵向|追踪|面板|日记|随访/.test(m)) return '纵向/追踪';
    if (/问卷|横断面|调查|相关/.test(m)) return '问卷/横断面';
    return '其他';
  }

  var STANCE_NEG = /损害|降低|下降|负向|负相关|阻碍|干扰|恶化|推迟|损耗|减少|负面影响|不利|缩短|更少|少\s*\d/;
  var STANCE_POS = /提升|促进|提高|改善|正相关|有益|增益|增强|显著高于|恢复|正向预测|正向影响|正向关联/;
  var STANCE_NEU = /无显著|不显著|未见显著|没有显著|无关联/;
  function detectStanceLocal(text) {
    var t = String(text || '');
    if (!t) return 'unknown';
    if (STANCE_NEU.test(t)) return 'neutral';
    var neg = STANCE_NEG.test(t), pos = STANCE_POS.test(t);
    if (neg && pos) return 'mixed';
    if (neg) return 'negative';
    if (pos) return 'positive';
    return 'unknown';
  }

  function deriveCmp(p) {
    return {
      outcome: deriveOutcome(p),
      content: deriveContent(p),
      measure: deriveMeasure(p),
      exposure: deriveExposure(p),
      design: designClass(p)
    };
  }

  function enrich(p) {
    var out = Object.assign({}, p);
    out.evidence = (p.evidence || []).map(function (e, i) {
      return { id: e.id || ('E' + String(p.id).replace(/\D/g, '') + '-' + (i + 1)), text: e.text, supports: e.supports || evidenceVar(e.text) };
    });
    out.family = familyOf(out);
    if (!out.claimTokens || !out.claimTokens.length) {
      var suffix = out.stance === 'negative' ? '负向' : out.stance === 'positive' ? '正向' : out.stance === 'neutral' ? '无显著' : '待判断';
      out.claimTokens = out.aspect ? [out.aspect + suffix] : [];
    }
    out.cmp = deriveCmp(out);
    out.boundaries = deriveBoundaries(out);
    out.stanceByOutcome = evidenceVar(out.conclusion || '');
    if (out.stanceByOutcome === 'other') out.stanceByOutcome = 'unknown';
    var stanceSource = out.conclusion || '';
    var parserApi = (root && root.PT && root.PT.parser) || (typeof PT !== 'undefined' && PT.parser) || null;
    /* 结论方向以「结论文本」为唯一事实来源：多句结论里同时出现负向与正向措辞时判为 mixed，
       不能因为命中某一句就盖成 negative/positive。 */
    var ds = null;
    if (parserApi && parserApi.detectStance && stanceSource) ds = parserApi.detectStance(stanceSource);
    /* 结论方向仍以解析器为准（首句主效应）；本地兜底只补解析器判不出的情况，
       并保留原始声明 stance 作为交叉校验字段，便于界面提示「方向存在混合表述」。 */
    var dsLocal = detectStanceLocal(stanceSource);
    /* 方向解析次序：原文显式声明（人工标注）> 结论首句主效应；二者矛盾时保留声明并打标记 */
    if (out.stance === 'negative' || out.stance === 'positive' || out.stance === 'neutral') {
      if (ds && ds !== 'unknown' && ds !== out.stance) out.stanceMixed = true;
    } else if (ds && ds !== 'unknown') {
      out.stance = ds;
      if (dsLocal === 'mixed') out.stanceMixed = true;
    } else out.stance = dsLocal;
    out.completeness = completeness(out);
    out.completenessLevel = completenessLevel(out.completeness);
    out.missing = missingFields(out);
    return out;
  }

  function shared(arrA, arrB) {
    return (arrA || []).filter(function (x) { return (arrB || []).indexOf(x) >= 0; });
  }

  function polarity(stance) {
    if (stance === 'negative') return 'neg';
    if (stance === 'positive') return 'pos';
    if (stance === 'neutral') return 'neu';
    return 'unk';
  }

  function direction(s1, s2) {
    var a = polarity(s1), b = polarity(s2);
    if (a === 'neg' && b === 'neg') return 'same';
    if (a === 'pos' && b === 'pos') return 'same';
    if (a === 'neu' && b === 'neu') return 'same';
    if ((a === 'neg' && (b === 'pos' || b === 'neu')) || (b === 'neg' && (a === 'pos' || a === 'neu'))) return 'opposite';
    if ((a === 'pos' && b === 'neu') || (a === 'neu' && b === 'pos')) return 'opposite';
    return 'mixed';
  }

  var TOPIC_KEYWORDS = ['时长', '效率', '注意力', '成绩', '内容', '睡眠', '动机', '投入'];
  function topicOverlap(a, b) {
    var tagShared = shared(a.tags, b.tags);
    if (tagShared.length) return tagShared;
    var textA = (a.conclusion || '') + (a.question || '');
    var textB = (b.conclusion || '') + (b.question || '');
    return TOPIC_KEYWORDS.filter(function (k) { return textA.indexOf(k) >= 0 && textB.indexOf(k) >= 0; });
  }

  function evidenceOf(p, limit) {
    return (p.evidence || []).slice(0, limit || 1).map(function (e) {
      return { paperId: p.id, evidenceId: e.id, text: e.text, supports: e.supports };
    });
  }

  /* 该文献中“直接支持某结果变量”的证据片段（用于 claim→evidence 绑定） */
  function evidenceForOutcome(p, outcomeKey) {
    return (p.evidence || []).filter(function (e) { return evidenceMatches(e.supports, outcomeKey); })
      .map(function (e) { return { paperId: p.id, evidenceId: e.id, text: e.text, supports: e.supports }; });
  }

  function stanceLabel(s) {
    return { negative: '负向影响', positive: '正向作用', neutral: '无显著关联', mixed: '混合结果', unknown: '方向待判断' }[s] || '方向待判断';
  }

  /* 逐维比较，返回 [{key,label,a,b,same}] */
  function compareDims(a, b) {
    var A = a.cmp, B = b.cmp;
    function d(key, label, av, bv, same) { return { key: key, label: label, a: av, b: bv, same: !!same }; }
    return [
      d('exposure', '自变量/研究操作', A.exposure.label, B.exposure.label, A.exposure.key === B.exposure.key),
      d('outcome', '结果变量', A.outcome.label, B.outcome.label, A.outcome.key !== 'other' && A.outcome.key === B.outcome.key),
      d('measure', '测量口径', A.measure, B.measure, A.measure === B.measure && A.measure !== '未知'),
      d('content', '内容类型', A.content, B.content, A.content === B.content),
      d('design', '研究设计', a.methodType || '未识别', b.methodType || '未识别', (a.methodType || '') === (b.methodType || '')),
      d('subjects', '研究对象', a.subjects || '待补', b.subjects || '待补', (a.subjects || '') === (b.subjects || '')),
      d('time', '时间范围', String(a.year || '不详'), String(b.year || '不详'), a.year === b.year)
    ];
  }

  function diffFactors(dims) {
    return dims.filter(function (x) { return !x.same && x.key !== 'outcome'; }).map(function (x) {
      return { key: x.key, label: x.label + '不同', text: x.label + '不同（' + x.a + ' vs ' + x.b + '）。' };
    });
  }

  function relObj(type, a, b, dims, extra) {
    var o = {
      type: type, aId: a.id, bId: b.id, dims: dims,
      evidence: evidenceOf(a, 1).concat(evidenceOf(b, 1)),
      outcomeKey: (a.cmp.outcome.key === b.cmp.outcome.key && a.cmp.outcome.key !== 'unknown') ? a.cmp.outcome.key : null,
      outcomeLabel: a.cmp.outcome.label
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  function varLabel(v) {
    return { sleep: '睡眠/入睡', attention: '课堂注意力', gpa: 'GPA/学业成绩', knowledge: '知识/测验成绩', engagement: '学习投入/专注时长', efficiency: '学习效率', motivation: '学习动机', other: '其他指标' }[v] || '其他指标';
  }
  function pickEv(p, matched) { return (matched && matched.length ? matched.slice(0, 1) : evidenceOf(p, 1)); }
  function evGapReason(a, b, outLabel, aEv, bEv, dirText) {
    var miss = [];
    if (!aEv.length) miss.push(a.id + ' 的证据片段仅覆盖' + (a.evidence && a.evidence.length ? varLabel(a.evidence[0].supports) : '其他指标') + '，未直接支持「' + outLabel + '」');
    if (!bEv.length) miss.push(b.id + ' 的证据片段仅覆盖' + (b.evidence && b.evidence.length ? varLabel(b.evidence[0].supports) : '其他指标') + '，未直接支持「' + outLabel + '」');
    return '两者结果变量同为「' + outLabel + '」且' + dirText + '，但' + miss.join('；') + '。因此列为「待核验」，不输出确定的支持/冲突；需回原文核验对应变量的证据片段。';
  }

  /* 两两关系：多维可比性 + 证据-断言绑定；支持/冲突需双方都有直接对应结果变量的证据。 */
  function pairRelation(a, b) {
    var A = a.cmp, B = b.cmp;
    var dims = compareDims(a, b);
    var sameOutcome = A.outcome.key !== 'unknown' && A.outcome.key !== 'other' && A.outcome.key === B.outcome.key;
    var sameExposure = A.exposure.key === B.exposure.key;
    var measureKnown = A.measure !== '未识别' && B.measure !== '未识别';
    var measureCmp = A.measure === B.measure && measureKnown;
    var contentConflict = (A.content === '教育') !== (B.content === '教育');
    var dir = direction(a.stance, b.stance);
    var tagShared = shared(a.tags, b.tags);
    var overlap = topicOverlap(a, b);
    var sameFamily = a.family === b.family && a.family !== '其他视角';
    var broadDomain = /短视频/.test(fullText(a)) && /短视频/.test(fullText(b));
    var aSleep = /睡眠|入睡/.test(fullText(a)), bSleep = /睡眠|入睡/.test(fullText(b));
    var aLearn = /学习|测验|成绩|效率|投入|注意力/.test(fullText(a)), bLearn = /学习|测验|成绩|效率|投入|注意力/.test(fullText(b));
    var crossSleep = (aSleep && bLearn) || (bSleep && aLearn);
    var linked = sameOutcome || sameExposure || tagShared.length > 0 || overlap.length > 0 || sameFamily || broadDomain || crossSleep;
    var bothNonNeutral = a.stance !== 'neutral' && b.stance !== 'neutral';

    var aEv = sameOutcome ? evidenceForOutcome(a, A.outcome.key) : [];
    var bEv = sameOutcome ? evidenceForOutcome(b, B.outcome.key) : [];
    var bothDirect = aEv.length > 0 && bEv.length > 0;
    var designComp = A.design === B.design;
    var propComparable = sameExposure && designComp;
    function propDiffReason() {
      var parts = [];
      if (!sameExposure) parts.push('自变量/研究操作不同（' + A.exposure.label + ' vs ' + B.exposure.label + '）');
      if (!designComp) parts.push('研究设计不同（' + (a.methodType || A.design) + ' vs ' + (b.methodType || B.design) + '）');
      return parts.join('；');
    }

    /* 1) 支持：同结果变量 + 测量可比 + 方向一致 + 双方非无显著 + 双方证据直接对应 */
    if (sameOutcome && measureCmp && dir === 'same' && bothNonNeutral && !contentConflict) {
      if (bothDirect && propComparable) {
        return relObj('support', a, b, dims, {
          comparability: 'direct', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)),
          reason: a.id + ' 与 ' + b.id + ' 的研究结果变量同为「' + A.outcome.label + '」，自变量与研究设计可比较、测量口径可比（均' + A.measure + '），方向一致（' + stanceLabel(a.stance) + '），且双方证据片段直接对应，可视为相互支持。',
          scope: '同命题 + 口径可比 + 证据直接对应'
        });
      }
      if (bothDirect && !propComparable) {
        return relObj('related', a, b, dims, {
          comparability: 'related', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)),
          reason: a.id + ' 与 ' + b.id + ' 结果变量同为「' + A.outcome.label + '」且方向一致（' + stanceLabel(a.stance) + '），但' + propDiffReason() + '；只能作为不同研究问题下的并列正向结果线索，不能称为同一命题的直接支持。',
          scope: '并列结果 / 有限可比'
        });
      }
      return relObj('needs_check', a, b, dims, {
        comparability: 'needs-check', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)),
        missingEvidence: (aEv.length ? [] : [a.id]).concat(bEv.length ? [] : [b.id]),
        reason: evGapReason(a, b, A.outcome.label, aEv, bEv, '方向一致'), scope: '同结果变量，但证据未直接对应'
      });
    }

    /* 2) 冲突：同结果变量 + 测量可比 + 方向相反 + 双方证据直接对应；否则降级为待核验 */
    if (sameOutcome && measureCmp && dir === 'opposite' && !contentConflict) {
      if (bothDirect && propComparable) {
        return relObj('conflict', a, b, dims, {
          comparability: 'direct', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)), factors: diffFactors(dims),
          reason: a.id + ' 与 ' + b.id + ' 均研究「' + A.outcome.label + '」，自变量与设计可比较、测量口径可比，方向相反（' + stanceLabel(a.stance) + ' vs ' + stanceLabel(b.stance) + '），且双方证据直接对应，构成需要并置讨论的争议。',
          scope: '同命题 + 口径可比 + 证据直接对应'
        });
      }
      if (bothDirect && !propComparable) {
        return relObj('related', a, b, dims, {
          comparability: 'related', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)), factors: diffFactors(dims),
          reason: a.id + ' 与 ' + b.id + ' 结果变量同为「' + A.outcome.label + '」但方向不同，且' + propDiffReason() + '；不能直接判为冲突，只能作为并列/有限可比结果并说明差异。',
          scope: '并列结果 / 有限可比'
        });
      }
      return relObj('needs_check', a, b, dims, {
        comparability: 'needs-check', evidence: pickEv(a, aEv).concat(pickEv(b, bEv)), factors: diffFactors(dims),
        missingEvidence: (aEv.length ? [] : [a.id]).concat(bEv.length ? [] : [b.id]),
        reason: evGapReason(a, b, A.outcome.label, aEv, bEv, '方向相反') + '（方向不同的片段不能单独作为「' + A.outcome.label + '」相反结论的证据）', scope: '同结果变量，但证据未直接对应，暂不判冲突'
      });
    }

    /* 3) 补充：两项不同问题、实验/干预视角互补（各引自身结果变量证据） */
    var expA = A.design === '实验/干预', expB = B.design === '实验/干预';
    if (expA && expB && !sameOutcome && dir === 'same' && (contentConflict || A.exposure.key !== B.exposure.key)) {
      var aOwn = evidenceForOutcome(a, A.outcome.key), bOwn = evidenceForOutcome(b, B.outcome.key);
      return relObj('supplement', a, b, dims, {
        comparability: 'complementary', evidence: pickEv(a, aOwn).concat(pickEv(b, bOwn)),
        reason: a.id + '（' + (a.methodType || '实验') + '）研究「' + A.exposure.label + '」对「' + A.outcome.label + '」的作用，' +
          b.id + '（' + (b.methodType || '实验') + '）研究「' + B.exposure.label + '」对「' + B.outcome.label + '」的作用；' +
          '二者回答的是不同问题，属互补视角而非同一因果证据。',
        scope: '不同问题／互补视角'
      });
    }

    /* 4) 相关线索：结果变量不同但测量可比、主题同族 */
    if (!contentConflict && measureCmp && !sameOutcome && (sameFamily || sameExposure || tagShared.length > 0)) {
      return relObj('related', a, b, dims, {
        comparability: 'related', evidence: pickEv(a, evidenceForOutcome(a, A.outcome.key)).concat(pickEv(b, evidenceForOutcome(b, B.outcome.key))),
        reason: a.id + ' 与 ' + b.id + ' 主题相关，但结果变量不同（' + A.outcome.label + ' vs ' + B.outcome.label + '）' +
          (dir === 'opposite' ? '，且方向看似不一致' : '') + '。属相关线索：可在综述中并列比较，不能简化成同一命题的相互支持或反驳。',
        scope: '结果变量不同'
      });
    }

    /* 5) 不可直接比较 */
    if (linked) {
      var why = [];
      if (contentConflict) why.push('内容类型不同（' + A.content + ' vs ' + B.content + '）');
      if (!measureCmp && !sameOutcome) why.push('测量口径或结果变量不可比（' + A.measure + '/' + A.outcome.label + ' vs ' + B.measure + '/' + B.outcome.label + '）');
      if (A.design !== B.design) why.push('研究设计不同（' + (a.methodType || A.design) + ' vs ' + (b.methodType || B.design) + '）');
      if (!why.length) why.push('关键变量或人群不同');
      return relObj('incomparable', a, b, dims, {
        comparability: 'none',
        boundaryKey: contentConflict ? 'content' : (!measureCmp ? 'measure' : 'design'),
        factors: diffFactors(dims),
        reason: a.id + ' 与 ' + b.id + ' 不能直接比较：' + why.join('；') + '。不应仅因结论方向不同就判为冲突，也不应合并为同一命题。',
        scope: '不可直接比较'
      });
    }
    return null;
  }

  function detectGaps(papers) {
    var gaps = [];
    GAP_RULES.forEach(function (rule, i) {
      var hits = papers.filter(function (p) { return rule.re.test(p.limitations || ''); });
      if (hits.length) {
        gaps.push({
          id: 'G' + (i + 1),
          key: rule.key,
          title: rule.title,
          description: rule.description,
          suggestion: rule.suggestion,
          whyWorth: rule.why,
          howVerify: rule.how,
          derived: true,
          sourceLimitations: hits.map(function (p) { return { paperId: p.id, text: p.limitations }; }),
          paperIds: hits.map(function (p) { return p.id; }),
          evidence: hits.map(function (p) { return { paperId: p.id, evidenceId: '', text: p.limitations }; })
        });
      }
    });
    return gaps;
  }

  function refString(p) {
    return (p.authors || '佚名') + ' (' + (p.year || '年份不详') + '). ' + p.title + '.';
  }

  function uniq(arr) { var o = [], seen = {}; arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; o.push(x); } }); return o; }

  function buildWorkpack(papers, relations, incomparables, gaps) {
    var byId = {}; papers.forEach(function (p) { byId[p.id] = p; });

    var supports = relations.filter(function (r) { return r.type === 'support'; });
    var conflicts = relations.filter(function (r) { return r.type === 'conflict'; });
    var supplements = relations.filter(function (r) { return r.type === 'supplement'; });
    var relateds = relations.filter(function (r) { return r.type === 'related'; });

    /* 主题：从研究问题/变量归纳（不含方法名称）；睡眠指标与学习结果分开 */
    function paperValid(p) { return p.cmp.outcome.key !== 'unknown' && evidenceForOutcome(p, p.cmp.outcome.key).length > 0 && p.stance !== 'unknown'; }
    /* 主题只采信「实测并报告结果」的文献；仅出现在数据边界里的变量不进入主题短语 */
    var measured = papers.filter(paperValid);
    var exposures = uniq((measured.length ? measured : papers).map(function (p) { return p.cmp.exposure.label; }));
    var outcomes = uniq((measured.length ? measured : papers).map(function (p) { return p.cmp.outcome.label; }));
    var learningOutcomes = uniq(papers.filter(function (p) { return p.cmp.outcome.class === 'learning' && paperValid(p); }).map(function (p) { return p.cmp.outcome.label; }));
    var sleepOutcomes = uniq(papers.filter(function (p) { return p.cmp.outcome.class === 'sleep' && paperValid(p); }).map(function (p) { return p.cmp.outcome.label; }));
    var population = /大学生|高校|本科/.test(papers.map(function (p) { return p.subjects || ''; }).join(' ')) ? '大学生' : '学习者';
    var learnPhrase = learningOutcomes.length
      ? ('学习结果（' + learningOutcomes.join('、') + '）')
      : '学习结果（现有材料未直接测量，见数据边界）';
    var topic = '短视频使用（' + exposures.join('、') + '）与' + population + learnPhrase + '的关系' +
      (sleepOutcomes.length ? '；另含睡眠相关指标（' + sleepOutcomes.join('、') + '，不计入学习结果汇总）' : '');

    /* 方法分布（与主题分离） */
    var methodGroups = {};
    papers.forEach(function (p) {
      var mt = p.methodType || '方法未识别';
      (methodGroups[mt] = methodGroups[mt] || []).push(p);
    });
    var methodDistribution = Object.keys(methodGroups).map(function (mt) {
      var ps = methodGroups[mt];
      var sizes = ps.map(function (p) { return p.sampleSize; }).filter(function (n) { return n; });
      return {
        method: mt,
        design: designClass(ps[0]),
        count: ps.length,
        paperIds: ps.map(function (p) { return p.id; }),
        note: ps.length + ' 篇采用' + mt + (sizes.length ? '，样本量 ' + Math.min.apply(null, sizes) + '–' + Math.max.apply(null, sizes) + ' 人' : '') + '。'
      };
    });
    var methodDifferences = methodDistribution.map(function (m) { return { method: m.method, note: m.note, paperIds: m.paperIds }; });

    /* 核心发现：严格按「同一结果变量」分组；不同结果变量不合并，睡眠单独列出 */
    var synthesis = [];
    var sleepSynthesis = [];
    function dirWord(s) { return { negative: '负向', positive: '正向', neutral: '无显著' }[s] || '方向未知'; }
    function buildOutcomeGroup(key) {
      var ps = papers.filter(function (p) { return p.cmp.outcome.key === key; });
      if (!ps.length) return null;
      var valid = ps.filter(function (p) { return evidenceForOutcome(p, key).length > 0 && p.stance !== 'unknown'; });
      var unverified = ps.filter(function (p) { return evidenceForOutcome(p, key).length === 0; });
      var boundaryExcluded = papers.filter(function (p) {
        return p.cmp.outcome.key !== key && (p.boundaries || []).some(function (b) { return b.key === key; });
      });
      var ids = (valid.length ? valid : ps).map(function (p) { return p.id; });
      var dirs = uniq(valid.map(function (p) { return p.stance; }));
      var ev = [];
      (valid.length ? valid : ps).forEach(function (p) { evidenceForOutcome(p, key).slice(0, 1).forEach(function (e) { ev.push(e); }); });
      var label = ps[0].cmp.outcome.label;
      var exps = uniq(valid.map(function (p) { return p.cmp.exposure.key; }));
      var designs = uniq(valid.map(function (p) { return p.cmp.design; }));
      var propMix = exps.length > 1 || designs.length > 1;
      var status;
      if (valid.length === 0) status = '暂无直接证据';
      else if (valid.length === 1) status = '单一来源';
      else status = unverified.length ? '跨材料归纳（部分待核验）' : '跨材料归纳';
      var notes = [];
      if (unverified.length) notes.push(unverified.map(function (p) { return p.id; }).join('、') + ' 报告该变量但证据未直接测量，已排除出方向统计');
      if (boundaryExcluded.length) notes.push(boundaryExcluded.map(function (p) { return p.id; }).join('、') + ' 明确未测量该结果变量，列入数据边界');
      var stmt;
      if (valid.length === 0) {
        stmt = '「' + label + '」：无有效实测结果可比较（' + ps.map(function (p) { return p.id; }).join('、') + ' 中未见直接证据）。' + (notes.length ? notes.join('；') + '。' : '');
      } else {
        if (valid.length === 1) {
          stmt = '「' + label + '」：目前仅 ' + ids[0] + ' 一篇直接证据，方向为' + dirWord(valid[0].stance) +
            '；样本有限，仅作方向参考，需补充验证。' + (notes.length ? notes.join('；') + '。' : '');
        } else {
          var dirTxt = dirs.length > 1
            ? ('方向不一致（' + valid.map(function (p) { return p.id + '=' + dirWord(p.stance); }).join('、') + '）')
            : ('方向一致为' + dirWord(valid[0].stance));
          stmt = '「' + label + '」：' + valid.length + ' 篇直接证据（' + ids.join('、') + '）' + dirTxt +
            (propMix ? '；自变量/研究设计不同，属并列结果（不可合并为同一因果结论）' : '') + '。' + (notes.length ? notes.join('；') + '。' : '');
        }
      }
      return { statement: stmt, status: status, paperIds: ids, evidence: ev, direction: dirs[0] || 'unknown', outcomeKey: key, outcomeLabel: label, validCount: valid.length, unverified: unverified.map(function (p) { return p.id; }), boundaryExcluded: boundaryExcluded.map(function (p) { return p.id; }) };
    }
    ['attention', 'efficiency', 'gpa', 'knowledge', 'engagement', 'motivation'].forEach(function (k) {
      var g = buildOutcomeGroup(k); if (g) synthesis.push(g);
    });
    ['sleep_onset', 'sleep_duration', 'sleep_quality'].forEach(function (k) {
      var ps = papers.filter(function (p) { return p.cmp.outcome.key === k; });
      if (!ps.length) return;
      var valid = ps.filter(function (p) { return evidenceForOutcome(p, k).length > 0 && p.stance !== 'unknown'; });
      var unverified = ps.filter(function (p) { return evidenceForOutcome(p, k).length === 0; });
      var label = ps[0].cmp.outcome.label, ids = valid.map(function (p) { return p.id; });
      var ev = []; valid.forEach(function (p) { evidenceForOutcome(p, k).slice(0, 1).forEach(function (e) { ev.push(e); }); });
      var note = unverified.length ? ('（' + unverified.map(function (p) { return p.id; }).join('、') + ' 证据未直接测量）') : '';
      sleepSynthesis.push({
        statement: '（睡眠相关，非学习结果）「' + label + '」：有效 ' + valid.length + ' 篇（' + ids.join('、') + '）报告' + (valid.length ? dirWord(valid[0].stance) : '未核验') + note + '。睡眠指标不计入学习结果汇总。',
        status: valid.length >= 2 ? '跨材料归纳' : (valid.length === 1 ? '单一来源' : '暂无直接证据'), paperIds: ids, evidence: ev, direction: valid.length ? valid[0].stance : 'unknown', outcomeKey: k, outcomeLabel: label
      });
    });
    var consensus = synthesis.filter(function (s) { return (s.validCount || 0) >= 2 && (!s.unverified || s.unverified.length === 0); });
    var needsCheck = relations.filter(function (r) { return r.type === 'needs_check'; });

    /* 数据边界：明确“未测量/未报告”的结果变量，独立列出，绝不进入方向统计。 */
    var dataBoundaries = [];
    papers.forEach(function (p) {
      (p.boundaries || []).forEach(function (b) { dataBoundaries.push({ paperId: p.id, key: b.key, label: b.label, text: b.text }); });
    });

    var controversies = conflicts.map(function (r) {
      return {
        statement: r.reason,
        paperIds: [r.aId, r.bId],
        evidence: r.evidence,
        dims: r.dims,
        status: '跨材料归纳'
      };
    });

    /* 不可直接比较：按原因分组，便于紧凑展示 */
    var bGroups = {};
    incomparables.forEach(function (r) {
      var A = byId[r.aId].cmp, B = byId[r.bId].cmp;
      var key = r.boundaryKey || ((A.content === '教育') !== (B.content === '教育') ? 'content'
        : (!(A.measure === B.measure && A.measure !== '未知') ? 'measure' : 'design'));
      (bGroups[key] = bGroups[key] || []).push(r);
    });
    var boundaryLabel = { content: '内容类型不同（教育 vs 总计/娱乐）', measure: '结果变量或测量口径不可比', design: '研究设计不同（相关 vs 干预等）' };
    var boundaryGroups = Object.keys(bGroups).map(function (k) {
      return { key: k, label: boundaryLabel[k] || '关键变量不同', count: bGroups[k].length, items: bGroups[k] };
    });

    var supplementsOut = supplements.map(function (r) {
      return { statement: r.reason, paperIds: [r.aId, r.bId], evidence: r.evidence, status: '跨材料归纳', scope: r.scope };
    });

    /* 追问 */
    var questions = [];
    gaps.forEach(function (g) { questions.push({ text: g.suggestion.replace(/^可追问：/, ''), sources: g.paperIds }); });
    conflicts.slice(0, 2).forEach(function (r) {
      questions.push({ text: r.aId + ' 与 ' + r.bId + ' 结果相反，差异来自测量、设计还是统计控制？', sources: [r.aId, r.bId] });
    });
    supplements.slice(0, 2).forEach(function (r) {
      questions.push({ text: '能否把 ' + r.aId + ' 与 ' + r.bId + ' 的两个不同问题整合进同一设计（如内容分层 + 限用干预）？', sources: [r.aId, r.bId] });
    });

    /* 提纲：只依据真实测量到结果且有直接证据的文献生成；无该类证据则不生成对应章节 */
    var negIds = papers.filter(function (p) { return p.cmp.outcome.class === 'learning' && evidenceForOutcome(p, p.cmp.outcome.key).length > 0 && p.stance === 'negative'; }).map(function (p) { return p.id; });
    var posIds = papers.filter(function (p) { return p.cmp.outcome.class === 'learning' && evidenceForOutcome(p, p.cmp.outcome.key).length > 0 && p.stance === 'positive'; }).map(function (p) { return p.id; });
    var neuIds = papers.filter(function (p) { return p.cmp.outcome.class === 'learning' && evidenceForOutcome(p, p.cmp.outcome.key).length > 0 && p.stance === 'neutral'; }).map(function (p) { return p.id; });
    var validPaperIds = uniq(papers.filter(paperValid).map(function (p) { return p.id; }));
    function src(ids) { return ids.length ? ids : validPaperIds; }
    var outline = [];
    var on = 1;
    function H(t) { return (on++) + ' ' + t; }
    outline.push({ heading: H('引言：问题背景与研究意义'), points: [{ text: '短视频使用与' + population + '学习结果的关系在不同研究中证据不一致，且结果变量与研究设计各异，需按结果变量分别梳理。', sources: src(papers.slice(0, 2).map(function (p) { return p.id; })), status: '跨材料归纳' }] });
    outline.push({ heading: H('概念界定与测量口径'), points: [{ text: '区分自变量（使用时长／碎片化／睡前／教育内容／限用干预）与结果变量（课堂注意力／学业成绩／学习效率／学习投入等），并说明自评与客观指标的差异；睡眠指标单独讨论。', sources: src(validPaperIds), status: '跨材料归纳' }] });
    if (negIds.length) outline.push({ heading: H('负向关联证据（按结果变量分别陈述）'), points: [{ text: '仅整合真正测量了学习结果并报告负向的文献（' + negIds.join('、') + '），按各自结果变量分别陈述，不合并为单一结论。', sources: negIds, status: negIds.length >= 2 ? '跨材料归纳' : '单一来源' }] });
    if (posIds.length) outline.push({ heading: H('正向证据与不同问题'), points: [{ text: '并置报告学习结果正向的文献（' + posIds.join('、') + '）；不同自变量/设计的正向结果属并列线索。', sources: posIds, status: posIds.length >= 2 ? '跨材料归纳' : '单一来源' }] });
    var boundarySrc = uniq(neuIds.concat(dataBoundaries.map(function (b) { return b.paperId; })));
    outline.push({ heading: H('无显著结果、不可直接比较与数据边界'), points: [{ text: '呈现控制混淆变量后的无显著结果、"不可直接比较"的差异说明，以及明确"未测量/未报告"的结果变量（数据边界），避免把不同研究或未测变量当作确定结论。', sources: src(boundarySrc), status: '跨材料归纳' }] });
    outline.push({ heading: H('研究空白与未来方向'), points: gaps.map(function (g) { return { text: g.title + '：' + g.suggestion.replace(/^可追问：/, ''), sources: g.paperIds, status: '候选推断' }; }) });
    outline.push({ heading: H('结论'), points: [{ text: '现有证据支持"按结果变量与情境分别下结论"：不同结果变量与不同设计不能简单合并，未测量的结果不能计入方向统计。', sources: src(validPaperIds), status: '候选推断' }] });

    return {
      topic: topic,
      topicBasis: '主题仅由各文献的研究问题与变量归纳，不含研究方法名称；睡眠指标与学习结果分开，方法构成见「方法分布」。',
      topTags: uniq(exposures.concat(learningOutcomes)).slice(0, 6),
      methodDistribution: methodDistribution,
      synthesis: synthesis,
      sleepSynthesis: sleepSynthesis,
      dataBoundaries: dataBoundaries,
      consensus: consensus,
      needsCheck: needsCheck.map(function (r) { return { statement: r.reason, paperIds: [r.aId, r.bId], evidence: r.evidence, dims: r.dims, scope: r.scope, missingEvidence: r.missingEvidence }; }),
      controversies: controversies,
      supplements: supplementsOut,
      boundaryGroups: boundaryGroups,
      methodDifferences: methodDifferences,
      gaps: gaps,
      questions: questions,
      outline: outline,
      references: papers.map(function (p) { return { id: p.id, text: refString(p), isSample: !!p.isSample }; }),
      stats: {
        papers: papers.length,
        support: supports.length, conflict: conflicts.length, supplement: supplements.length,
        related: relateds.length, needs_check: (function () { return relations.filter(function (r) { return r.type === 'needs_check'; }).length; })(),
        incomparable: incomparables.length, gap: gaps.length,
        relations: relations.length
      }
    };
  }

  /* 主入口：papers → { papers, relations, incomparables, gaps, workpack } */
  function analyze(rawPapers) {
    if (root && root.PaperTrailAdapter && typeof root.PaperTrailAdapter.analyze === 'function') {
      try {
        var adapted = root.PaperTrailAdapter.analyze(rawPapers);
        if (adapted && adapted.papers && adapted.relations && adapted.workpack) return adapted;
      } catch (e) { /* 回退到本地规则引擎 */ }
    }
    var papers = (rawPapers || []).map(enrich);
    var relations = [], incomparables = [];
    var rid = 0;
    for (var i = 0; i < papers.length; i++) {
      for (var j = i + 1; j < papers.length; j++) {
        var r = pairRelation(papers[i], papers[j]);
        if (!r) continue;
        r.id = 'R' + (++rid);
        if (r.type === 'incomparable') incomparables.push(r);
        else relations.push(r);
      }
    }
    var gaps = detectGaps(papers);
    var workpack = buildWorkpack(papers, relations, incomparables, gaps);
    return { papers: papers, relations: relations, incomparables: incomparables, gaps: gaps, workpack: workpack, engine: 'local-rules-v2' };
  }

  return {
    analyze: analyze,
    enrich: enrich,
    completeness: completeness,
    completenessLevel: completenessLevel,
    completenessRule: completenessRule,
    missingFields: missingFields,
    detectGaps: detectGaps,
    buildWorkpack: buildWorkpack,
    pairRelation: pairRelation,
    compareDims: compareDims,
    deriveCmp: deriveCmp,
    stanceLabel: stanceLabel,
    refString: refString,
    FAMILY_MAP: FAMILY_MAP,
    TOKEN_DESC: TOKEN_DESC,
    REL_TYPES: REL_TYPES
  };
});