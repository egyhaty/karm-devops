(() => {
  const prefix = 'learning-v2-';
  const validID = id => typeof id === 'string' && /^(lesson-(0[1-9]|1[0-3])|docker|git|network-policy|(aws|azure)-0[1-7])$/.test(id) && !/\s/.test(id);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  const localIDs = () => {
    const ids = [];
    try {
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && validID(key.slice(prefix.length))) ids.push(key.slice(prefix.length));
      }
    } catch { /* A disabled store leaves account reads available. */ }
    return ids;
  };
  window.LearningProgress = { validID, read, localIDs };
  const csrfToken = () => {
    const item = document.cookie.split('; ').find(entry => entry.startsWith('learning_csrf='));
    return item ? decodeURIComponent(item.slice('learning_csrf='.length)) : '';
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin', ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() } : {}), ...options.headers }
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
  const put = (id, completed, updatedAt) => api(`/api/progress/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ completed, updatedAt })
  });
  const status = message => {
    document.querySelectorAll('.progress-note').forEach(note => { note.textContent = message; });
    const oldNote = document.querySelector('.status-foot span:last-child');
    if (oldNote) oldNote.textContent = message;
  };
  const pull = async () => {
    const { items } = await api('/api/progress');
    const remote = new Map(items.filter(item => validID(item.lessonId)).map(item => [item.lessonId, item]));
    const ids = new Set([...remote.keys(), ...localIDs()]);
    for (const id of ids) {
      const remoteItem = remote.get(id);
      const localValue = read(prefix + id);
      const localDate = Date.parse(read(`${prefix}updated-${id}`) || '') || 0;
      const remoteDate = remoteItem ? Date.parse(remoteItem.updatedAt) || 0 : 0;
      if (localValue !== null && localDate > remoteDate) {
        await put(id, localValue === '1', new Date(localDate).toISOString());
      } else if (remoteItem) {
        write(prefix + id, remoteItem.completed ? '1' : '0');
        write(`${prefix}updated-${id}`, remoteItem.updatedAt);
        write(`${prefix}completed-at-${id}`, remoteItem.completed ? remoteItem.updatedAt : '');
      }
    }
    window.dispatchEvent(new Event('learning-progress-render'));
    status('Synced to your account');
  };
  let signedIn = false;
  let syncChain = Promise.resolve();
  const enqueue = operation => {
    syncChain = syncChain.then(operation).catch(() => {
      status('Account sync failed. Local progress is retained; reload to retry.');
    });
  };
  window.addEventListener('learning-auth-state', event => {
    signedIn = Boolean(event.detail?.signedIn);
    if (signedIn) enqueue(pull);
    else status('Saved in this browser. Sign in to sync across devices.');
  });
  window.addEventListener('learning-progress-change', event => {
    if (!signedIn || !validID(event.detail?.lessonId)) return;
    const { lessonId, complete, updatedAt } = event.detail;
    enqueue(async () => {
      await put(lessonId, Boolean(complete), updatedAt || new Date().toISOString());
      status('Synced to your account');
    });
  });
})();
