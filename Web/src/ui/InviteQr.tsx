import qrcode from 'qrcode-generator';
import { store, useStore } from '../app/store';
import { track } from '../lib/usage';
import { Sheet, shareText } from './Sheet';
import { Icon } from './icons';

/** A QR code as one crisp SVG path — always dark on white so any camera reads it. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4; // quiet zone
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return (
    <svg class="qr" viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * "Invite a friend": your invite link as a QR code to scan in person, with
 * the share sheet one tap away for sending it instead.
 */
export function InviteQrSheet() {
  const s = useStore();
  const { text, url } = store.inviteLink();
  const crew = !!s.crew?.invite_code;
  return (
    <Sheet title="Invite a friend">
      <div class="invite-qr">
        <QrCode text={url} label="QR code for your invite link" />
        <p>
          {crew
            ? 'Have them point their phone camera here. It opens Sudoku Crew and asks to connect with you.'
            : 'Have them point their phone camera here to open Sudoku Crew.'}
        </p>
      </div>
      <button
        class="btn"
        onClick={() => {
          track('feature', { f: 'invite_link' });
          void shareText(text, url);
        }}
      >
        <Icon name="share" size={18} /> Send a link instead
      </button>
    </Sheet>
  );
}
