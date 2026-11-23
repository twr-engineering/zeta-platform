import Link from 'next/link'

/** "Get in touch" band (live shortlist pages). */
export function GetInTouch() {
  return (
    <section className="get-in-touch">
      <h2>Get in touch</h2>
      <p>Do you have more questions about real estate in the Philippines? Reach out to us! We’d be very happy to hear from you.</p>
      <Link href="/contact/" className="btn btn-dark">Contact us</Link>
    </section>
  )
}
