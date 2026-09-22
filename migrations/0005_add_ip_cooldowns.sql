CREATE TABLE ip_cooldowns (
  client_ip_hash TEXT PRIMARY KEY,
  last_submitted_at TEXT NOT NULL
);
