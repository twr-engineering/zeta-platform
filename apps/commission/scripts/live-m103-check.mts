/**
 * M10.3 live check — the sample-data lifecycle + the event-derived checklist,
 * exercised end-to-end against the hosted DB with a real JWT, then reaped.
 *
 * Follows the zeta-verification-flow ritual: throwaway user, real engine (single
 * source of money truth), delta-residue zero. M10 owns no money — every figure
 * here is M1/M5's engine response; this asserts the lifecycle around it:
 *   · create_deal(is_sample) books a badged sample deal; the receivable + payment
 *     INHERIT is_sample; NET GCI ties to D021's ₱354,591.84.
 *   · the checklist EXCLUDES sample records (rule 10) but ticks on real ones.
 *   · cleanup_sample_data deletes payments → receivable → deal in one transaction,
 *     audit-logged, leaving zero sample rows and NOT touching real data (AC2);
 *     the sample's yield cell is rebuilt away.
 *   · M1's delete protection still blocks a REAL deal that has payments.
 *
 *   node --import ./tests/alias-hooks.mjs scripts/live-m103-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { deriveDeal } from "@/lib/deals/compute";
import { dealRpcArgs } from "@/lib/deals/map";
import { derivePaymentSnapshot } from "@/lib/payments/compute";
import { createPaymentRpcArgs } from "@/lib/payments/map";
import { DEAL_SELECT } from "@/lib/supabase/selects";
import type { DealInput } from "@/lib/deals/schema";
import type { PaymentInput } from "@/lib/payments/schema";
import type { Deal, TaxSettings } from "@/types/entities";

function env() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const e: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
const URL_ = E.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || URL_ === "PLACEHOLDER_PENDING_CREDENTIALS" || !SERVICE || !ANON) {
  console.log("live-m103 — skipped (no live Supabase credentials in .env.local).");
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { db: { schema: "commission" }, auth: { persistSession: false } });
type Client = ReturnType<typeof createClient>;

const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

let uid = "";

async function drain(user: Client, fn: "consume_deal_events" | "consume_payment_events" | "consume_yield_events") {
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await user.rpc(fn, { p_limit: 500 });
    if (error) throw error;
    if (((data as { processed?: number })?.processed ?? 0) === 0) break;
  }
}

async function listId(user: Client, table: "developer" | "property_type" | "lead_source", name: string): Promise<string> {
  const { data } = await user.from(table).select("id,name").ilike("name", name).limit(1);
  return (data?.[0] as { id: string })?.id ?? "";
}

async function recv(user: Client, code: string) {
  const { data, error } = await user
    .from("receivable")
    .select("id,deal_id,deal_code,is_sample,status,total_collectible::text,collected_net::text,balance::text")
    .eq("deal_code", code)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as {
    id: string; deal_id: string; deal_code: string; is_sample: boolean;
    status: string; total_collectible: string; collected_net: string; balance: string | null;
  } | null;
}

async function main() {
  const email = `m103-${Date.now()}@throwaway.test`;
  const password = "throwaway-m103-pw";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  uid = created.data.user!.id;
  const user = createClient(URL_, ANON, { db: { schema: "commission" }, auth: { persistSession: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const taxRow = await user.from("tax_settings").select("*").single();
  const tax = taxRow.data as unknown as TaxSettings;

  // 1. Ensure the D021 reference items (guided setup path), collect ids.
  await user.rpc("create_developer", { p_name: "Abrown Inc.", p_comm_base: "net" });
  await user.rpc("create_property_type", { p_name: "House & Lot", p_vat_rule: "threshold" });
  await user.rpc("create_lead_source", { p_name: "YouTube" });
  const devId = await listId(user, "developer", "Abrown Inc.");
  const ptId = await listId(user, "property_type", "House & Lot");
  const lsId = await listId(user, "lead_source", "YouTube");
  check("D021 references ensured", !!devId && !!ptId && !!lsId);

  // 2. Book the sample deal through the REAL create path with is_sample=true.
  const sampleInput: DealInput = {
    booked_date: "2026-07-10", transaction_type: "sale", deal_type: "developer",
    developer_id: devId, client_name: "Daria & John Salon", representation: "double_ended",
    property_type_id: ptId, lead_source_id: lsId, property_details: "Sample unit — House & Lot",
    mode_of_payment: "bank", list_price: "8000000", force_vat: false,
    commission_basis: "percent", rate_pct: "0.05", fixed_amount: null,
    receipt_issued: true, incentive_billed: "40000", incentive_taxable: "yes",
    referral_out_pct: "0", referral_out_fixed: "0", referral_paid: false,
  };
  const derived = deriveDeal(sampleInput, { property_vat_rule: "threshold", developer_comm_base: "net" }, tax);
  const createdDeal = await user.rpc("create_deal", { ...(dealRpcArgs(sampleInput, derived) as object), p_is_sample: true } as never);
  if (createdDeal.error) throw createdDeal.error;
  const sd = createdDeal.data as { id: string; deal_code: string; net_gci: string; is_sample: boolean };
  check("sample deal booked D001 (real sequence, OQ5)", sd.deal_code === "D001", sd.deal_code);
  check("sample deal is_sample=true", sd.is_sample === true);
  check("sample NET GCI = 354,591.84 (M1 engine)", sd.net_gci === "354591.84", sd.net_gci);

  await drain(user, "consume_deal_events");
  await drain(user, "consume_yield_events");

  // 3. The receivable auto-created and INHERITED is_sample; anchor ties to NET GCI.
  const sr = await recv(user, "D001");
  check("sample receivable exists", !!sr);
  check("receivable inherited is_sample=true", sr?.is_sample === true);
  check("receivable total_collectible = 354,591.84", sr?.total_collectible === "354591.84", sr?.total_collectible);

  // 4. Pin it to the wizard state.
  const linked = await user.rpc("link_sample_deal", { p_deal_id: sd.id });
  check("link_sample_deal ok", (linked.data as { ok?: boolean })?.ok === true);
  const os1 = await user.from("onboarding_state").select("sample_deal_id").single();
  check("onboarding_state.sample_deal_id set", (os1.data as { sample_deal_id: string }).sample_deal_id === sd.id);

  // 5. The optional sample payment (₱50,000 Incentive) via the REAL engine.
  const dealRow = (await user.from("deal").select(DEAL_SELECT).eq("id", sd.id).single()).data as unknown as Deal;
  const payInput: PaymentInput = {
    deal_id: sd.id, payment_date: "2026-07-09", gross_amount: "50000",
    payment_type: "incentive", reference_note: "Sample incentive release",
  };
  const snap = derivePaymentSnapshot(payInput, dealRow, tax);
  check("sample split Net Cash = 45,535.71", snap.split.net_cash === "45535.71", snap.split.net_cash);
  check("sample split Net of VAT = 44,642.86", snap.split.net_of_vat === "44642.86", snap.split.net_of_vat);
  const paid = await user.rpc("create_payment", createPaymentRpcArgs(payInput, snap) as never);
  if (paid.error) throw paid.error;
  check("sample payment created", (paid.data as { ok?: boolean })?.ok === true);
  await drain(user, "consume_payment_events");

  const payRow = await user.from("payment").select("id,is_sample").eq("deal_id", sd.id).single();
  check("payment inherited is_sample=true", (payRow.data as { is_sample: boolean }).is_sample === true);

  const sr2 = await recv(user, "D001");
  check("sample collected = 44,642.86", sr2?.collected_net === "44642.86", sr2?.collected_net);
  check("sample balance = 309,948.98", sr2?.balance === "309948.98", sr2?.balance ?? "null");

  // 6. Checklist EXCLUDES the sample (rule 10): first_deal / first_payment stay null.
  const cl1 = (await user.rpc("get_checklist_state")).data as Record<string, unknown>;
  check("checklist first_deal_at null (sample excluded)", cl1.first_deal_at === null);
  check("checklist first_payment_at null (sample excluded)", cl1.first_payment_at === null);
  check("checklist importer_run_at null", cl1.importer_run_at === null);

  // 7. A REAL (non-sample) deal + payment ticks the checklist; its rows are is_sample=false.
  const realInput: DealInput = { ...sampleInput, deal_type: "resale", developer_id: null, client_name: "Real Client", list_price: "5000000", incentive_billed: "0", incentive_taxable: null, receipt_issued: false };
  const realDerived = deriveDeal(realInput, { property_vat_rule: "threshold", developer_comm_base: null }, tax);
  const realDeal = await user.rpc("create_deal", { ...(dealRpcArgs(realInput, realDerived) as object), p_is_sample: false } as never);
  if (realDeal.error) throw realDeal.error;
  const rd = realDeal.data as { id: string; deal_code: string; is_sample: boolean };
  check("real deal is_sample=false", rd.is_sample === false);
  await drain(user, "consume_deal_events");
  await drain(user, "consume_yield_events");

  const realPayInput: PaymentInput = { deal_id: rd.id, payment_date: "2026-07-12", gross_amount: "100000", payment_type: "commission", reference_note: null };
  const realDealRow = (await user.from("deal").select(DEAL_SELECT).eq("id", rd.id).single()).data as unknown as Deal;
  const realSnap = derivePaymentSnapshot(realPayInput, realDealRow, tax);
  const realPaid = await user.rpc("create_payment", createPaymentRpcArgs(realPayInput, realSnap) as never);
  if (realPaid.error) throw realPaid.error;
  await drain(user, "consume_payment_events");

  const cl2 = (await user.rpc("get_checklist_state")).data as Record<string, unknown>;
  check("checklist first_deal_at set by REAL deal", cl2.first_deal_at !== null);
  check("checklist first_payment_at set by REAL payment", cl2.first_payment_at !== null);

  // 8. M1 delete protection: a REAL deal with a payment cannot be hard-deleted.
  const blocked = await user.rpc("delete_deal", { p_id: rd.id });
  check("M1 delete protection blocks real deal w/ payments", (blocked.data as { reason?: string })?.reason === "has_payments");

  // 9. Cleanup cascade — one transaction, ordered, audited, is_sample-guarded.
  const clean = await user.rpc("cleanup_sample_data");
  if (clean.error) throw clean.error;
  const cr = clean.data as { ok: boolean; deals_deleted: number; receivables_deleted: number; payments_deleted: number };
  check("cleanup ok", cr.ok === true);
  check("cleanup deleted 1 deal / 1 receivable / 1 payment", cr.deals_deleted === 1 && cr.receivables_deleted === 1 && cr.payments_deleted === 1,
    `${cr.deals_deleted}/${cr.receivables_deleted}/${cr.payments_deleted}`);

  // Zero sample rows anywhere.
  const sampleDeals = await user.from("deal").select("id", { count: "exact", head: true }).eq("is_sample", true);
  const sampleRecv = await user.from("receivable").select("id", { count: "exact", head: true }).eq("is_sample", true);
  const samplePays = await user.from("payment").select("id", { count: "exact", head: true }).eq("is_sample", true);
  check("zero sample deals remain", (sampleDeals.count ?? -1) === 0);
  check("zero sample receivables remain", (sampleRecv.count ?? -1) === 0);
  check("zero sample payments remain", (samplePays.count ?? -1) === 0);

  // Audit entry written for the cascade.
  const audit = await user.from("audit_log_entry").select("id,action,field_changes").eq("entity_type", "deal").eq("entity_id", sd.id).eq("action", "delete");
  check("cleanup audit-logged the deal delete", (audit.data?.length ?? 0) >= 1);

  // sample_deal_id cleared.
  const os2 = await user.from("onboarding_state").select("sample_deal_id").single();
  check("onboarding_state.sample_deal_id cleared", (os2.data as { sample_deal_id: string | null }).sample_deal_id === null);

  // REAL data untouched.
  const realStill = await recv(user, rd.deal_code);
  check("REAL receivable untouched (is_sample=false, exists)", !!realStill && realStill.is_sample === false);
  const realDealStill = await user.from("deal").select("id").eq("id", rd.id).maybeSingle();
  check("REAL deal untouched", !!realDealStill.data);

  // Yield residue: the sample's developer/2026 cell had only the sample → gone.
  const devCell = await user.from("yield_aggregate").select("segment,booked_year").eq("segment", "developer").eq("booked_year", 2026);
  check("sample's yield cell rebuilt away (no developer/2026)", (devCell.data?.length ?? 0) === 0);

  // 10. Delete protection still holds post-cleanup.
  const blocked2 = await user.rpc("delete_deal", { p_id: rd.id });
  check("delete protection still blocks real deal after cleanup", (blocked2.data as { reason?: string })?.reason === "has_payments");

  // Checklist after cleanup: first_deal/payment still ticked by REAL rows.
  const cl3 = (await user.rpc("get_checklist_state")).data as Record<string, unknown>;
  check("checklist first_deal_at still set after cleanup", cl3.first_deal_at !== null);
}

try {
  await main();
} catch (e) {
  console.error("THREW:", e);
  fails.push(`threw: ${(e as Error).message}`);
} finally {
  if (uid) {
    await admin.auth.admin.deleteUser(uid);
    // delta-residue: no leftover throwaway users; the membership-delete trigger
    // reaps the workspace (and cascades its onboarding/deal/receivable rows).
    const { data } = await admin.auth.admin.listUsers();
    const leftover = (data?.users ?? []).filter((u) => u.email?.startsWith("m103-"));
    check("delta-residue: zero leftover m103 throwaway users", leftover.length === 0);
  }
}

console.log(fails.length === 0 ? "\nALL GREEN" : `\nFAILED: ${fails.length}\n- ${fails.join("\n- ")}`);
process.exit(fails.length === 0 ? 0 : 1);
