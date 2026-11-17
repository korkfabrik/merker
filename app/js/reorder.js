// Sortieren per Ziehen am Griff. Die Zeile folgt dem Finger, die anderen rücken nach.
// Beim Loslassen meldet onMove(uid, previousUid), wo der Eintrag jetzt steht (previousUid = null: ganz oben).
const EDGE = 70; // Pixel am Rand, ab denen die Liste mitscrollt
const SPEED = 9;

export function attachReorder(list, scroller, onMove) {
  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (!handle || !event.isPrimary) return;
    const row = handle.closest('li[data-uid]');
    if (!row || row.parentElement !== list) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    // scroller darf auch eine Funktion sein (Element erst beim Ziehen bekannt, zum Beispiel im Dialog)
    const scrollBox = typeof scroller === 'function' ? scroller() : scroller;

    const startOrder = [...list.children];
    const startIndex = startOrder.indexOf(row);
    let pointerY = event.clientY;
    let startY = event.clientY;
    let translate = 0;
    let startScroll = scrollBox.scrollTop;
    let naturalStart = row.getBoundingClientRect().top;
    let frame = 0;
    row.classList.add('lifting');

    const update = () => {
      const naturalTop = row.getBoundingClientRect().top - translate;
      const wanted = naturalStart + (pointerY - startY) + (scrollBox.scrollTop - startScroll);
      translate = wanted - naturalTop;
      row.style.transform = `translateY(${translate}px)`;
      const rect = row.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const prev = row.previousElementSibling;
      const next = row.nextElementSibling;
      if (prev) {
        const r = prev.getBoundingClientRect();
        if (center < r.top + r.height / 2) {
          list.insertBefore(row, prev);
          return update();
        }
      }
      if (next) {
        const r = next.getBoundingClientRect();
        if (center > r.top + r.height / 2) {
          list.insertBefore(row, next.nextSibling);
          return update();
        }
      }
    };

    const loop = () => {
      const box = scrollBox.getBoundingClientRect();
      if (pointerY < box.top + EDGE) scrollBox.scrollTop -= SPEED;
      else if (pointerY > box.bottom - EDGE) scrollBox.scrollTop += SPEED;
      update();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const move = (e) => {
      pointerY = e.clientY;
    };
    const end = (e) => {
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      row.classList.remove('lifting');
      row.style.transform = '';
      if (e.type === 'pointercancel') {
        startOrder.forEach((node) => list.append(node));
        return;
      }
      const index = [...list.children].indexOf(row);
      if (index === startIndex) return;
      onMove(row.dataset.uid, row.previousElementSibling?.dataset.uid ?? null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}
