// Wischgeste auf einer Zeile, nach rechts und nach links. Funktioniert mit Touch und Maus (Pointer Events).
// Die Zeile folgt dem Finger. Ab 40 % der Breite löst die Aktion aus, sonst federt sie zurück.
// Ein Handler fehlt = diese Richtung ist gesperrt. Schlägt die Aktion fehl, federt die Zeile ebenfalls zurück.
// onFarLeft: zusätzliche Aktion, wenn man weit nach links wischt (ab der Hälfte), zum Beispiel löschen.
// Gibt es sie, löst die normale Aktion nach links schon ab 25 % aus, damit zwischen beiden genug Weg bleibt.
const START_DISTANCE = 10; // Pixel, bevor die Richtung festgelegt wird
const COMMIT_RATIO = 0.4;
const FAR_RATIO = 0.5;
const LEFT_WITH_FAR_RATIO = 0.25;

// handlers: { onRight?, onLeft?, onFarLeft? } jeweils () => Promise|void
export function attachSwipe(row, moving, handlers) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let locked = false;
  let suppressClick = false;
  let cleanupTimer = null;

  const setDirection = (direction) => {
    row.classList.toggle('swipe-right', direction === 'right');
    row.classList.toggle('swipe-left', direction === 'left');
  };

  // Schwelle für die normale Aktion in diese Richtung
  const commitAt = (distance) => row.offsetWidth * (distance < 0 && handlers.onFarLeft ? LEFT_WITH_FAR_RATIO : COMMIT_RATIO);

  const reset = () => {
    row.classList.remove('swipe-armed', 'swipe-far');
    tracking = false;
    locked = false;
    dx = 0;
  };

  const springBack = () => {
    moving.classList.remove('dragging');
    moving.style.transform = '';
    moving.style.opacity = '';
    clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => setDirection(null), 400);
  };

  row.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest?.('input, textarea, .drag-handle')) return;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    tracking = true;
    locked = false;
  });

  row.addEventListener('pointermove', (event) => {
    if (!tracking) return;
    const moveX = event.clientX - startX;
    const moveY = event.clientY - startY;
    if (!locked) {
      if (Math.abs(moveX) > START_DISTANCE && Math.abs(moveX) > Math.abs(moveY) * 1.5) {
        locked = true;
        clearTimeout(cleanupTimer);
        row.setPointerCapture(event.pointerId);
        moving.classList.add('dragging');
      } else if (Math.abs(moveY) > START_DISTANCE) {
        tracking = false; // Senkrechtes Scrollen: nichts tun
        return;
      } else {
        return;
      }
    }
    dx = moveX;
    if ((dx > 0 && !handlers.onRight) || (dx < 0 && !handlers.onLeft && !handlers.onFarLeft)) dx = 0;
    setDirection(dx > 0 ? 'right' : dx < 0 ? 'left' : null);
    moving.style.transform = `translateX(${dx}px)`;
    moving.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / (row.offsetWidth * 1.4)));
    // Schwelle erreicht: kurz vibrieren und das Symbol hervorheben (einmal pro Überschreiten)
    const far = dx < 0 && Boolean(handlers.onFarLeft) && -dx > row.offsetWidth * FAR_RATIO;
    if (far !== row.classList.contains('swipe-far')) {
      row.classList.toggle('swipe-far', far);
      if (far) {
        try {
          navigator.vibrate?.([10, 40, 10]);
        } catch {
          // ignorieren
        }
      }
    }
    // Ohne normale Aktion nach links zählt nur das weite Wischen
    const armed = dx < 0 && !handlers.onLeft ? far : Math.abs(dx) > commitAt(dx);
    if (armed !== row.classList.contains('swipe-armed')) {
      row.classList.toggle('swipe-armed', armed);
      if (armed) {
        try {
          navigator.vibrate?.(8);
        } catch {
          // ignorieren
        }
      }
    }
  });

  const finish = (event) => {
    if (!tracking) return;
    const wasLocked = locked;
    const distance = dx;
    reset();
    if (!wasLocked) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 80);
    if (row.hasPointerCapture?.(event.pointerId)) row.releasePointerCapture(event.pointerId);
    const far = distance < 0 && handlers.onFarLeft && -distance > row.offsetWidth * FAR_RATIO;
    const normal = Math.abs(distance) > commitAt(distance) && (distance > 0 ? handlers.onRight : handlers.onLeft);
    if (far || normal) {
      const handler = far ? handlers.onFarLeft : distance > 0 ? handlers.onRight : handlers.onLeft;
      moving.classList.remove('dragging');
      moving.style.transform = `translateX(${distance > 0 ? 110 : -110}%)`;
      moving.style.opacity = '0';
      setTimeout(() => {
        Promise.resolve()
          .then(handler)
          .catch(springBack);
      }, 160);
    } else {
      springBack();
    }
  };

  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', (event) => {
    if (locked) springBack();
    reset();
    if (row.hasPointerCapture?.(event.pointerId)) row.releasePointerCapture(event.pointerId);
  });

  // Nach einer Wischgeste darf der Klick nicht zusätzlich den Eintrag öffnen.
  row.addEventListener(
    'click',
    (event) => {
      if (suppressClick) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );
}
