import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."directory" ADD COLUMN "excerpt" varchar;
  ALTER TABLE "cms"."_directory_v" ADD COLUMN "version_excerpt" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."directory" DROP COLUMN "excerpt";
  ALTER TABLE "cms"."_directory_v" DROP COLUMN "version_excerpt";`)
}
