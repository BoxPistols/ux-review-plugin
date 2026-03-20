"use strict";

// src/code.ts
figma.showUI(__html__, { width: 420, height: 680, title: "UX Review AI", themeColors: true });
function buildFileContext() {
  const fileName = figma.root.name;
  const pages = figma.root.children.map((p) => p.name);
  const allText = [fileName, ...pages].join(" ").toLowerCase();
  let projectType = "";
  if (/drone|uav|flight|点検|inspection/.test(allText))
    projectType = "\u30C9\u30ED\u30FC\u30F3\u70B9\u691C\u30FBUAV\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  else if (/crm|顧客|customer|sales/.test(allText))
    projectType = "CRM\u30FB\u55B6\u696D\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  else if (/erp|inventory|在庫|purchase|発注/.test(allText))
    projectType = "ERP\u30FB\u5728\u5EAB\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  else if (/dashboard|monitor|分析|analytics/.test(allText))
    projectType = "\u7BA1\u7406\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u30FB\u5206\u6790\u30B7\u30B9\u30C6\u30E0";
  else if (/booking|reservation|予約|schedule/.test(allText))
    projectType = "\u4E88\u7D04\u30FB\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0";
  else if (/map|gis|geo|地図/.test(allText))
    projectType = "\u5730\u56F3\u30FBGIS\u30B7\u30B9\u30C6\u30E0";
  else if (/approval|承認|workflow|フロー/.test(allText))
    projectType = "\u627F\u8A8D\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u30B7\u30B9\u30C6\u30E0";
  else
    projectType = "B2B\u696D\u52D9\u30B7\u30B9\u30C6\u30E0";
  const hasCRUD = pages.some((p) => /一覧|詳細|登録|編集|create|list|detail|edit/.test(p.toLowerCase()));
  const hasOnboarding = pages.some((p) => /login|ログイン|onboard|signup/.test(p.toLowerCase()));
  const hasSettings = pages.some((p) => /setting|設定|config/.test(p.toLowerCase()));
  const allFrameNames = [];
  figma.root.children.forEach((page) => {
    page.children.forEach((n) => allFrameNames.push(n.name));
  });
  const frameText = allFrameNames.join(" ").toLowerCase();
  let estimatedStack = "";
  if (/mui|material/.test(frameText))
    estimatedStack = "Material UI\u7CFB";
  else if (/ant[\s-]design|antd/.test(frameText))
    estimatedStack = "Ant Design\u7CFB";
  else if (/chakra/.test(frameText))
    estimatedStack = "Chakra UI\u7CFB";
  else if (/1440|1920/.test(frameText))
    estimatedStack = "\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7Web\uFF081440px\u57FA\u6E96\uFF09";
  else if (/375|390|430/.test(frameText))
    estimatedStack = "\u30E2\u30D0\u30A4\u30EB\uFF08iPhone\u7CFB\uFF09";
  else if (/768|1024/.test(frameText))
    estimatedStack = "\u30BF\u30D6\u30EC\u30C3\u30C8\u7CFB";
  return {
    fileName,
    pages,
    projectType,
    estimatedStack,
    hasCRUD,
    hasOnboarding,
    hasSettings,
    totalFrames: allFrameNames.length
  };
}
function extractNode(node, depth = 0) {
  var _a;
  const s = {
    id: node.id,
    name: node.name,
    type: node.type,
    width: "width" in node ? Math.round(node.width) : 0,
    height: "height" in node ? Math.round(node.height) : 0,
    children: [],
    texts: [],
    interactions: []
  };
  if (node.type === "INSTANCE")
    s.componentName = (_a = node.mainComponent) == null ? void 0 : _a.name;
  if (node.type === "TEXT") {
    const c = node.characters;
    if (c)
      s.texts.push(c.slice(0, 150));
  }
  if ("reactions" in node) {
    ;
    node.reactions.forEach((r) => {
      var _a2, _b, _c, _d;
      s.interactions.push(`${(_b = (_a2 = r.trigger) == null ? void 0 : _a2.type) != null ? _b : "?"} \u2192 ${(_d = (_c = r.action) == null ? void 0 : _c.type) != null ? _d : "?"}`);
    });
  }
  if (depth < 5 && "children" in node) {
    ;
    node.children.slice(0, 25).forEach((child) => {
      const c = extractNode(child, depth + 1);
      s.texts.push(...c.texts);
      s.children.push(c);
    });
  }
  return s;
}
function getPageFrames() {
  return figma.root.children.map((page) => ({
    pageName: page.name,
    frames: page.children.filter((n) => n.type === "FRAME" || n.type === "COMPONENT").map((n) => ({ name: n.name, id: n.id })).slice(0, 40)
  }));
}
function notifySelection() {
  const sel = figma.currentPage.selection;
  const fileContext = buildFileContext();
  if (sel.length === 0) {
    figma.ui.postMessage({ type: "selection-cleared", fileContext });
    return;
  }
  const nodes = sel.map((n) => extractNode(n));
  figma.ui.postMessage({
    type: "selection-changed",
    nodes,
    isMulti: nodes.length > 1,
    pageFrames: getPageFrames(),
    currentPage: figma.currentPage.name,
    fileContext
  });
}
figma.on("selectionchange", notifySelection);
notifySelection();
figma.ui.onmessage = async (msg) => {
  var _a;
  if (msg.type === "load-settings") {
    const [apiKey, model, domain, proxyUrl, projectKnowledge, history] = await Promise.all([
      figma.clientStorage.getAsync("oai_key"),
      figma.clientStorage.getAsync("oai_model"),
      figma.clientStorage.getAsync("domain"),
      figma.clientStorage.getAsync("proxy_url"),
      figma.clientStorage.getAsync("project_knowledge"),
      figma.clientStorage.getAsync("review_history")
    ]);
    figma.ui.postMessage({
      type: "settings-loaded",
      apiKey: apiKey != null ? apiKey : "",
      model: ["gpt-5.4-nano", "gpt-5.4-mini"].includes(model) ? model : "gpt-5.4-nano",
      domain: domain != null ? domain : "",
      proxyUrl: proxyUrl != null ? proxyUrl : "",
      projectKnowledge: projectKnowledge != null ? projectKnowledge : "",
      history: history != null ? history : [],
      fileContext: buildFileContext()
    });
  }
  if (msg.type === "save-settings") {
    const s = msg.settings;
    const tasks = [];
    if (s.apiKey !== void 0)
      tasks.push(figma.clientStorage.setAsync("oai_key", s.apiKey));
    if (s.model !== void 0)
      tasks.push(figma.clientStorage.setAsync("oai_model", s.model));
    if (s.domain !== void 0)
      tasks.push(figma.clientStorage.setAsync("domain", s.domain));
    if (s.proxyUrl !== void 0)
      tasks.push(figma.clientStorage.setAsync("proxy_url", s.proxyUrl));
    if (s.projectKnowledge !== void 0)
      tasks.push(figma.clientStorage.setAsync("project_knowledge", s.projectKnowledge));
    await Promise.all(tasks);
  }
  if (msg.type === "save-review-history") {
    const existing = (_a = await figma.clientStorage.getAsync("review_history")) != null ? _a : [];
    const filtered = existing.filter((e) => e.frameId !== msg.entry.frameId);
    const updated = [msg.entry, ...filtered].slice(0, 20);
    await figma.clientStorage.setAsync("review_history", updated);
    figma.ui.postMessage({ type: "history-saved", history: updated });
  }
  if (msg.type === "copy-text") {
    figma.ui.postMessage({ type: "do-copy", text: msg.text });
    figma.notify("\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F \u2713");
  }
  if (msg.type === "resize") {
    figma.ui.resize(
      Math.min(Math.max(msg.width, 380), 1200),
      Math.min(Math.max(msg.height, 500), 1e3)
    );
  }
};
