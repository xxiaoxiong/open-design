/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ProjectView CLI toast messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include "Prompt copied" in Electron success toast', () => {
    const message = 'Prompt copied. Folder opened. Run `claude` in your terminal here and paste.';
    expect(message).toContain('Prompt copied');
    expect(message).toContain('Folder opened');
    expect(message).toContain('paste');
  });

  it('should include "Prompt copied" in Electron failure toast', () => {
    const projectDir = '/path/to/project';
    const message = `Prompt copied. Couldn't open the folder. Open your terminal at ${projectDir}, run \`claude\`, and paste.`;
    expect(message).toContain('Prompt copied');
    expect(message).toContain("Couldn't open the folder");
    expect(message).toContain('paste');
  });

  it('should include "Prompt copied" in web fallback toast', () => {
    const projectDir = '/path/to/project';
    const message = `Prompt copied. Open your terminal at ${projectDir}, run \`claude\`, and paste.`;
    expect(message).toContain('Prompt copied');
    expect(message).toContain('Open your terminal');
    expect(message).toContain('paste');
  });

  it('should NOT include "Prompt copied" in clipboard failure toast', () => {
    const projectDir = '/path/to/project';
    const message = 'Clipboard unavailable. Copy this prompt manually, then run `claude` at the working directory.';
    expect(message).not.toContain('Prompt copied');
    expect(message).toContain('Clipboard unavailable');
    expect(message).toContain('Copy this prompt manually');
  });
});
