import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."listings" ADD COLUMN "sub_sub_type_id" varchar;
  ALTER TABLE "cms"."listings" ADD COLUMN "sub_sub_type_name" varchar;
  ALTER TABLE "cms"."listings" ADD COLUMN "storeys" numeric;
  ALTER TABLE "cms"."listings" ADD COLUMN "built_year" numeric;
  CREATE INDEX "listings_sub_sub_type_id_idx" ON "cms"."listings" USING btree ("sub_sub_type_id");
  CREATE INDEX "listings_storeys_idx" ON "cms"."listings" USING btree ("storeys");
  CREATE INDEX "listings_built_year_idx" ON "cms"."listings" USING btree ("built_year");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "cms"."listings_sub_sub_type_id_idx";
  DROP INDEX "cms"."listings_storeys_idx";
  DROP INDEX "cms"."listings_built_year_idx";
  ALTER TABLE "cms"."listings" DROP COLUMN "sub_sub_type_id";
  ALTER TABLE "cms"."listings" DROP COLUMN "sub_sub_type_name";
  ALTER TABLE "cms"."listings" DROP COLUMN "storeys";
  ALTER TABLE "cms"."listings" DROP COLUMN "built_year";`)
}
