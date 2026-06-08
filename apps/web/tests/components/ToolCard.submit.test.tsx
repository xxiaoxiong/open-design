// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { ToolCard } from '../../src/components/ToolCard';

function toolUse(name = 'AskUserQuestion', id = 'tool-1'): { kind: 'tool_use'; id: string; name: string; input: unknown } {
  return {
    kind: 'tool_use',
    id,
    name,
    input: {
      questions: [
        {
          question: 'Which database?',
          multiSelect: false,
          options: [{ label: 'Postgres' }, { label: 'SQLite' }],
        },
      ],
    },
  };
}

afterEach(() => cleanup());

function renderToolCard(props: Parameters<typeof ToolCard>[0]) {
  return render(
    <I18nProvider initial="en">
      <ToolCard {...props} />
    </I18nProvider>,
  );
}

describe('AskUserQuestion submit gating', () => {
  it('locks the card only after onAnswerToolUse returns true', async () => {
    const onAnswerToolUse = vi.fn().mockResolvedValue(true);
    const onSubmitForm = vi.fn();

    const { container } = renderToolCard({
      use: toolUse(),
      isLast: true,
      onAnswerToolUse,
      onSubmitForm,
    });

    const firstOption = container.querySelector('.op-ask-question-option') as HTMLButtonElement;
    expect(firstOption).not.toBeNull();
    fireEvent.click(firstOption);

    const submitBtn = container.querySelector('.op-ask-question-submit') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    // Card is NOT locked before the async round-trip resolves.
    expect(container.querySelector('.op-ask-question-locked')).toBeNull();
    expect(onAnswerToolUse).toHaveBeenCalledTimes(1);
    expect(onSubmitForm).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('.op-ask-question-locked')).not.toBeNull();
    });
    expect(onSubmitForm).not.toHaveBeenCalled();
  });

  it('locks the card after falling back to onSubmitForm when onAnswerToolUse returns false', async () => {
    const onAnswerToolUse = vi.fn().mockResolvedValue(false);
    const onSubmitForm = vi.fn();

    const { container } = renderToolCard({
      use: toolUse(),
      isLast: true,
      onAnswerToolUse,
      onSubmitForm,
    });

    const firstOption = container.querySelector('.op-ask-question-option') as HTMLButtonElement;
    fireEvent.click(firstOption);

    const submitBtn = container.querySelector('.op-ask-question-submit') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    // After the async failure, the card must fall back to onSubmitForm
    // and lock so the user cannot enqueue duplicate answers.
    await waitFor(() => {
      expect(container.querySelector('.op-ask-question-locked')).not.toBeNull();
    });
    expect(onAnswerToolUse).toHaveBeenCalledTimes(1);
    expect(onSubmitForm).toHaveBeenCalledTimes(1);
  });

  it('locks the card after falling back to onSubmitForm when onAnswerToolUse throws', async () => {
    const onAnswerToolUse = vi.fn().mockRejectedValue(new Error('network'));
    const onSubmitForm = vi.fn();

    const { container } = renderToolCard({
      use: toolUse(),
      isLast: true,
      onAnswerToolUse,
      onSubmitForm,
    });

    const firstOption = container.querySelector('.op-ask-question-option') as HTMLButtonElement;
    fireEvent.click(firstOption);

    const submitBtn = container.querySelector('.op-ask-question-submit') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(container.querySelector('.op-ask-question-locked')).not.toBeNull();
    });
    expect(onAnswerToolUse).toHaveBeenCalledTimes(1);
    expect(onSubmitForm).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate submits while onAnswerToolUse is in flight', async () => {
    let resolveToolUse: (ok: boolean) => void;
    const onAnswerToolUse = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveToolUse = resolve;
        }),
    );
    const onSubmitForm = vi.fn();

    const { container } = renderToolCard({
      use: toolUse(),
      isLast: true,
      onAnswerToolUse,
      onSubmitForm,
    });

    const firstOption = container.querySelector('.op-ask-question-option') as HTMLButtonElement;
    fireEvent.click(firstOption);

    const submitBtn = container.querySelector('.op-ask-question-submit') as HTMLButtonElement;
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(onAnswerToolUse).toHaveBeenCalledTimes(1);

    resolveToolUse!(true);
    await waitFor(() => {
      expect(container.querySelector('.op-ask-question-locked')).not.toBeNull();
    });
    expect(onSubmitForm).not.toHaveBeenCalled();
  });
});
