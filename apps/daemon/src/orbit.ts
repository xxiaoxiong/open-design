import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import type { OrbitRunSummary, OrbitStatusResponse } from '@open-design/contracts/api/orbit';

import type { OrbitConfigPrefs } from './app-config.js';

export interface OrbitConnectorRunResult {
  connectorId: string;
  connectorName: string;
  accountLabel?: string;
  toolName?: string;
  toolTitle?: string;
  status: 'succeeded' | 'skipped' | 'failed';
  summary: string;
  error?: string;
}

export interface OrbitActivitySummary extends OrbitRunSummary {
  id: string;
  startedAt: string;
  completedAt: string;
  trigger: 'manual' | 'scheduled';
  templateSkillId?: string | null;
  connectorsChecked: number;
  connectorsSucceeded: number;
  connectorsFailed: number;
  connectorsSkipped: number;
  artifactId?: string;
  artifactProjectId?: string;
  agentRunId?: string;
  markdown: string;
  results: OrbitConnectorRunResult[];
}

export interface OrbitAgentRunResult {
  agentRunId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  artifactId?: string;
  artifactProjectId?: string;
  summary?: string;
}

export interface OrbitRunHandlerStart {
  projectId: string;
  agentRunId: string;
  completion: Promise<OrbitAgentRunResult>;
}

export interface OrbitTemplateSelection {
  id: string;
  name: string;
  examplePrompt: string;
  dir: string;
  body: string;
  designSystemRequired: boolean;
}

export type OrbitRunHandler = (request: {
  runId: string;
  trigger: 'manual' | 'scheduled';
  startedAt: string;
  prompt: string;
  systemPrompt: string;
  template: OrbitTemplateSelection | null;
}) => Promise<OrbitRunHandlerStart>;

