import { ListingView } from '@/components/listing/ListingView'

/** /long-term/{reference_no}/ — the rent view page (BPM-007a): Rent, short and long rent. */
export { generateMetadata } from '../../r/[ref]/page'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function LongTermListingPage({ params, searchParams }: Props) {
  return <ListingView refNo={(await params).ref} view="long-term" searchParams={await searchParams} />
}
