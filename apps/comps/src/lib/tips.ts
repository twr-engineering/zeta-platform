/**
 * The TIPS dictionary (app PRD Appendix B): every "i" button's title and text, character
 * for character, including curly apostrophes (U+2019). 30 entries.
 * `status` uses the production wording ("closed deals", footnote 1), not the prototype's.
 */
export const TIPS = {
  kind: ['Subdivision or area', 'A subdivision is a registered project with its own roads, and often a gate and HOA, like Xavier Estates. An area is a road or part of town outside any subdivision, like the uptown main road. Lots in an area are priced more on frontage and road access.'],
  pin: ['Map pin', 'The exact spot of the property. In Google Maps, right-click the property (or press and hold on a phone) and copy the two numbers, for example 8.48930, 124.66200. The pin is how nearby comps are found.'],
  note: ['Notes', 'Extra facts that help when comparing, like a landmark, a view, or something that pushed the price up or down. It shows in full when you open the deal. Leave out owner names and title numbers.'],
  details: ['Property details', 'Block and lot for subdivision lots and houses, tower and unit number for condos, or a street or landmark for lots outside subdivisions. Keep it short so it fits the deal list, and put anything longer in Notes. Only the team sees this. Leave out owner names and title numbers.'],
  area: ['Area in sqm', 'For lots, the lot area on the title. For houses, buildings and condo units, the floor area from the plan or the developer’s sheet. Price per sqm is worked out from this number.'],
  lotarea: ['Lot area', 'The land area on the title. Price per sqm for houses and buildings is still based on floor area, but the lot size is saved so you only compare houses on similar lots.'],
  parkincl: ['Parking in the sold price', 'Condo parking is often sold separately. If a slot was included, the price per sqm looks higher than the unit alone, so note it here to compare fairly.'],
  frontage: ['Frontage', 'How wide the lot is along the road, in metres. Wider frontage usually means a higher price, especially for commercial lots.'],
  sold: ['Sold price', 'The actual price the buyer and seller agreed on. It can be different from the amount written on the Deed of Absolute Sale. Always enter the real agreed price.'],
  date: ['Date sold', 'The date the deal closed, usually when the Deed of Absolute Sale was signed. Recent sales count more when pricing a property.'],
  asking: ['Last asking price', 'The last price the property was advertised at before it sold. It shows how much the seller came down.'],
  fin: ['Mode of payment', 'How the buyer paid: cash, bank financing, Pag-IBIG or in-house financing. Financed deals sometimes close at a higher price than cash deals.'],
  dom: ['Days on market', 'How many days from when the property was listed to when the buyer reserved or made the accepted offer.'],
  code: ['Listing code or link', 'Type a Zeta listing code like ZTP777, or paste our listing link, and it opens our listing page. For other agents’ listings, paste the Facebook, Lamudi or website link so the team can see photos.'],
  features: ['Corner lot and ridge view', 'These do not remove any comps. They add a note when this lot differs from its comps, since corner and ridge view lots usually sell higher.'],
  terrain: ['Terrain and shape', 'Flat, regular lots are easier to build on and usually sell higher than sloped or irregular ones. Optional: leave it blank if you are not sure, and tap a choice again to clear it.'],
  middle: ['Middle price', 'Half of the deals sold above this price per sqm and half sold below it. It is steadier than the average because one unusual sale cannot pull it up or down.'],
  range: ['Price range', 'Where most deals landed: the middle half of all sales. One in four sold below this range and one in four sold above it.'],
  conf: ['Confidence', 'How far you can rely on the number. High: 10 or more deals with prices close together. Medium: 7 or more deals with prices fairly close. Low: 5 or 6 deals, or prices spread widely. Nothing shows below 5 deals.'],
  trend: ['Trend', 'The middle price per sqm for each quarter (3 months), half-year or year. Periods with fewer than 2 sales are left out, so a gap means not enough sales then. If there are many gaps, switch to Half-year or Year.'],
  cma: ['Comparative Market Analysis (CMA)', 'A CMA prices a property by comparing it with recent closed deals of similar properties nearby. Fill in the property on the left to get an estimated price range, then check the comps it is based on.'],
  comps: ['Comps', 'Short for comparables: recent sales of similar properties nearby. They are what the estimated price is based on.'],
  estimate: ['Estimated price', 'The price range per sqm of the nearby comps, multiplied by this property’s area. Most similar properties sold within this range.'],
  radius: ['Distance from the property', 'How far to look for comps. Start at 1 km. If there are not enough, widen it, but comps farther away are less alike.'],
  months: ['Sold within', 'Older sales may not match today’s prices. 6 or 12 months is more current. 24 or 36 months gives you more comps when sales are few.'],
  similar: ['Similar properties only', 'Narrows the comps to the ones most like this property. Lots: similar size and frontage. Houses and buildings: floor area and lot area within 30%, and the same bedrooms. Condos: floor area within 30% and the same bedrooms. Turn it off to include every sale of this type.'],
  mapcenter: ['Map center', 'The middle of the subdivision or area on the map. When someone drops a pin, the closest one is suggested as the location.'],
  status: ['Shown or hidden', 'Hidden ones no longer appear in the add form, but their closed deals stay and still count in prices.'],
  category: ['Category', 'Only groups the property types so the lists stay tidy. It does not change any prices.'],
  pricedby: ['Priced per sqm of', 'Lots are priced per sqm of lot area. Houses, buildings and condo units are priced per sqm of floor area. For houses and buildings, the lot area is saved too.'],
} as const satisfies Record<string, readonly [string, string]>

export type TipKey = keyof typeof TIPS

/** The "i" button's accessible name: "About {title in lower case}". */
export const tipLabel = (key: TipKey): string => 'About ' + TIPS[key][0].toLowerCase()
