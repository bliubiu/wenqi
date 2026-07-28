import { describe, it, expect, beforeEach } from 'bun:test';
import { useAccessibilityStore } from '../accessibilityStore';

describe('accessibilityStore', () => {
  beforeEach(() => {
    useAccessibilityStore.setState({
      preferences: { highContrast: false, reducedMotion: false, fontSize: 'medium' },
    });
  });

  it('初始偏好应为默认值', () => {
    const prefs = useAccessibilityStore.getState().preferences;
    expect(prefs.highContrast).toBe(false);
    expect(prefs.reducedMotion).toBe(false);
    expect(prefs.fontSize).toBe('medium');
  });

  it('toggleHighContrast 应切换高对比度', () => {
    useAccessibilityStore.getState().toggleHighContrast();
    expect(useAccessibilityStore.getState().preferences.highContrast).toBe(true);
    useAccessibilityStore.getState().toggleHighContrast();
    expect(useAccessibilityStore.getState().preferences.highContrast).toBe(false);
  });

  it('toggleReducedMotion 应切换减少动效', () => {
    useAccessibilityStore.getState().toggleReducedMotion();
    expect(useAccessibilityStore.getState().preferences.reducedMotion).toBe(true);
  });

  it('setFontSize 应设置字体大小', () => {
    useAccessibilityStore.getState().setFontSize('large');
    expect(useAccessibilityStore.getState().preferences.fontSize).toBe('large');
    useAccessibilityStore.getState().setFontSize('small');
    expect(useAccessibilityStore.getState().preferences.fontSize).toBe('small');
  });

  it('updatePreferences 应合并偏好', () => {
    useAccessibilityStore.getState().updatePreferences({ highContrast: true, fontSize: 'large' });
    const prefs = useAccessibilityStore.getState().preferences;
    expect(prefs.highContrast).toBe(true);
    expect(prefs.fontSize).toBe('large');
    expect(prefs.reducedMotion).toBe(false); // 未修改
  });

  it('resetPreferences 应恢复默认值', () => {
    useAccessibilityStore.getState().updatePreferences({ highContrast: true, reducedMotion: true, fontSize: 'large' });
    useAccessibilityStore.getState().resetPreferences();
    const prefs = useAccessibilityStore.getState().preferences;
    expect(prefs.highContrast).toBe(false);
    expect(prefs.reducedMotion).toBe(false);
    expect(prefs.fontSize).toBe('medium');
  });
});
