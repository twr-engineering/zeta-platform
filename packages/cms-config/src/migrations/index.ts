import * as migration_20261122_101638_cms_baseline from './20261122_101638_cms_baseline';
import * as migration_20261123_163823_wp03_site_navigation from './20261123_163823_wp03_site_navigation';

export const migrations = [
  {
    up: migration_20261122_101638_cms_baseline.up,
    down: migration_20261122_101638_cms_baseline.down,
    name: '20261122_101638_cms_baseline',
  },
  {
    up: migration_20261123_163823_wp03_site_navigation.up,
    down: migration_20261123_163823_wp03_site_navigation.down,
    name: '20261123_163823_wp03_site_navigation'
  },
];
