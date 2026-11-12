// Snippets are the visible text of real pages read on Nov 12, 2026, cut down
// to the part that matters.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalEvent } from "../../src/types.ts";
import { cleanUrl, directLinks, findPrice, isIndexUrl, listingUrls, planFill, sortFills } from "./event-price.ts";

const ownPage = { year: 2026, daysAway: 5, ownPage: true };
const listingPage = { year: 2026, daysAway: 5, ownPage: false };
const cost = (event: string, date: string, text: string, opts = ownPage) => findPrice({ event, date }, text, opts)?.cost ?? null;

test("a labelled ticket price; two of them make a range", () => {
  // e-flux.com/events/6783403
  const eflux =
    "Stan Lathan, Statues Hardly Ever Smile (still), 1971.\nAnd the Dogs Were Silent: A Convening by Sharifa Rhodes-Pitts\n\nAdmission\nGeneral $12\nStudent $10\n\nGet tickets\nDate\nNovember 12, 2026, 6pm\nAdd to Calendar";
  const read = findPrice({ event: "And the Dogs Were Silent: A Convening by Sharifa Rhodes-Pitts", date: "Nov 12" }, eflux, ownPage);
  assert.deepEqual(read, { cost: "$10–12", quote: "Admission General $12 Student $10" });
  // baryshnikovarts.org/performance/as-if-everything-was-perfect
  const bac = "“As if everything was perfect”\nNovember 12–13 at 7 PM\nOrchestra: $40\nBalcony: $30\nAccess Tickets: $20\nPurchase Tickets";
  assert.equal(cost("“As if everything was perfect” — Gianna Burright", "Nov 12", bac), "$20–40");
});

test("a class fee, and the price of this date where each date has its own", () => {
  // worksinprogressnyc.org: a shop page for the class
  const wip =
    "Introduction to Silkscreen\nImage 1 of 7\nImage 7 of 7\nIntroduction to Silkscreen\n$150.00\n\nThis class is a thorough and hands-on introduction to the many facets of silkscreen printing. \n\nWe supply basic tees and totes, but students are also encouraged to bring in their own items if they’d like. \n\nDate:\nSeptember 26\nOctober 17\nNovember 14";
  assert.equal(cost("Introduction to Silk Screen Printing Class", "Nov 14", wip), "$150");
  // brooklynshoespace.com/classes/2-hour-introduction-to-shoe-making
  const shoes =
    "2-hour Introduction to Shoe Making\n\nThis 2-hour session covers how shoes are built, what lasts are and how they shape fit, and how to measure your own feet. Tuition is $100.\n\nDates & booking\n\nSeats are limited and go in the order they’re booked.\n\nNovember 12, 2026\n\n6:00 PM – 8:00 PM\n\nFull · $95\n\nJoin the waitlist\n\nDecember 7, 2026\n\n6:00 PM – 8:00 PM\n\n2 spots remaining · $95\n\nBook\n\nJanuary 11, 2027\n\n6:00 PM – 8:00 PM\n\n8 spots remaining · $100\n\nBook";
  assert.equal(cost("Introduction to Shoe Making", "Nov 12", shoes), "$95");
  assert.equal(cost("Introduction to Shoe Making", "Jan 11", shoes), "$100");
});

test("free with RSVP, or free in so many words", () => {
  // greenwichhouse.org/event/big-jazz-in-the-village-at-greenwich-house-music-school
  const jazz =
    "Big Jazz in the Village at Greenwich House Music School\nNovember 18 @ 7:30 pm - 9:30 pm\n\nFREE with RSVP!\n\nGreenwich House Music School’s premiere jazz clarinet ensemble";
  assert.equal(cost("Big Jazz in the Village at Greenwich House Music School", "Nov 18", jazz), "FREE");
  // greenwichhouse.org/event/artist-talk-alexandria-smith
  const talk = "Artist Talk: Alexandria Smith\nNovember 18 @ 4:00 pm - 5:00 pm\nThe talk is free and open to the public. RSVP required.";
  assert.equal(cost("Artist Talk: Alexandria Smith", "Nov 18", talk), "FREE");
});

