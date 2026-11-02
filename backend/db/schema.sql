PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  customer_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE plans (
  plan_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_fee INTEGER NOT NULL CHECK (monthly_fee >= 0),
  data_limit_gb REAL NOT NULL CHECK (data_limit_gb >= 0),
  voice_minutes INTEGER NOT NULL CHECK (voice_minutes >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE subscriptions (
  subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE REFERENCES customers(customer_id),
  plan_id TEXT NOT NULL REFERENCES plans(plan_id),
  contract_end_date TEXT NOT NULL CHECK (contract_end_date GLOB '????-??-??')
);

CREATE TABLE bills (
  bill_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  billing_month TEXT NOT NULL CHECK (billing_month GLOB '????-??'),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  due_date TEXT NOT NULL CHECK (due_date GLOB '????-??-??'),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID','UNPAID','OVERDUE')),
  UNIQUE (customer_id, billing_month)
);

CREATE TABLE usage_records (
  usage_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  month TEXT NOT NULL CHECK (month GLOB '????-??'),
  data_used_gb REAL NOT NULL CHECK (data_used_gb >= 0),
  voice_used_minutes INTEGER NOT NULL CHECK (voice_used_minutes >= 0),
  UNIQUE (customer_id, month)
);

CREATE TABLE plan_change_requests (
  request_id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  old_plan_id TEXT NOT NULL REFERENCES plans(plan_id),
  new_plan_id TEXT NOT NULL REFERENCES plans(plan_id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at TEXT NOT NULL,
  CHECK (old_plan_id <> new_plan_id)
);

CREATE UNIQUE INDEX ux_pending_customer
ON plan_change_requests(customer_id)
WHERE status = 'PENDING';
