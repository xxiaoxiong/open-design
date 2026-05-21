// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillsSection } from '../../src/components/SkillsSection';
import type { AppConfig } from '../../src/types';
import type { SkillSummary } from '@open-design/contracts';

const originalFetch = globalThis.fetch;

const TEST_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
  disabledSkills: [],
};

function makeSkill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'skill',
    name: 'Skill',
    description: 'A skill',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    source: 'built-in',
    ...overrides,
  };
}

function renderSkillsSection(skills: SkillSummary[]) {
  const setCfg = vi.fn();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/skills' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('/api/skills/') && init?.method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  render(
    <SkillsSection
      cfg={TEST_CONFIG}
      setCfg={setCfg}
    />,
  );
  return { fetchMock: globalThis.fetch as ReturnType<typeof vi.fn>, setCfg };
}

describe('SkillsSection', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not expose delete actions for built-in skills', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'builtin-skill',
        name: 'Built-in skill',
        source: 'built-in',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-builtin-skill');

    expect(within(row).queryByTestId('skills-delete')).toBeNull();
    expect(within(row).queryByTestId('skills-delete-confirm')).toBeNull();
  });

  it('keeps delete confirmation and commit available for user skills', async () => {
    const { fetchMock } = renderSkillsSection([
      makeSkill({
        id: 'user-skill',
        name: 'User skill',
        source: 'user',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-delete'));
    fireEvent.click(within(row).getByTestId('skills-delete-confirm'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/user-skill', {
        method: 'DELETE',
      });
    });
  });

  it('warns before editing a built-in skill creates a user override', async () => {
    const { fetchMock } = renderSkillsSection([
      makeSkill({
        id: 'builtin-skill',
        name: 'Built-in skill',
        source: 'built-in',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-builtin-skill');
    fireEvent.click(within(row).getByTestId('skills-edit'));

    const warning = await within(row).findByTestId('skills-edit-builtin-warning');
    expect(warning.textContent).toMatch(/override/i);
    expect(within(row).queryByTestId('skills-edit-form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/skills/builtin-skill',
      expect.objectContaining({ method: 'PUT' }),
    );

    fireEvent.click(within(row).getByTestId('skills-edit-builtin-cancel'));
    expect(within(row).queryByTestId('skills-edit-builtin-warning')).toBeNull();
    expect(within(row).queryByTestId('skills-edit-form')).toBeNull();

    fireEvent.click(within(row).getByTestId('skills-edit'));
    fireEvent.click(
      await within(row).findByTestId('skills-edit-builtin-confirm'),
    );
    expect(await within(row).findByTestId('skills-edit-form')).toBeTruthy();
  });

  it('skips the override warning when editing a user skill', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'user-skill',
        name: 'User skill',
        source: 'user',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-edit'));

    expect(within(row).queryByTestId('skills-edit-builtin-warning')).toBeNull();
    expect(await within(row).findByTestId('skills-edit-form')).toBeTruthy();
  });

  it('treats skills with undefined source as built-in for filtering and counting', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'undefined-source-skill',
        name: 'Undefined source skill',
        source: undefined,
      }),
      makeSkill({
        id: 'explicit-builtin',
        name: 'Explicit built-in',
        source: 'built-in',
      }),
      makeSkill({
        id: 'user-skill',
        name: 'User skill',
        source: 'user',
      }),
    ]);

    // Wait for skills to load
    await screen.findByTestId('skill-row-undefined-source-skill');

    // Find the source filter tabs
    const builtinTab = screen.getByRole('button', { name: /built-in/i });
    const userTab = screen.getByRole('button', { name: /user/i });

    // Built-in tab should count both explicit built-in and undefined source (2 total)
    expect(builtinTab.textContent).toMatch(/2/);
    
    // User tab should only count explicit user skills (1 total)
    expect(userTab.textContent).toMatch(/1/);

    // Click built-in tab - should show both explicit and undefined source skills
    fireEvent.click(builtinTab);
    await waitFor(() => {
      expect(screen.getByTestId('skill-row-undefined-source-skill')).toBeInTheDocument();
      expect(screen.getByTestId('skill-row-explicit-builtin')).toBeInTheDocument();
      expect(screen.queryByTestId('skill-row-user-skill')).toBeNull();
    });

    // Click user tab - should only show user skills
    fireEvent.click(userTab);
    await waitFor(() => {
      expect(screen.queryByTestId('skill-row-undefined-source-skill')).toBeNull();
      expect(screen.queryByTestId('skill-row-explicit-builtin')).toBeNull();
      expect(screen.getByTestId('skill-row-user-skill')).toBeInTheDocument();
    });
  });

  it('does not expose delete actions for skills with undefined source', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'undefined-source-skill',
        name: 'Undefined source skill',
        source: undefined,
      }),
    ]);

    const row = await screen.findByTestId('skill-row-undefined-source-skill');

    // Skills with undefined source are treated as built-in, so no delete button
    expect(within(row).queryByTestId('skills-delete')).toBeNull();
    expect(within(row).queryByTestId('skills-delete-confirm')).toBeNull();
  });
});
