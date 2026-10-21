// Highlight the current path, including lessons belonging to a cloud track.
for (const link of document.querySelectorAll('.primary-nav a')) {
  const current = location.pathname;
  const href = link.getAttribute('href');
  if (current === href || (href === '/' && current === '/index.html') || (href === '/tracks/aws.html' && current.startsWith('/lessons/aws-')) || (href === '/tracks/azure.html' && current.startsWith('/lessons/azure-'))) link.setAttribute('aria-current','page');
}
const cards = document.querySelector('#referenceCards');
if (cards) {
  const search = document.querySelector('#referenceSearch');
  const count = document.querySelector('#referenceCount');
  const track = document.querySelector('#referenceTrack');
  fetch('library-index.json?v=cloud-learning-1').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(lessons => {
    function render() {
      const query = search.value.trim().toLowerCase();
      const matches = lessons.filter(l => (!track?.value || l.trackId === track.value) && `${l.title} ${l.track} ${l.summary} ${l.text}`.toLowerCase().includes(query));
      cards.replaceChildren(...matches.map(l => {
        const card = document.createElement('a'); card.className = 'reference-card'; card.href = `lessons/${l.id}.html`; card.dataset.progressId = l.id;
        for (const [tag,text,cls] of [['p',`${l.track} / ${l.level}`,'eyebrow'],['h3',l.title,''],['p',l.summary,''],['span',`${l.minutes} min + practice →`,'card-meta']]) { const element = document.createElement(tag); element.textContent = text; element.className = cls; card.append(element); }
        const state = document.createElement('span'); state.className = 'completion-label'; card.append(state);
        return card;
      }));
      renderReferenceProgress();
      count.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'lesson' : 'lessons'}${query ? ' matching your search' : ' available'}` : 'No matching lessons. Try a tool name or a shorter search.';
    }
    search.addEventListener('input',render); track?.addEventListener('change',render); render();
  }).catch(() => { count.textContent = 'The library could not load. Refresh to try again.'; });
}
for (const code of document.querySelectorAll('.prose pre')) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy'; button.className = 'copy-code';
  button.addEventListener('click',async () => { try { await navigator.clipboard.writeText(code.querySelector('code').textContent); button.textContent = 'Copied'; } catch { button.textContent = 'Select and copy the code'; } setTimeout(() => {button.textContent = 'Copy';},2000); });
  code.append(button);
}
for (const heading of document.querySelectorAll('.prose h2')) if (heading.textContent === 'Arabic takeaway') { let item = heading.nextElementSibling; while (item && item.tagName !== 'H2') { item.lang = 'ar'; item.dir = 'rtl'; item = item.nextElementSibling; } }

// Use the same local keys, completion event and account sync contract as the tour.
function renderReferenceProgress() {
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  for (const item of document.querySelectorAll('[data-progress-id]')) {
    const done = read(`learning-v2-${item.dataset.progressId}`) === '1';
    const button = item.querySelector('.lesson-done');
    if (button) { button.setAttribute('aria-pressed', String(done)); button.textContent = done ? 'Completed ✓ — mark incomplete' : 'Mark module complete'; }
    const label = item.querySelector('.completion-label');
    if (label) label.textContent = done ? 'Completed ✓' : 'Not completed';
  }
  for (const summary of document.querySelectorAll('[data-track-progress]')) {
    const rows = [...document.querySelectorAll('.track-modules [data-progress-id]')];
    const completed = rows.filter(item => read(`learning-v2-${item.dataset.progressId}`) === '1').length;
    summary.textContent = `${completed} of ${rows.length} modules complete`;
  }
}
for (const item of document.querySelectorAll('.completion[data-progress-id]')) {
  item.querySelector('.lesson-done')?.addEventListener('click', () => {
    const lessonId = item.dataset.progressId;
    const updatedAt = new Date().toISOString();
    try {
      const complete = localStorage.getItem(`learning-v2-${lessonId}`) !== '1';
      localStorage.setItem(`learning-v2-${lessonId}`, complete ? '1' : '0');
      localStorage.setItem(`learning-v2-updated-${lessonId}`, updatedAt);
      localStorage.setItem(`learning-v2-completed-at-${lessonId}`, complete ? updatedAt : '');
      window.dispatchEvent(new CustomEvent('learning-progress-change', { detail: { lessonId, complete, updatedAt } }));
      renderReferenceProgress();
    } catch { item.querySelector('.progress-note').textContent = 'Browser storage is unavailable. Progress was not saved.'; }
  });
}
for (const form of document.querySelectorAll('.reference-quiz')) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    const selected = form.querySelector('input:checked');
    const feedback = form.querySelector('.quiz-feedback');
    if (!selected) { feedback.textContent = 'Choose an answer first.'; return; }
    feedback.textContent = `${selected.value === form.dataset.answer ? 'Correct.' : 'Not yet.'} ${form.dataset.explanation}`;
  });
}
window.addEventListener('learning-progress-render', renderReferenceProgress);
window.addEventListener('storage', renderReferenceProgress);
renderReferenceProgress();
