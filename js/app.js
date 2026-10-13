/* ============================================================
 * app.js — 应用入口、路由、各页面渲染、事件绑定
 * ============================================================ */

const App = (() => {
  const { MODULES, SUBTYPES, SUBTYPE_MAP, Analyzer, Store, UI } = window.XC;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- 录入页临时状态 ---------- */
  let addState = resetAddState();
  function resetAddState() {
    return {
      text: "", image: null, applied: false,
      module: null, subtype: null,
    };
  }

  /* ============================================================
   * 路由
   * ============================================================ */
  const routes = {
    "#/add": renderAdd,
    "#/list": renderList,
    "#/stats": renderStats,
  };

  function currentRoute() {
    const h = location.hash || "#/add";
    return routes[h] ? h : "#/add";
  }

  function render() {
    const app = $("#app");
    const route = currentRoute();
    app.innerHTML = shell(route);
    bindShell();
    routes[route]();
  }

  function navigate(hash) { location.hash = hash; }
  // hashchange 自动触发 render

  function shell(route) {
    const navItem = (h, label) =>
      `<a href="${h}" class="${route === h ? "active" : ""}" data-link="${h}">${label}</a>`;
    const count = Store.getAll().length;
    return `
      <header class="topbar">
        <div class="brand">
          <span class="logo">行</span>
          <span>行测错题诊断</span>
        </div>
        <nav class="nav">
          ${navItem("#/add", "录入错题")}
          ${navItem("#/list", "错题本")}
          ${navItem("#/stats", "分析报告")}
        </nav>
        <div class="spacer"></div>
        <div class="stat-mini">已记录 ${count} 题</div>
      </header>
      <main class="main" id="page"></main>
      <nav class="tabbar">
        <a href="#/add" class="${route === "#/add" ? "active" : ""}" data-link="#/add"><span class="tb-ico">✎</span>录入</a>
        <a href="#/list" class="${route === "#/list" ? "active" : ""}" data-link="#/list"><span class="tb-ico">▤</span>错题本</a>
        <a href="#/stats" class="${route === "#/stats" ? "active" : ""}" data-link="#/stats"><span class="tb-ico">📊</span>分析</a>
      </nav>`;
  }

  function bindShell() {
    // 顶部/底部导航走 hash，浏览器原生处理；无需额外绑定
  }

  /* ============================================================
   * 页面 1：录入错题
   * ============================================================ */
  let analyzeTimer = null;

  function renderAdd() {
    const page = $("#page");
    page.innerHTML = `
      <div class="page-head">
        <h1>录入错题</h1>
        <p>粘贴题目文字或上传截图，系统会自动判断所属行测模块、题型并提示常见踩坑。</p>
      </div>

      <div class="grid grid-2">
        <!-- 左：输入 -->
        <div>
          <div class="card">
            <div class="card-title"><span class="dot"></span>题目内容</div>
            <div class="form-row">
              <label>题目文字</label>
              <textarea id="q-text" placeholder="把题目（含题干和选项）粘贴到这里…&#10;例如：依次填入划横线部分最恰当的一组词是…">${UI.escapeHtml(addState.text)}</textarea>
              <div class="hint">粘贴题目文字后，下方会自动分析模块与题型。</div>
            </div>
          </div>

          <div class="card">
            <div class="card-title"><span class="dot"></span>错题截图（可选）</div>
            <label class="dropzone" id="dz">
              <div class="dz-icon">🖼️</div>
              <div>点击上传或拖入图片</div>
              <div class="hint">支持 PNG / JPG，会自动压缩存储到本地</div>
              <input type="file" id="q-file" accept="image/*" />
            </label>
            <div id="img-preview"></div>
          </div>
        </div>

        <!-- 右：分析 + 补充信息 -->
        <div>
          <div class="card" id="analysis-card">
            <div class="card-title"><span class="dot"></span>智能分析</div>
            <div id="analysis-out">
              <p class="muted" style="font-size:13px;">输入或粘贴题目后，这里会出现自动判别结果。</p>
            </div>
            <div class="mt-12" id="manual-box" style="display:none;">
              <div class="form-row">
                <label>模块（可手动修正）</label>
                <select id="m-module">${UI.moduleOptions(addState.module)}</select>
              </div>
              <div class="form-row">
                <label>题型（可手动修正）</label>
                <select id="m-subtype">${UI.subtypeOptions(addState.module, addState.subtype)}</select>
              </div>
              <div class="section-label">常见踩坑（保存时记录你勾选的项）</div>
              <div id="pits-box"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title"><span class="dot"></span>补充信息（可选）</div>
            <div class="form-row">
              <label>我的错误答案</label>
              <input id="my-ans" type="text" placeholder="例如：B" />
            </div>
            <div class="form-row">
              <label>正确答案</label>
              <input id="ok-ans" type="text" placeholder="例如：D" />
            </div>
            <div class="form-row">
              <label>我的反思 / 易错点</label>
              <textarea id="note" placeholder="为什么做错？下次注意什么…"></textarea>
            </div>
            <button class="btn btn-primary" data-act="save" style="width:100%;">保存到错题本</button>
          </div>
        </div>
      </div>`;

    // 还原图片预览
    if (addState.image) renderImgPreview();

    // 事件
    const ta = $("#q-text");
    ta.addEventListener("input", () => {
      addState.text = ta.value;
      clearTimeout(analyzeTimer);
      analyzeTimer = setTimeout(runAnalysis, 350);
    });

    const fileInput = $("#q-file");
    const dz = $("#dz");
    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
    dz.addEventListener("drop", e => {
      e.preventDefault(); dz.classList.remove("drag");
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    $("#m-module").addEventListener("change", e => {
      addState.module = e.target.value || null;
      addState.subtype = null; addState.applied = true;
      $("#m-subtype").innerHTML = UI.subtypeOptions(addState.module, null);
      refreshPits();
    });
    $("#m-subtype").addEventListener("change", e => {
      addState.subtype = e.target.value || null; addState.applied = true;
      refreshPits();
    });

    page.addEventListener("click", e => {
      if (e.target.closest('[data-act="save"]')) saveRecord();
      if (e.target.closest('[data-act="remove-img"]')) {
        addState.image = null; renderImgPreview();
      }
    });

    // 首次进入若有文字则触发分析
    if (addState.text.trim()) runAnalysis();
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { UI.toast("请上传图片文件", "error"); return; }
    UI.fileToDataURL(file).then(dataURL => {
      addState.image = dataURL;
      renderImgPreview();
      UI.toast("截图已加载", "success", 1400);
    }).catch(err => UI.toast(err.message || "上传失败", "error"));
  }

  function renderImgPreview() {
    const box = $("#img-preview");
    if (!box) return;
    if (!addState.image) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="img-wrap">
      <img class="preview-img" src="${addState.image}" alt="错题截图" />
      <button class="rm" data-act="remove-img" title="移除">✕</button>
    </div>`;
  }

  function runAnalysis() {
    const text = addState.text.trim();
    const out = $("#analysis-out");
    const manual = $("#manual-box");
    if (!text) {
      out.innerHTML = `<p class="muted" style="font-size:13px;">输入或粘贴题目后，这里会出现自动判别结果。</p>`;
      manual.style.display = "none";
      return;
    }
    const result = Analyzer.analyze(text);
    addState.lastAnalysis = result;

    // 渲染预览
    out.innerHTML = renderAnalysisPreview(result);

    // 自动应用建议（仅在尚未应用时）
    if (!addState.applied && result.module) {
      addState.module = result.module;
      addState.subtype = result.subtype;
      const selM = $("#m-module"); if (selM) selM.value = result.module;
      const selS = $("#m-subtype");
      if (selS) selS.innerHTML = UI.subtypeOptions(result.module, result.subtype);
      addState.applied = true;
      manual.style.display = "";
      refreshPits(result.pits);
    } else if (addState.applied) {
      // 已手动修正过，仅展示建议，不覆盖
      manual.style.display = "";
    }
  }

  function renderAnalysisPreview(r) {
    if (r.unknown) {
      return `<div class="analysis-box" style="border-color:var(--warn);">
        <div class="ab-row"><span class="ab-label">判别</span><span class="tag tag-muted">未能自动识别</span></div>
        <div class="reasoning">${UI.escapeHtml(r.reasoning)}</div>
      </div>`;
    }
    const mod = MODULES[r.module];
    const sub = r.subtype ? SUBTYPE_MAP[r.subtype] : null;
    const confBar = `<div style="height:6px;background:var(--bg-soft);border-radius:3px;margin-top:8px;overflow:hidden;">
      <div style="width:${r.confidence}%;height:100%;background:var(--primary);"></div></div>`;
    return `<div class="analysis-box">
      <div class="ab-row">
        <span class="ab-label">模块</span>${UI.moduleTag(r.module)}
        ${sub ? `<span class="ab-label" style="margin-left:10px;">题型</span><span class="tag tag-muted">${UI.escapeHtml(sub.name)}</span>` : ""}
        <span class="confidence" style="margin-left:auto;">置信度 ${r.confidence}%</span>
      </div>
      ${confBar}
      <div class="reasoning">${UI.escapeHtml(r.reasoning)}</div>
      ${r.logic ? `<div class="reasoning" style="margin-top:6px;color:var(--success);"><b>题型逻辑：</b>${UI.escapeHtml(r.logic)}</div>` : ""}
    </div>`;
  }

  function refreshPits(forcePits) {
    const box = $("#pits-box");
    if (!box) return;
    const preset = Analyzer.getPreset(addState.module, addState.subtype);
    const pits = forcePits && forcePits.length ? forcePits : preset.pits;
    if (!pits.length) {
      box.innerHTML = `<p class="muted" style="font-size:12px;">该模块/题型暂无预设踩坑，可在保存后于反思中补充。</p>`;
      return;
    }
    box.innerHTML = pits.map((p, i) => `
      <label style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:var(--bg-soft);border-radius:6px;margin-bottom:6px;cursor:pointer;font-size:13px;color:var(--text-dim);">
        <input type="checkbox" class="pit-cb" data-pit="${UI.escapeHtml(p)}" checked style="margin-top:2px;width:auto;" />
        <span>${UI.escapeHtml(p)}</span>
      </label>`).join("");
  }

  function saveRecord() {
    const text = addState.text.trim();
    if (!text && !addState.image) {
      UI.toast("请至少输入题目文字或上传截图", "warn"); return;
    }
    if (!addState.module) {
      UI.toast("请选择所属模块（或先粘贴题目让系统识别）", "warn"); return;
    }
    const pits = $$(".pit-cb:checked").map(cb => cb.dataset.pit);
    const record = {
      text, image: addState.image,
      module: addState.module, subtype: addState.subtype,
      analysis: addState.lastAnalysis || null,
      pits,
      myAnswer: ($("#my-ans")?.value || "").trim(),
      correctAnswer: ($("#ok-ans")?.value || "").trim(),
      note: ($("#note")?.value || "").trim(),
      tags: [],
    };
    try {
      Store.add(record);
      UI.toast("已保存到错题本", "success");
      addState = resetAddState();
      navigate("#/list");
    } catch (e) {
      UI.toast(e.message || "保存失败", "error", 4000);
    }
  }

  /* ============================================================
   * 页面 2：错题本列表
   * ============================================================ */
  let filter = { module: "", keyword: "" };

  function renderList() {
    const page = $("#page");
    const all = Store.getAll();
    page.innerHTML = `
      <div class="page-head">
        <h1>错题本</h1>
        <p>共 ${all.length} 道错题。可按模块筛选、关键词搜索，点击查看与修正。</p>
      </div>
      <div class="card">
        <div class="grid grid-3" style="align-items:end;">
          <div class="form-row" style="margin:0;">
            <label>按模块筛选</label>
            <select id="f-module">
              <option value="">全部模块</option>
              ${Object.values(MODULES).map(m => `<option value="${m.key}" ${filter.module === m.key ? "selected" : ""}>${m.icon} ${m.name}</option>`).join("")}
            </select>
          </div>
          <div class="form-row" style="margin:0;">
            <label>关键词搜索</label>
            <input id="f-kw" type="text" placeholder="搜索题文 / 笔记" value="${UI.escapeHtml(filter.keyword)}" />
          </div>
          <div class="form-row" style="margin:0;">
            <label>&nbsp;</label>
            <button class="btn" data-act="clear-filter" style="width:100%;">重置筛选</button>
          </div>
        </div>
      </div>
      <div id="q-list" class="mt-12"></div>`;

    $("#f-module").addEventListener("change", e => { filter.module = e.target.value; renderListBody(); });
    $("#f-kw").addEventListener("input", e => { filter.keyword = e.target.value; clearTimeout(analyzeTimer); analyzeTimer = setTimeout(renderListBody, 200); });
    page.addEventListener("click", e => {
      if (e.target.closest('[data-act="clear-filter"]')) {
        filter = { module: "", keyword: "" }; renderList();
      }
      const card = e.target.closest(".q-item");
      if (card && !e.target.closest(".q-actions")) openDetail(card.dataset.id);
      const del = e.target.closest('[data-act="del"]');
      if (del) { e.stopPropagation(); askDelete(del.dataset.id); }
    });
    renderListBody();
  }

  function renderListBody() {
    const box = $("#q-list");
    let list = Store.getAll();
    if (filter.module) list = list.filter(r => r.module === filter.module);
    if (filter.keyword.trim()) {
      const kw = filter.keyword.trim().toLowerCase();
      list = list.filter(r => (r.text || "").toLowerCase().includes(kw) || (r.note || "").toLowerCase().includes(kw));
    }
    if (!list.length) {
      box.innerHTML = `<div class="empty">
        <div class="em-icon">📭</div>
        <h3>暂无错题</h3>
        <p>${Store.getAll().length ? "当前筛选条件下没有错题" : "去录入第一道错题吧"} <a href="#/add">前往录入</a></p>
      </div>`;
      return;
    }
    box.innerHTML = `<div class="q-list">` + list.map(renderQCard).join("") + `</div>`;
  }

  function renderQCard(r) {
    const thumb = r.image
      ? `<img src="${r.image}" alt="" />`
      : `<span>无图</span>`;
    const text = r.text || "（仅有截图，无文字）";
    return `<div class="q-item" data-id="${r.id}" style="cursor:pointer;">
      <div class="q-thumb">${thumb}</div>
      <div class="q-body">
        <div class="q-meta">
          ${UI.moduleTag(r.module)}
          ${UI.subtypeTag(r.subtype)}
          ${r.myAnswer && r.correctAnswer ? `<span class="tag tag-muted">我选 ${UI.escapeHtml(r.myAnswer)} / 正解 ${UI.escapeHtml(r.correctAnswer)}</span>` : ""}
        </div>
        <div class="q-text">${UI.escapeHtml(text)}</div>
        ${r.note ? `<div class="q-note">📝 ${UI.escapeHtml(r.note)}</div>` : ""}
      </div>
      <div class="q-actions">
        <span class="q-time">${UI.timeAgo(r.createdAt)}</span>
        <button class="btn btn-sm" data-act="del" data-id="${r.id}">删除</button>
      </div>
    </div>`;
  }

  async function askDelete(id) {
    const ok = await UI.confirmDialog("确定删除这道错题吗？此操作不可撤销。", { okText: "删除", danger: true });
    if (ok) { Store.remove(id); UI.toast("已删除", "success"); renderListBody(); updateTopbarCount(); }
  }

  /* ============================================================
   * 详情 / 编辑 模态框
   * ============================================================ */
  function openDetail(id) {
    const r = Store.getById(id);
    if (!r) { UI.toast("记录不存在", "error"); return; }
    const bodyHTML = `
      <div class="detail-meta">
        ${UI.moduleTag(r.module)}
        ${UI.subtypeTag(r.subtype)}
        <span class="tag tag-muted">${UI.timeAgo(r.createdAt)}</span>
      </div>
      ${r.image ? `<img class="detail-img" src="${r.image}" alt="错题截图" />` : ""}
      ${r.text ? `<div class="detail-text">${UI.escapeHtml(r.text)}</div>` : ""}
      ${r.analysis && r.analysis.reasoning ? `<div class="section-label">自动判别</div>
        <div class="reasoning" style="color:var(--text-dim);font-size:13px;">${UI.escapeHtml(r.analysis.reasoning)}</div>` : ""}

      <div class="section-label">修正模块 / 题型</div>
      <div class="form-row" style="margin-bottom:10px;">
        <select id="d-module">${UI.moduleOptions(r.module)}</select>
      </div>
      <div class="form-row" style="margin-bottom:10px;">
        <select id="d-subtype">${UI.subtypeOptions(r.module, r.subtype)}</select>
      </div>
      <div class="section-label">常见踩坑（勾选符合本题的）</div>
      <div id="d-pits"></div>

      <div class="section-label">答案与反思</div>
      <div class="grid grid-2" style="margin-bottom:10px;">
        <input id="d-my" type="text" placeholder="我的错误答案" value="${UI.escapeHtml(r.myAnswer || "")}" />
        <input id="d-ok" type="text" placeholder="正确答案" value="${UI.escapeHtml(r.correctAnswer || "")}" />
      </div>
      <textarea id="d-note" placeholder="反思 / 易错点">${UI.escapeHtml(r.note || "")}</textarea>`;
    const footerHTML = `
      <button class="btn btn-danger" data-act="del-detail">删除</button>
      <span style="flex:1"></span>
      <button class="btn" data-act="close">取消</button>
      <button class="btn btn-primary" data-act="save-detail">保存修改</button>`;

    let cur = { module: r.module, subtype: r.subtype, pits: [...(r.pits || [])] };
    const m = UI.modal({
      title: "错题详情 / 编辑",
      bodyHTML, footerHTML,
      onMount(root, close) {
        const pitsBox = $("#d-pits", root);
        const renderDpits = () => {
          const preset = Analyzer.getPreset(cur.module, cur.subtype);
          const all = cur.pits.length ? cur.pits : preset.pits; // 已有的优先展示，再补全
          const union = [...new Set([...all, ...preset.pits])];
          if (!union.length) {
            pitsBox.innerHTML = `<p class="muted" style="font-size:12px;">该模块/题型暂无预设踩坑。</p>`; return;
          }
          pitsBox.innerHTML = union.map(p => {
            const checked = cur.pits.includes(p) ? "checked" : "";
            return `<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:var(--bg-soft);border-radius:6px;margin-bottom:6px;cursor:pointer;font-size:13px;color:var(--text-dim);">
              <input type="checkbox" class="d-pit-cb" data-pit="${UI.escapeHtml(p)}" ${checked} style="margin-top:2px;width:auto;" />
              <span>${UI.escapeHtml(p)}</span></label>`;
          }).join("");
        };
        renderDpits();

        $("#d-module", root).addEventListener("change", e => {
          cur.module = e.target.value || null; cur.subtype = null;
          $("#d-subtype", root).innerHTML = UI.subtypeOptions(cur.module, null);
          // 切换题型时重置踩坑为该题型预设
          const preset = Analyzer.getPreset(cur.module, null);
          cur.pits = [];
          renderDpits();
        });
        $("#d-subtype", root).addEventListener("change", e => {
          cur.subtype = e.target.value || null; cur.pits = [];
          renderDpits();
        });

        root.addEventListener("click", e => {
          if (e.target.closest('[data-act="save-detail"]')) {
            cur.pits = $$(".d-pit-cb:checked", root).map(cb => cb.dataset.pit);
            Store.update(r.id, {
              module: cur.module, subtype: cur.subtype, pits: cur.pits,
              myAnswer: $("#d-my", root).value.trim(),
              correctAnswer: $("#d-ok", root).value.trim(),
              note: $("#d-note", root).value.trim(),
            });
            UI.toast("已保存修改", "success");
            close(); renderListBody();
          }
          if (e.target.closest('[data-act="del-detail"]')) {
            (async () => {
              const ok = await UI.confirmDialog("确定删除这道错题？", { okText: "删除", danger: true });
              if (ok) { Store.remove(r.id); UI.toast("已删除", "success"); close(); renderListBody(); updateTopbarCount(); }
            })();
          }
        });
      }
    });
  }

  function updateTopbarCount() {
    const el = $(".topbar .stat-mini");
    if (el) el.textContent = "已记录 " + Store.getAll().length + " 题";
  }

  /* ============================================================
   * 页面 3：分析报告
   * ============================================================ */
  function renderStats() {
    const page = $("#page");
    const s = Store.stats();

    page.innerHTML = `
      <div class="page-head">
        <h1>分析报告</h1>
        <p>基于你记录的 ${s.total} 道错题自动汇总，定位薄弱模块与高频踩坑。</p>
      </div>
      ${s.total === 0 ? `<div class="empty">
        <div class="em-icon">📊</div><h3>还没有数据</h3>
        <p>先录入几道错题，再来看分析报告 <a href="#/add">前往录入</a></p>
      </div>` : renderStatsBody(s)}
      <div class="card mt-12" style="margin-top:16px;">
        <div class="card-title"><span class="dot" style="background:var(--danger);"></span>数据管理</div>
        <div class="row-gap">
          <button class="btn btn-danger" data-act="clear-all">清空全部错题</button>
        </div>
        <div class="hint" style="margin-top:8px;">数据仅保存在本浏览器（localStorage），清除浏览器数据将丢失，请谨慎操作。</div>
      </div>`;

    page.addEventListener("click", async e => {
      if (e.target.closest('[data-act="clear-all"]')) {
        const ok = await UI.confirmDialog("确定清空全部错题记录？此操作不可撤销！", { okText: "全部清空", danger: true });
        if (ok) { Store.clearAll(); UI.toast("已清空", "success"); render(); }
      }
    });
  }

  function renderStatsBody(s) {
    const maxMod = Math.max(1, ...Object.values(s.moduleCounts));
    const topPit = s.pitRank[0];
    const trendMax = Math.max(1, ...s.trend.map(t => t.count));
    const totalAnswered = s.answeredWrong;

    // 模块错题排行 + 诊断建议
    const moduleBars = s.moduleRank.map(m => `
      <div class="bar-row">
        <div class="bl-name">${m.icon} ${m.short}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(m.count / maxMod * 100).toFixed(0)}%;background:${m.color};"></div></div>
        <div class="bl-val">${m.count} 题</div>
      </div>`).join("");

    // 题型分布
    const subRows = Object.entries(s.subtypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([t, c]) => {
        const st = SUBTYPE_MAP[t]; if (!st) return "";
        return `<div class="pit-rank-item">
          <div class="pit-rank-num">${c}</div>
          <div class="pit-rank-body">
            <div class="prb-head">${UI.moduleTag(st.module, false)} <span style="font-size:13px;">${UI.escapeHtml(st.name)}</span></div>
          </div>
        </div>`;
      }).join("");

    // 踩坑排行 Top 6
    const pitRank = s.pitRank.slice(0, 6).map((p, i) => `
      <div class="pit-rank-item ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}">
        <div class="pit-rank-num">${i + 1}</div>
        <div class="pit-rank-body">
          <div class="prb-head">${UI.moduleTag(p.module, false)} ${p.subtypeName ? `<span class="tag tag-muted">${UI.escapeHtml(p.subtypeName)}</span>` : ""} <span class="prb-count">×${p.count}</span></div>
          <div class="prb-pit">${UI.escapeHtml(p.pit)}</div>
        </div>
      </div>`).join("") || `<p class="muted" style="font-size:13px;">暂无踩坑数据（保存错题时勾选的踩坑会在此统计）。</p>`;

    // 趋势图
    const trendBars = s.trend.map(t => `
      <div class="trend-bar" style="height:${(t.count / trendMax * 100).toFixed(0)}%;">
        ${t.count ? `<div class="tb-tip">${t.count}</div>` : ""}
      </div>`).join("");
    const trendX = s.trend.map(t => `<span>${t.label}</span>`).join("");

    // 诊断建议
    const advice = buildAdvice(s);

    return `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="sc-label">错题总数</div>
          <div class="sc-value">${s.total}</div>
          <div class="sc-sub">${totalAnswered ? `已标注 ${totalAnswered} 题错误答案` : "建议补充答案便于复盘"}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">错最多模块</div>
          <div class="sc-value" style="color:${s.byModuleTop ? s.byModuleTop.color : "var(--text)"};">${s.byModuleTop ? s.byModuleTop.short : "—"}</div>
          <div class="sc-sub">${s.byModuleTop ? `${s.byModuleTop.count} 题 · 占 ${(s.byModuleTop.count / s.total * 100).toFixed(0)}%` : "暂无数据"}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">最高频踩坑</div>
          <div class="sc-value" style="font-size:18px;line-height:1.3;">${topPit ? UI.escapeHtml(truncate(topPit.pit, 14)) : "—"}</div>
          <div class="sc-sub">${topPit ? `×${topPit.count} 次 · ${topPit.subtypeName}` : "暂无"}</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">近14天记录</div>
          <div class="sc-value">${s.trend.reduce((a, b) => a + b.count, 0)}</div>
          <div class="sc-sub">${s.trend.filter(t => t.count).length} 天有记录</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span class="dot"></span>各模块错题分布</div>
          ${moduleBars || `<p class="muted">暂无数据</p>`}
        </div>
        <div class="card">
          <div class="card-title"><span class="dot"></span>近 14 天错题趋势</div>
          <div class="trend-chart">${trendBars}</div>
          <div class="trend-x">${trendX}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot" style="background:var(--accent);"></span>高频踩坑 Top 6</div>
        ${pitRank}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title"><span class="dot" style="background:var(--success);"></span>题型分布</div>
          ${subRows || `<p class="muted" style="font-size:13px;">暂无题型数据。</p>`}
        </div>
        <div class="card">
          <div class="card-title"><span class="dot" style="background:var(--primary);"></span>🎯 个性化诊断建议</div>
          ${advice}
        </div>
      </div>`;
  }

  function buildAdvice(s) {
    if (!s.total) return `<p class="muted">暂无数据。</p>`;
    const top = s.byModuleTop;
    if (!top) return `<p class="muted">暂无模块数据。</p>`;
    const list = SUBTYPES.filter(st => st.module === top.key);
    const pits = list.flatMap(st => st.pits);
    const topPits = (s.pitRank.filter(p => p.module === top.key).slice(0, 3));
    let html = `<div style="font-size:13px;line-height:1.8;color:var(--text-dim);">
      你在 <b style="color:${top.color};">${top.name}</b> 模块错题最多（${top.count} 题，占 ${(top.count / s.total * 100).toFixed(0)}%），建议优先突破。该模块含 ${list.length} 类题型，重点题型与常见坑如下：</div>
      <div class="mt-12">`;
    list.forEach(st => {
      const cnt = s.subtypeCounts[st.type] || 0;
      html += `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <b>${UI.escapeHtml(st.name)}</b><span class="muted">${cnt} 题</span>
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-dim);">
          ${st.pits.slice(0, 3).map(p => `<li>${UI.escapeHtml(p)}</li>`).join("")}
        </ul></div>`;
    });
    html += `</div>`;
    if (topPits.length) {
      html += `<div class="section-label" style="margin-top:8px;">你在该模块最常踩的坑</div><ul style="margin:0;padding-left:18px;font-size:12px;color:var(--accent);">`;
      topPits.forEach(p => html += `<li>×${p.count} · ${UI.escapeHtml(p.pit)}</li>`);
      html += `</ul>`;
    }
    return html;
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n) + "…" : s; }

  /* ============================================================
   * 启动
   * ============================================================ */
  function start() {
    window.addEventListener("hashchange", () => {
      render();
      window.scrollTo(0, 0);
    });
    render();
  }

  return { start };
})();

document.addEventListener("DOMContentLoaded", App.start);
