/* ==================================================================
   Client-side QR encoder.

   Wraps the `qrcode-generator` library and exposes a single helper
   that returns the matrix of dark/light cells so a Svelte template
   can render the QR as inline SVG. Keeps the QR off any third-party
   service (the Share modal used to pull a PNG from QuickChart, which
   put us at the mercy of their uptime + rate limits).

   Lib reference: https://github.com/kazuhikoarase/qrcode-generator
   - typeNumber 0 = auto-pick smallest QR version that fits the data
   - errorCorrectionLevel 'M' = ~15% recovery, the default trade-off
     between density and resilience to a smudged camera capture
   ================================================================== */

import qrcode from 'qrcode-generator';

/**
 * Encode `text` as a QR code matrix.
 * Returns `{ size, cells }` where size is the side length in modules
 * and cells is a `size x size` array of booleans (true = dark).
 * Returns `null` when the input is empty or encoding fails.
 */
export function generateQrMatrix(text, errorCorrection = 'M') {
  const value = String(text || '');
  if (!value) return null;
  try {
    const qr = qrcode(0, errorCorrection);
    qr.addData(value);
    qr.make();
    const size = qr.getModuleCount();
    const cells = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        row.push(qr.isDark(r, c));
      }
      cells.push(row);
    }
    return { size, cells };
  } catch (_) {
    return null;
  }
}
