import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

/**
 * /settings has no content of its own — it is the area, not a screen. General is
 * the first section (M0 §6) and the one a new agent needs first.
 */
export default function SettingsIndexPage() {
  redirect(ROUTES.settingsGeneral);
}
