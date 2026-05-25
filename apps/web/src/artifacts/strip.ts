import { computeSkipRanges, isRealArtifactOpenAt, rangeContains, type Range } from './markdown-context';

const OPEN = '<artifact';
const CLOSE = '</artifact>';

function findUnskipped(content: string, needle: string, fromIndex: number, ranges: ReadonlyArray<Range>): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(needle, from);
    if (idx === -1) return -1;
    if (!rangeContains(ranges, idx)) return idx;
    from = idx + needle.length;
  }
  return -1;
}

// Like `findUnskipped(OPEN, …)` but also rejects prefix-shared literals like
// `<artifactual` — only `<artifact` followed by whitespace counts as a real
// protocol open. Matches the parser's `findOpenTag` real-open guard so the
// two paths agree on what the renderer will treat as a tag.
function findRealOpen(content: string, fromIndex: number, ranges: ReadonlyArray<Range>): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(OPEN, from);
    if (idx === -1) return -1;
    if (rangeContains(ranges, idx) || !isRealArtifactOpenAt(content, idx)) {
      from = idx + OPEN.length;
      continue;
    }
    return idx;
  }
  return -1;
}

/**
 * Remove all real `<artifact …>…</artifact>` blocks from `content`.
 *
 * "Real" excludes any `<artifact` substring that the chat Markdown renderer
 * would render as inline code or part of a fenced code block — those are
 * literal recitations of the protocol and must survive intact, otherwise
 * the rendered chat reply gets silently truncated mid-explanation.
 *
 * If no real open tag exists, the content is returned unchanged. If a real
 * open exists but no matching real close is found, the content is also
 * returned unchanged (refusing to strip is safer than truncating to
 * end-of-string when a tag is malformed or still streaming).
 *
 * Strips all artifact blocks iteratively to prevent raw HTML source from
 * leaking into the conversation when multiple artifacts are present.
 */
export function stripArtifact(content: string): string {
  let result = content;
  let iteration = 0;
  const maxIterations = 100; // Safety limit to prevent infinite loops
  
  while (iteration < maxIterations) {
    // Recompute skip ranges for the current result string
    const { ranges: baseRanges, unclosedFenceStart } = computeSkipRanges(result);
    // For complete (non-streaming) content, an unclosed fence is rendered by
    // the chat Markdown renderer as a code block extending to end of input
    // (see runtime/markdown.tsx:49 — the close-loop runs until lines exhaust).
    // The stripper has to mirror that, otherwise a literal `<artifact …>`
    // tucked into a code example at the bottom of a chat reply (no trailing
    // newline) gets treated as a real protocol tag and eaten.
    const ranges: Range[] =
      unclosedFenceStart !== null ? [...baseRanges, [unclosedFenceStart, result.length]] : baseRanges;
    
    const open = findRealOpen(result, 0, ranges);
    if (open === -1) break;
    const closeTag = result.indexOf('>', open);
    if (closeTag === -1) break;
    const end = findUnskipped(result, CLOSE, closeTag, ranges);
    if (end === -1) break;
    
    result = (result.slice(0, open) + result.slice(end + CLOSE.length)).trim();
    iteration++;
  }
  
  return result;
}
