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
// [Static Checks] 仕様チェックルール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var INTERACTION_RULES = {
  modal:     { pattern: /\b(modal|dialog)\b/i,         designReqs: ["タイトルまたはラベル", "閉じるボタン"], hint: "ダイアログ" },
  tab:       { pattern: /\b(tab|tabs|tablist)\b/i,     designReqs: ["選択中タブの視覚的区別", "各タブと表示コンテンツの対応"], hint: "タブ" },
  alert:     { pattern: /\b(alert|toast|snackbar)\b/i, designReqs: ["自動で消えるか手動で閉じるかの定義", "表示時間の指定"], hint: "通知" },
  menu:      { pattern: /\b(menu|dropdown)\b/i,        designReqs: ["開閉状態の両方のデザイン", "選択肢ごとのアイコン/ラベル定義"], hint: "メニュー" },
  accordion: { pattern: /\b(accordion|expand)\b/i,     designReqs: ["開閉状態の両方のデザイン", "複数同時に開けるかどうかの定義"], hint: "アコーディオン" },
};

var STATE_RULES = {
  button:   { pattern: /\b(button|btn|cta)\b/i,         required: ["default","hover","pressed","disabled","focused"] },
  input:    { pattern: /\b(input|textfield|search)\b/i,  required: ["default","hover","focused","disabled","error","readonly","filled"] },
  checkbox: { pattern: /\b(checkbox|toggle|switch)\b/i,  required: ["checked","unchecked","indeterminate","disabled"] },
  select:   { pattern: /\b(select|picker)\b/i,           required: ["default","open","disabled","error"] },
};

var OVERLAY_PATTERNS = /\b(modal|dialog|drawer|popover|overlay|sheet|sidebar)\b/i;

// ── 静的チェック関数 ──
function checkInteractionSpecs(node, depth, findings) {
  if (depth > 4) return;
  var name = node.name || "";
  var keys = Object.keys(INTERACTION_RULES);
  for (var i = 0; i < keys.length; i++) {
    var rule = INTERACTION_RULES[keys[i]];
    if (rule.pattern.test(name)) {
      findings.push({
        category: "インタラクション定義",
        severity: "warning",
        message: "\"" + name + "\" は" + rule.hint + "として使われるコンポーネントです。エンジニアが迷わず実装するために、以下がデザイン上で定義されているか確認してください: " + rule.designReqs.join("、") + "。これらが未定義だとエンジニアが自己判断することになり、意図と異なる実装や手戻りの原因になります。",
        target: name,
        source: "static"
      });
    }
  }
  if ("children" in node) {
    var kids = node.children.slice(0, 25);
    for (var j = 0; j < kids.length; j++) {
      checkInteractionSpecs(kids[j], depth + 1, findings);
    }
  }
}

function checkStateCompleteness(csInfo, findings) {
  if (!csInfo || !csInfo.name) return;
  var keys = Object.keys(STATE_RULES);
  for (var i = 0; i < keys.length; i++) {
    var rule = STATE_RULES[keys[i]];
    if (!rule.pattern.test(csInfo.name)) continue;

    // axes から State 軸を探す（state, State, Status 等）
    var stateValues = [];
    var axisKeys = Object.keys(csInfo.axes);
    for (var a = 0; a < axisKeys.length; a++) {
      var ak = axisKeys[a].toLowerCase();
      if (ak === "state" || ak === "status" || ak === "condition") {
        stateValues = csInfo.axes[axisKeys[a]].map(function(v) { return v.toLowerCase(); });
        break;
      }
    }
    // State 軸が無い場合、全バリアント値から状態キーワードを検出
    if (!stateValues.length) {
      for (var b = 0; b < axisKeys.length; b++) {
        var vals = csInfo.axes[axisKeys[b]].map(function(v) { return v.toLowerCase(); });
        var stateKeywords = ["hover", "pressed", "disabled", "focused", "error", "checked", "unchecked", "readonly"];
        var hasStateKeyword = false;
        for (var sk = 0; sk < stateKeywords.length; sk++) {
          if (vals.indexOf(stateKeywords[sk]) !== -1) { hasStateKeyword = true; break; }
        }
        if (hasStateKeyword) { stateValues = vals; break; }
      }
    }

    if (!stateValues.length) continue;

    var missing = [];
    for (var r = 0; r < rule.required.length; r++) {
      if (stateValues.indexOf(rule.required[r].toLowerCase()) === -1) {
        missing.push(rule.required[r]);
      }
    }
    if (missing.length) {
      findings.push({
        category: "状態デザイン不足",
        severity: "warning",
        message: csInfo.name + " に " + missing.join(", ") + " 状態のデザインがありません。この状態が定義されていないと、エンジニアが見た目や振る舞いを自己判断して実装することになり、「思っていたのと違う」という手戻りが発生します。各状態の見た目をバリアントとして作成してください。",
        target: csInfo.name,
        source: "static"
      });
    }
  }
}

