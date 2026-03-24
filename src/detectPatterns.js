// code.js の detectPatterns を Node.js テスト用に切り出し
function detectPatterns(node, extracted) {
  var hints = [];
  if (!node.children || !node.children.length) return hints;
  var kids = node.children;
  var layout = node.layoutMode || "NONE";
  if (layout === "NONE") return hints;

  var childStructures = {};
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    var sig = k.type;
    if (k.children) {
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

  return hints;
}

module.exports = { detectPatterns };
