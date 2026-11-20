"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Download, GripVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputField } from "@/components/affordance/input-field";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/common/empty-state";
import { FormStatus } from "@/components/forms/form-status";
import { ConfirmGate } from "@/components/friction/confirm-gate";
import { IDLE, type ActionState } from "@/lib/forms/action-state";
import { exportPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  LIST_ENTITY_LABELS,
  listRecomputeConsequence,
  referenceCountLabel,
  type ListEntity,
} from "@/lib/settings/lists";
import { SeedOffer, type SeedOption } from "./seed-offer";

/**
 * The configuration-list screen (M0 §6), instantiated three times.
 *
 * "table with inline add row (mirrors 'add a row to onboard a developer'),
 * inline rename, archive toggle, reference count column ('used by 12 deals'),
 * archived items collapsed under a toggle, drag sort for Lead Sources."
 *
 * ONE COMPONENT, THREE LISTS. The three differ in exactly two ways, and both are
 * parameters rather than forks: Property Types and Developers each carry ONE
 * enum attribute (vat_rule / comm_base) of the same shape — a small closed set
 * of options, each with a caption — and Lead Sources carry a manual order
 * instead. Everything else (add, rename, archive, restore, delete, export, the
 * empty state, the seed offer) is identical, and three copies would drift.
 *
 * NOT A <table>, at any width. M0 §6 asks for "tables collapse to cards" at
 * 360px, and solo agents run this product from a phone. A row here is a card
 * that reflows, because a real table that becomes cards at a breakpoint is two
 * layouts to maintain and it is the phone one that gets neglected.
 */

export type ListAttributeOption = {
  value: string;
  label: string;
  caption: string;
};

/** The single enum attribute a list may carry (vat_rule / comm_base). */
export type ListAttribute = {
  /** The form field name the server actions read. */
  field: string;
  label: string;
  options: readonly ListAttributeOption[];
  /**
   * True when changing it restates booked money (rule 3 / rule 8) — the client
   * half of a decision the SERVER makes independently from its own diff. This
   * only decides whether a modal appears; @/lib/settings/list-actions decides
   * whether the write happens.
   */
  restating: boolean;
};

export type ListItem = {
  id: string;
  name: string;
  archivedAt: string | null;
  referenceCount: number;
  /** The attribute's current value, when the list has one. */
  attributeValue?: string;
  /** Lead Sources only. */
  sortOrder?: number;
};

