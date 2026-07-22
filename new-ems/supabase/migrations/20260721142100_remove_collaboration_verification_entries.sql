-- Remove the narrowly named entries created during live verification of the
-- collaborative annotations/bookmarks release.
delete from public.legal_document_annotations
where body='Temporary collaborative annotation test'
  and quoted_text='Temporary verification reference';

delete from public.legal_document_bookmarks
where label in ('Temporary bookmark A','Temporary bookmark B')
  and note in ('Temporary persistence check A','Temporary persistence check B');
