import { useCallback, useEffect, useState } from "react";

/**
 * Seasonal skins.
 *
 * A skin is a full visual system layered over the token system in styles.css,
 * scoped to `<html data-skin="…">`, so the original design is never edited —
 * it is simply what you get when the attribute is absent. That is what makes
 * "save the old design to come back to later" a toggle rather than a revert.
 *
 * Today there is one skin: "devils", the Halloween revamp after Ken Russell's
 * The Devils (src/skins/devils.css).
 */
export type Skin = "original" | "devils";

const KEY = "artcal-skin";

/** The seasonal default. Flip to "original" once the season is over; the
 *  header toggle still lets any visitor choose either. */
export const DEFAULT_SKIN: Skin = "devils";

export function readSkin(): Skin {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "original" || v === "devils") return v;
  } catch {
    /* private mode / blocked storage — fall through to the default */
  }
  return DEFAULT_SKIN;
}

/** Reflect the skin onto <html data-skin>. "original" means no attribute,
 *  so the untouched styles.css is exactly what renders. */
export function applySkin(skin: Skin): void {
  if (skin === "devils") document.documentElement.dataset.skin = "devils";
  else delete document.documentElement.dataset.skin;
}

export function useSkin() {
  const [skin, setSkin] = useState<Skin>(readSkin);

  useEffect(() => {
    applySkin(skin);
    try {
      localStorage.setItem(KEY, skin);
    } catch {
      /* quota / blocked storage */
    }
  }, [skin]);

  const toggle = useCallback(
    () => setSkin((s) => (s === "devils" ? "original" : "devils")),
    [],
  );

  return { skin, toggle };
}
