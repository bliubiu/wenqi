'use client';

import { useEffect } from 'react';
import { useAccessibilityStore } from '../store/accessibilityStore';

export function useAccessibility() {
  const preferences = useAccessibilityStore((s) => s.preferences);
  const updatePreferences = useAccessibilityStore((s) => s.updatePreferences);
  const toggleHighContrast = useAccessibilityStore((s) => s.toggleHighContrast);
  const toggleReducedMotion = useAccessibilityStore((s) => s.toggleReducedMotion);
  const setFontSize = useAccessibilityStore((s) => s.setFontSize);
  const initFromSystem = useAccessibilityStore((s) => s.initFromSystem);

  useEffect(() => {
    initFromSystem();

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');

    const handleMotionChange = (e: MediaQueryListEvent) => {
      updatePreferences({ reducedMotion: e.matches });
    };
    const handleContrastChange = (e: MediaQueryListEvent) => {
      updatePreferences({ highContrast: e.matches });
    };

    motionQuery.addEventListener('change', handleMotionChange);
    contrastQuery.addEventListener('change', handleContrastChange);

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
      contrastQuery.removeEventListener('change', handleContrastChange);
    };
  }, []);

  return {
    preferences,
    updatePreferences,
    toggleHighContrast,
    toggleReducedMotion,
    setFontSize,
  };
}
