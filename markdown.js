/**
 * Extract code blocks from Markdown.
 *
 * Intentionally minimal: supports only fenced blocks:
 *
 * ```lang
 * ...
 * ```
 *
 * @param {string} md
 * @returns {Array<{lang:string, code:string}>}
 */
export function extractFencedCodeBlocks(md) {
  /** @type {Array<{lang:string, code:string}>} */
  const out = [];
  const re = /```([^\n`]*)\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(md))) {
    const lang = (m[1] ?? '').trim();
    const code = m[2] ?? '';
    out.push({ lang, code });
  }
  return out;
}

/**
 * @param {string} md
 * @param {{ preferredLangs?: string[] }} [opts]
 * @returns {string|null}
 */
export function extractPreferredCodeBlock(md, opts) {
  const preferredLangs = opts?.preferredLangs ?? ['text', ''];
  const blocks = extractFencedCodeBlocks(md);
  for (const lang of preferredLangs) {
    const b = blocks.find(x => (x.lang || '') === lang);
    if (b) return b.code;
  }
  return blocks[0]?.code ?? null;
}