test("a suggested donation reads as one", () => {
  // delightfactorynyc.com/events/drone-lab-nov2026
  const drone =
    "Drone Lab + Open Projector\nFriday, November 20, 2026\n8:00 PM  11:00 PM\nDelight Factory\n8:00 - 8:30 PM: Introduction of instruments (arrive early if you want assistance with equipment beyond plugging into 1/4” mixer, HDMI)\n8:30 - 10:45 PM: Sound and visual improvisations\n10:45 - 11:00 PM: Framing and closing\n\n\nSuggested donations\n\nDrone Lab: $20\n\nFunds directly support artists and venue. Choose your price point, it’s entirely up to you.";
  assert.equal(cost("Drone Lab + Open Projector", "Nov 20", drone), "$20 suggested");
  // delightfactorynyc.com/events/ego-free-jam-december-2026: "Free" in the title isn't the price.
  const jam = "Ego Free Jam Acoustic\nSaturday, December 5, 2026\n7:30 PM  11:30 PM\nDelight Factory (map)\nGet Tickets\nBy donation ($20-25 recommended)\nThe Ego Free Jam is a monthly night of improvisational music";
  assert.equal(cost("Ego Free Jam Acoustic", "Dec 5", jam), "$20–25 suggested");
  // creativemusic.org/workshops-2026: pay what you can, no figure given.
  const cmf =
    "Curated by Samantha Kochis\n\nNovember 16: Workshops with Shara Lunon & Miriam Elhaji\nIbeam, 168 7th St, Brooklyn, NY\n\nOpen to musicians of all backgrounds & ages. Sliding scale.\n\nMore Information & Registration\nPast Workshops\n\nOctober 12: Workshops with Alex Zhang Hungtai and Ryan Easter\nIbeam, 168 7th St, Brooklyn, NY";
  assert.equal(cost("Workshops with Shara Lunon & Miriam Elhaji", "Nov 16", cmf, listingPage), "Sliding scale");
});

const roulette =
  "CIARÁN FINLAYSON\nSUNDAY, NOVEMBER 15, 2026. 8:00 PM\nTICKETS $42.23\nPURCHASE TICKETS\nTerre Thaemlitz presents a debut live performance on piano, followed by a conversation with Ciarán Finlayson, as part of DURATIONS Festival.\nQASIM NAQVI: SLOW TELEVISION\nWEDNESDAY, NOVEMBER 18, 2026. 8:00 PM\nTICKETS $25\nPURCHASE TICKETS\nFor his Roulette Commission, Naqvi performs two new works for modular synthesizer and chamber ensemble.\nBREAKS: A SOLO PERFORMANCE BY JESSICA COOK (NIGHT 1)\nTHURSDAY, NOVEMBER 19, 2026. 8:00 PM\nTICKETS $25\nPURCHASE TICKETS\nChoreographer explores nonsense-making through fragmentation, the compression of sound, and movement scores for her Roulette Commission.\nHENRY THREADGILL’S ZOOID\nSUNDAY, NOVEMBER 22, 2026. 8:00 PM\nTICKETS $55\nPURCHASE TICKETS";

test("on a shared calendar, the price in this event's own stretch", () => {
  // roulette.org/calendar
  assert.equal(cost("Qasim Naqvi: Slow Television", "Nov 18", roulette, listingPage), "$25");
  assert.equal(cost("Henry Threadgill’s Zooid", "Nov 22", roulette, listingPage), "$55");
  // A calendar that doesn't show the event on that date says nothing about its price.
  assert.equal(cost("Qasim Naqvi: Slow Television", "Nov 19", roulette, listingPage), null);
});

