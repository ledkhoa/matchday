import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TeamCrest } from './TeamCrest';

describe('TeamCrest component', () => {
  it('renders image with correct src, alt, and lazy loading when logoUrl is valid', () => {
    const { getByAltText } = render(
      React.createElement(TeamCrest, {
        teamName: 'Arsenal',
        logoUrl: 'https://example.com/arsenal.png',
      }),
    );

    const img = getByAltText('Arsenal crest');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/arsenal.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.classList.contains('object-contain')).toBe(true);
  });

  it('renders fallback initials when logoUrl is null or undefined', () => {
    const { getByText, queryByRole } = render(
      React.createElement(TeamCrest, {
        teamName: 'Arsenal',
        logoUrl: null,
      }),
    );

    expect(getByText('ARS')).toBeDefined();
    expect(queryByRole('img')).toBeNull();
  });

  it('renders fallback initials when logoUrl is empty or whitespace', () => {
    const { getByText, queryByRole } = render(
      React.createElement(TeamCrest, {
        teamName: 'Brighton',
        logoUrl: '   ',
      }),
    );

    expect(getByText('BHA')).toBeDefined();
    expect(queryByRole('img')).toBeNull();
  });

  it('falls back to initials when image triggers onError', () => {
    const { getByAltText, getByText, queryByAltText } = render(
      React.createElement(TeamCrest, {
        teamName: 'Chelsea',
        logoUrl: 'https://broken.link/chelsea.png',
      }),
    );

    const img = getByAltText('Chelsea crest');
    expect(img).toBeDefined();

    fireEvent.error(img);

    expect(getByText('CHE')).toBeDefined();
    expect(queryByAltText('Chelsea crest')).toBeNull();
  });

  it('resets error state when logoUrl prop changes to a new URL', () => {
    const { getByAltText, getByText, queryByText, rerender } = render(
      React.createElement(TeamCrest, {
        teamName: 'Liverpool',
        logoUrl: 'https://broken.link/liverpool.png',
      }),
    );

    const img = getByAltText('Liverpool crest');
    fireEvent.error(img);
    expect(getByText('LIV')).toBeDefined();

    // Re-render with fixed URL
    rerender(
      React.createElement(TeamCrest, {
        teamName: 'Liverpool',
        logoUrl: 'https://example.com/liverpool-fixed.png',
      }),
    );

    expect(queryByText('LIV')).toBeNull();
    const newImg = getByAltText('Liverpool crest');
    expect(newImg.getAttribute('src')).toBe(
      'https://example.com/liverpool-fixed.png',
    );
  });

  it('applies custom className prop to both image and fallback containers', () => {
    const { container: fallbackContainer } = render(
      React.createElement(TeamCrest, {
        teamName: 'Tottenham',
        logoUrl: null,
        className: 'custom-crest-class',
      }),
    );
    expect(
      fallbackContainer.firstElementChild?.classList.contains(
        'custom-crest-class',
      ),
    ).toBe(true);

    const { container: imageContainer } = render(
      React.createElement(TeamCrest, {
        teamName: 'Tottenham',
        logoUrl: 'https://example.com/tottenham.png',
        className: 'custom-crest-class',
      }),
    );
    expect(
      imageContainer.firstElementChild?.classList.contains(
        'custom-crest-class',
      ),
    ).toBe(true);
  });
});
