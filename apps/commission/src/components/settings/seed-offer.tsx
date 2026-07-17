"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import { SEED_PROVENANCE } from "@/lib/settings/seed-lists";
import { LIST_ENTITY_TITLES, type ListEntity } from "@/lib/settings/lists";

/**
 * The seed offer (M0.3 deliverable: "Seed-offer flow (accept/edit/skip the
 * workbook's example sets)"; rule 11).
 *
 * RULE 11 IS THE WHOLE DESIGN: "Workspace creation seeds nothing silently. The
 * first-run wizard (M10) *offers* the seed lists; the agent can accept, edit, or
 * skip." §3.4 and §3.5 say it twice more — these are "user-editable, NOT
 * hard-coded", "never product defaults".
 *
 * So this is an offer with all three answers reachable and none of them
 * pre-chosen for the agent:
 *
 *   accept → tick what you want and press Add. Everything starts ticked, because
 *            an offer whose boxes are all empty is a chore, not an offer.
 *   edit   → untick the ones that are not yours. Unticked rows never reach the
 *            database at all; they are not created-then-archived.
 *   skip   → ignore this entirely and use the add form below it. There is no
 *            "Skip" button because there is nothing to dismiss — no state is
 *            recorded either way, and the offer simply stops appearing once the
 *            list has anything in it.
 *
 * WHERE IT LIVES, AND WHY NOT M10: M10 owns the first-run WIZARD. Until it
 * exists, an agent's only route to these lists is this screen, and shipping the
 * lists with no starting point would make M0.3's own demo script ("add Developer
 * 'Abrown Inc.'…") the agent's problem to repeat thirteen times. The offer is
 * the same shape M10 will reuse: the content is in @/lib/settings/seed-lists and
 * the accept path is a server action, so the wizard calls the same code.
 */

export type SeedOption = {
  name: string;
  /** The attribute in the agent's words: "Threshold", "Gross". */
  detail?: string;
  /** Why that attribute is what it is. */
  caption?: string;
};

export function SeedOffer({
  entity,
  seeds,
  action,
  onCompleted,
  emptyDescription,
}: {
  entity: ListEntity;
  seeds: readonly SeedOption[];
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  onCompleted: (state: ActionState) => void;
  emptyDescription: string;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(seeds.map((seed) => seed.name))
  );

  const [, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData);
      onCompleted(result);
      return result;
    },
    IDLE
  );

  const toggle = (name: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const title = LIST_ENTITY_TITLES[entity];

  return (
    <Card data-testid="seed-offer">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          Start from the workbook&rsquo;s {title.toLowerCase()}?
        </CardTitle>
        <CardDescription className="space-y-2">
          {/* What the list DRIVES, per M0 §6 — never merely "this list is empty". */}
          <span className="block">{emptyDescription}</span>
          <span className="block">{SEED_PROVENANCE}</span>
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {seeds.map((seed, index) => {
              // Indexed, NOT named. An id must not contain whitespace (HTML
              // living standard), and half these names do — "House & Lot",
              // "Sphere / Personal Network". Chrome still honours the label's
              // click, which is why this looked fine, but the accessible name
              // computation drops it: a screen reader announced an unlabelled
              // checkbox. Found in the browser's a11y tree, invisible to the
              // build and to a click-only test.
              const id = `seed-${entity}-${index}`;
              const ticked = chosen.has(seed.name);

              return (
                <li key={seed.name} className="flex items-start gap-2.5">
                  <Checkbox
                    id={id}
                    checked={ticked}
                    onCheckedChange={() => toggle(seed.name)}
                    className="mt-0.5"
                    data-testid="seed-checkbox"
                  />
                  {/* Only what is ticked is submitted, so the server receives the
                      agent's selection and nothing else. The action matches these
                      names against the workbook list rather than trusting a
                      payload — see acceptPropertyTypeSeeds. */}
                  {ticked && <input type="hidden" name="seed" value={seed.name} />}
                  <Label htmlFor={id} className="text-sm font-normal">
                    <span className="font-medium">{seed.name}</span>
                    {seed.detail && (
                      <span className="text-muted-foreground"> — {seed.detail}</span>
                    )}
                    {seed.caption && (
                      <span className="block text-xs text-pretty text-muted-foreground">
                        {seed.caption}
                      </span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || chosen.size === 0} data-testid="seed-accept">
              {pending
                ? "Adding…"
                : `Add ${chosen.size} ${chosen.size === 1 ? "item" : "items"}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Or ignore this and add your own below — nothing is added until you
              press the button.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