test("another event's price or free night on a shared calendar isn't this one's", () => {
  // wonderville.nyc/events: the next listing is a free night with no cover.
  const wonderville =
    "NOV\n13\nLACKEY / Rearranged Face / Lo-Fives\nFriday, November 13, 2026\n8:30 PM  11:00 PM\nWonderville (map)\n\nLackey @Lackeyusa , Rearranged Face @Rearranged.face , Lo-Fives @lo_fives\n\nRSVP\nVIEW EVENT →\nNOV\n13\nTO NOV 14\nFREE PLAY: Jake Korolev + stjarnafaen & Friends\nFri, Nov 13, 202611:00 PM  Sat, Nov 14, 20263:00 AM\nWonderville (map)\n\nJake Korolev + stjarnafaen hit the decks while you hit the buttons\n\nbreakcore, dnb, jungle, juke, y2k + more\n\nno cover no quarters all gas no brakes\n\nRSVP\nVIEW EVENT →";
  assert.equal(cost("LACKEY / Rearranged Face / Lo-Fives", "Nov 13", wonderville, listingPage), null);
  assert.equal(cost("FREE PLAY: Jake Korolev + stjarnafaen & Friends", "Nov 13", wonderville, listingPage), "FREE");
});

test("membership and patron prices on the same page don't count", () => {
  // brooklynshoespace.com/classes/next-pair-pass, which opens the memberships page
  const studio =
    "Workbenches\n24/7 studio access\n$250\n/ month\n\n3-month commitment, then month to month.\n\nOr $400 / month for the first 3 months with no commitment. It switches to $250 / month automatically after that.\n\nAsk about joining\nNext Pair Days\n\nNext Pair Days give past students dedicated studio time to work on their next project, with an experienced shoemaker nearby when they need guidance.\n\nDecember 5, 2026\n\n11:00 AM – 5:00 PM\n\n5 spots remaining · $100\n\nBook\n\nDecember 13, 2026\n\n11:00 AM – 5:00 PM\n\n5 spots remaining · $100\n\nBook";
  assert.equal(cost("Next Pair Pass", "Dec 5", studio), "$100");
  assert.equal(cost("Next Pair Pass", "Dec 5", studio.slice(0, studio.indexOf("Ask about joining"))), null);
  // bam.org/theater/2026/la-distance
  const header = "BUY TICKETS\nTHEATER\nLa Distance\nNOV 18—29, 2026\nNEXT WAVE\nRUNNING TIME\n1hr 25min, no intermission\nVENUE\nBAM Strong\nHarvey Theater\n";
  const tickets =
    "TICKET INFORMATION\nTickets start at $25\nPlease note: All single ticket online and phone orders are subject to a $3 facility fee and an $8 handling fee per ticket.\n";
  const support =
    "SUPPORT BAM\nMEMBERSHIP\nBAM Membership ($100+)\n\nBAM Membership ($100+)\nUnlock exclusive savings on performances and films with a BAM Membership. From ticket discounts to priority access and special events, it’s your license to experience more for less.\nJOIN\nSUPPORT\nBAM Patrons ($2,500+)\n\nBAM Patrons ($2,500+)\nPriority access to premium seats, personalized ticket services, exclusive invitations, and more.";
  // "Start at" is the cheapest seat, not the price.
  assert.equal(cost("La Distance (theater) opens", "Nov 18", header + tickets + support), "From $25");
  assert.equal(cost("La Distance (theater) opens", "Nov 18", header + support), null);
});

test("a donation ask, a discount and a free livestream aren't the price", () => {
  // roulette.org/event/qasim-naqvi-slow-television: free for members, free to stream.
  const qasim =
    "Qasim Naqvi: Slow Television\nWednesday, November 18, 2026\n8:00 pm\n$25 advance$30 doors$20 STUDENT/SENIOR (w/ ID, SENIOR 65+ - advance and at door)doors 7pm\nBUY TICKETS\n\nErika Dohi piano\n\n*FREE FOR ALL ROULETTE MEMBERS *\n\n\nA livestream will be available free of charge";
  assert.equal(cost("Qasim Naqvi: Slow Television", "Nov 18", qasim), "$20–30");
  // sleepwalk.nyc/events: the bar's banner.
  const sleepwalk = "Daily Happy Hour: $2 Off All Drinks till 7pm\n\nHome\nFood\nDrinks\nEvents\nAbout\n\nSleepwalk";
  assert.equal(cost("Sleepwalk", "Nov 20", sleepwalk), null);
  // bam.org: giving to the venue, with nothing about tickets.
  const give = "La Distance\nNOV 18—29, 2026\nSUPPORT\nBAM Patrons ($2,500+)\n\nBAM Patrons ($2,500+)\nPriority access to premium seats, personalized ticket services, exclusive invitations, and more.";
  assert.equal(cost("La Distance", "Nov 18", give), null);
});

