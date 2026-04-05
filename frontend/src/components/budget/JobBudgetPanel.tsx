import React from 'react'

interface JobBudgetPanelProps {
  jobId: string
  onNavigateToQueue: (jobId: string) => void
}

interface BudgetRow {
  job_id: string
  job_name: string
  contractor_id: string
  job_status: string
  original_contract: number
  approved_changes: number
  pending_changes: number
  revised_total: number
  approved_count: number
  pending_count: number
  over_budget: boolean
  has_stale_pending: boolean
  last_change_at: string | null
  overage_percent: number | null
  status_color: 'green' | 'yellow' | 'red'
}

const statusColorMap: Record<BudgetRow['status_color'], string> = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
}

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })

const JobBudgetPanel: React.FC<JobBudgetPanelProps> = ({ jobId, onNavigateToQueue }) => {
  const [data, setData] = React.useState<BudgetRow | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [contractValue, setContractValue] = React.useState<string>('')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const apiUrl = import.meta.env.VITE_API_URL
  const apiKey = import.meta.env.VITE_API_KEY

  const fetchBudget = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiUrl}/budget/jobs/${jobId}`, {
        headers: {
          'X-API-Key': apiKey,
        },
      })

      if (!response.ok) {
        throw new Error('Failed')
      }

      const payload = (await response.json()) as BudgetRow
      setData(payload)
      setContractValue(payload.original_contract.toFixed(2))
    } catch {
      setError('Could not load budget data')
    } finally {
      setLoading(false)
    }
  }, [apiKey, apiUrl, jobId])

  React.useEffect(() => {
    fetchBudget()
  }, [fetchBudget])

  const handleSave = async () => {
    const parsed = Number(contractValue)
    if (Number.isNaN(parsed) || parsed < 0) {
      setSaveError('Enter a valid contract value')
      return
    }

    setSaveError(null)
    try {
      const response = await fetch(`${apiUrl}/budget/jobs/${jobId}/contract-value`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ contract_value: parsed }),
      })

      if (!response.ok) {
        throw new Error('Failed')
      }

      const payload = (await response.json()) as BudgetRow
      setData(payload)
      setContractValue(payload.original_contract.toFixed(2))
      setEditing(false)
    } catch {
      setSaveError('Could not update contract value')
    }
  }

  const renderStatusPill = () => {
    if (!data) {
      return null
    }
    if (data.status_color === 'red') {
      return (
        <span
          className="rounded-full px-3 py-1 text-[11px] uppercase tracking-widest"
          style={{
            backgroundColor: 'rgba(248, 113, 113, 0.15)',
            color: '#f87171',
            fontFamily: "'Azeret Mono', monospace",
          }}
        >
          Over Budget
        </span>
      )
    }
    if (data.has_stale_pending) {
      return (
        <span
          className="rounded-full px-3 py-1 text-[11px] uppercase tracking-widest"
          style={{
            backgroundColor: 'rgba(250, 204, 21, 0.15)',
            color: '#facc15',
            fontFamily: "'Azeret Mono', monospace",
          }}
        >
          Pending Review
        </span>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="w-full rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-6">
        <div className="h-6 w-1/3 animate-pulse rounded bg-[#2A2A2A]" />
        <div className="mt-4 h-16 w-full animate-pulse rounded bg-[#2A2A2A]" />
        <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-[#2A2A2A]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-6 text-center text-[#8A8A8A]">
        {error}
      </div>
    )
  }

  if (!data) {
    return null
  }

  const statusColor = statusColorMap[data.status_color]

  return (
    <div className="w-full rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-6">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Job Budget</div>
        {renderStatusPill()}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="border-b border-[#2A2A2A] pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
          <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Original Contract</div>
          <div className="mt-2 flex items-center gap-2">
            {!editing ? (
              <span
                className="text-[28px] text-[#F5F0E8]"
                style={{ fontFamily: "'Azeret Mono', monospace" }}
              >
                {formatCurrency(data.original_contract)}
              </span>
            ) : (
              <input
                value={contractValue}
                onChange={(event) => setContractValue(event.target.value)}
                className="w-40 rounded border border-[#2A2A2A] bg-[#0F0F0F] px-2 py-1 text-[28px] text-[#F5F0E8]"
                style={{ fontFamily: "'Azeret Mono', monospace" }}
              />
            )}
            {!editing ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true)
                  setSaveError(null)
                }}
                aria-label="Edit contract value"
                className="text-[#8A8A8A]"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            ) : null}
          </div>
          {editing ? (
            <div className="mt-2 flex items-center gap-4 text-[12px]">
              <button
                type="button"
                onClick={handleSave}
                className="text-[#C1522A]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setContractValue(data.original_contract.toFixed(2))
                  setSaveError(null)
                }}
                className="text-[#8A8A8A]"
              >
                Cancel
              </button>
            </div>
          ) : null}
          {saveError ? <div className="mt-2 text-[12px] text-[#f87171]">{saveError}</div> : null}
        </div>

        <div className="border-b border-[#2A2A2A] pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
          <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Approved Changes</div>
          <div
            className="mt-2 text-[28px]"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              color: data.approved_changes > 0 ? '#4ade80' : '#F5F0E8',
            }}
          >
            {formatCurrency(data.approved_changes)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">Pending</div>
          <div
            className="mt-2 text-[28px]"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              color: data.pending_changes > 0 ? '#facc15' : '#F5F0E8',
            }}
          >
            {formatCurrency(data.pending_changes)}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-[#2A2A2A] pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[18px] text-[#F5F0E8]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Revised Total
          </div>
          <div
            className="text-[32px]"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              color: statusColor,
            }}
          >
            {formatCurrency(data.revised_total)}
          </div>
          {data.overage_percent !== null && data.overage_percent > 0 ? (
            <div className="text-[13px] text-[#8A8A8A]">+{data.overage_percent}% over original</div>
          ) : null}
        </div>
      </div>

      {data.pending_count > 0 ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => onNavigateToQueue(jobId)}
            className="w-full rounded-md bg-[#C1522A] px-5 py-3 text-[14px] font-medium text-[#F5F0E8] hover:bg-[#D4623A]"
          >
            Review {data.pending_count} Pending Change{data.pending_count > 1 ? 's' : ''} →
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default JobBudgetPanel
