-- ═══════════════════════════════════════════════════════════════════
-- ODB Platform — Migration 001: Activity Logs + Platform Settings
-- Запустити в: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Логи активності користувачів ────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  user_id      UUID,
  user_email   TEXT,
  action       TEXT        NOT NULL,   -- 'search', 'view_person', 'login', 'export'
  query        TEXT,                   -- пошуковий запит
  query_type   TEXT,                   -- 'name', 'phone', 'email', тощо
  result_count INTEGER     DEFAULT 0,
  person_id    UUID,                   -- якщо переглядали картку особи
  ip_address   TEXT,
  user_agent   TEXT,
  device_type  TEXT,                   -- 'desktop', 'mobile', 'tablet'
  country      TEXT,
  duration_ms  INTEGER                 -- час відповіді ms
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email  ON activity_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action      ON activity_logs(action);

-- RLS: тільки service_role може читати/писати (користувачі не бачать)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON activity_logs
  USING (auth.role() = 'service_role');

-- ── 2. Налаштування платформи (API ключі тощо) ─────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  is_secret   BOOLEAN     DEFAULT false,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON platform_settings
  USING (auth.role() = 'service_role');

-- ── 3. Початкові налаштування ───────────────────────────────────────
INSERT INTO platform_settings (key, value, description, is_secret) VALUES
  ('SHODAN_API_KEY',    '', 'Shodan API ключ для мережевої розвідки',   true),
  ('DEHASHED_API_KEY',  '', 'DeHashed API ключ для витоків',            true),
  ('DEHASHED_EMAIL',    '', 'Email акаунту DeHashed',                   false),
  ('LEAKCHECK_API_KEY', '', 'LeakCheck API ключ',                       true),
  ('SNUSBASE_API_KEY',  '', 'SnusBase API ключ',                        true),
  ('VK_ACCESS_TOKEN',   '', 'VK Service Token для пошуку',              true),
  ('YOUCONTROL_API_KEY','', 'YouControl API ключ',                      true),
  ('OPENDATABOT_API_KEY','','Opendatabot API ключ',                     true),
  ('ADMIN_EMAILS',      'vmak948@gmail.com', 'Email адміністраторів (через кому)', false),
  ('MAX_RESULTS_PER_PAGE', '50', 'Кількість результатів на сторінку',  false),
  ('SESSION_TIMEOUT_HOURS', '24', 'Таймаут сесії в годинах',            false)
ON CONFLICT (key) DO NOTHING;

-- ── 4. Профілі користувачів (розширення auth.users) ────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role         TEXT        DEFAULT 'analyst',  -- 'admin', 'analyst', 'viewer'
  is_active    BOOLEAN     DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen    TIMESTAMPTZ,
  notes        TEXT
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
-- Кожен бачить тільки свій профіль, admin бачить всіх
CREATE POLICY "own_profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "service_role_all" ON user_profiles
  USING (auth.role() = 'service_role');

-- Тригер: автоматично створює профіль при реєстрації
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'analyst')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();
