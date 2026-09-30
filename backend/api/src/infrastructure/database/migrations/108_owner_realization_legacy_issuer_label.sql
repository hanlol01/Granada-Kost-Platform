BEGIN;

-- Capture the best available issuer label once for receipts issued before
-- issuer_name became part of the immutable receipt snapshot.
CREATE TABLE property_owner_realization_legacy_issuer_labels (
  document_id UUID PRIMARY KEY REFERENCES property_owner_realization_documents(id) ON DELETE RESTRICT,
  issuer_name TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO property_owner_realization_legacy_issuer_labels(document_id,issuer_name)
SELECT document.id,COALESCE(NULLIF(trim(issuer.display_name),''),'Admin KOSTATION')
FROM property_owner_realization_documents document
LEFT JOIN users issuer ON issuer.id=document.issued_by_user_id
WHERE document.document_kind='payout_receipt'
  AND NULLIF(trim(document.document_snapshot->>'issuer_name'),'') IS NULL
ON CONFLICT (document_id) DO NOTHING;

CREATE TRIGGER trg_owner_realization_legacy_issuer_immutable
BEFORE UPDATE OR DELETE ON property_owner_realization_legacy_issuer_labels
FOR EACH ROW EXECUTE FUNCTION reject_owner_realization_evidence_mutation();

COMMIT;
