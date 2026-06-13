/* ==================================================================
   Sample trip the App ships out of the box.

   Loads on /sample-trip as a read-only preview that lets a first-time
   visitor feel the product without having to invent a trip name + stops
   from a blank slate. The same shape will feed the "Make this my trip"
   duplication flow later: every field has a 1:1 mapping to the real
   schema in stores/trips.js + stores/bookings.js + stores/budget.js +
   stores/diary.js, so the duplicate code can just clone-and-write.

   Cross-site contract: the Guide's /plan-a-trip "See What You're
   Packing" journal preview is the editorial billboard for the same
   trip - the cover, stops, and stat totals here match what's hard-coded
   into site/plan-a-trip/index.html. Keep them in sync.
   ================================================================== */

export const SAMPLE_TRIP = {
  /* Cover identity. Slug is what the polaroid CTA links to (/sample-trip).
     Leather palette is rust so the visual ties to the .dash-feature
     icons in the strip above and the Guide's poster-crimson accent. */
  id: 'sample',
  name: 'A Long Weekend North',
  strap: 'Three days up the Muskoka line, with a stopover in Gravenhurst on the way to Lake Nipissing.',
  colorId: 'rust',
  color: '#7d3a1e',
  strapColor: '#5e2a14',

  /* Route: three stops over three days. departureDate + stops[].date
     mirror the real Trip schema so a future duplicate flow can write
     these straight into Dexie. */
  departureDate: '2026-09-04',
  returnDate: '2026-09-06',
  returnStopId: 'union',
  stops: [
    {
      stopId: 'union',
      date: '2026-09-04',
      note: 'Morning train north. Coffee + croissant from the food court before the 9:35 boarding.'
    },
    {
      stopId: 'gravenhurst',
      date: '2026-09-04',
      note: "Pull into the Muskoka stop in the afternoon. RMS Segwun docked at the wharf if you're early enough."
    },
    {
      stopId: 'northbay',
      date: '2026-09-05',
      note: 'Arrive mid-afternoon. Walk the Lake Nipissing boardwalk before dinner.'
    }
  ],

  /* Four sample bookings. Mix of statuses (one confirmed, three
     pending) so a visitor sees what a real booking list looks like.
     Matches the bookings table schema: kind / name / status / dueDate. */
  bookings: [
    {
      kind: 'train',
      name: 'Toronto Union → North Bay, round trip',
      status: 'pending',
      dueDate: '2026-08-20',
      confirmation: ''
    },
    {
      kind: 'room',
      name: 'The Muskoka Inn, Gravenhurst',
      status: 'confirmed',
      dueDate: '2026-09-04',
      confirmation: 'MUS-29481'
    },
    {
      kind: 'room',
      name: 'Northern Trail B&B, North Bay',
      status: 'pending',
      dueDate: '2026-09-05',
      confirmation: ''
    },
    {
      kind: 'activity',
      name: 'RMS Segwun heritage steamship cruise',
      status: 'pending',
      dueDate: '2026-09-04',
      confirmation: ''
    }
  ],

  /* Five-line budget summing to $620 (rounded for a believable solo
     weekend). budgetEntries table schema: category / label / amount. */
  budget: [
    { category: 'Train',      label: 'Round-trip Toronto Union → North Bay', amount: 200 },
    { category: 'Lodging',    label: 'Two nights, two inns',                  amount: 300 },
    { category: 'Food',       label: 'Three days, casual mid-range',          amount: 80  },
    { category: 'Activities', label: 'Steamship + small-town museum',         amount: 30  },
    { category: 'Buffer',     label: 'Whatever you forget to plan',           amount: 10  }
  ],

  /* Three short diary preview notes - one per day - so the visitor
     sees how the trip narrates after the fact. */
  diary: [
    {
      stopId: 'gravenhurst',
      title: 'Lakeside dinner at the Boathouse',
      body: 'The waiter pointed out the Segwun coming back in across the wharf. Felt like we had landed in 1925.'
    },
    {
      stopId: 'northbay',
      title: 'Morning along Lake Nipissing',
      body: 'Empty boardwalk except for a heron and one early jogger. Coffee from the kiosk by the marina.'
    },
    {
      stopId: 'union',
      title: 'Back home before sunset',
      body: 'Train was on time both ways. We would do this again next September.'
    }
  ],

  /* Headline numbers used by the polaroid cover + the Guide preview.
     Packing-list isn't fully expanded out into individual items here;
     it just exposes the count so the preview can claim "22 packing
     items" the same way the Guide does. The duplicate flow will
     seed a real default packing list at clone time. */
  packingCount: 22,
  bookingCount: 4,
  budgetTotal: 620,
  diaryCount: 3
};
