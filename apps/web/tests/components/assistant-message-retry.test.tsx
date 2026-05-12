// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

function failedMessage(): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'The model has crashed without additional information',
    events: [
      {
        kind: 'text',
        text: 'The model has crashed without additional information',
      },
    ],
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'failed',
  };
}

describe('AssistantMessage retry button', () => {
  afterEach(() => cleanup());

  it('shows retry button for failed runs on the last assistant message', () => {
    const onRetry = vi.fn();
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="project-1"
        isLast
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Run failed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="project-1"
        isLast
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides retry button on older assistant turns', () => {
    const onRetry = vi.fn();
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="project-1"
        isLast={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByText('Run failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('hides retry button when streaming', () => {
    const onRetry = vi.fn();
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={true}
        projectId="project-1"
        isLast
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByText('Run failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('hides retry button when run succeeded', () => {
    const onRetry = vi.fn();
    const succeededMessage: ChatMessage = {
      ...failedMessage(),
      runStatus: 'succeeded',
    };
    render(
      <AssistantMessage
        message={succeededMessage}
        streaming={false}
        projectId="project-1"
        isLast
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByText('Run failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('hides retry button when onRetry is not provided', () => {
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.queryByText('Run failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
