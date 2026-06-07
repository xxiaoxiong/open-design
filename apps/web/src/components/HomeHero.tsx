// Lovart-style centered hero for the entry Home view.
//
// The prompt textarea is the canonical creation surface: the user
// either types freely or selects a type below to reveal matching
// starters, then presses Run / Enter to spawn a project. The hero is
// kept dependency-free (no plugin list / project list) so it can be
// composed with the recent-projects strip and plugins section
// without owning their data lifecycles.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  ReactNode,
  RefObject,
} from 'react';
import type {
  ChatSessionMode,
  ConnectorDetail,
  InputFieldSpec,
  InstalledPluginRecord,
  McpServerConfig,
} from '@open-design/contracts';
import type { SkillSummary } from '../types';
import { Icon, type IconName } from './Icon';
import { useAnalytics } from '../analytics/provider';
import { trackHomeChatComposerClick } from '../analytics/events';
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from './home-hero/chips';
import {
  filterPluginsBySubChip,
  isSubChipParent,
  subChipsForChip,
  type HomeHeroSubChip,
} from './home-hero/sub-chips';
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { useI18n, useT } from '../i18n';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import type { Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { PreviewSurface } from './plugins-home/cards/PreviewSurface';
import { curatedPluginPriorityForChip } from './plugins-home/curatedPriority';
import { inferPluginPreview } from './plugins-home/preview';
import { SessionModeToggle } from './SessionModeToggle';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';

export interface HomeHeroSubmitHandler {
  (): void;
}

// The homepage prompt input now shares the project composer's Lexical
// editor, so the forwarded handle is a small focus surface rather than a
// raw <textarea>. HomeView drives `focusEnd()` after seeding a prompt
// example / picking a plugin.
export interface HomeHeroHandle {
  focus(): void;
  focusEnd(): void;
}

export interface ExamplePromptInfo {
  title: string;
  artifactType: string;
  brief: Record<string, string>;
}

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  activePluginTitle: string | null;
  activePluginRecord?: InstalledPluginRecord | null;
  activeChipId: string | null;
  onClearActivePlugin: () => void;
  onClearActiveChip?: () => void;
  activeSkillId?: string | null;
  activeSkillTitle?: string | null;
  onClearActiveSkill?: () => void;
  selectedPluginContexts?: InstalledPluginRecord[];
  selectedMcpContexts?: McpServerConfig[];
  selectedConnectorContexts?: ConnectorDetail[];
  // Context-only selections (staged through the plain `Use` action, no inline
  // @mention pill). These have no in-prompt representation, so the active row
  // renders a removable chip for each — otherwise a kept-in-payload context
  // would be invisible and unremovable (silent context drift).
  contextOnlyPlugins?: InstalledPluginRecord[];
  contextOnlyMcpServers?: McpServerConfig[];
  contextOnlyConnectors?: ConnectorDetail[];
  onRemovePluginContext?: (pluginId: string) => void;
  onRemoveMcpContext?: (serverId: string) => void;
  onRemoveConnectorContext?: (connectorId: string) => void;
  onAddPlugin?: () => void;
  onAddConnector?: () => void;
  onAddMcp?: () => void;
  onOpenPluginDetails?: (record: InstalledPluginRecord) => void;
  pluginInputFields?: InputFieldSpec[];
  pluginInputValues?: Record<string, unknown>;
  pluginInputTemplate?: string | null;
  onPluginInputValuesChange?: (values: Record<string, unknown>) => void;
  inlineEditableInputNames?: string[];
  footerInputNames?: string[];
  designSystemOptions?: HomeHeroDesignSystemOption[];
  stagedFiles?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  pluginOptions: InstalledPluginRecord[];
  pluginsLoading: boolean;
  skillOptions?: SkillSummary[];
  skillsLoading?: boolean;
  mcpOptions?: McpServerConfig[];
  mcpLoading?: boolean;
  connectorOptions?: ConnectorDetail[];
  pendingPluginId: string | null;
  pendingChipId: string | null;
  submitDisabled?: boolean;
  onPickPlugin: (record: InstalledPluginRecord, nextPrompt: string | null) => void;
  onPickExamplePlugin?: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  onPickSkill?: (skill: SkillSummary, nextPrompt: string | null) => void;
  onPickMcp?: (server: McpServerConfig, nextPrompt: string) => void;
  onPickConnector?: (connector: ConnectorDetail, nextPrompt: string) => void;
  onPickChip: (chip: HomeHeroChip) => void;
  contextItemCount: number;
  error: string | null;
  showActivePluginChip?: boolean;
  workingDir?: string | null;
  onPickWorkingDir?: () => void;
  onClearWorkingDir?: () => void;
  onExamplePromptStatusChange?: (info: ExamplePromptInfo | null) => void;
  executionSwitcher?: ReactNode;
}

interface HomeHeroDesignSystemOption {
  id: string;
  title: string;
  isDefault?: boolean;
  auto?: boolean;
  group?: string;
  category?: string;
  summary?: string;
  swatches?: string[];
  logoUrl?: string;
}

type HomeMentionTab = 'all' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

interface HomeMentionOption {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  meta: string;
  pluginRecord?: InstalledPluginRecord;
  disabled?: boolean;
  onPick: () => void;
}

interface HomeMentionSection {
  id: Exclude<HomeMentionTab, 'all'>;
  label: string;
  options: HomeMentionOption[];
}

interface SelectedPromptExample {
  label: string;
  promptText: string;
}

const EMPTY_PLUGIN_CONTEXTS: InstalledPluginRecord[] = [];
const EMPTY_MCP_CONTEXTS: McpServerConfig[] = [];
const EMPTY_CONNECTOR_CONTEXTS: ConnectorDetail[] = [];
const EMPTY_INPUT_FIELDS: InputFieldSpec[] = [];
const EMPTY_PLUGIN_INPUT_VALUES: Record<string, unknown> = {};
const EMPTY_INPUT_NAMES: string[] = [];
const EMPTY_DESIGN_SYSTEM_OPTIONS: HomeHeroDesignSystemOption[] = [];
const EMPTY_STAGED_FILES: File[] = [];
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_MCP_OPTIONS: McpServerConfig[] = [];
const EMPTY_CONNECTOR_OPTIONS: ConnectorDetail[] = [];

