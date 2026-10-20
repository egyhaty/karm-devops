const slug = new URLSearchParams(location.search).get('home');
const pageStatus = document.querySelector('#pageStatus');
const form = document.querySelector('#viewing');
async function load() {
  try {
    if (!slug) throw new Error('Choose a home from the collection.');
    const response = await fetch(`/api/properties/${encodeURIComponent(slug)}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const p = data.property;
    document.title = `${p.title} | Makan`;
    document.querySelector('#title').textContent = p.title;
    document.querySelector('#location').textContent = `${p.location} / ${p.type}`;
    document.querySelector('#specs').textContent = `${p.bedrooms} ${p.bedrooms === 1 ? 'bedroom' : 'bedrooms'} · ${p.area} m²`;
    document.querySelector('#price').textContent = `${new Intl.NumberFormat('en-EG').format(p.price)} EGP`;
    document.querySelector('#description').textContent = p.description;
    document.querySelector('#photo').src = p.image;
    pageStatus.hidden = true; document.querySelector('#detail').hidden = false;
  } catch (error) { pageStatus.textContent = error.message; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  const status = document.querySelector('#requestStatus'); status.textContent = 'Sending your request…';
  try {
    const response = await fetch(`/api/properties/${encodeURIComponent(slug)}/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    status.textContent = `Request received. Your reference: ${data.id}. An agent can now review it.`; form.reset();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
load();
