import { redirect } from 'next/navigation'

// "/" goes to Closed deals (app PRD §5).
export default function Home() {
  redirect('/deals')
}
