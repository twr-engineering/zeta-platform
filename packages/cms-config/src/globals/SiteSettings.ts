import type { Field, GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'

/** A label + URL pair. URLs are site-relative (`/about-us/`) or absolute. */
const link = (name = 'links'): Field => ({
  name,
  type: 'array',
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
  ],
})

const links = (rows: [string, string][]) => rows.map(([label, url]) => ({ label, url }))

/**
 * WP-03 defaults are the live zetagroup.ph navigation as of 23 Nov 2026 (header drawer, footer
 * columns, "Explore more Properties"), so the site renders correctly before an editor touches it.
 * FR-G09: footer link columns are editor-managed.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: isAdmin },
  fields: [
    { name: 'siteName', type: 'text', defaultValue: 'Zeta Group' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'brokerLicence', type: 'text', admin: { description: 'PRC Broker Lic. No. — required on public pages.' } },
    { name: 'officeAddress', type: 'textarea' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: 'social',
      type: 'group',
      fields: [
        { name: 'facebook', type: 'text', defaultValue: 'https://www.facebook.com/RealEstateBrokerAlexZeta' },
        { name: 'tiktok', type: 'text', defaultValue: 'https://www.tiktok.com/@realtoralexzeta' },
        { name: 'youtube', type: 'text', defaultValue: 'https://www.youtube.com/c/RealEstateBrokerAlexZetaGuingao' },
        { name: 'instagram', type: 'text', defaultValue: 'https://www.instagram.com/realtoralexzeta/' },
        { name: 'linkedin', type: 'text', defaultValue: 'https://www.linkedin.com/in/realtoralexzeta' },
      ],
    },
    {
      type: 'collapsible',
      label: 'Header',
      fields: [
        {
          name: 'headerCta',
          type: 'group',
          admin: { description: 'The button beside the menu on scrolled and inner pages.' },
          fields: [
            { name: 'label', type: 'text', defaultValue: 'Sell with us' },
            { name: 'url', type: 'text', defaultValue: '/sell/' },
          ],
        },
        {
          name: 'mainMenu',
          type: 'array',
          admin: { description: 'The drawer menu, in order. An item with children opens as an accordion.' },
          defaultValue: [
            { label: 'Home', url: '/' },
            { label: 'Preselling Developments', url: '/preselling-development/' },
            { label: 'City Guide', url: '/location/' },
            { label: 'Shortlists', url: '/shortlist-page/' },
            { label: 'Services', url: '/services/', children: links([['Preselling', '/preselling-development/'], ['Buying', '/buy/'], ['Selling', '/sell/'], ['Renting', '/rent/']]) },
            { label: 'Insights', url: '/insights/' },
            { label: 'About us', url: '/about-us/' },
            { label: 'Contact us', url: '/contact/' },
          ],
          fields: [{ name: 'label', type: 'text', required: true }, { name: 'url', type: 'text', required: true }, link('children')],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Footer',
      fields: [
        {
          name: 'footerTagline',
          type: 'textarea',
          defaultValue: 'Zeta Group is the ultimate resource for buyers and sellers of real property in the Philippines.',
        },
        {
          name: 'exploreColumns',
          type: 'array',
          admin: { description: '"Explore more Properties" link columns above the newsletter.' },
          defaultValue: [
            { title: 'Cities', links: links([['Cagayan de Oro City', '/location/cagayan-de-oro-city/'], ['San Vicente', '/location/san-vicente/'], ['Puerto Princessa City', '/location/puerto-princesa-city/'], ['Davao City', '/location/davao-city/'], ['Panglao Island', '/location/panglao-island/'], ['Cebu City', '/location/cebu-city/'], ['Iloilo City', '/location/iloilo-city/'], ['Bacolod City', '/location/bacolod-city/'], ['Butuan City', '/location/butuan/']]) },
            { title: 'Neighborhood', links: links([['Uptown CDO', '/location/cagayan-de-oro-city/uptown-cdo/'], ['Downtown CDO', '/location/cagayan-de-oro-city/downtown-cdo/'], ['Cebu IT Park', '/location/cebu-city/cebu-it-park/'], ['Cebu Business Park', '/location/cebu-city/cebu-business-park/'], ['IloIlo Business Park', '/location/iloilo-city/iloilo-business-park/'], ['Davao Global Township', '/location/davao-city/davao-global-township/'], ['Upper East By Megaworld', '/location/bacolod-city/upper-east-by-megaworld/'], ['Mactan Newtown', '/location/lapu-lapu-city/mactan-newtown/'], ['Boracay', '/location/malay/boracay/']]) },
            { title: 'Developments', links: links([['Xavier Estates', '/location/cagayan-de-oro-city/balulang/xavier-estates/'], ['Ignatius Enclave 1', '/location/cagayan-de-oro-city/balulang/xavier-estates-ignatius-enclave-1/'], ['Ignatius Enclave 2', '/location/cagayan-de-oro-city/balulang/xavier-estates-ignatius-enclave-2/'], ['Ventura Residences 1', '/location/cagayan-de-oro-city/balulang/xavier-estates-ventura-residences-1/'], ['Ventura Residences 2', '/location/cagayan-de-oro-city/balulang/xavier-estates-ventura-residences-2/'], ['Pueblo Golf Estates', '/location/cagayan-de-oro-city/carmen/the-grove-at-pueblo-golf/'], ['Golden Glow Village', '/location/cagayan-de-oro-city/carmen/golden-glow-village/'], ['Golden Village', '/location/cagayan-de-oro-city/carmen/golden-village/'], ['Hillsborough Pointe', '/location/cagayan-de-oro-city/carmen/hillsborough-pointe/'], ['Morning Mist Village', '/location/cagayan-de-oro-city/carmen/morning-mist-village/'], ['Philam Life Village', '/location/cagayan-de-oro-city/carmen/philam-life-village/'], ['Alegria Hills', '/location/cagayan-de-oro-city/indahag/alegria-hills/']]) },
            { title: 'Preselling', links: links([['Intalio Estates', '/location/cagayan-de-oro-city/canito-an/intalio-estates/'], ['Xavier Southridge', '/location/cagayan-de-oro-city/bayanga/xavier-south-ridge/'], ['Primavera City', '/location/cagayan-de-oro-city/carmen/primavera-city/'], ['Firenze Residences', '/location/iloilo-city/mandurriao/firenze-residence/'], ['Verona Apartment', '/location/cagayan-de-oro-city/balulang/verona-apartments/'], ['Boracay Newcoast', '/location/malay/yapak/boracay-newcoast/'], ['Paragua Coastown', '/location/san-vicente/kemdeng/paragua-coastown/'], ['Casa Mira Palawan', '/location/puerto-princesa-city/san-pedro/casa-mira-towers-palawan/'], ['Costa Mira Bohol', '/location/dauis/totolan/costa-mira/'], ['West Highlands', '/location/butuan/bonbon/west-highlands/']]) },
          ],
          fields: [{ name: 'title', type: 'text', required: true }, link()],
        },
        {
          name: 'newsletter',
          type: 'group',
          fields: [
            { name: 'heading', type: 'text', defaultValue: 'Get the latest Scoop' },
            {
              name: 'text',
              type: 'textarea',
              defaultValue: 'Join our community for the latest updates about real estate news, new developments, and emerging trends in the Philippines.',
            },
          ],
        },
        {
          name: 'footerColumns',
          type: 'array',
          admin: { description: 'Link columns in the dark footer.' },
          defaultValue: [
            { title: 'Zeta Group', links: links([['About Us', '/about-us/'], ['Our Services', '/services/'], ['Contact Us', '/contact/'], ['Insights', '/insights/']]) },
            { title: 'Services', links: links([['Preselling', '/preselling-development/'], ['Buying', '/buy/'], ['Selling', '/sell/'], ['Renting', '/rent/']]) },
            { title: 'Popular Locations', links: links([['Cagayan de Oro', '/location/cagayan-de-oro-city/'], ['Davao City', '/location/davao-city/'], ['Cebu City', '/location/cebu-city/'], ['Lapu Lapu City', '/location/lapu-lapu-city/']]) },
            // The live Beachfront href is "hhttps://…" (a typo); the corrected URL is used here (F).
            { title: 'Popular Searches', links: links([['Beachfront', '/shortlist/beachfront-properties-for-sale-in-the-philippines/'], ['Foreclosed', '/shortlist/foreclosed-properties-for-sale-in-the-philippines/'], ['Land', '/shortlist/residential-lots-for-sale-in-the-philippines/'], ['Condominium', '/shortlist/condominium/']]) },
          ],
          fields: [{ name: 'title', type: 'text', required: true }, link()],
        },
      ],
    },
  ],
}
