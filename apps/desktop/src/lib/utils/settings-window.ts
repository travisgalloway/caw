export async function openSettingsWindow() {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('settings');
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow('settings', {
      url: '/settings',
      title: 'Settings',
      width: 700,
      height: 600,
      minWidth: 500,
      minHeight: 400,
    });
  } catch {
    // Browser dev mode fallback
    window.location.href = '/settings';
  }
}