function checkOverlayBehavior(node, depth, findings) {
  if (depth > 4) return;
  var name = node.name || "";
  if (OVERLAY_PATTERNS.test(name)) {
    findings.push({
      category: "オーバーレイ振る舞い",
      severity: "warning",
      message: "\"" + name + "\" はオーバーレイ要素です。以下の振る舞いがデザイン上で定義されているか確認してください: (1) どこを押して開くか（トリガー要素）、(2) 閉じ方（閉じるボタン？ESCキー？背景クリック？）、(3) 背景の扱い（暗くする？操作不可にする？）。未定義のままだとエンジニアごとに実装が異なり、体験がバラつきます。",
      target: name,
      source: "static"
    });
  }
  if ("children" in node) {
    var kids = node.children.slice(0, 25);
    for (var j = 0; j < kids.length; j++) {
      checkOverlayBehavior(kids[j], depth + 1, findings);
    }
  }
}

function runStaticChecks(selection, csInfo) {
  var findings = [];
  var seen = {}; // 同じノード名の重複を防ぐ
  for (var i = 0; i < selection.length; i++) {
    checkInteractionSpecs(selection[i], 0, findings);
    checkOverlayBehavior(selection[i], 0, findings);
  }
  if (csInfo) {
    checkStateCompleteness(csInfo, findings);
  }
  // 重複除去（同じ target + category）
  var unique = [];
  for (var f = 0; f < findings.length; f++) {
    var key = findings[f].target + "|" + findings[f].category;
    if (!seen[key]) { seen[key] = true; unique.push(findings[f]); }
  }
  return unique;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Review] ノード抽出・選択監視
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractFill(node) {
  if (!node.fills || !node.fills.length) return null;
  var f = node.fills[0];
  if (f.type !== "SOLID" || ("visible" in f && !f.visible)) return null;
  var c = f.color;
  return "#" + Math.round(c.r*255).toString(16).padStart(2,"0") + Math.round(c.g*255).toString(16).padStart(2,"0") + Math.round(c.b*255).toString(16).padStart(2,"0");
}

function isConnectorLike(node) {
  // ステッパーの接続線: 細い LINE/VECTOR/RECTANGLE
  if (node.type === "LINE" || node.type === "VECTOR") return true;
  if (node.type === "RECTANGLE" && "width" in node && "height" in node) {
    var w = node.width, h = node.height;
    if ((w < 4 && h > 20) || (h < 4 && w > 20)) return true;
  }
  return false;
}

function extractNode(node, depth) {
  if (depth > 4) return null;
  var s = { id: node.id, name: node.name, type: node.type, width: 0, height: 0, children: [], texts: [] };
  if ("width" in node) { s.width = Math.round(node.width); s.height = Math.round(node.height); }
  if (node.type === "INSTANCE" && node.mainComponent) s.componentName = node.mainComponent.name;
  if (node.type === "TEXT" && node.characters) s.texts.push(node.characters.slice(0, 150));
  // レイアウト情報
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    s.layout = node.layoutMode;
    if (node.itemSpacing != null) s.gap = Math.round(node.itemSpacing);
  }
  // 可視性・opacity
  if ("visible" in node && !node.visible) s.hidden = true;
  if ("opacity" in node && node.opacity < 1) s.opacity = Math.round(node.opacity * 100) / 100;
  // 色（コンポーネント識別用: 子要素間の色差を検出するため）
  var fill = extractFill(node);
  if (fill) s.fill = fill;
  // インタラクション（reactions があれば clickable）
  if (node.reactions && node.reactions.length > 0) s.clickable = true;
  // コネクタ検出（ステッパーの線）
  if (isConnectorLike(node)) s.connector = true;
  if ("children" in node) {
    var kids = node.children.slice(0, 25);
    for (var i = 0; i < kids.length; i++) {
      var c = extractNode(kids[i], depth + 1);
      if (c) { s.texts = s.texts.concat(c.texts); s.children.push(c); }
    }
  }
  // パターンヒント付与
  s.hints = detectPatterns(node, s);
  return s;
}

