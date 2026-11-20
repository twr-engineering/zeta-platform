import * as migration_20261029_153705_initial from './20261029_153705_initial';

export const migrations = [
  {
    up: migration_20261029_153705_initial.up,
    down: migration_20261029_153705_initial.down,
    name: '20261029_153705_initial'
  },
];
