import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_blocks_home_locations_tile_style" AS ENUM('city', 'development');
  CREATE TYPE "cms"."enum__pages_v_blocks_home_locations_tile_style" AS ENUM('city', 'development');
  ALTER TABLE "cms"."pages_blocks_home_locations" ADD COLUMN "tile_style" "cms"."enum_pages_blocks_home_locations_tile_style" DEFAULT 'city';
  ALTER TABLE "cms"."_pages_v_blocks_home_locations" ADD COLUMN "tile_style" "cms"."enum__pages_v_blocks_home_locations_tile_style" DEFAULT 'city';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."pages_blocks_home_locations" DROP COLUMN "tile_style";
  ALTER TABLE "cms"."_pages_v_blocks_home_locations" DROP COLUMN "tile_style";
  DROP TYPE "cms"."enum_pages_blocks_home_locations_tile_style";
  DROP TYPE "cms"."enum__pages_v_blocks_home_locations_tile_style";`)
}