test("free jazz, free writing and no additional cost aren't free admission", () => {
  // wendyssubway.com/programs/events/writing-night
  const wendys =
    "Bi-Weekly Writing Night\n\nNovember 12, December 10, 2026, 7–8:30pm\n\nRegistration required. Join the Writing Night mailing list here. \n\nAbout writing night\n\nWriting Night is a bi-weekly practice for writers to gather for an hour and a half of free writing. Each session is guided by a facilitator";
  assert.equal(cost("Bi-Weekly Writing Night", "Nov 12", wendys), null);
  // dadabar.nyc/event/6776769
  const dada =
    "Dot Iso & n.a.w.\n\nThu, Nov 12 @ 8:00PM\n\nDADA, 60-47 Myrtle Ave, Ridgewood, NY\n\nImprovising together they combine elements of post rock, free jazz, contemporary classical, and hip hop djing";
  assert.equal(cost("Dot Iso & n.a.w.", "Nov 12", dada), null);
  // mostlygoodstudios.com: firing is included, the course isn't free.
  const clay =
    "HAND BUILDING COURSE FALL SESSION WEEK 6\nSunday, November 15, 2026\n10:00 AM  11:00 AM\n\nAll final work will be fired at no additional cost. All students will have unlimited access to our open studio sessions at no additional cost.\n\nREGISTER";
  assert.equal(cost("Hand Building Course", "Nov 15", clay), null);
  // donyc.com: "Win Free Tickets" is the site's giveaway.
  const donyc = "Surprise Chef\nTOMORROW | 7:30 PM\nNational Sawdust\nAdd to calendar +\nTickets\nOn sale\novationtix.com\nFind tickets\nVancouver\nVictoria\nWin Free Tickets";
  assert.equal(cost("Surprise Chef", "Nov 13", donyc, { ...ownPage, daysAway: 1 }), null);
});

test("a ticket site's 'today' is the event's date", () => {
  // donyc.com/events/2026/11/12/diles-que-no-me-maten-tickets
  const donyc = "LPR Presents: Diles que no me maten\nTODAY | 8 PM\nNational Sawdust\nAdd to calendar +\nTickets: $32.27, 18+\nOn sale\novationtix.com";
  assert.equal(cost("Diles que no me maten", "Nov 12", donyc, { ...ownPage, daysAway: 0 }), "$32.27");
});

test("a starting price is written as one", () => {
  // bam.org/music/2026/einstein-on-the-beach-50
  const einstein = "Einstein on the Beach — 50th Anniversary Concert\nNOV 19—22, 2026\nTICKET INFORMATION\nTickets start at $65\n";
  assert.equal(cost("Einstein on the Beach — 50th Anniversary Concert (Philip Glass)", "Nov 19", einstein), "From $65");
  const from = "Pataphysics 022\nSaturday, November 21, 2026\n8:00 PM  11:00 PM\nTickets from $20\n";
  assert.equal(cost("Pataphysics 022", "Nov 21", from), "From $20");
});

test("an age limit or a closing time after a dash isn't the top of a range", () => {
  // donyc.com/events/2026/11/12/diles-que-no-me-maten-tickets, with the age after a dash
  const age = "LPR Presents: Diles que no me maten\nTODAY | 8 PM\nNational Sawdust\nAdd to calendar +\nTickets: $20 – 21+\nOn sale";
  assert.equal(cost("Diles que no me maten", "Nov 12", age, { ...ownPage, daysAway: 0 }), "$20");
  const late = "Pataphysics 022\nSaturday, November 21, 2026\nAdmission: $5 - 10pm till close";
  assert.equal(cost("Pataphysics 022", "Nov 21", late), "$5");
  // A real range still reads as one.
  assert.equal(cost("Pataphysics 022", "Nov 21", "Pataphysics 022\nSaturday, November 21, 2026\nAdmission: $10 - 15"), "$10–15");
});

