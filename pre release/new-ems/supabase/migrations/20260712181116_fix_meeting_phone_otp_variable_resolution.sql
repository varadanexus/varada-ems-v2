do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.issue_meeting_phone_otp(text,integer,integer)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'where credential_id = v_credential.id',
    'where public.meeting_join_otp_challenges.credential_id = v_credential.id'
  );
  execute v_definition;

  select pg_get_functiondef('public.verify_meeting_phone_otp(uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'where challenge_token = p_challenge_token',
    'where public.meeting_join_otp_challenges.challenge_token = p_challenge_token'
  );
  execute v_definition;
end;
$migration$;;
