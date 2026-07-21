-- Let authorised Legal staff see the same collaborative annotations and
-- bookmarks that advocates see. Direct table access remains blocked.
create or replace function public.legal_advocate_admin_marks()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_permission('legal-archive','view') then raise exception 'Legal archive view permission required'; end if;
  return jsonb_build_object(
    'annotations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'share_id',m.share_id,'agreement_no',g.agreement_no,'document_title',coalesce(s.display_title,af.file_name,dd.file_name,g.title),
      'page_number',m.page_number,'annotation_type',m.annotation_type,'body',m.body,'quoted_text',m.quoted_text,'color',m.color,
      'author_name',a.full_name,'created_at',m.created_at,'updated_at',m.updated_at
    ) order by m.updated_at desc) from public.legal_document_annotations m
      join public.legal_advocate_shares s on s.id=m.share_id
      join public.legal_advocates a on a.id=m.advocate_id
      join public.legal_agreements g on g.id=s.agreement_id
      left join public.legal_archive_files af on af.id=s.archive_file_id
      left join public.drive_documents dd on dd.id=s.drive_document_id), '[]'::jsonb),
    'bookmarks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'share_id',m.share_id,'agreement_no',g.agreement_no,'document_title',coalesce(s.display_title,af.file_name,dd.file_name,g.title),
      'page_number',m.page_number,'label',m.label,'note',m.note,'author_name',a.full_name,'created_at',m.created_at,'updated_at',m.updated_at
    ) order by m.updated_at desc) from public.legal_document_bookmarks m
      join public.legal_advocate_shares s on s.id=m.share_id
      join public.legal_advocates a on a.id=m.advocate_id
      join public.legal_agreements g on g.id=s.agreement_id
      left join public.legal_archive_files af on af.id=s.archive_file_id
      left join public.drive_documents dd on dd.id=s.drive_document_id), '[]'::jsonb)
  );
end $$;

revoke all on function public.legal_advocate_admin_marks() from public,anon;
grant execute on function public.legal_advocate_admin_marks() to authenticated;
notify pgrst, 'reload schema';
