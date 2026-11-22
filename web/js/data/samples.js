/* PaperTrail 示例数据：6 篇关于「大学生短视频使用与学习效率」的模拟论文。
   全部为虚构示例，仅用于演示产品闭环。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.samples = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var papers = [
    {
      id: 'P1',
      title: '短视频碎片化使用对大学生课堂注意力的影响——基于三所高校的问卷调查',
      authors: '王雨桐, 陈立',
      year: 2023,
      question: '短视频碎片化使用是否损害大学生的课堂注意力？',
      subjects: '三所综合性高校在读本科生',
      method: '横断面问卷调查，配合课堂注意力自评量表与使用行为日志',
      methodType: '问卷调查',
      sampleSize: 1286,
      conclusion: '日均短视频使用超过 2 小时的学生，课堂注意力自评得分显著更低；碎片化切换频率与课堂走神次数呈正相关，提示碎片化使用损害注意力维持。',
      limitations: '横断面设计无法推断因果；注意力测量依赖自我报告，缺乏客观指标。',
      evidence: [
        { id: 'E1-1', text: '日均使用 >2h 组的注意力得分比低使用组低 11.3 分（p<0.01）。' },
        { id: 'E1-2', text: '碎片化切换频率与课堂走神次数正相关（r=0.42, p<0.001）。' }
      ],
      tags: ['注意力', '碎片化使用', '问卷调查'],
      stance: 'negative',
      aspect: '注意力',
      claimTokens: ['时长负向', '注意力损耗'],
      isSample: true
    },
    {
      id: 'P2',
      title: '短视频使用时长与大学生学业成绩的关系：一项纵向追踪研究',
      authors: '李昊然, 赵敏',
      year: 2024,
      question: '短视频使用时长能否预测一学期后的学业成绩变化？',
      subjects: '某双一流高校大一至大三学生',
      method: '两学期纵向追踪，结合教务系统 GPA 数据与屏幕时间截图',
      methodType: '纵向追踪',
      sampleSize: 742,
      conclusion: '基线短视频使用时长负向预测学期末 GPA 变化；控制睡眠与学习投入后效应减弱但仍显著，结果支持时间挤占假说。',
      limitations: '样本来自单一院校，代表性有限；使用时长未区分娱乐与教育内容类型。',
      evidence: [
        { id: 'E2-1', text: '基线时长每增加 1 小时，学期 GPA 变化 -0.08（β=-0.19, p<0.05）。' },
        { id: 'E2-2', text: '控制睡眠与学习投入后，时长效应量约减半，时间挤占路径仍成立。' }
      ],
      tags: ['学业成绩', '时间挤占', '纵向追踪'],
      stance: 'negative',
      aspect: '学业成绩',
      claimTokens: ['时长负向', '时间挤占'],
      isSample: true
    },
    {
      id: 'P3',
      title: '睡前短视频使用、睡眠质量与次日学习效率的链式关系',
      authors: '周晓萌, 钱峰, 杜若冰',
      year: 2023,
      question: '睡前短视频使用如何通过睡眠质量影响次日学习效率？',
      subjects: '两所高校寄宿制本科生',
      method: '14 天每日日记法，配合睡眠手环客观记录',
      methodType: '日记法',
      sampleSize: 318,
      conclusion: '睡前 30 分钟内使用短视频显著推迟入睡时间、降低睡眠效率，次日自测学习效率随之下降；睡眠质量在使用时长与学习效率之间起中介作用。',
      limitations: '样本量较小；手环仅记录睡眠时长与效率，未包含睡眠分期数据。',
      evidence: [
        { id: 'E3-1', text: '睡前使用日比未使用日平均入睡延迟 +27 分钟。' },
        { id: 'E3-2', text: '睡眠效率的中介效应占总效应的 46%（Bootstrap 95% CI 不含 0）。' }
      ],
      tags: ['睡眠质量', '学习效率', '中介机制'],
      stance: 'negative',
      aspect: '睡眠质量',
      claimTokens: ['时长负向', '睡眠中介'],
      isSample: true
    },
    {
      id: 'P4',
      title: '教育类短视频能否促进大学生学习？一项随机对照实验',
      authors: '郑一帆, 林可',
      year: 2024,
      question: '以教育内容为主的短视频使用是否提升课程知识掌握与学习动机？',
      subjects: '某高校选修同一门通识课程的学生',
      method: '随机对照实验：教育短视频学习组 vs 传统图文阅读组，为期 4 周',
      methodType: '随机对照实验',
      sampleSize: 156,
      conclusion: '教育类短视频组的知识后测得分显著高于阅读组，学习动机评分更高；内容类型对学习效果的解释力大于使用时长，提示「看什么」比「看多久」更关键。',
      limitations: '干预仅持续 4 周，长期效果未知；实验内容经过人工筛选，生态效度有限。',
      evidence: [
        { id: 'E4-1', text: '短视频组知识后测平均分高出阅读组 8.6 分（p<0.05）。' },
        { id: 'E4-2', text: '回归模型中内容类型解释的方差显著大于使用时长。' }
      ],
      tags: ['教育内容', '学习动机', '实验研究'],
      stance: 'positive',
      aspect: '学习动机',
      claimTokens: ['内容增益', '动机提升'],
      isSample: true
    },
    {
      id: 'P5',
      title: '大学生短视频使用与学习效率：控制混淆变量后的再检验',
      authors: '何静怡, 孙鹏',
      year: 2022,
      question: '控制学习投入与作息规律后，短视频使用是否仍与学习效率相关？',
      subjects: '五所高校分层抽样本科生',
      method: '大样本问卷调查与多元层级回归',
      methodType: '问卷调查',
      sampleSize: 2431,
      conclusion: '在控制学习投入、作息规律与专业差异后，短视频总时长与学习效率无显著关联；既有负向结论可能混淆了生活方式变量，不宜直接推断短视频损害学习。',
      limitations: '学习效率为自评指标；未区分娱乐与教育内容，测量粒度不足。',
      evidence: [
        { id: 'E5-1', text: '加入混淆变量后，时长对效率的回归系数 β=0.03（p=0.41），不显著。' },
        { id: 'E5-2', text: '未分层的内容类型是本研究最主要的测量缺陷。' }
      ],
      tags: ['学习效率', '混淆变量', '问卷调查'],
      stance: 'neutral',
      aspect: '学习效率',
      claimTokens: ['无显著关联', '混淆变量'],
      isSample: true
    },
    {
      id: 'P6',
      title: '「数字断舍离」限用干预对大学生短视频使用与学习投入的影响',
      authors: '吴天琪, 高翔',
      year: 2025,
      question: '为期两周的短视频限用干预能否改善大学生的学习投入与专注时长？',
      subjects: '自愿报名的高频短视频使用大学生',
      method: '准实验干预研究：限用组 vs 等待对照组，含两周后随访',
      methodType: '干预实验',
      sampleSize: 92,
      conclusion: '限用组的学习投入与日均专注时长显著改善，提示减少使用可恢复注意力资源；但两周后随访效果明显衰减，干预需要持续支持才能维持。',
      limitations: '样本小且为自愿报名，存在选择偏差；缺乏一个月以上的长期随访。',
      evidence: [
        { id: 'E6-1', text: '干预后限用组日均专注时长 +34 分钟，学习投入量表得分 +0.6（p<0.05）。' },
        { id: 'E6-2', text: '两周随访时改善效果衰减约 60%。' }
      ],
      tags: ['干预策略', '学习投入', '实验研究'],
      stance: 'positive',
      aspect: '干预策略',
      claimTokens: ['干预有效', '效果衰减'],
      isSample: true
    }
  ];

  return {
    topic: '大学生短视频使用与学习效率',
    papers: papers,
    disclaimer: '以上 6 篇论文均为虚构示例数据，仅用于演示 PaperTrail 的整理流程，不代表真实研究结论。'
  };
});