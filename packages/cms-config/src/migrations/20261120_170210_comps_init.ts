import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_comps_locations_kind" AS ENUM('Subdivision', 'Zone');
  CREATE TYPE "public"."enum_comps_property_types_form" AS ENUM('lot', 'house', 'condo');
  CREATE TYPE "public"."enum_comps_property_types_category" AS ENUM('Residential', 'Commercial', 'Industrial', 'Agricultural');
  CREATE TYPE "public"."enum_comps_deals_view" AS ENUM('Ridge view');
  CREATE TYPE "public"."enum_comps_deals_terrain" AS ENUM('Flat', 'Sloped', 'Irregular');
  CREATE TYPE "public"."enum_comps_deals_cond" AS ENUM('Brand new', 'Good', 'Needs repair');
  CREATE TYPE "public"."enum_comps_deals_furn" AS ENUM('Furnished', 'Semi-furnished', 'Unfurnished');
  CREATE TYPE "public"."enum_comps_deals_park_incl" AS ENUM('Included', 'Separate');
  CREATE TYPE "public"."enum_comps_deals_fin" AS ENUM('Cash', 'Bank loan', 'Pag-IBIG', 'In-house or developer financing', 'Other');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'comps-admin';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'compsPurgeTrash';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'compsPurgeTrash';
  CREATE TABLE "comps_locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_comps_locations_kind" DEFAULT 'Subdivision' NOT NULL,
  	"lat" numeric NOT NULL,
  	"lng" numeric NOT NULL,
  	"hidden" boolean DEFAULT false NOT NULL,
  	"sort_order" numeric NOT NULL,
  	"created_by_id" integer,
  	"edited_by_id" integer,
  	"edited_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comps_property_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"form" "enum_comps_property_types_form" DEFAULT 'lot' NOT NULL,
  	"category" "enum_comps_property_types_category" DEFAULT 'Residential' NOT NULL,
  	"hidden" boolean DEFAULT false NOT NULL,
  	"sort_order" numeric NOT NULL,
  	"created_by_id" integer,
  	"edited_by_id" integer,
  	"edited_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comps_deals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"location_id" integer,
  	"legacy_location_name" varchar,
  	"property_type_id" integer,
  	"legacy_type_name" varchar,
  	"area" numeric NOT NULL,
  	"lot_area" numeric,
  	"price" numeric NOT NULL,
  	"date_sold" varchar NOT NULL,
  	"lat" numeric NOT NULL,
  	"lng" numeric NOT NULL,
  	"details" varchar,
  	"code" varchar,
  	"link" varchar,
  	"note" varchar,
  	"frontage" numeric,
  	"corner" boolean DEFAULT false NOT NULL,
  	"view" "enum_comps_deals_view",
  	"terrain" "enum_comps_deals_terrain",
  	"cond" "enum_comps_deals_cond",
  	"year_built" numeric,
  	"storeys" numeric,
  	"floor" numeric,
  	"furn" "enum_comps_deals_furn",
  	"park_incl" "enum_comps_deals_park_incl",
  	"beds" numeric,
  	"baths" numeric,
  	"parking" numeric,
  	"fin" "enum_comps_deals_fin",
  	"asking" numeric,
  	"dom" numeric,
  	"created_by_id" integer,
  	"edited_by_id" integer,
  	"edited_at" timestamp(3) with time zone,
  	"deleted_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comps_locations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comps_property_types_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comps_deals_id" integer;
  ALTER TABLE "comps_locations" ADD CONSTRAINT "comps_locations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_locations" ADD CONSTRAINT "comps_locations_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_property_types" ADD CONSTRAINT "comps_property_types_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_property_types" ADD CONSTRAINT "comps_property_types_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_deals" ADD CONSTRAINT "comps_deals_location_id_comps_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."comps_locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_deals" ADD CONSTRAINT "comps_deals_property_type_id_comps_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."comps_property_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_deals" ADD CONSTRAINT "comps_deals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_deals" ADD CONSTRAINT "comps_deals_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comps_deals" ADD CONSTRAINT "comps_deals_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "comps_locations_sort_order_idx" ON "comps_locations" USING btree ("sort_order");
  CREATE INDEX "comps_locations_created_by_idx" ON "comps_locations" USING btree ("created_by_id");
  CREATE INDEX "comps_locations_edited_by_idx" ON "comps_locations" USING btree ("edited_by_id");
  CREATE INDEX "comps_locations_updated_at_idx" ON "comps_locations" USING btree ("updated_at");
  CREATE INDEX "comps_locations_created_at_idx" ON "comps_locations" USING btree ("created_at");
  CREATE INDEX "comps_property_types_sort_order_idx" ON "comps_property_types" USING btree ("sort_order");
  CREATE INDEX "comps_property_types_created_by_idx" ON "comps_property_types" USING btree ("created_by_id");
  CREATE INDEX "comps_property_types_edited_by_idx" ON "comps_property_types" USING btree ("edited_by_id");
  CREATE INDEX "comps_property_types_updated_at_idx" ON "comps_property_types" USING btree ("updated_at");
  CREATE INDEX "comps_property_types_created_at_idx" ON "comps_property_types" USING btree ("created_at");
  CREATE INDEX "comps_deals_location_idx" ON "comps_deals" USING btree ("location_id");
  CREATE INDEX "comps_deals_property_type_idx" ON "comps_deals" USING btree ("property_type_id");
  CREATE INDEX "comps_deals_date_sold_idx" ON "comps_deals" USING btree ("date_sold");
  CREATE INDEX "comps_deals_created_by_idx" ON "comps_deals" USING btree ("created_by_id");
  CREATE INDEX "comps_deals_edited_by_idx" ON "comps_deals" USING btree ("edited_by_id");
  CREATE INDEX "comps_deals_deleted_by_idx" ON "comps_deals" USING btree ("deleted_by_id");
  CREATE INDEX "comps_deals_updated_at_idx" ON "comps_deals" USING btree ("updated_at");
  CREATE INDEX "comps_deals_created_at_idx" ON "comps_deals" USING btree ("created_at");
  CREATE INDEX "comps_deals_deleted_at_idx" ON "comps_deals" USING btree ("deleted_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comps_locations_fk" FOREIGN KEY ("comps_locations_id") REFERENCES "public"."comps_locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comps_property_types_fk" FOREIGN KEY ("comps_property_types_id") REFERENCES "public"."comps_property_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comps_deals_fk" FOREIGN KEY ("comps_deals_id") REFERENCES "public"."comps_deals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_comps_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("comps_locations_id");
  CREATE INDEX "payload_locked_documents_rels_comps_property_types_id_idx" ON "payload_locked_documents_rels" USING btree ("comps_property_types_id");
  CREATE INDEX "payload_locked_documents_rels_comps_deals_id_idx" ON "payload_locked_documents_rels" USING btree ("comps_deals_id");`)

  /**
   * Hand-written: Zeta Comps database-level rules (app PRD DATA-001, §13.2). Payload's schema
   * diff does not model these, so they live only here. The ordered validation with UI copy
   * (§8.6.3) runs in apps/comps; these are the backstop if anything else writes.
   */
  await db.execute(sql`
  CREATE UNIQUE INDEX "comps_locations_name_lower_uq" ON "comps_locations" (lower("name"));
  CREATE UNIQUE INDEX "comps_property_types_name_lower_uq" ON "comps_property_types" (lower("name"));
  ALTER TABLE "comps_locations"
    ADD CONSTRAINT "comps_locations_name_len" CHECK (char_length(btrim("name")) BETWEEN 2 AND 60),
    ADD CONSTRAINT "comps_locations_lat_cdo" CHECK ("lat" BETWEEN 8.2 AND 8.8),
    ADD CONSTRAINT "comps_locations_lng_cdo" CHECK ("lng" BETWEEN 124.3 AND 125.0);
  ALTER TABLE "comps_property_types"
    ADD CONSTRAINT "comps_property_types_name_len" CHECK (char_length(btrim("name")) BETWEEN 2 AND 40);
  ALTER TABLE "comps_deals"
    ADD CONSTRAINT "comps_deals_one_location" CHECK (("location_id" IS NULL) <> ("legacy_location_name" IS NULL)),
    ADD CONSTRAINT "comps_deals_one_type" CHECK (("property_type_id" IS NULL) <> ("legacy_type_name" IS NULL)),
    ADD CONSTRAINT "comps_deals_area" CHECK ("area" BETWEEN 10 AND 1000000),
    ADD CONSTRAINT "comps_deals_lot_area" CHECK ("lot_area" IS NULL OR "lot_area" BETWEEN 10 AND 1000000),
    ADD CONSTRAINT "comps_deals_price_whole" CHECK ("price" > 0 AND "price" = trunc("price")),
    ADD CONSTRAINT "comps_deals_price_per_sqm" CHECK ("price" / "area" BETWEEN 100 AND 1000000),
    ADD CONSTRAINT "comps_deals_date_sold" CHECK ("date_sold" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "date_sold" >= '2000-01-01'),
    ADD CONSTRAINT "comps_deals_lat_cdo" CHECK ("lat" BETWEEN 8.2 AND 8.8),
    ADD CONSTRAINT "comps_deals_lng_cdo" CHECK ("lng" BETWEEN 124.3 AND 125.0),
    ADD CONSTRAINT "comps_deals_code_chars" CHECK ("code" IS NULL OR "code" ~ '^[A-Z0-9-]+$'),
    ADD CONSTRAINT "comps_deals_link_http" CHECK ("link" IS NULL OR "link" ~* '^https?://'),
    ADD CONSTRAINT "comps_deals_frontage" CHECK ("frontage" IS NULL OR "frontage" BETWEEN 1 AND 2000),
    ADD CONSTRAINT "comps_deals_year_built" CHECK ("year_built" IS NULL OR "year_built" BETWEEN 1900 AND 2100),
    ADD CONSTRAINT "comps_deals_floor" CHECK ("floor" IS NULL OR "floor" BETWEEN 1 AND 100),
    ADD CONSTRAINT "comps_deals_beds" CHECK ("beds" IS NULL OR "beds" BETWEEN 0 AND 5),
    ADD CONSTRAINT "comps_deals_baths" CHECK ("baths" IS NULL OR "baths" BETWEEN 1 AND 5),
    ADD CONSTRAINT "comps_deals_parking" CHECK ("parking" IS NULL OR "parking" BETWEEN 0 AND 3),
    ADD CONSTRAINT "comps_deals_storeys" CHECK ("storeys" IS NULL OR "storeys" BETWEEN 1 AND 4),
    ADD CONSTRAINT "comps_deals_asking_whole" CHECK ("asking" IS NULL OR ("asking" = trunc("asking") AND "asking" * 2 >= "price")),
    ADD CONSTRAINT "comps_deals_dom" CHECK ("dom" IS NULL OR "dom" BETWEEN 0 AND 3650);
  -- Duplicate check (§8.6.3 #12): same location + normalised details + price among live deals.
  CREATE INDEX "comps_deals_dup_check_idx" ON "comps_deals"
    ("location_id", lower(regexp_replace("details", '[^a-zA-Z0-9]', '', 'g')), "price")
    WHERE "deleted_at" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Generated by Payload; constraint drops made IF EXISTS because DROP TABLE ... CASCADE above
  // already removes them. Remove any comps-admin users before rolling back (the role enum shrinks).
  await db.execute(sql`
   ALTER TABLE "comps_locations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "comps_property_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "comps_deals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "comps_locations" CASCADE;
  DROP TABLE "comps_property_types" CASCADE;
  DROP TABLE "comps_deals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_comps_locations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_comps_property_types_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_comps_deals_fk";
  
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'respacioSync');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'respacioSync');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_comps_locations_id_idx";
  DROP INDEX "payload_locked_documents_rels_comps_property_types_id_idx";
  DROP INDEX "payload_locked_documents_rels_comps_deals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comps_locations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comps_property_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comps_deals_id";
  DROP TYPE "public"."enum_comps_locations_kind";
  DROP TYPE "public"."enum_comps_property_types_form";
  DROP TYPE "public"."enum_comps_property_types_category";
  DROP TYPE "public"."enum_comps_deals_view";
  DROP TYPE "public"."enum_comps_deals_terrain";
  DROP TYPE "public"."enum_comps_deals_cond";
  DROP TYPE "public"."enum_comps_deals_furn";
  DROP TYPE "public"."enum_comps_deals_park_incl";
  DROP TYPE "public"."enum_comps_deals_fin";`)
}
