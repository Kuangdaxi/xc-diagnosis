/* ============================================================
 * ui.js — 通用 UI 工具：toast / modal / 标签 / 选择器
 * ============================================================ */

const UI = (() => {
  const { MODULES, SUBTYPES } = window.XC;

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(msg, type = "info", ms = 2200) {
    const box = document.getElementById("toast-container");
    const t = el(`<div class="toast ${type}">${escapeHtml(msg)}</div>`);
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .25s";
      setTimeout(() => t.remove(), 250);
    }, ms);
  }

  /** 通用模态框：返回控制器 { close, root } */
  function modal({ title = "", bodyHTML = "", footerHTML = "", onMount } = {}) {
    const root = el(`
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${escapeHtml(title)}</h3>
            <button class="btn btn-ghost btn-sm" data-act="close">✕</button>
          </div>
          <div class="modal-body">${bodyHTML}</div>
          ${footerHTML ? `<div class="modal-foot">${footerHTML}</div>` : ""}
        </div>
      </div>`);
    document.getElementById("modal-root").appendChild(root);
    const close = () => { root.remove(); };
    root.addEventListener("click", e => {
      if (e.target === root || e.target.closest('[data-act="close"]')) close();
    });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
    if (onMount) onMount(root, close);
    return { close, root };
  }

  /** 确认对话框 Promise */
  function confirmDialog(msg, { okText = "确定", cancelText = "取消", danger = false } = {}) {
    return new Promise(resolve => {
      const m = modal({
        title: "请确认",
        bodyHTML: `<p style="font-size:14px;line-height:1.7;">${escapeHtml(msg)}</p>`,
        footerHTML: `
          <button class="btn" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${escapeHtml(okText)}</button>`,
        onMount(root, close) {
          root.addEventListener("click", e => {
            if (e.target.closest('[data-act="ok"]')) { close(); resolve(true); }
            else if (e.target.closest('[data-act="cancel"]')) { close(); resolve(false); }
          });
        }
      });
    });
  }

  function moduleTag(key, withName = true) {
    if (!key || !MODULES[key]) return `<span class="tag tag-muted">未分类</span>`;
    const m = MODULES[key];
    return `<span class="tag tag-${m.key}">${m.icon} ${withName ? m.name : m.short}</span>`;
  }
  function subtypeTag(subtypeKey) {
    if (!subtypeKey) return "";
    const st = window.XC.SUBTYPE_MAP[subtypeKey];
    if (!st) return "";
    return `<span class="tag tag-muted">${escapeHtml(st.name)}</span>`;
  }

  function moduleOptions(selected) {
    return `<option value="">— 选择模块 —</option>` +
      Object.values(MODULES).map(m =>
        `<option value="${m.key}" ${selected === m.key ? "selected" : ""}>${m.icon} ${m.name}</option>`).join("");
  }
  function subtypeOptions(moduleKey, selected) {
    if (!moduleKey) return `<option value="">— 先选模块 —</option>`;
    const list = SUBTYPES.filter(s => s.module === moduleKey);
    if (!list.length) return `<option value="">该模块无预设题型</option>`;
    return `<option value="">— 选择题型（可选）—</option>` +
      list.map(s => `<option value="${s.type}" ${selected === s.type ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
  }

  /** 把 File 转 base64 dataURL，并按最大边压缩 */
  function fileToDataURL(file, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.onload = () => {
        const dataURL = reader.result;
        // 用 canvas 压缩
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale); h = Math.round(h * scale);
          }
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          const ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataURL); // 非图片直接存
        img.src = dataURL;
      };
      reader.readAsDataURL(file);
    });
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    const d = Math.floor(h / 24);
    if (d < 30) return d + " 天前";
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  return { el, escapeHtml, toast, modal, confirmDialog,
    moduleTag, subtypeTag, moduleOptions, subtypeOptions,
    fileToDataURL, timeAgo };
})();

window.XC.UI = UI;
