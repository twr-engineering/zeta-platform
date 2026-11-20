/** User-facing copy shared by server and client (app PRD Appendix A; new strings A.12). */
export const LOGIN_COPY = {
  empty: 'Enter your email and password.',
  wrong: 'That email and password do not match.',
  locked: 'Too many tries. Wait 15 minutes and try again.',
  network: 'Could not log in. Check your connection and try again.',
} as const

/** Page heads (§6.1). Closed deals has only a visually hidden h1. */
export const PAGE_HEADS = {
  deals: { title: 'Closed deals', sub: null },
  rates: { title: 'Market rates', sub: 'The middle price per sqm for each subdivision, area and property type. Select a row to see its trend.' },
  cma: { title: 'Comparative Market Analysis', sub: 'Price a property from nearby closed deals of the same type.' },
  add: { title: 'Add a closed deal', sub: 'Only enter a sold price you know is accurate. Leave out names and title numbers.' },
  edit: { title: 'Edit closed deal', sub: 'Changes replace the saved deal. Who entered it stays the same.' },
  settings: { title: 'Settings', sub: 'The subdivisions, areas and property types your team uses.' },
} as const