export function formatLocalProjectTimestamp(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatLocalOrbitPromptTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const timeZoneName = new Intl.DateTimeFormat(undefined, { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}${timeZoneName ? ` (${timeZoneName})` : ''}`;
}

export type OrbitTemplateResolver = (skillId: string) => Promise<OrbitTemplateSelection | null>;

export interface OrbitStatus extends OrbitStatusResponse {
  config: OrbitConfigPrefs;
  running: boolean;
  nextRunAt: string | null;
  lastRun: OrbitActivitySummary | null;
  lastRunsByTemplate: Record<string, OrbitActivitySummary>;
}

export const DEFAULT_ORBIT_CONFIG: OrbitConfigPrefs = {
  enabled: false,
  time: '08:00',
  // Default to the general-purpose Orbit briefing skill so the daemon
  // runs an adaptive template out of the box. Mirrors apps/web's
  // DEFAULT_ORBIT — both surfaces must agree on the seed value to avoid
  // a "default in UI, null on disk" drift after the first save.
  templateSkillId: 'orbit-general',
};

const SUMMARY_FILE = 'activity-summary.json';

interface OrbitSummaryStore {
  lastRun: OrbitActivitySummary | null;
  lastRunsByTemplate: Record<string, OrbitActivitySummary>;
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function normalizeOrbitConfig(config: Partial<OrbitConfigPrefs> | undefined): OrbitConfigPrefs {
  const time = typeof config?.time === 'string' && isValidOrbitTime(config.time)
    ? config.time
    : DEFAULT_ORBIT_CONFIG.time;
  const hasTemplateSkillId = config !== undefined && 'templateSkillId' in config;
  const defaultTemplateSkillId = DEFAULT_ORBIT_CONFIG.templateSkillId ?? null;
  return {
    enabled: Boolean(config?.enabled),
    time,
    templateSkillId: !hasTemplateSkillId
      ? defaultTemplateSkillId
      : typeof config?.templateSkillId === 'string' && config.templateSkillId.trim()
        ? config.templateSkillId.trim()
        : null,
  };
}

function orbitDir(dataDir: string): string {
  return path.join(dataDir, 'orbit');
}

function summaryFile(dataDir: string): string {
  return path.join(orbitDir(dataDir), SUMMARY_FILE);
}

async function readLastSummary(dataDir: string): Promise<OrbitActivitySummary | null> {
  return (await readSummaryStore(dataDir)).lastRun;
}

function isOrbitRunSummary(value: unknown): value is OrbitActivitySummary {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<OrbitActivitySummary>;
  return (
    typeof obj.completedAt === 'string' &&
    typeof obj.connectorsChecked === 'number' &&
    typeof obj.connectorsSucceeded === 'number' &&
    typeof obj.connectorsFailed === 'number' &&
    typeof obj.connectorsSkipped === 'number' &&
    typeof obj.markdown === 'string'
  );
}

function normalizeSummaryStore(raw: unknown): OrbitSummaryStore {
  if (isOrbitRunSummary(raw)) {
    const templateSkillId = typeof raw.templateSkillId === 'string' && raw.templateSkillId.trim()
      ? raw.templateSkillId.trim()
      : null;
    return {
      lastRun: templateSkillId ? { ...raw, templateSkillId } : raw,
      lastRunsByTemplate: templateSkillId ? { [templateSkillId]: { ...raw, templateSkillId } } : {},
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { lastRun: null, lastRunsByTemplate: {} };
  }
  const obj = raw as {
    lastRun?: unknown;
    lastRunsByTemplate?: Record<string, unknown>;
  };
  const lastRun = isOrbitRunSummary(obj.lastRun) ? obj.lastRun : null;
  const lastRunsByTemplate: Record<string, OrbitActivitySummary> = {};
  for (const [templateSkillId, summary] of Object.entries(obj.lastRunsByTemplate ?? {})) {
    if (!templateSkillId || !isOrbitRunSummary(summary)) continue;
    lastRunsByTemplate[templateSkillId] = {
      ...summary,
      templateSkillId,
    };
  }
  if (lastRun && typeof lastRun.templateSkillId === 'string' && lastRun.templateSkillId.trim()) {
    const templateSkillId = lastRun.templateSkillId.trim();
    if (!lastRunsByTemplate[templateSkillId]) {
      lastRunsByTemplate[templateSkillId] = { ...lastRun, templateSkillId };
    }
  }
  return { lastRun, lastRunsByTemplate };
}

async function readSummaryStore(dataDir: string): Promise<OrbitSummaryStore> {
  let raw: string;
  try {
    raw = await readFile(summaryFile(dataDir), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { lastRun: null, lastRunsByTemplate: {} };
    }
    throw error;
  }

  try {
    return normalizeSummaryStore(JSON.parse(raw) as unknown);
  } catch {
    return { lastRun: null, lastRunsByTemplate: {} };
  }
}

async function writeLastSummary(dataDir: string, summary: OrbitActivitySummary): Promise<void> {
  const store = await readSummaryStore(dataDir);
  const dir = orbitDir(dataDir);
  await mkdir(dir, { recursive: true });
  const target = summaryFile(dataDir);
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
  const templateSkillId = typeof summary.templateSkillId === 'string' && summary.templateSkillId.trim()
    ? summary.templateSkillId.trim()
    : null;
  const nextStore: OrbitSummaryStore = {
    lastRun: summary,
    lastRunsByTemplate: templateSkillId
      ? {
          ...store.lastRunsByTemplate,
          [templateSkillId]: {
            ...summary,
            templateSkillId,
          },
        }
      : store.lastRunsByTemplate,
  };
  await writeFile(tmp, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

function nextDailyRunAt(time: string, now = new Date()): Date {
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const next = new Date(now);
  next.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function renderMarkdown(summary: Omit<OrbitActivitySummary, 'markdown'>): string {
  const lines = [
    `# Daily Orbit Activity Summary`,
    '',
    `Generated: ${summary.completedAt}`,
    `Trigger: ${summary.trigger}`,
    '',
    `Checked ${summary.connectorsChecked} connector(s): ${summary.connectorsSucceeded} succeeded, ${summary.connectorsSkipped} skipped, ${summary.connectorsFailed} failed.`,
    '',
  ];
  for (const result of summary.results) {
    const title = result.accountLabel ? `${result.connectorName} (${result.accountLabel})` : result.connectorName;
    lines.push(`## ${title}`);
    lines.push(`- Status: ${result.status}`);
    if (result.toolTitle || result.toolName) lines.push(`- Tool: ${result.toolTitle ?? result.toolName}`);
    lines.push(`- Summary: ${result.summary}`);
    if (result.error) lines.push(`- Error: ${result.error}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function buildOrbitPrompt(now = new Date(), template?: OrbitTemplateSelection | null, locale = 'en'): string {
  const end = formatLocalOrbitPromptTimestamp(now);
  const start = formatLocalOrbitPromptTimestamp(new Date(now.getTime() - 24 * 60 * 60_000));

  if (locale === 'zh-CN' || locale === 'zh-TW') {
    const lines = [
      '创建今天的 Orbit 每日摘要作为 Live Artifact。',
      '',
      `使用我从 ${start} 到 ${end} 的已连接工作数据。`,
    ];
    if (template) {
      lines.push('', `使用选定的 Orbit 模板：${template.name}。`);
    }
    return lines.join('\n');
  }

  const lines = [
    'Create today\'s Orbit daily digest as a Live Artifact.',
    '',
    `Use my connected work data from ${start} through ${end}.`,
  ];
  if (template) {
    lines.push('', `Use the selected Orbit template: ${template.name}.`);
  }
  return lines.join('\n');
}

export function buildOrbitSystemPrompt(now = new Date(), template?: OrbitTemplateSelection | null, locale = 'en'): string {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  if (locale === 'zh-CN' || locale === 'zh-TW') {
    const lines = [
      '创建一个 Live Artifact：一份精美的每日摘要，帮助普通人理解在过去 24 小时内其已连接的工作数据发生了什么变化，以及他们接下来应该做什么。',
      '',
      `时间窗口：${start} 到 ${end}。`,
      '',
      '自主工作。不要提出后续问题，不要生成问题表单，不要等待用户输入。使用合理的默认值并继续。',
      '优化快速完成：最多采样 3 个相关数据源。需要每日摘要连接器筛选（如果支持）：首先运行 `tools connectors list --use-case personal_daily_digest --format compact`，超时时间为 120 秒，如果该筛选列表命令超时或未返回输出，请使用另一个 120 秒超时重试一次。如果筛选命令不受支持、被拒绝或成功但未返回可用工具，立即回退到通过 `tools connectors list --format compact` 的未过滤只读列表；不要仅因为 `--use-case` 不受支持就停止。如果连接器发现仍然失败，或者筛选列表和回退列表都产生零个可用的已连接只读数据工具，不要创建空状态 artifact；发送一条简洁的最终消息，说明数据加载失败并停止。对于发现成功后的单个源调用，如果源因身份验证、权限、超时、格式错误的输出、空输出、超大输出或任何其他数据加载问题而失败，不要陷入尝试修复它的困境；放弃该源并继续处理其他源。在 artifact 成功注册后，发送一条包含 artifact id 的简洁最终消息并停止。',
      '',
      '使用 live-artifact 技能来创作和注册 artifact。首选筛选的每日摘要连接器列表：`tools connectors list --use-case personal_daily_digest --format compact`。如果该命令不受支持、被拒绝或未返回可用工具，则回退到未过滤的只读列表。然后仅调用有用摘要所需的工具。',
      '- 优先选择可以限定在此 24 小时窗口内的最近活动、搜索、列表、更新或更改项目工具。',
      '- 避免使用提供者元数据、api_root、schema、health、status、广泛的 fetch_all 或块内容转储工具，除非它们确实必要。',
      '- 当工具需要输入文件时，在 `.daily-digest-tmp/` 下写入一个小的 JSON 文件（如果缺失则创建它）。项目根目录下的文件会显示在面向用户的设计文件面板中，而点前缀路径是隐藏的。重试同一工具时重用相同路径。',
      '- 永远不要在 artifact 文件中持久化原始响应或敏感字段。排除标头、cookie、授权值、令牌、密钥、凭据、密码、堆栈跟踪和无界原始有效负载。',
      '',
      '刷新支持：',
      '- 如果至少一个只读数据调用成功，使用 live-artifact 架构在 `document.sourceJson` 中注册一个刷新源，以便手动刷新按钮稍后可以更新摘要。',
      '- 选择最具代表性的成功只读数据调用，通常是代表用户”过去 24 小时内发生了什么变化”的活动/搜索/列表调用。',
      '- 优先选择源支持的相对刷新窗口，例如”过去 24 小时”或等效的相对过滤器。如果这会将未来的刷新冻结到此确切窗口，则不要持久化此运行的文字 ISO 时间戳。',
      '- 保持刷新输入有界且不包含凭据、原始有效负载转储、标头、cookie、令牌、密钥、密码和原始响应正文。',
      '- 如果没有只读数据调用成功，则省略 `document.sourceJson`。不要伪造刷新源。如果刷新注册失败，使用较小的有界刷新输入重试一次；如果仍然失败，创建一个没有 `document.sourceJson` 的静态 artifact，而不是使整个摘要失败。',
      '',
      'artifact 应包括：',
      '- 报告窗口的简明标题和时间戳。',
      '- 3-5 个关键要点，重点关注实际变化、决策、阻碍因素和机会。',
      '- 每个有用源的简洁部分，例如代码/存储库活动、文档/笔记/任务、日历、消息或其他可用的工作数据。',
      '- 今天的可操作建议：后续行动、审查、要检查的风险和建议的下一步。',
      '- 一个简短的”我今天检查了什么”脚注，用用户友好的语言说明审查了哪些类别、哪些是安静的、哪些不可用以及数据稀疏的地方。不要暴露原始错误、HTTP 代码、内部 id、工具名称、架构、刷新机制、守护进程详细信息或系统机制。',
      '- 当源数据提供时的链接或标识符。',
      '- 如果连接器发现成功并且至少检查了一个源，但成功的源结果是安静的或为空的，提供一个有用的安静日简报，其中包含明确的下一步。当连接器发现本身失败或没有可用的已连接只读数据工具时，不要创建摘要。',
      '',
      '语音和综合示例：',
      '- 代码：”open-design 有 4 个存储库更新。最值得注意的变化是影响数据刷新行为的守护进程更新，因此在下一个版本之前审查它。”',
      '- 文档：”产品笔记和启动清单是唯一匹配的页面。启动清单在入职方面发生了变化，应在与团队分享之前进行审查。”',
      '- 建议：”今天，优先审查更改的发布清单，然后跟进触及面向用户的刷新行为的两个开放 PR。”',
      '',
      '保持 artifact 紧凑：单个响应式 HTML 视图，不超过大约 200 行模板/CSS，并且没有冗长的设计评论通道。如果连接器发现成功但检查的数据稀疏、为空或部分不可用，仍然创建 Live Artifact 并清楚地说明有用的面向人类的结果。如果连接器发现失败或没有可用的已连接只读数据工具，快速失败而不是创建空状态 artifact。不要捏造活动。保持视觉设计精美但轻量级。',
      '重要提示：面向用户的 artifact 不得提及内部产品、数据管道、工具运行、自动化术语、原始失败详细信息或系统机制。将其写成面向人的正常每日简报，而不是技术运行报告。',
    ];
    if (template) {
      lines.push(
        '',
        '选定的示例模板：',
        `- 技能 id：${template.id}`,
        `- 技能名称：${template.name}`,
        `- 暂存根目录：.od-skills/${path.basename(template.dir)}/`,
        '',
        `在编写 artifact 之前，阅读 “.od-skills/${path.basename(template.dir)}/SKILL.md”，如果存在，还要阅读 “.od-skills/${path.basename(template.dir)}/example.html”。遵循该暂存模板的结构、布局、令牌、领域规则和视觉语言作为真实来源。暂存模板用于视觉/领域指导；仍然使用 live-artifact 工作流来注册最终 artifact。`,
        '',
        '选定模板示例提示：',
        '',
        template.examplePrompt.trim(),
      );
    }
    return lines.join('\n');
  }

  const lines = [
    'Create a Live Artifact: a polished daily digest that helps a normal person understand what changed in their connected work data during the past 24 hours and what they should do next.',
    '',
    `Time window: ${start} through ${end}.`,
    '',
    'Work autonomously. Do not ask follow-up questions, do not emit a question form, and do not wait for user input. Use sensible defaults and proceed.',
    'Optimize for fast completion: sample at most 3 relevant data sources. DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED: first run `tools connectors list --use-case personal_daily_digest --format compact` with a 120s timeout, and if that curated list command times out or returns no output, retry it once with another 120s timeout. If the curated command is unsupported, rejected, or succeeds but returns no usable tools, immediately fall back to the unfiltered read-only list via `tools connectors list --format compact`; do not stop just because `--use-case` is unsupported. If connector discovery still fails, or if both the curated and fallback lists yield zero usable connected read-only data tools, do not create an empty-state artifact; send one concise final message explaining that data loading failed and stop. For individual source calls after discovery succeeds, if a source fails because of auth, permissions, timeout, malformed output, empty output, oversized output, or any other data-loading problem, do not get stuck trying to fix it; drop that source and continue with the others. After the artifact is registered successfully, send one concise final message with the artifact id and stop.',
    '',
    'Use the live-artifact skill to author and register the artifact. Prefer the curated daily-digest connector list first: `tools connectors list --use-case personal_daily_digest --format compact`. If that command is unsupported, rejected, or returns no usable tools, fall back to the unfiltered read-only list. Then call only the tools needed for a useful digest.',
    '- Prefer recent activity, search, list, updated, or changed-item tools that can be bounded to this 24-hour window.',
    '- Avoid provider metadata, api_root, schema, health, status, broad fetch_all, or block-content dump tools unless they are truly necessary.',
    '- When a tool needs an input file, write a small JSON file under `.daily-digest-tmp/` (create it if missing). Files at the project root show up in the user-facing Design Files panel, while dot-prefixed paths are hidden. Reuse the same path when retrying the same tool.',
    '- Never persist raw responses or sensitive fields in artifact files. Exclude headers, cookies, authorization values, tokens, secrets, credentials, passwords, stack traces, and unbounded raw payloads.',
    '',
    'Refresh support:',
    '- If at least one read-only data call succeeds, register exactly one refresh source in `document.sourceJson` using the live-artifact schema so the manual Refresh button can update the digest later.',
    '- Pick the most representative successful read-only data call, typically an activity/search/list call that represents “what changed in the last 24 hours” for the user.',
    '- Prefer a relative refresh window supported by the source, such as “last 24 hours” or an equivalent relative filter. Do not persist the literal ISO timestamps from this run if that would freeze future refreshes to this exact window.',
    '- Keep the refresh input bounded and free of credentials, raw payload dumps, headers, cookies, tokens, secrets, passwords, and raw response bodies.',
    '- If no read-only data call succeeds, omit `document.sourceJson`. Do not fabricate a refresh source. If refresh registration fails, retry once with a smaller bounded refresh input; if it still fails, create a static artifact without `document.sourceJson` rather than failing the entire digest.',
    '',
    'The artifact should include:',
    '- A plain-language headline and timestamp for the reporting window.',
    '- 3-5 key takeaways focused on actual changes, decisions, blockers, and opportunities.',
    '- A concise section for each useful source, such as code/repository activity, documents/notes/tasks, calendars, messages, or other work data when available.',
    '- Actionable recommendations for today: follow-ups, reviews, risks to check, and suggested next steps.',
    '- A short “What I checked today” footnote in user-friendly language that says what categories were reviewed, what was quiet, what was unavailable, and where data was sparse. Do not expose raw errors, HTTP codes, internal ids, tool names, schemas, refresh mechanics, daemon details, or system mechanics.',
    '- Links or identifiers when source data provides them.',
    '- If connector discovery succeeded and at least one source was checked, but the successful source results are quiet or empty, provide a useful quiet-day briefing with clear next steps. Do not create a digest when connector discovery itself failed or no usable connected read-only data tools were available.',
    '',
    'Voice and synthesis examples:',
    '- Code: “open-design had 4 repositories updated. The most notable change was a daemon update that affects data refresh behavior, so review it before the next release.”',
    '- Docs: “Product Notes and Launch Checklist were the only matching pages. Launch Checklist changed around onboarding and should be reviewed before sharing with the team.”',
    '- Recommendation: “Today, prioritize reviewing the changed release checklist, then follow up on the two open PRs that touched user-facing refresh behavior.”',
    '',
    'Keep the artifact compact: a single responsive HTML view, no more than roughly 200 lines of template/CSS, and no lengthy design critique pass. If connector discovery succeeded but checked data is sparse, empty, or partially unavailable, still create the Live Artifact and clearly state the useful human-facing outcome. If connector discovery failed or no usable connected read-only data tools are available, fail fast instead of creating an empty-state artifact. Do not invent activity. Keep the visual design polished but lightweight.',
    'Important: the user-facing artifact must not mention internal product, data plumbing, tool-running, automation terms, raw failure details, or system mechanics. Write it as a normal daily briefing for a person, not as a technical run report.',
  ];
  if (template) {
    lines.push(
      '',
      'Selected example template:',
      `- Skill id: ${template.id}`,
      `- Skill name: ${template.name}`,
      `- Staged root: .od-skills/${path.basename(template.dir)}/`,
      '',
      `Before writing the artifact, read “.od-skills/${path.basename(template.dir)}/SKILL.md” and, if present, “.od-skills/${path.basename(template.dir)}/example.html”. Follow that staged template's structure, layout, tokens, domain rules, and visual language as the source of truth. The staged template is for visual/domain guidance; still use the live-artifact workflow to register the final artifact.`,
      '',
      'Selected template example prompt:',
      '',
      template.examplePrompt.trim(),
    );
  }
  return lines.join('\n');
}

