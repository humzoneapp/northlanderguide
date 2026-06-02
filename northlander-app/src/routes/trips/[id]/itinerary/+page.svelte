<script>
  /* ==================================================================
     This route is preserved as a redirect.

     The cinematic itinerary that used to live here has been merged
     into the trip page at /trips/[id]. Old links + browser
     bookmarks land here and get bounced one level up so nothing
     404s.

     The dedicated print-friendly view still lives at
     /trips/[id]/print.
     ================================================================== */

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  onMount(() => {
    const id = $page.params.id;
    goto(`/trips/${id}`, { replaceState: true });
  });
</script>

<svelte:head>
  <title>Itinerary - Northlander</title>
</svelte:head>

<p class="status">Taking you to the trip page&hellip;</p>

<style>
  .status {
    text-align: center;
    padding: 80px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    background: #0a2d21;
    margin: 0;
  }
</style>
