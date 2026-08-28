-- Migration 036: Drop pagos_historial (old pagos table, no longer needed after normalization)

DROP TABLE IF EXISTS pagos_historial;
