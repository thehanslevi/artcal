import type { Browser } from "playwright";

export type FetchStrategy = "static" | "playwright";

const USER_AGENT =
  "Mozilla/5.0 (compatible; NYCArtCalendarBot/1.0; +https://nyc-art-cal.vercel.app)";

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;
  const { chromium } = await import("playwright");
  sharedBrowser = await chromium.launch({
    // CHROMIUM_PATH: use an already-installed browser when the cached build
    // doesn't match this Playwright version. CI installs the right one.
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export async function fetchHtml(
  url: string,
  strategy: FetchStrategy = "static",
): Promise<string | null> {
  if (strategy === "playwright") return fetchHtmlPlaywright(url);
  return fetchHtmlStatic(url);
}

async function fetchHtmlStatic(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      // Without this, a venue that accepts the connection but never responds
      // stalls the whole scan indefinitely — the playwright path already caps
      // at 25s, the static path had no cap at all.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export interface RenderedPage {
  url: string;
  /** HTTP status, or 0 when the request never got an answer. */
  status: number;
  /** Visible text, as a person would read it. */
  text: string;
  links: { href: string; text: string }[];
  error?: string;
}

// Booking widgets that render inside an iframe. Their text belongs to the page
// a visitor is reading, so it's read along with it.
const BOOKING_FRAME_RE =
  /acuityscheduling|fareharbor|hisawyer|mindbodyonline|healcode|momence/i;

/**
 * Render a page for reading rather than parsing: the standing-offerings pass
 * wants what a visitor sees (prices, schedules), which on Wix and Squarespace
 * exists only after hydration and never in structured markup.
 */
export async function renderPage(url: string): Promise<RenderedPage> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  try {
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    const status = res?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {
      /* fine if some XHRs never settle */
    });
    await page.waitForTimeout(1200);
    const { text, links } = await page.evaluate(() => ({
      text: document.body?.innerText ?? "",
      links: [...document.querySelectorAll("a[href]")].map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? "").trim().slice(0, 80),
      })),
    }));
    let combined = text;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || !BOOKING_FRAME_RE.test(frame.url())) continue;
      const inner = await frame
        .evaluate(() => document.body?.innerText ?? "")
        .catch(() => "");
      if (inner) combined += "\n" + inner;
    }
    return { url: page.url(), status, text: combined, links };
  } catch (err) {
    return {
      url,
      status: 0,
      text: "",
      links: [],
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    };
  } finally {
    await context.close();
  }
}

async function fetchHtmlPlaywright(url: string): Promise<string | null> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    // Give client-rendered content a moment to hydrate. Many sites never
    // reach networkidle (analytics/beacons), so cap the wait low — the DOM
    // is usually painted well before then — and add a short settle.
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {
      /* fine if some XHRs never settle */
    });
    await page.waitForTimeout(1200);
    return await page.content();
  } catch (err) {
    console.error(
      `   Playwright fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    await context.close();
  }
}
