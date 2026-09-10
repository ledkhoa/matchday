import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { HighlightPlayer } from './HighlightPlayer';
import type { Highlight } from '#/db/schema';
import {
  clearWatchHistory,
  isHighlightWatched,
} from '#/stores/watchHistoryStore';

function createMockHighlight(partial: Partial<Highlight> = {}): Highlight {
  return {
    id: 'hl-test-1',
    matchId: 'match-1',
    title: 'Arsenal [1] - 0 Brighton - Bukayo Saka 14',
    scoreHome: 1,
    scoreAway: 0,
    scorer: 'Bukayo Saka',
    minute: "14'",
    tag: 'Penalty',
    embedUrl: 'https://dubz.co/e/abc123',
    sourceUrl: 'https://dubz.co/c/abc123',
    redditUrl: '/r/soccer/comments/xyz/saka_goal',
    goalFingerprint: null,
    postedAt: 1694260000,
    ...partial,
  };
}

describe('HighlightPlayer component', () => {
  beforeEach(() => {
    clearWatchHistory();
  });

  it('automatically marks highlight as watched upon mount', () => {
    const highlight = createMockHighlight({ id: 'hl-auto-watch' });
    expect(isHighlightWatched('hl-auto-watch')).toBe(false);

    render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    expect(isHighlightWatched('hl-auto-watch')).toBe(true);
  });

  it('enforces aspect-video and w-full container to prevent mobile overflow', () => {
    const highlight = createMockHighlight();
    const { container } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    const videoContainer = container.querySelector('.aspect-video');
    expect(videoContainer).not.toBeNull();
    expect(videoContainer?.className).toContain('aspect-video');
    expect(videoContainer?.className).toContain('w-full');
  });

  it('mounts responsive <iframe> for supported embed hosts (dubz, streamin)', () => {
    const highlight = createMockHighlight({
      sourceUrl: 'https://dubz.co/c/abc123',
      embedUrl: 'https://dubz.co/e/abc123',
    });
    const { container } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://dubz.co/e/abc123');
    expect(iframe?.getAttribute('allow')).toContain('autoplay');
    expect(iframe?.getAttribute('allow')).toContain('fullscreen');
  });

  it('mounts HTML5 <video> for v.redd.it direct video links', () => {
    const highlight = createMockHighlight({
      sourceUrl: 'https://v.redd.it/xyz789',
      embedUrl: null,
    });
    const { container } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe(
      'https://v.redd.it/xyz789/DASH_720.mp4',
    );
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
  });

  it('mounts Fallback UI with source link when host is unsupported', () => {
    const highlight = createMockHighlight({
      sourceUrl: 'https://twitter.com/goals/status/12345',
      embedUrl: null,
    });
    const { getByText, getByRole } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    expect(getByText('Direct Playback Unavailable')).toBeDefined();
    expect(getByText('Watch on Source Host')).toBeDefined();
    const sourceLink = getByRole('link', {
      name: /Watch on Source Host/i,
    });
    expect(sourceLink.getAttribute('href')).toBe(
      'https://twitter.com/goals/status/12345',
    );
  });

  it('triggers onClose callback when close button is clicked', () => {
    const closeSpy = mock(() => {});
    const highlight = createMockHighlight();
    const { getByRole } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: closeSpy,
      }),
    );

    const closeBtn = getByRole('button', { name: 'Close player' });
    fireEvent.click(closeBtn);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('renders Reddit discussion link', () => {
    const highlight = createMockHighlight();
    const { getByRole } = render(
      React.createElement(HighlightPlayer, {
        highlight,
        onClose: () => {},
      }),
    );

    const redditLink = getByRole('link', {
      name: /Reddit Discussion/i,
    });
    expect(redditLink).toBeDefined();
    expect(redditLink.getAttribute('href')).toBe(
      'https://reddit.com/r/soccer/comments/xyz/saka_goal',
    );
  });
});
