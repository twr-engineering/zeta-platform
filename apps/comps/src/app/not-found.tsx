import { redirect } from 'next/navigation'

// Any other path goes to Closed deals (app PRD §5).
export default function NotFound() {
  redirect('/deals')
}
