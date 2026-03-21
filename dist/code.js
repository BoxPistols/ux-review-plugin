"use strict";

figma.showUI(__html__, { width: 480, height: 680, title: "UX Review AI", themeColors: true });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共通ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var FONTS = [
  { family: "Inter", style: "Regular" },
  { family: "Inter", style: "Medium" },
  { family: "Inter", style: "Semi Bold" },
  { family: "Inter", style: "Bold" },
];
var fontsReady = false;
function ensureFonts() {
  if (fontsReady) return Promise.resolve();
  return Promise.all(FONTS.map(function(f) { return figma.loadFontAsync(f); })).then(function() { fontsReady = true; });
}

function hex2rgb(hex) {
  var h = (hex || "#888888").replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var r = parseInt(h.substring(0, 2), 16) / 255;
  var g = parseInt(h.substring(2, 4), 16) / 255;
  var b = parseInt(h.substring(4, 6), 16) / 255;
  // NaN フォールバック（不正な hex 値）
  if (isNaN(r)) r = 0.5; if (isNaN(g)) g = 0.5; if (isNaN(b)) b = 0.5;
  return { r: r, g: g, b: b };
}
function solid(hex) { return hex ? [{ type: "SOLID", color: hex2rgb(hex) }] : []; }
function d(val, def) { return (val != null) ? val : def; }
var WMAP = { Regular: "Regular", Medium: "Medium", SemiBold: "Semi Bold", Bold: "Bold" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undo スタック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var undoStack = [];
var pluginCreatedCollections = [];

// 起動時に永続化された pluginCreatedCollections を復元
figma.clientStorage.getAsync("plugin_collections").then(function(saved) {
  if (saved && Array.isArray(saved)) pluginCreatedCollections = saved;
});

function savePluginCollections() {
  figma.clientStorage.setAsync("plugin_collections", pluginCreatedCollections);
}

function undoEntry(entry) {
  var i;
  for (i = 0; i < entry.nodes.length; i++) { try { var n = figma.getNodeById(entry.nodes[i]); if (n) n.remove(); } catch(e){} }
  for (i = 0; i < entry.variables.length; i++) { try { var v = figma.variables.getVariableById(entry.variables[i]); if (v) v.remove(); } catch(e){} }
  for (i = 0; i < entry.collections.length; i++) {
    try { var c = figma.variables.getVariableCollectionById(entry.collections[i]); if (c) c.remove(); } catch(e){}
    // 追跡リストからも除去
    var idx = pluginCreatedCollections.indexOf(entry.collections[i]);
    if (idx !== -1) pluginCreatedCollections.splice(idx, 1);
  }
  if (entry.collections.length) savePluginCollections();
  // リネームの復元
  if (entry.renames) {
    for (i = 0; i < entry.renames.length; i++) {
      try { var rn = figma.getNodeById(entry.renames[i].id); if (rn) rn.name = entry.renames[i].oldName; } catch(e){}
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Review] ノード抽出・選択監視
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractNode(node, depth) {
  if (depth > 4) return null;
  var s = { id: node.id, name: node.name, type: node.type, width: 0, height: 0, children: [], texts: [] };
  if ("width" in node) { s.width = Math.round(node.width); s.height = Math.round(node.height); }
  if (node.type === "INSTANCE" && node.mainComponent) s.componentName = node.mainComponent.name;
  if (node.type === "TEXT" && node.characters) s.texts.push(node.characters.slice(0, 150));
  if ("children" in node) {
    var kids = node.children.slice(0, 25);
    for (var i = 0; i < kids.length; i++) {
      var c = extractNode(kids[i], depth + 1);
      if (c) { s.texts = s.texts.concat(c.texts); s.children.push(c); }
    }
  }
  return s;
}

function buildFileContext() {
  var fileName = figma.root.name;
  var pages = figma.root.children.map(function(p) { return p.name; });
  return { fileName: fileName, pages: pages, totalPages: pages.length };
}

function notifySelection() {
  var sel = figma.currentPage.selection;
  var fc = buildFileContext();
  if (sel.length === 0) {
    figma.ui.postMessage({ type: "selection-cleared", fileContext: fc });
    return;
  }
  var nodes = [];
  for (var i = 0; i < sel.length; i++) { var n = extractNode(sel[i], 0); if (n) nodes.push(n); }

  // ComponentSet が選択されている場合、バリアント情報も送信
  var componentSetInfo = null;
  var s = sel[0];
  if (s.type === "COMPONENT_SET") {
    componentSetInfo = extractComponentSetInfo(s);
  } else if (s.type === "COMPONENT" && s.parent && s.parent.type === "COMPONENT_SET") {
    componentSetInfo = extractComponentSetInfo(s.parent);
  }

  figma.ui.postMessage({ type: "selection-changed", nodes: nodes, isMulti: nodes.length > 1, currentPage: figma.currentPage.name, fileContext: fc, componentSetInfo: componentSetInfo });
}

function extractComponentSetInfo(cs) {
  var variants = [];
  for (var i = 0; i < cs.children.length; i++) {
    var child = cs.children[i];
    if (child.type === "COMPONENT") {
      var props = {};
      var parts = child.name.split(", ");
      for (var j = 0; j < parts.length; j++) {
        var kv = parts[j].split("=");
        if (kv.length === 2) props[kv[0].trim()] = kv[1].trim();
      }
      // スタイル情報も抽出
      var fill = null;
      if (child.fills && child.fills.length && child.fills[0].type === "SOLID") {
        var c = child.fills[0].color;
        fill = "#" + Math.round(c.r*255).toString(16).padStart(2,"0") + Math.round(c.g*255).toString(16).padStart(2,"0") + Math.round(c.b*255).toString(16).padStart(2,"0");
      }
      // stroke情報
      var stroke = null;
      if (child.strokes && child.strokes.length && child.strokes[0].type === "SOLID") {
        var sc = child.strokes[0].color;
        stroke = "#" + Math.round(sc.r*255).toString(16).padStart(2,"0") + Math.round(sc.g*255).toString(16).padStart(2,"0") + Math.round(sc.b*255).toString(16).padStart(2,"0");
      }
      // 子要素の数とタイプ
      var childTypes = [];
      if ("children" in child) {
        for (var k = 0; k < child.children.length; k++) childTypes.push(child.children[k].type);
      }
      variants.push({ name: child.name, props: props, fill: fill, stroke: stroke, width: Math.round(child.width), height: Math.round(child.height), childTypes: childTypes });
    }
  }

  // プロパティ軸を抽出（例: ["Style", "Size"]）
  var axes = {};
  for (var vi = 0; vi < variants.length; vi++) {
    var pkeys = Object.keys(variants[vi].props);
    for (var pi = 0; pi < pkeys.length; pi++) {
      if (!axes[pkeys[pi]]) axes[pkeys[pi]] = [];
      var val = variants[vi].props[pkeys[pi]];
      if (axes[pkeys[pi]].indexOf(val) === -1) axes[pkeys[pi]].push(val);
    }
  }

  return { id: cs.id, name: cs.name, variantCount: variants.length, variants: variants, axes: axes, componentType: variants[0] ? variants[0].childTypes.join("+") : "unknown" };
}

figma.on("selectionchange", notifySelection);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージハンドラ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
figma.ui.onmessage = function(msg) {

  if (msg.type === "highlight-node") {
    var nodeName = msg.nodeName;
    if (!nodeName) return;

    var target = null;
    var sel = figma.currentPage.selection;

    // 1) 選択中ノード自身が対象か
    if (sel.length && sel[0].name === nodeName) { target = sel[0]; }
    // 2) 選択中ノードの子孫を検索
    if (!target && sel.length) {
      var root = sel[0];
      // 親フレームまで遡る（子ノードが選択中の場合）
      while (root.parent && root.parent.type !== "PAGE") root = root.parent;
      if (typeof root.findOne === "function") {
        target = root.findOne(function(n) { return n.name === nodeName; });
      }
    }
    // 3) ページ全体から検索
    if (!target) {
      target = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
    }

    if (target) {
      figma.currentPage.selection = [target];
      figma.viewport.scrollAndZoomIntoView([target]);
      figma.notify(target.name + " (" + Math.round(target.width) + "x" + Math.round(target.height) + ")");
    } else {
      figma.notify(nodeName + " が見つかりません");
    }
  }

  // ── Review: 履歴 CRUD ──
  if (msg.type === "save-review") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = existing || [];
      // 同じフレームの古い履歴を保持しつつ新規追加（最大20件）
      history.unshift(msg.entry);
      if (history.length > 20) history = history.slice(0, 20);
      return figma.clientStorage.setAsync("review_history", history).then(function() {
        figma.ui.postMessage({ type: "review-history", history: history });
      });
    });
  }

  if (msg.type === "load-review-history") {
    figma.clientStorage.getAsync("review_history").then(function(history) {
      figma.ui.postMessage({ type: "review-history", history: history || [] });
    });
  }

  if (msg.type === "delete-review") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = (existing || []).filter(function(e) { return e.id !== msg.id; });
      return figma.clientStorage.setAsync("review_history", history).then(function() {
        figma.ui.postMessage({ type: "review-history", history: history });
      });
    });
  }

  if (msg.type === "clear-review-history") {
    figma.clientStorage.setAsync("review_history", []).then(function() {
      figma.ui.postMessage({ type: "review-history", history: [] });
    });
  }

  if (msg.type === "list-collections") {
    figma.ui.postMessage({ type: "collections-list", collections: listCollections() });
  }

  // ── Manage: 全コレクション削除 ──
  if (msg.type === "clear-all-collections") {
    var count = clearAllCollections(msg.onlyPlugin);
    figma.ui.postMessage({ type: "clear-done", count: count });
    figma.notify("\u2713 " + count + " \u4EF6\u524A\u9664");
  }

  // ── Undo ──
  if (msg.type === "undo") {
    if (!undoStack.length) { figma.ui.postMessage({ type: "undo-done", undoCount: 0 }); return; }
    undoEntry(undoStack.pop());
    figma.ui.postMessage({ type: "undo-done", undoCount: undoStack.length });
    figma.notify("\u2713 \u5143\u306B\u623B\u3057\u307E\u3057\u305F");
  }

  if (msg.type === "undo-all") {
    while (undoStack.length) undoEntry(undoStack.pop());
    figma.ui.postMessage({ type: "undo-done", undoCount: 0 });
    figma.notify("\u2713 \u5168\u524A\u9664\u5B8C\u4E86");
  }

  // ── 設定 ──
  if (msg.type === "load-settings") {
    Promise.all([
      figma.clientStorage.getAsync("api_key"),
      figma.clientStorage.getAsync("model"),
    ]).then(function(r) {
      figma.ui.postMessage({ type: "settings-loaded", apiKey: r[0] || "", model: r[1] || "gemini-2.5-flash" });
    });
    // 初回選択通知
    notifySelection();
  }

  if (msg.type === "resize") {
    figma.ui.resize(
      Math.min(Math.max(msg.width, 380), 1600),
      Math.min(Math.max(msg.height, 400), 1200)
    );
  }

  if (msg.type === "save-settings") {
    Promise.all([
      figma.clientStorage.setAsync("api_key", msg.apiKey || ""),
      figma.clientStorage.setAsync("model", msg.model || "gemini-2.5-flash"),
    ]);
  }
};
