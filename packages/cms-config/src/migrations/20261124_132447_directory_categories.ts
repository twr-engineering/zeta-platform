import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."directory_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"directory_categories_id" integer
  );
  
  CREATE TABLE "cms"."_directory_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"directory_categories_id" integer
  );
  
  ALTER TABLE "cms"."directory" DROP CONSTRAINT "directory_category_id_directory_categories_id_fk";
  
  ALTER TABLE "cms"."_directory_v" DROP CONSTRAINT "_directory_v_version_category_id_directory_categories_id_fk";
  
  DROP INDEX "cms"."directory_category_idx";
  DROP INDEX "cms"."_directory_v_version_version_category_idx";
  ALTER TABLE "cms"."directory_rels" ADD CONSTRAINT "directory_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."directory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."directory_rels" ADD CONSTRAINT "directory_rels_directory_categories_fk" FOREIGN KEY ("directory_categories_id") REFERENCES "cms"."directory_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_directory_v_rels" ADD CONSTRAINT "_directory_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_directory_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_directory_v_rels" ADD CONSTRAINT "_directory_v_rels_directory_categories_fk" FOREIGN KEY ("directory_categories_id") REFERENCES "cms"."directory_categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "directory_rels_order_idx" ON "cms"."directory_rels" USING btree ("order");
  CREATE INDEX "directory_rels_parent_idx" ON "cms"."directory_rels" USING btree ("parent_id");
  CREATE INDEX "directory_rels_path_idx" ON "cms"."directory_rels" USING btree ("path");
  CREATE INDEX "directory_rels_directory_categories_id_idx" ON "cms"."directory_rels" USING btree ("directory_categories_id");
  CREATE INDEX "_directory_v_rels_order_idx" ON "cms"."_directory_v_rels" USING btree ("order");
  CREATE INDEX "_directory_v_rels_parent_idx" ON "cms"."_directory_v_rels" USING btree ("parent_id");
  CREATE INDEX "_directory_v_rels_path_idx" ON "cms"."_directory_v_rels" USING btree ("path");
  CREATE INDEX "_directory_v_rels_directory_categories_id_idx" ON "cms"."_directory_v_rels" USING btree ("directory_categories_id");
  ALTER TABLE "cms"."directory" DROP COLUMN "category_id";
  ALTER TABLE "cms"."_directory_v" DROP COLUMN "version_category_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."directory_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_directory_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."directory_rels" CASCADE;
  DROP TABLE "cms"."_directory_v_rels" CASCADE;
  ALTER TABLE "cms"."directory" ADD COLUMN "category_id" integer;
  ALTER TABLE "cms"."_directory_v" ADD COLUMN "version_category_id" integer;
  ALTER TABLE "cms"."directory" ADD CONSTRAINT "directory_category_id_directory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "cms"."directory_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_directory_v" ADD CONSTRAINT "_directory_v_version_category_id_directory_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "cms"."directory_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "directory_category_idx" ON "cms"."directory" USING btree ("category_id");
  CREATE INDEX "_directory_v_version_version_category_idx" ON "cms"."_directory_v" USING btree ("version_category_id");`)
}
