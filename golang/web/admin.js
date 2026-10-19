(() => {
  const message = document.getElementById('adminMessage');
  const csrf = () => {
    const item = document.cookie.split('; ').find((entry) => entry.startsWith('learning_csrf='));
    return item ? decodeURIComponent(item.slice('learning_csrf='.length)) : '';
  };
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin', ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : {}), ...options.headers }
    });
    if (response.status === 401) { window.location.assign('/auth/login'); throw new Error('Sign in to continue.'); }
    if (response.status === 403) { window.location.assign('/'); throw new Error('Administrator access is required.'); }
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  };
  const cell = (text) => { const td = document.createElement('td'); td.textContent = text; return td; };
  const checkbox = (checked, disabled, label, onChange) => {
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = checked; input.disabled = disabled; input.setAttribute('aria-label', label);
    input.addEventListener('change', async () => {
      input.disabled = true;
      try { await onChange(input.checked); message.textContent = 'Account updated.'; }
      catch (error) { input.checked = !input.checked; message.textContent = error.message; }
      finally { input.disabled = disabled; }
    });
    const td = document.createElement('td'); td.append(input); return td;
  };
  const render = async () => {
    try {
      const [overview, account, data, audit] = await Promise.all([request('/api/admin/overview'), request('/api/me'), request('/api/admin/users'), request('/api/admin/audit')]);
      document.getElementById('adminIdentity').textContent = account.user.displayName || account.user.email;
      document.getElementById('totalUsers').textContent = overview.users;
      document.getElementById('activeUsers').textContent = overview.activeUsers;
      document.getElementById('completedLessons').textContent = overview.completedLessons;
      document.getElementById('activeAdmins').textContent = overview.admins;
      const body = document.querySelector('#usersTable tbody');
      body.replaceChildren();
      for (const user of data.users) {
        const row = document.createElement('tr');
        row.append(cell(user.displayName || user.email || user.subject));
        row.append(cell(user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : 'Never'));
        row.append(cell(String(user.completedLessons)));
        const self = user.subject === account.user.subject;
        row.append(checkbox(user.isAdmin, self, `Administrator access for ${user.email || user.subject}`, (isAdmin) => request(`/api/admin/users/${encodeURIComponent(user.subject)}`, { method: 'PATCH', body: JSON.stringify({ isAdmin }) })));
        row.append(checkbox(user.disabled, self, `Disable ${user.email || user.subject}`, (disabled) => request(`/api/admin/users/${encodeURIComponent(user.subject)}`, { method: 'PATCH', body: JSON.stringify({ disabled }) })));
        body.append(row);
      }
      const auditBody = document.querySelector('#auditTable tbody');
      auditBody.replaceChildren();
      for (const entry of audit.entries) {
        const row = document.createElement('tr');
        row.append(cell(new Date(entry.createdAt).toLocaleString()));
        row.append(cell(entry.actorEmail || entry.actorSubject));
        row.append(cell(entry.targetEmail || entry.targetSubject));
        row.append(cell(entry.action.replaceAll('_', ' ')));
        auditBody.append(row);
      }
      document.getElementById('auditEmpty').hidden = audit.entries.length > 0;
      message.textContent = `${data.users.length} accounts shown. The list is limited to the latest 100 active or inactive accounts.`;
    } catch (error) { message.textContent = error.message; }
  };
  render();
})();
