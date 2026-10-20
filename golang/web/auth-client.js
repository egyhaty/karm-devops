(() => {
  const host = document.getElementById('authActions');
  if (!host) return;
  const csrfToken = () => {
    const item = document.cookie.split('; ').find((entry) => entry.startsWith('learning_csrf='));
    return item ? decodeURIComponent(item.slice('learning_csrf='.length)) : '';
  };
  const link = (label, href, className = 'top-link') => {
    const element = document.createElement('a');
    element.textContent = label;
    element.href = href;
    element.className = className;
    return element;
  };
  const button = (label, className = 'top-link') => {
    const element = document.createElement('button');
    element.textContent = label;
    element.className = className;
    element.type = 'button';
    return element;
  };
  const staticLinks = Array.from(host.querySelectorAll('[data-static]'));
  const resetActions = () => host.replaceChildren(...staticLinks);
  fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json();
      return payload.user;
    })
    .then((user) => {
      resetActions();
      if (!user) {
        host.append(link('Create account or sign in', '/auth/login'));
        window.dispatchEvent(new CustomEvent('learning-auth-state', { detail: { signedIn: false } }));
        return;
      }
      const label = user.displayName || user.email || 'Account';
      const account = document.createElement('span');
      account.className = 'top-link';
      account.textContent = `Signed in as ${label}`;
      host.append(account);
      if (user.isAdmin) host.append(link('Admin', '/admin'));
      const logout = button('Sign out');
      logout.addEventListener('click', async () => {
        const response = await fetch('/api/auth/logout', {
          method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken() }
        });
        if (response.ok) window.location.assign('/');
      });
      host.append(logout);
      window.dispatchEvent(new CustomEvent('learning-auth-state', { detail: { signedIn: true, user } }));
    })
    .catch(() => {
      resetActions();
      host.append(link('Sign in', '/auth/login'));
      window.dispatchEvent(new CustomEvent('learning-auth-state', { detail: { signedIn: false } }));
    });
})();
