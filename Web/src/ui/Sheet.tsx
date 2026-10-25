import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { store } from '../app/store';

/** Modal bottom sheet (centred dialog on wide screens). Escape or a scrim tap closes it. */
export function Sheet({
  title,
  left,
  right,
  children,
  onClose = () => store.close(),
  dismissable = true,
}: {
  title?: ComponentChildren;
  left?: ComponentChildren;
  right?: ComponentChildren;
  children: ComponentChildren;
  onClose?: () => void;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissable]);
  return (
    <div class="scrim" onClick={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true">
        {(title || left || right) && (
          <div class="sheet-head">
            <span class="left">{left}</span>
            <h2>{title}</h2>
            <span class="right">
              {right ?? (
                <button class="link" onClick={onClose}>
                  Done
                </button>
              )}
            </span>
          </div>
        )}
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="row">
      <span class="grow">{label}</span>
      <input class="switch" type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Share via the OS share sheet when there is one, else copy to the clipboard. */
export async function shareText(text: string, url?: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    store.showToast('Copied to clipboard');
  } catch {
    store.showToast(text);
  }
}
