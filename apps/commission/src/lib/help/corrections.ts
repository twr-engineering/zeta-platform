/**
 * M10.4 — split the Collectible Corrections doctrine (P6, §6.3) into its three
 * cases, VERBATIM.
 *
 * The corrections-doctrine article body is one blob carrying "**1. … **2. … **3.
 * …**". The FR-M10-13 mini-flow shows only the matched case's sentence(s), so we
 * slice the article by its numbered markers — the returned strings are exact
 * substrings of the verbatim body (rule 12: doctrine copy is never paraphrased).
 * If the markers aren't found (a stripped fallback article), every case falls
 * back to the whole body so the flow still teaches the doctrine, never breaks.
 */
import type { HelpArticle } from "./types";

export type CorrectionsCases = {
  /** The lead-in sentence before case 1 (e.g. "Which tool to use when a deal's number changes:"). */
  intro: string;
  /** Case 1 — the economics truly changed → edit the deal. */
  case1: string;
  /** Case 2 — earnings stand, expected cash differs, you accept it → Confirmed Collectible. */
  case2: string;
  /** Case 3 — a shortfall you do NOT agree with → close short, let Variance tell the story. */
  case3: string;
};

/** Byte-exact slices of the doctrine body by its "**1." / "**2." / "**3." markers. */
export function correctionsCases(article: HelpArticle): CorrectionsCases {
  const body = article.bodyMd;
  const i1 = body.indexOf("**1.");
  const i2 = body.indexOf("**2.");
  const i3 = body.indexOf("**3.");

  if (i1 < 0 || i2 < 0 || i3 < 0 || !(i1 < i2 && i2 < i3)) {
    return { intro: "", case1: body, case2: body, case3: body };
  }

  return {
    intro: body.slice(0, i1).trim(),
    case1: body.slice(i1, i2).trim(),
    case2: body.slice(i2, i3).trim(),
    case3: body.slice(i3).trim(),
  };
}
