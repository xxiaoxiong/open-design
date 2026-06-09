// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  isTerminalRunStatus,
} from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => (value: string) => value,
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) =>
    fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => null,
}));

function renderProjectView(overrides = {}) {
  const defaults = {
    project: { id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never,
    routeFileName: null,
    config: { mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never,
    agents: [{ id: 'agent-1', name: 'OpenCode', models: [] } as never],
    skills: [],
    designTemplates: [],
    designSystems: [],
    daemonLive: true,
    onModeChange: () => {},
    onAgentChange: () => {},
    onAgentModelChange: () => {},
    onRefreshAgents: () => {},
    onOpenSettings: () => {},
    onBack: () => {},
    onClearPendingPrompt: () => {},
    onTouchProject: () => {},
    onProjectChange: () => {},
    onProjectsRefresh: () => {},
  } as const;

  render(
    <ProjectView
      {...defaults}
      {...(overrides as any)}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectView reattach while streaming', () => {
  it('recovers a terminal run when streaming is already true for the same conversation', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-stuck',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-stuck',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-stuck',
      status: 'succeeded',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let capturedOnDone: (() => void) | null = null;
    reattachDaemonRun.mockImplementation(
      async (options: { handlers: { onDone: () => void } }) => {
        capturedOnDone = options.handlers.onDone;
        return new Promise<void>(() => {});
      },
    );

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(capturedOnDone).not.toBeNull();

    // Simulate downstream consumer finishing; the onDone path should now
    // persist the terminal state even though the UI started in a streaming state.
    capturedOnDone!();

    await waitFor(() => {
      const succeeded = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .find((m) => m?.id === 'msg-stuck' && m.runStatus === 'succeeded');
      expect(succeeded).toBeTruthy();
    });
  });

  it('keeps terminal runStatus when onRunStatus records success before onDone fires', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-race',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runId: 'run-race',
        runStatus: 'running',
        preTurnFileNames: [],
      } satisfies ChatMessage,
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-race',
      status: 'succeeded',
      createdAt: startedAt,
      updatedAt: startedAt,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);

    let captured: {
      onDone: () => void;
      onRunStatus: (s: string) => void;
    } | null = null;
    reattachDaemonRun.mockImplementation(async (options: any) => {
      captured = { onDone: options.handlers.onDone, onRunStatus: options.onRunStatus };
      return new Promise<void>(() => {});
    });

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();

    captured!.onRunStatus('succeeded');
    captured!.onDone();

    await waitFor(() => {
      const finalSave = saveMessage.mock.calls
        .map((call) => call[2] as ChatMessage)
        .filter((m) => m?.id === 'msg-race' && (isTerminalRunStatus(m.runStatus)))
        .at(-1);
      expect(finalSave?.runStatus).toBe('succeeded');
    });
  });
});