export function renderOrbitTemplateSystemPrompt(template: OrbitTemplateSelection | null): string {
  if (!template) return '';
  return [
    `## Selected Orbit template skill — ${template.name}`,
    '',
    'This Orbit run was explicitly steered with the selected template skill below. Treat it as authoritative for the artifact structure, visual language, tokens, layout, and domain-specific synthesis rules.',
    'The generic Orbit digest brief and the live-artifact workflow still apply for data collection and artifact registration, but they must not override the selected template\'s visual/source-of-truth rules.',
    template.designSystemRequired
      ? 'If an active design system is also present, follow the selected template first for structure and interaction, then apply compatible design-system tokens only where the template permits them.'
      : 'This selected template opts out of external design-system injection. Do not apply the workspace design system or brand tokens; use only the template\'s own visual language.',
    '',
    'Before writing files, read the staged side files referenced by this skill, especially `example.html` when present, and mirror that example as instructed by the skill.',
    '',
    template.body.trim(),
  ].join('\n');
}

export class OrbitService {
  private config: OrbitConfigPrefs = DEFAULT_ORBIT_CONFIG;
  private timer: NodeJS.Timeout | null = null;
  private nextRunAtValue: Date | null = null;
  private starting: Promise<{ projectId: string; agentRunId: string }> | null = null;
  private inflight: Promise<OrbitActivitySummary> | null = null;
  private inflightProjectId: string | null = null;
  private inflightAgentRunId: string | null = null;
  private runHandler: OrbitRunHandler | null = null;
  private templateResolver: OrbitTemplateResolver | null = null;

