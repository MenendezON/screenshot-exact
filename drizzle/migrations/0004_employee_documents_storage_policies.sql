CREATE POLICY "Lire les fichiers de documents visibles"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-documents'
         AND EXISTS (SELECT 1 FROM public.documents d WHERE d.storage_path = storage.objects.name));

CREATE POLICY "Déposer un fichier de document"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-documents'
              AND (public.has_permission_on('documents', 'create', ((storage.foldername(name))[1])::uuid)
                   OR public.has_permission_on('confidential_documents', 'create', ((storage.foldername(name))[1])::uuid)));
