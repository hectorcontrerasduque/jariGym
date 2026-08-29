-- Migration 037: API Rate Limits - Contadores de peticiones para prevenir abuso
-- Tabla autolimpiante vía lazy cleanup (1% probabilidad por petición)

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key TEXT PRIMARY KEY,                    -- "rl:auth:192.168.1.1" o "rl:api:user-uuid"
  count INTEGER NOT NULL DEFAULT 1,        -- Peticiones en ventana actual
  reset_at TIMESTAMPTZ NOT NULL,           -- Cuándo expira la ventana
  created_at TIMESTAMPTZ DEFAULT NOW()     -- Para debugging
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at 
  ON public.api_rate_limits(reset_at);

COMMENT ON TABLE public.api_rate_limits IS 
  'Contadores de rate limiting para APIs. Limpieza lazy (1% requests). Clave: "rl:{prefix}:{ip|user_id}"';

-- Función RPC atómica: incrementa contador + resetea si ventana expiró
CREATE OR REPLACE FUNCTION public.increment_api_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
) RETURNS TABLE(
  success BOOLEAN,
  limit_max INTEGER,
  remaining INTEGER,
  reset TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_reset TIMESTAMPTZ := v_now + (p_window_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Upsert atómico con reset de ventana automático
  INSERT INTO public.api_rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_reset)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE 
      WHEN public.api_rate_limits.reset_at < v_now THEN 1  -- Ventana expirada → reset
      ELSE public.api_rate_limits.count + 1
    END,
    reset_at = CASE 
      WHEN public.api_rate_limits.reset_at < v_now THEN v_reset
      ELSE public.api_rate_limits.reset_at
    END
  WHERE public.api_rate_limits.key = p_key
  RETURNING 
    (CASE WHEN public.api_rate_limits.count > p_max THEN FALSE ELSE TRUE END) AS success,
    p_max AS limit_max,
    GREATEST(p_max - 
      CASE 
        WHEN public.api_rate_limits.reset_at < v_now THEN 1 
        ELSE public.api_rate_limits.count 
      END, 0) AS remaining,
    CASE 
      WHEN public.api_rate_limits.reset_at < v_now THEN v_reset 
      ELSE public.api_rate_limits.reset_at 
    END AS reset;
END $$;

GRANT EXECUTE ON FUNCTION public.increment_api_rate_limit TO authenticated, anon;