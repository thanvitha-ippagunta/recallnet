-- RecallNet authentication and RBAC migration | MySQL 8.0.16+
-- Apply once, after the core RecallNet schema. This adds authentication-only
-- tables and does not alter existing business tables or records.
USE recallnet;

CREATE TABLE app_users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','QUALITY_MANAGER','WAREHOUSE_MANAGER','DISTRIBUTOR') NOT NULL,
  distributor_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_app_users_email (email),
  KEY idx_app_users_distributor (distributor_id),
  CONSTRAINT fk_app_users_distributor
    FOREIGN KEY (distributor_id) REFERENCES distributors(distributor_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_app_users_distributor_role CHECK (
    (role = 'DISTRIBUTOR' AND distributor_id IS NOT NULL)
    OR (role <> 'DISTRIBUTOR' AND distributor_id IS NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE auth_sessions (
  session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_user_expiry (user_id, expires_at),
  KEY idx_auth_sessions_expiry (expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES app_users(user_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE auth_login_rate_limits (
  limiter_key BINARY(32) NOT NULL,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME NOT NULL,
  blocked_until DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (limiter_key),
  CONSTRAINT chk_auth_login_failed_attempts CHECK (failed_attempts <= 5)
) ENGINE=InnoDB;
