import { describe, it, expect } from 'vitest';
import { kimiAgentDef } from '../../src/runtimes/defs/kimi.js';

describe('Kimi CLI version detection', () => {
  it('should detect legacy kimi-cli (< 0.6.0) and use ACP', () => {
    const ctx = {
      detectedVersion: '0.5.9',
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    const args = kimiAgentDef.buildArgs(ctx);
    expect(args).toEqual(['acp']);
  });

  it('should detect new kimi-code (0.6.0) and throw unsupported error', () => {
    const ctx = {
      detectedVersion: '0.6.0',
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    expect(() => kimiAgentDef.buildArgs(ctx)).toThrow(/Kimi Code 0\.6\.0\+ is detected but not yet fully supported/);
  });

  it('should detect new kimi-code (0.7.0) and throw unsupported error', () => {
    const ctx = {
      detectedVersion: '0.7.0',
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    expect(() => kimiAgentDef.buildArgs(ctx)).toThrow(/Kimi Code 0\.6\.0\+ is detected but not yet fully supported/);
  });

  it('should detect new kimi-code (1.0.0) and throw unsupported error', () => {
    const ctx = {
      detectedVersion: '1.0.0',
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    expect(() => kimiAgentDef.buildArgs(ctx)).toThrow(/Kimi Code 0\.6\.0\+ is detected but not yet fully supported/);
  });

  it('should handle null version and use legacy ACP', () => {
    const ctx = {
      detectedVersion: null,
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    const args = kimiAgentDef.buildArgs(ctx);
    expect(args).toEqual(['acp']);
  });

  it('should handle malformed version and use legacy ACP', () => {
    const ctx = {
      detectedVersion: 'invalid-version',
      prompt: 'test prompt',
      model: 'default',
      reasoning: null,
    };
    const args = kimiAgentDef.buildArgs(ctx);
    expect(args).toEqual(['acp']);
  });
});