export type ListActions = {
  create: (state: ActionState, formData: FormData) => Promise<ActionState>;
  update: (state: ActionState, formData: FormData) => Promise<ActionState>;
  archive: (state: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (state: ActionState, formData: FormData) => Promise<ActionState>;
  reorder?: (state: ActionState, formData: FormData) => Promise<ActionState>;
  seed: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

export type ListScreenProps = {
  entity: ListEntity;
  /** The URL segment for /api/export/… */
  dataset: string;
  items: readonly ListItem[];
  attribute?: ListAttribute;
  actions: ListActions;
  seeds: readonly SeedOption[];
  /** What the list drives, for the empty state (M0 §6). */
  emptyDescription: string;
  /** Standing advisory, e.g. the 50-lead-source soft cap. */
  warning?: string | null;
  /** Enables drag ordering (Lead Sources). */
  sortable?: boolean;
};

export function ListScreen({
  entity,
  dataset,
  items,
  attribute,
  actions,
  seeds,
  emptyDescription,
  warning,
  sortable = false,
}: ListScreenProps) {
  const active = items.filter((item) => item.archivedAt === null);
  const archived = items.filter((item) => item.archivedAt !== null);

  const [showArchived, setShowArchived] = useState(false);

  /**
   * The outcome of whichever row last reported.
   *
   * Rows own their own action state, but a row that archives or deletes itself
   * is gone from this list on the very next render — taking its message with it.
   * The same unmount-on-success trap the tax form hit with ConfirmGate, one
   * level up: if the agent is to be told it worked, the message must outlive the
   * thing that did the work.
   */
  const [outcome, setOutcome] = useState<ActionState | null>(null);

  /**
   * Reordering, shared by the drag handlers and the up/down buttons so both
   * paths mean exactly the same thing to the server: "put this row in that
   * slot". Not useActionState — a drop is not a form submit, and the buttons
   * would otherwise have to duplicate this.
   */
  const [reordering, startReorder] = useTransition();

  const moveTo = (id: string, position: number) => {
    if (!actions.reorder) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("position", String(position));
    startReorder(async () => {
      const result = await actions.reorder!(IDLE, formData);
      setOutcome(result);
    });
  };

  const label = LIST_ENTITY_LABELS[entity];
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-6">
      <FormStatus state={outcome ?? IDLE} />

      {warning && (
        <Alert data-testid="list-warning">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {isEmpty ? (
        // Rule 11: an empty list is OFFERED the workbook's example set, never
        // given it. Skipping is a first-class outcome — the add form below is
        // the skip path, and needs no button of its own.
        <SeedOffer
          entity={entity}
          seeds={seeds}
          action={actions.seed}
          onCompleted={setOutcome}
          emptyDescription={emptyDescription}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" data-testid="list-counts">
            {active.length} active
            {archived.length > 0 && `, ${archived.length} archived`}
          </p>
          <ExportButtons dataset={dataset} />
        </div>
      )}

      <AddRow
        entity={entity}
        attribute={attribute}
        action={actions.create}
        onCompleted={setOutcome}
      />

      {!isEmpty && active.length === 0 && (
        <EmptyState
          title={`Every ${label} is archived`}
          description={`Nothing will appear in the ${label} dropdown on a new deal. Restore one below, or add a new one above.`}
        />
      )}

      {active.length > 0 && (
        <SortableList
          items={active}
          sortable={sortable && Boolean(actions.reorder)}
          onMove={moveTo}
          busy={reordering}
          render={(item, index, dragProps) => (
            <ListRow
              key={item.id}
              entity={entity}
              item={item}
              attribute={attribute}
              actions={actions}
              onCompleted={setOutcome}
              sortable={sortable && Boolean(actions.reorder)}
              busy={reordering}
              first={index === 0}
              last={index === active.length - 1}
              // The neighbours in the ORDER THE AGENT SEES — which is what a
              // move means. sort_order is dense across archived rows too, so
              // taking the visible neighbour's slot is what keeps "move up"
              // landing where the agent expects instead of into a hidden row.
              previousOrder={active[index - 1]?.sortOrder}
              nextOrder={active[index + 1]?.sortOrder}
              onMove={moveTo}
              dragProps={dragProps}
            />
          )}
        />
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((open) => !open)}
            data-testid="toggle-archived"
            aria-expanded={showArchived}
          >
            {showArchived ? <ChevronUp /> : <ChevronDown />}
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </Button>

          {showArchived && (
            <>
              <p className="text-xs text-pretty text-muted-foreground">
                Archived items are gone from new-deal dropdowns. Every deal that
                already uses one keeps displaying and computing exactly as it
                does now, and reports still show them — as an “(inactive)”
                bucket.
              </p>
              <ul className="space-y-2" data-testid="list-archived">
                {archived.map((item) => (
                  <ListRow
                    key={item.id}
                    entity={entity}
                    item={item}
                    attribute={attribute}
                    actions={actions}
                    onCompleted={setOutcome}
                    sortable={false}
                    busy={false}
                    first
                    last
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What a row needs to become draggable. Empty when the list is not sortable. */
type DragProps = {
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  "data-drop-target"?: boolean;
};

/**
 * Drag ordering (§3.6: "drag sort for Lead Sources").
 *
 * Native HTML5 drag-and-drop, not a library: this is one list of at most a few
 * dozen short rows, and the up/down buttons below already cover the cases HTML5
 * drag does not (touch, keyboard). Adding @dnd-kit to the bundle to reach the
 * same place would be paying for a general solution to a specific problem.
 *
 * The drop lands the dragged row on the TARGET's sort_order slot, which is
 * exactly what reorder_lead_source takes — the server closes ranks and reopens
 * at that position, so the client never computes a new ordering and the two can
 * never disagree about one.
 */
function SortableList({
  items,
  sortable,
  onMove,
  busy,
  render,
}: {
  items: readonly ListItem[];
  sortable: boolean;
  onMove: (id: string, position: number) => void;
  busy: boolean;
  render: (
    item: ListItem,
    index: number,
    dragProps: DragProps
  ) => React.ReactNode;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const dragPropsFor = (item: ListItem): DragProps => {
    if (!sortable) return {};

    return {
      draggable: !busy,
      onDragStart: (event) => {
        setDraggingId(item.id);
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload on the transfer.
        event.dataTransfer.setData("text/plain", item.id);
      },
      onDragOver: (event) => {
        if (!draggingId || draggingId === item.id) return;
        // Without this, the drop event never fires at all.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOverId(item.id);
      },
      onDragLeave: () => setOverId((current) => (current === item.id ? null : current)),
      onDrop: (event) => {
        event.preventDefault();
        const sourceId = draggingId ?? event.dataTransfer.getData("text/plain");
        setDraggingId(null);
        setOverId(null);
        if (!sourceId || sourceId === item.id) return;
        if (item.sortOrder === undefined) return;
        onMove(sourceId, item.sortOrder);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
      },
      "data-drop-target": overId === item.id ? true : undefined,
    };
  };

  return (
    <ul className="space-y-2" data-testid="list-active">
      {items.map((item, index) => render(item, index, dragPropsFor(item)))}
    </ul>
  );
}

/**
 * Plain links, not fetches: the browser downloads a URL. `download` is not set —
 * the server's Content-Disposition already names the file, and setting both
 * would be two places to change one name.
 */
function ExportButtons({ dataset }: { dataset: string }) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={exportPath(dataset, "csv")} />}
        data-testid="export-csv"
      >
        <Download />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={exportPath(dataset, "xlsx")} />}
        data-testid="export-xlsx"
      >
        <Download />
        Excel
      </Button>
    </div>
  );
}

/** The inline add row — the sheet's "add a row to onboard a developer" (M0 §6). */
function AddRow({
  entity,
  attribute,
  action,
  onCompleted,
}: {
  entity: ListEntity;
  attribute?: ListAttribute;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  onCompleted: (state: ActionState) => void;
}) {
  /**
   * CONTROLLED, deliberately — React 19 resets an uncontrolled form once its
   * action resolves, whether the action succeeded or not. Uncontrolled, a
   * refused add ("you already have a Condo") wiped what the agent had typed, so
   * fixing one character meant retyping the lot. Found in the browser; the
   * build cannot see it, and a test that only asserts the error message would
   * have passed straight over it.
   *
   * So the field is cleared HERE, on success only.
   */
  const [name, setName] = useState("");

  const [, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData);
      onCompleted(result);
      if (!result.error) setName("");
      return result;
    },
    IDLE
  );

  const label = LIST_ENTITY_LABELS[entity];

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
      data-testid="add-form"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`add-${entity}`}>Add a {label}</Label>
        <InputField
          id={`add-${entity}`}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`New ${label}`}
          autoComplete="off"
          data-testid="add-name-input"
        />
      </div>

      {attribute && (
        <div className="space-y-1.5">
          <Label htmlFor={`add-${entity}-attr`}>{attribute.label}</Label>
          <AttributeSelect
            id={`add-${entity}-attr`}
            attribute={attribute}
            defaultValue={attribute.options[0]?.value}
            testId="add-attribute-select"
          />
        </div>
      )}

      <Button type="submit" disabled={pending} data-testid="add-submit">
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

/**
 * The blue-input affordance on a <select> (Master PRD §4.4, M0 §6): the agent
 * chooses here, so it must look like it. Base UI has no Select in this project's
 * kit yet and a native one is keyboard- and touch-correct for free.
 */
function AttributeSelect({
  id,
  attribute,
  defaultValue,
  value,
  onChange,
  disabled,
  testId,
}: {
  id?: string;
  attribute: ListAttribute;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <select
      id={id}
      name={attribute.field}
      defaultValue={defaultValue}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border px-3 text-sm shadow-xs sm:w-40",
        "border-affordance-input-border bg-affordance-input text-affordance-input-foreground",
        "focus-visible:border-affordance-input-ring focus-visible:outline-none",
        "disabled:opacity-50"
      )}
      data-testid={testId}
    >
      {attribute.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ListRow({
  entity,
  item,
  attribute,
  actions,
  onCompleted,
  sortable,
  busy,
  first,
  last,
  previousOrder,
  nextOrder,
  onMove,
  dragProps,
}: {
  entity: ListEntity;
  item: ListItem;
  attribute?: ListAttribute;
  actions: ListActions;
  onCompleted: (state: ActionState) => void;
  sortable: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  previousOrder?: number;
  nextOrder?: number;
  onMove?: (id: string, position: number) => void;
  dragProps?: DragProps;
}) {
  const [name, setName] = useState(item.name);
  const [attributeValue, setAttributeValue] = useState(item.attributeValue ?? "");

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await actions.update(previous, formData);
      onCompleted(result);
      return result;
    },
    IDLE
  );

  const archived = item.archivedAt !== null;
  const renamed = name.trim() !== item.name;
  const attributeChanged =
    attribute !== undefined && attributeValue !== item.attributeValue;
  const dirty = renamed || attributeChanged;

  // Only a money-restating attribute change opens the gate. A rename is rule 6 —
  // deals reference this row by id, so nothing moves but the label.
  const needsGate = attributeChanged && (attribute?.restating ?? false);

  const payload = (
    <>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="name" value={name} />
      {attribute && (
        <input type="hidden" name={attribute.field} value={attributeValue} />
      )}
    </>
  );

  return (
    <li
      {...dragProps}
      className={cn(
        "rounded-lg border p-3 transition-colors",
        archived && "bg-muted/40",
        dragProps?.["data-drop-target"] && "border-affordance-input-ring bg-affordance-input"
      )}
      data-testid="list-row"
      data-name={item.name}
      data-archived={archived ? "true" : "false"}
      data-sort-order={item.sortOrder}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {sortable && onMove && (
          <ReorderControls
            item={item}
            onMove={onMove}
            busy={busy}
            first={first}
            last={last}
            previousOrder={previousOrder}
            nextOrder={nextOrder}
          />
        )}

        <div className="flex-1">
          <InputField
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={`Rename ${item.name}`}
            affordance={archived ? "plain" : "input"}
            disabled={archived}
            data-testid="row-name-input"
          />
        </div>

        {attribute && (
          <AttributeSelect
            attribute={attribute}
            value={attributeValue}
            onChange={setAttributeValue}
            disabled={archived}
            testId="row-attribute-select"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" data-testid="row-reference-count">
            {referenceCountLabel(item.referenceCount)}
          </Badge>

          {dirty &&
            !archived &&
            (needsGate ? (
              <ConfirmGate
                testId="row-confirm-gate"
                trigger={
                  <Button size="sm" data-testid="row-save">
                    Save
                  </Button>
                }
                title="This changes how your money is calculated"
                description={`You are changing the ${attribute?.label.toLowerCase()} for ${item.name}.`}
                // The honest, per-item count: how many deals reference this row
                // (M1.2 turned this real). That IS the set a comm_base/vat_rule
                // change restates — count_affected_deals(developer|property_type)
                // is the same predicate — so the modal states the true number
                // with no extra query.
                consequence={listRecomputeConsequence(entity, item.name, item.referenceCount)}
                gate={{ mode: "checked" }}
                confirmLabel="Save change"
                // Wrapped so the outcome lands in the PARENT's state: this gate
                // is conditional, so a successful save clears `dirty` and
                // unmounts it in the same beat — a callback fired from inside
                // would never run. See the note in confirm-gate.tsx.
                action={async (previous, formData) => {
                  const result = await actions.update(previous, formData);
                  onCompleted(result);
                  return result;
                }}
              >
                {payload}
              </ConfirmGate>
            ) : (
              <form action={formAction}>
                {payload}
                <Button
                  size="sm"
                  type="submit"
                  disabled={pending}
                  data-testid="row-save"
                >
                  {pending ? "Saving…" : "Save"}
                </Button>
              </form>
            ))}

          <ArchiveButton item={item} action={actions.archive} onCompleted={onCompleted} />

          <DeleteButton
            entity={entity}
            item={item}
            action={actions.remove}
            onCompleted={onCompleted}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="row-error">
          {state.error}
        </p>
      )}
    </li>
  );
}

/**
 * Explicit up/down buttons alongside the drag handle (§3.6, M0 §6).
 *
 * BOTH, NOT EITHER. The PRD asks for drag sort, and native HTML5 drag does not
 * fire for touch at all — so on the 360px phone this product is explicitly built
 * for, drag alone would be a feature that does not exist. These buttons are also
 * the keyboard path. Drag is what a desktop hand reaches for; the buttons are
 * what always works.
 */
function ReorderControls({
  item,
  onMove,
  busy,
  first,
  last,
  previousOrder,
  nextOrder,
}: {
  item: ListItem;
  onMove: (id: string, position: number) => void;
  busy: boolean;
  first: boolean;
  last: boolean;
  previousOrder?: number;
  nextOrder?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="cursor-grab text-muted-foreground"
        aria-hidden="true"
        data-testid="row-drag-handle"
      >
        <GripVertical className="size-4" />
      </span>
      <div className="flex sm:flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={first || busy || previousOrder === undefined}
          onClick={() => previousOrder !== undefined && onMove(item.id, previousOrder)}
          aria-label={`Move ${item.name} up`}
          data-testid="row-move-up"
        >
          <ChevronUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={last || busy || nextOrder === undefined}
          onClick={() => nextOrder !== undefined && onMove(item.id, nextOrder)}
          aria-label={`Move ${item.name} down`}
          data-testid="row-move-down"
        >
          <ChevronDown />
        </Button>
      </div>
    </div>
  );
}

function ArchiveButton({
  item,
  action,
  onCompleted,
}: {
  item: ListItem;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  onCompleted: (state: ActionState) => void;
}) {
  const [, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData);
      onCompleted(result);
      return result;
    },
    IDLE
  );

  const archived = item.archivedAt !== null;

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      {/* Not gated: archiving is reversible in one click and destroys nothing
          (rule 9 reserves gates for destructive and money-restating acts). */}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid={archived ? "row-restore" : "row-archive"}
      >
        {archived ? "Restore" : "Archive"}
      </Button>
    </form>
  );
}

/**
 * Delete is offered on every row, including referenced ones.
 *
 * Deliberate: AC4 wants the attempt BLOCKED WITH THE REFERENCE COUNT and Archive
 * offered. Hiding the button on a referenced row would leave the agent hunting
 * for a delete that silently is not there, and would teach them nothing about
 * why. The refusal is the feature — and it is the server's, not this button's.
 *
 * Gated `checked`, not `typed`: gate.ts draws that line at reversibility, and a
 * delete here is only ever permitted at reference count zero. Making someone
 * type "Condo" to remove an unused row they added by mistake is ceremony, and
 * ceremony is what teaches people to stop reading gates.
 */
function DeleteButton({
  entity,
  item,
  action,
  onCompleted,
}: {
  entity: ListEntity;
  item: ListItem;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  onCompleted: (state: ActionState) => void;
}) {
  const referenced = item.referenceCount > 0;

  return (
    <ConfirmGate
      testId="row-delete-gate"
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${item.name}`}
          data-testid="row-delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      }
      title={`Delete ${item.name}?`}
      description={
        referenced
          ? `${item.name} is used by ${item.referenceCount} ${
              item.referenceCount === 1 ? "deal" : "deals"
            }. Deleting it is not possible — archive it instead.`
          : `This removes ${item.name} from your ${LIST_ENTITY_LABELS[entity]} list for good. Nothing uses it, so nothing else changes.`
      }
      consequence={
        referenced
          ? "This will be refused, and the attempt is recorded in your audit log."
          : undefined
      }
      gate={{ mode: "checked" }}
      confirmLabel="Delete"
      destructive
      action={async (previous, formData) => {
        const result = await action(previous, formData);
        onCompleted(result);
        return result;
      }}
    >
      <input type="hidden" name="id" value={item.id} />
    </ConfirmGate>
  );
}
