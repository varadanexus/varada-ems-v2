-- Cover Goa payment-group foreign keys without touching EMS indexes.
create index payment_groups_head_account_idx on goa_private.payment_groups(head_account_id);
create index payment_groups_created_by_idx on goa_private.payment_groups(created_by);
create index payment_group_members_account_idx on goa_private.payment_group_members(account_id) where account_id is not null;
create index payment_group_members_manual_idx on goa_private.payment_group_members(manual_crew_id) where manual_crew_id is not null;

