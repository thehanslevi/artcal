import type { Category, Mode } from "../../src/types";

export interface Venue {
  name: string;
  url: string;
  category: Category;
  defaultMode: Mode;
  whereTemplate: string;
  notes?: string;
}

// Only venues that returned usable HTML during past sweeps.
// Ones that 403/widget-render are excluded.
export const VENUES: Venue[] = [
  {
    name: "Interference Archive",
    url: "https://interferencearchive.org/events/",
    category: "community",
    defaultMode: "make",
    whereTemplate: "314 7th St, Park Slope",
  },
  {
    name: "The Tank",
    url: "https://thetanknyc.org/tankcalendar",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "The Tank, 312 W 36th St, Midtown West",
  },
  {
    name: "Brooklyn Art Haus",
    url: "https://www.bkarthaus.com/shows-events",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "Brooklyn Art Haus, 25 Marcy Ave, Williamsburg",
  },
  {
    name: "New York Live Arts",
    url: "https://newyorklivearts.org/calendar/",
    category: "dance",
    defaultMode: "witness",
    whereTemplate: "New York Live Arts, 219 W 19th St, Chelsea",
  },
  {
    name: "Abrons Arts Center",
    url: "https://www.abronsartscenter.org/performing-arts",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "Abrons Arts Center, 466 Grand St, LES",
  },
  {
    name: "Baryshnikov Arts Center",
    url: "https://baryshnikovarts.org/",
    category: "dance",
    defaultMode: "witness",
    whereTemplate: "Baryshnikov Arts Center, 450 W 37th St",
  },
  {
    name: "Symphony Space",
    url: "https://www.symphonyspace.org/",
    category: "literature",
    defaultMode: "witness",
    whereTemplate: "Symphony Space, Upper West Side",
  },
  {
    name: "Film Forum",
    url: "https://www.filmforum.org/now-playing",
    category: "film",
    defaultMode: "witness",
    whereTemplate: "Film Forum, 209 W Houston St",
  },
  {
    name: "Wendy's Subway",
    url: "https://www.wendyssubway.com/programs",
    category: "literature",
    defaultMode: "make",
    whereTemplate: "Wendy's Subway, Bushwick/Ridgewood border",
  },
  {
    name: "UnionDocs",
    url: "https://uniondocs.org/events/category/workshops/list/",
    category: "film",
    defaultMode: "make",
    whereTemplate: "UnionDocs, Ridgewood",
  },
  {
    name: "Mono No Aware",
    url: "http://mononoawarefilm.com/community-workshops",
    category: "film",
    defaultMode: "make",
    whereTemplate: "Downtown Brooklyn",
  },
  {
    name: "Bushwick Community Darkroom",
    url: "https://www.bushwickcommunitydarkroom.com/events",
    category: "making",
    defaultMode: "make",
    whereTemplate: "334 Himrod St, Bushwick",
  },
  {
    name: "ISSUE Project Room",
    url: "https://issueprojectroom.org/calendar",
    category: "sound",
    defaultMode: "witness",
    whereTemplate: "ISSUE Project Room, 22 Boerum Pl, Downtown Brooklyn",
  },
  {
    name: "Roulette",
    url: "https://roulette.org/calendar",
    category: "sound",
    defaultMode: "witness",
    whereTemplate: "Roulette, 509 Atlantic Ave, Brooklyn",
  },
  {
    name: "New York Theatre Workshop",
    url: "https://www.nytw.org/2026-27-season/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "New York Theatre Workshop, 79 E 4th St",
  },
  {
    name: "CATCH!",
    url: "https://catchseries.org/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "Rotating Brooklyn venues — check catchseries.org",
  },
  {
    name: "Wavefield",
    url: "https://wavefield.media/events",
    category: "tech",
    defaultMode: "witness",
    whereTemplate: "Wavefield, Brooklyn",
  },
  {
    name: "DADA",
    url: "https://dadabar.nyc/program",
    category: "sound",
    defaultMode: "witness",
    whereTemplate: "DADA, 6047 Myrtle Ave, Ridgewood",
  },
  {
    name: "SUPR OMEN",
    url: "https://supromen.com/events/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "SUPR OMEN, 1 Knickerbocker Ave, Brooklyn",
  },
  {
    name: "The Arts Center at Governors Island",
    url: "https://lmcc.net/lmcc-arts-center-at-governors-island/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "The Arts Center at Governors Island (LMCC), Building 110",
  },
  {
    name: "Francis Kite Club",
    url: "https://www.franciskiteclub.com/",
    category: "sound",
    defaultMode: "witness",
    whereTemplate: "Francis Kite Club, 40 Loisaida Ave (Ave C), LES",
  },
  {
    name: "Telepathy",
    url: "https://pools.events/o/telepathy/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "Telepathy · Brooklyn",
  },
  {
    name: "Performance Space New York",
    url: "https://performancespacenewyork.org/",
    category: "theatre",
    defaultMode: "witness",
    whereTemplate: "Performance Space New York, 150 First Ave, East Village",
  },
  {
    name: "Chez Bushwick",
    url: "https://www.chezbushwick.net/",
    category: "dance",
    defaultMode: "make",
    whereTemplate: "Chez Bushwick, Brooklyn",
  },
  {
    name: "Footlight Presents (Windjammer)",
    url: "https://www.footlightunderground.com/",
    category: "sound",
    defaultMode: "witness",
    whereTemplate: "The Windjammer, 552 Grandview Ave, Ridgewood",
  },
];
