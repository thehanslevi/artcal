import type { Browser } from "playwright";

export type FetchStrategy = "static" | "playwright";

const USER_AGENT =
  "Mozilla/5.0 (compatible; NYCArtCalendarBot/1.0; +https://nyc-art-practice-programming.vercel.app)";

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;
  const { chromium } = await import("playwright");
  sharedBrowser = await chromium.launch({
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
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
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
      timeout: 30000,
    });
    // Give client-rendered content a moment to hydrate
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {
      /* fine if some XHRs never settle */
    });
    await page.waitForTimeout(1500);
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
