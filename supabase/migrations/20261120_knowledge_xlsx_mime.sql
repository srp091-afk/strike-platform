-- Разрешить Excel в бакете базы знаний. Повторный запуск безопасен.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'knowledge_bases';
