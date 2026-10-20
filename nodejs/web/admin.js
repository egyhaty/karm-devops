let token = '';
const status = document.querySelector('#status');
function lock() { token = ''; document.querySelector('#workspace').hidden = true; document.querySelector('#login').hidden = false; document.querySelector('#inquiries').replaceChildren(); }
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Authorization': `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) lock(); throw new Error(data.error); }
  return data;
}
async function refresh() {
  const data = await request('/api/admin/inquiries');
  const cards = data.inquiries.map(i => {
    const card = document.createElement('article'); card.className = 'panel';
    for (const text of [i.property, `${i.name} · ${i.phone}`, i.message, new Date(i.created_at).toLocaleString(), `Reference: ${i.id}`]) { const p = document.createElement('p'); p.textContent = text; card.append(p); }
    const label = document.createElement('label'); label.textContent = 'Request status';
    const select = document.createElement('select'); select.setAttribute('aria-label', `Status of request from ${i.name}`);
    for (const value of ['new', 'contacted', 'closed']) select.add(new Option(value, value));
    select.value = i.status;
    select.addEventListener('change', async () => {
      const previous = i.status; select.disabled = true;
      try { await request(`/api/admin/inquiries/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); i.status = select.value; status.textContent = 'Request updated.'; }
      catch (error) { select.value = previous; status.textContent = error.message; }
      finally { select.disabled = false; }
    });
    label.append(select); card.append(label); return card;
  });
  document.querySelector('#inquiries').replaceChildren(...cards);
  status.textContent = cards.length ? `${cards.length} most recent requests shown.` : 'No viewing requests yet.';
}
document.querySelector('#login').addEventListener('submit', async event => {
  event.preventDefault(); token = event.target.elements.token.value; event.target.reset();
  try { await refresh(); document.querySelector('#login').hidden = true; document.querySelector('#workspace').hidden = false; }
  catch (error) { token = ''; status.textContent = error.message; }
});
document.querySelector('#logout').addEventListener('click', () => { lock(); status.textContent = 'Workspace locked.'; });
document.querySelector('#refresh').addEventListener('click', () => refresh().catch(error => { status.textContent = error.message; }));
document.querySelector('#create').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  const payload = Object.fromEntries(new FormData(event.target));
  for (const key of ['price', 'bedrooms', 'area']) payload[key] = Number(payload[key]);
  try { const data = await request('/api/admin/properties', { method: 'POST', body: JSON.stringify(payload) }); status.textContent = `${data.property.title} added. Open the collection to see it.`; event.target.reset(); }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
