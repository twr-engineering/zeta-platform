import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."site_settings_main_menu_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."site_settings_main_menu" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."site_settings_explore_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."site_settings_explore_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."site_settings_footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."site_settings_footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL
  );
  
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_facebook" SET DEFAULT 'https://www.facebook.com/RealEstateBrokerAlexZeta';
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_tiktok" SET DEFAULT 'https://www.tiktok.com/@realtoralexzeta';
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_youtube" SET DEFAULT 'https://www.youtube.com/c/RealEstateBrokerAlexZetaGuingao';
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_instagram" SET DEFAULT 'https://www.instagram.com/realtoralexzeta/';
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_linkedin" SET DEFAULT 'https://www.linkedin.com/in/realtoralexzeta';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "header_cta_label" varchar DEFAULT 'Sell with us';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "header_cta_url" varchar DEFAULT '/sell/';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "footer_tagline" varchar DEFAULT 'Zeta Group is the ultimate resource for buyers and sellers of real property in the Philippines.';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "newsletter_heading" varchar DEFAULT 'Get the latest Scoop';
  ALTER TABLE "cms"."site_settings" ADD COLUMN "newsletter_text" varchar DEFAULT 'Join our community for the latest updates about real estate news, new developments, and emerging trends in the Philippines.';
  ALTER TABLE "cms"."site_settings_main_menu_children" ADD CONSTRAINT "site_settings_main_menu_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings_main_menu"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."site_settings_main_menu" ADD CONSTRAINT "site_settings_main_menu_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."site_settings_explore_columns_links" ADD CONSTRAINT "site_settings_explore_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings_explore_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."site_settings_explore_columns" ADD CONSTRAINT "site_settings_explore_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."site_settings_footer_columns_links" ADD CONSTRAINT "site_settings_footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings_footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."site_settings_footer_columns" ADD CONSTRAINT "site_settings_footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_main_menu_children_order_idx" ON "cms"."site_settings_main_menu_children" USING btree ("_order");
  CREATE INDEX "site_settings_main_menu_children_parent_id_idx" ON "cms"."site_settings_main_menu_children" USING btree ("_parent_id");
  CREATE INDEX "site_settings_main_menu_order_idx" ON "cms"."site_settings_main_menu" USING btree ("_order");
  CREATE INDEX "site_settings_main_menu_parent_id_idx" ON "cms"."site_settings_main_menu" USING btree ("_parent_id");
  CREATE INDEX "site_settings_explore_columns_links_order_idx" ON "cms"."site_settings_explore_columns_links" USING btree ("_order");
  CREATE INDEX "site_settings_explore_columns_links_parent_id_idx" ON "cms"."site_settings_explore_columns_links" USING btree ("_parent_id");
  CREATE INDEX "site_settings_explore_columns_order_idx" ON "cms"."site_settings_explore_columns" USING btree ("_order");
  CREATE INDEX "site_settings_explore_columns_parent_id_idx" ON "cms"."site_settings_explore_columns" USING btree ("_parent_id");
  CREATE INDEX "site_settings_footer_columns_links_order_idx" ON "cms"."site_settings_footer_columns_links" USING btree ("_order");
  CREATE INDEX "site_settings_footer_columns_links_parent_id_idx" ON "cms"."site_settings_footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "site_settings_footer_columns_order_idx" ON "cms"."site_settings_footer_columns" USING btree ("_order");
  CREATE INDEX "site_settings_footer_columns_parent_id_idx" ON "cms"."site_settings_footer_columns" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."site_settings_main_menu_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."site_settings_main_menu" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."site_settings_explore_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."site_settings_explore_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."site_settings_footer_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."site_settings_footer_columns" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."site_settings_main_menu_children" CASCADE;
  DROP TABLE "cms"."site_settings_main_menu" CASCADE;
  DROP TABLE "cms"."site_settings_explore_columns_links" CASCADE;
  DROP TABLE "cms"."site_settings_explore_columns" CASCADE;
  DROP TABLE "cms"."site_settings_footer_columns_links" CASCADE;
  DROP TABLE "cms"."site_settings_footer_columns" CASCADE;
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_facebook" DROP DEFAULT;
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_tiktok" DROP DEFAULT;
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_youtube" DROP DEFAULT;
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_instagram" DROP DEFAULT;
  ALTER TABLE "cms"."site_settings" ALTER COLUMN "social_linkedin" DROP DEFAULT;
  ALTER TABLE "cms"."site_settings" DROP COLUMN "header_cta_label";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "header_cta_url";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "footer_tagline";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "newsletter_heading";
  ALTER TABLE "cms"."site_settings" DROP COLUMN "newsletter_text";`)
}
