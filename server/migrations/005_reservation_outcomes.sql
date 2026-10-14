ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check CHECK(status IN ('held','released','sold'));
ALTER TABLE reservations ADD COLUMN closed_at timestamptz;
ALTER TABLE reservations ADD COLUMN completion_request_id uuid;
ALTER TABLE reservations ADD COLUMN completion_reason text;
ALTER TABLE reservations ADD COLUMN completed_by uuid;
ALTER TABLE reservations ADD CONSTRAINT reservations_completion_request_key UNIQUE(dealer_id,completion_request_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_completed_by_fk FOREIGN KEY(completed_by,dealer_id) REFERENCES users(id,dealer_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_sale_metadata CHECK(status<>'sold' OR (closed_at IS NOT NULL AND completion_request_id IS NOT NULL AND completed_by IS NOT NULL AND length(completion_reason) BETWEEN 5 AND 300));

-- Only rename the original demo business; preserve any customised dealer name.
UPDATE dealers SET name='Taha Hadj Lakehal'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND name='Hadj Lakehal Metals';
