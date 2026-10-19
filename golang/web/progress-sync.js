(() => {
  const prefix = 'learning-v2-';
  const csrfToken = () => {
    const item = document.cookie.split('; ').find((entry) => entry.startsWith('learning_csrf='));
    return item ? decodeURIComponent(item.slice('learning_csrf='.length)) : '';
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() } : {}), ...options.headers }
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
  const put = (id, completed, updatedAt) => api(`/api/progress/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ completed, updatedAt })
  });
  const pull = async () => {
    const { items } = await api('/api/progress');
    const remote = new Map(items.map((item) => [item.lessonId, item]));
    const ids = new Set([...remote.keys()]);
    for (let i = 1; i <= 99; i += 1) {
      const id = `lesson-${String(i).padStart(2, '0')}`;
      if (localStorage.getItem(prefix + id) !== null) ids.add(id);
    }
    for (const id of ids) {
      const remoteItem = remote.get(id);
      const localValue = localStorage.getItem(prefix + id);
      const localDate = Date.parse(localStorage.getItem(`${prefix}updated-${id}`) || '') || 0;
      const remoteDate = remoteItem ? Date.parse(remoteItem.updatedAt) || 0 : 0;
      if (localValue !== null && localDate > remoteDate) {
        await put(id, localValue === '1', new Date(localDate).toISOString());
        continue;
      }
      if (remoteItem) {
        localStorage.setItem(prefix + id, remoteItem.completed ? '1' : '0');
        localStorage.setItem(`${prefix}updated-${id}`, remoteItem.updatedAt);
        if (remoteItem.completed) localStorage.setItem(`${prefix}completed-at-${id}`, remoteItem.updatedAt);
        else localStorage.removeItem(`${prefix}completed-at-${id}`);
      }
    }
    window.dispatchEvent(new Event('learning-progress-render'));
  };
  let signedIn = false;
  let syncChain = Promise.resolve();
  window.addEventListener('learning-auth-state', (event) => {
    signedIn = Boolean(event.detail?.signedIn);
    if (signedIn) pull().catch(() => {});
    const note = document.querySelector('.status-foot span:last-child');
    if (note) note.textContent = signedIn ? 'Synced to your account' : 'Sign in to sync across devices';
  });
  window.addEventListener('learning-progress-change', (event) => {
    if (!signedIn || !event.detail?.lessonId) return;
    const { lessonId, complete, updatedAt } = event.detail;
    syncChain = syncChain.then(() => put(lessonId, Boolean(complete), updatedAt || new Date().toISOString())).catch(() => {});
  });
})();
