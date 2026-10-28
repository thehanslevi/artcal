import { useCallback, useEffect, useState } from "react";

/**
 * Seasonal skins.
 *
 * A skin is a full visual system layered over the token system in styles.css,
 * scoped to `<html data-skin="…">`, so the original design is never edited —
 * it is simply what you get when the attribute is absent. That is what makes
 * "save the old design to come back to later" a toggle rather than a revert.
 *
 * Two candidate skins exist while the Halloween revamp is being chosen (both in
 * src/skins/devils.css — they share one graphic program and differ in type):
 *   devils-a  blackletter for the big moments, grotesque for the rest
 *   devils-b  Garamond capitals for the big moments, grotesque for the rest
 * Once one is picked, delete the other.
 */
export type Skin = "original" | "devils-a" | "devils-b";

const KEY = "artcal-skin";
const ORDER: Skin[] = ["devils-a", "devils-b", "original"];

/** The seasonal default. Flip to "original" once the season is over; the
 *  header toggle still lets any visitor choose. */
export const DEFAULT_SKIN: Skin = "devils-a";

export function readSkin(): Skin {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "original" || v === "devils-a" || v === "devils-b") return v;
  } catch {
    /* private mode / blocked storage — fall through to the default */
  }
  return DEFAULT_SKIN;
}

/** Reflect the skin onto <html data-skin>. "original" means no attribute,
 *  so the untouched styles.css is exactly what renders. */
export function applySkin(skin: Skin): void {
  if (skin === "original") delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
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

  const cycle = useCallback(
    () => setSkin((s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]!),
    [],
  );

  return { skin, cycle };
}
