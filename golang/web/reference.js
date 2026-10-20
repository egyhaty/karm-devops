const cards = document.querySelector('#referenceCards');
if (cards) {
  const search = document.querySelector('#referenceSearch');
  const count = document.querySelector('#referenceCount');
  fetch('library-index.json').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(lessons => {
    function render() {
      const query = search.value.trim().toLowerCase();
      const matches = lessons.filter(l => `${l.title} ${l.track} ${l.summary} ${l.text}`.toLowerCase().includes(query));
      cards.replaceChildren(...matches.map(l => {
        const card = document.createElement('a'); card.className = 'reference-card'; card.href = `lessons/${l.id}.html`;
        for (const [tag,text,cls] of [['p',`${l.track} / ${l.level}`,'eyebrow'],['h3',l.title,''],['p',l.summary,''],['span',`${l.minutes} min + practice →`,'card-meta']]) { const element = document.createElement(tag); element.textContent = text; element.className = cls; card.append(element); }
        return card;
      }));
      count.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'lesson' : 'lessons'}${query ? ' matching your search' : ' available'}` : 'No matching lessons. Try a tool name or a shorter search.';
    }
    search.addEventListener('input',render); render();
  }).catch(() => { count.textContent = 'The library could not load. Refresh to try again.'; });
}
for (const code of document.querySelectorAll('.prose pre')) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy'; button.className = 'copy-code';
  button.addEventListener('click',async () => { try { await navigator.clipboard.writeText(code.querySelector('code').textContent); button.textContent = 'Copied'; } catch { button.textContent = 'Select and copy the code'; } setTimeout(() => {button.textContent = 'Copy';},2000); });
  code.append(button);
}
for (const heading of document.querySelectorAll('.prose h2')) if (heading.textContent === 'Arabic takeaway') { let item = heading.nextElementSibling; while (item && item.tagName !== 'H2') { item.lang = 'ar'; item.dir = 'rtl'; item = item.nextElementSibling; } }
