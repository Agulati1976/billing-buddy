INSERT INTO public.platform_admins (user_id)
SELECT user_id FROM public.profiles WHERE email = 'nehal@ehub.co.in'
ON CONFLICT DO NOTHING;