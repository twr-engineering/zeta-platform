import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en');
  CREATE TYPE "public"."enum_locations_type" AS ENUM('region', 'province', 'city', 'municipality', 'barangay', 'subdivision');
  CREATE TYPE "public"."enum_locations_island_group" AS ENUM('luzon', 'visayas', 'mindanao', 'island-destination');
  CREATE TYPE "public"."enum_locations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__locations_v_version_type" AS ENUM('region', 'province', 'city', 'municipality', 'barangay', 'subdivision');
  CREATE TYPE "public"."enum__locations_v_version_island_group" AS ENUM('luzon', 'visayas', 'mindanao', 'island-destination');
  CREATE TYPE "public"."enum__locations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__locations_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_listings_sync_status" AS ENUM('active', 'withdrawn');
  CREATE TYPE "public"."enum_shortlists_query_decoded_property_for" AS ENUM('1', '2');
  CREATE TYPE "public"."enum_shortlists_query_decoded_sale_detail_type" AS ENUM('1', '2');
  CREATE TYPE "public"."enum_shortlists_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__shortlists_v_version_query_decoded_property_for" AS ENUM('1', '2');
  CREATE TYPE "public"."enum__shortlists_v_version_query_decoded_sale_detail_type" AS ENUM('1', '2');
  CREATE TYPE "public"."enum__shortlists_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__shortlists_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_shorts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__shorts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__shorts_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_testimonials_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__testimonials_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__testimonials_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_directory_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__directory_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__directory_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_redirects_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'respacioSync');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'respacioSync');
  CREATE TABLE "locations_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "locations_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"type" "enum_locations_type" DEFAULT 'city',
  	"island_group" "enum_locations_island_group",
  	"crm_geography_province_id" varchar,
  	"crm_geography_municipality_id" varchar,
  	"crm_geography_town_id" varchar,
  	"crm_geography_complex_id" varchar,
  	"crm_geography_complex_name" varchar,
  	"hero_image_id" integer,
  	"intro" jsonb,
  	"content" jsonb,
  	"coordinates_latitude" numeric,
  	"coordinates_longitude" numeric,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"parent_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_locations_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "locations_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "locations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  CREATE TABLE "_locations_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_locations_v_version_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_locations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_type" "enum__locations_v_version_type" DEFAULT 'city',
  	"version_island_group" "enum__locations_v_version_island_group",
  	"version_crm_geography_province_id" varchar,
  	"version_crm_geography_municipality_id" varchar,
  	"version_crm_geography_town_id" varchar,
  	"version_crm_geography_complex_id" varchar,
  	"version_crm_geography_complex_name" varchar,
  	"version_hero_image_id" integer,
  	"version_intro" jsonb,
  	"version_content" jsonb,
  	"version_coordinates_latitude" numeric,
  	"version_coordinates_longitude" numeric,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_parent_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__locations_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__locations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_locations_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_locations_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  CREATE TABLE "listings_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "listings_attributes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"crm_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"group" varchar
  );
  
  CREATE TABLE "listings_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL
  );
  
  CREATE TABLE "listings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"crm_id" varchar,
  	"reference_no" varchar,
  	"property_title" varchar,
  	"description" varchar,
  	"short_description" varchar,
  	"price" numeric,
  	"currency_code" varchar DEFAULT 'PHP',
  	"property_for_id" varchar,
  	"property_for" varchar,
  	"type_name" varchar,
  	"sub_type_id" varchar,
  	"sub_type_name" varchar,
  	"sale_detail_type_id" varchar,
  	"sale_detail_type" varchar,
  	"rent_amount_period" varchar,
  	"priority" numeric DEFAULT 0,
  	"is_featured" boolean,
  	"bedrooms" numeric,
  	"bathrooms" numeric,
  	"built_size" numeric,
  	"plot_size" numeric,
  	"area_unit" varchar,
  	"geo_latitude" numeric,
  	"geo_longitude" numeric,
  	"geo_province_id" varchar,
  	"geo_municipality_id" varchar,
  	"geo_town_id" varchar,
  	"geo_complex_id" varchar,
  	"geo_province_name" varchar,
  	"geo_municipality_name" varchar,
  	"geo_city_name" varchar,
  	"geo_complex_name" varchar,
  	"location_id" integer,
  	"crm_payload" jsonb,
  	"sync_status" "enum_listings_sync_status" DEFAULT 'active',
  	"missed_syncs" numeric DEFAULT 0,
  	"crm_modified_at" timestamp(3) with time zone,
  	"last_synced_at" timestamp(3) with time zone,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "listings_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "shortlists_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "shortlists_query_decoded_sub_type_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "shortlists_query_decoded_feature_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "shortlists" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"saved_query" varchar,
  	"query_decoded_property_for" "enum_shortlists_query_decoded_property_for",
  	"query_decoded_sale_detail_type" "enum_shortlists_query_decoded_sale_detail_type",
  	"query_decoded_min_price" numeric,
  	"query_decoded_max_price" numeric,
  	"query_decoded_sort_by" varchar,
  	"parity_note" varchar,
  	"hero_image_id" integer,
  	"intro" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_shortlists_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "shortlists_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_shortlists_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_shortlists_v_version_query_decoded_sub_type_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_shortlists_v_version_query_decoded_feature_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_shortlists_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_saved_query" varchar,
  	"version_query_decoded_property_for" "enum__shortlists_v_version_query_decoded_property_for",
  	"version_query_decoded_sale_detail_type" "enum__shortlists_v_version_query_decoded_sale_detail_type",
  	"version_query_decoded_min_price" numeric,
  	"version_query_decoded_max_price" numeric,
  	"version_query_decoded_sort_by" varchar,
  	"version_parity_note" varchar,
  	"version_hero_image_id" integer,
  	"version_intro" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__shortlists_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__shortlists_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_shortlists_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "posts_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"hero_image_id" integer,
  	"content" jsonb,
  	"category_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "posts_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "_posts_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_hero_image_id" integer,
  	"version_content" jsonb,
  	"version_category_id" integer,
  	"version_published_at" timestamp(3) with time zone,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__posts_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_posts_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "categories_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "categories_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" integer,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "shorts_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "shorts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"video_url" varchar,
  	"thumbnail_id" integer,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_shorts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "shorts_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_shorts_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_shorts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_video_url" varchar,
  	"version_thumbnail_id" integer,
  	"version_description" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__shorts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__shorts_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_shorts_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__pages_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "testimonials_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "testimonials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_name" varchar,
  	"slug" varchar,
  	"quote" varchar,
  	"category_id" integer,
  	"photo_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_testimonials_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_testimonials_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_testimonials_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_client_name" varchar,
  	"version_slug" varchar,
  	"version_quote" varchar,
  	"version_category_id" integer,
  	"version_photo_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__testimonials_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__testimonials_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "testimonial_categories_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "testimonial_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "directory_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );
  
  CREATE TABLE "directory" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"category_id" integer,
  	"location_id" integer,
  	"description" jsonb,
  	"image_id" integer,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_noindex" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_directory_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "directory_locales" (
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_directory_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_directory_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_category_id" integer,
  	"version_location_id" integer,
  	"version_description" jsonb,
  	"version_image_id" integer,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__directory_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__directory_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_directory_v_locales" (
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "directory_categories_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL
  );
  
  CREATE TABLE "directory_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"crm_path" varchar,
  	"needs_alt_text" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"to_type" "enum_redirects_to_type" DEFAULT 'reference',
  	"to_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "redirects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"posts_id" integer,
  	"locations_id" integer,
  	"shortlists_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"locations_id" integer,
  	"listings_id" integer,
  	"shortlists_id" integer,
  	"posts_id" integer,
  	"categories_id" integer,
  	"tags_id" integer,
  	"shorts_id" integer,
  	"pages_id" integer,
  	"testimonials_id" integer,
  	"testimonial_categories_id" integer,
  	"directory_id" integer,
  	"directory_categories_id" integer,
  	"media_id" integer,
  	"users_id" integer,
  	"redirects_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'Zeta Group',
  	"logo_id" integer,
  	"broker_licence" varchar,
  	"office_address" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"social_facebook" varchar,
  	"social_tiktok" varchar,
  	"social_youtube" varchar,
  	"social_instagram" varchar,
  	"social_linkedin" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "calculator_defaults_term_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"years" numeric NOT NULL
  );
  
  CREATE TABLE "calculator_defaults" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"income_multiple" numeric DEFAULT 0.3 NOT NULL,
  	"default_term_years" numeric DEFAULT 5,
  	"disclaimer" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "crm_state" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"currency_converter" jsonb,
  	"last_sync_at" timestamp(3) with time zone,
  	"last_sync_mode" varchar,
  	"last_sync_result" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "locations_legacy_urls" ADD CONSTRAINT "locations_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_breadcrumbs" ADD CONSTRAINT "locations_breadcrumbs_doc_id_locations_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations_breadcrumbs" ADD CONSTRAINT "locations_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations_locales" ADD CONSTRAINT "locations_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations_locales" ADD CONSTRAINT "locations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_rels" ADD CONSTRAINT "locations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_rels" ADD CONSTRAINT "locations_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_locations_v_version_legacy_urls" ADD CONSTRAINT "_locations_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_locations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_locations_v_version_breadcrumbs" ADD CONSTRAINT "_locations_v_version_breadcrumbs_doc_id_locations_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v_version_breadcrumbs" ADD CONSTRAINT "_locations_v_version_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_locations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_locations_v" ADD CONSTRAINT "_locations_v_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v" ADD CONSTRAINT "_locations_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v" ADD CONSTRAINT "_locations_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v" ADD CONSTRAINT "_locations_v_version_parent_id_locations_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v_locales" ADD CONSTRAINT "_locations_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_locations_v_locales" ADD CONSTRAINT "_locations_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_locations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_locations_v_rels" ADD CONSTRAINT "_locations_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_locations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_locations_v_rels" ADD CONSTRAINT "_locations_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings_images" ADD CONSTRAINT "listings_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings_attributes" ADD CONSTRAINT "listings_attributes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings_features" ADD CONSTRAINT "listings_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listings" ADD CONSTRAINT "listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings" ADD CONSTRAINT "listings_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings_locales" ADD CONSTRAINT "listings_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "listings_locales" ADD CONSTRAINT "listings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shortlists_legacy_urls" ADD CONSTRAINT "shortlists_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shortlists_query_decoded_sub_type_ids" ADD CONSTRAINT "shortlists_query_decoded_sub_type_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shortlists_query_decoded_feature_ids" ADD CONSTRAINT "shortlists_query_decoded_feature_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shortlists_locales" ADD CONSTRAINT "shortlists_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shortlists_locales" ADD CONSTRAINT "shortlists_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shortlists_v_version_legacy_urls" ADD CONSTRAINT "_shortlists_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shortlists_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shortlists_v_version_query_decoded_sub_type_ids" ADD CONSTRAINT "_shortlists_v_version_query_decoded_sub_type_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shortlists_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shortlists_v_version_query_decoded_feature_ids" ADD CONSTRAINT "_shortlists_v_version_query_decoded_feature_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shortlists_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shortlists_v" ADD CONSTRAINT "_shortlists_v_parent_id_shortlists_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shortlists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortlists_v" ADD CONSTRAINT "_shortlists_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortlists_v" ADD CONSTRAINT "_shortlists_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortlists_v_locales" ADD CONSTRAINT "_shortlists_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortlists_v_locales" ADD CONSTRAINT "_shortlists_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shortlists_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_legacy_urls" ADD CONSTRAINT "posts_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_legacy_urls" ADD CONSTRAINT "_posts_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_legacy_urls" ADD CONSTRAINT "categories_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_breadcrumbs" ADD CONSTRAINT "categories_breadcrumbs_doc_id_categories_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_breadcrumbs" ADD CONSTRAINT "categories_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_legacy_urls" ADD CONSTRAINT "tags_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shorts_legacy_urls" ADD CONSTRAINT "shorts_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shorts" ADD CONSTRAINT "shorts_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shorts" ADD CONSTRAINT "shorts_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shorts_locales" ADD CONSTRAINT "shorts_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shorts_locales" ADD CONSTRAINT "shorts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shorts_v_version_legacy_urls" ADD CONSTRAINT "_shorts_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shorts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shorts_v" ADD CONSTRAINT "_shorts_v_parent_id_shorts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shorts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shorts_v" ADD CONSTRAINT "_shorts_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shorts_v" ADD CONSTRAINT "_shorts_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shorts_v_locales" ADD CONSTRAINT "_shorts_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shorts_v_locales" ADD CONSTRAINT "_shorts_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shorts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_legacy_urls" ADD CONSTRAINT "pages_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_legacy_urls" ADD CONSTRAINT "_pages_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "testimonials_legacy_urls" ADD CONSTRAINT "testimonials_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_category_id_testimonial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."testimonial_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_testimonials_v_version_legacy_urls" ADD CONSTRAINT "_testimonials_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_testimonials_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_testimonials_v" ADD CONSTRAINT "_testimonials_v_parent_id_testimonials_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."testimonials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_testimonials_v" ADD CONSTRAINT "_testimonials_v_version_category_id_testimonial_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."testimonial_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_testimonials_v" ADD CONSTRAINT "_testimonials_v_version_photo_id_media_id_fk" FOREIGN KEY ("version_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonial_categories_legacy_urls" ADD CONSTRAINT "testimonial_categories_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."testimonial_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "directory_legacy_urls" ADD CONSTRAINT "directory_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."directory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "directory" ADD CONSTRAINT "directory_category_id_directory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."directory_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "directory" ADD CONSTRAINT "directory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "directory" ADD CONSTRAINT "directory_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "directory" ADD CONSTRAINT "directory_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "directory_locales" ADD CONSTRAINT "directory_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "directory_locales" ADD CONSTRAINT "directory_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."directory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_directory_v_version_legacy_urls" ADD CONSTRAINT "_directory_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_directory_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_directory_v" ADD CONSTRAINT "_directory_v_parent_id_directory_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."directory"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v" ADD CONSTRAINT "_directory_v_version_category_id_directory_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."directory_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v" ADD CONSTRAINT "_directory_v_version_location_id_locations_id_fk" FOREIGN KEY ("version_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v" ADD CONSTRAINT "_directory_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v" ADD CONSTRAINT "_directory_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v_locales" ADD CONSTRAINT "_directory_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_directory_v_locales" ADD CONSTRAINT "_directory_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_directory_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "directory_categories_legacy_urls" ADD CONSTRAINT "directory_categories_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."directory_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_shortlists_fk" FOREIGN KEY ("shortlists_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_listings_fk" FOREIGN KEY ("listings_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shortlists_fk" FOREIGN KEY ("shortlists_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shorts_fk" FOREIGN KEY ("shorts_id") REFERENCES "public"."shorts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonial_categories_fk" FOREIGN KEY ("testimonial_categories_id") REFERENCES "public"."testimonial_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_directory_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."directory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_directory_categories_fk" FOREIGN KEY ("directory_categories_id") REFERENCES "public"."directory_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calculator_defaults_term_options" ADD CONSTRAINT "calculator_defaults_term_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."calculator_defaults"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "locations_legacy_urls_order_idx" ON "locations_legacy_urls" USING btree ("_order");
  CREATE INDEX "locations_legacy_urls_parent_id_idx" ON "locations_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "locations_breadcrumbs_order_idx" ON "locations_breadcrumbs" USING btree ("_order");
  CREATE INDEX "locations_breadcrumbs_parent_id_idx" ON "locations_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "locations_breadcrumbs_locale_idx" ON "locations_breadcrumbs" USING btree ("_locale");
  CREATE INDEX "locations_breadcrumbs_doc_idx" ON "locations_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "locations_slug_idx" ON "locations" USING btree ("slug");
  CREATE INDEX "locations_crm_geography_crm_geography_province_id_idx" ON "locations" USING btree ("crm_geography_province_id");
  CREATE INDEX "locations_crm_geography_crm_geography_municipality_id_idx" ON "locations" USING btree ("crm_geography_municipality_id");
  CREATE INDEX "locations_crm_geography_crm_geography_town_id_idx" ON "locations" USING btree ("crm_geography_town_id");
  CREATE INDEX "locations_crm_geography_crm_geography_complex_id_idx" ON "locations" USING btree ("crm_geography_complex_id");
  CREATE INDEX "locations_hero_image_idx" ON "locations" USING btree ("hero_image_id");
  CREATE INDEX "locations_seo_seo_image_idx" ON "locations" USING btree ("seo_image_id");
  CREATE INDEX "locations_parent_idx" ON "locations" USING btree ("parent_id");
  CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
  CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
  CREATE INDEX "locations__status_idx" ON "locations" USING btree ("_status");
  CREATE INDEX "locations_meta_meta_image_idx" ON "locations_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "locations_locales_locale_parent_id_unique" ON "locations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "locations_rels_order_idx" ON "locations_rels" USING btree ("order");
  CREATE INDEX "locations_rels_parent_idx" ON "locations_rels" USING btree ("parent_id");
  CREATE INDEX "locations_rels_path_idx" ON "locations_rels" USING btree ("path");
  CREATE INDEX "locations_rels_posts_id_idx" ON "locations_rels" USING btree ("posts_id");
  CREATE INDEX "_locations_v_version_legacy_urls_order_idx" ON "_locations_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_locations_v_version_legacy_urls_parent_id_idx" ON "_locations_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_locations_v_version_breadcrumbs_order_idx" ON "_locations_v_version_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_locations_v_version_breadcrumbs_parent_id_idx" ON "_locations_v_version_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "_locations_v_version_breadcrumbs_locale_idx" ON "_locations_v_version_breadcrumbs" USING btree ("_locale");
  CREATE INDEX "_locations_v_version_breadcrumbs_doc_idx" ON "_locations_v_version_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "_locations_v_parent_idx" ON "_locations_v" USING btree ("parent_id");
  CREATE INDEX "_locations_v_version_version_slug_idx" ON "_locations_v" USING btree ("version_slug");
  CREATE INDEX "_locations_v_version_crm_geography_version_crm_geography_idx" ON "_locations_v" USING btree ("version_crm_geography_province_id");
  CREATE INDEX "_locations_v_version_crm_geography_version_crm_geograp_1_idx" ON "_locations_v" USING btree ("version_crm_geography_municipality_id");
  CREATE INDEX "_locations_v_version_crm_geography_version_crm_geograp_2_idx" ON "_locations_v" USING btree ("version_crm_geography_town_id");
  CREATE INDEX "_locations_v_version_crm_geography_version_crm_geograp_3_idx" ON "_locations_v" USING btree ("version_crm_geography_complex_id");
  CREATE INDEX "_locations_v_version_version_hero_image_idx" ON "_locations_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_locations_v_version_seo_version_seo_image_idx" ON "_locations_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_locations_v_version_version_parent_idx" ON "_locations_v" USING btree ("version_parent_id");
  CREATE INDEX "_locations_v_version_version_updated_at_idx" ON "_locations_v" USING btree ("version_updated_at");
  CREATE INDEX "_locations_v_version_version_created_at_idx" ON "_locations_v" USING btree ("version_created_at");
  CREATE INDEX "_locations_v_version_version__status_idx" ON "_locations_v" USING btree ("version__status");
  CREATE INDEX "_locations_v_created_at_idx" ON "_locations_v" USING btree ("created_at");
  CREATE INDEX "_locations_v_updated_at_idx" ON "_locations_v" USING btree ("updated_at");
  CREATE INDEX "_locations_v_snapshot_idx" ON "_locations_v" USING btree ("snapshot");
  CREATE INDEX "_locations_v_published_locale_idx" ON "_locations_v" USING btree ("published_locale");
  CREATE INDEX "_locations_v_latest_idx" ON "_locations_v" USING btree ("latest");
  CREATE INDEX "_locations_v_version_meta_version_meta_image_idx" ON "_locations_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_locations_v_locales_locale_parent_id_unique" ON "_locations_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_locations_v_rels_order_idx" ON "_locations_v_rels" USING btree ("order");
  CREATE INDEX "_locations_v_rels_parent_idx" ON "_locations_v_rels" USING btree ("parent_id");
  CREATE INDEX "_locations_v_rels_path_idx" ON "_locations_v_rels" USING btree ("path");
  CREATE INDEX "_locations_v_rels_posts_id_idx" ON "_locations_v_rels" USING btree ("posts_id");
  CREATE INDEX "listings_images_order_idx" ON "listings_images" USING btree ("_order");
  CREATE INDEX "listings_images_parent_id_idx" ON "listings_images" USING btree ("_parent_id");
  CREATE INDEX "listings_attributes_order_idx" ON "listings_attributes" USING btree ("_order");
  CREATE INDEX "listings_attributes_parent_id_idx" ON "listings_attributes" USING btree ("_parent_id");
  CREATE INDEX "listings_attributes_crm_id_idx" ON "listings_attributes" USING btree ("crm_id");
  CREATE INDEX "listings_features_order_idx" ON "listings_features" USING btree ("_order");
  CREATE INDEX "listings_features_parent_id_idx" ON "listings_features" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "listings_crm_id_idx" ON "listings" USING btree ("crm_id");
  CREATE UNIQUE INDEX "listings_reference_no_idx" ON "listings" USING btree ("reference_no");
  CREATE INDEX "listings_price_idx" ON "listings" USING btree ("price");
  CREATE INDEX "listings_property_for_id_idx" ON "listings" USING btree ("property_for_id");
  CREATE INDEX "listings_sub_type_id_idx" ON "listings" USING btree ("sub_type_id");
  CREATE INDEX "listings_sale_detail_type_id_idx" ON "listings" USING btree ("sale_detail_type_id");
  CREATE INDEX "listings_priority_idx" ON "listings" USING btree ("priority");
  CREATE INDEX "listings_bedrooms_idx" ON "listings" USING btree ("bedrooms");
  CREATE INDEX "listings_bathrooms_idx" ON "listings" USING btree ("bathrooms");
  CREATE INDEX "listings_geo_geo_province_id_idx" ON "listings" USING btree ("geo_province_id");
  CREATE INDEX "listings_geo_geo_municipality_id_idx" ON "listings" USING btree ("geo_municipality_id");
  CREATE INDEX "listings_geo_geo_town_id_idx" ON "listings" USING btree ("geo_town_id");
  CREATE INDEX "listings_geo_geo_complex_id_idx" ON "listings" USING btree ("geo_complex_id");
  CREATE INDEX "listings_location_idx" ON "listings" USING btree ("location_id");
  CREATE INDEX "listings_sync_status_idx" ON "listings" USING btree ("sync_status");
  CREATE INDEX "listings_seo_seo_image_idx" ON "listings" USING btree ("seo_image_id");
  CREATE INDEX "listings_updated_at_idx" ON "listings" USING btree ("updated_at");
  CREATE INDEX "listings_created_at_idx" ON "listings" USING btree ("created_at");
  CREATE INDEX "listings_meta_meta_image_idx" ON "listings_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "listings_locales_locale_parent_id_unique" ON "listings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "shortlists_legacy_urls_order_idx" ON "shortlists_legacy_urls" USING btree ("_order");
  CREATE INDEX "shortlists_legacy_urls_parent_id_idx" ON "shortlists_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "shortlists_query_decoded_sub_type_ids_order_idx" ON "shortlists_query_decoded_sub_type_ids" USING btree ("_order");
  CREATE INDEX "shortlists_query_decoded_sub_type_ids_parent_id_idx" ON "shortlists_query_decoded_sub_type_ids" USING btree ("_parent_id");
  CREATE INDEX "shortlists_query_decoded_feature_ids_order_idx" ON "shortlists_query_decoded_feature_ids" USING btree ("_order");
  CREATE INDEX "shortlists_query_decoded_feature_ids_parent_id_idx" ON "shortlists_query_decoded_feature_ids" USING btree ("_parent_id");
  CREATE INDEX "shortlists_slug_idx" ON "shortlists" USING btree ("slug");
  CREATE INDEX "shortlists_hero_image_idx" ON "shortlists" USING btree ("hero_image_id");
  CREATE INDEX "shortlists_seo_seo_image_idx" ON "shortlists" USING btree ("seo_image_id");
  CREATE INDEX "shortlists_updated_at_idx" ON "shortlists" USING btree ("updated_at");
  CREATE INDEX "shortlists_created_at_idx" ON "shortlists" USING btree ("created_at");
  CREATE INDEX "shortlists__status_idx" ON "shortlists" USING btree ("_status");
  CREATE INDEX "shortlists_meta_meta_image_idx" ON "shortlists_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "shortlists_locales_locale_parent_id_unique" ON "shortlists_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_shortlists_v_version_legacy_urls_order_idx" ON "_shortlists_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_shortlists_v_version_legacy_urls_parent_id_idx" ON "_shortlists_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_shortlists_v_version_query_decoded_sub_type_ids_order_idx" ON "_shortlists_v_version_query_decoded_sub_type_ids" USING btree ("_order");
  CREATE INDEX "_shortlists_v_version_query_decoded_sub_type_ids_parent_id_idx" ON "_shortlists_v_version_query_decoded_sub_type_ids" USING btree ("_parent_id");
  CREATE INDEX "_shortlists_v_version_query_decoded_feature_ids_order_idx" ON "_shortlists_v_version_query_decoded_feature_ids" USING btree ("_order");
  CREATE INDEX "_shortlists_v_version_query_decoded_feature_ids_parent_id_idx" ON "_shortlists_v_version_query_decoded_feature_ids" USING btree ("_parent_id");
  CREATE INDEX "_shortlists_v_parent_idx" ON "_shortlists_v" USING btree ("parent_id");
  CREATE INDEX "_shortlists_v_version_version_slug_idx" ON "_shortlists_v" USING btree ("version_slug");
  CREATE INDEX "_shortlists_v_version_version_hero_image_idx" ON "_shortlists_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_shortlists_v_version_seo_version_seo_image_idx" ON "_shortlists_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_shortlists_v_version_version_updated_at_idx" ON "_shortlists_v" USING btree ("version_updated_at");
  CREATE INDEX "_shortlists_v_version_version_created_at_idx" ON "_shortlists_v" USING btree ("version_created_at");
  CREATE INDEX "_shortlists_v_version_version__status_idx" ON "_shortlists_v" USING btree ("version__status");
  CREATE INDEX "_shortlists_v_created_at_idx" ON "_shortlists_v" USING btree ("created_at");
  CREATE INDEX "_shortlists_v_updated_at_idx" ON "_shortlists_v" USING btree ("updated_at");
  CREATE INDEX "_shortlists_v_snapshot_idx" ON "_shortlists_v" USING btree ("snapshot");
  CREATE INDEX "_shortlists_v_published_locale_idx" ON "_shortlists_v" USING btree ("published_locale");
  CREATE INDEX "_shortlists_v_latest_idx" ON "_shortlists_v" USING btree ("latest");
  CREATE INDEX "_shortlists_v_version_meta_version_meta_image_idx" ON "_shortlists_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_shortlists_v_locales_locale_parent_id_unique" ON "_shortlists_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "posts_legacy_urls_order_idx" ON "posts_legacy_urls" USING btree ("_order");
  CREATE INDEX "posts_legacy_urls_parent_id_idx" ON "posts_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_hero_image_idx" ON "posts" USING btree ("hero_image_id");
  CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");
  CREATE INDEX "posts_seo_seo_image_idx" ON "posts" USING btree ("seo_image_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE INDEX "posts_meta_meta_image_idx" ON "posts_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "posts_locales_locale_parent_id_unique" ON "posts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_tags_id_idx" ON "posts_rels" USING btree ("tags_id");
  CREATE INDEX "_posts_v_version_legacy_urls_order_idx" ON "_posts_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_posts_v_version_legacy_urls_parent_id_idx" ON "_posts_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_hero_image_idx" ON "_posts_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_posts_v_version_version_category_idx" ON "_posts_v" USING btree ("version_category_id");
  CREATE INDEX "_posts_v_version_seo_version_seo_image_idx" ON "_posts_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_snapshot_idx" ON "_posts_v" USING btree ("snapshot");
  CREATE INDEX "_posts_v_published_locale_idx" ON "_posts_v" USING btree ("published_locale");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE INDEX "_posts_v_version_meta_version_meta_image_idx" ON "_posts_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_posts_v_locales_locale_parent_id_unique" ON "_posts_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_tags_id_idx" ON "_posts_v_rels" USING btree ("tags_id");
  CREATE INDEX "categories_legacy_urls_order_idx" ON "categories_legacy_urls" USING btree ("_order");
  CREATE INDEX "categories_legacy_urls_parent_id_idx" ON "categories_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "categories_breadcrumbs_order_idx" ON "categories_breadcrumbs" USING btree ("_order");
  CREATE INDEX "categories_breadcrumbs_parent_id_idx" ON "categories_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "categories_breadcrumbs_locale_idx" ON "categories_breadcrumbs" USING btree ("_locale");
  CREATE INDEX "categories_breadcrumbs_doc_idx" ON "categories_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "tags_legacy_urls_order_idx" ON "tags_legacy_urls" USING btree ("_order");
  CREATE INDEX "tags_legacy_urls_parent_id_idx" ON "tags_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "shorts_legacy_urls_order_idx" ON "shorts_legacy_urls" USING btree ("_order");
  CREATE INDEX "shorts_legacy_urls_parent_id_idx" ON "shorts_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "shorts_slug_idx" ON "shorts" USING btree ("slug");
  CREATE INDEX "shorts_thumbnail_idx" ON "shorts" USING btree ("thumbnail_id");
  CREATE INDEX "shorts_seo_seo_image_idx" ON "shorts" USING btree ("seo_image_id");
  CREATE INDEX "shorts_updated_at_idx" ON "shorts" USING btree ("updated_at");
  CREATE INDEX "shorts_created_at_idx" ON "shorts" USING btree ("created_at");
  CREATE INDEX "shorts__status_idx" ON "shorts" USING btree ("_status");
  CREATE INDEX "shorts_meta_meta_image_idx" ON "shorts_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "shorts_locales_locale_parent_id_unique" ON "shorts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_shorts_v_version_legacy_urls_order_idx" ON "_shorts_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_shorts_v_version_legacy_urls_parent_id_idx" ON "_shorts_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_shorts_v_parent_idx" ON "_shorts_v" USING btree ("parent_id");
  CREATE INDEX "_shorts_v_version_version_slug_idx" ON "_shorts_v" USING btree ("version_slug");
  CREATE INDEX "_shorts_v_version_version_thumbnail_idx" ON "_shorts_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_shorts_v_version_seo_version_seo_image_idx" ON "_shorts_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_shorts_v_version_version_updated_at_idx" ON "_shorts_v" USING btree ("version_updated_at");
  CREATE INDEX "_shorts_v_version_version_created_at_idx" ON "_shorts_v" USING btree ("version_created_at");
  CREATE INDEX "_shorts_v_version_version__status_idx" ON "_shorts_v" USING btree ("version__status");
  CREATE INDEX "_shorts_v_created_at_idx" ON "_shorts_v" USING btree ("created_at");
  CREATE INDEX "_shorts_v_updated_at_idx" ON "_shorts_v" USING btree ("updated_at");
  CREATE INDEX "_shorts_v_snapshot_idx" ON "_shorts_v" USING btree ("snapshot");
  CREATE INDEX "_shorts_v_published_locale_idx" ON "_shorts_v" USING btree ("published_locale");
  CREATE INDEX "_shorts_v_latest_idx" ON "_shorts_v" USING btree ("latest");
  CREATE INDEX "_shorts_v_version_meta_version_meta_image_idx" ON "_shorts_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_shorts_v_locales_locale_parent_id_unique" ON "_shorts_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_legacy_urls_order_idx" ON "pages_legacy_urls" USING btree ("_order");
  CREATE INDEX "pages_legacy_urls_parent_id_idx" ON "pages_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_seo_seo_image_idx" ON "pages" USING btree ("seo_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_version_legacy_urls_order_idx" ON "_pages_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_pages_v_version_legacy_urls_parent_id_idx" ON "_pages_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "testimonials_legacy_urls_order_idx" ON "testimonials_legacy_urls" USING btree ("_order");
  CREATE INDEX "testimonials_legacy_urls_parent_id_idx" ON "testimonials_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "testimonials_slug_idx" ON "testimonials" USING btree ("slug");
  CREATE INDEX "testimonials_category_idx" ON "testimonials" USING btree ("category_id");
  CREATE INDEX "testimonials_photo_idx" ON "testimonials" USING btree ("photo_id");
  CREATE INDEX "testimonials_updated_at_idx" ON "testimonials" USING btree ("updated_at");
  CREATE INDEX "testimonials_created_at_idx" ON "testimonials" USING btree ("created_at");
  CREATE INDEX "testimonials__status_idx" ON "testimonials" USING btree ("_status");
  CREATE INDEX "_testimonials_v_version_legacy_urls_order_idx" ON "_testimonials_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_testimonials_v_version_legacy_urls_parent_id_idx" ON "_testimonials_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_testimonials_v_parent_idx" ON "_testimonials_v" USING btree ("parent_id");
  CREATE INDEX "_testimonials_v_version_version_slug_idx" ON "_testimonials_v" USING btree ("version_slug");
  CREATE INDEX "_testimonials_v_version_version_category_idx" ON "_testimonials_v" USING btree ("version_category_id");
  CREATE INDEX "_testimonials_v_version_version_photo_idx" ON "_testimonials_v" USING btree ("version_photo_id");
  CREATE INDEX "_testimonials_v_version_version_updated_at_idx" ON "_testimonials_v" USING btree ("version_updated_at");
  CREATE INDEX "_testimonials_v_version_version_created_at_idx" ON "_testimonials_v" USING btree ("version_created_at");
  CREATE INDEX "_testimonials_v_version_version__status_idx" ON "_testimonials_v" USING btree ("version__status");
  CREATE INDEX "_testimonials_v_created_at_idx" ON "_testimonials_v" USING btree ("created_at");
  CREATE INDEX "_testimonials_v_updated_at_idx" ON "_testimonials_v" USING btree ("updated_at");
  CREATE INDEX "_testimonials_v_snapshot_idx" ON "_testimonials_v" USING btree ("snapshot");
  CREATE INDEX "_testimonials_v_published_locale_idx" ON "_testimonials_v" USING btree ("published_locale");
  CREATE INDEX "_testimonials_v_latest_idx" ON "_testimonials_v" USING btree ("latest");
  CREATE INDEX "testimonial_categories_legacy_urls_order_idx" ON "testimonial_categories_legacy_urls" USING btree ("_order");
  CREATE INDEX "testimonial_categories_legacy_urls_parent_id_idx" ON "testimonial_categories_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "testimonial_categories_slug_idx" ON "testimonial_categories" USING btree ("slug");
  CREATE INDEX "testimonial_categories_updated_at_idx" ON "testimonial_categories" USING btree ("updated_at");
  CREATE INDEX "testimonial_categories_created_at_idx" ON "testimonial_categories" USING btree ("created_at");
  CREATE INDEX "directory_legacy_urls_order_idx" ON "directory_legacy_urls" USING btree ("_order");
  CREATE INDEX "directory_legacy_urls_parent_id_idx" ON "directory_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "directory_slug_idx" ON "directory" USING btree ("slug");
  CREATE INDEX "directory_category_idx" ON "directory" USING btree ("category_id");
  CREATE INDEX "directory_location_idx" ON "directory" USING btree ("location_id");
  CREATE INDEX "directory_image_idx" ON "directory" USING btree ("image_id");
  CREATE INDEX "directory_seo_seo_image_idx" ON "directory" USING btree ("seo_image_id");
  CREATE INDEX "directory_updated_at_idx" ON "directory" USING btree ("updated_at");
  CREATE INDEX "directory_created_at_idx" ON "directory" USING btree ("created_at");
  CREATE INDEX "directory__status_idx" ON "directory" USING btree ("_status");
  CREATE INDEX "directory_meta_meta_image_idx" ON "directory_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "directory_locales_locale_parent_id_unique" ON "directory_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_directory_v_version_legacy_urls_order_idx" ON "_directory_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_directory_v_version_legacy_urls_parent_id_idx" ON "_directory_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_directory_v_parent_idx" ON "_directory_v" USING btree ("parent_id");
  CREATE INDEX "_directory_v_version_version_slug_idx" ON "_directory_v" USING btree ("version_slug");
  CREATE INDEX "_directory_v_version_version_category_idx" ON "_directory_v" USING btree ("version_category_id");
  CREATE INDEX "_directory_v_version_version_location_idx" ON "_directory_v" USING btree ("version_location_id");
  CREATE INDEX "_directory_v_version_version_image_idx" ON "_directory_v" USING btree ("version_image_id");
  CREATE INDEX "_directory_v_version_seo_version_seo_image_idx" ON "_directory_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_directory_v_version_version_updated_at_idx" ON "_directory_v" USING btree ("version_updated_at");
  CREATE INDEX "_directory_v_version_version_created_at_idx" ON "_directory_v" USING btree ("version_created_at");
  CREATE INDEX "_directory_v_version_version__status_idx" ON "_directory_v" USING btree ("version__status");
  CREATE INDEX "_directory_v_created_at_idx" ON "_directory_v" USING btree ("created_at");
  CREATE INDEX "_directory_v_updated_at_idx" ON "_directory_v" USING btree ("updated_at");
  CREATE INDEX "_directory_v_snapshot_idx" ON "_directory_v" USING btree ("snapshot");
  CREATE INDEX "_directory_v_published_locale_idx" ON "_directory_v" USING btree ("published_locale");
  CREATE INDEX "_directory_v_latest_idx" ON "_directory_v" USING btree ("latest");
  CREATE INDEX "_directory_v_version_meta_version_meta_image_idx" ON "_directory_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_directory_v_locales_locale_parent_id_unique" ON "_directory_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "directory_categories_legacy_urls_order_idx" ON "directory_categories_legacy_urls" USING btree ("_order");
  CREATE INDEX "directory_categories_legacy_urls_parent_id_idx" ON "directory_categories_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "directory_categories_slug_idx" ON "directory_categories" USING btree ("slug");
  CREATE INDEX "directory_categories_updated_at_idx" ON "directory_categories" USING btree ("updated_at");
  CREATE INDEX "directory_categories_created_at_idx" ON "directory_categories" USING btree ("created_at");
  CREATE INDEX "media_crm_path_idx" ON "media" USING btree ("crm_path");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE INDEX "redirects_rels_order_idx" ON "redirects_rels" USING btree ("order");
  CREATE INDEX "redirects_rels_parent_idx" ON "redirects_rels" USING btree ("parent_id");
  CREATE INDEX "redirects_rels_path_idx" ON "redirects_rels" USING btree ("path");
  CREATE INDEX "redirects_rels_pages_id_idx" ON "redirects_rels" USING btree ("pages_id");
  CREATE INDEX "redirects_rels_posts_id_idx" ON "redirects_rels" USING btree ("posts_id");
  CREATE INDEX "redirects_rels_locations_id_idx" ON "redirects_rels" USING btree ("locations_id");
  CREATE INDEX "redirects_rels_shortlists_id_idx" ON "redirects_rels" USING btree ("shortlists_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
  CREATE INDEX "payload_locked_documents_rels_listings_id_idx" ON "payload_locked_documents_rels" USING btree ("listings_id");
  CREATE INDEX "payload_locked_documents_rels_shortlists_id_idx" ON "payload_locked_documents_rels" USING btree ("shortlists_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_shorts_id_idx" ON "payload_locked_documents_rels" USING btree ("shorts_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_testimonials_id_idx" ON "payload_locked_documents_rels" USING btree ("testimonials_id");
  CREATE INDEX "payload_locked_documents_rels_testimonial_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("testimonial_categories_id");
  CREATE INDEX "payload_locked_documents_rels_directory_id_idx" ON "payload_locked_documents_rels" USING btree ("directory_id");
  CREATE INDEX "payload_locked_documents_rels_directory_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("directory_categories_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "site_settings_logo_idx" ON "site_settings" USING btree ("logo_id");
  CREATE INDEX "calculator_defaults_term_options_order_idx" ON "calculator_defaults_term_options" USING btree ("_order");
  CREATE INDEX "calculator_defaults_term_options_parent_id_idx" ON "calculator_defaults_term_options" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "locations_legacy_urls" CASCADE;
  DROP TABLE "locations_breadcrumbs" CASCADE;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "locations_locales" CASCADE;
  DROP TABLE "locations_rels" CASCADE;
  DROP TABLE "_locations_v_version_legacy_urls" CASCADE;
  DROP TABLE "_locations_v_version_breadcrumbs" CASCADE;
  DROP TABLE "_locations_v" CASCADE;
  DROP TABLE "_locations_v_locales" CASCADE;
  DROP TABLE "_locations_v_rels" CASCADE;
  DROP TABLE "listings_images" CASCADE;
  DROP TABLE "listings_attributes" CASCADE;
  DROP TABLE "listings_features" CASCADE;
  DROP TABLE "listings" CASCADE;
  DROP TABLE "listings_locales" CASCADE;
  DROP TABLE "shortlists_legacy_urls" CASCADE;
  DROP TABLE "shortlists_query_decoded_sub_type_ids" CASCADE;
  DROP TABLE "shortlists_query_decoded_feature_ids" CASCADE;
  DROP TABLE "shortlists" CASCADE;
  DROP TABLE "shortlists_locales" CASCADE;
  DROP TABLE "_shortlists_v_version_legacy_urls" CASCADE;
  DROP TABLE "_shortlists_v_version_query_decoded_sub_type_ids" CASCADE;
  DROP TABLE "_shortlists_v_version_query_decoded_feature_ids" CASCADE;
  DROP TABLE "_shortlists_v" CASCADE;
  DROP TABLE "_shortlists_v_locales" CASCADE;
  DROP TABLE "posts_legacy_urls" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_locales" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v_version_legacy_urls" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_locales" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "categories_legacy_urls" CASCADE;
  DROP TABLE "categories_breadcrumbs" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "tags_legacy_urls" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "shorts_legacy_urls" CASCADE;
  DROP TABLE "shorts" CASCADE;
  DROP TABLE "shorts_locales" CASCADE;
  DROP TABLE "_shorts_v_version_legacy_urls" CASCADE;
  DROP TABLE "_shorts_v" CASCADE;
  DROP TABLE "_shorts_v_locales" CASCADE;
  DROP TABLE "pages_legacy_urls" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "_pages_v_version_legacy_urls" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "testimonials_legacy_urls" CASCADE;
  DROP TABLE "testimonials" CASCADE;
  DROP TABLE "_testimonials_v_version_legacy_urls" CASCADE;
  DROP TABLE "_testimonials_v" CASCADE;
  DROP TABLE "testimonial_categories_legacy_urls" CASCADE;
  DROP TABLE "testimonial_categories" CASCADE;
  DROP TABLE "directory_legacy_urls" CASCADE;
  DROP TABLE "directory" CASCADE;
  DROP TABLE "directory_locales" CASCADE;
  DROP TABLE "_directory_v_version_legacy_urls" CASCADE;
  DROP TABLE "_directory_v" CASCADE;
  DROP TABLE "_directory_v_locales" CASCADE;
  DROP TABLE "directory_categories_legacy_urls" CASCADE;
  DROP TABLE "directory_categories" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "redirects_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "calculator_defaults_term_options" CASCADE;
  DROP TABLE "calculator_defaults" CASCADE;
  DROP TABLE "crm_state" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_locations_type";
  DROP TYPE "public"."enum_locations_island_group";
  DROP TYPE "public"."enum_locations_status";
  DROP TYPE "public"."enum__locations_v_version_type";
  DROP TYPE "public"."enum__locations_v_version_island_group";
  DROP TYPE "public"."enum__locations_v_version_status";
  DROP TYPE "public"."enum__locations_v_published_locale";
  DROP TYPE "public"."enum_listings_sync_status";
  DROP TYPE "public"."enum_shortlists_query_decoded_property_for";
  DROP TYPE "public"."enum_shortlists_query_decoded_sale_detail_type";
  DROP TYPE "public"."enum_shortlists_status";
  DROP TYPE "public"."enum__shortlists_v_version_query_decoded_property_for";
  DROP TYPE "public"."enum__shortlists_v_version_query_decoded_sale_detail_type";
  DROP TYPE "public"."enum__shortlists_v_version_status";
  DROP TYPE "public"."enum__shortlists_v_published_locale";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum__posts_v_published_locale";
  DROP TYPE "public"."enum_shorts_status";
  DROP TYPE "public"."enum__shorts_v_version_status";
  DROP TYPE "public"."enum__shorts_v_published_locale";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum_testimonials_status";
  DROP TYPE "public"."enum__testimonials_v_version_status";
  DROP TYPE "public"."enum__testimonials_v_published_locale";
  DROP TYPE "public"."enum_directory_status";
  DROP TYPE "public"."enum__directory_v_version_status";
  DROP TYPE "public"."enum__directory_v_published_locale";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_redirects_to_type";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
