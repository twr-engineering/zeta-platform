import * as migration_20261122_101638_cms_baseline from './20261122_101638_cms_baseline';
import * as migration_20261123_163823_wp03_site_navigation from './20261123_163823_wp03_site_navigation';
import * as migration_20261123_170700_wp03_tracking_consent from './20261123_170700_wp03_tracking_consent';
import * as migration_20261123_174557_wp04_listing_filter_fields from './20261123_174557_wp04_listing_filter_fields';

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
    name: '20261123_174557_wp04_listing_filter_fields'
  },
];
