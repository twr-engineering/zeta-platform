import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_blocks_content_buttons_style" AS ENUM('primary', 'secondary', 'download');
  CREATE TYPE "cms"."enum_pages_blocks_content_media_side" AS ENUM('left', 'right');
  CREATE TYPE "cms"."enum_pages_blocks_content_tone" AS ENUM('plain', 'panel', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_content_buttons_style" AS ENUM('primary', 'secondary', 'download');
  CREATE TYPE "cms"."enum__pages_v_blocks_content_media_side" AS ENUM('left', 'right');
  CREATE TYPE "cms"."enum__pages_v_blocks_content_tone" AS ENUM('plain', 'panel', 'dark');
  CREATE TABLE "cms"."pages_blocks_content_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"style" "cms"."enum_pages_blocks_content_buttons_style" DEFAULT 'primary'
  );
  
  CREATE TABLE "cms"."pages_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"image_id" integer,
  	"video_url" varchar,
  	"media_side" "cms"."enum_pages_blocks_content_media_side" DEFAULT 'right',
  	"tone" "cms"."enum_pages_blocks_content_tone" DEFAULT 'plain',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_accordion_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "cms"."pages_blocks_accordion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_tabs_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"body" jsonb
  );
  
  CREATE TABLE "cms"."pages_blocks_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_contact_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"map_address" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"form" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_calculator" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_content_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"style" "cms"."enum__pages_v_blocks_content_buttons_style" DEFAULT 'primary',
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"image_id" integer,
  	"video_url" varchar,
  	"media_side" "cms"."enum__pages_v_blocks_content_media_side" DEFAULT 'right',
  	"tone" "cms"."enum__pages_v_blocks_content_tone" DEFAULT 'plain',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_accordion_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_accordion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_tabs_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"body" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_contact_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"map_address" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"form" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_calculator" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "cms"."pages_blocks_content_buttons" ADD CONSTRAINT "pages_blocks_content_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_content" ADD CONSTRAINT "pages_blocks_content_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_content" ADD CONSTRAINT "pages_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_accordion_items" ADD CONSTRAINT "pages_blocks_accordion_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_accordion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_accordion" ADD CONSTRAINT "pages_blocks_accordion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_tabs_tabs" ADD CONSTRAINT "pages_blocks_tabs_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_tabs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_tabs" ADD CONSTRAINT "pages_blocks_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_contact_details" ADD CONSTRAINT "pages_blocks_contact_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_form" ADD CONSTRAINT "pages_blocks_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_calculator" ADD CONSTRAINT "pages_blocks_calculator_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_content_buttons" ADD CONSTRAINT "_pages_v_blocks_content_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_content" ADD CONSTRAINT "_pages_v_blocks_content_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_content" ADD CONSTRAINT "_pages_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_accordion_items" ADD CONSTRAINT "_pages_v_blocks_accordion_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_accordion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_accordion" ADD CONSTRAINT "_pages_v_blocks_accordion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_tabs_tabs" ADD CONSTRAINT "_pages_v_blocks_tabs_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_tabs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_tabs" ADD CONSTRAINT "_pages_v_blocks_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_contact_details" ADD CONSTRAINT "_pages_v_blocks_contact_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_form" ADD CONSTRAINT "_pages_v_blocks_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_calculator" ADD CONSTRAINT "_pages_v_blocks_calculator_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_content_buttons_order_idx" ON "cms"."pages_blocks_content_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_content_buttons_parent_id_idx" ON "cms"."pages_blocks_content_buttons" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_content_order_idx" ON "cms"."pages_blocks_content" USING btree ("_order");
  CREATE INDEX "pages_blocks_content_parent_id_idx" ON "cms"."pages_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_content_path_idx" ON "cms"."pages_blocks_content" USING btree ("_path");
  CREATE INDEX "pages_blocks_content_image_idx" ON "cms"."pages_blocks_content" USING btree ("image_id");
  CREATE INDEX "pages_blocks_accordion_items_order_idx" ON "cms"."pages_blocks_accordion_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_accordion_items_parent_id_idx" ON "cms"."pages_blocks_accordion_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_accordion_order_idx" ON "cms"."pages_blocks_accordion" USING btree ("_order");
  CREATE INDEX "pages_blocks_accordion_parent_id_idx" ON "cms"."pages_blocks_accordion" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_accordion_path_idx" ON "cms"."pages_blocks_accordion" USING btree ("_path");
  CREATE INDEX "pages_blocks_tabs_tabs_order_idx" ON "cms"."pages_blocks_tabs_tabs" USING btree ("_order");
  CREATE INDEX "pages_blocks_tabs_tabs_parent_id_idx" ON "cms"."pages_blocks_tabs_tabs" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_tabs_order_idx" ON "cms"."pages_blocks_tabs" USING btree ("_order");
  CREATE INDEX "pages_blocks_tabs_parent_id_idx" ON "cms"."pages_blocks_tabs" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_tabs_path_idx" ON "cms"."pages_blocks_tabs" USING btree ("_path");
  CREATE INDEX "pages_blocks_contact_details_order_idx" ON "cms"."pages_blocks_contact_details" USING btree ("_order");
  CREATE INDEX "pages_blocks_contact_details_parent_id_idx" ON "cms"."pages_blocks_contact_details" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_contact_details_path_idx" ON "cms"."pages_blocks_contact_details" USING btree ("_path");
  CREATE INDEX "pages_blocks_form_order_idx" ON "cms"."pages_blocks_form" USING btree ("_order");
  CREATE INDEX "pages_blocks_form_parent_id_idx" ON "cms"."pages_blocks_form" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_form_path_idx" ON "cms"."pages_blocks_form" USING btree ("_path");
  CREATE INDEX "pages_blocks_calculator_order_idx" ON "cms"."pages_blocks_calculator" USING btree ("_order");
  CREATE INDEX "pages_blocks_calculator_parent_id_idx" ON "cms"."pages_blocks_calculator" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_calculator_path_idx" ON "cms"."pages_blocks_calculator" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_content_buttons_order_idx" ON "cms"."_pages_v_blocks_content_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_content_buttons_parent_id_idx" ON "cms"."_pages_v_blocks_content_buttons" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_content_order_idx" ON "cms"."_pages_v_blocks_content" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_content_parent_id_idx" ON "cms"."_pages_v_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_content_path_idx" ON "cms"."_pages_v_blocks_content" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_content_image_idx" ON "cms"."_pages_v_blocks_content" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_accordion_items_order_idx" ON "cms"."_pages_v_blocks_accordion_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_accordion_items_parent_id_idx" ON "cms"."_pages_v_blocks_accordion_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_accordion_order_idx" ON "cms"."_pages_v_blocks_accordion" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_accordion_parent_id_idx" ON "cms"."_pages_v_blocks_accordion" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_accordion_path_idx" ON "cms"."_pages_v_blocks_accordion" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_tabs_tabs_order_idx" ON "cms"."_pages_v_blocks_tabs_tabs" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_tabs_tabs_parent_id_idx" ON "cms"."_pages_v_blocks_tabs_tabs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_tabs_order_idx" ON "cms"."_pages_v_blocks_tabs" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_tabs_parent_id_idx" ON "cms"."_pages_v_blocks_tabs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_tabs_path_idx" ON "cms"."_pages_v_blocks_tabs" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_contact_details_order_idx" ON "cms"."_pages_v_blocks_contact_details" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_contact_details_parent_id_idx" ON "cms"."_pages_v_blocks_contact_details" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_contact_details_path_idx" ON "cms"."_pages_v_blocks_contact_details" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_form_order_idx" ON "cms"."_pages_v_blocks_form" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_form_parent_id_idx" ON "cms"."_pages_v_blocks_form" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_form_path_idx" ON "cms"."_pages_v_blocks_form" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_calculator_order_idx" ON "cms"."_pages_v_blocks_calculator" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_calculator_parent_id_idx" ON "cms"."_pages_v_blocks_calculator" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_calculator_path_idx" ON "cms"."_pages_v_blocks_calculator" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."pages_blocks_content_buttons" CASCADE;
  DROP TABLE "cms"."pages_blocks_content" CASCADE;
  DROP TABLE "cms"."pages_blocks_accordion_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_accordion" CASCADE;
  DROP TABLE "cms"."pages_blocks_tabs_tabs" CASCADE;
  DROP TABLE "cms"."pages_blocks_tabs" CASCADE;
  DROP TABLE "cms"."pages_blocks_contact_details" CASCADE;
  DROP TABLE "cms"."pages_blocks_form" CASCADE;
  DROP TABLE "cms"."pages_blocks_calculator" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_content_buttons" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_content" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_accordion_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_accordion" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_tabs_tabs" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_tabs" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_contact_details" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_form" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_calculator" CASCADE;
  DROP TYPE "cms"."enum_pages_blocks_content_buttons_style";
  DROP TYPE "cms"."enum_pages_blocks_content_media_side";
  DROP TYPE "cms"."enum_pages_blocks_content_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_content_buttons_style";
  DROP TYPE "cms"."enum__pages_v_blocks_content_media_side";
  DROP TYPE "cms"."enum__pages_v_blocks_content_tone";`)
}
