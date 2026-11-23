import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_blocks_home_cta_image_side" AS ENUM('left', 'right');
  CREATE TYPE "cms"."enum__pages_v_blocks_home_cta_image_side" AS ENUM('left', 'right');
  CREATE TABLE "cms"."pages_blocks_home_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Your Ultimate Real Estate Resource in the Philippines',
  	"background_image_id" integer,
  	"background_video_url" varchar,
  	"presenter_name" varchar DEFAULT 'Alex Zeta-Guingao',
  	"presenter_tagline" varchar DEFAULT 'Truly Wealthy Realty',
  	"guide_link_label" varchar DEFAULT 'Learn how to buy in the Philippines',
  	"guide_link_url" varchar DEFAULT '/buy/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'What our clients say',
  	"intro" varchar DEFAULT 'Zeta clients are always a top priority. Here’s what they have to say.',
  	"more_link_label" varchar DEFAULT 'View more reviews',
  	"more_link_url" varchar DEFAULT '/about-us/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Award winning track record',
  	"intro" varchar DEFAULT 'Elevating the standard of real estate practice in the Philippines. Showcasing our success in Philippine real estate.',
  	"more_link_label" varchar DEFAULT 'More about the Zeta Group',
  	"more_link_url" varchar DEFAULT '/about-us/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_locations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'City Guide',
  	"intro" varchar DEFAULT 'Virtually search through the key cities in the Philippines to find the right property for you.',
  	"more_link_label" varchar DEFAULT 'View More Locations',
  	"more_link_url" varchar DEFAULT '/location/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Sell with confidence.',
  	"text" varchar,
  	"image_id" integer,
  	"image_side" "cms"."enum_pages_blocks_home_cta_image_side" DEFAULT 'left',
  	"button_label" varchar DEFAULT 'Get Started',
  	"button_url" varchar DEFAULT '/sell/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_shortlists" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Interesting Properties you might like',
  	"intro" varchar DEFAULT 'Carefully curated properties in the Philippines that will resonate with you.',
  	"more_link_label" varchar DEFAULT 'View More Shortlists',
  	"more_link_url" varchar DEFAULT '/shortlist-page/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Featured Content',
  	"intro" varchar DEFAULT 'Real estate information at your fingertips. Alex, an expert real estate broker and consultant in the Philippines will help you understand the ins and outs of the Philippine real estate process through her hand-picked and easy-to-follow content.',
  	"more_link_label" varchar DEFAULT 'View More blogs',
  	"more_link_url" varchar DEFAULT '/insights/',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_home_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'FAQ',
  	"intro" varchar DEFAULT 'Got questions? We’ve got answers. Learn everything you need to know about the Philippine real estate process in our comprehensive FAQ section.',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"testimonials_id" integer,
  	"locations_id" integer,
  	"shortlists_id" integer,
  	"posts_id" integer,
  	"shorts_id" integer
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Your Ultimate Real Estate Resource in the Philippines',
  	"background_image_id" integer,
  	"background_video_url" varchar,
  	"presenter_name" varchar DEFAULT 'Alex Zeta-Guingao',
  	"presenter_tagline" varchar DEFAULT 'Truly Wealthy Realty',
  	"guide_link_label" varchar DEFAULT 'Learn how to buy in the Philippines',
  	"guide_link_url" varchar DEFAULT '/buy/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'What our clients say',
  	"intro" varchar DEFAULT 'Zeta clients are always a top priority. Here’s what they have to say.',
  	"more_link_label" varchar DEFAULT 'View more reviews',
  	"more_link_url" varchar DEFAULT '/about-us/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Award winning track record',
  	"intro" varchar DEFAULT 'Elevating the standard of real estate practice in the Philippines. Showcasing our success in Philippine real estate.',
  	"more_link_label" varchar DEFAULT 'More about the Zeta Group',
  	"more_link_url" varchar DEFAULT '/about-us/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_locations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'City Guide',
  	"intro" varchar DEFAULT 'Virtually search through the key cities in the Philippines to find the right property for you.',
  	"more_link_label" varchar DEFAULT 'View More Locations',
  	"more_link_url" varchar DEFAULT '/location/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Sell with confidence.',
  	"text" varchar,
  	"image_id" integer,
  	"image_side" "cms"."enum__pages_v_blocks_home_cta_image_side" DEFAULT 'left',
  	"button_label" varchar DEFAULT 'Get Started',
  	"button_url" varchar DEFAULT '/sell/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_shortlists" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Interesting Properties you might like',
  	"intro" varchar DEFAULT 'Carefully curated properties in the Philippines that will resonate with you.',
  	"more_link_label" varchar DEFAULT 'View More Shortlists',
  	"more_link_url" varchar DEFAULT '/shortlist-page/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'Featured Content',
  	"intro" varchar DEFAULT 'Real estate information at your fingertips. Alex, an expert real estate broker and consultant in the Philippines will help you understand the ins and outs of the Philippine real estate process through her hand-picked and easy-to-follow content.',
  	"more_link_label" varchar DEFAULT 'View More blogs',
  	"more_link_url" varchar DEFAULT '/insights/',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar DEFAULT 'FAQ',
  	"intro" varchar DEFAULT 'Got questions? We’ve got answers. Learn everything you need to know about the Philippine real estate process in our comprehensive FAQ section.',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"testimonials_id" integer,
  	"locations_id" integer,
  	"shortlists_id" integer,
  	"posts_id" integer,
  	"shorts_id" integer
  );
  
  ALTER TABLE "cms"."pages_blocks_home_hero" ADD CONSTRAINT "pages_blocks_home_hero_background_image_id_media_id_fk" FOREIGN KEY ("background_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_hero" ADD CONSTRAINT "pages_blocks_home_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_testimonials" ADD CONSTRAINT "pages_blocks_home_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_stats_items" ADD CONSTRAINT "pages_blocks_home_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_home_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_stats" ADD CONSTRAINT "pages_blocks_home_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_locations" ADD CONSTRAINT "pages_blocks_home_locations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_cta" ADD CONSTRAINT "pages_blocks_home_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_cta" ADD CONSTRAINT "pages_blocks_home_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_shortlists" ADD CONSTRAINT "pages_blocks_home_shortlists_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_content" ADD CONSTRAINT "pages_blocks_home_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_faq_items" ADD CONSTRAINT "pages_blocks_home_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_home_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_home_faq" ADD CONSTRAINT "pages_blocks_home_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "cms"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "cms"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_shortlists_fk" FOREIGN KEY ("shortlists_id") REFERENCES "cms"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "cms"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_rels" ADD CONSTRAINT "pages_rels_shorts_fk" FOREIGN KEY ("shorts_id") REFERENCES "cms"."shorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" ADD CONSTRAINT "_pages_v_blocks_home_hero_background_image_id_media_id_fk" FOREIGN KEY ("background_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" ADD CONSTRAINT "_pages_v_blocks_home_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_testimonials" ADD CONSTRAINT "_pages_v_blocks_home_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_stats_items" ADD CONSTRAINT "_pages_v_blocks_home_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_home_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_stats" ADD CONSTRAINT "_pages_v_blocks_home_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_locations" ADD CONSTRAINT "_pages_v_blocks_home_locations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_cta" ADD CONSTRAINT "_pages_v_blocks_home_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_cta" ADD CONSTRAINT "_pages_v_blocks_home_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_shortlists" ADD CONSTRAINT "_pages_v_blocks_home_shortlists_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_content" ADD CONSTRAINT "_pages_v_blocks_home_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_faq_items" ADD CONSTRAINT "_pages_v_blocks_home_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_home_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_faq" ADD CONSTRAINT "_pages_v_blocks_home_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "cms"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "cms"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_shortlists_fk" FOREIGN KEY ("shortlists_id") REFERENCES "cms"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "cms"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_shorts_fk" FOREIGN KEY ("shorts_id") REFERENCES "cms"."shorts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_home_hero_order_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_hero_parent_id_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_hero_path_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_hero_background_image_idx" ON "cms"."pages_blocks_home_hero" USING btree ("background_image_id");
  CREATE INDEX "pages_blocks_home_testimonials_order_idx" ON "cms"."pages_blocks_home_testimonials" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_testimonials_parent_id_idx" ON "cms"."pages_blocks_home_testimonials" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_testimonials_path_idx" ON "cms"."pages_blocks_home_testimonials" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_stats_items_order_idx" ON "cms"."pages_blocks_home_stats_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_stats_items_parent_id_idx" ON "cms"."pages_blocks_home_stats_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_stats_order_idx" ON "cms"."pages_blocks_home_stats" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_stats_parent_id_idx" ON "cms"."pages_blocks_home_stats" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_stats_path_idx" ON "cms"."pages_blocks_home_stats" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_locations_order_idx" ON "cms"."pages_blocks_home_locations" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_locations_parent_id_idx" ON "cms"."pages_blocks_home_locations" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_locations_path_idx" ON "cms"."pages_blocks_home_locations" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_cta_order_idx" ON "cms"."pages_blocks_home_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_cta_parent_id_idx" ON "cms"."pages_blocks_home_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_cta_path_idx" ON "cms"."pages_blocks_home_cta" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_cta_image_idx" ON "cms"."pages_blocks_home_cta" USING btree ("image_id");
  CREATE INDEX "pages_blocks_home_shortlists_order_idx" ON "cms"."pages_blocks_home_shortlists" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_shortlists_parent_id_idx" ON "cms"."pages_blocks_home_shortlists" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_shortlists_path_idx" ON "cms"."pages_blocks_home_shortlists" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_content_order_idx" ON "cms"."pages_blocks_home_content" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_content_parent_id_idx" ON "cms"."pages_blocks_home_content" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_content_path_idx" ON "cms"."pages_blocks_home_content" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_faq_items_order_idx" ON "cms"."pages_blocks_home_faq_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_faq_items_parent_id_idx" ON "cms"."pages_blocks_home_faq_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_faq_order_idx" ON "cms"."pages_blocks_home_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_faq_parent_id_idx" ON "cms"."pages_blocks_home_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_faq_path_idx" ON "cms"."pages_blocks_home_faq" USING btree ("_path");
  CREATE INDEX "pages_rels_order_idx" ON "cms"."pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "cms"."pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "cms"."pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_testimonials_id_idx" ON "cms"."pages_rels" USING btree ("testimonials_id");
  CREATE INDEX "pages_rels_locations_id_idx" ON "cms"."pages_rels" USING btree ("locations_id");
  CREATE INDEX "pages_rels_shortlists_id_idx" ON "cms"."pages_rels" USING btree ("shortlists_id");
  CREATE INDEX "pages_rels_posts_id_idx" ON "cms"."pages_rels" USING btree ("posts_id");
  CREATE INDEX "pages_rels_shorts_id_idx" ON "cms"."pages_rels" USING btree ("shorts_id");
  CREATE INDEX "_pages_v_blocks_home_hero_order_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_hero_parent_id_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_hero_path_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_hero_background_image_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("background_image_id");
  CREATE INDEX "_pages_v_blocks_home_testimonials_order_idx" ON "cms"."_pages_v_blocks_home_testimonials" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_testimonials_parent_id_idx" ON "cms"."_pages_v_blocks_home_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_testimonials_path_idx" ON "cms"."_pages_v_blocks_home_testimonials" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_stats_items_order_idx" ON "cms"."_pages_v_blocks_home_stats_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_stats_items_parent_id_idx" ON "cms"."_pages_v_blocks_home_stats_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_stats_order_idx" ON "cms"."_pages_v_blocks_home_stats" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_stats_parent_id_idx" ON "cms"."_pages_v_blocks_home_stats" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_stats_path_idx" ON "cms"."_pages_v_blocks_home_stats" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_locations_order_idx" ON "cms"."_pages_v_blocks_home_locations" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_locations_parent_id_idx" ON "cms"."_pages_v_blocks_home_locations" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_locations_path_idx" ON "cms"."_pages_v_blocks_home_locations" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_cta_order_idx" ON "cms"."_pages_v_blocks_home_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_cta_parent_id_idx" ON "cms"."_pages_v_blocks_home_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_cta_path_idx" ON "cms"."_pages_v_blocks_home_cta" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_cta_image_idx" ON "cms"."_pages_v_blocks_home_cta" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_home_shortlists_order_idx" ON "cms"."_pages_v_blocks_home_shortlists" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_shortlists_parent_id_idx" ON "cms"."_pages_v_blocks_home_shortlists" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_shortlists_path_idx" ON "cms"."_pages_v_blocks_home_shortlists" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_content_order_idx" ON "cms"."_pages_v_blocks_home_content" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_content_parent_id_idx" ON "cms"."_pages_v_blocks_home_content" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_content_path_idx" ON "cms"."_pages_v_blocks_home_content" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_faq_items_order_idx" ON "cms"."_pages_v_blocks_home_faq_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_faq_items_parent_id_idx" ON "cms"."_pages_v_blocks_home_faq_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_faq_order_idx" ON "cms"."_pages_v_blocks_home_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_faq_parent_id_idx" ON "cms"."_pages_v_blocks_home_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_faq_path_idx" ON "cms"."_pages_v_blocks_home_faq" USING btree ("_path");
  CREATE INDEX "_pages_v_rels_order_idx" ON "cms"."_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "cms"."_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "cms"."_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_testimonials_id_idx" ON "cms"."_pages_v_rels" USING btree ("testimonials_id");
  CREATE INDEX "_pages_v_rels_locations_id_idx" ON "cms"."_pages_v_rels" USING btree ("locations_id");
  CREATE INDEX "_pages_v_rels_shortlists_id_idx" ON "cms"."_pages_v_rels" USING btree ("shortlists_id");
  CREATE INDEX "_pages_v_rels_posts_id_idx" ON "cms"."_pages_v_rels" USING btree ("posts_id");
  CREATE INDEX "_pages_v_rels_shorts_id_idx" ON "cms"."_pages_v_rels" USING btree ("shorts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."pages_blocks_home_hero" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_testimonials" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_stats_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_stats" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_locations" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_cta" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_shortlists" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_content" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_faq_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_home_faq" CASCADE;
  DROP TABLE "cms"."pages_rels" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_hero" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_testimonials" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_stats_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_stats" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_locations" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_cta" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_shortlists" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_content" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_faq_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_faq" CASCADE;
  DROP TABLE "cms"."_pages_v_rels" CASCADE;
  DROP TYPE "cms"."enum_pages_blocks_home_cta_image_side";
  DROP TYPE "cms"."enum__pages_v_blocks_home_cta_image_side";`)
}
