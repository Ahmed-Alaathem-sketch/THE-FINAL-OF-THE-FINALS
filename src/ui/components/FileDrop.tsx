import { useRef, useState } from 'react';
import { I } from './icons';

export function FileDrop({ onFiles, accept, multiple = true, label, hint, testId }: { onFiles: (f: File[]) => void; accept: string; multiple?: boolean; label: string; hint?: string; testId?: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`drop${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files); if (fs.length) onFiles(fs); }}
    >
      <I.upload />
      <p style={{ margin: '8px 0 4px', fontWeight: 700 }}>{label}</p>
      {hint && <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>{hint}</p>}
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden data-testid={testId} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) onFiles(fs); }} />
    </div>
  );
}

export async function readFiles(files: File[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}
