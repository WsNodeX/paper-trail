/* PaperTrail 解析器：把粘贴文本 / TXT / Markdown 拆分为文献块并抽取结构化字段。
   纯本地规则，无外部依赖。失败时返回明确原因与修复建议。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.parser = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEPARATOR = /^\s*(?:-{3,}|={3,}|_{3,}|\*{3,}|#{3,}\s*分隔.*)\s*$/;
  var HEADING = /^#{1,3}\s+\S/;
  var NUMBERED = /^\s*(?:\d{1,2}[.、)]|文献\s*\d{1,2}|论文\s*\d{1,2})\s*\S/;
  var TITLE_LABEL = /^\s*(?:标题|题目|文献标题)\s*[：:]/;

  var FIELD_PATTERNS = [
    ['question', /(?:研究问题|核心问题|问题)\s*[：:]\s*(.+)/],
    ['subjects', /(?:研究对象|被试|参与者|样本来源)\s*[：:]\s*(.+)/],
    ['method', /(?:研究方法|方法|设计)\s*[：:]\s*(.+)/],
    ['sampleSize', /(?:样本量|样本规模|样本|N)\s*[：:]\s*(.+)/],
    ['conclusion', /(?:主要结论|核心结论|结论|发现|结果)\s*[：:]\s*(.+)/],
    ['limitations', /(?:局限|局限性|不足|限制)\s*[：:]\s*(.+)/],
    ['authors', /(?:作者)\s*[：:]\s*(.+)/],
    ['tags', /(?:主题标签|标签|关键词|主题)\s*[：:]\s*(.+)/],
    ['evidence', /(?:证据片段|可引用证据|证据|引用片段)\s*[：:]\s*(.+)/]
  ];

  var METHOD_RULES = [
    [/随机对照|RCT/i, '随机对照实验'],
    [/准实验|干预|限用|断舍离/, '干预实验'],
    [/纵向|追踪|随访|两学期|面板/, '纵向追踪'],
    [/日记|经验采样|ESM/, '日记法'],
    [/元分析|荟萃|系统综述|meta/i, '元分析'],
    [/访谈|质性|扎根|个案/, '质性访谈'],
    [/问卷|量表|调查|回归/, '问卷调查'],
    [/实验/, '实验研究']
  ];

  var ASPECT_RULES = [
    [/睡眠|入睡|失眠/, '睡眠质量'],
    [/注意力|专注|走神/, '注意力'],
    [/学业成绩|GPA|绩点|成绩/, '学业成绩'],
    [/时间挤占|挤占|时间分配/, '时间挤占'],
    [/动机|兴趣|投入/, '学习动机'],
    [/干预|限用|自我管理|断舍离/, '干预策略'],
    [/效率/, '学习效率']
  ];

  var NEG_WORDS = /损害|降低|下降|负向|负相关|阻碍|干扰|恶化|推迟|损耗|减少|负面影响|不利|缩短|较少|更少|少\s*\d/;
  var POS_WORDS = /提升|促进|提高|改善|正相关|有益|增益|增强|显著高于|高于|高出|高\s*\d|更高|更好|多于|快于|恢复|正向预测|正向影响|正向关联|预测作用为正/;
  var NEU_WORDS = /无显著|不显著|未见显著|没有显著|无关联|无显著关联|p\s*[=>]\s*0\.05|p=0\.[1-9]/;

  function detectStance(text) {
    if (!text) return 'unknown';
    if (NEU_WORDS.test(text)) return 'neutral';
    /* 主效应方向优先用「第一句结论」：多句结论常把「主结果 + 次要正向反馈」并列，
       整体混判会把明确的负向主效应抹成 mixed。仅当首句判不出时才看全文。 */
    var first = String(text).split(/[。；;！？\n]/).filter(function (cl) { return cl.trim(); })[0] || '';
    function judge(t) {
      var neg = NEG_WORDS.test(t), pos = POS_WORDS.test(t);
      if (neg && pos) return 'mixed';
      if (neg) return 'negative';
      if (pos) return 'positive';
      return 'unknown';
    }
    var head = judge(first);
    if (head !== 'unknown') return head;
    return judge(text);
  }

  function detectMethodType(text) {
    for (var i = 0; i < METHOD_RULES.length; i++) {
      if (METHOD_RULES[i][0].test(text || '')) return METHOD_RULES[i][1];
    }
    return '';
  }

  function detectAspect(text) {
    for (var i = 0; i < ASPECT_RULES.length; i++) {
      if (ASPECT_RULES[i][0].test(text || '')) return ASPECT_RULES[i][1];
    }
    return '';
  }

  function extractYear(text) {
    var m = (text || '').match(/(?:19|20)\d{2}/g);
    if (!m) return null;
    for (var i = 0; i < m.length; i++) {
      var y = parseInt(m[i], 10);
      if (y >= 1950 && y <= 2035) return y;
    }
    return null;
  }

  function extractSampleSize(text) {
    var t = String(text || '');
    var m = t.match(/(\d[\d,]*)\s*(?:名|人|位|份|例)/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    m = t.match(/(?:N|n|样本量|样本)\s*[=：:为]?\s*(\d[\d,]*)/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    m = t.match(/^\s*(\d[\d,]*)\s*$/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    return null;
  }

  function cleanLine(s) {
    return String(s || '').replace(/^#{1,6}\s*/, '').replace(/^\s*\d{1,2}[.、)]\s*/, '').trim();
  }

  /* 将整段文本拆分为文献块 */
  function splitBlocks(text) {
    var lines = String(text || '').split(/\r?\n/);
    var blocks = [], cur = [];
    var hasSeparator = lines.some(function (l) { return SEPARATOR.test(l); });
    var headingCount = lines.filter(function (l) { return HEADING.test(l); }).length;
    var titleCount = lines.filter(function (l) { return TITLE_LABEL.test(l); }).length;
    var numberedCount = lines.filter(function (l) { return NUMBERED.test(l); }).length;

    var mode = 'single';
    if (hasSeparator) mode = 'separator';
    else if (titleCount >= 2) mode = 'title';
    else if (headingCount >= 2) mode = 'heading';
    else if (numberedCount >= 2) mode = 'numbered';

    function flush() {
      var joined = cur.join('\n').trim();
      if (joined) blocks.push(joined);
      cur = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var isBoundary =
        (mode === 'separator' && SEPARATOR.test(line)) ||
        (mode === 'title' && TITLE_LABEL.test(line)) ||
        (mode === 'heading' && HEADING.test(line)) ||
        (mode === 'numbered' && NUMBERED.test(line));
      if (isBoundary && cur.join('\n').trim()) flush();
      if (mode === 'separator' && SEPARATOR.test(line)) continue;
      cur.push(line);
    }
    flush();
    return { blocks: blocks, mode: mode };
  }

  function labeledField(block, patterns) {
    var lines = block.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
        var m = lines[i].match(patterns[j][1]);
        if (m) return { key: patterns[j][0], value: m[1].trim(), line: i };
      }
    }
    return null;
  }

  function allLabeled(block) {
    var out = {};
    var lines = block.split(/\r?\n/);
    lines.forEach(function (line) {
      FIELD_PATTERNS.forEach(function (p) {
        var m = line.match(p[1]);
        if (m && !out[p[0]]) out[p[0]] = m[1].trim();
      });
    });
    return out;
  }

  function sentences(text) {
    /* 句号后面常紧跟右括号或引号（如「高 5.2 分（p=0.03）。」），先拆出句界再匹配，避免整句被弃 */
    return String(text || '').split(/[。；;!\n]/).map(function (s) { return s.replace(/^[）」』”"'）\s]+/, '').replace(/[（(][^（）()]*[）)]$/, '').trim(); }).filter(function (s) { return s.length >= 8; });
  }

  /* 解析单个文献块 */
  function parseBlock(block, index) {
    var raw = String(block || '').trim();
    var errors = [];
    if (raw.length < 20) {
      return { paper: null, error: { blockIndex: index, preview: raw.slice(0, 40), reason: '内容过短（少于 20 字），无法识别为一篇文献。', suggestion: '请为每篇文献提供标题和至少一句摘要或结论；多篇文献之间用 --- 分隔线隔开。' } };
    }

    var labeled = allLabeled(raw);
    var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var titleLineIdx = 0;
    var title = labeled.title || '';
    if (!title) {
      var tm = raw.match(/^\s*(?:标题|题目|文献标题)\s*[：:]\s*(.+)$/m);
      if (tm) title = tm[1].trim();
    }
    if (!title) {
      title = cleanLine(lines[0]);
      if (title.length > 80) title = title.slice(0, 80) + '…';
    } else {
      for (var i = 0; i < lines.length; i++) {
        if (cleanLine(lines[i]).indexOf(title.slice(0, 12)) === 0) { titleLineIdx = i; break; }
      }
    }

    var bodyLines = lines.filter(function (l, idx) {
      if (idx === titleLineIdx && !labeled.title) return false;
      return !/^\s*(?:标题|题目|文献标题)\s*[：:]/.test(l);
    });
    var body = bodyLines.join('\n');

    var authors = labeled.authors || '';
    if (!authors) {
      var second = cleanLine(lines[titleLineIdx + 1] || '');
      if (second && second.length <= 40 && /[,，、]/.test(second) && !/研究|方法|结论|摘要|大学|学院/.test(second) && !/\d{4}/.test(second)) {
        authors = second.replace(/\s*\d{4}.*$/, '').trim();
      }
    }
    var year = extractYear(raw);

    var question = labeled.question || '';
    if (!question) {
      var qm = body.match(/[^。？?\n]{6,60}[？?]/);
      if (qm) question = qm[0].trim();
    }

    var method = labeled.method || '';
    if (!method) {
      var ms = sentences(body).filter(function (s) { return /问卷|实验|访谈|追踪|日记|元分析|量表|回归|干预|抽样/.test(s); });
      if (ms.length) method = ms[0];
    }
    var methodType = detectMethodType(method || body);

    var sampleSize = labeled.sampleSize ? extractSampleSize(labeled.sampleSize) : extractSampleSize(body);

    var conclusion = labeled.conclusion || '';
    if (!conclusion) {
      var cs = sentences(body).filter(function (s) { return /表明|发现|结果显示|显示|证实|提示|说明|认为|得出/.test(s); });
      if (cs.length) conclusion = cs.join('；');
      else {
        var stanceSent = sentences(body).filter(function (s) { return NEG_WORDS.test(s) || POS_WORDS.test(s) || NEU_WORDS.test(s); });
        if (stanceSent.length) conclusion = stanceSent.join('；');
      }
    }

    var limitations = labeled.limitations || '';
    if (!limitations) {
      var ls = sentences(body).filter(function (s) { return /局限|不足|限制|但|缺乏|未能|样本较|仅/.test(s) && s !== conclusion; });
      if (ls.length) limitations = ls.slice(0, 2).join('；');
    }

    var subjects = labeled.subjects || '';
    if (!subjects) {
      var sm = body.match(/(?:以|选取|招募|来自)[^。；\n]{2,40}(?:大学生|本科生|研究生|学生|被试)/);
      if (sm) subjects = sm[0].replace(/^(以|选取|招募|来自)/, '').trim();
    }

    var evidence = [];
    if (labeled.evidence) {
      labeled.evidence.split(/[;；]|(?:\d[.、)])/).forEach(function (t) {
        t = t.trim();
        if (t.length >= 6) evidence.push({ id: '', text: t });
      });
    }
    if (!evidence.length && conclusion) {
      sentences(conclusion).slice(0, 2).forEach(function (s) { evidence.push({ id: '', text: s + '。' }); });
    }

    var tags = [];
    if (labeled.tags) tags = labeled.tags.split(/[,，、;；\s]+/).filter(Boolean).slice(0, 6);
    if (!tags.length) {
      var aspect = detectAspect(conclusion || body);
      if (aspect) tags.push(aspect);
      if (methodType) tags.push(methodType);
    }

    var stance = detectStance(conclusion || body);
    var aspect = detectAspect(conclusion || body) || (tags[0] || '');

    var structuredCount = [question, method, conclusion, limitations, subjects].filter(Boolean).length;
    if (!question && !method && !conclusion) {
      return { paper: null, error: { blockIndex: index, preview: title.slice(0, 40), reason: '未能从该段落识别出研究问题、方法或结论中的任何一项。', suggestion: '建议使用「研究问题：… / 方法：… / 结论：…」的标注格式，或粘贴包含完整摘要的段落；多篇文献之间用 --- 分隔。' } };
    }

    var paper = {
      id: 'U' + (index + 1),
      title: title || '未命名文献 ' + (index + 1),
      authors: authors,
      year: year,
      question: question,
      subjects: subjects,
      method: method,
      methodType: methodType,
      sampleSize: sampleSize,
      conclusion: conclusion,
      limitations: limitations,
      evidence: evidence,
      tags: tags,
      stance: stance,
      aspect: aspect,
      claimTokens: [],
      isSample: false,
      parsedFields: structuredCount,
      sourceText: raw
    };
    return { paper: paper, error: null };
  }

  /* 解析整段输入文本 */
  function parseText(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) {
      return { papers: [], errors: [{ blockIndex: -1, preview: '', reason: '输入为空。', suggestion: '请粘贴至少一篇论文摘要，或上传 TXT / Markdown 文件。' }], mode: 'none' };
    }
    var split = splitBlocks(trimmed);
    var papers = [], errors = [];
    split.blocks.forEach(function (b, i) {
      var r = parseBlock(b, i);
      if (r.paper) papers.push(r.paper);
      if (r.error) errors.push(r.error);
    });
    if (!papers.length && !errors.length) {
      errors.push({ blockIndex: -1, preview: trimmed.slice(0, 40), reason: '未能识别出任何文献块。', suggestion: '请检查内容是否包含标题与摘要；多篇文献用 --- 分隔线或「标题：」开头区分。' });
    }
    papers.forEach(function (p, i) {
      p.id = 'U' + (i + 1);
      p.evidence.forEach(function (e, j) { e.id = 'E' + (i + 1) + '-' + (j + 1); });
    });
    return { papers: papers, errors: errors, mode: split.mode };
  }

  /* 单个文件视为一篇文献（若内部无分隔结构） */
  function parseFile(name, content) {
    var r = parseText(content);
    if (r.papers.length === 1 && !r.papers[0].title) r.papers[0].title = name.replace(/\.(txt|md|markdown)$/i, '');
    if (r.papers.length === 1 && r.papers[0].title === '未命名文献 1') {
      r.papers[0].title = name.replace(/\.(txt|md|markdown)$/i, '');
    }
    return r;
  }

  return {
    parseText: parseText,
    parseFile: parseFile,
    parseBlock: parseBlock,
    splitBlocks: splitBlocks,
    detectStance: detectStance,
    detectMethodType: detectMethodType,
    detectAspect: detectAspect,
    extractYear: extractYear,
    extractSampleSize: extractSampleSize
  };
});