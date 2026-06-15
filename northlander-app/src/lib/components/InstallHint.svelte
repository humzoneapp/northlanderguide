<script>
  /* ==================================================================
     InstallHint - dismissable bottom banner that nudges visitors to
     install Northlander as a PWA. Handles both platforms:

       - Android (and desktop Chrome / Edge): listens for
         `beforeinstallprompt`, stashes the event, exposes an
         "Install" button that triggers the native prompt.
       - iOS Safari: Apple doesn't fire beforeinstallprompt and
         hides the install option two taps deep in the share sheet,
         so we render a "Show me how" link that goes to /install.

     The banner stays out of the way once dismissed (localStorage
     flag) and never appears for users who are already in standalone
     mode (i.e. already installed). The current page is also a
     suppressor: showing the install nudge on the /install page
     itself would be silly.

     Override for visual QA: append ?install-hint=force to any URL.
     ================================================================== */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let visible = false;
  /** 'ios' (show instructions) | 'native' (use beforeinstallprompt) */
  let mode = 'ios';
  /** The captured BeforeInstallPromptEvent on Android / Chrome. */
  let deferredPrompt = null;
  let icon = '/icon-192.png';

  const STORAGE_KEY = 'northlander-install-hint-dismissed';

  function isStandalone() {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    /* Other iOS browsers (Chrome, Firefox, Edge on iOS) can't install
       PWAs to the home screen - only Safari can. Detect by their UA
       slugs so we don't show install instructions to a user who
       physically cannot follow them. */
    const isSafariOnIOS = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
    return { isIOS, isSafariOnIOS };
  }

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* private mode */ }
    visible = false;
  }

  async function triggerNativeInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) { /* user dismissed */ }
    deferredPrompt = null;
    visible = false;
  }

  onMount(() => {
    if (typeof window === 'undefined') return;

    const force = new URLSearchParams(window.location.search).get('install-hint') === 'force';

    /* Never show on /install itself - the user is already on the
       page that teaches them how to install, the banner would be
       noise. */
    if ($page?.url?.pathname === '/install' && !force) return;

    if (isStandalone() && !force) return;

    let dismissed = false;
    try { dismissed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
    if (dismissed && !force) return;

    /* Listen for the Android / desktop Chromium install prompt event
       BEFORE deciding on a mode. The event may have already fired
       and been captured by SvelteKit's auto-register; if not, this
       captures it for us. We unwrap a tiny race by waiting one
       microtask so the listener gets attached before any work runs. */
    const onBefore = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      mode = 'native';
      visible = true;
    };
    window.addEventListener('beforeinstallprompt', onBefore);

    /* If the browser fires `appinstalled` (the user just installed),
       hide and remember the dismissal so we don't pester them. */
    const onInstalled = () => dismiss();
    window.addEventListener('appinstalled', onInstalled);

    const { isSafariOnIOS } = detectPlatform();
    if (isSafariOnIOS) {
      mode = 'ios';
      visible = true;
    } else if (force) {
      /* Force flag with no other platform match: default to iOS-style
         instructions so the banner shows for visual review. */
      mode = 'ios';
      visible = true;
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  });
</script>

{#if visible}
  <aside class="install-hint" role="complementary" aria-label="Install Northlander">
    <img class="install-hint-icon" src={icon} alt="" width="44" height="44" />
    <div class="install-hint-body">
      <p class="install-hint-title">
        {#if mode === 'native'}
          Install Northlander on this device
        {:else}
          Install Northlander on your iPhone
        {/if}
      </p>
      <p class="install-hint-sub">
        {#if mode === 'native'}
          One tap to add it to your home screen.
        {:else}
          Tap Share, then "Add to Home Screen".
        {/if}
      </p>
    </div>
    <div class="install-hint-actions">
      {#if mode === 'native'}
        <button type="button" class="install-hint-cta" on:click={triggerNativeInstall}>
          Install
        </button>
      {:else}
        <a class="install-hint-cta" href="/install">Show me how</a>
      {/if}
      <button
        type="button"
        class="install-hint-close"
        on:click={dismiss}
        aria-label="Dismiss install hint"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M6 6 L18 18 M18 6 L6 18"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </aside>
{/if}

<style>
  .install-hint {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 90;
    width: calc(100% - 1.5rem);
    max-width: 460px;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: 0.85rem;
    align-items: center;
    padding: 0.75rem 0.9rem 0.75rem 0.85rem;
    background: theme('colors.forest');
    color: theme('colors.ivory');
    border-radius: 14px;
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.30), 0 2px 0 rgba(201, 168, 76, 0.25);
    /* Subtle linen overlay matches the poster vocabulary used
       across the app. */
    background-image:
      repeating-linear-gradient(45deg, rgba(245, 240, 232, 0.04) 0, rgba(245, 240, 232, 0.04) 1px, transparent 1px, transparent 9px),
      linear-gradient(theme('colors.forest'), theme('colors.forest'));
    /* Slide in on first paint so the banner feels intentional, not
       a layout-shift surprise. */
    animation: install-hint-in 0.32s ease-out;
  }
  @keyframes install-hint-in {
    from { transform: translate(-50%, 120%); opacity: 0; }
    to   { transform: translate(-50%, 0);    opacity: 1; }
  }

  .install-hint-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: theme('colors.ivory');
    padding: 0;
    object-fit: cover;
  }

  .install-hint-body { min-width: 0; }
  .install-hint-title {
    margin: 0;
    font-family: theme('fontFamily.serif');
    font-weight: 700;
    font-size: 0.98rem;
    line-height: 1.15;
    color: theme('colors.ivory');
  }
  .install-hint-sub {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    line-height: 1.3;
    color: rgba(245, 240, 232, 0.75);
  }

  .install-hint-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .install-hint-cta {
    display: inline-block;
    background: theme('colors.gold');
    color: theme('colors.forest');
    font-family: theme('fontFamily.sans');
    font-weight: 700;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.55rem 0.85rem;
    border: 0;
    border-radius: 8px;
    text-decoration: none;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
    white-space: nowrap;
  }
  .install-hint-cta:hover { background: #d8b75a; }

  .install-hint-close {
    width: 28px;
    height: 28px;
    border: 0;
    background: transparent;
    color: rgba(245, 240, 232, 0.7);
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
  }
  .install-hint-close:hover {
    color: theme('colors.ivory');
    background: rgba(245, 240, 232, 0.10);
  }

  @media (max-width: 480px) {
    .install-hint {
      bottom: 0.6rem;
      padding: 0.7rem 0.75rem;
      gap: 0.7rem;
    }
    .install-hint-title { font-size: 0.92rem; }
    .install-hint-sub { font-size: 0.76rem; }
    .install-hint-cta { padding: 0.5rem 0.7rem; font-size: 0.8rem; }
  }
</style>
