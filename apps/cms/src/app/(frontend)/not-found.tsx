import Link from 'next/link'

/** The live 404 page (page 303157): heading, hint, "Back to Home". */
export default function NotFound() {
  return (
    <section className="not-found">
      <h1>Sorry, page not found</h1>
      <p>Try to check if the URL is correct.</p>
      <Link href="/" className="btn btn-outline">Back to Home</Link>
    </section>
  )
}