function detectPatterns(node, extracted) {
  var hints = [];
  if (!("children" in node) || !node.children.length) return hints;
  var kids = node.children;
  var layout = node.layoutMode || "NONE";
  if (layout === "NONE") return hints;

  // ── 1. 構造の繰り返し検出 ──
  var childStructures = {};
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    var sig = k.type;
    if ("children" in k) {
      var grandTypes = [];
      for (var j = 0; j < k.children.length; j++) grandTypes.push(k.children[j].type);
      sig += "(" + grandTypes.sort().join("+") + ")";
    }
    if (!childStructures[sig]) childStructures[sig] = 0;
    childStructures[sig]++;
  }
  var sigKeys = Object.keys(childStructures);
  for (var s = 0; s < sigKeys.length; s++) {
    if (childStructures[sigKeys[s]] >= 3) {
      hints.push(layout + "方向に同じ構造の要素が" + childStructures[sigKeys[s]] + "個繰り返されている（構造: " + sigKeys[s] + "）");
    }
  }

  // ── 2. 接続要素（コネクタ線）の検出 → ステッパーの強いシグナル ──
  var connectorCount = 0;
  for (var ci = 0; ci < kids.length; ci++) {
    if (isConnectorLike(kids[ci])) connectorCount++;
  }
  if (connectorCount >= 1 && kids.length >= 4) {
    hints.push("子要素間に接続線（" + connectorCount + "本）あり → ステッパー/タイムラインの可能性");
  }

  // ── 3. 色・opacity の差分検出 → 状態の区別 ──
  var fills = [];
  var opacities = [];
  for (var fi = 0; fi < kids.length; fi++) {
    var kf = kids[fi];
    var kidFill = null;
    if (kf.fills && kf.fills.length && kf.fills[0].type === "SOLID" && (!("visible" in kf.fills[0]) || kf.fills[0].visible)) {
      var fc = kf.fills[0].color;
      kidFill = Math.round(fc.r*255) + "," + Math.round(fc.g*255) + "," + Math.round(fc.b*255);
    }
    fills.push(kidFill);
    opacities.push(("opacity" in kf) ? kf.opacity : 1);
  }
  var uniqueFills = {};
  for (var uf = 0; uf < fills.length; uf++) { if (fills[uf]) uniqueFills[fills[uf]] = true; }
  var uniqueFillCount = Object.keys(uniqueFills).length;
  if (uniqueFillCount >= 2 && kids.length >= 3) {
    hints.push("子要素間で色が異なる（" + uniqueFillCount + "色） → 状態の視覚的区別あり（current/completed/upcoming等）");
  }
  var hasOpacityDiff = false;
  for (var oi = 0; oi < opacities.length; oi++) {
    if (opacities[oi] < 0.9) { hasOpacityDiff = true; break; }
  }
  if (hasOpacityDiff && kids.length >= 3) {
    hints.push("一部の子要素が半透明 → 無効/完了状態の視覚的区別あり");
  }

  // ── 4. インタラクション検出 ──
  var clickableCount = 0;
  for (var ri = 0; ri < kids.length; ri++) {
    if (kids[ri].reactions && kids[ri].reactions.length > 0) clickableCount++;
  }
  if (clickableCount >= 2) {
    hints.push(clickableCount + "個の子要素にクリック/タップ操作が設定されている");
  }

  return hints;
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
// [Manage] コレクション管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function listCollections() {
  var collections = figma.variables.getLocalVariableCollections();
  var result = [];
  for (var i = 0; i < collections.length; i++) {
    var c = collections[i];
    result.push({ id: c.id, name: c.name, variableCount: c.variableIds.length, modes: c.modes.length });
  }
  return result;
}

