import * as migration_20261122_101638_cms_baseline from './20261122_101638_cms_baseline';
import * as migration_20261123_163823_wp03_site_navigation from './20261123_163823_wp03_site_navigation';
import * as migration_20261123_170700_wp03_tracking_consent from './20261123_170700_wp03_tracking_consent';
import * as migration_20261123_174557_wp04_listing_filter_fields from './20261123_174557_wp04_listing_filter_fields';
import * as migration_20261123_180241_home_blocks from './20261123_180241_home_blocks';
import * as migration_20261124_062616_page_blocks from './20261124_062616_page_blocks';
import * as migration_20261124_125706_location_tile_style from './20261124_125706_location_tile_style';
import * as migration_20261124_132428_directory_excerpt from './20261124_132428_directory_excerpt';
import * as migration_20261124_132447_directory_categories from './20261124_132447_directory_categories';
import * as migration_20261124_143116_crm_location_tree from './20261124_143116_crm_location_tree';
import * as migration_20261125_023744_listing_agent from './20261125_023744_listing_agent';

export const migrations = [
  {
    up: migration_20261122_101638_cms_baseline.up,
    down: migration_20261122_101638_cms_baseline.down,
    name: '20261122_101638_cms_baseline',
  },
  {
    up: migration_20261123_163823_wp03_site_navigation.up,
    down: migration_20261123_163823_wp03_site_navigation.down,
    name: '20261123_163823_wp03_site_navigation',
  },
  {
    up: migration_20261123_170700_wp03_tracking_consent.up,
    down: migration_20261123_170700_wp03_tracking_consent.down,
    name: '20261123_170700_wp03_tracking_consent',
  },
  {
    up: migration_20261123_174557_wp04_listing_filter_fields.up,
    down: migration_20261123_174557_wp04_listing_filter_fields.down,
    name: '20261123_174557_wp04_listing_filter_fields',
  },
  {
    up: migration_20261123_180241_home_blocks.up,
    down: migration_20261123_180241_home_blocks.down,
    name: '20261123_180241_home_blocks',
  },
  {
    up: migration_20261124_062616_page_blocks.up,
    down: migration_20261124_062616_page_blocks.down,
    name: '20261124_062616_page_blocks',
  },
  {
    up: migration_20261124_125706_location_tile_style.up,
    down: migration_20261124_125706_location_tile_style.down,
    name: '20261124_125706_location_tile_style',
  },
  {
    up: migration_20261124_132428_directory_excerpt.up,
    down: migration_20261124_132428_directory_excerpt.down,
    name: '20261124_132428_directory_excerpt',
  },
  {
    up: migration_20261124_132447_directory_categories.up,
    down: migration_20261124_132447_directory_categories.down,
    name: '20261124_132447_directory_categories',
  },
  {
    up: migration_20261124_143116_crm_location_tree.up,
    down: migration_20261124_143116_crm_location_tree.down,
    name: '20261124_143116_crm_location_tree',
  },
  {
    up: migration_20261125_023744_listing_agent.up,
    down: migration_20261125_023744_listing_agent.down,
    name: '20261125_023744_listing_agent'
  },
];