test("add-ons, gifts and memberships in other words aren't the price", () => {
  const head = "Pataphysics 022\nSaturday, November 21, 2026\n8:00 PM  11:00 PM\n";
  assert.equal(cost("Pataphysics 022", "Nov 21", head + "Add on a guest for $10"), null);
  assert.equal(cost("Pataphysics 022", "Nov 21", head + "Donations of $50 or more get a tote"), null);
  assert.equal(cost("Pataphysics 022", "Nov 21", head + "Become a sustaining member for $60 a season"), null);
  assert.equal(cost("Pataphysics 022", "Nov 21", head + "Join as a member: $75"), null);
  // A donation asked at the door still is one.
  assert.equal(cost("Pataphysics 022", "Nov 21", head + "Suggested donation $10"), "$10 suggested");
});

const link = (text: string, href: string) => ({ text, href });

test("a listing page's link to the event's own page", () => {
  // roulette.org/calendar: Night 1 is not Night 2.
  const roulettes = [
    link("Qasim Naqvi: Slow Television", "https://roulette.org/event/qasim-naqvi-slow-television/"),
    link("Breaks: A Solo Performance by Jessica Cook (Night 1)", "https://roulette.org/event/jessica-cook-night-1/"),
    link("Breaks: A Solo Performance by Jessica Cook (Night 2)", "https://roulette.org/event/jessica-cook-night-2/"),
  ];
  const night2 = { event: "Jessica Cook (Night 2) — Roulette Commission", date: "Nov 20" };
  assert.deepEqual(directLinks(night2, roulettes, "https://roulette.org/calendar/"), ["https://roulette.org/event/jessica-cook-night-2/"]);
  // brooklynshoespace.com/schedule: someone's private booking of the class comes first on the page.
  const shoes = [
    link("Sat 14 Nov10:00 AM – 1:00 PMPrivate Card Holder / Pouch Workshop · 2 people", "https://brooklynshoespace.com/calendar/private/cc29916d"),
    link("Wed 9 Dec6:00 PM – 9:00 PMCard Holder / Pouch Making Workshop", "https://brooklynshoespace.com/classes/card-holder-pouch-making-workshop"),
    link("Book a class", "https://brooklynshoespace.com/classes"),
    link("Card Holder / Pouch Making Workshop", "https://www.instagram.com/brooklynshoespace"),
  ];
  assert.deepEqual(directLinks({ event: "Card Holder / Pouch Making Workshop", date: "Dec 9" }, shoes, "https://brooklynshoespace.com/schedule"), [
    "https://brooklynshoespace.com/classes/card-holder-pouch-making-workshop",
  ]);
  // bam.org: our "(theater) opens" isn't in the venue's words.
  const bam = [link("Theater\n La Distance\n Nov 18—29, 2", "https://www.bam.org/theater/2026/la-distance?utm_source=home#tickets")];
  assert.deepEqual(directLinks({ event: "La Distance (theater) opens", date: "Nov 18" }, bam, "https://www.bam.org/"), [
    "https://www.bam.org/theater/2026/la-distance",
  ]);
});

