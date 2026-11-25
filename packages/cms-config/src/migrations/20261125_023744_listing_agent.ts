import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."site_settings" ADD COLUMN "listing_agent_heading" varchar DEFAULT 'Speak to Alex';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "listing_agent_licence" varchar DEFAULT 'Broker License No. 0007755';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "listing_agent_text" varchar DEFAULT 'Leave your details below and Alex will be in touch with you within 24 hours';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "listing_agent_photo_id" integer;
  ALTER TABLE "cms"."site_settings" ADD CONSTRAINT "site_settings_listing_agent_photo_id_media_id_fk" FOREIGN KEY ("listing_agent_photo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_listing_agent_listing_agent_photo_idx" ON "cms"."site_settings" USING btree ("listing_agent_photo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."site_settings" DROP CONSTRAINT "site_settings_listing_agent_photo_id_media_id_fk";
  
  DROP INDEX "cms"."site_settings_listing_agent_listing_agent_photo_idx";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "listing_agent_heading";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "listing_agent_licence";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "listing_agent_text";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "listing_agent_photo_id";`)
}
