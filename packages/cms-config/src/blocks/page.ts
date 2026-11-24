import type { Block, Field } from 'payload'

/**
 * General page blocks (PRD §13.4) for the content pages recomposed from WordPress (WP-10: About,
 * Services, Buy, Rent, Sell, Contact, the legal pages, Preselling). With the home blocks they make up
 * every live section type: text with an image or video, accordions, tabs, contact details, forms and
 * the loan calculator. Editors add, edit and reorder them like the home page's.
 */

const buttons: Field = {
  name: 'buttons',
  type: 'array',
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text', admin: { description: 'Leave empty for a gated download (pending, OQ-17).' } },
    { name: 'style', type: 'select', defaultValue: 'primary', options: ['primary', 'secondary', 'download'] },
  ],
}

/** Text with an optional image or YouTube video beside it. */
export const ContentBlock: Block = {
  slug: 'content',
  labels: { singular: 'Text and media', plural: 'Text and media' },
  fields: [
    { name: 'body', type: 'richText' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'videoUrl', type: 'text', admin: { description: 'YouTube link; shown instead of the image.' } },
    { name: 'mediaSide', type: 'select', defaultValue: 'right', options: ['left', 'right'] },
    buttons,
    { name: 'tone', type: 'select', defaultValue: 'plain', options: ['plain', 'panel', 'dark'] },
  ],
}

/** Accordion: the legal pages' sections and the contact page FAQ. */
export const AccordionBlock: Block = {
  slug: 'accordion',
  labels: { singular: 'Accordion', plural: 'Accordions' },
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'intro', type: 'richText' },
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText' },
      ],
    },
  ],
}

/** Tabs of rich text (the Services page's Buy / Sell / Rent). */
export const TabsBlock: Block = {
  slug: 'tabs',
  labels: { singular: 'Tabs', plural: 'Tabs' },
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'intro', type: 'richText' },
    {
      name: 'tabs',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
}

/** Contact details with a map of the office address. */
export const ContactDetailsBlock: Block = {
  slug: 'contactDetails',
  labels: { singular: 'Contact details', plural: 'Contact details' },
  fields: [
    { name: 'body', type: 'richText' },
    { name: 'mapAddress', type: 'text' },
  ],
}

/**
 * A site form (contact, sell enquiry, get in touch). Which fields each live form has and where it
 * sends are not captured (OQ-17): the block renders its heading and the pending placeholder.
 */
export const FormBlock: Block = {
  slug: 'form',
  labels: { singular: 'Form', plural: 'Forms' },
  fields: [
    { name: 'body', type: 'richText' },
    { name: 'form', type: 'text', required: true, admin: { description: 'The live form’s name, e.g. "Get in touch form".' } },
  ],
}

/** "How much can I borrow?" (the Buy page's home-loan calculator). */
export const CalculatorBlock: Block = {
  slug: 'calculator',
  labels: { singular: 'Loan calculator', plural: 'Loan calculators' },
  fields: [{ name: 'body', type: 'richText' }],
}

export const PAGE_BLOCKS: Block[] = [ContentBlock, AccordionBlock, TabsBlock, ContactDetailsBlock, FormBlock, CalculatorBlock]
