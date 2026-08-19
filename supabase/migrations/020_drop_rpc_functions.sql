-- Migration 020: Drop RPC functions created in migration 019
-- Use this to roll back migration 019 if needed

DROP FUNCTION IF EXISTS aprobar_pago_atomico(UUID, UUID);
DROP FUNCTION IF EXISTS toggle_membresia_libre(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS actualizar_estado_miembro(UUID, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS actualizar_metodo_pago_atomico(UUID, NUMERIC, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS crear_miembro_completo(UUID, TEXT, TEXT, UUID);
