/* ==================================================================
   THE NORTHLANDER WAYFINDER — STOP DATA
   ------------------------------------------------------------------
   Curated starter content for all 16 stops on the Northlander route.
   Each stop has: restaurants, parks, attractions, and events.

   This data renders the site immediately. To make it AUTO-UPDATING,
   see api.js — the Google Places + Eventbrite integration replaces
   the arrays below at runtime once you add API keys.
   ================================================================== */

const STOPS = [
  /* ---- 1. UNION STATION (TORONTO) ---- */
  {
    id:"union", lat:43.6453, lng:-79.3806, hook:"Canada's grandest railway hall — your journey north begins here.", name:"Toronto Union", region:"Toronto", time:"0:00",
    blurb:"The southern terminus. A vast historic station in the heart of downtown Toronto, steps from the waterfront, sports venues, and the Distillery District.",
    facts:["Departure point northbound","Connects to GO, UP Express, VIA, TTC subway","Walkable to Harbourfront & St. Lawrence Market"],
    restaurants:[
      {name:"St. Lawrence Market",tag:"Food Market",desc:"Historic market hall — peameal bacon sandwiches, cheese, produce.",rating:"4.7"},
      {name:"Richmond Station",tag:"Canadian",desc:"Refined seasonal Canadian cooking from a celebrated local chef.",rating:"4.6"},
      {name:"Pizzeria Libretto",tag:"Italian",desc:"Naples-certified wood-fired pizza, a downtown staple.",rating:"4.5"}
    ],
    parks:[
      {name:"Harbourfront Centre",tag:"Waterfront",desc:"Lakeside promenade, arts venues and seasonal events on Lake Ontario.",rating:"4.6"},
      {name:"Toronto Music Garden",tag:"Garden",desc:"Whimsical waterfront garden designed around a Bach suite.",rating:"4.7"}
    ],
    attractions:[
      {name:"CN Tower",tag:"Landmark",desc:"Iconic 553m tower with glass floor and EdgeWalk.",rating:"4.6"},
      {name:"Distillery District",tag:"Heritage",desc:"Cobblestone Victorian district of galleries, cafes and shops.",rating:"4.7"},
      {name:"Hockey Hall of Fame",tag:"Museum",desc:"Steps from Union — a shrine to Canadian hockey.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Fairmont Royal York",tag:"Historic Hotel",desc:"Grand landmark hotel directly across from Union Station.",rating:"4.5"},
      {name:"The Omni King Edward",tag:"Luxury",desc:"Toronto's oldest luxury hotel, a short walk away.",rating:"4.6"},
      {name:"Downtown hostels & inns",tag:"Budget",desc:"Range of budget stays around the St. Lawrence area.",rating:"4.2"}
    ],
    events:[
      {d:"14",m:"Jun",name:"Harbourfront Summer Music",where:"Harbourfront Centre",desc:"Free outdoor concerts by the lake."},
      {d:"21",m:"Jun",name:"St. Lawrence Market Festival",where:"St. Lawrence Market",desc:"Tastings and vendor showcases."},
      {d:"28",m:"Jun",name:"Distillery Sunday Market",where:"Distillery District",desc:"Local makers and artisan food."}
    ]
  },

  /* ---- 2. LANGSTAFF ---- */
  {
    id:"langstaff", lat:43.84, lng:-79.428, hook:"A kettle-lake boardwalk and a century-old observatory.", name:"Langstaff", region:"Richmond Hill", time:"0:35",
    blurb:"A commuter transit hub in Richmond Hill, gateway to York Region's parks, trails and suburban dining.",
    facts:["Transit hub stop","Near Richmond Hill centre","Access to Lake Wilcox & Oak Ridges trails"],
    restaurants:[
      {name:"Richmond Hill Eateries — Yonge St.",tag:"Mixed",desc:"A long strip of family restaurants, cafes and bakeries.",rating:"4.3"},
      {name:"Times Square Food Court",tag:"Asian",desc:"Well-known hub for authentic East Asian cuisine.",rating:"4.4"}
    ],
    parks:[
      {name:"Lake Wilcox Park",tag:"Lakeside",desc:"Boardwalk, splash pad and trails around a kettle lake.",rating:"4.5"},
      {name:"Mill Pond Park",tag:"Park",desc:"Scenic pond, gazebo and walking loops — a local favourite.",rating:"4.6"},
      {name:"Oak Ridges Corridor",tag:"Trail",desc:"Protected moraine trails with wetlands and wildlife.",rating:"4.5"}
    ],
    attractions:[
      {name:"David Dunlap Observatory",tag:"Science",desc:"Historic observatory with public stargazing nights.",rating:"4.6"},
      {name:"Richmond Hill Centre for the Performing Arts",tag:"Arts",desc:"Year-round concerts and theatre.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Richmond Hill hotels",tag:"Chain Hotels",desc:"Several mid-range chain hotels near Highway 7.",rating:"4.2"},
      {name:"Local B&Bs",tag:"B&B",desc:"Quiet bed-and-breakfast options in residential Richmond Hill.",rating:"4.4"}
    ],
    events:[
      {d:"07",m:"Jun",name:"Lake Wilcox Music Series",where:"Lake Wilcox Park",desc:"Free weekend lakeside concerts."},
      {d:"20",m:"Jun",name:"Observatory Star Party",where:"David Dunlap Observatory",desc:"Evening telescope viewing."}
    ]
  },

  /* ---- 3. GORMLEY ---- */
  {
    id:"gormley", lat:43.946, lng:-79.365, hook:"Pick-your-own orchards on the rim of the Oak Ridges Moraine.", name:"Gormley", region:"Whitchurch-Stouffville", time:"0:50",
    blurb:"A GO transit hub on the edge of farm country — the doorway to the rolling Oak Ridges Moraine and pick-your-own farms.",
    facts:["Transit hub stop","Surrounded by conservation land","Close to Stouffville's main street"],
    restaurants:[
      {name:"Main Street Stouffville",tag:"Small Town",desc:"Historic main street with cafes, pubs and bakeries.",rating:"4.4"},
      {name:"Local Farm Markets",tag:"Farm",desc:"Seasonal roadside stands and pick-your-own orchards.",rating:"4.6"}
    ],
    parks:[
      {name:"Bruce's Mill Conservation Area",tag:"Conservation",desc:"Trails, maple syrup festival and an aerial adventure park.",rating:"4.5"},
      {name:"Whitchurch Conservation Area",tag:"Nature",desc:"Quiet forest and wetland trails on the moraine.",rating:"4.4"}
    ],
    attractions:[
      {name:"Treetop Trekking",tag:"Adventure",desc:"Ziplines and aerial courses at Bruce's Mill.",rating:"4.6"},
      {name:"Stouffville Heritage Museum",tag:"Museum",desc:"Local history in a restored historic building.",rating:"4.3"}
    ],
    accommodations:[
      {name:"Stouffville inns",tag:"Country Inn",desc:"Small inns and guesthouses near the main street.",rating:"4.3"},
      {name:"Farm stays",tag:"Farm Stay",desc:"Seasonal farm-stay accommodation on the moraine.",rating:"4.5"}
    ],
    events:[
      {d:"08",m:"Jun",name:"Stouffville Farmers' Market",where:"Main Street",desc:"Saturday market, May–October."},
      {d:"15",m:"Jun",name:"Strawberry Social",where:"Bruce's Mill",desc:"Seasonal berry festival."}
    ]
  },

  /* ---- 4. WASHAGO ---- */
  {
    id:"washago", lat:44.735, lng:-79.345, hook:"Where two rivers meet — the doorstep of cottage country.", name:"Washago", region:"Gateway to Muskoka", time:"2:00",
    blurb:"A small riverside community where the Black and Severn rivers meet — the unofficial gateway to cottage country.",
    facts:["Modern glass shelter stop","On the Trent–Severn Waterway","Edge of Muskoka lakes region"],
    restaurants:[
      {name:"Washago Diners",tag:"Comfort",desc:"Classic small-town diners and seasonal ice cream stops.",rating:"4.3"},
      {name:"The Lewisham",tag:"Pub",desc:"Riverside pub fare popular with boaters and cottagers.",rating:"4.4"}
    ],
    parks:[
      {name:"Washago Centennial Park",tag:"Riverside",desc:"Beach, picnic spots and swimming where the rivers meet.",rating:"4.6"},
      {name:"Trent–Severn Waterway",tag:"Waterway",desc:"Historic lock system — boating, fishing and paddling.",rating:"4.7"}
    ],
    attractions:[
      {name:"Hartman Lookout / Black River",tag:"Scenic",desc:"Canoeing and rapids on the Black River.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Riverside cottages",tag:"Cottage",desc:"Cottage and cabin rentals where the rivers meet.",rating:"4.5"},
      {name:"Washago motels",tag:"Motel",desc:"Simple roadside motels for an overnight stop.",rating:"4.1"}
    ],
    events:[
      {d:"01",m:"Jul",name:"Washago Canada Day",where:"Centennial Park",desc:"Riverside celebration and fireworks."},
      {d:"19",m:"Jul",name:"Riverfest",where:"Washago waterfront",desc:"Community festival and craft vendors."}
    ]
  },

  /* ---- 5. GRAVENHURST ---- */
  {
    id:"gravenhurst", lat:44.917, lng:-79.37, hook:"Home of North America's oldest working steamship.", name:"Gravenhurst", region:"Muskoka", time:"2:25",
    blurb:"The 'Gateway to Muskoka' — a lakeside town famous for its steamships, wharf and the birthplace of Norman Bethune.",
    facts:["Modern glass shelter stop","Home of the Muskoka Wharf","Steamship cruises on Lake Muskoka"],
    restaurants:[
      {name:"Boston Pizza on the Wharf",tag:"Casual",desc:"Lakeside dining at the Muskoka Wharf.",rating:"4.2"},
      {name:"Sawdust City Brewing",tag:"Brewery",desc:"Acclaimed craft brewery and taproom.",rating:"4.6"},
      {name:"Oar & Paddle",tag:"Bistro",desc:"Seasonal Muskoka-sourced plates downtown.",rating:"4.5"}
    ],
    parks:[
      {name:"Gull Lake Rotary Park",tag:"Beach",desc:"Sandy beach, bandshell and the famous summer concert series.",rating:"4.7"},
      {name:"Muskoka Wharf",tag:"Waterfront",desc:"Boardwalk, farmers' market and steamship docks.",rating:"4.6"}
    ],
    attractions:[
      {name:"RMS Segwun Steamship",tag:"Heritage",desc:"North America's oldest operating steamship — scenic cruises.",rating:"4.8"},
      {name:"Bethune Memorial House",tag:"Historic Site",desc:"National historic site, birthplace of Dr. Norman Bethune.",rating:"4.5"},
      {name:"Gravenhurst Opera House",tag:"Arts",desc:"Restored 1901 theatre with live performances.",rating:"4.6"}
    ],
    accommodations:[
      {name:"Residence Inn Gravenhurst",tag:"Hotel",desc:"Modern hotel steps from the Muskoka Wharf.",rating:"4.5"},
      {name:"Muskoka resorts",tag:"Resort",desc:"Classic lakeside resorts on Lake Muskoka.",rating:"4.6"},
      {name:"Lakeside B&Bs",tag:"B&B",desc:"Charming bed-and-breakfasts near downtown.",rating:"4.5"}
    ],
    events:[
      {d:"13",m:"Jun",name:"Music on the Barge",where:"Gull Lake Park",desc:"Sunday evening concerts on a floating bandshell."},
      {d:"27",m:"Jun",name:"Wharf Farmers' Market",where:"Muskoka Wharf",desc:"Weekly market with local growers and makers."},
      {d:"11",m:"Jul",name:"Dockside Festival of the Arts",where:"Muskoka Wharf",desc:"Juried art show on the waterfront."}
    ]
  },

  /* ---- 6. BRACEBRIDGE ---- */
  {
    id:"bracebridge", lat:45.04, lng:-79.31, hook:"A town built around an illuminated waterfall.", name:"Bracebridge", region:"Muskoka", time:"2:50",
    blurb:"The 'Heart of Muskoka', a waterfall-laced town on the Muskoka River with a charming historic main street.",
    facts:["Modern glass shelter stop","Built around Bracebridge Falls","Santa's Village is nearby"],
    restaurants:[
      {name:"One Fifty Five",tag:"Fine Dining",desc:"Elevated regional cuisine on Manitoba Street.",rating:"4.7"},
      {name:"Old Station Restaurant",tag:"Casual",desc:"Long-running local favourite in a heritage building.",rating:"4.4"},
      {name:"Muskoka Bean",tag:"Cafe",desc:"Roastery and cafe popular with locals.",rating:"4.6"}
    ],
    parks:[
      {name:"Bracebridge Bay Park",tag:"Waterfall",desc:"Park beside the falls — swimming, lookout and trails.",rating:"4.7"},
      {name:"Kelvin Grove Park",tag:"Riverside",desc:"Beach and picnic area on the Muskoka River.",rating:"4.5"}
    ],
    attractions:[
      {name:"Santa's Village",tag:"Family",desc:"Christmas-themed amusement park open all summer.",rating:"4.5"},
      {name:"Bracebridge Falls",tag:"Natural",desc:"Illuminated falls in the heart of downtown.",rating:"4.7"},
      {name:"Muskoka Discovery Centre",tag:"Museum",desc:"Regional heritage and boating history.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Inn at the Falls",tag:"Boutique Inn",desc:"Historic inn overlooking the Bracebridge waterfall.",rating:"4.5"},
      {name:"Muskoka cottage rentals",tag:"Cottage",desc:"Lake cottages and cabins around Bracebridge.",rating:"4.6"}
    ],
    events:[
      {d:"06",m:"Jun",name:"Bracebridge Farmers' Market",where:"Memorial Park",desc:"Saturday market through the season."},
      {d:"05",m:"Jul",name:"Midnight Madness",where:"Downtown Bracebridge",desc:"Sidewalk sales and street entertainment."},
      {d:"01",m:"Jul",name:"Canada Day Celebrations",where:"Bracebridge Bay",desc:"Waterside festivities and fireworks."}
    ]
  },

  /* ---- 7. HUNTSVILLE ---- */
  {
    id:"huntsville", lat:45.327, lng:-79.216, hook:"100+ Group of Seven murals — and the gateway to Algonquin.", name:"Huntsville", region:"Muskoka", time:"3:25",
    blurb:"The largest town in Muskoka — gateway to Algonquin Park, home of the Group of Seven murals and a lively arts scene.",
    facts:["Modern glass shelter stop","Gateway to Algonquin Provincial Park","Group of Seven outdoor mural trail"],
    restaurants:[
      {name:"3 Guys and a Stove",tag:"Bistro",desc:"Long-celebrated Huntsville restaurant with creative menus.",rating:"4.6"},
      {name:"That Little Place by the Lights",tag:"Italian",desc:"Cozy downtown trattoria.",rating:"4.7"},
      {name:"Farmers Daughter",tag:"Market Cafe",desc:"Local market, cafe and prepared foods.",rating:"4.6"}
    ],
    parks:[
      {name:"Arrowhead Provincial Park",tag:"Provincial Park",desc:"Famous winter ice trail; summer swimming and hiking.",rating:"4.8"},
      {name:"Hunters Bay Trail",tag:"Trail",desc:"Scenic waterfront boardwalk loop through town.",rating:"4.7"},
      {name:"Lions Lookout",tag:"Scenic",desc:"Panoramic view over Huntsville and the lakes.",rating:"4.6"}
    ],
    attractions:[
      {name:"Group of Seven Outdoor Gallery",tag:"Art",desc:"100+ large murals reproducing iconic Canadian paintings.",rating:"4.7"},
      {name:"Muskoka Heritage Place",tag:"Living Museum",desc:"Pioneer village and a steam train ride.",rating:"4.5"},
      {name:"Algonquin Park (East Gate ~40 min)",tag:"Wilderness",desc:"Canoeing, hiking and the famous fall colours.",rating:"4.9"}
    ],
    accommodations:[
      {name:"Deerhurst Resort",tag:"Resort",desc:"Landmark Muskoka resort on Peninsula Lake.",rating:"4.5"},
      {name:"Hidden Valley Resort",tag:"Resort",desc:"Lakeside resort near Arrowhead Park.",rating:"4.4"},
      {name:"Downtown Huntsville inns",tag:"Inn",desc:"Inns and B&Bs close to the main street and murals.",rating:"4.4"}
    ],
    events:[
      {d:"12",m:"Jun",name:"Huntsville Farmers' Market",where:"Canal Street",desc:"Thursday market with regional growers."},
      {d:"19",m:"Jul",name:"Nuit Blanche North",where:"Downtown Huntsville",desc:"Free overnight contemporary art festival."},
      {d:"02",m:"Aug",name:"Huntsville Festival of the Arts",where:"Algonquin Theatre",desc:"Summer concert and performance series."}
    ]
  },

  /* ---- 8. SOUTH RIVER ---- */
  {
    id:"southriver", lat:45.837, lng:-79.38, hook:"The quiet back door into Algonquin's wild west side.", name:"South River", region:"Almaguin Highlands", time:"4:20",
    blurb:"A quiet village in the Almaguin Highlands and the western doorway to Algonquin Park's less-travelled side.",
    facts:["Modern glass shelter stop","Gateway to Algonquin's west","Surrounded by lakes and forest"],
    restaurants:[
      {name:"South River Cafes",tag:"Comfort",desc:"Small-town diners and a seasonal bakery.",rating:"4.3"},
      {name:"Local Pub & Grill",tag:"Pub",desc:"Friendly stop for hearty plates after a day outdoors.",rating:"4.2"}
    ],
    parks:[
      {name:"Mikisew Provincial Park",tag:"Provincial Park",desc:"Beach and campground on Eagle Lake.",rating:"4.6"},
      {name:"Forgotten Falls",tag:"Waterfall",desc:"A hidden cascade reached by a short forest hike.",rating:"4.5"},
      {name:"Algonquin Park — West",tag:"Wilderness",desc:"Quiet access point for paddling and backcountry routes.",rating:"4.8"}
    ],
    attractions:[
      {name:"Eagle's Nest Lookout",tag:"Hike",desc:"Cliff-top viewpoint over the Eagle Lake valley.",rating:"4.7"},
      {name:"Machar Heritage sites",tag:"History",desc:"Small museums and pioneer history of the township.",rating:"4.2"}
    ],
    accommodations:[
      {name:"Algonquin-area lodges",tag:"Lodge",desc:"Wilderness lodges near the park's west gate.",rating:"4.5"},
      {name:"Eagle Lake cabins",tag:"Cabin",desc:"Rustic cabin rentals on nearby lakes.",rating:"4.4"}
    ],
    events:[
      {d:"05",m:"Jul",name:"South River Summerfest",where:"Village centre",desc:"Community fair with vendors and music."},
      {d:"16",m:"Aug",name:"Eagle Lake Regatta",where:"Mikisew Park",desc:"Boat races and beach activities."}
    ]
  },

  /* ---- 9. TEMAGAMI ---- */
  {
    id:"temagami", lat:47.064, lng:-79.79, hook:"Paddle beneath 400-year-old red and white pines.", name:"Temagami", region:"Lake Temagami", time:"6:00",
    blurb:"A storied canoe-country town set among old-growth pine and a maze of interconnected lakes.",
    facts:["Modern glass shelter stop","Famous for old-growth red & white pine","World-class canoe tripping"],
    restaurants:[
      {name:"Busy Bee Restaurant",tag:"Diner",desc:"Classic roadside diner, a Temagami institution.",rating:"4.4"},
      {name:"Temagami bakeries & cafes",tag:"Cafe",desc:"Coffee and baked goods for the trail.",rating:"4.3"}
    ],
    parks:[
      {name:"Finlayson Point Provincial Park",tag:"Provincial Park",desc:"Lakeside camping and a base for canoe trips.",rating:"4.7"},
      {name:"Lady Evelyn–Smoothwater Park",tag:"Wilderness",desc:"Remote canoe-only wilderness with stunning rivers.",rating:"4.9"},
      {name:"White Bear Forest",tag:"Old Growth",desc:"Trails through ancient red and white pine stands.",rating:"4.8"}
    ],
    attractions:[
      {name:"Temagami Fire Tower",tag:"Lookout",desc:"30m tower on Caribou Mountain with sweeping views.",rating:"4.7"},
      {name:"Finlayson Point lookout",tag:"Scenic",desc:"Sunset views over Lake Temagami's islands.",rating:"4.6"}
    ],
    accommodations:[
      {name:"Temagami canoe lodges",tag:"Lodge",desc:"Classic outfitter lodges for canoe trippers.",rating:"4.6"},
      {name:"Lakeside cabins",tag:"Cabin",desc:"Cabins and camps along Lake Temagami.",rating:"4.5"},
      {name:"Finlayson Point camping",tag:"Camping",desc:"Provincial park campground on the lake.",rating:"4.6"}
    ],
    events:[
      {d:"26",m:"Jul",name:"Temagami Canoe Festival",where:"Town waterfront",desc:"Heritage paddling event and demonstrations."},
      {d:"02",m:"Aug",name:"Temagami Art Walk",where:"Lakeshore Drive",desc:"Local artists and crafters showcase."}
    ]
  },

  /* ---- 10. NORTH BAY ---- */
  {
    id:"northbay", lat:46.309, lng:-79.461, hook:"A carousel, a beach and a heritage train on Lake Nipissing.", name:"North Bay", region:"Lake Nipissing", time:"6:45",
    blurb:"A regional city on Lake Nipissing, the largest centre on the route and a major hub between Toronto and the far north.",
    facts:["Full Ontario Northland station","On Lake Nipissing's shore","Historic Dionne Quintuplets connection"],
    restaurants:[
      {name:"Average Joe's",tag:"Casual",desc:"Popular local restaurant and bar.",rating:"4.5"},
      {name:"Cecil's Eatery & Beer Society",tag:"Gastropub",desc:"Craft beer and elevated pub fare downtown.",rating:"4.6"},
      {name:"The Raven & Republic",tag:"Modern",desc:"Stylish kitchen and cocktail spot on Main Street.",rating:"4.6"}
    ],
    parks:[
      {name:"Lake Nipissing Waterfront",tag:"Waterfront",desc:"Beach, carousel, marina and the heritage train display.",rating:"4.7"},
      {name:"Laurier Woods Conservation Area",tag:"Conservation",desc:"Wetland boardwalks and birding trails.",rating:"4.6"},
      {name:"Duchesnay Falls",tag:"Waterfall",desc:"Cascading falls with a network of forest trails.",rating:"4.7"}
    ],
    attractions:[
      {name:"Dionne Quints Museum",tag:"Museum",desc:"The restored home of the famous quintuplets.",rating:"4.4"},
      {name:"Heritage Carousel & Train",tag:"Family",desc:"Waterfront miniature train and carousel rides.",rating:"4.6"},
      {name:"Capitol Centre",tag:"Arts",desc:"Restored theatre hosting concerts and shows.",rating:"4.6"}
    ],
    accommodations:[
      {name:"Best Western North Bay",tag:"Hotel",desc:"Reliable mid-range hotel near the waterfront.",rating:"4.3"},
      {name:"Lakeshore motels",tag:"Motel",desc:"Motels along the Lake Nipissing shore.",rating:"4.2"},
      {name:"North Bay B&Bs",tag:"B&B",desc:"Bed-and-breakfasts in the historic district.",rating:"4.5"}
    ],
    events:[
      {d:"14",m:"Jun",name:"North Bay Farmers' Market",where:"Downtown Waterfront",desc:"Saturday market by the lake."},
      {d:"12",m:"Jul",name:"Summer in the Park",where:"Lee Park",desc:"Major outdoor music festival on the waterfront."},
      {d:"09",m:"Aug",name:"Heritage Festival & Air Show",where:"North Bay Waterfront",desc:"Family festival with an aerial display."}
    ]
  },

  /* ---- 11. TEMISKAMING SHORES (NEW LISKEARD) ---- */
  {
    id:"temiskaming", lat:47.509, lng:-79.677, hook:"Northern dairy country beneath a 100-metre cliff.", name:"Temiskaming Shores", region:"New Liskeard", time:"8:00",
    blurb:"A lakeside community on Lake Temiskaming, surrounded by the surprising farm belt of the 'Little Clay Belt'.",
    facts:["Modern glass shelter stop (New Liskeard)","On Lake Temiskaming","Northern dairy & farm country"],
    restaurants:[
      {name:"Zante's Pizzeria",tag:"Italian",desc:"Long-standing local pizza favourite.",rating:"4.4"},
      {name:"Riverside dining",tag:"Casual",desc:"Cafes and grills along the Wabi River and waterfront.",rating:"4.3"}
    ],
    parks:[
      {name:"New Liskeard Waterfront",tag:"Lakeside",desc:"Marina, beach and the famous Ms. Claybelt cow statue.",rating:"4.6"},
      {name:"Devil's Rock",tag:"Scenic Cliff",desc:"Dramatic 100m cliff over Lake Temiskaming.",rating:"4.8"},
      {name:"Bucke Park",tag:"Park",desc:"Beach, campground and trails near Haileybury.",rating:"4.5"}
    ],
    attractions:[
      {name:"Temiskaming Art Gallery",tag:"Art",desc:"Regional gallery showcasing northern artists.",rating:"4.4"},
      {name:"Haileybury Heritage Museum",tag:"Museum",desc:"Mining history and the famous 1922 fire story.",rating:"4.5"},
      {name:"Chamber Train",tag:"Heritage",desc:"Historic streetcar exhibit in Haileybury.",rating:"4.3"}
    ],
    accommodations:[
      {name:"Waterfront hotels",tag:"Hotel",desc:"Hotels near the New Liskeard marina.",rating:"4.3"},
      {name:"Country B&Bs",tag:"B&B",desc:"Farm-country bed-and-breakfasts near the lake.",rating:"4.4"}
    ],
    events:[
      {d:"21",m:"Jun",name:"Temiskaming Waterfront Market",where:"New Liskeard Marina",desc:"Weekend market and local food."},
      {d:"02",m:"Aug",name:"Fall Fair Preview Days",where:"Temiskaming Fairgrounds",desc:"Agricultural showcase and rides."}
    ]
  },

  /* ---- 12. ENGLEHART ---- */
  {
    id:"englehart", lat:47.821, lng:-79.868, hook:"A town the railway itself built — gorge falls nearby.", name:"Englehart", region:"Timiskaming District", time:"8:35",
    blurb:"A historic railway town built by Ontario Northland itself — small, proud, and rich in rail heritage.",
    facts:["Full Ontario Northland station","Founded as a railway divisional point","Near Kap-Kig-Iwan Provincial Park"],
    restaurants:[
      {name:"Englehart diners",tag:"Comfort",desc:"Friendly small-town restaurants and a bakery.",rating:"4.3"},
      {name:"Local pub",tag:"Pub",desc:"Casual spot for a meal in the town centre.",rating:"4.2"}
    ],
    parks:[
      {name:"Kap-Kig-Iwan Provincial Park",tag:"Provincial Park",desc:"Gorge trails along the Englehart River with waterfalls.",rating:"4.7"},
      {name:"Englehart riverside trails",tag:"Trail",desc:"Walking paths following the river through town.",rating:"4.4"}
    ],
    attractions:[
      {name:"Englehart & Area Historical Museum",tag:"Museum",desc:"Railway and pioneer history of the region.",rating:"4.5"},
      {name:"High Falls",tag:"Waterfall",desc:"Scenic falls within Kap-Kig-Iwan park.",rating:"4.6"}
    ],
    accommodations:[
      {name:"Englehart motels",tag:"Motel",desc:"Simple, friendly motels for an overnight stop.",rating:"4.2"},
      {name:"Kap-Kig-Iwan camping",tag:"Camping",desc:"Provincial park campground by the gorge.",rating:"4.5"}
    ],
    events:[
      {d:"28",m:"Jun",name:"Englehart Railway Days",where:"Town centre",desc:"Heritage celebration of the town's rail roots."},
      {d:"16",m:"Aug",name:"Kap-Kig-Iwan Nature Day",where:"Provincial Park",desc:"Guided hikes and family activities."}
    ]
  },

  /* ---- 13. KIRKLAND LAKE (SWASTIKA) ---- */
  {
    id:"kirklandlake", lat:48.147, lng:-80.037, hook:"The town that gold built — and a hockey legend factory.", name:"Kirkland Lake", region:"Swastika stop", time:"9:10",
    blurb:"A legendary gold-mining town — 'the town that gold built' — reached via the Swastika stop just to the west.",
    facts:["Modern glass shelter stop (Swastika)","Historic gold-mining boom town","Birthplace of many NHL hockey stars"],
    restaurants:[
      {name:"Kirkland Lake eateries",tag:"Mixed",desc:"Family restaurants, pizzerias and cafes downtown.",rating:"4.3"},
      {name:"Federal Tavern",tag:"Pub",desc:"Long-running local watering hole.",rating:"4.2"}
    ],
    parks:[
      {name:"Culver Park",tag:"Park",desc:"Central green space with the town's iconic headframe nearby.",rating:"4.4"},
      {name:"Esker Lakes Provincial Park",tag:"Provincial Park",desc:"Glacial esker landscape with 29 lakes and trails.",rating:"4.7"}
    ],
    attractions:[
      {name:"Museum of Northern History",tag:"Museum",desc:"Set in the historic Sir Harry Oakes Chateau.",rating:"4.6"},
      {name:"Toburn Gold Mine Site",tag:"Heritage",desc:"Preserved headframe and mining interpretive site.",rating:"4.5"},
      {name:"Hockey Heritage North",tag:"Sports",desc:"Celebrates the region's remarkable hockey legacy.",rating:"4.4"}
    ],
    accommodations:[
      {name:"Kirkland Lake hotels",tag:"Hotel",desc:"Mid-range hotels in the town centre.",rating:"4.2"},
      {name:"Esker Lakes camping",tag:"Camping",desc:"Provincial park campground among the eskers.",rating:"4.6"}
    ],
    events:[
      {d:"05",m:"Jul",name:"Kirkland Lake Homecoming",where:"Downtown",desc:"Community festival and street events."},
      {d:"23",m:"Aug",name:"Esker Lakes Outdoor Day",where:"Esker Lakes Park",desc:"Paddling and guided nature walks."}
    ]
  },

  /* ---- 14. MATHESON ---- */
  {
    id:"matheson", lat:48.534, lng:-80.464, hook:"22 spring-fed kettle lakes and the coach north to Cochrane.", name:"Matheson", region:"Black River-Matheson", time:"9:55",
    blurb:"A crossroads community where an express coach connects onward to Cochrane and the Polar Bear Express.",
    facts:["Modern glass shelter stop","Express coach link to Cochrane (4:30 a.m.)","Surrounded by lakes and boreal forest"],
    restaurants:[
      {name:"Matheson roadside stops",tag:"Comfort",desc:"Diners and a coffee stop along Highway 11.",rating:"4.2"},
      {name:"Local family restaurant",tag:"Casual",desc:"Hearty meals for travellers passing through.",rating:"4.1"}
    ],
    parks:[
      {name:"Kettle Lakes Provincial Park",tag:"Provincial Park",desc:"22 spring-fed kettle lakes, swimming and trails.",rating:"4.7"},
      {name:"Black River access",tag:"River",desc:"Fishing and paddling on the Black River.",rating:"4.4"}
    ],
    attractions:[
      {name:"Matheson Fire memorial",tag:"History",desc:"Commemorates the great 1916 fire that shaped the area.",rating:"4.3"},
      {name:"Boreal forest lookouts",tag:"Scenic",desc:"Quiet northern viewpoints near the highway.",rating:"4.3"}
    ],
    accommodations:[
      {name:"Highway 11 motels",tag:"Motel",desc:"Roadside motels convenient for the Cochrane coach.",rating:"4.1"},
      {name:"Kettle Lakes camping",tag:"Camping",desc:"Provincial park campground on the kettle lakes.",rating:"4.6"}
    ],
    events:[
      {d:"12",m:"Jul",name:"Matheson Community Days",where:"Town centre",desc:"Local fair with food and family games."},
      {d:"09",m:"Aug",name:"Kettle Lakes Nature Weekend",where:"Provincial Park",desc:"Guided walks and stargazing."}
    ]
  },

  /* ---- 15. TIMMINS-PORCUPINE ---- */
  {
    id:"timmins", lat:48.4758, lng:-81.3305, hook:"Descend a real gold mine at the northern end of the line.", name:"Timmins-Porcupine", region:"Timmins", time:"10:40",
    blurb:"The northern terminus — a major mining city famous for gold, the Shania Twain Centre legacy, and vast wilderness all around.",
    facts:["Northern terminus (Porcupine Station)","One of the world's great gold-mining cities","1-hour layover for Cochrane connection"],
    restaurants:[
      {name:"Cedar Meadows",tag:"Resort Dining",desc:"Lodge dining with a wildlife park on site.",rating:"4.6"},
      {name:"The Cellar Bistro",tag:"Bistro",desc:"Popular downtown restaurant with a varied menu.",rating:"4.5"},
      {name:"Crema Coffee",tag:"Cafe",desc:"Well-loved local coffee house and bakery.",rating:"4.6"}
    ],
    parks:[
      {name:"Gillies Lake Conservation Area",tag:"Lakeside",desc:"Beach, boardwalk and a popular walking loop in the city.",rating:"4.7"},
      {name:"Hersey Lake Conservation Area",tag:"Conservation",desc:"Forest trails and swimming just outside town.",rating:"4.6"},
      {name:"Kettle Lakes Provincial Park",tag:"Provincial Park",desc:"A short drive south — camping and clear kettle lakes.",rating:"4.7"}
    ],
    attractions:[
      {name:"Timmins Underground Gold Mine Tour",tag:"Experience",desc:"Descend into a real mine at the Timmins Museum's tour.",rating:"4.7"},
      {name:"Cedar Meadows Wildlife Park",tag:"Wildlife",desc:"Wagon tours among elk, bison and deer.",rating:"4.6"},
      {name:"Timmins Museum: National Exhibition Centre",tag:"Museum",desc:"Mining heritage and rotating art exhibits.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Cedar Meadows Resort & Spa",tag:"Resort",desc:"Lodge resort with a spa and wildlife park.",rating:"4.6"},
      {name:"Senator Hotel & Conference",tag:"Hotel",desc:"Established downtown Timmins hotel.",rating:"4.3"},
      {name:"Timmins motels & inns",tag:"Motel",desc:"Range of motels across the city.",rating:"4.2"}
    ],
    events:[
      {d:"21",m:"Jun",name:"Timmins Summer Concert Series",where:"Hollinger Park",desc:"Outdoor concerts through the summer."},
      {d:"04",m:"Jul",name:"Stars and Thunder (Canada Day)",where:"Hollinger Park",desc:"Music festival and major fireworks event."},
      {d:"16",m:"Aug",name:"Great Canadian Kayak Challenge",where:"Mountjoy River",desc:"Paddling races and riverside festival."}
    ]
  },

  /* ---- 16. COCHRANE (RAIL CONNECTION) ---- */
  {
    id:"cochrane", lat:49.066, lng:-81.015, hook:"Meet polar bears, then ride the rails to James Bay.", name:"Cochrane", region:"Polar Bear Express link", time:"+ connection",
    blurb:"Reached by rail or coach connection — home of the Polar Bear Express to Moosonee and the Polar Bear Habitat.",
    facts:["Connection point, not on the main line","Gateway to the Polar Bear Express","Home of the Cochrane Polar Bear Habitat"],
    restaurants:[
      {name:"Cochrane main street eateries",tag:"Comfort",desc:"Diners, cafes and pubs in the town centre.",rating:"4.3"},
      {name:"The Lid Restaurant",tag:"Casual",desc:"Popular spot connected to the Tim Horton Event Centre.",rating:"4.4"}
    ],
    parks:[
      {name:"Greenwater Provincial Park",tag:"Provincial Park",desc:"26 clear lakes, beaches and boreal trails.",rating:"4.7"},
      {name:"Commando Lake",tag:"Lakeside",desc:"Town beach and walking trails.",rating:"4.5"}
    ],
    attractions:[
      {name:"Cochrane Polar Bear Habitat",tag:"Wildlife",desc:"The world's largest polar bear habitat facility.",rating:"4.7"},
      {name:"Polar Bear Express",tag:"Rail Journey",desc:"Iconic train onward to Moosonee and James Bay.",rating:"4.8"},
      {name:"Tim Horton Event Centre",tag:"Heritage",desc:"Museum honouring the hometown hockey legend.",rating:"4.5"}
    ],
    accommodations:[
      {name:"Station Inn",tag:"Inn",desc:"Inn right at the Cochrane railway station.",rating:"4.3"},
      {name:"Greenwater camping",tag:"Camping",desc:"Provincial park campground on clear lakes.",rating:"4.6"},
      {name:"Cochrane motels",tag:"Motel",desc:"Motels in town near the Polar Bear Habitat.",rating:"4.2"}
    ],
    events:[
      {d:"19",m:"Jul",name:"Cochrane Summerfest",where:"Downtown Cochrane",desc:"Community festival with music and vendors."},
      {d:"06",m:"Aug",name:"Polar Bear Habitat Family Day",where:"Polar Bear Habitat",desc:"Special programming and keeper talks."}
    ]
  }
];
