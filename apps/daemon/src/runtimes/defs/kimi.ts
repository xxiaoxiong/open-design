import { detectAcpModels, DEFAULT_MODEL_OPTION, execAgentFile } from './shared.js';
import type { RuntimeAgentDef, RuntimeBuildArgsContext } from '../types.js';

/**
 * Parse Kimi CLI version string and return major.minor.patch tuple.
 * Examples: "0.6.0" → [0, 6, 0], "1.2.3-beta" → [1, 2, 3]
 */
function parseKimiVersion(versionString: string | null): [number, number, number] | null {
  if (!versionString) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(versionString.trim());
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Check if Kimi CLI version is 0.6.0 or later (new Node.js-based kimi-code).
 * Versions before 0.6.0 use the legacy Python-based kimi-cli with ACP protocol.
 */
function isKimiCodeV06OrLater(version: string | null): boolean {
  const parsed = parseKimiVersion(version);
  if (!parsed) return false;
  const [major, minor] = parsed;
  // 0.6.0+ or 1.0.0+
  return major > 0 || (major === 0 && minor >= 6);
}

/**
 * Detect Kimi CLI version and fetch models accordingly.
 * - Legacy kimi-cli (< 0.6.0): uses `kimi acp` for ACP protocol
 * - New kimi-code (>= 0.6.0): ACP subcommand removed, falls back to static models
 */
async function fetchKimiModels(resolvedBin: string, env: NodeJS.ProcessEnv) {
  // First probe version to determine which protocol to use
  let version: string | null = null;
  try {
    const { stdout } = await execAgentFile(resolvedBin, ['--version'], {
      env,
      timeout: 3000,
    });
    version = String(stdout).trim().split('\n')[0] ?? null;
  } catch {
    // Version probe failed, assume legacy and try ACP
  }

  // Legacy kimi-cli (< 0.6.0) supports ACP
  if (!isKimiCodeV06OrLater(version)) {
    return detectAcpModels({
      bin: resolvedBin,
      args: ['acp'],
      env,
      timeoutMs: 15_000,
      defaultModelOption: DEFAULT_MODEL_OPTION,
    });
  }

  // New kimi-code (>= 0.6.0) removed ACP subcommand.
  // TODO: Once we verify the new `--output-format stream-json` event shape,
  // we can probe models via that path. For now, return fallback models.
  return [];
}

export const kimiAgentDef = {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fetchModels: fetchKimiModels,
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    buildArgs: (ctx: RuntimeBuildArgsContext) => {
      // Kimi Code 0.6.0+ (Node.js rewrite) removed the `acp` subcommand.
      // The new CLI uses interactive mode by default. For non-interactive
      // prompt mode, use `-p <prompt>` with `--output-format stream-json`.
      // Legacy kimi-cli (< 0.6.0) still uses `acp`.
      if (isKimiCodeV06OrLater(ctx.detectedVersion)) {
        // TODO: Verify stream-json event shape matches json-event-stream or acp-json-rpc.
        // For now, mark as unsupported by returning empty args (will fail gracefully).
        throw new Error(
          'Kimi Code 0.6.0+ is detected but not yet fully supported. ' +
          'The new CLI removed the `acp` subcommand. ' +
          'Please use legacy kimi-cli (< 0.6.0) or wait for Open Design to add support for the new protocol.'
        );
      }
      return ['acp'];
    },
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
