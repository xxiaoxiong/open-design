import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../../src/runtime/markdown';

function html(input: string, options?: Parameters<typeof renderMarkdown>[1]): string {
  return renderToStaticMarkup(<>{renderMarkdown(input, options)}</>);
}

describe('renderMarkdown', () => {
  it('autolinks bare https URLs without breaking on underscores in query params', () => {
    // OAuth-style URL with underscores in `response_type`, `client_id`,
    // `code_challenge`, `code_challenge_method`. The previous renderer
    // greedily matched `_..._` as italic and shredded the URL into pieces.
    const url =
      'https://mcp.higgsfield.ai/oauth2/authorize?response_type=code&client_id=abc&code_challenge=xyz&code_challenge_method=S256';
    // HTML attribute encoding swaps `&` for `&amp;` — compare against the
    // encoded form rather than the raw URL we passed in.
    const encoded = url.replace(/&/g, '&amp;');
    const out = html(`Open this link: ${url}`);
    expect(out).toContain(`href="${encoded}"`);
    expect(out).toContain(`>${encoded}</a>`);
    // The italic <em> tag should NOT have been emitted from the URL fragments.
    expect(out).not.toContain('<em>');
  });

  it('keeps italic working in regular prose', () => {
    const out = html('A word with _emphasis_ here.');
    expect(out).toContain('<em>emphasis</em>');
  });

  it('renders explicit [text](url) markdown links', () => {
    const out = html('Click [here](https://example.com/page) to continue.');
    expect(out).toContain('<a class="md-link"');
    expect(out).toContain('href="https://example.com/page"');
    expect(out).toContain('>here</a>');
  });

  it('marks bare URLs with the bare-link class so CSS can break them mid-string', () => {
    const out = html('See https://example.com/very/long/path?with=long&query=string');
    expect(out).toContain('md-link-bare');
  });

  it('does not autolink inside inline code spans', () => {
    const out = html('Use `https://example.com/x` literally.');
    // The URL should appear inside a <code> tag, not turned into an anchor.
    expect(out).toContain('<code class="md-inline-code">https://example.com/x</code>');
  });

  it('routes project file links through onOpenProjectFile instead of opening _blank', () => {
    const opened: string[] = [];
    const out = html(
      'Here is [index.html](/api/projects/abc123/raw/index.html)',
      {
        resolveProjectFileLink: (href) => {
          const prefix = '/api/projects/abc123/raw/';
          if (href.startsWith(prefix)) {
            return decodeURIComponent(href.slice(prefix.length));
          }
          return null;
        },
        onOpenProjectFile: (name) => opened.push(name),
      },
    );
    // Should not contain _blank / noreferrer
    expect(out).not.toContain('target="_blank"');
    expect(out).not.toContain('noreferrer');
    // Should still render a link (or at least the text)
    expect(out).toContain('index.html');
  });

  it('keeps external links opening in a new tab', () => {
    const opened: string[] = [];
    const out = html(
      'See https://example.com/page',
      {
        resolveProjectFileLink: (href) => {
          const prefix = '/api/projects/abc123/raw/';
          if (href.startsWith(prefix)) {
            return decodeURIComponent(href.slice(prefix.length));
          }
          return null;
        },
        onOpenProjectFile: (name) => opened.push(name),
      },
    );
    expect(out).toContain('target="_blank"');
    expect(opened).toHaveLength(0);
  });

  it('routes project file links without target=_blank', () => {
    const opened: string[] = [];
    const out = html(
      'See [styles/main.css](/api/projects/abc123/raw/styles/main.css)',
      {
        resolveProjectFileLink: (href) => {
          const prefix = '/api/projects/abc123/raw/';
          if (href.startsWith(prefix)) {
            return decodeURIComponent(href.slice(prefix.length));
          }
          return null;
        },
        onOpenProjectFile: (name) => opened.push(name),
      },
    );
    // Project file links should not open in a new tab.
    expect(out).not.toContain('target="_blank"');
    expect(out).not.toContain('noreferrer');
    expect(out).toContain('styles/main.css');
  });
});
