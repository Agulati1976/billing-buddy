
INSERT INTO storage.buckets (id, name, public) 
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read business logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'business-logos');

CREATE POLICY "Auth upload business logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-logos');

CREATE POLICY "Auth update business logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'business-logos');

CREATE POLICY "Auth delete business logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'business-logos');
