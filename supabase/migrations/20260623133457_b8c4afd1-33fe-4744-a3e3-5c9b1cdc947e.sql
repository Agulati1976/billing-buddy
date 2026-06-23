
-- Allow business members (not just owners/admins) to delete invoice_items so invoice edits work
DROP POLICY IF EXISTS "Owners/admins delete invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Members delete invoice items" ON public.invoice_items;
CREATE POLICY "Members delete invoice items"
ON public.invoice_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_business_member(auth.uid(), i.business_id)
  )
);

-- Allow business members to delete stock_movements (needed when editing an invoice)
DROP POLICY IF EXISTS "Owners delete stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Members delete stock movements" ON public.stock_movements;
CREATE POLICY "Members delete stock movements"
ON public.stock_movements FOR DELETE
TO authenticated
USING (public.is_business_member(auth.uid(), business_id));

-- Re-create invoice_items INSERT policy with explicit authenticated role, and broaden the
-- check so members of the invoice's business can always insert lines. Also handle the case
-- where the invoice was just updated by allowing inserts when the caller has any role on
-- that business.
DROP POLICY IF EXISTS "Members create invoice items" ON public.invoice_items;
CREATE POLICY "Members create invoice items"
ON public.invoice_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_business_member(auth.uid(), i.business_id)
  )
);

-- Same for UPDATE
DROP POLICY IF EXISTS "Members update invoice items" ON public.invoice_items;
CREATE POLICY "Members update invoice items"
ON public.invoice_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_business_member(auth.uid(), i.business_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_business_member(auth.uid(), i.business_id)
  )
);
