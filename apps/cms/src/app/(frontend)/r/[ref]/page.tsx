import { ListingView, findListing } from '@/components/listing/ListingView'

/** /r/{reference_no}/ — the sale view page (BPM-007a): Sale, Rent and Sale, and anything unkeyed. */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props) {
  const l = await findListing((await params).ref)
  return l ? { title: l.seo?.title || l.propertyTitle, description: l.seo?.description || l.shortDescription } : {}
}

export default async function ListingPage({ params, searchParams }: Props) {
  return <ListingView refNo={(await params).ref} view="r" searchParams={await searchParams} />
}
