import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."locations_guide_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"body" jsonb
  );
  
  CREATE TABLE "cms"."_locations_v_version_guide_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"body" jsonb,
  	"_uuid" varchar
  );
  
  ALTER TABLE "cms"."locations" ADD COLUMN "guide_heading" varchar;
  ALTER TABLE "cms"."locations" ADD COLUMN "new_development" boolean DEFAULT false;
  ALTER TABLE "cms"."_locations_v" ADD COLUMN "version_guide_heading" varchar;
  ALTER TABLE "cms"."_locations_v" ADD COLUMN "version_new_development" boolean DEFAULT false;
  ALTER TABLE "cms"."posts" ADD COLUMN "crm_location_tree" varchar;
  ALTER TABLE "cms"."_posts_v" ADD COLUMN "version_crm_location_tree" varchar;
  ALTER TABLE "cms"."locations_guide_tabs" ADD CONSTRAINT "locations_guide_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_locations_v_version_guide_tabs" ADD CONSTRAINT "_locations_v_version_guide_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_locations_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "locations_guide_tabs_order_idx" ON "cms"."locations_guide_tabs" USING btree ("_order");
  CREATE INDEX "locations_guide_tabs_parent_id_idx" ON "cms"."locations_guide_tabs" USING btree ("_parent_id");
  CREATE INDEX "_locations_v_version_guide_tabs_order_idx" ON "cms"."_locations_v_version_guide_tabs" USING btree ("_order");
  CREATE INDEX "_locations_v_version_guide_tabs_parent_id_idx" ON "cms"."_locations_v_version_guide_tabs" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."locations_guide_tabs" CASCADE;
  DROP TABLE "cms"."_locations_v_version_guide_tabs" CASCADE;
  ALTER TABLE "cms"."locations" DROP COLUMN "guide_heading";
  ALTER TABLE "cms"."locations" DROP COLUMN "new_development";
  ALTER TABLE "cms"."_locations_v" DROP COLUMN "version_guide_heading";
  ALTER TABLE "cms"."_locations_v" DROP COLUMN "version_new_development";
  ALTER TABLE "cms"."posts" DROP COLUMN "crm_location_tree";
  ALTER TABLE "cms"."_posts_v" DROP COLUMN "version_crm_location_tree";`)
}
