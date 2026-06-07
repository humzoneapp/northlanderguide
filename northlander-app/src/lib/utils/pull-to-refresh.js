/* ==================================================================
   Pull-to-refresh Svelte action.

   Apply to any element with `use:pullToRefresh={{ onRefresh }}` and
   the user can drag down from the top of the page on touch devices
   to trigger the callback. A small overlay shows a spinner while
   the refresh runs. Falls back to a no-op on desktop / browsers
   without touch events.
   ================================================================== */

const THRESHOLD = 72; // px the user must pull before a refresh fires

export function pullToRefresh(node, params = {}) {
  let onRefresh = params.onRefresh;
  let active = false;
  let startY = 0;
  let pulled = 0;
  let overlay;
  let spinner;
  let busy = false;

  /* Only set up the overlay element when the action mounts. Lives
     in body so it floats above sticky topbars + TOCs. */
  function ensureOverlay() {
    if (overlay || typeof document === 'undefined') return;
    overlay = document.createElement('div');
    overlay.className = 'ptr-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    spinner = document.createElement('div');
    spinner.className = 'ptr-spinner';
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
    /* Styles injected once - keeping them here means callers don't
       have to remember to import a stylesheet alongside the action. */
    if (!document.getElementById('ptr-styles')) {
      const style = document.createElement('style');
      style.id = 'ptr-styles';
      style.textContent = `
        .ptr-overlay {
          position: fixed;
          top: 0;
          left: 50%;
          transform: translate(-50%, -60px);
          z-index: 250;
          width: 44px;
          height: 44px;
          background: #fbf6ea;
          border: 1.5px solid #c9a84c;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 16px rgba(40, 30, 15, 0.32);
          transition: transform 200ms cubic-bezier(.2,.7,.3,1), opacity 200ms ease;
          opacity: 0;
          pointer-events: none;
        }
        .ptr-overlay.is-pulling { opacity: 1; }
        .ptr-overlay.is-busy .ptr-spinner {
          animation: ptr-spin 0.9s linear infinite;
        }
        .ptr-spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(125, 58, 30, 0.2);
          border-top-color: #7d3a1e;
          border-radius: 50%;
        }
        @keyframes ptr-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .ptr-overlay { transition: opacity 200ms ease; }
          .ptr-overlay.is-busy .ptr-spinner { animation: none; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function showAt(distance) {
    if (!overlay) return;
    const clamped = Math.min(distance, THRESHOLD * 1.4);
    const offset = Math.min(0, -60 + clamped * 0.8);
    overlay.style.transform = `translate(-50%, ${offset}px)`;
    overlay.classList.toggle('is-pulling', distance > 8);
  }

  function reset() {
    active = false;
    pulled = 0;
    if (overlay) {
      overlay.style.transform = 'translate(-50%, -60px)';
      overlay.classList.remove('is-pulling');
    }
  }

  async function fire() {
    if (busy) return;
    busy = true;
    if (overlay) overlay.classList.add('is-busy');
    try {
      if (typeof onRefresh === 'function') await onRefresh();
    } finally {
      busy = false;
      if (overlay) overlay.classList.remove('is-busy');
      reset();
    }
  }

  function onTouchStart(e) {
    if (busy) return;
    if (typeof window !== 'undefined' && window.scrollY > 0) return;
    const t = e.touches?.[0];
    if (!t) return;
    active = true;
    startY = t.clientY;
    pulled = 0;
    ensureOverlay();
  }

  function onTouchMove(e) {
    if (!active) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dy = t.clientY - startY;
    if (dy <= 0) {
      pulled = 0;
      showAt(0);
      return;
    }
    pulled = dy;
    showAt(dy);
  }

  function onTouchEnd() {
    if (!active) return;
    if (pulled >= THRESHOLD) {
      fire();
    } else {
      reset();
    }
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', reset);

  return {
    update(next = {}) {
      onRefresh = next.onRefresh;
    },
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', reset);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }
  };
}