test("a link's title words are whole words, and the link is mostly the title", () => {
  const venue = "https://venue.org/calendar/";
  const at = (path: string) => `https://venue.org/events/${path}`;
  const links = [
    link("Opening Reception: Winter Group Show", at("opening-reception")),
    link("Open Call for Artists", at("open-call")),
    link("Open Mic Night", at("open-mic")),
    link("Island Ceramics Pop-Up", at("island")),
  ];
  assert.deepEqual(directLinks({ event: "Open Mic", date: "Nov 20" }, links, venue), [at("open-mic")]);
  assert.deepEqual(directLinks({ event: "Isla", date: "Nov 20" }, links, venue), []);
  // noguchi.org/museum/calendar/: our title without the venue's subtitle.
  const noguchi = [link("Open Studio: Play with Paper", "https://www.noguchi.org/museum/calendar/event/2026-11-15-1100-open-studio-play-with-paper/")];
  assert.deepEqual(directLinks({ event: "Open Studio", date: "Nov 15" }, noguchi, "https://www.noguchi.org/museum/calendar/"), [
    "https://www.noguchi.org/museum/calendar/event/2026-11-15-1100-open-studio-play-with-paper/",
  ]);
  // brooklynshoespace.com/schedule: a card runs its end time into the title.
  const shoes = [
    link("Thu 19 Nov9:00 AM – 4:00 PMSquare Toe Slipper Making: One-day Comfort & Craft Wo", "https://brooklynshoespace.com/classes/square-toe-slipper-making-one-day-comfort-craft-workshop"),
    link("Mon 21, Tue 22 Dec10:00 AM – 5:00 PMPattern Making Class", "https://brooklynshoespace.com/classes/pattern-making-class"),
  ];
  assert.deepEqual(directLinks({ event: "Square Toe Slipper Making", date: "Nov 19" }, shoes, "https://brooklynshoespace.com/schedule"), [
    "https://brooklynshoespace.com/classes/square-toe-slipper-making-one-day-comfort-craft-workshop",
  ]);
  assert.deepEqual(directLinks({ event: "Pattern Making Class", date: "Dec 21" }, shoes, "https://brooklynshoespace.com/schedule"), [
    "https://brooklynshoespace.com/classes/pattern-making-class",
  ]);
});

test("tracking parameters come off a link; the rest stays", () => {
  assert.equal(cleanUrl("https://a.org/e/1?utm_source=x&mc_cid=2&fbclid=3&id=7#top"), "https://a.org/e/1?id=7");
});

test("listing pages: an index, or one link shared by different events", () => {
  assert.equal(isIndexUrl("https://www.bam.org/"), true);
  assert.equal(isIndexUrl("https://www.nytw.org/2026-27-season/"), true);
  assert.equal(isIndexUrl("https://roulette.org/event/jessica-cook-night-1/"), false);
  const shared = listingUrls([
    { event: "Flow State", url: "https://df.com/x" },
    { event: "Pataphysics 022", url: "https://df.com/x" },
    { event: "Toad Mountain", url: "https://lmcc.net/events/toad-mountain/" },
    { event: "Toad Mountain", url: "https://lmcc.net/events/toad-mountain/" },
  ]);
  assert.deepEqual([...shared], ["https://df.com/x"]);
});

test("planFill: a calendar's link to the event's page gives its link and price", () => {
  const e = {
    uid: "e_1", date: "Nov 21", day: "Sat", event: "Pataphysics 022", where: "Delight Factory", cost: "TBD",
    category: "sound", flag: null, mode: "witness", start: null, end: null, note: null,
    url: "https://www.delightfactorynyc.com/events",
  } satisfies CalEvent;
  const calendar = {
    status: 200,
    url: "https://www.delightfactorynyc.com/events",
    text: "NOV\n21\nPataphysics 022\n8:00 PM  11:00 PM\nDelight Factory (map)\nView Event →".padEnd(240, " "),
    links: [
      link("Pataphysics 021", "https://www.delightfactorynyc.com/events/pataphysics021"),
      link("Pataphysics 022", "https://www.delightfactorynyc.com/events/pataphysics022"),
    ],
  };
  const own = {
    status: 200,
    text: "Pataphysics 022\nSaturday, November 21, 2026\n8:00 PM  11:00 PM\nDoors 7:30 PM. Ends ca. 11:00 PM\nAdmission: $20\n" + " menu about contact".repeat(12),
  };
  const reads = new Map([["https://www.delightfactorynyc.com/events/pataphysics022", own]]);
  const plan = planFill(e, { page: calendar, result: "ok", listing: true, reads, year: 2026, daysAway: 9 });
  assert.equal(plan.url, "https://www.delightfactorynyc.com/events/pataphysics022");
  assert.equal(plan.cost, "$20");
  assert.equal(plan.page, "https://www.delightfactorynyc.com/events/pataphysics022");
  // The calendar alone, its event page unread: nothing to change, and why.
  const none = planFill(e, { page: calendar, result: "ok", listing: true, reads: new Map(), year: 2026, daysAway: 9 });
  assert.equal(none.cost, undefined);
  assert.match(none.why ?? "", /no price/);
  // A calendar that no longer shows it, while its own page does: the own page
  // is found all the same, and check-events counts that as the listing's check.
  const moved = planFill(e, { page: calendar, result: "unconfirmed", listing: true, reads, year: 2026, daysAway: 9 });
  assert.equal(moved.url, "https://www.delightfactorynyc.com/events/pataphysics022");
  // Fills someone undid by hand aren't looked for again.
  const no = planFill(e, { page: calendar, result: "ok", listing: true, reads, year: 2026, daysAway: 9, declined: { cost: true, url: true } });
  assert.equal(no.url, undefined);
  assert.equal(no.cost, undefined);
});

