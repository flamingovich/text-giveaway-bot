// A value for inside an inline <script>. JSON.stringify leaves "</script>" as
// it is, and the HTML parser ends the script there whatever JavaScript thinks:
// a value taken from the url then runs as the page's own code. A "<" written
// as a unicode escape is the same string to JavaScript and nothing to HTML.
// U+2028 and U+2029 are escaped too: older engines read them as line breaks
// inside a string literal.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function scriptJson(value) {
  return String(JSON.stringify(value === undefined ? null : value))
    .replace(/</g, "\\u003c")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}

module.exports = { scriptJson };
