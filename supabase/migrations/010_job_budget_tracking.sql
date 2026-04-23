/*
  Migration: 010_job_budget_tracking
  Description: Add job contract_value and create job_budget_summary view for budget tracking.
  Date: 2026-04-05
  Tables: jobs, quote_drafts
*/

alter table jobs
  add column if not exists contract_value numeric(12,2) default 0;

create or replace view job_budget_summary as
select
  jobs.id as job_id,
  jobs.name as job_name,
  jobs.contractor_id as contractor_id,
  jobs.status as job_status,
  jobs.contract_value as original_contract,
  coalesce(sum(case when quote_drafts.status = 'approved' then quote_drafts.amount end), 0) as approved_changes,
  coalesce(sum(case when quote_drafts.status not in ('approved','rejected') then quote_drafts.amount end), 0) as pending_changes,
  jobs.contract_value + coalesce(sum(case when quote_drafts.status = 'approved' then quote_drafts.amount end), 0) as revised_total,
  count(case when quote_drafts.status = 'approved' then 1 end) as approved_count,
  count(case when quote_drafts.status not in ('approved','rejected') then 1 end) as pending_count,
  (jobs.contract_value > 0 and (jobs.contract_value + coalesce(sum(case when quote_drafts.status = 'approved' then quote_drafts.amount end), 0)) > (jobs.contract_value * 1.10)) as over_budget,
  coalesce(max(case when quote_drafts.status not in ('approved','rejected') and quote_drafts.created_at < (now() - interval '48 hours') then true end), false) as has_stale_pending,
  max(quote_drafts.created_at) as last_change_at
from jobs
left join quote_drafts on quote_drafts.job_id = jobs.id
group by jobs.id, jobs.name, jobs.contractor_id, jobs.status, jobs.contract_value;

-- SELECT * FROM job_budget_summary LIMIT 5;
