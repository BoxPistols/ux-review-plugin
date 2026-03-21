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
  return { r: parseInt(h.substring(0, 2), 16) / 255, g: parseInt(h.substring(2, 4), 16) / 255, b: parseInt(h.substring(4, 6), 16) / 255 };
}
function solid(hex) { return hex ? [{ type: "SOLID", color: hex2rgb(hex) }] : []; }
function d(val, def) { return (val != null) ? val : def; }
var WMAP = { Regular: "Regular", Medium: "Medium", SemiBold: "Semi Bold", Bold: "Bold" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undo スタック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var undoStack = [];
// プラグインが作成したCollectionのIDを追跡
var pluginCreatedCollections = [];

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
  figma.ui.postMessage({ type: "selection-changed", nodes: nodes, isMulti: nodes.length > 1, currentPage: figma.currentPage.name, fileContext: fc });
}

figma.on("selectionchange", notifySelection);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Generate] Variables 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createVars(collections) {
  var ids = { collections: [], variables: [] };
  for (var i = 0; i < collections.length; i++) {
    var col = collections[i];
    var c = figma.variables.createVariableCollection(col.collection);
    ids.collections.push(c.id);
    pluginCreatedCollections.push(c.id);
    var mode = c.modes[0].modeId || c.modes[0].id;
    for (var j = 0; j < col.variables.length; j++) {
      var vd = col.variables[j];
      var typ = vd.type === "COLOR" ? "COLOR" : "FLOAT";
      var fv = figma.variables.createVariable(vd.name, c.id, typ);
      ids.variables.push(fv.id);
      fv.setValueForMode(mode, typ === "COLOR" ? hex2rgb(vd.value) : (Number(vd.value) || 0));
    }
  }
  return ids;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Generate] Component Variants 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createComps(components) {
  return ensureFonts().then(function() {
    var ids = { nodes: [] };
    var center = figma.viewport.center;
    var ox = 0; var allSets = [];
    for (var i = 0; i < components.length; i++) {
      var comp = components[i]; var nodes = [];
      for (var j = 0; j < comp.variants.length; j++) {
        var vr = comp.variants[j];
        var c = figma.createComponent();
        c.layoutMode = "HORIZONTAL"; c.primaryAxisAlignItems = "CENTER"; c.counterAxisAlignItems = "CENTER";
        c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "AUTO";
        c.paddingLeft = c.paddingRight = d(vr.paddingX, 16);
        c.paddingTop = c.paddingBottom = d(vr.paddingY, 10);
        c.cornerRadius = d(vr.cornerRadius, 8); c.itemSpacing = d(vr.gap, 8);
        var fill = vr.fill;
        c.fills = (fill && fill !== "none" && fill !== "transparent") ? solid(fill) : [];
        if (vr.stroke) { c.strokes = solid(vr.stroke); c.strokeWeight = d(vr.strokeWidth, 1); }
        if (vr.opacity != null) c.opacity = vr.opacity;
        var t = figma.createText();
        t.fontName = { family: "Inter", style: WMAP[vr.fontWeight] || "Medium" };
        t.characters = vr.label || "\u30DC\u30BF\u30F3";
        t.fontSize = d(vr.fontSize, 14);
        if (vr.textColor) t.fills = solid(vr.textColor);
        c.appendChild(t);
        c.name = Object.keys(vr.props).map(function(k) { return k + "=" + vr.props[k]; }).join(", ");
        nodes.push(c);
      }
      if (nodes.length) {
        var cs = figma.combineAsVariants(nodes, figma.currentPage);
        cs.name = comp.name;
        cs.layoutMode = "VERTICAL"; cs.counterAxisSizingMode = "AUTO"; cs.primaryAxisSizingMode = "AUTO";
        cs.itemSpacing = 16; cs.paddingTop = cs.paddingBottom = 24; cs.paddingLeft = cs.paddingRight = 24;
        cs.x = Math.round(center.x + ox); cs.y = Math.round(center.y);
        ox += cs.width + 80; allSets.push(cs); ids.nodes.push(cs.id);
      }
    }
    if (allSets.length) { figma.currentPage.selection = allSets; figma.viewport.scrollAndZoomIntoView(allSets); }
    return ids;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Generate] Auto Layout フレーム生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildAutoNode(spec, parent) {
  return ensureFonts().then(function() {
    var node; var type = spec.type || "FRAME";
    if (type === "TEXT") {
      node = figma.createText();
      node.fontName = { family: "Inter", style: WMAP[spec.fontWeight] || "Regular" };
      node.characters = spec.text || ""; node.fontSize = d(spec.fontSize, 14);
      if (spec.color) node.fills = solid(spec.color);
    } else if (type === "RECT") {
      node = figma.createRectangle();
      node.resize(Math.max(d(spec.width, 100), 1), Math.max(d(spec.height, 1), 1));
      node.fills = spec.fill ? solid(spec.fill) : [];
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.stroke) { node.strokes = solid(spec.stroke); node.strokeWeight = d(spec.strokeWidth, 1); }
    } else if (type === "ELLIPSE") {
      node = figma.createEllipse();
      node.resize(Math.max(d(spec.width, 40), 1), Math.max(d(spec.height, 40), 1));
      node.fills = spec.fill ? solid(spec.fill) : [];
    } else {
      node = figma.createFrame();
      node.resize(Math.max(d(spec.width, 100), 1), Math.max(d(spec.height, 100), 1));
      var bg = spec.fill || spec.background;
      node.fills = (bg && bg !== "transparent" && bg !== "none") ? solid(bg) : [];
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.stroke) { node.strokes = solid(spec.stroke); node.strokeWeight = d(spec.strokeWidth, 1); }
      if (spec.layoutMode) {
        node.layoutMode = spec.layoutMode;
        node.itemSpacing = d(spec.itemSpacing, d(spec.gap, 0));
        var p = spec.padding;
        if (typeof p === "number") { node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = p; }
        if (spec.paddingX != null) { node.paddingLeft = node.paddingRight = spec.paddingX; }
        if (spec.paddingY != null) { node.paddingTop = node.paddingBottom = spec.paddingY; }
        node.primaryAxisSizingMode = spec.primaryAxisSizingMode || "AUTO";
        node.counterAxisSizingMode = spec.counterAxisSizingMode || "FIXED";
        if (spec.primaryAxisAlignItems) node.primaryAxisAlignItems = spec.primaryAxisAlignItems;
        if (spec.counterAxisAlignItems) node.counterAxisAlignItems = spec.counterAxisAlignItems;
      }
      if (spec.children && spec.children.length) {
        var chain = Promise.resolve();
        for (var ci = 0; ci < spec.children.length; ci++) {
          (function(child) { chain = chain.then(function() { return buildAutoNode(child, node); }); })(spec.children[ci]);
        }
        return chain.then(function() { finishNode(node, spec, parent); return node; });
      }
    }
    finishNode(node, spec, parent);
    return node;
  });
}