  constructor(private readonly dataDir: string) {}

  setRunHandler(handler: OrbitRunHandler): void {
    this.runHandler = handler;
  }

  setTemplateResolver(resolver: OrbitTemplateResolver): void {
    this.templateResolver = resolver;
  }

  configure(config: Partial<OrbitConfigPrefs> | undefined): void {
    this.config = normalizeOrbitConfig(config);
    this.reschedule();
  }

  async status(): Promise<OrbitStatus> {
    const summaryStore = await readSummaryStore(this.dataDir);
    return {
      config: this.config,
      running: this.starting !== null || this.inflight !== null,
      nextRunAt: this.nextRunAtValue?.toISOString() ?? null,
      lastRun: summaryStore.lastRun,
      lastRunsByTemplate: summaryStore.lastRunsByTemplate,
    };
  }

  async start(trigger: 'manual' | 'scheduled', locale = 'en'): Promise<{ projectId: string; agentRunId: string }> {
    if (this.inflight && this.inflightProjectId && this.inflightAgentRunId) {
      return { projectId: this.inflightProjectId, agentRunId: this.inflightAgentRunId };
    }
    if (this.starting) return this.starting;
    if (!this.runHandler) throw new Error('Orbit agent runner is not configured');

    this.starting = this.startRun(trigger, locale).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startRun(trigger: 'manual' | 'scheduled', locale = 'en'): Promise<{ projectId: string; agentRunId: string }> {
    if (!this.runHandler) throw new Error('Orbit agent runner is not configured');

    const startedAt = new Date().toISOString();
    const runId = `orbit-${randomUUID()}`;
    const configuredTemplateSkillId = this.config.templateSkillId ?? null;
    const template = configuredTemplateSkillId && this.templateResolver
      ? await this.templateResolver(configuredTemplateSkillId).catch(() => null)
      : null;
    const now = new Date(startedAt);
    const prompt = buildOrbitPrompt(now, template, locale);
    const systemPrompt = buildOrbitSystemPrompt(now, template, locale);
    const handlerStart = await this.runHandler({
      runId,
      trigger,
      startedAt,
      prompt,
      systemPrompt,
      template,
    });

    this.inflightProjectId = handlerStart.projectId;
    this.inflightAgentRunId = handlerStart.agentRunId;
    this.inflight = (async () => {
      try {
        const agentResult = await handlerStart.completion;
        const completedAt = new Date().toISOString();
        const connectorsSucceeded = agentResult.status === 'succeeded' ? 1 : 0;
        const connectorsFailed = agentResult.status === 'failed' ? 1 : 0;
        const connectorsSkipped = agentResult.status === 'canceled' ? 1 : 0;
        const base = {
          id: runId,
          startedAt,
          completedAt,
          trigger,
          templateSkillId: template?.id ?? configuredTemplateSkillId,
          connectorsChecked: connectorsSucceeded + connectorsFailed + connectorsSkipped,
          connectorsSucceeded,
          connectorsFailed,
          connectorsSkipped,
          agentRunId: agentResult.agentRunId,
          ...(agentResult.artifactId === undefined ? {} : { artifactId: agentResult.artifactId }),
          ...(agentResult.artifactProjectId === undefined ? {} : { artifactProjectId: agentResult.artifactProjectId }),
          results: [{
            connectorId: 'agent-runtime',
            connectorName: 'Orbit Agent',
            status: agentResult.status === 'succeeded' ? 'succeeded' : agentResult.status === 'failed' ? 'failed' : 'skipped',
            summary: agentResult.summary ?? `Agent run ${agentResult.status}.`,
          } satisfies OrbitConnectorRunResult],
        };
        const summary: OrbitActivitySummary = {
          ...base,
          markdown: renderMarkdown(base),
        };
        await writeLastSummary(this.dataDir, summary);
        return summary;
      } finally {
        this.inflight = null;
        this.inflightProjectId = null;
        this.inflightAgentRunId = null;
        this.reschedule();
      }
    })();
    this.inflight.catch((error) => {
      console.warn('[orbit] Run failed:', error);
    });

    return { projectId: handlerStart.projectId, agentRunId: handlerStart.agentRunId };
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAtValue = null;
  }

  private reschedule(): void {
    this.stop();
    if (!this.config.enabled) return;
    const next = nextDailyRunAt(this.config.time);
    this.nextRunAtValue = next;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextRunAtValue = null;
      void this.start('scheduled').catch((error) => {
        console.warn('[orbit] Scheduled run failed:', error);
        if (!this.inflight) this.reschedule();
      });
    }, Math.max(0, next.getTime() - Date.now()));
    this.timer.unref();
  }
}
