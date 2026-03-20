"use strict";

figma.showUI(__html__, { width: 480, height: 620, title: "AI UI Generator", themeColors: true });

// ── フォント ──
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

// ── ユーティリティ ──
function hex2rgb(hex) {
  var h = (hex || "#888888").replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}
function solid(hex) {
  return hex ? [{ type: "SOLID", color: hex2rgb(hex) }] : [];
}
var WMAP = { Regular: "Regular", Medium: "Medium", SemiBold: "Semi Bold", Bold: "Bold" };
function v(val, def) { return (val != null) ? val : def; }

// ── Undo スタック ──
var undoStack = [];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1) Variables 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createVars(collections) {
  var ids = { collections: [], variables: [] };
  for (var i = 0; i < collections.length; i++) {
    var col = collections[i];
    var c = figma.variables.createVariableCollection(col.collection);
    ids.collections.push(c.id);
    var mode = c.modes[0].id;
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
// 2) Component Variants 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function createComps(components) {
  return ensureFonts().then(function() {
    var ids = { nodes: [] };
    var center = figma.viewport.center;
    var ox = 0;
    var allSets = [];

    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      var nodes = [];
      for (var j = 0; j < comp.variants.length; j++) {
        var vr = comp.variants[j];
        var c = figma.createComponent();
        c.layoutMode = "HORIZONTAL";
        c.primaryAxisAlignItems = "CENTER";
        c.counterAxisAlignItems = "CENTER";
        c.primaryAxisSizingMode = "AUTO";
        c.counterAxisSizingMode = "AUTO";
        c.paddingLeft = c.paddingRight = v(vr.paddingX, 16);
        c.paddingTop = c.paddingBottom = v(vr.paddingY, 10);
        c.cornerRadius = v(vr.cornerRadius, 8);
        c.itemSpacing = v(vr.gap, 8);

        var fill = vr.fill;
        c.fills = (fill && fill !== "none" && fill !== "transparent") ? solid(fill) : [];
        if (vr.stroke) { c.strokes = solid(vr.stroke); c.strokeWeight = v(vr.strokeWidth, 1); }
        if (vr.opacity != null) c.opacity = vr.opacity;

        var t = figma.createText();
        t.fontName = { family: "Inter", style: WMAP[vr.fontWeight] || "Medium" };
        t.characters = vr.label || "\u30DC\u30BF\u30F3";
        t.fontSize = v(vr.fontSize, 14);
        if (vr.textColor) t.fills = solid(vr.textColor);
        c.appendChild(t);

        var propStr = Object.keys(vr.props).map(function(k) { return k + "=" + vr.props[k]; }).join(", ");
        c.name = propStr;
        nodes.push(c);
      }

      if (nodes.length) {
        var cs = figma.combineAsVariants(nodes, figma.currentPage);
        cs.name = comp.name;
        cs.layoutMode = "VERTICAL";
        cs.counterAxisSizingMode = "AUTO";
        cs.primaryAxisSizingMode = "AUTO";
        cs.itemSpacing = 16;
        cs.paddingTop = cs.paddingBottom = 24;
        cs.paddingLeft = cs.paddingRight = 24;
        cs.x = Math.round(center.x + ox);
        cs.y = Math.round(center.y);
        ox += cs.width + 80;
        allSets.push(cs);
        ids.nodes.push(cs.id);
      }
    }

    if (allSets.length) {
      figma.currentPage.selection = allSets;
      figma.viewport.scrollAndZoomIntoView(allSets);
    }
    return ids;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3) Auto Layout フレーム生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildAutoNode(spec, parent) {
  return ensureFonts().then(function() {
    var node;
    var type = spec.type || "FRAME";

    if (type === "TEXT") {
      node = figma.createText();
      node.fontName = { family: "Inter", style: WMAP[spec.fontWeight] || "Regular" };
      node.characters = spec.text || "";
      node.fontSize = v(spec.fontSize, 14);
      if (spec.color) node.fills = solid(spec.color);
    } else if (type === "RECT") {
      node = figma.createRectangle();
      node.resize(Math.max(v(spec.width, 100), 1), Math.max(v(spec.height, 1), 1));
      node.fills = spec.fill ? solid(spec.fill) : [];
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.stroke) { node.strokes = solid(spec.stroke); node.strokeWeight = v(spec.strokeWidth, 1); }
    } else if (type === "ELLIPSE") {
      node = figma.createEllipse();
      node.resize(Math.max(v(spec.width, 40), 1), Math.max(v(spec.height, 40), 1));
      node.fills = spec.fill ? solid(spec.fill) : [];
    } else {
      node = figma.createFrame();
      node.resize(Math.max(v(spec.width, 100), 1), Math.max(v(spec.height, 100), 1));

      var bg = spec.fill || spec.background;
      node.fills = (bg && bg !== "transparent" && bg !== "none") ? solid(bg) : [];
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.stroke) { node.strokes = solid(spec.stroke); node.strokeWeight = v(spec.strokeWidth, 1); }

      if (spec.layoutMode) {
        node.layoutMode = spec.layoutMode;
        node.itemSpacing = v(spec.itemSpacing, v(spec.gap, 0));
        var p = spec.padding;
        if (typeof p === "number") {
          node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = p;
        }
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
          (function(child) {
            chain = chain.then(function() { return buildAutoNode(child, node); });
          })(spec.children[ci]);
        }
        return chain.then(function() {
          finishNode(node, spec, parent);
          return node;
        });
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
      try {
        if (spec.fillWidth) node.layoutSizingHorizontal = "FILL";
        if (spec.fillHeight) node.layoutSizingVertical = "FILL";
      } catch (e) {}
    }
  }
}

function createFrames(frames) {
  var ids = { nodes: [] };
  var center = figma.viewport.center;
  var allNodes = [];
  var ox = 0;

  var chain = Promise.resolve();
  for (var i = 0; i < frames.length; i++) {
    (function(spec, idx) {
      chain = chain.then(function() {
        return buildAutoNode(spec, null).then(function(node) {
          node.x = Math.round(center.x + ox);
          node.y = Math.round(center.y);
          figma.currentPage.appendChild(node);
          ox += node.width + 60;
          allNodes.push(node);
          ids.nodes.push(node.id);
        });
      });
    })(frames[i], i);
  }

  return chain.then(function() {
    if (allNodes.length) {
      figma.currentPage.selection = allNodes;
      figma.viewport.scrollAndZoomIntoView(allNodes);
    }
    return ids;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undo 処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function undoEntry(entry) {
  var i;
  for (i = 0; i < entry.nodes.length; i++) {
    try { var n = figma.getNodeById(entry.nodes[i]); if (n) n.remove(); } catch (e) {}
  }
  for (i = 0; i < entry.variables.length; i++) {
    try { var vr = figma.variables.getVariableById(entry.variables[i]); if (vr) vr.remove(); } catch (e) {}
  }
  for (i = 0; i < entry.collections.length; i++) {
    try { var c = figma.variables.getVariableCollectionById(entry.collections[i]); if (c) c.remove(); } catch (e) {}
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージハンドラ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
figma.ui.onmessage = function(msg) {
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
        return createComps(spec.components).then(function(r) {
          entry.nodes = entry.nodes.concat(r.nodes);
        });
      });
    }
    if (spec.frames && spec.frames.length) {
      chain = chain.then(function() {
        return createFrames(spec.frames).then(function(r) {
          entry.nodes = entry.nodes.concat(r.nodes);
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

  if (msg.type === "undo") {
    if (!undoStack.length) { figma.ui.postMessage({ type: "undo-done", undoCount: 0 }); return; }
    undoEntry(undoStack.pop());
    figma.ui.postMessage({ type: "undo-done", undoCount: undoStack.length });
    figma.notify("\u2713 \u5143\u306B\u623B\u3057\u307E\u3057\u305F");
  }

  if (msg.type === "undo-all") {
    var total = 0;
    while (undoStack.length) { undoEntry(undoStack.pop()); total++; }
    figma.ui.postMessage({ type: "undo-done", undoCount: 0 });
    figma.notify("\u2713 " + total + "\u4EF6\u3092\u4E00\u62EC\u524A\u9664");
  }

  if (msg.type === "load-settings") {
    Promise.all([
      figma.clientStorage.getAsync("api_key"),
      figma.clientStorage.getAsync("model"),
    ]).then(function(r) {
      figma.ui.postMessage({ type: "settings-loaded", apiKey: r[0] || "", model: r[1] || "gemini-2.5-flash" });
    });
  }

  if (msg.type === "save-settings") {
    Promise.all([
      figma.clientStorage.setAsync("api_key", msg.apiKey || ""),
      figma.clientStorage.setAsync("model", msg.model || "gemini-2.5-flash"),
    ]);
  }
};
