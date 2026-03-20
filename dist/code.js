"use strict";

figma.showUI(__html__, { width: 480, height: 560, title: "AI UI Generator", themeColors: true });

// ── フォント ──
const FONTS = [
  { family: "Inter", style: "Regular" },
  { family: "Inter", style: "Medium" },
  { family: "Inter", style: "Semi Bold" },
  { family: "Inter", style: "Bold" },
];
let fontsLoaded = false;

async function ensureFonts() {
  if (fontsLoaded) return;
  await Promise.all(FONTS.map(f => figma.loadFontAsync(f)));
  fontsLoaded = true;
}

// ── ユーティリティ ──
function hexToRgb(hex) {
  const h = (hex || "#888888").replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function makeFills(color) {
  if (!color) return [];
  return [{ type: "SOLID", color: hexToRgb(color) }];
}

// ── ノード生成（再帰） ──
async function buildNode(spec, parent) {
  let node;

  switch (spec.type) {
    case "TEXT": {
      node = figma.createText();
      const wm = { Regular: "Regular", Medium: "Medium", SemiBold: "Semi Bold", Bold: "Bold" };
      node.fontName = { family: "Inter", style: wm[spec.fontWeight] || "Regular" };
      node.characters = spec.text || "";
      node.fontSize = spec.fontSize || 14;
      if (spec.color) node.fills = makeFills(spec.color);
      break;
    }
    case "RECT": {
      node = figma.createRectangle();
      node.resize(Math.max(spec.width || 100, 1), Math.max(spec.height || 40, 1));
      if (spec.fill) node.fills = makeFills(spec.fill);
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.stroke) {
        node.strokes = makeFills(spec.stroke);
        node.strokeWeight = spec.strokeWidth || 1;
      }
      break;
    }
    case "ELLIPSE": {
      node = figma.createEllipse();
      node.resize(Math.max(spec.width || 50, 1), Math.max(spec.height || 50, 1));
      if (spec.fill) node.fills = makeFills(spec.fill);
      break;
    }
    case "FRAME": {
      node = figma.createFrame();
      node.resize(Math.max(spec.width || 100, 1), Math.max(spec.height || 100, 1));
      if (spec.fill || spec.background) node.fills = makeFills(spec.fill || spec.background);
      else node.fills = [];
      if (spec.cornerRadius != null) node.cornerRadius = spec.cornerRadius;
      if (spec.children) {
        for (const child of spec.children) {
          await buildNode(child, node);
        }
      }
      break;
    }
    default:
      return null;
  }

  if (!node) return null;
  node.name = spec.name || node.name;
  node.x = spec.x || 0;
  node.y = spec.y || 0;
  parent.appendChild(node);
  return node;
}

// ── メインのUI生成 ──
async function generateUI(spec) {
  await ensureFonts();

  const root = figma.createFrame();
  root.name = spec.name || "AI Generated";
  root.resize(Math.max(spec.width || 400, 1), Math.max(spec.height || 600, 1));
  if (spec.background) root.fills = makeFills(spec.background);

  const center = figma.viewport.center;
  root.x = Math.round(center.x - root.width / 2);
  root.y = Math.round(center.y - root.height / 2);

  if (spec.children) {
    for (const child of spec.children) {
      await buildNode(child, root);
    }
  }

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
}

// ── メッセージハンドラ ──
figma.ui.onmessage = async (msg) => {
  if (msg.type === "generate") {
    try {
      await generateUI(msg.spec);
      figma.ui.postMessage({ type: "done" });
      figma.notify("✓ UIを生成しました");
    } catch (e) {
      figma.ui.postMessage({ type: "error", error: e.message });
      figma.notify("エラー: " + e.message, { error: true });
    }
  }

  if (msg.type === "load-settings") {
    const [apiKey, provider] = await Promise.all([
      figma.clientStorage.getAsync("api_key"),
      figma.clientStorage.getAsync("provider"),
    ]);
    figma.ui.postMessage({
      type: "settings-loaded",
      apiKey: apiKey || "",
      provider: provider || "gemini",
    });
  }

  if (msg.type === "save-settings") {
    await Promise.all([
      figma.clientStorage.setAsync("api_key", msg.apiKey || ""),
      figma.clientStorage.setAsync("provider", msg.provider || "gemini"),
    ]);
  }
};
