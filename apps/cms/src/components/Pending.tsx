import { PENDING, type PendingId } from '@/lib/parity/pending'

/**
 * Visible placeholder for UI whose behaviour is not yet captured. Renders in every
 * environment on purpose: a provisional slot must never pass for the finished thing in review.
 */
export function Pending({ id, children }: { id: PendingId; children?: React.ReactNode }) {
  const rule = PENDING[id]
  return (
    <div className="pending" role="note" data-pending={id}>
      <strong>Pending: {id}</strong> <span className="pending-refs">{rule.refs.join(' · ')}</span>
      <p>{children ?? rule.need}</p>
      <p className="pending-unblock">Unblocks when: {rule.unblock}</p>
    </div>
  )
}