function finishNode(node, spec, parent) {
  node.name = spec.name || node.name;
  if (spec.opacity != null) node.opacity = spec.opacity;
  if (parent) {
    parent.appendChild(node);
    if (parent.layoutMode && parent.layoutMode !== "NONE") {
      try { if (spec.fillWidth) node.layoutSizingHorizontal = "FILL"; if (spec.fillHeight) node.layoutSizingVertical = "FILL"; } catch(e){}
    }
  }
}

function createFrames(frames) {
  var ids = { nodes: [] }; var center = figma.viewport.center; var allNodes = []; var ox = 0;
  var chain = Promise.resolve();
  for (var i = 0; i < frames.length; i++) {
    (function(spec) {
      chain = chain.then(function() {
        return buildAutoNode(spec, null).then(function(node) {
          node.x = Math.round(center.x + ox); node.y = Math.round(center.y);
          figma.currentPage.appendChild(node); ox += node.width + 60;
          allNodes.push(node); ids.nodes.push(node.id);
        });
      });
    })(frames[i]);
  }
  return chain.then(function() {
    if (allNodes.length) { figma.currentPage.selection = allNodes; figma.viewport.scrollAndZoomIntoView(allNodes); }
    return ids;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Tokens] デザイントークン Import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function flattenTokens(obj, prefix) {
  var result = [];
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = obj[key];
    var path = prefix ? prefix + "/" + key : key;
    if (val && typeof val === "object" && val.$value !== undefined) {
      result.push({ name: path, type: val.$type || "string", value: val.$value, description: val.$description || "" });
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      result = result.concat(flattenTokens(val, path));
    }
  }
  return result;
}

function importTokens(jsonStr) {
  var parsed;
  try { parsed = JSON.parse(jsonStr); } catch(e) { throw new Error("JSONパースエラー: " + e.message); }

  var tokens = flattenTokens(parsed, "");
  if (!tokens.length) throw new Error("トークンが見つかりませんでした");
  if (tokens.length > 500) throw new Error("トークン数が上限(500)を超えています: " + tokens.length + "件");

  // コレクション名ごとにグループ化（最上位キーで分類）
  var groups = {};
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    var parts = t.name.split("/");
    var group = parts[0];
    if (!groups[group]) groups[group] = [];
    groups[group].push(t);
  }

  var ids = { collections: [], variables: [] };
  var groupNames = Object.keys(groups);

  for (var g = 0; g < groupNames.length; g++) {
    var gname = groupNames[g];
    var items = groups[gname];
    var coll = figma.variables.createVariableCollection(gname);
    ids.collections.push(coll.id);
    pluginCreatedCollections.push(coll.id);
    var modeId = coll.modes[0].modeId || coll.modes[0].id;

    for (var j = 0; j < items.length; j++) {
      var tk = items[j];
      var resolvedType;
      var resolvedValue;

      if (tk.type === "color") {
        resolvedType = "COLOR";
        resolvedValue = hex2rgb(String(tk.value));
      } else if (tk.type === "number" || tk.type === "dimension" || tk.type === "fontWeight") {
        resolvedType = "FLOAT";
        resolvedValue = parseFloat(String(tk.value).replace("px", "").replace("rem", "")) || 0;
      } else if (tk.type === "boolean") {
        resolvedType = "BOOLEAN";
        resolvedValue = !!tk.value;
      } else {
        resolvedType = "STRING";
        resolvedValue = String(tk.value);
      }

      try {
        var fv = figma.variables.createVariable(tk.name, coll.id, resolvedType);
        ids.variables.push(fv.id);
        fv.setValueForMode(modeId, resolvedValue);
        if (tk.description) fv.description = tk.description;
      } catch(e) {
        // 重複や不正な名前はスキップ
      }
    }
  }

  return ids;
}

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
    // onlyPluginCreated=true の場合、プラグインが作ったもののみ削除
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
  return count;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Variables のみの場合にキャンバス上にスウォッチを自動生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createVariableSwatch(spec) {
  return ensureFonts().then(function() {
    var SWATCH = 48;
    var GAP = 8;
    var PAD = 24;
    var center = figma.viewport.center;

    // 全コレクションのカラー変数を収集
    var colorVars = [];
    var floatVars = [];
    for (var i = 0; i < spec.variables.length; i++) {
      var col = spec.variables[i];
      for (var j = 0; j < col.variables.length; j++) {
        var v = col.variables[j];
        if (v.type === "COLOR") colorVars.push({ name: v.name, value: v.value, collection: col.collection });
        else floatVars.push({ name: v.name, value: v.value, collection: col.collection });
      }
    }

    if (!colorVars.length && !floatVars.length) return null;

    var cols = Math.min(Math.max(colorVars.length, 1), 8);
    var rows = Math.ceil(colorVars.length / cols);
    var frameW = PAD * 2 + cols * SWATCH + (cols - 1) * GAP;
    var frameH = PAD + 40; // title area

    // Color section height
    if (colorVars.length) frameH += rows * SWATCH + (rows - 1) * GAP + 24 + 16; // swatches + labels space
    // Float section height
    if (floatVars.length) frameH += floatVars.length * 24 + 24;
    frameH += PAD;

    var root = figma.createFrame();
    root.name = spec.name || "Variable Swatch";
    root.resize(Math.max(frameW, 280), Math.max(frameH, 120));
    root.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    root.layoutMode = "VERTICAL";
    root.paddingTop = root.paddingBottom = PAD;
    root.paddingLeft = root.paddingRight = PAD;
    root.itemSpacing = 16;
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "AUTO";

    // Title
    var title = figma.createText();
    title.fontName = { family: "Inter", style: "Semi Bold" };
    title.characters = spec.name || "Variables";
    title.fontSize = 16;
    title.fills = solid("#0F172A");
    root.appendChild(title);

    if (spec.description) {
      var desc = figma.createText();
      desc.fontName = { family: "Inter", style: "Regular" };
      desc.characters = spec.description;
      desc.fontSize = 13;
      desc.fills = solid("#64748B");
      root.appendChild(desc);
    }

    // Color swatches
    if (colorVars.length) {
      var colorSection = figma.createFrame();
      colorSection.name = "Colors";
      colorSection.layoutMode = "VERTICAL";
      colorSection.itemSpacing = 8;
      colorSection.fills = [];
      colorSection.primaryAxisSizingMode = "AUTO";
      colorSection.counterAxisSizingMode = "AUTO";

      var colorRow = null;
      for (var ci = 0; ci < colorVars.length; ci++) {
        if (ci % cols === 0) {
          colorRow = figma.createFrame();
          colorRow.name = "Row";
          colorRow.layoutMode = "HORIZONTAL";
          colorRow.itemSpacing = GAP;
          colorRow.fills = [];
          colorRow.primaryAxisSizingMode = "AUTO";
          colorRow.counterAxisSizingMode = "AUTO";
          colorSection.appendChild(colorRow);
        }

        var swatchGroup = figma.createFrame();
        swatchGroup.name = colorVars[ci].name;
        swatchGroup.layoutMode = "VERTICAL";
        swatchGroup.itemSpacing = 4;
        swatchGroup.fills = [];
        swatchGroup.primaryAxisSizingMode = "AUTO";
        swatchGroup.counterAxisSizingMode = "AUTO";

        var swatch = figma.createRectangle();
        swatch.name = "Color";
        swatch.resize(SWATCH, SWATCH);
        swatch.cornerRadius = 8;
        swatch.fills = solid(colorVars[ci].value);
        swatchGroup.appendChild(swatch);

        var label = figma.createText();
        label.fontName = { family: "Inter", style: "Regular" };
        var shortName = colorVars[ci].name.split("/").pop();
        label.characters = shortName;
        label.fontSize = 12;
        label.fills = solid("#64748B");
        swatchGroup.appendChild(label);

        colorRow.appendChild(swatchGroup);
      }
      root.appendChild(colorSection);
    }

    // Float values
    if (floatVars.length) {
      var floatSection = figma.createFrame();
      floatSection.name = "Values";
      floatSection.layoutMode = "VERTICAL";
      floatSection.itemSpacing = 4;
      floatSection.fills = [];
      floatSection.primaryAxisSizingMode = "AUTO";
      floatSection.counterAxisSizingMode = "AUTO";

      for (var fi = 0; fi < floatVars.length; fi++) {
        var row = figma.createFrame();
        row.name = floatVars[fi].name;
        row.layoutMode = "HORIZONTAL";
        row.itemSpacing = 8;
        row.fills = [];
        row.primaryAxisSizingMode = "AUTO";
        row.counterAxisSizingMode = "AUTO";

        var nameText = figma.createText();
        nameText.fontName = { family: "Inter", style: "Medium" };
        nameText.characters = floatVars[fi].name.split("/").pop();
        nameText.fontSize = 13;
        nameText.fills = solid("#0F172A");
        row.appendChild(nameText);

        var valText = figma.createText();
        valText.fontName = { family: "Inter", style: "Regular" };
        valText.characters = String(floatVars[fi].value);
        valText.fontSize = 13;
        valText.fills = solid("#64748B");
        row.appendChild(valText);

        floatSection.appendChild(row);
      }
      root.appendChild(floatSection);
    }

    root.x = Math.round(center.x - root.width / 2);
    root.y = Math.round(center.y - root.height / 2);
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    return root.id;
  });
}

