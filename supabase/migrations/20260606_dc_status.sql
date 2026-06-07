CREATE TABLE IF NOT EXISTS dc_status (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text        NOT NULL DEFAULT '준비중',
  product_name text       NOT NULL,
  hospital_name text      NOT NULL,
  progress    text,
  memo        text,
  sort_order  int         NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dc_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dc_select_all"  ON dc_status FOR SELECT USING (true);
CREATE POLICY "dc_insert_auth" ON dc_status FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "dc_update_auth" ON dc_status FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "dc_delete_auth" ON dc_status FOR DELETE USING (auth.uid() IS NOT NULL);
