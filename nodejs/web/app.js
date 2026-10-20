const money = value => `${new Intl.NumberFormat('en-EG').format(value)} EGP`;
function el(tag, text, className) { const item = document.createElement(tag); if (text) item.textContent = text; if (className) item.className = className; return item; }
const form = document.querySelector('#filters');
let controller;
async function load() {
  controller?.abort(); controller = new AbortController();
  const query = new URLSearchParams();
  for (const [key,value] of new FormData(form)) if (value) query.set(key,value);
  history.replaceState(null, '', `${location.pathname}?${query}#collection`);
  document.querySelector('#error').textContent = '';
  document.querySelector('#count').textContent = 'Finding homes…';
  try {
    const response = await fetch(`/api/properties?${query}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const cards = data.properties.map(p => {
      const link = el('a', '', 'property-card'); link.href = `property.html?home=${encodeURIComponent(p.slug)}`;
      const image = document.createElement('img'); image.src = p.image; image.alt = `Architectural illustration for ${p.title}`; image.loading = 'lazy';
      const text = el('div', '', 'card-body');
      text.append(el('p', `${p.location} / ${p.type}`, 'eyebrow'), el('h3', p.title), el('p', `${p.bedrooms} ${p.bedrooms === 1 ? 'bed' : 'beds'} · ${p.area} m²`, 'specs'), el('strong', money(p.price)), el('span', 'Explore this home ↗', 'card-link'));
      link.append(image, text); return link;
    });
    document.querySelector('#properties').replaceChildren(...cards);
    document.querySelector('#count').textContent = `${cards.length} homes to explore`;
    document.querySelector('#empty').hidden = cards.length > 0;
  } catch (error) {
    if (error.name === 'AbortError') return;
    document.querySelector('#error').textContent = `${error.message} Please try again.`;
    document.querySelector('#count').textContent = 'Unable to load homes';
    document.querySelector('#properties').replaceChildren();
    document.querySelector('#empty').hidden = true;
  }
}
for (const [key,value] of new URLSearchParams(location.search)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
form.addEventListener('submit', event => { event.preventDefault(); load(); });
// Preserve the landing hero on the first visit; filters update the shareable URL.
const originalURL = location.href;
load(); history.replaceState(null, '', originalURL);
fetch('/api/version').then(r => r.json()).then(data => { document.querySelector('#version').textContent = `version=${data.version}`; }).catch(() => {});
