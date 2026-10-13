/* ============================================================
 * store.js — localStorage 持久化 + 统计聚合
 * 单条错题记录结构：
 * {
 *   id: string,
 *   createdAt: number,            // 时间戳
 *   text: string,                 // 题目文字（可空）
 *   image: string|null,          // base64 dataURL
 *   module: string,              // 最终生效模块 key
 *   subtype: string|null,         // 最终生效题型 key
 *   analysis: object,             // 原始分析结果（备份）
 *   pits: string[],               // 选中的踩坑（默认全选）
 *   myAnswer: string,             // 我的错误答案
 *   correctAnswer: string,        // 正确答案
 *   note: string,                 // 自我反思笔记
 *   tags: string[]
 * }
 * ============================================================ */

const Store = (() => {
  const KEY = "xc_records_v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { console.warn("load fail", e); return []; }
  }
  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); }
    catch (e) {
      console.error("save fail", e);
      // 多半是图片过大超 localStorage 配额
      throw new Error("存储失败：可能截图过大超过浏览器本地配额，请裁剪后再上传。");
    }
  }

  function uid() {
    return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---- CRUD ---- */
  function getAll() { return load().sort((a, b) => b.createdAt - a.createdAt); }
  function getById(id) { return load().find(r => r.id === id) || null; }

  function add(record) {
    const arr = load();
    const item = Object.assign({
      id: uid(),
      createdAt: Date.now(),
      text: "", image: null,
      module: null, subtype: null,
      analysis: null, pits: [],
      myAnswer: "", correctAnswer: "", note: "", tags: [],
    }, record);
    arr.push(item);
    save(arr);
    return item;
  }

  function update(id, patch) {
    const arr = load();
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return null;
    arr[idx] = Object.assign({}, arr[idx], patch, { id, createdAt: arr[idx].createdAt });
    save(arr);
    return arr[idx];
  }

  function remove(id) {
    const arr = load();
    const next = arr.filter(r => r.id !== id);
    save(next);
    return arr.length !== next.length;
  }

  function clearAll() { save([]); }

  /* ---- 统计聚合 ---- */
  function stats() {
    const arr = load();
    const total = arr.length;

    // 模块计数
    const moduleCounts = {};
    for (const m in window.XC.MODULES) moduleCounts[m] = 0;
    arr.forEach(r => { if (r.module) moduleCounts[r.module] = (moduleCounts[r.module] || 0) + 1; });

    // 题型计数
    const subtypeCounts = {};
    arr.forEach(r => { if (r.subtype) subtypeCounts[r.subtype] = (subtypeCounts[r.subtype] || 0) + 1; });

    // 踩坑计数：key = "module|subtype|pitText"，便于排行
    const pitMap = {};   // key -> { module, subtype, subtypeName, moduleName, pit, count }
    arr.forEach(r => {
      if (!r.pits || !r.pits.length) return;
      const sub = window.XC.SUBTYPE_MAP[r.subtype] || { name: "未细分" };
      const mod = window.XC.MODULES[r.module] || { name: "未分类" };
      r.pits.forEach(p => {
        const key = r.module + "|" + (r.subtype || "") + "|" + p;
        if (!pitMap[key]) {
          pitMap[key] = {
            module: r.module, subtype: r.subtype,
            moduleName: mod.name, subtypeName: sub.name,
            pit: p, count: 0,
          };
        }
        pitMap[key].count++;
      });
    });
    const pitRank = Object.values(pitMap).sort((a, b) => b.count - a.count);

    // 最近 N 天趋势
    const trend = buildTrend(arr, 14);

    // 模块排行（按错题数降序）
    const moduleRank = Object.entries(moduleCounts)
      .filter(([k]) => window.XC.MODULES[k])
      .map(([k, v]) => ({ key: k, count: v, ...window.XC.MODULES[k] }))
      .sort((a, b) => b.count - a.count);

    // 错误率相关：myAnswer != correctAnswer 视为真正错题（有标记的）
    const answeredWrong = arr.filter(r => r.myAnswer && r.correctAnswer && r.myAnswer !== r.correctAnswer).length;

    return {
      total, moduleCounts, subtypeCounts,
      moduleRank, pitRank, trend,
      answeredWrong, byModuleTop: moduleRank[0] || null,
    };
  }

  function buildTrend(arr, days) {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = {};
    arr.forEach(r => {
      const d = new Date(r.createdAt);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((today - d) / 86400000);
      if (diff >= 0 && diff < days) {
        const key = formatDate(d);
        map[key] = (map[key] || 0) + 1;
      }
    });
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = formatDate(d);
      out.push({ date: key, label: key.slice(5), count: map[key] || 0 });
    }
    return out;
  }
  function formatDate(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  return { getAll, getById, add, update, remove, clearAll, stats };
})();

window.XC.Store = Store;
