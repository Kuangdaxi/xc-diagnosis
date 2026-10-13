/* ============================================================
 * analyzer.js — 题型 / 模块自动判别 + 踩坑分析
 * 基于关键词规则评分，无外部依赖
 * ============================================================ */

const Analyzer = (() => {
  const { MODULES, SUBTYPES, SUBTYPE_MAP, RULES, MODULE_FALLBACK } = window.XC;

  /**
   * 计算某文本命中规则的关键词
   * @returns { hits:number, words:string[] }
   */
  function matchRule(text, rule) {
    const hits = [];
    for (const kw of rule.keywords) {
      if (text.indexOf(kw) !== -1) hits.push(kw);
    }
    return { hits: hits.length, words: hits };
  }

  /**
   * 主分析函数
   * @param {string} rawText 用户输入的题目文本
   * @returns {{
   *   module: string, moduleScore: number,
   *   subtype: string|null, subtypeScore: number,
   *   confidence: number, reasoning: string,
   *   matched: {module:string, type:string, words:string[]}[]
   *   pits: string[], logic: string|null,
   *   unknown: boolean
   * }}
   */
  function analyze(rawText) {
    const text = (rawText || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return { module: null, moduleScore: 0, subtype: null, subtypeScore: 0,
        confidence: 0, reasoning: "未输入题目内容，无法分析。", matched: [], pits: [], logic: null, unknown: true };
    }

    // 题型得分 + 模块得分累计
    const typeScores = {};      // type -> score
    const moduleScores = {};     // module -> score
    const matchedWords = {};     // type -> words[]
    const matchedReasons = {};   // type -> reason

    for (const rule of RULES) {
      const { hits, words } = matchRule(text, rule);
      if (hits > 0) {
        typeScores[rule.type] = (typeScores[rule.type] || 0) + hits;
        moduleScores[rule.module] = (moduleScores[rule.module] || 0) + hits;
        if (!matchedWords[rule.type]) matchedWords[rule.type] = [];
        matchedWords[rule.type].push(...words);
        matchedReasons[rule.type] = rule.reason;
      }
    }

    // 选最高分题型
    let bestType = null, bestTypeScore = 0;
    for (const t in typeScores) {
      if (typeScores[t] > bestTypeScore) { bestTypeScore = typeScores[t]; bestType = t; }
    }

    // 选最高分模块
    let bestModule = null, bestModuleScore = 0;
    for (const m in moduleScores) {
      if (moduleScores[m] > bestModuleScore) { bestModuleScore = moduleScores[m]; bestModule = m; }
    }

    // 兜底：题型无命中时，用 MODULE_FALLBACK 判模块
    let usedFallback = false;
    if (!bestModule) {
      for (const m in MODULE_FALLBACK) {
        for (const kw of MODULE_FALLBACK[m]) {
          if (text.indexOf(kw) !== -1) {
            moduleScores[m] = (moduleScores[m] || 0) + 1;
            if (!bestModule || moduleScores[m] > bestModuleScore) {
              bestModule = m; bestModuleScore = moduleScores[m];
            }
            usedFallback = true;
          }
        }
      }
    }

    // 仍无命中
    if (!bestModule) {
      return {
        module: null, moduleScore: 0, subtype: null, subtypeScore: 0,
        confidence: 0,
        reasoning: "未匹配到明显的行测题型特征词，请手动选择模块与题型。",
        matched: [], pits: [], logic: null, unknown: true,
      };
    }

    // 置信度：基于得分（命中关键词越多越高，封顶95%）
    const totalHits = Object.values(moduleScores).reduce((a, b) => a + b, 0);
    let confidence = Math.min(95, 35 + bestModuleScore * 18);
    if (usedFallback) confidence = Math.min(confidence, 45);
    if (!bestType) confidence = Math.min(confidence, 55);

    // 题型与踩坑
    let pits = [];
    let logic = null;
    let subtypeKey = null;
    let subtypeScore = 0;
    let reasoning = "";

    if (bestType) {
      const st = SUBTYPE_MAP[bestType];
      subtypeKey = bestType;
      subtypeScore = bestTypeScore;
      pits = st.pits;
      logic = st.logic;
      reasoning = `命中题型【${st.name}】（${MODULES[st.module].name}）。${matchedReasons[bestType]}。`
        + `共匹配 ${bestTypeScore} 个特征词：${[...new Set(matchedWords[bestType])].join("、")}。`;
    } else {
      // 仅判断到模块
      reasoning = `判断为【${MODULES[bestModule].name}】模块，但未能精确到具体题型。`
        + `命中的模块特征词较少，建议手动选择题型以获得对应踩坑提示。`;
    }

    // 整理 matched 列表（用于 UI 展示）
    const matched = [];
    for (const t in matchedWords) {
      const st = SUBTYPE_MAP[t];
      matched.push({
        module: st.module, type: t, typeName: st.name,
        words: [...new Set(matchedWords[t])],
        score: typeScores[t],
      });
    }
    matched.sort((a, b) => b.score - a.score);

    return {
      module: bestModule, moduleScore: bestModuleScore,
      subtype: subtypeKey, subtypeScore,
      confidence: Math.round(confidence),
      reasoning, matched, pits, logic, unknown: false,
    };
  }

  /**
   * 为指定 module + subtype 取该题型踩坑与逻辑（手动修正时用）
   */
  function getPreset(moduleKey, subtypeKey) {
    if (subtypeKey && SUBTYPE_MAP[subtypeKey]) {
      return { pits: SUBTYPE_MAP[subtypeKey].pits, logic: SUBTYPE_MAP[subtypeKey].logic };
    }
    if (moduleKey) {
      const list = SUBTYPES.filter(s => s.module === moduleKey);
      return { pits: list.flatMap(s => s.pits), logic: list.map(s => s.name + "：" + s.logic).join("\n") };
    }
    return { pits: [], logic: "" };
  }

  return { analyze, getPreset };
})();

window.XC.Analyzer = Analyzer;
