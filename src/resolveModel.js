// code.js の resolveModel を Node.js テスト用に切り出し
var MODEL_IDS = ["gpt-6-luna"];
var DEFAULT_MODEL = "gpt-6-luna";
function resolveModel(saved) {
  return MODEL_IDS.indexOf(saved) >= 0 ? saved : DEFAULT_MODEL;
}

module.exports = { resolveModel, MODEL_IDS, DEFAULT_MODEL };