function clearAllCollections(onlyPluginCreated) {
  var collections = figma.variables.getLocalVariableCollections();
  var count = 0;
  for (var i = 0; i < collections.length; i++) {
    if (onlyPluginCreated && pluginCreatedCollections.indexOf(collections[i].id) === -1) continue;
    var vars = collections[i].variableIds;
    for (var j = 0; j < vars.length; j++) {
      try { var v = figma.variables.getVariableById(vars[j]); if (v) v.remove(); count++; } catch(e){}
    }
    var cid = collections[i].id;
    try { collections[i].remove(); count++; } catch(e){}
    var idx = pluginCreatedCollections.indexOf(cid);
    if (idx !== -1) pluginCreatedCollections.splice(idx, 1);
  }
  savePluginCollections();
  return count;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージハンドラ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
figma.ui.onmessage = function(msg) {

  if (msg.type === "highlight-node") {
    var nodeName = msg.nodeName;
    if (!nodeName) return;

    // 複合target（"A / B / C"）→ 各パーツを候補にする（Objectで高速検索）
    var candidateSet = {};
    candidateSet[nodeName] = true;
    if (nodeName.indexOf(" / ") !== -1) {
      var parts = nodeName.split(" / ");
      for (var pi = 0; pi < parts.length; pi++) { candidateSet[parts[pi].trim()] = true; }
    }

    var target = null;
    var sel = figma.currentPage.selection;

    // 選択中ノード群の中だけを浅く検索（depth制限付き）
    function shallowFind(node, nameSet, depth) {
      if (depth > 5) return null;
      if (nameSet[node.name]) return node;
      if ("children" in node) {
        var kids = node.children;
        for (var i = 0; i < kids.length; i++) {
          var found = shallowFind(kids[i], nameSet, depth + 1);
          if (found) return found;
        }
      }
      return null;
    }

    // 1) 選択中ノード群とその子孫を浅く検索
    for (var si = 0; si < sel.length && !target; si++) {
      target = shallowFind(sel[si], candidateSet, 0);
    }
    // 2) 選択中ノードの親フレームを浅く検索
    if (!target && sel.length) {
      var root = sel[0];
      while (root.parent && root.parent.type !== "PAGE") root = root.parent;
      target = shallowFind(root, candidateSet, 0);
    }
    // ページ全体検索はしない（フリーズ防止）

    if (target) {
      figma.currentPage.selection = [target];
      figma.viewport.scrollAndZoomIntoView([target]);
      figma.notify(target.name + " (" + Math.round(target.width) + "x" + Math.round(target.height) + ")");
    } else {
      figma.notify(nodeName + " が見つかりません（選択範囲内に限定）");
    }
  }

  // ── Review: 履歴 CRUD ──
  if (msg.type === "save-review") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = existing || [];
      history.unshift(msg.entry);
      // ピン付きは最大50件、通常は最大20件
      var pinned = history.filter(function(e) { return e.pinned; });
      var unpinned = history.filter(function(e) { return !e.pinned; });
      if (pinned.length > 50) pinned = pinned.slice(0, 50);
      if (unpinned.length > 20) unpinned = unpinned.slice(0, 20);
      history = pinned.concat(unpinned);
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

  // ── ログ編集 ──
  var EDITABLE_FIELDS = ["asIs", "toBe", "memo", "pattern"];
  if (msg.type === "update-review") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = existing || [];
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === msg.id) {
          if (msg.field.indexOf("detail_") === 0) {
            var idx = parseInt(msg.field.split("_")[1]);
            if (history[i].details && history[i].details[idx]) {
              history[i].details[idx].message = msg.value;
            }
          } else if (EDITABLE_FIELDS.indexOf(msg.field) !== -1) {
            history[i][msg.field] = msg.value;
          }
          history[i].editedAt = Date.now();
          break;
        }
      }
      return figma.clientStorage.setAsync("review_history", history).then(function() {
        figma.ui.postMessage({ type: "review-history", history: history });
      });
    });
  }

  if (msg.type === "toggle-pin-review") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = existing || [];
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === msg.id) {
          history[i].pinned = !history[i].pinned;
          break;
        }
      }
      return figma.clientStorage.setAsync("review_history", history).then(function() {
        figma.ui.postMessage({ type: "review-history", history: history });
      });
    });
  }

  if (msg.type === "remove-review-detail") {
    figma.clientStorage.getAsync("review_history").then(function(existing) {
      var history = existing || [];
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === msg.id && history[i].details) {
          history[i].details.splice(msg.detailIndex, 1);
          history[i].editedAt = Date.now();
          break;
        }
      }
      return figma.clientStorage.setAsync("review_history", history).then(function() {
        figma.ui.postMessage({ type: "review-history", history: history });
      });
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
      var locale = "ja";
      try { if (figma.currentUser && figma.currentUser.locale) locale = figma.currentUser.locale; } catch(e) {}
      figma.ui.postMessage({ type: "settings-loaded", apiKey: r[0] || "", model: r[1] || "gemini-2.5-flash", locale: locale });
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

  // ── Static Checks ──
  if (msg.type === "run-static-checks") {
    var sel = figma.currentPage.selection;
    var csInfo = null;
    if (sel.length && sel[0].type === "COMPONENT_SET") {
      csInfo = extractComponentSetInfo(sel[0]);
    } else if (sel.length && sel[0].type === "COMPONENT" && sel[0].parent && sel[0].parent.type === "COMPONENT_SET") {
      csInfo = extractComponentSetInfo(sel[0].parent);
    }
    var findings = runStaticChecks(sel, csInfo);
    figma.ui.postMessage({ type: "static-check-results", findings: findings });
  }
};