export const HomeHero = forwardRef<HomeHeroHandle, Props>(function HomeHero(
  {
    prompt,
    onPromptChange,
    onSubmit,
    sessionMode = 'design',
    onSessionModeChange,
    activePluginTitle,
    activePluginRecord = null,
    activeSkillId = null,
    activeSkillTitle = null,
    activeChipId,
    onClearActivePlugin,
    onClearActiveChip = onClearActivePlugin,
    onClearActiveSkill = () => undefined,
    selectedPluginContexts = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyPlugins = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyMcpServers = EMPTY_MCP_OPTIONS,
    contextOnlyConnectors = EMPTY_CONNECTOR_OPTIONS,
    onRemovePluginContext = () => undefined,
    onRemoveMcpContext = () => undefined,
    onRemoveConnectorContext = () => undefined,
    onAddPlugin = () => undefined,
    onAddConnector = () => undefined,
    onAddMcp = () => undefined,
    onOpenPluginDetails = () => undefined,
    pluginInputFields = EMPTY_INPUT_FIELDS,
    pluginInputValues = EMPTY_PLUGIN_INPUT_VALUES,
    onPluginInputValuesChange = () => undefined,
    footerInputNames = EMPTY_INPUT_NAMES,
    designSystemOptions = EMPTY_DESIGN_SYSTEM_OPTIONS,
    stagedFiles = EMPTY_STAGED_FILES,
    onAddFiles = () => undefined,
    onRemoveFile = () => undefined,
    pluginOptions,
    pluginsLoading,
    skillOptions = EMPTY_SKILLS,
    skillsLoading = false,
    mcpOptions = EMPTY_MCP_OPTIONS,
    mcpLoading = false,
    connectorOptions = EMPTY_CONNECTOR_OPTIONS,
    pendingPluginId,
    pendingChipId,
    submitDisabled = false,
    onPickPlugin,
    onPickExamplePlugin = () => undefined,
    onPickSkill = () => undefined,
    onPickMcp = () => undefined,
    onPickConnector = () => undefined,
    onPickChip,
    contextItemCount,
    error,
    showActivePluginChip = true,
    workingDir = null,
    onPickWorkingDir,
    onClearWorkingDir,
    onExamplePromptStatusChange,
    executionSwitcher,
  },
  ref,
) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const [hoveredPlugin, setHoveredPlugin] = useState<InstalledPluginRecord | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Selected second-level sub-category slug (Prototype / Slide deck rail).
  // Local-only: it filters the example-prompt cards below the rail. It never
  // binds a plugin or stamps an active badge.
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedPromptExample, setSelectedPromptExample] = useState<SelectedPromptExample | null>(null);
  const [previewHomeFileKey, setPreviewHomeFileKey] = useState<string | null>(null);
  const [stagedFilePreviewUrls, setStagedFilePreviewUrls] = useState<Map<string, string>>(() => new Map());
  // Lexical-driven @-trigger state (replaces the old end-anchored
  // getContextMention regex) + the caret box the popover anchors to.
  const [mentionTrigger, setMentionTrigger] = useState<{ query: string } | null>(null);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  const editorRef = useRef<LexicalComposerInputHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutsMenuRef = useRef<HTMLDivElement>(null);
  const canSubmit = (prompt.trim().length > 0 || stagedFiles.length > 0) && !submitDisabled;
  const previewHomeFile = useMemo(() => {
    if (!previewHomeFileKey) return null;
    return stagedFiles.find((file, index) => homeFileKey(file, index) === previewHomeFileKey) ?? null;
  }, [previewHomeFileKey, stagedFiles]);
  const previewHomeFileUrl = previewHomeFileKey ? stagedFilePreviewUrls.get(previewHomeFileKey) ?? null : null;
  const placeholder = activePluginTitle || activeSkillTitle
    ? t('homeHero.placeholderActive')
    : t('homeHero.placeholder');
  const mentionActive = Boolean(mentionTrigger);
  const mentionQuery = mentionTrigger?.query ?? '';
  const fileMatches = useMemo(
    () =>
      mentionActive
        ? stagedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => fileMatchesQuery(file, mentionQuery))
            .slice(0, 6)
        : [],
    [mentionActive, mentionQuery, stagedFiles],
  );
  const pluginMatches = useMemo(
    () =>
      mentionActive
        ? pluginOptions.filter((plugin) => pluginMatchesQuery(plugin, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, pluginOptions],
  );
  const skillMatches = useMemo(
    () =>
      mentionActive
        ? skillOptions.filter((skill) => skillMatchesQuery(skill, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, skillOptions],
  );
  const mcpMatches = useMemo(
    () =>
      mentionActive
        ? mcpOptions.filter((server) => mcpServerMatchesQuery(server, mentionQuery)).slice(0, 6)
        : [],
    [mcpOptions, mentionActive, mentionQuery],
  );
  const connectorMatches = useMemo(
    () =>
      mentionActive
        ? connectorOptions.filter((connector) => connectorMatchesQuery(connector, mentionQuery)).slice(0, 6)
        : [],
    [connectorOptions, mentionActive, mentionQuery],
  );
  const pickerOpen = mentionActive;
  const tabs: Array<{ id: HomeMentionTab; label: string; count: number }> = [
    { id: 'all', label: t('common.all'), count: fileMatches.length + pluginMatches.length + skillMatches.length + mcpMatches.length + connectorMatches.length },
    { id: 'files', label: t('chat.mentionTabFiles'), count: fileMatches.length },
    { id: 'plugins', label: t('entry.navPlugins'), count: pluginMatches.length },
    { id: 'skills', label: t('homeHero.skills'), count: skillMatches.length },
    { id: 'mcp', label: 'MCP', count: mcpMatches.length },
    { id: 'connectors', label: 'Connectors', count: connectorMatches.length },
  ];
  const showFiles = mentionTab === 'all' || mentionTab === 'files';
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
  const visibleSections: HomeMentionSection[] = [
    showFiles
      ? {
          id: 'files',
          label: t('chat.mentionSectionFiles'),
          options: fileMatches.map(({ file, index }) => ({
            id: `file-${index}-${file.name}`,
            icon: isImageFile(file) ? 'image' : 'file',
            title: file.name,
            description: file.type || t('chat.mentionTabFiles'),
            meta: formatFileSize(file.size),
            onPick: () => pickFile(file),
          })),
        }
      : null,
    showPlugins
      ? {
          id: 'plugins',
          label: t('entry.navPlugins'),
          options: pluginMatches.map((plugin) => ({
            id: `plugin-${plugin.id}`,
            icon: 'sparkles',
            title: localizePluginTitle(locale, plugin),
            description: localizePluginDescription(locale, plugin) || plugin.id,
            meta: pendingPluginId === plugin.id ? t('homeHero.applying') : getPluginSourceLabel(plugin),
            pluginRecord: plugin,
            disabled: pendingPluginId !== null,
            onPick: () => pickPlugin(plugin),
          })),
        }
      : null,
    showSkills
      ? {
          id: 'skills',
          label: t('homeHero.skills'),
          options: skillMatches.map((skill) => ({
            id: `skill-${skill.id}`,
            icon: skill.id === activeSkillId ? 'check' : 'file',
            title: localizeSkillName(locale, skill),
            description: localizeSkillDescription(locale, skill) || skill.id,
            meta: skill.id === activeSkillId ? t('common.active') : skill.mode,
            onPick: () => pickSkill(skill),
          })),
        }
      : null,
    showMcp
      ? {
          id: 'mcp',
          label: 'MCP',
          options: mcpMatches.map((server) => ({
            id: `mcp-${server.id}`,
            icon: 'link',
            title: server.label || server.id,
            description: server.url || server.command || server.id,
            meta: server.transport,
            onPick: () => pickMcp(server),
          })),
        }
      : null,
    showConnectors
      ? {
          id: 'connectors',
          label: 'Connectors',
          options: connectorMatches.map((connector) => ({
            id: `connector-${connector.id}`,
            icon: 'link',
            title: connector.name,
            description: connector.description || connector.provider || connector.id,
            meta: connector.accountLabel ?? connector.provider,
            onPick: () => pickConnector(connector),
          })),
        }
      : null,
  ].filter((section): section is HomeMentionSection => Boolean(section?.options.length));
  const visiblePickerOptions = visibleSections.flatMap((section) => section.options);
  const visibleLoading =
    (mentionTab === 'all' && (pluginsLoading || skillsLoading || mcpLoading)) ||
    (mentionTab === 'plugins' && pluginsLoading) ||
    (mentionTab === 'skills' && skillsLoading) ||
    (mentionTab === 'mcp' && mcpLoading);
  const promptMentionEntities = useMemo(
    () =>
      buildHomeMentionEntities({
        activePluginRecord,
        activeSkillId,
        activeSkillTitle,
        mcpOptions,
        pluginOptions,
        connectorOptions,
        selectedPluginContexts,
        stagedFiles,
        skillOptions,
      }),
    [
      activePluginRecord,
      activeSkillId,
      activeSkillTitle,
      mcpOptions,
      pluginOptions,
      connectorOptions,
      selectedPluginContexts,
      stagedFiles,
      skillOptions,
    ],
  );
  const fieldByName = useMemo(
    () => new Map(pluginInputFields.map((field) => [field.name, field])),
    [pluginInputFields],
  );
  const footerInputNameSet = useMemo(
    () => new Set(footerInputNames),
    [footerInputNames],
  );
  const footerInputFields = useMemo(
    () => footerInputNames
      .map((name) => fieldByName.get(name))
      .filter((field): field is InputFieldSpec => Boolean(field)),
    [fieldByName, footerInputNames],
  );
  const activeCreateChip = useMemo(
    () => activeChipId
      ? chipsForGroup('create').find((chip) => chip.id === activeChipId) ?? null
      : null,
    [activeChipId],
  );
  const activeExamplePlugins = useMemo(
    () =>
      activeChipId
        ? homeHeroExamplePluginsForChip(activeChipId, pluginOptions, locale)
        : [],
    [activeChipId, locale, pluginOptions],
  );
  // Derive sub-category pills from the SAME list that feeds the preset cards
  // (`activeExamplePlugins`), not the full install set. This guarantees every
  // pill maps to at least one visible card, so selecting it always filters to
  // a non-empty slice — no "looks unfiltered" fallback needed.
  const activeSubChips = useMemo(
    () => subChipsForChip(activeChipId, activeExamplePlugins),
    [activeChipId, activeExamplePlugins],
  );
  // When a sub-category pill is active, narrow the example-prompt cards to that
  // scene. Because the pills are derived from this very list, the slice is
  // always non-empty for a real selection.
  const filteredExamplePlugins = useMemo(() => {
    if (!selectedSubcategory || !isSubChipParent(activeChipId)) return activeExamplePlugins;
    return filterPluginsBySubChip(activeExamplePlugins, activeChipId, selectedSubcategory);
  }, [activeExamplePlugins, activeChipId, selectedSubcategory]);
  const activePromptExamples = useMemo(
    () => activeChipId && activeExamplePlugins.length === 0
      ? homeHeroChipPromptExamples(activeChipId, locale)
      : [],
    [activeChipId, activeExamplePlugins.length, locale],
  );
  const authoringLayoutActive =
    activeChipId === 'create-plugin' || pendingChipId === 'create-plugin';
  const promptMaxHeight = authoringLayoutActive
    ? HOME_HERO_AUTHORING_PROMPT_MAX_HEIGHT
    : HOME_HERO_PROMPT_MAX_HEIGHT;
  const inputCardStyle = {
    '--home-hero-prompt-max-height': `${promptMaxHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    if (selectedIndex >= visiblePickerOptions.length) setSelectedIndex(0);
  }, [selectedIndex, visiblePickerOptions.length]);

  useEffect(() => {
    if (!pickerOpen) setHoveredPlugin(null);
  }, [pickerOpen]);

  useEffect(() => {
    setSelectedPromptExample(null);
    setSelectedSubcategory(null);
  }, [activeChipId]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && shortcutsMenuRef.current?.contains(target)) return;
      setShortcutsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShortcutsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [shortcutsOpen]);

  useEffect(() => {
    const urls = new Map<string, string>();
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      stagedFiles.forEach((file, index) => {
        if (isImageFile(file)) urls.set(homeFileKey(file, index), URL.createObjectURL(file));
      });
    }
    setStagedFilePreviewUrls(urls);
    return () => {
      if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stagedFiles]);

  useEffect(() => {
    if (previewHomeFileKey && !previewHomeFile) setPreviewHomeFileKey(null);
  }, [previewHomeFileKey, previewHomeFile]);

  useEffect(() => {
    if (!previewHomeFileKey) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewHomeFileKey(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewHomeFileKey]);

  useImperativeHandle(
    ref,
    (): HomeHeroHandle => ({
      focus() {
        editorRef.current?.focus();
      },
      focusEnd() {
        editorRef.current?.focus();
      },
    }),
    [],
  );

  // Insert an atomic @mention pill at the active trigger and return the
  // editor's new serialized text. The pill replaces the in-flight `@query`
  // (Lexical's insertMention handles the range), so callers can forward the
  // resulting text to the host pick handler without computing offsets.
  function insertHomeMention(token: string, entity: InlineMentionEntity): string {
    editorRef.current?.insertMention({ token, entity });
    return editorRef.current?.getText() ?? prompt;
  }

  function pickPlugin(record: InstalledPluginRecord) {
    const token = pluginMentionText(record);
    const next = insertHomeMention(token, {
      id: record.id,
      kind: 'plugin',
      label: record.title,
      token,
    });
    onPickPlugin(record, next);
  }

  function pickFile(file: File) {
    const token = inlineMentionToken(file.name);
    insertHomeMention(token, { id: file.name, kind: 'file', label: file.name, token });
    setSelectedIndex(0);
    // The file is already staged; the editor's onChange has updated the
    // prompt text, so there is nothing else to forward to the host.
  }

  function pickSkill(skill: SkillSummary) {
    const token = inlineMentionToken(skill.name);
    const next = insertHomeMention(token, {
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token,
    });
    onPickSkill(skill, next);
  }

  function pickMcp(server: McpServerConfig) {
    const label = server.label || server.id;
    const token = inlineMentionToken(label);
    const next = insertHomeMention(token, { id: server.id, kind: 'mcp', label, token });
    onPickMcp(server, next);
  }

  function pickConnector(connector: ConnectorDetail) {
    const token = inlineMentionToken(connector.name);
    const next = insertHomeMention(token, {
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token,
    });
    onPickConnector(connector, next);
  }

  // Lexical reports the active @-trigger derived from the caret. HomeHero
  // has no slash surface, so only the mention branch is wired.
  function handleTrigger({
    mention: nextMention,
    anchorRect,
  }: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  }) {
    setCaretRect(anchorRect);
    if (nextMention) {
      setMentionTrigger((prev) => {
        if (!prev || prev.query !== nextMention.q) setSelectedIndex(0);
        return { query: nextMention.q };
      });
    } else {
      setMentionTrigger(null);
      setMentionTab('all');
    }
  }

  function dismissMentionPicker() {
    setMentionTrigger(null);
    setMentionTab('all');
    setHoveredPlugin(null);
    setSelectedIndex(0);
  }

  // Routes popover navigation keys from the Lexical editor over the visible
  // picker option union. Returns true when consumed so the editor can
  // preventDefault.
  function handlePopoverKey(
    key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
  ): boolean {
    if (!mentionActive) return false;
    if (key === 'Escape') {
      setMentionTrigger(null);
      return true;
    }
    if (visiblePickerOptions.length === 0) return false;
    if (key === 'ArrowDown') {
      setSelectedIndex((idx) => (idx + 1) % visiblePickerOptions.length);
      return true;
    }
    if (key === 'ArrowUp') {
      setSelectedIndex(
        (idx) => (idx - 1 + visiblePickerOptions.length) % visiblePickerOptions.length,
      );
      return true;
    }
    if (key === 'Tab' || key === 'Enter') {
      const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
      if (selected && !selected.disabled) selected.onPick();
      return true;
    }
    return false;
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    onAddFiles(files);
  }

  function removeFileChip(index: number, file: File) {
    const nextPrompt = stripHomeMentionToken(prompt, file.name);
    if (nextPrompt !== prompt) onPromptChange(nextPrompt);
    onRemoveFile(index);
  }

  function usePromptExample(example: string) {
    setSelectedPromptExample({
      label: promptExampleChipLabel(example),
      promptText: example,
    });
    onExamplePromptStatusChange?.({
      title: promptExampleChipLabel(example),
      artifactType: activeChipId ?? 'prototype',
      brief: briefForChipId(activeChipId ?? 'prototype'),
    });
    onPromptChange(example);
    editorRef.current?.setText(example);
    setSelectedIndex(0);
    requestAnimationFrame(() => editorRef.current?.focus());
  }

  function pickExamplePluginPreset(record: InstalledPluginRecord, chipId: string, promptText: string) {
    setSelectedPromptExample({
      label: record.title,
      promptText,
    });
    onExamplePromptStatusChange?.({
      title: record.title,
      artifactType: chipId,
      brief: briefForPluginPreset(record, chipId),
    });
    onPickExamplePlugin(record, chipId, promptText);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    setDragActive(false);
    handleFiles(files);
  }

  function openActivePluginDetails() {
    if (activePluginRecord) onOpenPluginDetails(activePluginRecord);
  }

  // plugin/MCP/connector contexts now render as inline @mention pills in the
  // composer, so they no longer drive this top row — only staged files (which
  // have no inline representation) and the active plugin/skill/example chips do.
  const showActiveContextRow =
    contextItemCount > 0 ||
    (showActivePluginChip && activePluginTitle) ||
    activeSkillTitle ||
    stagedFiles.length > 0;

  let optionRenderIndex = 0;

  return (
    <section className="home-hero" data-testid="home-hero">
      <div className="home-hero__brand" aria-hidden>
        <span className="home-hero__brand-mark">
          <img src="/app-icon.svg" alt="" draggable={false} />
        </span>
        <span className="home-hero__brand-name">Open Design</span>
      </div>
      <h1 className="home-hero__title">{t('homeHero.title')}</h1>
      <p className="home-hero__subtitle">
        {t('homeHero.subtitlePrefix')}
      </p>

      <div
        className={`home-hero__input-card${
          authoringLayoutActive ? ' home-hero__input-card--compact-authoring' : ''
        }${dragActive ? ' is-drag-active' : ''}`}
        style={inputCardStyle}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes('Files')) setDragActive(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        {showActiveContextRow ? (
          <div
            className="home-hero__active"
            aria-label={
              contextItemCount > 0
                ? t('homeHero.contextItemsResolved', { n: contextItemCount })
                : undefined
            }
          >
            {stagedFiles.length > 0 ? (
              <span className="home-hero__active-file-group" data-testid="home-hero-staged-files">
                {stagedFiles.map((file, index) => {
                  const key = homeFileKey(file, index);
                  const previewUrl = stagedFilePreviewUrls.get(key) ?? null;
                  const fileBody = (
                    <>
                      {previewUrl ? (
                        <img
                          className="home-hero__active-thumb"
                          src={previewUrl}
                          alt=""
                          aria-hidden
                          draggable={false}
                        />
                      ) : (
                        <span className="home-hero__active-icon" aria-hidden>
                          <Icon name={isImageFile(file) ? 'image' : 'file'} size={12} />
                        </span>
                      )}
                      <span className="home-hero__active-label">{file.name}</span>
                      <span className="home-hero__active-meta">{formatFileSize(file.size)}</span>
                    </>
                  );
                  return (
                    <span
                      key={key}
                      className="home-hero__active-chip home-hero__active-chip--context home-hero__active-chip--file"
                      title={`${file.name} · ${formatFileSize(file.size)}`}
                    >
                      {previewUrl ? (
                        <button
                          type="button"
                          className="home-hero__active-chip-body home-hero__active-file-body"
                          onClick={() => setPreviewHomeFileKey(key)}
                          aria-label={`Preview ${file.name}`}
                        >
                          {fileBody}
                        </button>
                      ) : (
                        <span className="home-hero__active-file-body">
                          {fileBody}
                        </span>
                      )}
                      <button
                        type="button"
                        className="home-hero__active-clear od-tooltip"
                        onClick={() => removeFileChip(index, file)}
                        aria-label={t('chat.removeAria', { name: file.name })}
                        title={t('homeHero.removeFile')}
                        data-tooltip={t('homeHero.removeFile')}
                      >
                        <Icon name="close" size={9} />
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : null}
            {showActivePluginChip && activePluginTitle ? (
              <span className="home-hero__active-chip" data-testid="home-hero-active-plugin">
                <button
                  type="button"
                  className="home-hero__active-chip-body"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    openActivePluginDetails();
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openActivePluginDetails();
                  }}
                  onClick={openActivePluginDetails}
                  disabled={!activePluginRecord}
                  title={activePluginRecord ? t('homeHero.pluginTitle', { title: activePluginRecord.title }) : undefined}
                >
                  <span className="home-hero__active-icon" aria-hidden>
                    <Icon name="sliders" size={12} />
                  </span>
                  <span className="home-hero__active-label">{activePluginTitle}</span>
                </button>
                {activeCreateChip ? null : (
                  <button
                    type="button"
                    className="home-hero__active-clear od-tooltip"
                    onClick={onClearActivePlugin}
                    aria-label={t('homeHero.clearActivePlugin')}
                    title={t('homeHero.clearActivePlugin')}
                    data-tooltip={t('homeHero.clearActivePlugin')}
                  >
                    <Icon name="close" size={9} />
                  </button>
                )}
              </span>
            ) : null}
            {activeSkillTitle ? (
              <span
                className="home-hero__active-chip home-hero__active-chip--skill"
                data-testid="home-hero-active-skill"
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="sparkles" size={12} />
                </span>
                <span className="home-hero__active-label">{t('homeHero.skillPrefix', { title: activeSkillTitle })}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={onClearActiveSkill}
                  aria-label={t('homeHero.clearActiveSkill')}
                  title={t('homeHero.clearActiveSkill')}
                  data-tooltip={t('homeHero.clearActiveSkill')}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ) : null}
            {contextOnlyPlugins.map((plugin) => (
              <span
                key={`ctx-plugin-${plugin.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-plugin-${plugin.id}`}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="sliders" size={12} />
                </span>
                <span className="home-hero__active-label">{plugin.title}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => onRemovePluginContext(plugin.id)}
                  aria-label={t('chat.removeAria', { name: plugin.title })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${plugin.id}`}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ))}
            {contextOnlyMcpServers.map((server) => {
              const label = server.label || server.id;
              return (
                <span
                  key={`ctx-mcp-${server.id}`}
                  className="home-hero__active-chip home-hero__active-chip--context"
                  data-testid={`home-hero-context-mcp-${server.id}`}
                >
                  <span className="home-hero__active-icon" aria-hidden>
                    <Icon name="sliders" size={12} />
                  </span>
                  <span className="home-hero__active-label">{label}</span>
                  <button
                    type="button"
                    className="home-hero__active-clear od-tooltip"
                    onClick={() => onRemoveMcpContext(server.id)}
                    aria-label={t('chat.removeAria', { name: label })}
                    title={t('common.close')}
                    data-tooltip={t('common.close')}
                    data-testid={`home-hero-context-clear-${server.id}`}
                  >
                    <Icon name="close" size={9} />
                  </button>
                </span>
              );
            })}
            {contextOnlyConnectors.map((connector) => (
              <span
                key={`ctx-connector-${connector.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-connector-${connector.id}`}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="link" size={12} />
                </span>
                <span className="home-hero__active-label">{connector.name}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => onRemoveConnectorContext(connector.id)}
                  aria-label={t('chat.removeAria', { name: connector.name })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${connector.id}`}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="home-hero__prompt-surface">
          <div className="home-hero__prompt-editor home-hero__lexical">
            <LexicalComposerInput
              ref={editorRef}
              testId="home-hero-input"
              draft={prompt}
              placeholder={placeholder}
              title={placeholder}
              knownEntities={promptMentionEntities}
              onChange={(plainText) => {
                // A programmatic seed (host setPrompt → draft prop →
                // SeedingPlugin) echoes back through Lexical's onChange. The
                // old <textarea> never fired onChange for a controlled-value
                // change, so skip the echo here: otherwise seeding would run
                // the host's handlePromptChange — flipping promptEditedByUser
                // (spurious "replace prompt?" dialogs) and re-extracting plugin
                // inputs from the seeded text. Real user edits always differ
                // from the current prompt.
                if (plainText === prompt) return;
                onPromptChange(plainText);
                if (selectedPromptExample && plainText !== selectedPromptExample.promptText) {
                  setSelectedPromptExample(null);
                  onExamplePromptStatusChange?.(null);
                }
              }}
              onTrigger={handleTrigger}
              onEnterSend={() => {
                if (canSubmit) onSubmit();
              }}
              onPasteFiles={handleFiles}
              popoverOpen={pickerOpen && visiblePickerOptions.length > 0}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: pickerOpen,
                activeId: pickerOpen ? `home-hero-option-${selectedIndex}` : null,
              }}
            />
          </div>
        </div>
        <CaretFloatingLayer caret={caretRect} open={pickerOpen}>
          <div
            id="home-hero-context-picker"
            className="home-hero__plugin-picker home-hero__plugin-picker--floating"
            role="listbox"
            aria-label={t('homeHero.contextSearchResults')}
            data-testid="home-hero-plugin-picker"
          >
            <div className="home-hero__mention-tabs" role="tablist" aria-label={t('homeHero.contextSurfaces')}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mentionTab === item.id}
                  className={`home-hero__mention-tab${mentionTab === item.id ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setMentionTab(item.id);
                    setSelectedIndex(0);
                  }}
                >
                  <span>{item.label}</span>
                  {item.count > 0 ? <span>{item.count}</span> : null}
                </button>
              ))}
            </div>
            {visibleLoading && visiblePickerOptions.length === 0 ? (
              <div className="home-hero__plugin-picker-empty">{t('homeHero.loadingContext')}</div>
            ) : null}
            {!visibleLoading && visiblePickerOptions.length === 0 ? (
              <div className="home-hero__plugin-picker-empty">
                {mentionQuery ? (
                  <>{t('homeHero.noResults', { query: mentionQuery })}</>
                ) : (
                  <>{t('homeHero.searchPrompt')}</>
                )}
              </div>
            ) : null}
            {visibleSections.map((section) => (
              <div key={section.id} className="home-hero__mention-section">
                <div className="home-hero__mention-section-label">{section.label}</div>
                {section.options.map((item) => {
                  const optionIndex = optionRenderIndex;
                  optionRenderIndex += 1;
                  return (
                    <button
                      key={item.id}
                      id={`home-hero-option-${optionIndex}`}
                      type="button"
                      role="option"
                      aria-selected={optionIndex === selectedIndex}
                      className={`home-hero__plugin-option${
                        optionIndex === selectedIndex ? ' is-active' : ''
                      }`}
                      onMouseEnter={() => {
                        setSelectedIndex(optionIndex);
                        setHoveredPlugin(item.pluginRecord ?? null);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (!item.disabled) item.onPick();
                      }}
                      disabled={item.disabled}
                    >
                      <span className="home-hero__plugin-option-icon" aria-hidden>
                        <Icon name={item.icon} size={13} />
                      </span>
                      <span className="home-hero__plugin-option-main">
                        <span>{item.title}</span>
                        <span>{item.description}</span>
                      </span>
                      <span className="home-hero__plugin-option-meta">
                        {item.meta}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {hoveredPlugin ? (
              <div
                className="home-hero__plugin-hover-card"
                data-testid="home-hero-plugin-hover-card"
              >
                <div>
                  <span className="home-hero__plugin-hover-kicker">
                    {getPluginSourceLabel(hoveredPlugin)}
                  </span>
                  <strong>{localizePluginTitle(locale, hoveredPlugin)}</strong>
                  <p>{localizePluginDescription(locale, hoveredPlugin) || hoveredPlugin.id}</p>
                </div>
                <div className="home-hero__plugin-hover-meta">
                  <span>{t('homeHero.parameters', { n: (hoveredPlugin.manifest?.od?.inputs ?? []).length })}</span>
                  {getPluginQueryPreview(hoveredPlugin) ? (
                    <span>{getPluginQueryPreview(hoveredPlugin)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    dismissMentionPicker();
                    onOpenPluginDetails(hoveredPlugin);
                  }}
                >
                  {t('homeHero.details')}
                </button>
              </div>
            ) : null}
          </div>
        </CaretFloatingLayer>
        <div className="home-hero__input-foot">
          <input
            ref={fileInputRef}
            data-testid="home-hero-file-input"
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              handleFiles(files);
              event.target.value = '';
            }}
          />
          <div className="home-hero__foot-left">
            <ComposerPlusMenu
              triggerTestId="home-hero-plus-trigger"
              connectors={connectorOptions}
              onPickConnector={pickConnector}
              onAddConnector={onAddConnector}
              plugins={pluginOptions}
              onPickPlugin={pickPlugin}
              onAddPlugin={onAddPlugin}
              mcpServers={mcpOptions}
              onPickMcp={pickMcp}
              onAddMcp={onAddMcp}
              onAttachFiles={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
            />
            {onPickWorkingDir ? (
              <div className="home-hero__working-dir-wrap">
                <button
                  type="button"
                  className={`home-hero__working-dir${workingDir ? ' picked' : ''}`}
                  onClick={onPickWorkingDir}
                  title={workingDir ?? t('workingDirPicker.select')}
                >
                  <Icon name="folder" size={13} />
                  <span>
                    {workingDir ? workingDir.split(/[/\\]/).filter(Boolean).pop() : t('workingDirPicker.select')}
                  </span>
                </button>
                {workingDir ? (
                  <button
                    type="button"
                    className="home-hero__working-dir-clear"
                    onClick={() => onClearWorkingDir?.()}
                    aria-label={t('workingDirPicker.clearAria')}
                  >
                    <Icon name="close" size={10} />
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeCreateChip ? (
              <ActiveTypeChip chip={activeCreateChip} onClear={onClearActiveChip} />
            ) : null}
            {footerInputFields.length > 0 ? (
              <div className="home-hero__footer-options" data-testid="home-hero-footer-options">
                {footerInputFields.map((field) => (
                  <FooterInputOption
                    key={field.name}
                    field={field}
                    value={pluginInputValues[field.name]}
                    designSystemOptions={designSystemOptions}
                    onChange={(value) => {
                      onPluginInputValuesChange({
                        ...pluginInputValues,
                        [field.name]: value,
                      });
                    }}
                    t={t}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="home-hero__foot-right">
            <SessionModeToggle
              mode={sessionMode}
              onChange={onSessionModeChange}
              disabled={Boolean(submitDisabled)}
            />
            {executionSwitcher ? (
              <div className="home-hero__execution-switcher">
                {executionSwitcher}
              </div>
            ) : null}
            <button
              type="button"
              className="home-hero__submit od-tooltip"
              data-testid="home-hero-submit"
              onClick={onSubmit}
              disabled={!canSubmit}
              title={canSubmit ? t('homeHero.run') : t('homeHero.typeSomethingToRun')}
              data-tooltip={canSubmit ? t('homeHero.run') : t('homeHero.typeSomethingToRun')}
              aria-label={t('homeHero.run')}
            >
              <Icon name="send" size={13} />
              <span>{t('chat.send')}</span>
            </button>
          </div>
        </div>
      </div>

      {activeCreateChip ? null : (
        <RailGroup
          group="create"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
          variant="tabs"
        >
          <ShortcutsMenu
            activeChipId={activeChipId}
            pendingChipId={pendingChipId}
            pendingPluginId={pendingPluginId}
            pluginsLoading={pluginsLoading}
            open={shortcutsOpen}
            refNode={shortcutsMenuRef}
            onOpenChange={setShortcutsOpen}
            onPickChip={(chip) => {
              setShortcutsOpen(false);
              onPickChip(chip);
            }}
          />
        </RailGroup>
      )}

      {activeSubChips.length > 0 && isSubChipParent(activeChipId) ? (
        <SubTypeRow
          subChips={activeSubChips}
          selectedSlug={selectedSubcategory}
          pluginsLoading={pluginsLoading}
          onPickSubChip={(sub) =>
            setSelectedSubcategory((current) => (current === sub.slug ? null : sub.slug))
          }
          onSelectAll={() => setSelectedSubcategory(null)}
        />
      ) : null}

      {filteredExamplePlugins.length > 0 && activeChipId ? (
        <PluginPromptPresets
          chipId={activeChipId}
          plugins={filteredExamplePlugins}
          activePluginId={activePluginRecord?.id ?? null}
          pendingPluginId={pendingPluginId}
          locale={locale}
          onPick={pickExamplePluginPreset}
        />
      ) : activePromptExamples.length > 0 ? (
        <div
          className="home-hero__prompt-examples"
          data-testid="home-hero-prompt-examples"
        >
          <div className="home-hero__prompt-examples-title">
            {t('homeHero.promptExamples')}
          </div>
          <div className="home-hero__prompt-examples-grid">
            {activePromptExamples.map((example) => (
              <button
                key={example}
                type="button"
                className="home-hero__prompt-example"
                data-testid="home-hero-prompt-example"
                onClick={() => usePromptExample(example)}
              >
                <span>{example}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="home-hero__error">
          {error}
        </div>
      ) : null}
      {previewHomeFile && previewHomeFileUrl ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={previewHomeFile.name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewHomeFileKey(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={previewHomeFile.name}>{previewHomeFile.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setPreviewHomeFileKey(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={previewHomeFileUrl} alt={previewHomeFile.name} />
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
});

function PluginPromptPresets({
  activePluginId,
  chipId,
  locale,
  onPick,
  pendingPluginId,
  plugins,
}: {
  activePluginId: string | null;
  chipId: string;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  pendingPluginId: string | null;
  plugins: InstalledPluginRecord[];
}) {
  const { t } = useI18n();
  return (
    <div
      className="home-hero__prompt-examples home-hero__plugin-presets-wrap"
      data-testid="home-hero-plugin-presets"
    >
      <div className="home-hero__prompt-examples-title">
        {t('homeHero.promptExamples')}
      </div>
      <div className="home-hero__plugin-presets" role="list">
        {plugins.map((record) => (
          <PluginPromptPresetCard
            key={record.id}
            chipId={chipId}
            locale={locale}
            record={record}
            active={activePluginId === record.id}
            pending={pendingPluginId === record.id}
            disabled={pendingPluginId !== null}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function PluginPromptPresetCard({
  active,
  chipId,
  disabled,
  locale,
  onPick,
  pending,
  record,
}: {
  active: boolean;
  chipId: string;
  disabled: boolean;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  pending: boolean;
  record: InstalledPluginRecord;
}) {
  const preview = useMemo(() => inferPluginPreview(record), [record]);
  const promptPreview = pluginPresetPromptPreview(record, locale, chipId);
  return (
    <button
      type="button"
      className={`home-hero__plugin-preset${active ? ' is-active' : ''}${pending ? ' is-pending' : ''}`}
      data-testid="home-hero-plugin-preset"
      data-plugin-id={record.id}
      role="listitem"
      disabled={disabled}
      onClick={() => onPick(record, chipId, promptPreview)}
    >
      <span className="home-hero__plugin-preset-preview" aria-hidden>
        <PreviewSurface
          pluginId={record.id}
          pluginTitle={localizePluginTitle(locale, record)}
          preview={preview}
        />
        {active ? (
          <span className="home-hero__plugin-preset-check" aria-hidden>
            <Icon name="check" size={12} />
          </span>
        ) : null}
      </span>
      <span className="home-hero__plugin-preset-title">
        {localizePluginTitle(locale, record)}
      </span>
    </button>
  );
}

function promptExampleChipLabel(example: string): string {
  const normalized = example.replace(/\s+/g, ' ').trim();
  const [beforeDash] = normalized.split(/\s[—-]\s/u, 1);
  const candidate = beforeDash?.trim() || normalized;
  return candidate.length > 64 ? `${candidate.slice(0, 61).trimEnd()}...` : candidate;
}

function homeFileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${bytes} B`;
}

const HOME_HERO_PROMPT_MAX_HEIGHT = 180;
const HOME_HERO_AUTHORING_PROMPT_MAX_HEIGHT = 132;
// `{{name}}` plugin-input placeholder — still used when rendering plugin
// preset query previews (renderPluginPresetQuery).
const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

function pluginMentionText(record: InstalledPluginRecord): string {
  return inlineMentionToken(record.title);
}

function buildHomeMentionEntities({
  activePluginRecord,
  activeSkillId,
  activeSkillTitle,
  connectorOptions,
  mcpOptions,
  pluginOptions,
  selectedPluginContexts,
  stagedFiles,
  skillOptions,
}: {
  activePluginRecord: InstalledPluginRecord | null;
  activeSkillId: string | null;
  activeSkillTitle: string | null;
  connectorOptions: ConnectorDetail[];
  mcpOptions: McpServerConfig[];
  pluginOptions: InstalledPluginRecord[];
  selectedPluginContexts: InstalledPluginRecord[];
  stagedFiles: File[];
  skillOptions: SkillSummary[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  const fileSeen = new Set<string>();
  for (const file of stagedFiles) {
    if (fileSeen.has(file.name)) continue;
    fileSeen.add(file.name);
    entities.push({
      id: file.name,
      kind: 'file',
      label: file.name,
      token: inlineMentionToken(file.name),
      title: `File: ${file.name}`,
    });
  }
  const pluginSeen = new Set<string>();
  for (const plugin of [...selectedPluginContexts, ...pluginOptions]) {
    if (pluginSeen.has(plugin.id)) continue;
    pluginSeen.add(plugin.id);
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: pluginMentionText(plugin),
      title: `Plugin: ${plugin.title}`,
    });
  }
  if (activePluginRecord && !pluginSeen.has(activePluginRecord.id)) {
    entities.push({
      id: activePluginRecord.id,
      kind: 'plugin',
      label: activePluginRecord.title,
      token: pluginMentionText(activePluginRecord),
      title: `Plugin: ${activePluginRecord.title}`,
    });
  }
  const skillSeen = new Set<string>();
  for (const skill of skillOptions) {
    if (skillSeen.has(skill.id)) continue;
    skillSeen.add(skill.id);
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  if (activeSkillId && activeSkillTitle && !skillSeen.has(activeSkillId)) {
    entities.push({
      id: activeSkillId,
      kind: 'skill',
      label: activeSkillTitle,
      token: inlineMentionToken(activeSkillTitle),
      title: `Skill: ${activeSkillTitle}`,
    });
  }
  for (const server of mcpOptions) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectorOptions) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  return entities;
}

function FooterInputOption({
  field,
  value,
  designSystemOptions,
  onChange,
  t,
}: {
  field: InputFieldSpec;
  value: unknown;
  designSystemOptions: HomeHeroDesignSystemOption[];
  onChange: (value: unknown) => void;
  t: ReturnType<typeof useT>;
}) {
  const label = footerInputLabel(field, t);
  if (field.name === 'speakerNotes') {
    const checked = footerSpeakerNotesEnabled(value);
    return (
      <button
        type="button"
        className={`home-hero__footer-switch${checked ? ' is-on' : ''}`}
        aria-label={label}
        aria-pressed={checked}
        data-testid="home-hero-footer-option-speakerNotes"
        onClick={() => onChange(checked ? 'no speaker notes' : 'include speaker notes')}
      >
        <span>{t('homeHero.footer.speakerNotes')}</span>
        <i aria-hidden />
      </button>
    );
  }
  if (field.name === 'designSystem' && designSystemOptions.length > 0) {
    const selectedValue = value === undefined || value === null ? '' : String(value);
    const selectedOption = selectedValue.length > 0
      ? designSystemOptions.find((option) => option.title === selectedValue || option.id === selectedValue)
      : undefined;
    const currentValue = selectedOption?.id ?? designSystemOptions[0]?.id ?? '';
    return (
      <FooterSelectOption
        fieldName={field.name}
        label={label}
        value={currentValue}
        options={designSystemOptions.map((option) => ({
          value: option.id,
          submitValue: option.title,
          label: option.isDefault ? `${option.title} (${t('ds.badgeDefault')})` : option.title,
          group: option.group,
          icon: option.auto ? 'sparkles' : undefined,
          description: option.summary,
          meta: option.category,
          preview: option.auto
            ? undefined
            : {
                title: option.title,
                swatches: option.swatches,
                logoUrl: option.logoUrl,
              },
        }))}
        searchable
        searchPlaceholder={t('ds.searchPlaceholder')}
        onChange={onChange}
      />
    );
  }
  if (field.type === 'select' && Array.isArray(field.options)) {
    return (
      <FooterSelectOption
        fieldName={field.name}
        label={label}
        value={value === undefined || value === null ? '' : String(value)}
        options={[
          ...(field.placeholder ? [{ value: '', label: field.placeholder }] : []),
          ...field.options.map((option) => ({
            value: option,
            label: footerInputValueLabel(field, option, t),
            icon: footerInputValueIcon(field, option),
            modelIcon: field.name === 'model' ? modelOptionIcon(option, footerInputValueLabel(field, option, t)) : undefined,
            ratioIcon: field.name === 'ratio' ? ratioOptionIcon(option) : undefined,
          })),
        ]}
        onChange={onChange}
      />
    );
  }
  return (
    <label className="home-hero__footer-option home-hero__footer-option--text" data-field-name={field.name}>
      <span>{label}</span>
      <input
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder ?? ''}
        aria-label={label}
        data-testid={`home-hero-footer-option-${field.name}`}
      />
    </label>
  );
}

function FooterSelectOption({
  fieldName,
  label,
  value,
  options,
  searchable = false,
  searchPlaceholder,
  onChange,
}: {
  fieldName: string;
  label: string;
  value: string;
  options: FooterSelectItemOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  onChange: (value: unknown) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const visibleOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => (
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query) ||
      (option.description ?? '').toLowerCase().includes(query) ||
      (option.meta ?? '').toLowerCase().includes(query) ||
      (option.group ?? '').toLowerCase().includes(query)
    ));
  }, [options, search]);
  const groupedOptions = useMemo(() => {
    const groups: { label: string | null; options: FooterSelectItemOption[] }[] = [];
    for (const option of visibleOptions) {
      const groupLabel = option.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.label === groupLabel) {
        last.options.push(option);
      } else {
        groups.push({ label: groupLabel, options: [option] });
      }
    }
    return groups;
  }, [visibleOptions]);
  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <div
      ref={ref}
      className={`home-hero__footer-option home-hero__footer-option--select${open ? ' is-open' : ''}`}
      data-field-name={fieldName}
    >
      <span>{label}</span>
      <button
        type="button"
        className="home-hero__footer-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`home-hero-footer-option-${fieldName}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {selected?.preview ? <DesignSystemOptionPreview option={selected.preview} compact /> : null}
        {selected?.icon ? <FooterOptionIcon name={selected.icon} compact /> : null}
        {selected?.modelIcon ? <ModelOptionIcon icon={selected.modelIcon} compact /> : null}
        {selected?.ratioIcon ? <RatioOptionIcon icon={selected.ratioIcon} compact /> : null}
        <span className="home-hero__footer-select-label">{selected?.label ?? value}</span>
        <Icon name="chevron-down" size={12} aria-hidden />
      </button>
      {open ? (
        <div
          className={`home-hero__footer-select-menu${searchable ? ' home-hero__footer-select-menu--searchable' : ''}`}
          role="listbox"
          data-testid={`home-hero-footer-option-${fieldName}-menu`}
        >
          {searchable ? (
            <div className="home-hero__footer-select-search">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder ?? label}
                autoFocus
                data-testid={`home-hero-footer-option-${fieldName}-search`}
              />
              <div className="home-hero__footer-select-count">
                {t('homeHero.footer.availableCount', { n: visibleOptions.length })}
              </div>
            </div>
          ) : null}
          {groupedOptions.length === 0 ? (
            <div className="home-hero__footer-select-empty">{t('homeHero.footer.noMatches')}</div>
          ) : (
            groupedOptions.map((group, index) => (
              <div
                className="home-hero__footer-select-group"
                key={`${group.label ?? 'ungrouped'}:${index}`}
              >
                {group.label ? (
                  <div className="home-hero__footer-select-group-label">{group.label}</div>
                ) : null}
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={`home-hero__footer-select-item${option.value === value ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(option.submitValue ?? option.value);
                      setOpen(false);
                    }}
                  >
                    {option.preview ? <DesignSystemOptionPreview option={option.preview} /> : null}
                    {option.icon ? <FooterOptionIcon name={option.icon} /> : null}
                    {option.modelIcon ? <ModelOptionIcon icon={option.modelIcon} /> : null}
                    {option.ratioIcon ? <RatioOptionIcon icon={option.ratioIcon} /> : null}
                    <span className="home-hero__footer-select-copy">
                      <span className="home-hero__footer-select-label">{option.label}</span>
                      {option.description ? (
                        <span className="home-hero__footer-select-description">{option.description}</span>
                      ) : null}
                    </span>
                    {option.meta ? <span className="home-hero__footer-select-meta">{option.meta}</span> : null}
                    {option.value === value ? <Icon name="check" size={14} aria-hidden /> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

interface FooterSelectItemOption {
  value: string;
  submitValue?: string;
  label: string;
  group?: string;
  icon?: IconName;
  description?: string;
  meta?: string;
  modelIcon?: ModelOptionIconSpec;
  ratioIcon?: RatioOptionIconSpec;
  preview?: {
    title: string;
    swatches?: string[];
    logoUrl?: string;
  };
}

interface ModelOptionIconSpec {
  label: string;
  tone:
    | 'openai'
    | 'dalle'
    | 'seed'
    | 'sense'
    | 'grok'
    | 'google'
    | 'router'
    | 'flux'
    | 'elevenlabs'
    | 'fishaudio'
    | 'minimax'
    | 'suno'
    | 'audio'
    | 'custom';
  src?: string;
}

interface RatioOptionIconSpec {
  width: number;
  height: number;
  tone: 'square' | 'wide' | 'tall' | 'standard' | 'portrait' | 'custom';
}

function FooterOptionIcon({
  name,
  compact = false,
}: {
  name: IconName;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__footer-option-icon${compact ? ' home-hero__footer-option-icon--compact' : ''}`}
      aria-hidden
    >
      <Icon name={name} size={13} />
    </span>
  );
}

function ModelOptionIcon({
  icon,
  compact = false,
}: {
  icon: ModelOptionIconSpec;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__model-option-icon home-hero__model-option-icon--${icon.tone}${compact ? ' home-hero__model-option-icon--compact' : ''}`}
      aria-hidden
    >
      {icon.src ? <img src={icon.src} alt="" draggable={false} /> : icon.label}
    </span>
  );
}

function RatioOptionIcon({
  icon,
  compact = false,
}: {
  icon: RatioOptionIconSpec;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__ratio-option-icon home-hero__ratio-option-icon--${icon.tone}${compact ? ' home-hero__ratio-option-icon--compact' : ''}`}
      aria-hidden
    >
      <i style={{ width: icon.width, height: icon.height }} />
    </span>
  );
}

function DesignSystemOptionPreview({
  option,
  compact = false,
}: {
  option: { title: string; swatches?: string[]; logoUrl?: string };
  compact?: boolean;
}) {
  const swatches = (option.swatches ?? []).filter(Boolean).slice(0, compact ? 2 : 3);
  const initial = option.title.trim().charAt(0).toUpperCase() || 'D';
  return (
    <span
      className={`home-hero__ds-option-preview${compact ? ' home-hero__ds-option-preview--compact' : ''}`}
      aria-hidden
    >
      {option.logoUrl ? (
        <img src={option.logoUrl} alt="" loading="lazy" />
      ) : swatches.length > 0 ? (
        swatches.map((swatch, index) => (
          <i key={`${swatch}-${index}`} style={{ background: swatch }} />
        ))
      ) : (
        <b>{initial}</b>
      )}
    </span>
  );
}

function footerInputLabel(field: InputFieldSpec, t: ReturnType<typeof useT>): string {
  switch (field.name) {
    case 'designSystem':
      return t('homeHero.footer.designSystem');
    case 'fidelity':
      return t('newproj.fidelityLabel');
    case 'speakerNotes':
      return t('homeHero.footer.speakerNotes');
    case 'model':
      return t('newproj.modelLabel');
    case 'ratio':
      return t('homeHero.footer.ratio');
    case 'duration':
      return t('homeHero.footer.duration');
    case 'resolution':
      return t('homeHero.footer.resolution');
    default:
      return field.label ?? field.name;
  }
}

function footerInputValueLabel(field: InputFieldSpec, value: string, t: ReturnType<typeof useT>): string {
  if (field.name === 'fidelity') {
    if (value === 'wireframe') return t('newproj.fidelityWireframe');
    if (value === 'high-fidelity') return t('newproj.fidelityHigh');
  }
  if (field.name === 'speakerNotes') {
    return footerSpeakerNotesEnabled(value) ? t('homeHero.footer.speakerNotes') : t('homeHero.footer.noSpeakerNotes');
  }
  return optionLabelMap(field)[value] ?? value;
}

function footerSpeakerNotesEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return !(
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'none' ||
    normalized.includes('no speaker')
  );
}

function footerInputValueIcon(field: InputFieldSpec, value: string): IconName | undefined {
  if (field.name === 'fidelity') {
    if (value === 'wireframe') return 'grid';
    if (value === 'high-fidelity') return 'sparkles';
  }
  return undefined;
}

function modelOptionIcon(value: string, label: string): ModelOptionIconSpec {
  const normalized = `${value} ${label}`.toLowerCase();
  if (normalized.includes('dall-e')) return { label: 'OpenAI', tone: 'dalle', src: '/model-icons/openai.svg' };
  if (normalized.includes('gpt-image') || normalized.includes('openai') || normalized.includes('sora')) {
    return { label: 'OpenAI', tone: 'openai', src: '/model-icons/openai.svg' };
  }
  if (normalized.includes('seedream') || normalized.includes('seededit') || normalized.includes('seedance') || normalized.includes('doubao') || normalized.includes('bytedance')) {
    return { label: 'ByteDance', tone: 'seed', src: '/model-icons/bytedance.svg' };
  }
  if (normalized.includes('senseaudio')) return { label: 'SA', tone: 'sense' };
  if (normalized.includes('grok') || normalized.includes('xai') || normalized.includes('xai/')) {
    return { label: 'xAI', tone: 'grok', src: '/model-icons/x.svg' };
  }
  if (normalized.includes('gemini') || normalized.includes('imagen') || normalized.includes('veo') || normalized.includes('google') || normalized.includes('nano-banana')) {
    return { label: 'Google Gemini', tone: 'google', src: '/model-icons/google-gemini.svg' };
  }
  if (normalized.includes('flux') || normalized.includes('bfl') || normalized.includes('black-forest')) {
    return { label: 'FLUX', tone: 'flux', src: '/model-icons/flux.svg' };
  }
  if (normalized.includes('openrouter')) return { label: 'OpenRouter', tone: 'router', src: '/model-icons/openrouter.svg' };
  if (normalized.includes('imagerouter') || normalized.includes('/')) return { label: 'IR', tone: 'router' };
  if (normalized.includes('eleven')) {
    return { label: 'ElevenLabs', tone: 'elevenlabs', src: '/model-icons/elevenlabs.svg' };
  }
  if (normalized.includes('fish')) {
    return { label: 'Fish Audio', tone: 'fishaudio', src: '/model-icons/fishaudio.svg' };
  }
  if (normalized.includes('minimax')) {
    return { label: 'MiniMax', tone: 'minimax', src: '/model-icons/minimax.svg' };
  }
  if (normalized.includes('suno')) return { label: 'Suno', tone: 'suno', src: '/model-icons/suno.svg' };
  if (
    normalized.includes('udio') ||
    normalized.includes('audio') ||
    normalized.includes('voice')
  ) {
    return { label: modelInitials(label), tone: 'audio' };
  }
  return { label: modelInitials(label || value), tone: 'custom' };
}

function modelInitials(input: string): string {
  const cleaned = input
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/^(gpt|model)[-_ ]*/i, '')
    .trim();
  const parts = cleaned.split(/[^a-z0-9]+/i).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
    : (parts[0] ?? cleaned).slice(0, 2);
  return initials.toUpperCase() || 'M';
}

function ratioOptionIcon(value: string): RatioOptionIconSpec {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  const rawWidth = Number(match?.[1] ?? 1);
  const rawHeight = Number(match?.[2] ?? 1);
  const ratioWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const ratioHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  const maxEdge = 17;
  const scale = maxEdge / Math.max(ratioWidth, ratioHeight);
  const width = Math.max(8, Math.round(ratioWidth * scale));
  const height = Math.max(8, Math.round(ratioHeight * scale));
  const normalized = `${ratioWidth}:${ratioHeight}`;
  const tone = (() => {
    if (normalized === '1:1') return 'square';
    if (normalized === '16:9') return 'wide';
    if (normalized === '9:16') return 'tall';
    if (normalized === '4:3') return 'standard';
    if (normalized === '3:4') return 'portrait';
    return ratioWidth > ratioHeight ? 'wide' : ratioHeight > ratioWidth ? 'tall' : 'custom';
  })();
  return { width, height, tone };
}

function optionLabelMap(field: InputFieldSpec): Record<string, string> {
  const labels = (field as { optionLabels?: unknown }).optionLabels;
  return labels && typeof labels === 'object' && !Array.isArray(labels)
    ? labels as Record<string, string>
    : {};
}

function stripHomeMentionToken(value: string, label: string): string {
  const token = inlineMentionToken(label);
  return value.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

function fileMatchesQuery(file: File, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [file.name, file.type || '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function skillMatchesQuery(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.mode,
    skill.surface ?? '',
    ...skill.triggers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function connectorMatchesQuery(connector: ConnectorDetail, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    connector.id,
    connector.name,
    connector.provider,
    connector.category,
    connector.description ?? '',
    connector.accountLabel ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPluginSourceLabel(plugin: InstalledPluginRecord): string {
  return plugin.sourceKind === 'bundled' ? 'Official' : 'My plugin';
}

function getPluginQueryPreview(plugin: InstalledPluginRecord): string {
  const raw = plugin.manifest?.od?.useCase?.query;
  const value =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw.en ?? raw['zh-CN'] ?? Object.values(raw).find((entry): entry is string => (
            typeof entry === 'string' && entry.length > 0
          )) ?? ''
        : '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed;
}

interface RailGroupProps {
  group: ChipGroup;
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  onPickChip: (chip: HomeHeroChip) => void;
  variant?: 'rail' | 'tabs';
  children?: ReactNode;
}

function RailGroup({
  group,
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  onPickChip,
  variant = 'rail',
  children,
}: RailGroupProps) {
  const t = useT();
  const chips = useMemo(() => chipsForGroup(group), [group]);
  const isTabs = variant === 'tabs';
  return (
    <div
      className={
        isTabs
          ? `home-hero__type-tabs home-hero__type-tabs--${group}`
          : `home-hero__rail-group home-hero__rail-group--${group}`
      }
      data-testid={isTabs ? 'home-hero-type-tabs' : undefined}
      data-rail-group={group}
      role={isTabs ? 'tablist' : undefined}
      aria-label={isTabs ? t('homeHero.railAria') : undefined}
    >
      {chips.map((chip) => {
        const isActive = activeChipId === chip.id;
        const isPending = pendingChipId === chip.id;
        const cls = isTabs
          ? ['home-hero__type-tab', `home-hero__type-tab--${group}`]
          : ['home-hero__rail-chip', `home-hero__rail-chip--${group}`];
        if (isActive) cls.push('is-active');
        if (isPending) cls.push('is-pending');
        return (
          <button
            key={chip.id}
            type="button"
            className={cls.join(' ')}
            data-chip-id={chip.id}
            data-testid={`home-hero-rail-${chip.id}`}
            onClick={() => onPickChip(chip)}
            disabled={pluginsLoading || isPending || pendingPluginId !== null}
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? isActive : undefined}
            aria-pressed={isTabs ? undefined : isActive}
            title={homeHeroChipTitle(chip, t)}
          >
            <Icon
              name={chip.icon}
              size={14}
              className={isTabs ? 'home-hero__type-tab-icon' : 'home-hero__rail-chip-icon'}
            />
            <span className={isTabs ? 'home-hero__type-tab-label' : 'home-hero__rail-chip-label'}>
              {homeHeroChipLabel(chip.id, t)}
            </span>
          </button>
        );
      })}
      {children}
    </div>
  );
}

function SubTypeRow({
  subChips,
  selectedSlug,
  pluginsLoading,
  onPickSubChip,
  onSelectAll,
}: {
  subChips: HomeHeroSubChip[];
  selectedSlug: string | null;
  pluginsLoading: boolean;
  onPickSubChip: (sub: HomeHeroSubChip) => void;
  onSelectAll: () => void;
}) {
  const t = useT();
  const allActive = selectedSlug === null;
  return (
    <div
      className="home-hero__subtype-row"
      data-testid="home-hero-subtype-row"
      role="tablist"
      aria-label={t('homeHero.subTypeAria')}
    >
      <button
        type="button"
        className={`home-hero__subtype-chip${allActive ? ' is-active' : ''}`}
        data-sub-chip-id="all"
        data-testid="home-hero-subtype-all"
        onClick={onSelectAll}
        disabled={pluginsLoading}
        role="tab"
        aria-selected={allActive}
      >
        <span className="home-hero__subtype-chip-label">{t('common.all')}</span>
      </button>
      {subChips.map((sub) => {
        const isActive = sub.slug === selectedSlug;
        const cls = ['home-hero__subtype-chip'];
        if (isActive) cls.push('is-active');
        return (
          <button
            key={sub.slug}
            type="button"
            className={cls.join(' ')}
            data-sub-chip-id={sub.slug}
            data-testid={`home-hero-subtype-${sub.slug}`}
            onClick={() => onPickSubChip(sub)}
            disabled={pluginsLoading}
            role="tab"
            aria-selected={isActive}
          >
            <Icon name={sub.icon} size={13} className="home-hero__subtype-chip-icon" />
            <span className="home-hero__subtype-chip-label">{sub.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActiveTypeChip({ chip, onClear }: { chip: HomeHeroChip; onClear: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="home-hero__active-type-chip"
      data-testid="home-hero-active-type-chip"
      data-chip-id={chip.id}
      title={homeHeroChipTitle(chip, t)}
      aria-label={`${homeHeroChipLabel(chip.id, t)} ${t('common.delete')}`}
      onClick={onClear}
    >
      <span className="home-hero__active-type-chip-icon" aria-hidden>
        <Icon name={chip.icon} size={13} />
      </span>
      <span>{homeHeroChipLabel(chip.id, t)}</span>
      <Icon name="close" size={12} className="home-hero__active-type-chip-close" />
    </button>
  );
}

interface ShortcutsMenuProps {
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  open: boolean;
  refNode: RefObject<HTMLDivElement>;
  onOpenChange: (open: boolean) => void;
  onPickChip: (chip: HomeHeroChip) => void;
}

function ShortcutsMenu({
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  open,
  refNode,
  onOpenChange,
  onPickChip,
}: ShortcutsMenuProps) {
  const t = useT();
  const shortcuts = useMemo(() => chipsForGroup('migrate'), []);
  const disabled = pluginsLoading || pendingPluginId !== null;
  const hasActiveShortcut = shortcuts.some((chip) => chip.id === activeChipId);
  const hasPendingShortcut = shortcuts.some((chip) => chip.id === pendingChipId);
  const triggerClass = [
    'home-hero__type-tab',
    'home-hero__type-tab--more',
    hasActiveShortcut ? 'is-active' : '',
    hasPendingShortcut ? 'is-pending' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      ref={refNode}
      className="home-hero__shortcut-menu"
      data-testid="home-hero-shortcuts"
      data-rail-group="migrate"
    >
      <button
        type="button"
        className={triggerClass}
        data-testid="home-hero-shortcuts-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('homeHero.moreShortcuts')}
        title={t('homeHero.moreShortcuts')}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="more-horizontal" size={16} className="home-hero__type-tab-icon" />
      </button>
      {open ? (
        <div
          className="home-hero__shortcut-menu-panel"
          role="menu"
          aria-label={t('homeHero.moreShortcuts')}
          data-testid="home-hero-shortcuts-menu"
        >
          {shortcuts.map((chip) => {
            const isActive = activeChipId === chip.id;
            const isPending = pendingChipId === chip.id;
            const cls = ['home-hero__shortcut-menu-item'];
            if (isActive) cls.push('is-active');
            if (isPending) cls.push('is-pending');
            return (
              <button
                key={chip.id}
                type="button"
                role="menuitem"
                className={cls.join(' ')}
                data-chip-id={chip.id}
                data-testid={`home-hero-rail-${chip.id}`}
                disabled={pluginsLoading || isPending || pendingPluginId !== null}
                title={homeHeroChipTitle(chip, t)}
                onClick={() => onPickChip(chip)}
              >
                <Icon name={chip.icon} size={14} className="home-hero__shortcut-menu-icon" />
                <span>{homeHeroChipLabel(chip.id, t)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function homeHeroChipLabel(chipId: string, t: ReturnType<typeof useT>): string {
  switch (chipId) {
    case 'prototype': return t('homeHero.chip.prototype');
    case 'live-artifact': return t('homeHero.chip.liveArtifact');
    case 'deck': return t('homeHero.chip.deck');
    case 'image': return t('homeHero.chip.image');
    case 'video': return t('homeHero.chip.video');
    case 'hyperframes': return t('homeHero.chip.hyperframes');
    case 'audio': return t('homeHero.chip.audio');
    case 'create-plugin': return t('homeHero.chip.createPlugin');
    case 'figma': return t('homeHero.chip.figma');
    case 'template': return t('homeHero.chip.template');
    default: return chipId;
  }
}

function homeHeroChipTitle(chip: HomeHeroChip, t: ReturnType<typeof useT>): string {
  switch (chip.id) {
    case 'live-artifact': return t('homeHero.chip.liveArtifactHint');
    case 'hyperframes': return t('homeHero.chip.hyperframesHint');
    case 'create-plugin': return t('homeHero.chip.createPluginHint');
    case 'figma': return t('homeHero.chip.figmaHint');
    case 'template': return t('homeHero.chip.templateHint');
    default: return homeHeroChipLabel(chip.id, t);
  }
}

function homeHeroExamplePluginsForChip(
  chipId: string,
  plugins: InstalledPluginRecord[],
  locale: Locale,
): InstalledPluginRecord[] {
  const presets = plugins
    .filter((plugin) => (
      pluginMatchesExampleChip(plugin, chipId) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .filter((plugin) => (
      Boolean(pluginPresetQuery(plugin, locale)) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .sort((a, b) => comparePluginPresetOrder(a, b, chipId))
    .slice(0, 18);
  if (chipId === 'image') {
    return movePluginPresetToEnd(presets, 'example-hatch-pet');
  }
  return presets;
}

function comparePluginPresetOrder(
  a: InstalledPluginRecord,
  b: InstalledPluginRecord,
  chipId: string,
): number {
  const aCurated = curatedPluginPriorityForChip(a, chipId);
  const bCurated = curatedPluginPriorityForChip(b, chipId);
  if (aCurated !== null || bCurated !== null) {
    if (aCurated !== null && bCurated === null) return -1;
    if (aCurated === null && bCurated !== null) return 1;
    if (aCurated !== bCurated) return (aCurated ?? 0) - (bCurated ?? 0);
  }
  const rankDelta = pluginPresetRank(b, chipId) - pluginPresetRank(a, chipId);
  if (rankDelta !== 0) return rankDelta;
  return (a.title || a.id).localeCompare(b.title || b.id);
}

function movePluginPresetToEnd(
  records: InstalledPluginRecord[],
  pluginId: string,
): InstalledPluginRecord[] {
  const index = records.findIndex((record) => record.id === pluginId);
  if (index < 0 || index === records.length - 1) return records;
  const record = records[index]!;
  return [
    ...records.slice(0, index),
    ...records.slice(index + 1),
    record,
  ];
}

function pluginMatchesExampleChip(record: InstalledPluginRecord, chipId: string): boolean {
  const slugs = pluginRecordSlugs(record);
  const has = (...values: string[]) => values.some((value) => slugs.has(value));
  const hasPart = (...values: string[]) => {
    const all = [...slugs];
    return values.some((value) =>
      all.some((slug) => slug === value || slug.includes(value) || slug.split('-').includes(value)),
    );
  };
  switch (chipId) {
    case 'prototype':
      return has('prototype') || hasPart('web-prototype');
    case 'deck':
      return has('deck', 'slides', 'slide-deck') || hasPart('slide', 'deck');
    case 'hyperframes':
      return hasPart('hyperframes', 'hyperframe');
    case 'live-artifact':
      return has('live-artifact') || hasPart('live-artifact');
    case 'image':
      return (has('image') || hasPart('image-template')) && !hasPart('video', 'audio', 'live-artifact');
    case 'video':
      return (has('video') || hasPart('video-template')) && !hasPart('hyperframes', 'audio');
    case 'audio':
      return has('audio') || hasPart('audio');
    default:
      return false;
  }
}

function pluginPresetRank(record: InstalledPluginRecord, chipId: string): number {
  const slugs = pluginRecordSlugs(record);
  let score = 0;
  if (record.sourceKind === 'bundled') score += 20;
  if (record.id.startsWith('example-')) score += 12;
  if (record.id.includes('template')) score += 8;
  if (inferPluginPreview(record).kind !== 'text') score += 6;
  if (slugs.has(chipId)) score += 4;
  if (record.manifest?.od?.preview) score += 3;
  return score;
}

function pluginRecordSlugs(record: InstalledPluginRecord): Set<string> {
  const od = record.manifest?.od ?? {};
  const rawValues = [
    record.id,
    record.title,
    record.manifest?.name,
    record.manifest?.title,
    fieldString(od, 'mode'),
    fieldString(od, 'surface'),
    fieldString(od, 'scenario'),
    fieldString(od, 'taskKind'),
    ...(record.manifest?.tags ?? []),
  ];
  return new Set(rawValues.map((value) => slugifyHomeValue(value ?? '')).filter(Boolean));
}

function fieldString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function slugifyHomeValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function pluginPresetPromptPreview(
  record: InstalledPluginRecord,
  locale: Locale,
  chipId: string,
): string {
  const query = pluginPresetQuery(record, locale);
  const rendered = query
    ? renderPluginPresetQuery(record, query)
    : localizePluginDescription(locale, record);
  return textPromptForPluginPreset(record, rendered, chipId, locale);
}

function pluginPresetQuery(record: InstalledPluginRecord, locale: Locale): string | null {
  const query = record.manifest?.od?.useCase?.query;
  if (typeof query === 'string') return query;
  if (query && typeof query === 'object') {
    const localized = query as Record<string, unknown>;
    const exact = localized[locale];
    if (typeof exact === 'string') return exact;
    const language = locale.split('-')[0];
    const languageMatch = Object.entries(localized).find(([key, value]) => (
      key.toLowerCase().startsWith(`${language}-`) && typeof value === 'string'
    ));
    if (typeof languageMatch?.[1] === 'string') return languageMatch[1];
    for (const key of ['zh-CN', 'en', 'default']) {
      if (typeof localized[key] === 'string') return localized[key];
    }
    const first = Object.values(localized).find((value) => typeof value === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

function renderPluginPresetQuery(record: InstalledPluginRecord, query: string): string {
  const fields = record.manifest?.od?.inputs ?? [];
  const valueByName = new Map<string, string>();
  for (const field of fields) {
    const value = field.default ?? field.placeholder ?? field.label ?? field.name;
    valueByName.set(field.name, String(value));
  }
  return query
    .replace(
      HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN,
      (_placeholder, _name: string | undefined, defaultValue: string | undefined) => defaultValue ?? '',
    )
    .replace(
      HOME_ARGUMENT_PLACEHOLDER_PATTERN,
      (
        _placeholder,
        _doubleName: string | undefined,
        _singleName: string | undefined,
        doubleDefault: string | undefined,
        singleDefault: string | undefined,
      ) => doubleDefault ?? singleDefault ?? '',
    )
    .replace(INPUT_PLACEHOLDER_PATTERN, (_placeholder, key: string) => (
      valueByName.get(key) ?? key
    ));
}

function textPromptForPluginPreset(
  record: InstalledPluginRecord,
  prompt: string,
  chipId: string,
  locale: Locale,
): string {
  const cleaned = prompt.trim();
  const structured = parseStructuredPresetPrompt(cleaned);
  if (structured !== null) {
    return describeStructuredPresetPrompt(record, structured, chipId, locale);
  }
  if (cleaned.length > 0) return cleaned;
  return fallbackPluginPresetPrompt(record, chipId, locale);
}

function parseStructuredPresetPrompt(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function describeStructuredPresetPrompt(
  record: InstalledPluginRecord,
  structured: unknown,
  chipId: string,
  locale: Locale,
): string {
  const kind = promptLocaleKind(locale);
  const artifact = pluginPresetArtifactLabel(chipId, kind);
  const title = localizePluginTitle(locale, record).trim();
  const strings = collectStructuredPromptStrings(structured);
  const main =
    strings.find((item) => isMainPromptField(item.key) && item.value.length >= 8)?.value ??
    strings.find((item) => item.value.length >= 16)?.value ??
    (localizePluginDescription(locale, record) || title);
  const detailValues = uniquePromptStrings(
    strings
      .filter((item) => item.value !== main)
      .filter((item) => isUsefulPromptDetail(item.value))
      .map((item) => item.value),
  ).slice(0, 4);
  if (kind === 'zh') {
    const details = detailValues.length > 0
      ? `重点包含：${detailValues.join('；')}。`
      : '';
    return `使用「${title}」插件生成${artifact}。${main}${sentenceEnd(main)}${details}`;
  }
  if (kind === 'ja') {
    const details = detailValues.length > 0
      ? `重点として：${detailValues.join('、')}。`
      : '';
    return `「${title}」プラグインで${artifact}を生成します。${main}${sentenceEnd(main)}${details}`;
  }
  const details = detailValues.length > 0
    ? ` Include ${detailValues.join('; ')}.`
    : '';
  return `Create ${englishArticle(artifact)} ${artifact} with the "${title}" preset. ${main}${englishSentenceEnd(main)}${details}`;
}

function collectStructuredPromptStrings(
  value: unknown,
  path: string[] = [],
): Array<{ key: string; value: string }> {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    return [{ key: path[path.length - 1] ?? '', value: text }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStructuredPromptStrings(item, [...path, String(index)]));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectStructuredPromptStrings(child, [...path, key]),
    );
  }
  return [];
}

function isMainPromptField(key: string): boolean {
  return [
    'instruction',
    'prompt',
    'description',
    'subject',
    'brief',
    'goal',
  ].includes(key.toLowerCase());
}

function isUsefulPromptDetail(value: string): boolean {
  if (value.length < 8) return false;
  if (/^l\d+:/iu.test(value)) return false;
  return true;
}

function uniquePromptStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function sentenceEnd(value: string): string {
  return /[.!?。！？]$/u.test(value.trim()) ? '' : '。';
}

function englishSentenceEnd(value: string): string {
  return /[.!?。！？]$/u.test(value.trim()) ? '' : '.';
}

function pluginPresetArtifactLabel(chipId: string, kind: PromptLocaleKind): string {
  if (kind === 'zh') {
    switch (chipId) {
      case 'prototype': return '一个交互原型';
      case 'deck': return '一套 PPT slide';
      case 'image': return '一张图片';
      case 'video': return '一段视频';
      case 'hyperframes': return '一段 HyperFrames 动效视频';
      case 'audio': return '一段音频';
      default: return '一个设计产物';
    }
  }
  if (kind === 'ja') {
    switch (chipId) {
      case 'prototype': return 'インタラクティブなプロトタイプ';
      case 'deck': return 'PPT スライド';
      case 'image': return '画像';
      case 'video': return '動画';
      case 'hyperframes': return 'HyperFrames のモーション動画';
      case 'audio': return 'オーディオ';
      default: return 'デザイン成果物';
    }
  }
  switch (chipId) {
    case 'prototype': return 'interactive prototype';
    case 'deck': return 'PPT slide deck';
    case 'image': return 'image';
    case 'video': return 'video';
    case 'hyperframes': return 'HyperFrames motion video';
    case 'audio': return 'audio clip';
    default: return 'design artifact';
  }
}

function englishArticle(noun: string): 'a' | 'an' {
  return /^[aeiou]/iu.test(noun) ? 'an' : 'a';
}

function fallbackPluginPresetPrompt(
  record: InstalledPluginRecord,
  chipId: string,
  locale: Locale,
): string {
  const kind = promptLocaleKind(locale);
  const artifact = pluginPresetArtifactLabel(chipId, kind);
  const title = localizePluginTitle(locale, record);
  const description = localizePluginDescription(locale, record).trim();
  if (kind === 'zh') {
    return `使用「${title}」插件生成${artifact}${description ? `，方向是：${description}` : ''}。`;
  }
  if (kind === 'ja') {
    return `「${title}」プラグインで${artifact}を生成します${description ? `。方向性：${description}` : ''}。`;
  }
  return `Create ${englishArticle(artifact)} ${artifact} with the "${title}" preset${description ? `: ${description}` : '.'}`;
}

const HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=\\"([^"]+)\\"\s+default=\\"([^"]*)\\"[^}]*\}/g;

const HOME_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=(?:"([^"]+)"|'([^']+)')\s+default=(?:"([^"]*)"|'([^']*)')[^}]*\}/g;

const HOME_PROMPT_EXAMPLES: Record<Locale, Record<string, string[]>> = {
  "en": {
    prototype: [
      "Design a high-converting website for an AI CRM with a clear hero, feature story, proof points, and trial CTA",
      "Create a desktop dashboard for a team knowledge base with search, recent updates, permissions, and collaboration entry points",
      "Redesign onboarding for a financial SaaS product so new users can connect data, finish setup, and see first value fast",
      "Prototype a mobile fitness coaching app covering goal setup, weekly plans, workout check-ins, and progress review",
    ],
    deck: [
      "Research the market opportunity for a product launch, including competitors, target users, pricing hypotheses, and launch narrative",
      "Generate a weekly team status report with progress, risks, metric changes, and next-week priorities",
      "Design an investor pitch with market sizing, growth model, product advantage, and three-year forecast data",
      "Create a strategic business review deck covering quarterly performance, root causes, opportunities, and next actions",
    ],
    image: [
      "Generate a glassmorphism AI workspace poster with multi-screen collaboration, soft lighting, and a premium launch mood",
      "Create an ecommerce hero image for new wireless headphones that highlights material detail, lifestyle context, and core benefits",
      "Design a minimalist tech launch key visual with a clean composition, strong product focus, and restrained launch copy",
      "Make a social teaser set for a product drop, including countdown, close-up detail, benefit reveal, and launch-day visual",
    ],
    video: [
      "Make an 8-second product reveal film that moves from silhouette to close-up detail and ends on the brand mark",
      "Generate an app feature demo video that follows the user journey, key states, and final outcome",
      "Create a vertical brand opener with rhythmic typography, product close-ups, and a clean logo ending for short-form video",
      "Turn a website into a 15-second social ad by extracting the hero claim, interaction highlights, and a clear CTA",
    ],
    hyperframes: [
      "Build a captioned product launch short with title cards, feature shots, rhythmic transitions, and an ending CTA",
      "Generate an audio-reactive data visualization where bars, particles, and titles respond to narration beats",
      "Create a 3-second logo outro using line convergence, subtle elasticity, and the brand color system",
      "Make an animated flight-route map showing city nodes, route growth, mileage data, and a final summary frame",
    ],
    audio: [
      "Generate a product startup sound that feels light, trustworthy, slightly futuristic, and suitable for a desktop app launch",
      "Create a 20-second podcast intro bed with a warm opening, clear pulse, and a clean handoff into voiceover",
      "Make a seamless ambient loop for a meditation app using soft nature textures, low-frequency warmth, and calm pacing",
      "Generate a branded notification sound set for success, reminder, and error states while keeping one sonic identity",
    ],
  },
  "id": {
    prototype: [
      "Desain website berkonversi tinggi untuk AI CRM dengan hero yang jelas, alur cerita fitur, bukti pendukung, dan CTA uji coba",
      "Buat dashboard desktop untuk basis pengetahuan tim dengan pencarian, pembaruan terbaru, perizinan, dan titik masuk kolaborasi",
      "Rancang ulang onboarding untuk produk SaaS finansial agar pengguna baru bisa menghubungkan data, menyelesaikan setup, dan merasakan manfaat pertama dengan cepat",
      "Buat prototype app coaching kebugaran mobile yang mencakup penetapan tujuan, rencana mingguan, check-in latihan, dan tinjauan progres",
    ],
    deck: [
      "Riset peluang pasar untuk peluncuran produk, termasuk kompetitor, target pengguna, hipotesis harga, dan narasi peluncuran",
      "Buat laporan status tim mingguan berisi progres, risiko, perubahan metrik, dan prioritas minggu depan",
      "Desain pitch investor dengan ukuran pasar, model pertumbuhan, keunggulan produk, dan data proyeksi tiga tahun",
      "Buat deck tinjauan bisnis strategis yang mencakup kinerja kuartalan, akar masalah, peluang, dan langkah selanjutnya",
    ],
    image: [
      "Buat poster workspace AI bergaya glassmorphism dengan kolaborasi multi-layar, pencahayaan lembut, dan nuansa peluncuran premium",
      "Buat hero image ecommerce untuk headphone wireless baru yang menonjolkan detail material, konteks gaya hidup, dan manfaat utama",
      "Desain key visual peluncuran teknologi minimalis dengan komposisi bersih, fokus produk yang kuat, dan teks peluncuran yang ringkas",
      "Buat set teaser sosial untuk perilisan produk, termasuk hitung mundur, detail close-up, pengungkapan manfaat, dan visual hari peluncuran",
    ],
    video: [
      "Buat film pengungkapan produk 8 detik yang bergerak dari siluet ke detail close-up dan berakhir pada brand mark",
      "Buat video demo fitur app yang mengikuti perjalanan pengguna, state utama, dan hasil akhir",
      "Buat brand opener vertikal dengan tipografi berirama, close-up produk, dan akhiran logo yang bersih untuk video short-form",
      "Ubah website menjadi iklan sosial 15 detik dengan mengekstrak klaim utama, sorotan interaksi, dan CTA yang jelas",
    ],
    hyperframes: [
      "Bangun short peluncuran produk bertakarir dengan title card, shot fitur, transisi berirama, dan CTA penutup",
      "Buat visualisasi data audio-reaktif di mana bar, partikel, dan judul merespons ketukan narasi",
      "Buat outro logo 3 detik menggunakan pertemuan garis, elastisitas halus, dan sistem warna brand",
      "Buat peta rute penerbangan beranimasi yang menampilkan node kota, pertumbuhan rute, data jarak tempuh, dan frame ringkasan akhir",
    ],
    audio: [
      "Buat suara startup produk yang terasa ringan, terpercaya, sedikit futuristik, dan cocok untuk peluncuran app desktop",
      "Buat bed intro podcast 20 detik dengan pembuka hangat, pulsa yang jelas, dan transisi mulus ke voiceover",
      "Buat loop ambient mulus untuk app meditasi menggunakan tekstur alam yang lembut, kehangatan frekuensi rendah, dan tempo yang tenang",
      "Buat set suara notifikasi berbranding untuk state sukses, pengingat, dan error dengan tetap menjaga satu identitas sonik",
    ],
  },
  "de": {
    prototype: [
      "Entwirf eine konversionsstarke Website für ein AI CRM mit klarer Hero-Sektion, Feature-Story, Belegen und Trial-CTA",
      "Erstelle ein Desktop-Dashboard für eine Team-Wissensdatenbank mit Suche, aktuellen Updates, Berechtigungen und Einstiegspunkten für die Zusammenarbeit",
      "Gestalte das Onboarding für ein Finanz-SaaS-Produkt neu, damit neue Nutzer Daten verbinden, die Einrichtung abschließen und schnell den ersten Mehrwert erleben",
      "Prototype eine mobile Fitness-Coaching-App mit Zielsetzung, Wochenplänen, Workout-Check-ins und Fortschrittsübersicht",
    ],
    deck: [
      "Recherchiere die Marktchance für einen Produktlaunch, einschließlich Wettbewerbern, Zielnutzern, Preishypothesen und Launch-Narrativ",
      "Erstelle einen wöchentlichen Team-Statusbericht mit Fortschritt, Risiken, Kennzahlenänderungen und Prioritäten für die nächste Woche",
      "Entwirf ein Investoren-Pitch mit Marktgröße, Wachstumsmodell, Produktvorteil und Drei-Jahres-Prognosedaten",
      "Erstelle ein strategisches Business-Review-Deck mit Quartalsleistung, Ursachenanalyse, Chancen und nächsten Schritten",
    ],
    image: [
      "Generiere ein Glassmorphism-Poster für einen AI-Workspace mit Multi-Screen-Zusammenarbeit, sanftem Licht und edler Launch-Stimmung",
      "Erstelle ein E-Commerce-Hero-Bild für neue kabellose Kopfhörer, das Materialdetails, Lifestyle-Kontext und Kernvorteile hervorhebt",
      "Gestalte ein minimalistisches Key Visual für einen Tech-Launch mit klarer Komposition, starkem Produktfokus und zurückhaltendem Launch-Text",
      "Erstelle ein Social-Teaser-Set für einen Produkt-Drop mit Countdown, Detailaufnahme, Benefit-Reveal und Visual für den Launch-Tag",
    ],
    video: [
      "Erstelle einen 8-sekündigen Produkt-Reveal-Film, der von der Silhouette zur Detailaufnahme führt und mit dem Markenzeichen endet",
      "Generiere ein App-Feature-Demo-Video, das der User Journey, den wichtigsten Zuständen und dem Endergebnis folgt",
      "Erstelle einen vertikalen Marken-Opener mit rhythmischer Typografie, Produkt-Nahaufnahmen und einem klaren Logo-Abschluss für Kurzvideos",
      "Verwandle eine Website in eine 15-sekündige Social Ad, indem du die Hero-Aussage, Interaktions-Highlights und eine klare CTA herausziehst",
    ],
    hyperframes: [
      "Baue einen untertitelten Produktlaunch-Clip mit Titelkarten, Feature-Aufnahmen, rhythmischen Übergängen und einer CTA am Ende",
      "Generiere eine audioreaktive Datenvisualisierung, bei der Balken, Partikel und Titel auf den Rhythmus der Erzählung reagieren",
      "Erstelle ein 3-sekündiges Logo-Outro mit zusammenlaufenden Linien, subtiler Elastizität und dem Markenfarbsystem",
      "Erstelle eine animierte Flugrouten-Karte mit Stadtknoten, wachsenden Routen, Meilendaten und einem abschließenden Zusammenfassungsframe",
    ],
    audio: [
      "Generiere einen Produkt-Startsound, der sich leicht, vertrauenswürdig, leicht futuristisch anfühlt und für den Launch einer Desktop-App geeignet ist",
      "Erstelle ein 20-sekündiges Podcast-Intro-Bett mit warmem Einstieg, klarem Puls und sauberem Übergang in den Voiceover",
      "Erstelle einen nahtlosen Ambient-Loop für eine Meditations-App mit sanften Naturtexturen, tieffrequenter Wärme und ruhigem Tempo",
      "Generiere ein gebrandetes Benachrichtigungston-Set für Erfolgs-, Erinnerungs- und Fehlerzustände mit einer einheitlichen Klangidentität",
    ],
  },
  "zh-CN": {
    prototype: [
      "为 AI CRM 设计一个高转化官网，包含首屏、功能卖点、客户案例和清晰的试用入口",
      "为团队知识库做一个桌面端仪表盘，突出搜索、最近更新、权限状态和协作入口",
      "重构金融 SaaS 的 onboarding 流程，让新用户能快速完成开户、连接数据和看到首个洞察",
      "设计一个移动端健身教练 App 原型，覆盖目标设定、训练计划、打卡反馈和进度复盘",
    ],
    deck: [
      "研究一个新产品发布的市场机会，输出竞品格局、目标用户、定价假设和上市叙事",
      "生成每周团队状态报告，汇总进展、风险、关键指标变化和下周优先级",
      "设计一份投资者推介材料，包含市场规模、增长模型、产品优势和三年预测数据",
      "创建战略业务复盘演示文稿，讲清本季度表现、问题原因、机会判断和下一步行动",
    ],
    image: [
      "生成一张玻璃质感 AI 工作台海报，画面包含多屏协作、柔和光影和高级产品发布氛围",
      "为新款无线耳机做一张电商首屏主图，突出材质细节、佩戴场景和核心卖点",
      "设计一张极简科技发布会 KV，用干净构图、强主视觉和少量文字表达新品发布",
      "做一套社媒新品预热视觉，包含倒计时、局部特写、卖点揭示和发布日主图",
    ],
    video: [
      "做一个 8 秒产品 reveal 短片，从暗场轮廓推进到完整产品特写，结尾出现品牌标识",
      "生成一段 App 功能演示视频，按用户操作路径展示核心流程、关键状态和结果反馈",
      "制作竖屏品牌开场动画，用节奏化文字、产品局部和 logo 收束，适合短视频开头",
      "把一个网站转成 15 秒社媒广告，提炼首屏卖点、交互亮点和明确行动号召",
    ],
    hyperframes: [
      "做一个带字幕的产品发布短片，包含标题卡、功能镜头、节奏转场和结尾 CTA",
      "生成一段音频响应数据可视化，让柱状图、粒子和标题随旁白节奏变化",
      "制作 logo outro 动效，用线条收束、轻微弹性和品牌色完成 3 秒结尾动画",
      "做一个航线地图动态演示，展示城市节点、路径增长、里程数据和最终汇总画面",
    ],
    audio: [
      "生成一段产品启动音效，听起来轻盈、可信、带一点未来感，适合桌面 App 打开时播放",
      "制作 20 秒播客片头音乐，包含温暖前奏、清晰节拍和适合人声进入的收尾",
      "做一个冥想 App 的环境音循环，使用柔和自然声、低频铺底和无缝循环结构",
      "生成一组品牌通知提示音，区分成功、提醒和错误状态，但保持同一声音识别度",
    ],
  },
  "zh-TW": {
    prototype: [
      "為 AI CRM 設計一個高轉換率的網站，包含清晰的主視覺、功能故事、佐證亮點與試用 CTA",
      "為團隊知識庫打造桌面儀表板，包含搜尋、近期更新、權限管理與協作入口",
      "重新設計金融 SaaS 產品的引導流程，讓新使用者能快速串接資料、完成設定並體驗到首次價值",
      "為行動健身教練 app 製作原型，涵蓋目標設定、每週計畫、運動打卡與進度回顧",
    ],
    deck: [
      "研究產品上市的市場機會，包含競品、目標客群、定價假設與上市敘事",
      "產生每週團隊進度報告，包含進展、風險、指標變化與下週優先事項",
      "設計一份投資人簡報，包含市場規模、成長模型、產品優勢與三年預測數據",
      "製作策略性業務檢討簡報，涵蓋季度績效、根本原因、機會點與後續行動",
    ],
    image: [
      "產生一張玻璃擬物風格的 AI 工作空間海報，呈現多螢幕協作、柔和光線與高質感的上市氛圍",
      "為全新無線耳機製作電商主視覺，凸顯材質細節、生活情境與核心優點",
      "設計極簡的科技上市主視覺，構圖乾淨、產品焦點明確，搭配克制的上市文案",
      "為產品開賣製作社群預告系列，包含倒數計時、細節特寫、優點揭露與上市當天視覺",
    ],
    video: [
      "製作一支 8 秒的產品揭曉影片，從剪影過渡到細節特寫，最後收在品牌標誌",
      "產生一支 app 功能示範影片，依循使用者旅程、關鍵狀態與最終成果",
      "為短影音製作直式品牌開場，搭配節奏感字體動畫、產品特寫與乾淨的 logo 收尾",
      "將網站轉換成 15 秒社群廣告，萃取主視覺主張、互動亮點與清晰的 CTA",
    ],
    hyperframes: [
      "製作一支附字幕的產品上市短片，包含標題卡、功能畫面、節奏轉場與結尾 CTA",
      "產生一個聲音反應式資料視覺化，讓長條、粒子與標題隨旁白節拍律動",
      "運用線條匯聚、細膩彈性動態與品牌色彩系統，製作一個 3 秒的 logo 收尾動畫",
      "製作一張動態飛行航線地圖，呈現城市節點、航線延伸、里程數據與最終摘要畫面",
    ],
    audio: [
      "產生一個產品啟動音效，感覺輕盈、值得信賴、略帶未來感，適合桌面 app 啟動使用",
      "製作一段 20 秒的 Podcast 開場墊樂，溫暖開場、脈動清晰，並乾淨地接入旁白",
      "為冥想 app 製作無縫環境音循環，運用柔和的自然音質、低頻溫暖感與沉穩的節奏",
      "產生一組品牌通知音效，涵蓋成功、提醒與錯誤狀態，並維持一致的聲音識別",
    ],
  },
  "pt-BR": {
    prototype: [
      "Crie um site de alta conversão para um AI CRM com um hero claro, narrativa de recursos, provas sociais e CTA de teste grátis",
      "Crie um dashboard desktop para uma base de conhecimento de equipe com busca, atualizações recentes, permissões e pontos de entrada para colaboração",
      "Redesenhe o onboarding de um produto SaaS financeiro para que novos usuários conectem dados, concluam a configuração e vejam o primeiro valor rápido",
      "Prototipe um app mobile de coaching fitness cobrindo definição de metas, planos semanais, check-ins de treino e acompanhamento de progresso",
    ],
    deck: [
      "Pesquise a oportunidade de mercado para o lançamento de um produto, incluindo concorrentes, público-alvo, hipóteses de preço e narrativa de lançamento",
      "Gere um relatório semanal de status da equipe com progresso, riscos, variações de métricas e prioridades da próxima semana",
      "Crie um pitch para investidores com tamanho de mercado, modelo de crescimento, diferencial do produto e projeções de três anos",
      "Crie um deck de revisão estratégica de negócios cobrindo desempenho trimestral, causas raiz, oportunidades e próximos passos",
    ],
    image: [
      "Gere um pôster de workspace de IA em glassmorphism com colaboração multitelas, iluminação suave e clima premium de lançamento",
      "Crie uma imagem hero de e-commerce para novos fones sem fio destacando detalhes do material, contexto de uso e benefícios principais",
      "Crie um key visual minimalista de lançamento tech com composição limpa, foco forte no produto e texto de lançamento enxuto",
      "Faça um conjunto de teasers para redes sociais de um lançamento de produto, incluindo contagem regressiva, close de detalhes, revelação de benefícios e visual do dia do lançamento",
    ],
    video: [
      "Faça um filme de revelação de produto de 8 segundos que vai da silhueta ao close de detalhes e termina na marca",
      "Gere um vídeo de demonstração de recursos do app que segue a jornada do usuário, os estados principais e o resultado final",
      "Crie uma abertura de marca vertical com tipografia ritmada, closes do produto e um encerramento limpo com o logo para vídeo short-form",
      "Transforme um site em um anúncio social de 15 segundos extraindo a promessa do hero, os destaques de interação e um CTA claro",
    ],
    hyperframes: [
      "Crie um short legendado de lançamento de produto com cartelas de título, takes de recursos, transições ritmadas e um CTA no final",
      "Gere uma visualização de dados que reage ao áudio, com barras, partículas e títulos respondendo ao ritmo da narração",
      "Crie um outro de logo de 3 segundos usando convergência de linhas, elasticidade sutil e o sistema de cores da marca",
      "Faça um mapa animado de rotas de voo mostrando nós de cidades, crescimento das rotas, dados de milhagem e um quadro final de resumo",
    ],
    audio: [
      "Gere um som de inicialização de produto que soe leve, confiável, levemente futurista e adequado para o lançamento de um app desktop",
      "Crie uma base de abertura de podcast de 20 segundos com início acolhedor, pulso nítido e uma transição limpa para a locução",
      "Faça um loop ambiente contínuo para um app de meditação usando texturas suaves da natureza, calor de baixa frequência e ritmo tranquilo",
      "Gere um conjunto de sons de notificação da marca para os estados de sucesso, lembrete e erro mantendo uma única identidade sonora",
    ],
  },
  "es-ES": {
    prototype: [
      "Diseña una web de alta conversión para un AI CRM con un hero claro, narrativa de funciones, pruebas de valor y un CTA de prueba gratuita",
      "Crea un panel de escritorio para una base de conocimiento de equipo con búsqueda, novedades recientes, permisos y accesos a la colaboración",
      "Rediseña el onboarding de un producto SaaS financiero para que los nuevos usuarios conecten sus datos, completen la configuración y vean valor rápido",
      "Prototipa una app móvil de entrenamiento físico que cubra el establecimiento de objetivos, planes semanales, registro de entrenamientos y revisión del progreso",
    ],
    deck: [
      "Investiga la oportunidad de mercado para el lanzamiento de un producto, incluyendo competidores, usuarios objetivo, hipótesis de precios y narrativa de lanzamiento",
      "Genera un informe semanal de estado del equipo con avances, riesgos, cambios en las métricas y prioridades de la próxima semana",
      "Diseña un pitch para inversores con dimensionamiento de mercado, modelo de crecimiento, ventaja del producto y previsiones a tres años",
      "Crea una presentación de revisión estratégica del negocio que cubra el rendimiento trimestral, causas de fondo, oportunidades y próximas acciones",
    ],
    image: [
      "Genera un póster de workspace de IA con efecto glassmorphism, colaboración multipantalla, iluminación suave y un ambiente premium de lanzamiento",
      "Crea una imagen hero de ecommerce para unos nuevos auriculares inalámbricos que destaque el detalle del material, el contexto de uso y los beneficios clave",
      "Diseña un key visual minimalista para un lanzamiento tecnológico con una composición limpia, foco en el producto y un mensaje de lanzamiento contenido",
      "Crea un set de teasers para redes para el lanzamiento de un producto, con cuenta atrás, detalle en primer plano, revelación del beneficio y visual del día de lanzamiento",
    ],
    video: [
      "Crea un vídeo de revelación de producto de 8 segundos que pase de la silueta al detalle en primer plano y termine en la marca",
      "Genera un vídeo demo de las funciones de una app que siga el recorrido del usuario, los estados clave y el resultado final",
      "Crea una intro de marca en vertical con tipografía rítmica, primeros planos del producto y un cierre de logo limpio para vídeo de formato corto",
      "Convierte una web en un anuncio de 15 segundos para redes extrayendo el mensaje principal, los momentos de interacción y un CTA claro",
    ],
    hyperframes: [
      "Crea un corto subtitulado de lanzamiento de producto con tarjetas de título, planos de funciones, transiciones rítmicas y un CTA final",
      "Genera una visualización de datos reactiva al audio donde barras, partículas y títulos respondan al ritmo de la narración",
      "Crea un outro de logo de 3 segundos con líneas que convergen, una elasticidad sutil y el sistema de color de la marca",
      "Crea un mapa animado de rutas de vuelo que muestre nodos de ciudades, el crecimiento de las rutas, datos de millas y un fotograma final de resumen",
    ],
    audio: [
      "Genera un sonido de inicio de producto que transmita ligereza, confianza y un toque futurista, ideal para el lanzamiento de una app de escritorio",
      "Crea una base de intro de pódcast de 20 segundos con una apertura cálida, un pulso claro y una transición limpia hacia la voz en off",
      "Crea un loop ambiental fluido para una app de meditación con texturas suaves de la naturaleza, calidez de baja frecuencia y un ritmo tranquilo",
      "Genera un set de sonidos de notificación de marca para los estados de éxito, recordatorio y error manteniendo una misma identidad sonora",
    ],
  },
  "ru": {
    prototype: [
      "Спроектируйте конверсионный сайт для AI CRM с понятным hero-блоком, рассказом о возможностях, аргументами и CTA на пробный период",
      "Создайте десктопный дашборд для командной базы знаний с поиском, недавними обновлениями, правами доступа и точками входа для совместной работы",
      "Переработайте онбординг финансового SaaS-продукта, чтобы новые пользователи быстро подключали данные, завершали настройку и видели первую ценность",
      "Сделайте прототип мобильного приложения для фитнес-тренировок с постановкой целей, недельными планами, отметками о тренировках и просмотром прогресса",
    ],
    deck: [
      "Исследуйте рыночные возможности для запуска продукта: конкуренты, целевая аудитория, гипотезы по ценам и нарратив запуска",
      "Подготовьте еженедельный отчёт команды с прогрессом, рисками, изменениями метрик и приоритетами на следующую неделю",
      "Соберите инвесторскую презентацию с оценкой рынка, моделью роста, преимуществом продукта и прогнозом на три года",
      "Создайте презентацию стратегического бизнес-обзора: квартальные результаты, причины, возможности и следующие шаги",
    ],
    image: [
      "Сгенерируйте постер AI-рабочего пространства в стиле glassmorphism с мультиэкранной совместной работой, мягким светом и премиальным настроением запуска",
      "Создайте hero-изображение для интернет-магазина с новыми беспроводными наушниками: детали материала, контекст использования и ключевые преимущества",
      "Разработайте минималистичный key visual для технологического запуска с чистой композицией, акцентом на продукте и лаконичным текстом",
      "Сделайте набор тизеров для соцсетей к выходу продукта: обратный отсчёт, крупный план детали, раскрытие преимущества и визуал дня запуска",
    ],
    video: [
      "Сделайте 8-секундный ролик-презентацию продукта, который переходит от силуэта к крупному плану детали и завершается фирменным знаком",
      "Сгенерируйте видео с демонстрацией возможностей app, следуя пути пользователя, ключевым состояниям и итоговому результату",
      "Создайте вертикальную брендовую заставку с ритмичной типографикой, крупными планами продукта и чистым завершением на logo для коротких видео",
      "Превратите сайт в 15-секундную рекламу для соцсетей, выделив главный тезис, ключевые взаимодействия и понятный CTA",
    ],
    hyperframes: [
      "Соберите короткий ролик о запуске продукта с субтитрами: титульные карточки, кадры возможностей, ритмичные переходы и CTA в финале",
      "Сгенерируйте аудиореактивную визуализацию данных, где столбцы, частицы и заголовки откликаются на ритм закадрового текста",
      "Создайте 3-секундную заставку с logo на основе схождения линий, лёгкой упругости и фирменной цветовой системы",
      "Сделайте анимированную карту авиамаршрутов с узлами городов, ростом маршрутов, данными о километраже и итоговым кадром",
    ],
    audio: [
      "Сгенерируйте звук запуска продукта — лёгкий, вызывающий доверие, слегка футуристичный и подходящий для запуска десктопного app",
      "Создайте 20-секундную подложку для интро подкаста с тёплым началом, чётким пульсом и плавным переходом к озвучке",
      "Сделайте бесшовный эмбиент-луп для приложения для медитации с мягкими природными текстурами, низкочастотным теплом и спокойным темпом",
      "Сгенерируйте набор фирменных звуков уведомлений для успеха, напоминания и ошибки, сохранив единую звуковую идентичность",
    ],
  },
  "fa": {
    prototype: [
      "یک وب‌سایت پربازده برای یک AI CRM طراحی کن با بخش معرفی شفاف، روایت ویژگی‌ها، نکات اثبات‌کننده و CTA برای آزمایش رایگان",
      "یک داشبورد دسکتاپ برای پایگاه دانش تیمی بساز با جست‌وجو، به‌روزرسانی‌های اخیر، دسترسی‌ها و نقاط ورود به همکاری",
      "فرایند آنبوردینگ یک محصول SaaS مالی را بازطراحی کن تا کاربران جدید بتوانند داده‌ها را متصل کنند، راه‌اندازی را کامل کنند و سریع به ارزش اولیه برسند",
      "یک app مربی تناسب اندام موبایلی نمونه‌سازی کن که تعیین هدف، برنامه‌های هفتگی، ثبت تمرین‌ها و مرور پیشرفت را پوشش بدهد",
    ],
    deck: [
      "فرصت بازار برای عرضه یک محصول را بررسی کن، شامل رقبا، کاربران هدف، فرضیه‌های قیمت‌گذاری و روایت عرضه",
      "یک گزارش وضعیت هفتگی تیم بساز با پیشرفت‌ها، ریسک‌ها، تغییرات معیارها و اولویت‌های هفته بعد",
      "یک ارائه جذب سرمایه طراحی کن با اندازه‌گیری بازار، مدل رشد، مزیت محصول و داده‌های پیش‌بینی سه‌ساله",
      "یک ارائه بازبینی استراتژیک کسب‌وکار بساز که عملکرد فصلی، ریشه‌ها، فرصت‌ها و اقدامات بعدی را پوشش بدهد",
    ],
    image: [
      "یک پوستر فضای کاری AI با سبک glassmorphism بساز با همکاری چندصفحه‌ای، نور ملایم و حال‌وهوای عرضه‌ای لوکس",
      "یک تصویر اصلی فروشگاهی برای هدفون بی‌سیم جدید بساز که جزئیات متریال، بافت سبک زندگی و مزایای اصلی را برجسته کند",
      "یک کلیدتصویر مینیمال برای عرضه محصول فناوری طراحی کن با ترکیب‌بندی تمیز، تمرکز قوی روی محصول و متن عرضه‌ای موجز",
      "یک مجموعه تیزر شبکه‌های اجتماعی برای عرضه محصول بساز شامل شمارش معکوس، نمای نزدیک جزئیات، رونمایی از مزیت و تصویر روز عرضه",
    ],
    video: [
      "یک فیلم رونمایی محصول ۸ ثانیه‌ای بساز که از سایه به نمای نزدیک جزئیات می‌رسد و با نشان برند تمام می‌شود",
      "یک ویدیوی دموی ویژگی app بساز که سفر کاربر، حالت‌های کلیدی و نتیجه نهایی را دنبال کند",
      "یک تیتراژ آغازین برند عمودی برای ویدیوی کوتاه بساز با تایپوگرافی ریتمیک، نماهای نزدیک محصول و پایان تمیز با logo",
      "یک وب‌سایت را با استخراج ادعای اصلی، نکات برجسته تعامل و یک CTA شفاف به یک تبلیغ اجتماعی ۱۵ ثانیه‌ای تبدیل کن",
    ],
    hyperframes: [
      "یک ویدیوی کوتاه عرضه محصول با زیرنویس بساز با کارت‌های عنوان، نماهای ویژگی، گذارهای ریتمیک و یک CTA پایانی",
      "یک مصورسازی داده واکنش‌گرا به صدا بساز که میله‌ها، ذرات و عنوان‌ها به ضرب‌آهنگ روایت پاسخ بدهند",
      "یک اوترو logo سه‌ثانیه‌ای بساز با همگرایی خطوط، کشسانی ظریف و سیستم رنگ برند",
      "یک نقشه مسیر پرواز متحرک بساز که نقاط شهرها، رشد مسیر، داده‌های مسافت و یک فریم خلاصه نهایی را نشان بدهد",
    ],
    audio: [
      "یک صدای راه‌اندازی محصول بساز که سبک، قابل‌اعتماد، کمی آینده‌نگرانه و مناسب عرضه یک app دسکتاپ باشد",
      "یک بستر آغازین پادکست ۲۰ ثانیه‌ای بساز با شروعی گرم، ضربان شفاف و واگذاری تمیز به صدای گوینده",
      "یک لوپ محیطی یکپارچه برای یک app مدیتیشن بساز با بافت‌های نرم طبیعت، گرمای فرکانس پایین و ریتم آرام",
      "یک مجموعه صدای اعلان برند برای حالت‌های موفقیت، یادآوری و خطا بساز در حالی که یک هویت صوتی واحد حفظ شود",
    ],
  },
  "ar": {
    prototype: [
      "صمّم موقعًا عالي التحويل لمنتج AI CRM مع قسم رئيسي واضح وقصة للميزات ونقاط إثبات وزر CTA لتجربة المنتج",
      "أنشئ لوحة تحكم لسطح المكتب لقاعدة معرفة جماعية تتضمن البحث والتحديثات الأخيرة والصلاحيات ونقاط دخول للتعاون",
      "أعد تصميم تجربة الانضمام لمنتج SaaS مالي ليتمكن المستخدمون الجدد من ربط بياناتهم وإكمال الإعداد وإدراك القيمة الأولى بسرعة",
      "صمّم نموذجًا أوليًا لتطبيق لياقة بدنية على الهاتف يغطي تحديد الأهداف والخطط الأسبوعية وتسجيل التمارين ومراجعة التقدم",
    ],
    deck: [
      "ابحث في فرصة السوق لإطلاق منتج، بما في ذلك المنافسون والمستخدمون المستهدفون وفرضيات التسعير وسردية الإطلاق",
      "أنشئ تقريرًا أسبوعيًا عن حالة الفريق يتضمن التقدم والمخاطر وتغيّرات المؤشرات وأولويات الأسبوع المقبل",
      "صمّم عرضًا تقديميًا للمستثمرين يشمل حجم السوق ونموذج النمو وميزة المنتج وبيانات توقعات الثلاث سنوات",
      "أنشئ عرضًا للمراجعة الاستراتيجية للأعمال يغطي الأداء الفصلي والأسباب الجذرية والفرص والخطوات التالية",
    ],
    image: [
      "أنشئ ملصقًا لمساحة عمل AI بأسلوب الزجاج الشفاف مع تعاون متعدد الشاشات وإضاءة ناعمة وأجواء إطلاق فاخرة",
      "أنشئ صورة رئيسية للتجارة الإلكترونية لسماعات لاسلكية جديدة تُبرز تفاصيل الخامة والسياق الحياتي والفوائد الأساسية",
      "صمّم هوية بصرية محورية لإطلاق تقني بأسلوب بسيط مع تكوين نظيف وتركيز قوي على المنتج ونص إطلاق مقتضب",
      "اصنع مجموعة تشويقية لوسائل التواصل لإطلاق منتج تتضمن العد التنازلي ولقطة قريبة للتفاصيل وكشف الفائدة وصورة يوم الإطلاق",
    ],
    video: [
      "اصنع فيلم كشف عن منتج مدته 8 ثوانٍ ينتقل من الظل إلى التفاصيل القريبة وينتهي بشعار العلامة",
      "أنشئ فيديو عرض لميزة في app يتتبع رحلة المستخدم والحالات الرئيسية والنتيجة النهائية",
      "أنشئ مقدمة عمودية للعلامة بحروف إيقاعية ولقطات قريبة للمنتج ونهاية نظيفة بالشعار للفيديوهات القصيرة",
      "حوّل موقعًا إلى إعلان اجتماعي مدته 15 ثانية باستخراج العبارة الرئيسية وأبرز التفاعلات وزر CTA واضح",
    ],
    hyperframes: [
      "اصنع فيديو قصيرًا لإطلاق منتج مع نصوص توضيحية وبطاقات عنوان ولقطات للميزات وانتقالات إيقاعية وزر CTA في النهاية",
      "أنشئ تصورًا للبيانات يتفاعل مع الصوت حيث تستجيب الأعمدة والجسيمات والعناوين لإيقاع السرد",
      "أنشئ خاتمة للشعار مدتها 3 ثوانٍ باستخدام تقارب الخطوط ومرونة خفيفة ونظام ألوان العلامة",
      "اصنع خريطة متحركة لمسارات الطيران تُظهر عُقد المدن ونمو المسارات وبيانات الأميال وإطار ملخص نهائي",
    ],
    audio: [
      "أنشئ صوت بدء تشغيل لمنتج يبدو خفيفًا وموثوقًا ومستقبليًا قليلًا ومناسبًا لإطلاق app على سطح المكتب",
      "أنشئ مقدمة موسيقية لبودكاست مدتها 20 ثانية ببداية دافئة ونبض واضح وانتقال سلس إلى التعليق الصوتي",
      "اصنع حلقة صوتية محيطة متواصلة لتطبيق تأمل باستخدام نسائج طبيعية ناعمة ودفء بترددات منخفضة وإيقاع هادئ",
      "أنشئ مجموعة أصوات إشعارات للعلامة لحالات النجاح والتذكير والخطأ مع الحفاظ على هوية صوتية واحدة",
    ],
  },
  "ja": {
    prototype: [
      "AI CRM 向けに、ヒーロー・機能ストーリー・実績・トライアル CTA を備えた高コンバージョンの Web サイトをデザインして",
      "チームのナレッジベース向けに、検索・最近の更新・権限状態・コラボ導線を備えたデスクトップのダッシュボードを作って",
      "金融 SaaS のオンボーディングを再設計して、新規ユーザーがデータ連携・初期設定・最初の価値体験まで素早く到達できるようにして",
      "目標設定・週次プラン・チェックイン・進捗レビューをカバーする、モバイルのフィットネスコーチ App のプロトタイプを作って",
    ],
    deck: [
      "新製品ローンチの市場機会をリサーチして、競合状況・ターゲットユーザー・価格仮説・ローンチの物語をまとめて",
      "進捗・リスク・主要指標の変化・来週の優先事項を盛り込んだ週次チームステータスレポートを生成して",
      "市場規模・成長モデル・製品の強み・3 年分の予測データを含む投資家向けピッチをデザインして",
      "四半期の実績・原因・機会・次のアクションをまとめた戦略的なビジネスレビューのデッキを作って",
    ],
    image: [
      "マルチスクリーンのコラボ・柔らかな光・上質なローンチの雰囲気を持つ、グラスモーフィズムの AI ワークスペースのポスターを生成して",
      "素材の質感・装着シーン・主要な利点を強調した、新型ワイヤレスイヤホンの EC ヒーロー画像を作って",
      "クリーンな構図・強いプロダクトフォーカス・抑えたコピーで、ミニマルなテック発表のキービジュアルをデザインして",
      "カウントダウン・クローズアップ・利点の提示・ローンチ当日のビジュアルを含む、新製品予告の SNS ビジュアルセットを作って",
    ],
    video: [
      "シルエットからクローズアップへと展開し、最後にブランドマークで締める 8 秒のプロダクトリビール動画を作って",
      "ユーザージャーニー・主要な状態・最終的な結果を追う、App 機能デモ動画を生成して",
      "リズミカルなタイポグラフィ・プロダクトのクローズアップ・logo の収束で締める、縦型のブランドオープナーを作って",
      "ヒーローの訴求・インタラクションの見どころ・明確な CTA を抽出して、Web サイトを 15 秒の SNS 広告に変換して",
    ],
    hyperframes: [
      "タイトルカード・機能ショット・リズミカルなトランジション・結びの CTA を備えた、字幕付きのプロダクトローンチ短編を作って",
      "バー・パーティクル・タイトルがナレーションのビートに反応する、オーディオリアクティブなデータ可視化を生成して",
      "線の収束・わずかな弾性・ブランドカラーを使った、3 秒の logo アウトロを作って",
      "都市ノード・経路の伸び・距離データ・最終サマリーフレームを見せる、アニメーションのフライトルートマップを作って",
    ],
    audio: [
      "軽やかで信頼感があり、少し未来的で、デスクトップ App の起動時に流すのにふさわしいプロダクト起動音を生成して",
      "温かいオープニング・明確なパルス・ナレーションへのスムーズな受け渡しを備えた、20 秒のポッドキャストイントロを作って",
      "柔らかな自然音・低域の温かみ・穏やかなテンポを使った、瞑想 App 向けのシームレスな環境音ループを作って",
      "成功・リマインド・エラーの状態を区別しつつ、ひとつの音のアイデンティティを保ったブランド通知音セットを生成して",
    ],
  },
  "ko": {
    prototype: [
      "명확한 히어로, 기능 스토리, 신뢰 지표, 체험판 CTA를 갖춘 AI CRM용 고전환 website를 디자인해 줘",
      "검색, 최근 업데이트, 권한 관리, 협업 진입점을 담은 팀 지식 베이스용 데스크톱 대시보드를 만들어 줘",
      "신규 사용자가 데이터를 연결하고 설정을 마쳐 첫 가치를 빠르게 체감하도록 금융 SaaS 제품의 온보딩을 새로 디자인해 줘",
      "목표 설정, 주간 플랜, 운동 체크인, 진행 상황 리뷰를 아우르는 모바일 피트니스 코칭 app을 프로토타입으로 만들어 줘",
    ],
    deck: [
      "경쟁사, 타깃 사용자, 가격 가설, 출시 내러티브를 포함해 제품 출시의 시장 기회를 리서치해 줘",
      "진행 상황, 리스크, 지표 변화, 다음 주 우선순위를 담은 주간 팀 현황 보고서를 만들어 줘",
      "시장 규모, 성장 모델, 제품 경쟁력, 3년 전망 데이터를 담은 투자자 피치를 디자인해 줘",
      "분기 실적, 근본 원인, 기회 요소, 다음 액션을 다루는 전략 비즈니스 리뷰 deck을 만들어 줘",
    ],
    image: [
      "멀티 스크린 협업, 부드러운 조명, 프리미엄한 출시 무드를 담은 글래스모피즘 AI 워크스페이스 포스터를 생성해 줘",
      "소재 디테일, 라이프스타일 맥락, 핵심 혜택을 강조하는 신규 무선 헤드폰 이커머스 히어로 이미지를 만들어 줘",
      "깔끔한 구성, 강한 제품 집중도, 절제된 카피를 살린 미니멀 테크 출시 키 비주얼을 디자인해 줘",
      "카운트다운, 클로즈업 디테일, 혜택 공개, 출시 당일 비주얼을 담은 제품 출시 소셜 티저 세트를 만들어 줘",
    ],
    video: [
      "실루엣에서 클로즈업 디테일로 이어지다 브랜드 마크로 마무리되는 8초 제품 공개 영상을 만들어 줘",
      "사용자 여정, 핵심 상태, 최종 결과를 따라가는 app 기능 데모 영상을 생성해 줘",
      "리듬감 있는 타이포그래피, 제품 클로즈업, 깔끔한 logo 엔딩을 담은 숏폼용 세로형 브랜드 오프너를 만들어 줘",
      "히어로 메시지, 인터랙션 하이라이트, 명확한 CTA를 뽑아 website를 15초 소셜 광고로 만들어 줘",
    ],
    hyperframes: [
      "타이틀 카드, 기능 컷, 리듬감 있는 트랜지션, 엔딩 CTA를 담은 자막형 제품 출시 숏폼을 만들어 줘",
      "막대, 파티클, 타이틀이 내레이션 비트에 반응하는 오디오 반응형 데이터 시각화를 생성해 줘",
      "라인 수렴, 은은한 탄성, 브랜드 컬러 시스템을 활용한 3초 logo 아웃트로를 만들어 줘",
      "도시 노드, 노선 성장, 마일리지 데이터, 최종 요약 프레임을 보여주는 비행 경로 애니메이션 지도를 만들어 줘",
    ],
    audio: [
      "가볍고 신뢰감 있으며 살짝 미래적인, 데스크톱 app 출시에 어울리는 제품 시작음을 생성해 줘",
      "따뜻한 도입부, 또렷한 펄스, 보이스오버로 매끄럽게 이어지는 20초 팟캐스트 인트로 베드를 만들어 줘",
      "부드러운 자연음 텍스처, 저주파의 따스함, 차분한 페이싱을 활용한 명상 app용 끊김 없는 앰비언트 루프를 만들어 줘",
      "하나의 사운드 아이덴티티를 유지하면서 성공, 알림, 오류 상태를 위한 브랜드 알림음 세트를 생성해 줘",
    ],
  },
  "pl": {
    prototype: [
      "Zaprojektuj skuteczną sprzedażowo stronę dla AI CRM z czytelną sekcją hero, opowieścią o funkcjach, dowodami skuteczności i CTA do wersji próbnej",
      "Stwórz desktopowy dashboard dla zespołowej bazy wiedzy z wyszukiwarką, ostatnimi aktualizacjami, uprawnieniami i punktami wejścia do współpracy",
      "Przeprojektuj onboarding produktu finansowego SaaS, aby nowi użytkownicy mogli podłączyć dane, dokończyć konfigurację i szybko zobaczyć pierwszą wartość",
      "Zbuduj prototyp mobilnej aplikacji do treningu fitness obejmującej ustawianie celów, plany tygodniowe, odznaczanie treningów i przegląd postępów",
    ],
    deck: [
      "Zbadaj szansę rynkową dla premiery produktu, uwzględniając konkurencję, docelowych użytkowników, hipotezy cenowe i narrację premiery",
      "Wygeneruj tygodniowy raport statusu zespołu z postępami, ryzykami, zmianami wskaźników i priorytetami na kolejny tydzień",
      "Zaprojektuj prezentację dla inwestorów z szacowaniem rynku, modelem wzrostu, przewagą produktu i prognozą na trzy lata",
      "Stwórz prezentację strategicznego przeglądu biznesowego obejmującą wyniki kwartalne, przyczyny źródłowe, szanse i kolejne działania",
    ],
    image: [
      "Wygeneruj plakat AI workspace w stylu glassmorphism z wieloekranową współpracą, miękkim światłem i ekskluzywnym nastrojem premiery",
      "Stwórz zdjęcie hero do e-commerce dla nowych słuchawek bezprzewodowych, podkreślające detale materiału, kontekst lifestyle i kluczowe korzyści",
      "Zaprojektuj minimalistyczny key visual premiery technologicznej z czystą kompozycją, mocnym akcentem na produkt i oszczędnym tekstem",
      "Przygotuj zestaw zapowiedzi do social media dla premiery produktu, w tym odliczanie, zbliżenie detalu, ujawnienie korzyści i grafikę na dzień premiery",
    ],
    video: [
      "Stwórz 8-sekundowy film z premierą produktu, który przechodzi od sylwetki do zbliżenia detalu i kończy się logiem marki",
      "Wygeneruj wideo demonstrujące funkcje aplikacji, podążające za ścieżką użytkownika, kluczowymi stanami i końcowym efektem",
      "Stwórz pionową czołówkę marki z rytmiczną typografią, zbliżeniami produktu i czystym zakończeniem z logo do wideo w formacie short",
      "Zamień stronę internetową w 15-sekundową reklamę do social media, wydobywając główny przekaz, najważniejsze interakcje i czytelne CTA",
    ],
    hyperframes: [
      "Zbuduj krótki film z premierą produktu z napisami, planszami tytułowymi, ujęciami funkcji, rytmicznymi przejściami i CTA na końcu",
      "Wygeneruj wizualizację danych reagującą na dźwięk, gdzie słupki, cząsteczki i napisy odpowiadają na rytm narracji",
      "Stwórz 3-sekundowe zakończenie z logo wykorzystujące zbieżność linii, subtelną elastyczność i system kolorów marki",
      "Przygotuj animowaną mapę tras lotów pokazującą węzły miast, rozwój tras, dane o milach i końcową klatkę podsumowania",
    ],
    audio: [
      "Wygeneruj dźwięk uruchomienia produktu, który brzmi lekko, godnie zaufania, lekko futurystycznie i pasuje do premiery aplikacji desktopowej",
      "Stwórz 20-sekundowy podkład intro do podcastu z ciepłym otwarciem, wyraźnym pulsem i czystym przejściem w lektora",
      "Przygotuj bezszwową pętlę ambientową do aplikacji do medytacji z miękkimi teksturami natury, niskoczęstotliwościowym ciepłem i spokojnym tempem",
      "Wygeneruj markowy zestaw dźwięków powiadomień dla statusów sukcesu, przypomnienia i błędu, zachowując jedną tożsamość dźwiękową",
    ],
  },
  "hu": {
    prototype: [
      "Tervezz magas konverziójú weboldalt egy AI CRM számára, jól látható hero szekcióval, funkciókat bemutató történettel, bizonyítékokkal és próbaverziós CTA-val",
      "Készíts asztali irányítópultot egy csapat tudásbázisához kereséssel, friss frissítésekkel, jogosultságokkal és együttműködési belépési pontokkal",
      "Tervezd újra egy pénzügyi SaaS termék bevezetését, hogy az új felhasználók gyorsan összekapcsolhassák az adatokat, befejezhessék a beállítást és megtapasztalhassák az első értéket",
      "Készíts prototípust egy mobil fitneszedző alkalmazáshoz, amely lefedi a célok kitűzését, a heti terveket, az edzések bejelentkezését és a haladás áttekintését",
    ],
    deck: [
      "Kutasd fel egy termékbevezetés piaci lehetőségeit, beleértve a versenytársakat, a célközönséget, az árazási hipotéziseket és a bevezetési narratívát",
      "Készíts heti csapatállapot-jelentést a haladással, kockázatokkal, metrikák változásaival és a következő heti prioritásokkal",
      "Tervezz befektetői prezentációt piacméretezéssel, növekedési modellel, termékelőnyökkel és hároméves előrejelzési adatokkal",
      "Készíts stratégiai üzleti áttekintő prezentációt, amely lefedi a negyedéves teljesítményt, a kiváltó okokat, a lehetőségeket és a következő lépéseket",
    ],
    image: [
      "Készíts glassmorphism stílusú AI munkaterület-posztert többképernyős együttműködéssel, lágy megvilágítással és prémium bevezetési hangulattal",
      "Készíts e-kereskedelmi hero képet egy új vezeték nélküli fejhallgatóhoz, amely kiemeli az anyag részleteit, az életstílus-kontextust és a fő előnyöket",
      "Tervezz minimalista tech bevezetési kulcsvizuált letisztult kompozícióval, erős termékfókusszal és visszafogott bevezetési szöveggel",
      "Készíts közösségi teaser-csomagot egy termékmegjelenéshez visszaszámlálással, közeli részlettel, előnyök bemutatásával és a megjelenés napi vizuáljával",
    ],
    video: [
      "Készíts 8 másodperces termékbemutató filmet, amely a sziluettől a közeli részletekig halad, és a márkajelzéssel zárul",
      "Készíts app funkciót bemutató videót, amely követi a felhasználói utat, a kulcsállapotokat és a végeredményt",
      "Készíts függőleges márkanyitót ritmikus tipográfiával, közeli termékfelvételekkel és letisztult logo-zárással rövid videókhoz",
      "Alakíts át egy weboldalt 15 másodperces közösségi hirdetéssé a hero üzenet, az interakciós kiemelések és egy egyértelmű CTA kiemelésével",
    ],
    hyperframes: [
      "Építs feliratozott termékbevezetési rövidfilmet címkártyákkal, funkciófelvételekkel, ritmikus átmenetekkel és záró CTA-val",
      "Készíts hangra reagáló adatvizualizációt, ahol az oszlopok, részecskék és feliratok a narráció ritmusára válaszolnak",
      "Készíts 3 másodperces logo-zárót vonalak összetartásával, finom rugalmassággal és a márka színrendszerével",
      "Készíts animált útvonaltérképet, amely városcsomópontokat, útvonalak növekedését, távolsági adatokat és egy záró összefoglaló képkockát mutat",
    ],
    audio: [
      "Készíts termékindítási hangot, amely könnyed, megbízható, kissé futurisztikus, és alkalmas egy asztali app indításához",
      "Készíts 20 másodperces podcast intro alapot meleg nyitással, tiszta lüktetéssel és letisztult átmenettel a narrációba",
      "Készíts zökkenőmentes ambient loopot egy meditációs apphoz lágy természeti textúrákkal, mély frekvenciás melegséggel és nyugodt tempóval",
      "Készíts márkázott értesítési hangcsomagot a sikeres, emlékeztető és hiba állapotokhoz, megőrizve egyetlen hangzásbeli identitást",
    ],
  },
  "fr": {
    prototype: [
      "Concevez un site web à fort taux de conversion pour un AI CRM, avec un hero clair, un récit des fonctionnalités, des preuves concrètes et un CTA d'essai",
      "Créez un dashboard desktop pour une base de connaissances d'équipe, avec recherche, mises à jour récentes, permissions et points d'entrée vers la collaboration",
      "Repensez l'onboarding d'un produit SaaS financier pour que les nouveaux utilisateurs puissent connecter leurs données, terminer la configuration et constater rapidement une première valeur",
      "Prototypez une app mobile de coaching fitness couvrant la définition des objectifs, les plans hebdomadaires, le suivi des séances et le bilan de progression",
    ],
    deck: [
      "Étudiez l'opportunité de marché d'un lancement de produit, avec les concurrents, les utilisateurs cibles, les hypothèses de prix et le récit de lancement",
      "Générez un rapport d'avancement hebdomadaire de l'équipe avec les progrès, les risques, l'évolution des métriques et les priorités de la semaine prochaine",
      "Concevez un pitch investisseurs avec le dimensionnement du marché, le modèle de croissance, l'avantage produit et des prévisions sur trois ans",
      "Créez un deck de revue stratégique couvrant la performance trimestrielle, les causes profondes, les opportunités et les prochaines actions",
    ],
    image: [
      "Générez une affiche d'espace de travail AI en glassmorphism, avec collaboration multi-écrans, lumière douce et une ambiance de lancement premium",
      "Créez une image hero e-commerce pour un nouveau casque sans fil, mettant en valeur le détail des matériaux, le contexte lifestyle et les bénéfices clés",
      "Concevez un key visual minimaliste de lancement tech, avec une composition épurée, un fort focus produit et un texte de lancement sobre",
      "Réalisez une série de teasers sociaux pour une sortie produit, avec compte à rebours, détail en gros plan, révélation des bénéfices et visuel du jour J",
    ],
    video: [
      "Réalisez un film de révélation produit de 8 secondes qui passe de la silhouette au gros plan et se termine sur la signature de la marque",
      "Générez une vidéo de démo des fonctionnalités d'une app qui suit le parcours utilisateur, les états clés et le résultat final",
      "Créez une ouverture de marque verticale avec une typographie rythmée, des gros plans produit et une fin sur logo épurée pour la vidéo short",
      "Transformez un site web en une publicité sociale de 15 secondes en extrayant l'accroche hero, les temps forts d'interaction et un CTA clair",
    ],
    hyperframes: [
      "Créez un short de lancement produit sous-titré avec cartons de titre, plans des fonctionnalités, transitions rythmées et un CTA de fin",
      "Générez une visualisation de données réactive à l'audio où barres, particules et titres répondent au rythme de la narration",
      "Créez un outro de logo de 3 secondes avec convergence de lignes, légère élasticité et le système de couleurs de la marque",
      "Réalisez une carte animée d'itinéraires aériens montrant les nœuds des villes, la croissance des routes, les données de kilométrage et un cadre de synthèse final",
    ],
    audio: [
      "Générez un son de démarrage produit léger, rassurant, légèrement futuriste et adapté au lancement d'une app desktop",
      "Créez un lit sonore d'intro de podcast de 20 secondes avec une ouverture chaleureuse, une pulsation nette et un enchaînement propre vers la voix off",
      "Réalisez une boucle d'ambiance fluide pour une app de méditation, avec de douces textures naturelles, une chaleur basse fréquence et un rythme apaisant",
      "Générez un jeu de sons de notification de marque pour les états de succès, de rappel et d'erreur, en conservant une seule identité sonore",
    ],
  },
  "uk": {
    prototype: [
      "Створіть вебсайт із високою конверсією для AI CRM із чітким hero-блоком, історією про функції, доказами цінності та CTA для пробного доступу",
      "Створіть десктопний дашборд для командної бази знань із пошуком, останніми оновленнями, правами доступу та точками входу для співпраці",
      "Переробіть онбординг для фінансового SaaS-продукту, щоб нові користувачі могли підключити дані, завершити налаштування та швидко побачити першу цінність",
      "Зробіть прототип мобільного застосунку для фітнес-коучингу з постановкою цілей, тижневими планами, відмітками тренувань і переглядом прогресу",
    ],
    deck: [
      "Дослідіть ринкову можливість для запуску продукту, включно з конкурентами, цільовою аудиторією, гіпотезами щодо цін і наративом запуску",
      "Згенеруйте щотижневий звіт про стан команди з прогресом, ризиками, змінами метрик і пріоритетами на наступний тиждень",
      "Створіть інвесторську презентацію з оцінкою ринку, моделлю зростання, перевагами продукту та прогнозом на три роки",
      "Створіть презентацію стратегічного огляду бізнесу з квартальними результатами, першопричинами, можливостями та наступними кроками",
    ],
    image: [
      "Згенеруйте постер AI-робочого простору в стилі glassmorphism із багатоекранною співпрацею, м’яким освітленням і преміальним настроєм запуску",
      "Створіть hero-зображення для онлайн-магазину з новими бездротовими навушниками, що підкреслює деталі матеріалу, контекст способу життя та основні переваги",
      "Створіть мінімалістичний ключовий візуал для технологічного запуску з чистою композицією, сильним акцентом на продукт і стриманим текстом",
      "Зробіть набір соціальних тизерів для виходу продукту: відлік часу, деталі крупним планом, розкриття переваг і візуал у день запуску",
    ],
    video: [
      "Зробіть 8-секундний ролик-розкриття продукту, що переходить від силуету до деталей крупним планом і завершується знаком бренду",
      "Згенеруйте відео з демонстрацією функцій застосунку, що повторює шлях користувача, ключові стани та фінальний результат",
      "Створіть вертикальну заставку бренду з ритмічною типографікою, продуктом крупним планом і чистим завершенням з logo для короткого відео",
      "Перетворіть вебсайт на 15-секундну соціальну рекламу, виділивши головну тезу, ключові взаємодії та чіткий CTA",
    ],
    hyperframes: [
      "Створіть короткий ролик про запуск продукту з субтитрами, титрами, кадрами функцій, ритмічними переходами та фінальним CTA",
      "Згенеруйте візуалізацію даних, що реагує на звук, де смуги, частинки й заголовки відповідають ритму озвучення",
      "Створіть 3-секундну фінальну заставку з logo, використовуючи сходження ліній, легку пружність і колірну систему бренду",
      "Зробіть анімовану карту авіамаршрутів із вузлами міст, ростом маршрутів, даними про відстань і фінальним кадром-підсумком",
    ],
    audio: [
      "Згенеруйте звук запуску продукту, що звучить легко, надійно, трохи футуристично й підходить для запуску десктопного app",
      "Створіть 20-секундну музичну підкладку для вступу подкасту з теплим початком, чітким пульсом і плавним переходом до озвучення",
      "Зробіть безшовний ембієнт-луп для застосунку медитації з м’якими природними текстурами, низькочастотним теплом і спокійним темпом",
      "Згенеруйте набір фірмових звуків сповіщень для станів успіху, нагадування та помилки, зберігаючи єдину звукову ідентичність",
    ],
  },
  "tr": {
    prototype: [
      "AI CRM için net bir hero alanı, özellik hikayesi, kanıt noktaları ve deneme CTA'sı içeren, dönüşümü yüksek bir website tasarla",
      "Bir ekip bilgi tabanı için arama, son güncellemeler, izinler ve iş birliği giriş noktaları içeren bir masaüstü kontrol paneli oluştur",
      "Finansal bir SaaS ürününün onboarding sürecini, yeni kullanıcılar verilerini bağlayabilsin, kurulumu tamamlayabilsin ve ilk değeri hızla görebilsin diye yeniden tasarla",
      "Hedef belirleme, haftalık planlar, antrenman check-in'leri ve ilerleme takibini kapsayan bir mobil fitness koçluğu app'i prototiple",
    ],
    deck: [
      "Bir ürün lansmanı için rakipler, hedef kullanıcılar, fiyatlandırma hipotezleri ve lansman anlatısı dahil olmak üzere pazar fırsatını araştır",
      "İlerleme, riskler, metrik değişimleri ve gelecek haftanın önceliklerini içeren haftalık bir ekip durum raporu oluştur",
      "Pazar büyüklüğü, büyüme modeli, ürün avantajı ve üç yıllık tahmin verilerini içeren bir yatırımcı sunumu tasarla",
      "Çeyreklik performans, kök nedenler, fırsatlar ve sonraki adımları kapsayan stratejik bir iş değerlendirme sunumu oluştur",
    ],
    image: [
      "Çok ekranlı iş birliği, yumuşak ışıklandırma ve premium bir lansman atmosferi içeren glassmorphism tarzı bir AI çalışma alanı posteri oluştur",
      "Malzeme detaylarını, yaşam tarzı bağlamını ve temel faydaları öne çıkaran, yeni kablosuz kulaklıklar için bir e-ticaret hero görseli oluştur",
      "Sade bir kompozisyon, güçlü bir ürün odağı ve ölçülü lansman metni içeren minimalist bir teknoloji lansmanı ana görseli tasarla",
      "Geri sayım, yakın çekim detay, fayda tanıtımı ve lansman günü görseli içeren bir ürün lansmanı sosyal medya teaser seti hazırla",
    ],
    video: [
      "Silüetten yakın çekim detaya geçen ve marka logosuyla biten 8 saniyelik bir ürün tanıtım filmi hazırla",
      "Kullanıcı yolculuğunu, temel ekranları ve nihai sonucu takip eden bir app özellik demo videosu oluştur",
      "Kısa form videolar için ritmik tipografi, ürün yakın çekimleri ve sade bir logo finali içeren dikey bir marka açılışı oluştur",
      "Bir website'ı hero iddiasını, etkileşim öne çıkanlarını ve net bir CTA'yı çıkararak 15 saniyelik bir sosyal medya reklamına dönüştür",
    ],
    hyperframes: [
      "Başlık kartları, özellik çekimleri, ritmik geçişler ve bir bitiş CTA'sı içeren altyazılı kısa bir ürün lansmanı videosu oluştur",
      "Çubukların, parçacıkların ve başlıkların anlatım ritmine tepki verdiği, sese duyarlı bir veri görselleştirmesi oluştur",
      "Çizgi birleşimi, ince bir esneklik ve marka renk sistemini kullanan 3 saniyelik bir logo outro'su oluştur",
      "Şehir düğümleri, rota büyümesi, mesafe verileri ve son bir özet kareyi gösteren animasyonlu bir uçuş rotası haritası hazırla",
    ],
    audio: [
      "Hafif, güven veren, hafifçe fütüristik bir his veren ve bir masaüstü app lansmanına uygun bir ürün açılış sesi oluştur",
      "Sıcak bir açılış, net bir nabız ve seslendirmeye temiz bir geçiş içeren 20 saniyelik bir podcast intro müziği oluştur",
      "Yumuşak doğa dokuları, düşük frekanslı sıcaklık ve sakin bir tempo kullanan bir meditasyon app'i için kusursuz bir ambiyans döngüsü hazırla",
      "Tek bir sonik kimliği korurken başarı, hatırlatma ve hata durumları için markalı bir bildirim sesi seti oluştur",
    ],
  },
  "th": {
    prototype: [
      "ออกแบบเว็บไซต์ที่กระตุ้นการเปลี่ยนเป็นลูกค้าสำหรับ AI CRM พร้อม hero ที่ชัดเจน เรื่องราวฟีเจอร์ จุดพิสูจน์ความน่าเชื่อถือ และ CTA ทดลองใช้",
      "สร้างแดชบอร์ดบนเดสก์ท็อปสำหรับฐานความรู้ของทีม พร้อมการค้นหา อัปเดตล่าสุด สิทธิ์การเข้าถึง และจุดเริ่มต้นการทำงานร่วมกัน",
      "ออกแบบขั้นตอนเริ่มต้นใช้งานใหม่สำหรับผลิตภัณฑ์ SaaS ด้านการเงิน เพื่อให้ผู้ใช้ใหม่เชื่อมต่อข้อมูล ตั้งค่าให้เสร็จ และเห็นคุณค่าแรกได้อย่างรวดเร็ว",
      "ทำต้นแบบ app โค้ชฟิตเนสบนมือถือ ครอบคลุมการตั้งเป้าหมาย แผนรายสัปดาห์ การเช็กอินการออกกำลังกาย และการทบทวนความคืบหน้า",
    ],
    deck: [
      "วิจัยโอกาสทางการตลาดสำหรับการเปิดตัวผลิตภัณฑ์ รวมถึงคู่แข่ง กลุ่มผู้ใช้เป้าหมาย สมมติฐานด้านราคา และเรื่องราวการเปิดตัว",
      "สร้างรายงานสถานะของทีมรายสัปดาห์ พร้อมความคืบหน้า ความเสี่ยง การเปลี่ยนแปลงของตัวชี้วัด และสิ่งที่ต้องทำในสัปดาห์หน้า",
      "ออกแบบ pitch สำหรับนักลงทุน พร้อมการประเมินขนาดตลาด โมเดลการเติบโต จุดเด่นของผลิตภัณฑ์ และข้อมูลคาดการณ์สามปี",
      "สร้างเด็คทบทวนกลยุทธ์ธุรกิจ ครอบคลุมผลงานรายไตรมาส สาเหตุที่แท้จริง โอกาส และสิ่งที่ต้องทำต่อไป",
    ],
    image: [
      "สร้างโปสเตอร์พื้นที่ทำงาน AI สไตล์ glassmorphism พร้อมการทำงานร่วมกันหลายหน้าจอ แสงนวลตา และอารมณ์การเปิดตัวที่หรูหรา",
      "สร้างภาพ hero สำหรับอีคอมเมิร์ซของหูฟังไร้สายรุ่นใหม่ ที่เน้นรายละเอียดของวัสดุ บริบทการใช้งานจริง และประโยชน์หลัก",
      "ออกแบบคีย์วิชวลเปิดตัวเทคโนโลยีสไตล์มินิมอล พร้อมองค์ประกอบที่สะอาดตา เน้นผลิตภัณฑ์ชัดเจน และข้อความเปิดตัวที่กระชับ",
      "ทำชุดภาพทีเซอร์สำหรับโซเชียลของการเปิดตัวผลิตภัณฑ์ รวมถึงนับถอยหลัง ภาพระยะใกล้ การเผยประโยชน์ และภาพในวันเปิดตัว",
    ],
    video: [
      "ทำหนังเปิดตัวผลิตภัณฑ์ความยาว 8 วินาที ที่ไล่จากภาพเงาไปสู่รายละเอียดระยะใกล้ และจบด้วยเครื่องหมายแบรนด์",
      "สร้างวิดีโอสาธิตฟีเจอร์ของ app ที่ดำเนินไปตามเส้นทางของผู้ใช้ สถานะสำคัญ และผลลัพธ์สุดท้าย",
      "สร้างวิดีโอเปิดแบรนด์แนวตั้งสำหรับคลิปสั้น พร้อมตัวอักษรที่เคลื่อนไหวเป็นจังหวะ ภาพผลิตภัณฑ์ระยะใกล้ และจบด้วย logo ที่สะอาดตา",
      "เปลี่ยนเว็บไซต์ให้เป็นโฆษณาโซเชียลความยาว 15 วินาที โดยดึงข้อความ hero ไฮไลต์การโต้ตอบ และ CTA ที่ชัดเจน",
    ],
    hyperframes: [
      "สร้างคลิปสั้นเปิดตัวผลิตภัณฑ์พร้อมคำบรรยาย ด้วยการ์ดหัวเรื่อง ภาพฟีเจอร์ การเปลี่ยนฉากเป็นจังหวะ และ CTA ตอนจบ",
      "สร้างการแสดงผลข้อมูลที่ตอบสนองต่อเสียง โดยแท่งกราฟ อนุภาค และหัวเรื่องขยับตามจังหวะการบรรยาย",
      "สร้าง outro ของ logo ความยาว 3 วินาที โดยใช้เส้นที่ลู่เข้าหากัน ความยืดหยุ่นเล็กน้อย และระบบสีของแบรนด์",
      "ทำแผนที่เส้นทางการบินแบบเคลื่อนไหว ที่แสดงจุดเมือง การขยายเส้นทาง ข้อมูลระยะทาง และเฟรมสรุปตอนจบ",
    ],
    audio: [
      "สร้างเสียงเปิดผลิตภัณฑ์ที่ให้ความรู้สึกเบาสบาย น่าเชื่อถือ ล้ำสมัยเล็กน้อย และเหมาะกับการเปิดตัว app บนเดสก์ท็อป",
      "สร้างดนตรีเปิดพอดแคสต์ความยาว 20 วินาที พร้อมการเปิดที่อบอุ่น จังหวะที่ชัดเจน และส่งต่อเข้าสู่เสียงบรรยายอย่างราบรื่น",
      "ทำลูปเสียงบรรยากาศแบบไร้รอยต่อสำหรับ app นั่งสมาธิ โดยใช้พื้นผิวเสียงธรรมชาติที่นุ่มนวล ความอบอุ่นของย่านความถี่ต่ำ และจังหวะที่ผ่อนคลาย",
      "สร้างชุดเสียงแจ้งเตือนของแบรนด์สำหรับสถานะสำเร็จ เตือนความจำ และข้อผิดพลาด โดยคงเอกลักษณ์เสียงเดียวกันไว้",
    ],
  },
  "it": {
    prototype: [
      "Progetta un sito web ad alta conversione per un AI CRM con una hero chiara, lo storytelling delle funzionalità, prove concrete e una CTA per la prova gratuita",
      "Crea una dashboard desktop per la knowledge base di un team con ricerca, aggiornamenti recenti, permessi e punti di accesso alla collaborazione",
      "Riprogetta l'onboarding di un prodotto SaaS finanziario per far sì che i nuovi utenti colleghino i dati, completino la configurazione e vedano subito il primo valore",
      "Prototipa una app mobile di coaching fitness che copra l'impostazione degli obiettivi, i piani settimanali, il check-in degli allenamenti e la revisione dei progressi",
    ],
    deck: [
      "Analizza l'opportunità di mercato per il lancio di un prodotto, inclusi concorrenti, utenti target, ipotesi di prezzo e narrativa di lancio",
      "Genera un report settimanale sullo stato del team con avanzamenti, rischi, variazioni delle metriche e priorità per la prossima settimana",
      "Progetta un pitch per investitori con dimensionamento del mercato, modello di crescita, vantaggio del prodotto e previsioni a tre anni",
      "Crea una deck di business review strategica che copra le performance trimestrali, le cause profonde, le opportunità e le prossime azioni",
    ],
    image: [
      "Genera un poster di un AI workspace in stile glassmorphism con collaborazione multi-schermo, luci soffuse e un mood di lancio premium",
      "Crea una hero image ecommerce per delle nuove cuffie wireless che metta in risalto i dettagli dei materiali, il contesto lifestyle e i benefici principali",
      "Progetta un key visual minimalista per un lancio tech con una composizione pulita, un forte focus sul prodotto e un copy di lancio essenziale",
      "Realizza un set di teaser social per il drop di un prodotto, con countdown, dettaglio in primo piano, rivelazione dei benefici e visual per il giorno del lancio",
    ],
    video: [
      "Realizza un product reveal di 8 secondi che passa dalla silhouette al dettaglio in primo piano e si chiude sul brand mark",
      "Genera un video demo delle funzionalità di una app che segue il percorso dell'utente, gli stati chiave e il risultato finale",
      "Crea un brand opener verticale con tipografia ritmica, primi piani del prodotto e una chiusura pulita sul logo per i video short-form",
      "Trasforma un sito web in un annuncio social di 15 secondi estraendo la hero claim, i momenti chiave dell'interazione e una CTA chiara",
    ],
    hyperframes: [
      "Crea uno short di lancio prodotto con sottotitoli, title card, riprese delle funzionalità, transizioni ritmiche e una CTA finale",
      "Genera una visualizzazione dati audio-reattiva in cui barre, particelle e titoli reagiscono al ritmo della narrazione",
      "Crea un outro del logo di 3 secondi con convergenza di linee, una leggera elasticità e il sistema di colori del brand",
      "Realizza una mappa animata di rotte di volo che mostra i nodi delle città, la crescita delle rotte, i dati di chilometraggio e un frame riassuntivo finale",
    ],
    audio: [
      "Genera un suono di avvio prodotto che risulti leggero, affidabile, leggermente futuristico e adatto al lancio di una app desktop",
      "Crea un intro bed per podcast di 20 secondi con un'apertura calda, un pulse chiaro e un passaggio pulito verso il voiceover",
      "Realizza un loop ambient continuo per una app di meditazione con texture naturali soffuse, calore sulle basse frequenze e un ritmo calmo",
      "Genera un set di suoni di notifica brandizzati per gli stati di successo, promemoria ed errore mantenendo un'unica identità sonora",
    ],
  },
};

export const HOME_PROMPT_EXAMPLE_CHIP_IDS = [
  'prototype',
  'deck',
  'image',
  'video',
  'hyperframes',
  'audio',
] as const;

// Every supported locale must resolve its own localized example prompts; a
// missing locale entry would silently bleed English into the home composer,
// which is the regression this table exists to prevent.
export function homeHeroChipPromptExamplesForLocale(chipId: string, locale: Locale): string[] {
  return HOME_PROMPT_EXAMPLES[locale]?.[chipId] ?? HOME_PROMPT_EXAMPLES.en[chipId] ?? [];
}

function homeHeroChipPromptExamples(chipId: string, locale: Locale): string[] {
  return homeHeroChipPromptExamplesForLocale(chipId, locale);
}

type PromptLocaleKind = 'zh' | 'ja' | 'en';

function promptLocaleKind(locale: Locale): PromptLocaleKind {
  if (locale === 'zh-CN' || locale === 'zh-TW') return 'zh';
  if (locale === 'ja') return 'ja';
  return 'en';
}

function briefForChipId(chipId: string): Record<string, string> {
  switch (chipId) {
    case 'prototype':
      return { artifact_type: 'web prototype', audience: 'product evaluators', fidelity: 'high-fidelity' };
    case 'deck':
      return { artifact_type: 'pitch deck / presentation', audience: 'decision makers', slide_count: '10-15 pages' };
    case 'image':
      return { artifact_type: 'image', style: 'cinematic, high-quality, on-brand' };
    case 'video':
      return { artifact_type: 'video', style: 'cinematic, high-quality, on-brand' };
    case 'hyperframes':
      return { artifact_type: 'motion graphic / animated sequence', style: 'cinematic, polished transitions' };
    case 'audio':
      return { artifact_type: 'audio', style: 'professional, polished, brand-appropriate' };
    default:
      return { artifact_type: chipId };
  }
}

function briefForPluginPreset(record: InstalledPluginRecord, chipId: string): Record<string, string> {
  const brief: Record<string, string> = { ...briefForChipId(chipId) };
  const fields = record.manifest?.od?.inputs ?? [];
  for (const field of fields) {
    const value = field.default ?? field.placeholder;
    if (value != null && typeof value === 'string' && value.trim()) {
      brief[field.name] = value;
    }
  }
  return brief;
}
