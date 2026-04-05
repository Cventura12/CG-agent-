import React from 'react'

interface BudgetOverviewCardProps {
  jobId: string
  jobName: string
  originalContract: number
  revisedTotal: number
  pendingChanges: number
  approvedChanges: number
  pendingCount: number
  overagePercent: number | null
  statusColor: 'green' | 'yellow' | 'red'
  hasstalePending: boolean
  onReviewPending: (jobId: string) => void
}

const statusColorMap: Record<BudgetOverviewCardProps['statusColor'], string> = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
}

const statusPillBg: Record<BudgetOverviewCardProps['statusColor'], string> = {
  green: 'transparent',
  yellow: 'rgba(250, 204, 21, 0.1)',
  red: 'rgba(248, 113, 113, 0.1)',
}

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })

const BudgetOverviewCard: React.FC<BudgetOverviewCardProps> = ({
  jobId,
  jobName,
  originalContract,
  revisedTotal,
  pendingChanges,
  approvedChanges,
  pendingCount,
  overagePercent,
  statusColor,
  hasstalePending,
  onReviewPending,
}) => {
  const revisedIsUp = revisedTotal > originalContract
  const statusDot = statusColorMap[statusColor]

  return (
    <div
      className="rounded-lg border bg-[#1A1A1A] p-4"
      style={{
        borderColor: '#2A2A2A',
        borderTopColor: hasstalePending ? '#f87171' : '#2A2A2A',
        borderTopWidth: hasstalePending ? 2 : 1,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[16px] text-[#F5F0E8]" style={{ fontFamily: "'Playfair Display', serif" }}>
            {jobName}
          </div>
          {hasstalePending ? (
            <div className="mt-1 text-[11px] text-[#f87171]">Action needed</div>
          ) : null}
        </div>
        <span
          className="mt-1 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: statusDot }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Original</div>
          <div className="mt-1 text-[20px] text-[#F5F0E8]" style={{ fontFamily: "'Azeret Mono', monospace" }}>
            {formatCurrency(originalContract)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Revised</div>
          <div
            className="mt-1 text-[20px]"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              color: revisedIsUp ? statusDot : '#F5F0E8',
            }}
          >
            {formatCurrency(revisedTotal)}
          </div>
        </div>
      </div>

      {overagePercent !== null && overagePercent > 0 ? (
        <div
          className="mt-3 inline-flex items-center rounded-full px-2 py-1 text-[11px]"
          style={{
            fontFamily: "'Azeret Mono', monospace",
            backgroundColor: statusPillBg[statusColor],
            color: statusDot,
          }}
        >
          +{overagePercent}%
        </div>
      ) : null}

      {pendingChanges > 0 ? (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <div className="text-[#8A8A8A]">
            {formatCurrency(pendingChanges)} pending
          </div>
          <button
            type="button"
            onClick={() => onReviewPending(jobId)}
            className="text-[#C1522A] hover:underline"
          >
            Review {pendingCount} change{pendingCount > 1 ? 's' : ''}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default BudgetOverviewCard
