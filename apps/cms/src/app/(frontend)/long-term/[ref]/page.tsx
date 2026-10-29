/** /long-term/{ref}/ — the second view page (BPM-007). Same template until view-page-map is captured. */
export { default, generateMetadata } from '../../r/[ref]/page'

// Route segment config is parsed statically and cannot be re-exported (next build rejects it).
export const dynamic = 'force-dynamic'
