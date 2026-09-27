const test = require("node:test");
const assert = require("node:assert");
const { scriptJson } = require("./script-json");

test("a value cannot close the script it is written into", () => {
  const hostile = "</script><script>alert(1)</script>";
  const out = scriptJson(hostile);
  assert.ok(!out.includes("</script"), out);
  assert.equal(JSON.parse(out), hostile, "для JavaScript это та же строка");
});

test("objects, nulls and line separators survive the round trip", () => {
  const separator = String.fromCharCode(0x2028);
  const value = { a: "<b>", list: [1, separator], none: null };
  const out = scriptJson(value);
  assert.ok(!out.includes(separator));
  assert.deepEqual(JSON.parse(out), value);
  assert.equal(scriptJson(undefined), "null");
});
