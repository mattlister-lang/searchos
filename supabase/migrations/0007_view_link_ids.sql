-- 0007_view_link_ids.sql
-- IA rule: every reference rendered anywhere is a link (engineering.md §4).
-- v_deal_board carried the company name but not its id, so the deal board
-- could not link to the company page. Views expose the ids the UI links on.

create or replace view v_deal_board with (security_invoker = on) as
select
  d.id          as deal_id,
  d.name,
  d.stage,
  d.value,
  d.next_step,
  co.name       as company,
  p.full_name   as primary_contact,
  d.updated_at,
  co.id         as company_id,
  p.id          as primary_contact_id
from deal d
join company co on co.id = d.company_id
left join person p on p.id = d.primary_contact_id;
