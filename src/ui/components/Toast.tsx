import { create } from 'zustand';

interface Toast { id: number; text: string; kind: 'ok' | 'err' }
export const useToasts = create<{ items: Toast[]; push(text: string, kind?: Toast['kind']): void; drop(id: number): void }>((set, get) => ({
  items: [],
  push(text, kind = 'ok') {
    const id = Date.now() + Math.random();
    set({ items: [...get().items, { id, text, kind }] });
    setTimeout(() => get().drop(id), kind === 'err' ? 9000 : 4500);
  },
  drop(id) { set({ items: get().items.filter((t) => t.id !== id) }); },
}));
export const toast = (text: string, kind?: Toast['kind']) => useToasts.getState().push(text, kind);

export function ToastZone() {
  const items = useToasts((s) => s.items);
  const drop = useToasts((s) => s.drop);
  return (
    <div className="toast-zone" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => drop(t.id)}>{t.text}</div>
      ))}
    </div>
  );
}