// ── パス指定ノード検索（"Parent/Child" 形式もサポート）──
function findByPath(root, path) {
  if (!path || !root) return null;
  if (typeof root.findOne !== "function") return null;
  var parts = path.split("/");
  if (parts.length > 1) {
    var node = root;
    for (var p = 0; p < parts.length; p++) {
      if (!node || typeof node.findOne !== "function") return null;
      var seg = parts[p];
      node = node.findOne(function(n) { return n.name === seg; });
      if (!node) return null;
    }
    return node;
  }
  return root.findOne(function(n) { return n.name === path; });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Review] As-Is → To-Be クローン + 修正適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function applyReview(modifications) {
  var sel = figma.currentPage.selection;
  if (!sel.length) return Promise.reject(new Error("フレームが選択されていません"));

  var original = sel[0];
  var originalOldName = original.name;
  var clone = original.clone();
  var renames = [];

  // To-Be としてラベル付け・配置
  clone.name = originalOldName + " \u2014 To-Be";
  clone.x = original.x + original.width + 60;
  clone.y = original.y;

  // As-Is ラベルも追記（Undo時に元名に戻す）
  if (originalOldName.indexOf("As-Is") === -1 && originalOldName.indexOf("To-Be") === -1) {
    original.name = originalOldName + " \u2014 As-Is";
    renames.push({ id: original.id, oldName: originalOldName });
  }

  // テキスト変更に必要なフォントを事前ロード
  var textActions = ["set_text", "set_font_size", "set_font_weight"];
  var fontPromises = [ensureFonts()];

  for (var i = 0; i < modifications.length; i++) {
    var mod = modifications[i];
    if (textActions.indexOf(mod.action) !== -1) {
      var target = findByPath(clone, mod.target);
      if (target && target.type === "TEXT") {
        var fn = target.fontName;
        if (fn && fn !== figma.mixed) {
          fontPromises.push(figma.loadFontAsync(fn));
        }
        if (mod.action === "set_font_weight") {
          fontPromises.push(figma.loadFontAsync({ family: "Inter", style: WMAP[mod.value] || "Regular" }));
        }
      }
    }
  }

  return Promise.all(fontPromises).then(function() {
    var applied = 0;
    for (var i = 0; i < modifications.length; i++) {
      var mod = modifications[i];
      var target = findByPath(clone, mod.target);
      if (!target) continue;

      try {
        switch (mod.action) {
          case "set_fill":
            target.fills = solid(mod.value);
            applied++; break;
          case "set_text":
            if (target.type === "TEXT") { target.characters = String(mod.value); applied++; }
            break;
          case "set_font_size":
            if (target.type === "TEXT") { target.fontSize = Number(mod.value); applied++; }
            break;
          case "set_font_weight":
            if (target.type === "TEXT") { target.fontName = { family: "Inter", style: WMAP[mod.value] || "Regular" }; applied++; }
            break;
          case "set_corner_radius":
            if ("cornerRadius" in target) { target.cornerRadius = Number(mod.value); applied++; }
            break;
          case "set_padding":
            var pv = Number(mod.value);
            target.paddingTop = target.paddingBottom = target.paddingLeft = target.paddingRight = pv;
            applied++; break;
          case "set_item_spacing":
            if ("itemSpacing" in target) { target.itemSpacing = Number(mod.value); applied++; }
            break;
          case "set_opacity":
            target.opacity = Number(mod.value);
            applied++; break;
          case "set_stroke":
            target.strokes = solid(mod.value); target.strokeWeight = d(target.strokeWeight, 1);
            applied++; break;
          case "remove":
            target.remove();
            applied++; break;
        }
      } catch(e) { /* skip failed modifications */ }
    }

    // 両方を選択してズーム
    figma.currentPage.selection = [original, clone];
    figma.viewport.scrollAndZoomIntoView([original, clone]);

    return { cloneId: clone.id, applied: applied, originalName: original.name, renames: renames };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージハンドラ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
figma.ui.onmessage = function(msg) {

  // ── Generate: AI生成 ──
  if (msg.type === "generate") {
    var spec = msg.spec;
    var entry = { collections: [], variables: [], nodes: [] };
    var chain = Promise.resolve();

    if (spec.variables && spec.variables.length) {
      chain = chain.then(function() {
        var r = createVars(spec.variables);
        entry.collections = entry.collections.concat(r.collections);
        entry.variables = entry.variables.concat(r.variables);
      });
    }
    if (spec.components && spec.components.length) {
      chain = chain.then(function() {
        return createComps(spec.components).then(function(r) { entry.nodes = entry.nodes.concat(r.nodes); });
      });
    }
    if (spec.frames && spec.frames.length) {
      chain = chain.then(function() {
        return createFrames(spec.frames).then(function(r) { entry.nodes = entry.nodes.concat(r.nodes); });
      });
    }

    // Variables のみでキャンバス上に何もない場合、スウォッチを自動生成
    var hasCanvas = (spec.components && spec.components.length) || (spec.frames && spec.frames.length);
    if (!hasCanvas && spec.variables && spec.variables.length) {
      chain = chain.then(function() {
        return createVariableSwatch(spec).then(function(nodeId) {
          if (nodeId) entry.nodes.push(nodeId);
        });
      });
    }

    chain.then(function() {
      undoStack.push(entry);
      var parts = [];
      if (entry.variables.length) parts.push("Variables x" + entry.variables.length);
      if (spec.components && spec.components.length) parts.push("Components x" + spec.components.length);
      if (spec.frames && spec.frames.length) parts.push("Frames x" + spec.frames.length);
      figma.ui.postMessage({ type: "done", undoCount: undoStack.length, summary: parts.join(", ") });
      figma.notify("\u2713 " + (parts.join(", ") || "\u751F\u6210\u5B8C\u4E86"));
    }).catch(function(e) {
      figma.ui.postMessage({ type: "error", error: e.message || String(e) });
    });
  }

  // ── Review: As-Is → To-Be 適用 ──
  if (msg.type === "apply-review") {
    applyReview(msg.modifications).then(function(result) {
      undoStack.push({ collections: [], variables: [], nodes: [result.cloneId], renames: result.renames });
      figma.ui.postMessage({ type: "review-applied", applied: result.applied, undoCount: undoStack.length });
      figma.notify("\u2713 To-Be\u3092\u751F\u6210 (" + result.applied + "\u4EF6\u9069\u7528)");
    }).catch(function(e) {
      figma.ui.postMessage({ type: "review-error", error: e.message || String(e) });
    });
  }

  // ── Review: To-Be フレーム新規生成 ──
  if (msg.type === "generate-tobe") {
    var sel = figma.currentPage.selection;
    var original = sel.length ? sel[0] : null;
    var renames = [];

    // 元フレームに As-Is ラベル
    if (original && original.name.indexOf("As-Is") === -1 && original.name.indexOf("To-Be") === -1) {
      var oldName = original.name;
      original.name = oldName + " \u2014 As-Is";
      renames.push({ id: original.id, oldName: oldName });
    }

    // To-Be フレームを生成
    var toBeSpec = msg.toBeFrame;
    if (!toBeSpec.name || toBeSpec.name.indexOf("To-Be") === -1) {
      toBeSpec.name = (toBeSpec.name || "UI") + " \u2014 To-Be";
    }

    createFrames([toBeSpec]).then(function(r) {
      // 元フレームの右に配置
      if (original && r.nodes.length) {
        var toBeNode = figma.getNodeById(r.nodes[0]);
        if (toBeNode) {
          toBeNode.x = original.x + original.width + 60;
          toBeNode.y = original.y;
          figma.currentPage.selection = [original, toBeNode];
          figma.viewport.scrollAndZoomIntoView([original, toBeNode]);
        }
      }
      undoStack.push({ collections: [], variables: [], nodes: r.nodes, renames: renames });
      figma.ui.postMessage({ type: "tobe-done", undoCount: undoStack.length });
      figma.notify("\u2713 To-Be UI\u3092\u751F\u6210\u3057\u307E\u3057\u305F");
    }).catch(function(e) {
      figma.ui.postMessage({ type: "review-error", error: e.message || String(e) });
    });
  }

  // ── Review: ノードハイライト（クリックで対象を選択＋ズーム）──
  if (msg.type === "highlight-node") {
    var sel = figma.currentPage.selection;
    var root = sel.length ? sel[0] : null;
    if (!root) { figma.notify("フレームを先に選択してください"); return; }
    // 選択中フレーム内を検索
    var target = findByPath(root, msg.nodeName);
    // 見つからない場合、ページ全体から検索
    if (!target) {
      target = figma.currentPage.findOne(function(n) { return n.name === msg.nodeName; });
    }
    if (target) {
      figma.currentPage.selection = [target];
      figma.viewport.scrollAndZoomIntoView([target]);
      figma.notify(target.name + " (" + target.type + ")");
    } else {
      figma.notify("\"" + msg.nodeName + "\" が見つかりません");
    }
  }

  // ── Tokens: デザイントークンImport ──
  if (msg.type === "import-tokens") {
    try {
      var result = importTokens(msg.json);
      undoStack.push({ collections: result.collections, variables: result.variables, nodes: [] });
      figma.ui.postMessage({ type: "import-done", collections: result.collections.length, variables: result.variables.length, undoCount: undoStack.length });
      figma.notify("\u2713 " + result.collections.length + " collections, " + result.variables.length + " variables");
    } catch(e) {
      figma.ui.postMessage({ type: "import-error", error: e.message || String(e) });
    }
  }

  // ── Manage: コレクション一覧 ──
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

  if (msg.type === "save-settings") {
    Promise.all([
      figma.clientStorage.setAsync("api_key", msg.apiKey || ""),
      figma.clientStorage.setAsync("model", msg.model || "gemini-2.5-flash"),
    ]);
  }
};
