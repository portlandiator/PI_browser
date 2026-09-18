// Apply a saved preference before styles paint, on every page.
(() => {
  const root = document.documentElement;
  let saved;
  try { saved = localStorage.getItem('pi-theme'); } catch {}
  root.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  const sync = () => {
    const dark = root.dataset.theme === 'dark';
    document.getElementById('theme-toggle')?.setAttribute('aria-checked', String(dark));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151d19' : '#f7f6f0');
  };
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    toggle.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('pi-theme', root.dataset.theme); } catch {}
      sync();
    });
    const dialog = document.getElementById('about-dialog');
    for (const id of ['about-open', 'footer-about']) {
      document.getElementById(id)?.addEventListener('click', () => dialog.showModal());
    }
    document.getElementById('about-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    sync();
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'pi-theme') return;
    root.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light';
    sync();
  });
})();
