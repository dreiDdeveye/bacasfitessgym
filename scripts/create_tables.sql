-- Users table
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Subscription History table
CREATE TABLE subscription_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scan Logs table
CREATE TABLE scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action TEXT NOT NULL CHECK (action IN ('check-in', 'check-out')),
  status TEXT NOT NULL CHECK (status IN ('success', 'expired', 'invalid')) DEFAULT 'success'
);

-- Active Sessions table
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE UNIQUE,
  user_name TEXT NOT NULL,
  check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User ID Counter table (for BCF-XXXX generation)
CREATE TABLE user_id_counter (
  id INT PRIMARY KEY DEFAULT 1,
  last_number INT DEFAULT 1000
);

-- Insert initial counter
INSERT INTO user_id_counter (id, last_number) VALUES (1, 1000);

-- Create indexes for better query performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_scan_logs_user_id ON scan_logs(user_id);
CREATE INDEX idx_scan_logs_timestamp ON scan_logs(timestamp DESC);
CREATE INDEX idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX idx_active_sessions_user_id ON active_sessions(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_id_counter ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all access to subscriptions" ON subscriptions FOR ALL USING (true);
CREATE POLICY "Allow all access to subscription_history" ON subscription_history FOR ALL USING (true);
CREATE POLICY "Allow all access to scan_logs" ON scan_logs FOR ALL USING (true);
CREATE POLICY "Allow all access to active_sessions" ON active_sessions FOR ALL USING (true);
CREATE POLICY "Allow all access to user_id_counter" ON user_id_counter FOR ALL USING (true);
