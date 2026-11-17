// Zustand im Speicher. Die Ansichten lesen nur von hier und melden sich für Änderungen an.
export class Store {
  #state = {
    status: 'connecting', // connecting | online | offline
    error: null,
    lists: [], // aktive Listen: { id, name, open, features, featureBits }
    allLists: [], // alle Listen aus Home Assistant, auch die deaktivierten (nur für die Einstellungen)
    items: {}, // entityId -> Eintraege aus Home Assistant
    loaded: {}, // entityId -> true, sobald das Abo die erste Antwort geliefert hat
    syncedAt: null, // Zeitpunkt des Stands, den die Anzeige gerade zeigt, solange er nicht live ist
    fromCache: false, // true, solange nur der gespeicherte Stand gezeigt wird
  };
  #listeners = new Set();
  #scheduled = false;

  get() {
    return this.#state;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  set(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#notify();
  }

  setItems(entityId, items) {
    this.#state = {
      ...this.#state,
      items: { ...this.#state.items, [entityId]: items },
      loaded: { ...this.#state.loaded, [entityId]: true },
    };
    this.#notify();
  }

  removeItems(entityId) {
    const items = { ...this.#state.items };
    const loaded = { ...this.#state.loaded };
    delete items[entityId];
    delete loaded[entityId];
    this.#state = { ...this.#state, items, loaded };
    this.#notify();
  }

  // Mehrere schnelle Änderungen lösen nur ein Neuzeichnen aus.
  #notify() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      for (const listener of this.#listeners) listener(this.#state);
    });
  }
}
