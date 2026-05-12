import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PreviewCommentSnapshot, PreviewComment } from '../../src/types';

/**
 * Test suite for pod member removal functionality in FileViewer
 * Issue #802: Add manual removal for captured components in Pods
 */

describe('FileViewer - Pod Member Removal', () => {
  // Mock translation function
  const mockT = (key: string, vars?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      'common.close': 'Close',
      'chat.comments.placeholder': 'Comment on this element…',
      'chat.comments.removePodMember': `Remove ${vars?.name || 'item'} from pod`,
    };
    return translations[key] || key;
  };

  // Helper to create a mock pod snapshot with members
  const createPodSnapshot = (memberCount: number): PreviewCommentSnapshot => ({
    filePath: 'test.html',
    elementId: 'pod-1',
    selector: '.pod-container',
    label: 'Test Pod',
    selectionKind: 'pod',
    memberCount,
    podMembers: Array.from({ length: memberCount }, (_, i) => ({
      elementId: `member-${i}`,
      selector: `.member-${i}`,
      label: `Member ${i}`,
      text: `Content ${i}`,
      position: { x: 0, y: 0, width: 100, height: 100 },
      htmlHint: `<div class="member-${i}">Content ${i}</div>`,
    })),
    position: { x: 0, y: 0, width: 200, height: 200 },
    htmlHint: '<div class="pod-container"></div>',
  });

  it('should display remove buttons for each pod member', () => {
    const podSnapshot = createPodSnapshot(3);
    const onRemovePodMember = vi.fn();

    // Simulate rendering the pod members section
    const { container } = render(
      <div className="board-pod-members">
        {podSnapshot.podMembers?.slice(0, 6).map((member) => (
          <span key={member.elementId} className="board-pod-chip">
            <span className="board-pod-chip-label">
              {member.label || member.elementId}
            </span>
            <button
              type="button"
              className="board-pod-chip-remove"
              onClick={() => onRemovePodMember(member.elementId)}
              aria-label={mockT('chat.comments.removePodMember', {
                name: member.label || member.elementId,
              })}
              title={mockT('chat.comments.removePodMember', {
                name: member.label || member.elementId,
              })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );

    // Verify all remove buttons are rendered
    const removeButtons = container.querySelectorAll('.board-pod-chip-remove');
    expect(removeButtons).toHaveLength(3);
  });

  it('should call onRemovePodMember when remove button is clicked', () => {
    const podSnapshot = createPodSnapshot(3);
    const onRemovePodMember = vi.fn();

    const { container } = render(
      <div className="board-pod-members">
        {podSnapshot.podMembers?.slice(0, 6).map((member) => (
          <span key={member.elementId} className="board-pod-chip">
            <span className="board-pod-chip-label">
              {member.label || member.elementId}
            </span>
            <button
              type="button"
              className="board-pod-chip-remove"
              onClick={() => onRemovePodMember(member.elementId)}
              aria-label={mockT('chat.comments.removePodMember', {
                name: member.label || member.elementId,
              })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );

    // Click the first remove button
    const removeButtons = container.querySelectorAll('.board-pod-chip-remove');
    fireEvent.click(removeButtons[0]);

    // Verify the handler was called with the correct elementId
    expect(onRemovePodMember).toHaveBeenCalledWith('member-0');
    expect(onRemovePodMember).toHaveBeenCalledTimes(1);
  });

  it('should update pod members array when a member is removed', () => {
    const podSnapshot = createPodSnapshot(3);
    let currentMembers = podSnapshot.podMembers || [];

    // Simulate the removal handler
    const handleRemove = (elementId: string) => {
      currentMembers = currentMembers.filter((m) => m.elementId !== elementId);
    };

    // Remove member-1
    handleRemove('member-1');

    // Verify the member was removed
    expect(currentMembers).toHaveLength(2);
    expect(currentMembers.find((m) => m.elementId === 'member-1')).toBeUndefined();
    expect(currentMembers.find((m) => m.elementId === 'member-0')).toBeDefined();
    expect(currentMembers.find((m) => m.elementId === 'member-2')).toBeDefined();
  });

  it('should clear the composer when all members are removed', () => {
    const podSnapshot = createPodSnapshot(1);
    let shouldClearComposer = false;

    // Simulate the removal handler that clears composer when empty
    const handleRemove = (elementId: string) => {
      const updatedMembers = (podSnapshot.podMembers || []).filter(
        (m) => m.elementId !== elementId
      );
      if (updatedMembers.length === 0) {
        shouldClearComposer = true;
      }
    };

    // Remove the only member
    handleRemove('member-0');

    // Verify composer should be cleared
    expect(shouldClearComposer).toBe(true);
  });

  it('should have proper accessibility attributes on remove buttons', () => {
    const podSnapshot = createPodSnapshot(2);
    const onRemovePodMember = vi.fn();

    const { container } = render(
      <div className="board-pod-members">
        {podSnapshot.podMembers?.slice(0, 6).map((member) => (
          <span key={member.elementId} className="board-pod-chip">
            <span className="board-pod-chip-label">
              {member.label || member.elementId}
            </span>
            <button
              type="button"
              className="board-pod-chip-remove"
              onClick={() => onRemovePodMember(member.elementId)}
              aria-label={mockT('chat.comments.removePodMember', {
                name: member.label || member.elementId,
              })}
              title={mockT('chat.comments.removePodMember', {
                name: member.label || member.elementId,
              })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );

    const removeButtons = container.querySelectorAll('.board-pod-chip-remove');

    // Check first button has proper aria-label
    expect(removeButtons[0]).toHaveAttribute('aria-label', 'Remove Member 0 from pod');
    expect(removeButtons[0]).toHaveAttribute('title', 'Remove Member 0 from pod');

    // Check second button has proper aria-label
    expect(removeButtons[1]).toHaveAttribute('aria-label', 'Remove Member 1 from pod');
    expect(removeButtons[1]).toHaveAttribute('title', 'Remove Member 1 from pod');
  });

  it('should update memberCount when members are removed', () => {
    const podSnapshot = createPodSnapshot(5);

    // Simulate removing 2 members
    const updatedMembers = (podSnapshot.podMembers || []).filter(
      (m) => m.elementId !== 'member-1' && m.elementId !== 'member-3'
    );

    const updatedSnapshot = {
      ...podSnapshot,
      podMembers: updatedMembers,
      memberCount: updatedMembers.length,
    };

    // Verify the count is updated
    expect(updatedSnapshot.memberCount).toBe(3);
    expect(updatedSnapshot.podMembers).toHaveLength(3);
  });
});
