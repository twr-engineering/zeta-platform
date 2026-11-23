import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."site_settings" ADD COLUMN "tracking_ga_measurement_id" varchar;
  ALTER TABLE "cms"."site_settings" ADD COLUMN "tracking_meta_pixel_id" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."site_settings" DROP COLUMN "tracking_ga_measurement_id";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "tracking_meta_pixel_id";`)
}
