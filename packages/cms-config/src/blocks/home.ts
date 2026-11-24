import type { Block, Field } from 'payload'

/**
 * Home page block library (PRD §7.2, FR-H01..H10). Each block is one section of the live
 * zetagroup.ph home page (23 Nov 2026), in its live order; editors add, edit and drag them in the
 * admin (FR-H01, FR-H10) without a deployment. Defaults are the live copy, so a new home page
 * starts identical to production.
 */

const heading = (defaultValue: string): Field => ({ name: 'heading', type: 'text', defaultValue })
const intro = (defaultValue: string): Field => ({ name: 'intro', type: 'textarea', defaultValue })
const link = (name: string, label: string, url: string): Field => ({
  name,
  type: 'group',
  fields: [
    { name: 'label', type: 'text', defaultValue: label },
    { name: 'url', type: 'text', defaultValue: url },
  ],
})

/** Hero: background image, headline, Buy/Rent location search (FR-H02), presenter caption. */
export const HomeHero: Block = {
  slug: 'homeHero',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    heading('Your Ultimate Real Estate Resource in the Philippines'),
    { name: 'backgroundImage', type: 'upload', relationTo: 'media' },
    { name: 'backgroundVideoUrl', type: 'text', admin: { description: 'Optional MP4 played muted behind the headline; the image is its poster and the fallback.' } },
    { name: 'presenterName', type: 'text', defaultValue: 'Alex Zeta-Guingao' },
    { name: 'presenterTagline', type: 'text', defaultValue: 'Truly Wealthy Realty' },
    link('guideLink', 'Learn how to buy in the Philippines', '/buy/'),
  ],
}

/** "What our clients say" (FR-H05). */
export const HomeTestimonials: Block = {
  slug: 'homeTestimonials',
  labels: { singular: 'Testimonials', plural: 'Testimonials' },
  fields: [
    heading('What our clients say'),
    intro('Zeta clients are always a top priority. Here’s what they have to say.'),
    { name: 'testimonials', type: 'relationship', relationTo: 'testimonials', hasMany: true },
    link('moreLink', 'View more reviews', '/about-us/'),
  ],
}

/** "Award winning track record": editor-managed statistics (FR-H04). */
export const HomeStats: Block = {
  slug: 'homeStats',
  labels: { singular: 'Statistics', plural: 'Statistics' },
  fields: [
    heading('Award winning track record'),
    intro('Elevating the standard of real estate practice in the Philippines. Showcasing our success in Philippine real estate.'),
    {
      name: 'items',
      type: 'array',
      defaultValue: [
        { value: '10+ years', label: 'Real Estate Experience' },
        { value: '2B+', label: 'Sales volume since 2012' },
        { value: '15k', label: 'Youtube Subscribers' },
        { value: '500+', label: 'Transactions since 2012' },
      ],
      fields: [
        { name: 'value', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
      ],
    },
    link('moreLink', 'More about the Zeta Group', '/about-us/'),
  ],
}

/** "City Guide": selected cities with imagery and listing counts (FR-H06). */
export const HomeLocations: Block = {
  slug: 'homeLocations',
  labels: { singular: 'City guide', plural: 'City guides' },
  fields: [
    heading('City Guide'),
    intro('Virtually search through the key cities in the Philippines to find the right property for you.'),
    { name: 'locations', type: 'relationship', relationTo: 'locations', hasMany: true },
    {
      name: 'tileStyle',
      type: 'select',
      defaultValue: 'city',
      options: [
        { label: 'City: “Properties for sale in {name}” with its listing count', value: 'city' },
        { label: 'Development: “Property for sale in {name}, {parent}” (location grid, BPM-022)', value: 'development' },
      ],
    },
    link('moreLink', 'View More Locations', '/location/'),
  ],
}

/** A call-to-action band: "Sell with confidence.", "Home Buying Guide". */
export const HomeCta: Block = {
  slug: 'homeCta',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    heading('Sell with confidence.'),
    { name: 'text', type: 'textarea' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'imageSide', type: 'select', defaultValue: 'left', options: ['left', 'right'] },
    link('button', 'Get Started', '/sell/'),
  ],
}

/** "Interesting Properties you might like": curated shortlists (FR-H03). */
export const HomeShortlists: Block = {
  slug: 'homeShortlists',
  labels: { singular: 'Shortlists', plural: 'Shortlists' },
  fields: [
    heading('Interesting Properties you might like'),
    intro('Carefully curated properties in the Philippines that will resonate with you.'),
    { name: 'shortlists', type: 'relationship', relationTo: 'shortlists', hasMany: true },
    link('moreLink', 'View More Shortlists', '/shortlist-page/'),
  ],
}

/** "Featured Content": Blogs and Shorts tabs (FR-H07, FR-H08). */
export const HomeContent: Block = {
  slug: 'homeContent',
  labels: { singular: 'Featured content', plural: 'Featured content' },
  fields: [
    heading('Featured Content'),
    intro(
      'Real estate information at your fingertips. Alex, an expert real estate broker and consultant in the Philippines will help you understand the ins and outs of the Philippine real estate process through her hand-picked and easy-to-follow content.',
    ),
    { name: 'posts', type: 'relationship', relationTo: 'posts', hasMany: true, admin: { description: 'Leave empty for the latest 8.' } },
    { name: 'shorts', type: 'relationship', relationTo: 'shorts', hasMany: true, admin: { description: 'Leave empty for the latest 4.' } },
    link('moreLink', 'View More blogs', '/insights/'),
  ],
}

/** FAQ accordion. */
export const HomeFaq: Block = {
  slug: 'homeFaq',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  fields: [
    heading('FAQ'),
    intro('Got questions? We’ve got answers. Learn everything you need to know about the Philippine real estate process in our comprehensive FAQ section.'),
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'textarea', required: true },
      ],
    },
  ],
}

export const HOME_BLOCKS: Block[] = [HomeHero, HomeTestimonials, HomeStats, HomeLocations, HomeCta, HomeShortlists, HomeContent, HomeFaq]