// mostlygoodstudios.com/calendar/handbuilding-course-…: each session's page
// ends on the sessions either side of it.
const studioNav = "SKIP TO CONTENT\nHome\nCalendar\nShop\nStudio Membership\nPrivate Events & Lessons\nAbout\nContact\nFAQ\nLogin\n0\nBack to All Events\n";
const studioAbout =
  "\n10:00 AM  11:00 AM\n\nOver 6 weeks, learn and explore various hand building methods like slab building, coiling, pinching, and modeling.\n\nREGISTER\n";
const week4 = `${studioNav}HAND BUILDING COURSE FALL SESSION WEEK 4\nSunday, November 1, 2026${studioAbout}Previous\nOctober 30\nVERY ANGRY WOMEN\nNext\nNovember 8\nHAND BUILDING COURSE FALL SESSION WEEK 5\n SIGN UP\n\n920 35th Avenue Astoria NY, 11106`;
const week5 = `${studioNav}HAND BUILDING COURSE FALL SESSION WEEK 5\nSunday, November 8, 2026${studioAbout}Previous\nNovember 1\nHAND BUILDING COURSE FALL SESSION WEEK 4\nNext\nNovember 12\nCeramic Slumber Party - TWILIGHT\n SIGN UP\n\n920 35th Avenue Astoria NY, 11106`;

test("planFill: a session's page isn't the next session's, though it names it at the bottom", () => {
  const e = {
    uid: "e_2", date: "Nov 8", day: "Sun", event: "Hand Building Course", where: "Mostly Good Studios", cost: "$40",
    category: "making", flag: null, mode: "make", start: null, end: null, note: null,
    url: "https://www.mostlygoodstudios.com/calendar",
  } satisfies CalEvent;
  const base = "https://www.mostlygoodstudios.com/calendar/handbuilding-course-week-1-xc9lc-4lwz7-ty5fa-byxjd-g4e6x-973s3-wnshb-zndwg-r5yr7";
  const calendar = {
    status: 200,
    url: "https://www.mostlygoodstudios.com/calendar",
    text: "November 2026\nSU\tMO\tTU\tWE\tTH\tFR\tSA\n1\nHAND BUILDING COURSE FALL SESSION WEEK 4\n10:00 AM – 11:00 AM\n\t2\t3\t4\t5\t6\t7\n8\nHAND BUILDING COURSE FALL SESSION WEEK 5\n10:00 AM – 11:00 AM\n\t9\t10\t11\t12".padEnd(240, " "),
    links: [link("HAND BUILDING COURSE FALL SESSION WEEK 4", base), link("HAND BUILDING COURSE FALL SESSION WEEK 5", `${base}-wcl5l`)],
  };
  const ctx = { page: calendar, result: "ok" as const, listing: true, year: 2026, daysAway: 5 };
  assert.equal(planFill(e, { ...ctx, reads: new Map([[base, { status: 200, text: week4 }], [`${base}-wcl5l`, { status: 200, text: week5 }]]) }).url, `${base}-wcl5l`);
  // Week 4's page alone shows week 5 only in its closing links: not its page.
  assert.equal(planFill(e, { ...ctx, reads: new Map([[base, { status: 200, text: week4 }]]) }).url, undefined);
  // On the first session of a run there's only "Next".
  const first = week4.replace("Previous\nOctober 30\nVERY ANGRY WOMEN\n", "");
  assert.equal(planFill(e, { ...ctx, reads: new Map([[base, { status: 200, text: first }]]) }).url, undefined);
});

