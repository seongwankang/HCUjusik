-- 가상화폐 정수 단위. 실제 금전 결제 기능은 포함하지 않는다.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','president','admin')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  cash_balance INTEGER NOT NULL DEFAULT 1000000 CHECK (cash_balance >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE login_attempts (
  username TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '미정',
  description TEXT NOT NULL DEFAULT '',
  reference_price INTEGER NOT NULL DEFAULT 1000 CHECK (reference_price > 0),
  issued_shares INTEGER NOT NULL DEFAULT 0 CHECK (issued_shares >= 0),
  company_cash INTEGER NOT NULL DEFAULT 0 CHECK (company_cash >= 0),
  daily_revenue INTEGER NOT NULL DEFAULT 0 CHECK (daily_revenue >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','listed','halted'))
);

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_president INTEGER NOT NULL DEFAULT 0 CHECK (is_president IN (0,1)),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE holdings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (user_id, company_id)
);

-- 주문은 향후 매매 방식 확정 후에 사용. 현재 서버는 주문 생성 미지원.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  limit_price INTEGER NOT NULL CHECK (limit_price > 0),
  status TEXT NOT NULL CHECK (status IN ('open','partial','filled','canceled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX orders_company_status_idx ON orders(company_id,status);
CREATE INDEX orders_user_idx ON orders(user_id);

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price INTEGER NOT NULL CHECK (price > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id),
  published_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE company_decisions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  decision_type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
