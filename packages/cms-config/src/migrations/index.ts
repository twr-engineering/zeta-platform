import * as migration_20261029_153705_initial from './20261029_153705_initial';
import * as migration_20261120_170210_comps_init from './20261120_170210_comps_init';

export const migrations = [
  {
    up: migration_20261029_153705_initial.up,
    down: migration_20261029_153705_initial.down,
    name: '20261029_153705_initial',
  },
  {
    up: migration_20261120_170210_comps_init.up,
    down: migration_20261120_170210_comps_init.down,
    name: '20261120_170210_comps_init'
  },
];
