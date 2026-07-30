-- Keep conservative INR reservations aligned with the billing-console rate
-- observed when Vertex AI automation was configured.
update public.social_ai_budget_controls
set usd_to_inr_rate = 94.4,
    updated_at = now()
where credit_currency = 'INR';