test("planFill: of two pages that show it, the one about that date", () => {
  // brooklynshoespace.com: the class page lists every date; the schedule page is one session's.
  const e = {
    uid: "e_3", date: "Dec 7", day: "Mon", event: "Introduction to Shoe Making", where: "Brooklyn Shoe Space", cost: "$95",
    category: "making", flag: null, mode: "make", start: null, end: null, note: null,
    url: "https://brooklynshoespace.com/schedule",
  } satisfies CalEvent;
  const classPage = "https://brooklynshoespace.com/classes/2-hour-introduction-to-shoe-making";
  const session = "https://brooklynshoespace.com/schedule/2026/dec/intro-shoe-making";
  const calendar = {
    status: 200,
    url: "https://brooklynshoespace.com/schedule",
    text: "Mon 7 Dec 6:00 PM – 8:00 PM 2-hour Introduction to Shoe Making".padEnd(240, " "),
    links: [link("2-hour Introduction to Shoe Making", classPage), link("2-hour Introduction to Shoe Making", session)],
  };
  const shoes =
    "2-hour Introduction to Shoe Making\n\nThis 2-hour session covers how shoes are built. Tuition is $100.\n\nDates & booking\n\nNovember 12, 2026\n\n6:00 PM – 8:00 PM\n\nFull · $95\n\nDecember 7, 2026\n\n6:00 PM – 8:00 PM\n\n2 spots remaining · $95\n\nBook" + " menu about contact".repeat(12);
  const one = "Schedule/2-hour Introduction to Shoe Making\n2-hour Introduction to Shoe Making\n\nMon 7 Dec 2026 · 6:00 PM – 8:00 PM · Brooklyn Shoe Space\n\nBook this class" + " menu about contact".repeat(12);
  const reads = new Map([[classPage, { status: 200, text: shoes }], [session, { status: 200, text: one }]]);
  assert.equal(planFill(e, { page: calendar, result: "ok", listing: true, reads, year: 2026, daysAway: 25 }).url, session);
});

test("sortFills: a fill put back by hand is turned down, and stays turned down", () => {
  const made = [
    { uid: "a", cost: "$20" },
    { uid: "b", url: "https://v.org/events/b", replaces: "https://v.org/calendar" },
    { uid: "c", cost: "$15", url: "https://v.org/events/c", replaces: "https://v.org/calendar" },
    { uid: "gone", cost: "$5" },
  ];
  const events = [
    { uid: "a", cost: "TBD", url: "https://v.org/events/a" },
    { uid: "b", cost: "$10", url: "https://v.org/calendar" },
    { uid: "c", cost: "$15", url: "https://v.org/events/c" },
    { uid: "d", cost: "TBD", url: "https://v.org/calendar" },
  ];
  const first = sortFills(made, events, [{ uid: "d", cost: "$30" }, { uid: "past", cost: "$1" }]);
  assert.deepEqual(first.declined, [{ uid: "d", cost: "$30" }, { uid: "a", cost: "$20" }, { uid: "b", url: "https://v.org/events/b" }]);
  assert.deepEqual(first.filled, [{ uid: "c", cost: "$15", url: "https://v.org/events/c", replaces: "https://v.org/calendar" }]);
  // The next run carries both lists as they are.
  const next = sortFills(first.filled, events, first.declined);
  assert.deepEqual(next, first);
  // Taking an entry out of `declined` lets the fill be made again.
  assert.deepEqual(sortFills(first.filled, events, []).declined, []);
});
