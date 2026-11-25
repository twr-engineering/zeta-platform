import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."crm_state" ADD COLUMN "sync_cursor" jsonb;
  ALTER TABLE "cms"."crm_state" ADD COLUMN "last_step_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."crm_state" DROP COLUMN "sync_cursor";
  ALTER TABLE "cms"."crm_state" DROP COLUMN "last_step_at";`)
}
