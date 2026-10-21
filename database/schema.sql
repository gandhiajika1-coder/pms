-- Parking Manager schema for MySQL 8.0.16 or newer.
-- Run this in MySQL Workbench against a new parking_manager database.

CREATE TABLE profiles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  role ENUM('admin','supervisor','cashier','viewer') NOT NULL DEFAULT 'cashier',
  can_authorize_credit BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tenants (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_code VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(80),
  email VARCHAR(254),
  organization VARCHAR(200),
  monthly_rate_rwf BIGINT NOT NULL DEFAULT 0 CHECK (monthly_rate_rwf >= 0),
  credit_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  credit_limit_rwf BIGINT NOT NULL DEFAULT 0 CHECK (credit_limit_rwf >= 0),
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT tenants_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36),
  plate_number VARCHAR(80) NOT NULL UNIQUE,
  vehicle_type VARCHAR(40) NOT NULL DEFAULT 'car',
  make_model VARCHAR(160),
  color VARCHAR(80),
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vehicles_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT vehicles_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB;

CREATE TABLE parking_sessions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  session_number BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  vehicle_id CHAR(36) NOT NULL,
  tenant_id CHAR(36),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  fee_rwf BIGINT NOT NULL CHECK (fee_rwf >= 0),
  status ENUM('open','closed','cancelled') NOT NULL DEFAULT 'open',
  invoice_id CHAR(36),
  created_by CHAR(36) NOT NULL,
  closed_by CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  open_vehicle_id CHAR(36) GENERATED ALWAYS AS (CASE WHEN status = 'open' THEN vehicle_id ELSE NULL END) STORED,
  CONSTRAINT sessions_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT sessions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT sessions_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT sessions_closed_by_fk FOREIGN KEY (closed_by) REFERENCES profiles(id),
  CONSTRAINT sessions_time_check CHECK (ended_at IS NULL OR ended_at >= started_at),
  UNIQUE KEY one_open_session_per_vehicle (open_vehicle_id),
  INDEX sessions_started_idx (started_at)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  invoice_number VARCHAR(80) NOT NULL UNIQUE,
  tenant_id CHAR(36),
  vehicle_id CHAR(36),
  parking_session_id CHAR(36) UNIQUE,
  invoice_type ENUM('daily_parking','monthly_tenant','adjustment') NOT NULL,
  period_start DATE,
  period_end DATE,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TIMESTAMP NULL,
  description VARCHAR(500) NOT NULL,
  total_rwf BIGINT NOT NULL CHECK (total_rwf >= 0),
  paid_rwf BIGINT NOT NULL DEFAULT 0,
  status ENUM('open','partial','paid','overdue','void') NOT NULL DEFAULT 'open',
  pay_later_authorized_by CHAR(36),
  pay_later_authorized_at TIMESTAMP NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT invoices_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT invoices_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT invoices_session_fk FOREIGN KEY (parking_session_id) REFERENCES parking_sessions(id),
  CONSTRAINT invoices_authorized_by_fk FOREIGN KEY (pay_later_authorized_by) REFERENCES profiles(id),
  CONSTRAINT invoices_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT invoices_paid_check CHECK (paid_rwf >= 0 AND paid_rwf <= total_rwf),
  CONSTRAINT invoices_authorization_check CHECK ((pay_later_authorized_by IS NULL) = (pay_later_authorized_at IS NULL)),
  CONSTRAINT invoices_period_check CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  INDEX invoices_tenant_due_idx (tenant_id, status, due_at),
  INDEX invoices_status_due_idx (status, due_at)
) ENGINE=InnoDB;

ALTER TABLE parking_sessions
  ADD CONSTRAINT sessions_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id);

CREATE TABLE payments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  receipt_number VARCHAR(80) NOT NULL UNIQUE,
  tenant_id CHAR(36),
  amount_rwf BIGINT NOT NULL CHECK (amount_rwf > 0),
  method ENUM('cash','mobile_money','bank_transfer','card','other') NOT NULL,
  reference_number VARCHAR(160),
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  notes TEXT,
  recorded_by CHAR(36) NOT NULL,
  reversed_by CHAR(36),
  reversed_at TIMESTAMP NULL,
  reversal_reason VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payments_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT payments_recorded_by_fk FOREIGN KEY (recorded_by) REFERENCES profiles(id),
  CONSTRAINT payments_reversed_by_fk FOREIGN KEY (reversed_by) REFERENCES profiles(id),
  CONSTRAINT payments_reversal_check CHECK ((status = 'reversed') = (reversed_at IS NOT NULL)),
  INDEX payments_paid_at_idx (status, paid_at)
) ENGINE=InnoDB;

CREATE TABLE payment_allocations (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  invoice_id CHAR(36) NOT NULL,
  amount_rwf BIGINT NOT NULL CHECK (amount_rwf > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT allocations_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT allocations_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  UNIQUE KEY allocation_per_invoice (payment_id, invoice_id),
  INDEX allocations_invoice_idx (invoice_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36),
  action VARCHAR(20) NOT NULL,
  table_name VARCHAR(80) NOT NULL,
  record_id VARCHAR(160),
  old_data JSON,
  new_data JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES profiles(id)
) ENGINE=InnoDB;

DELIMITER $$
CREATE TRIGGER enforce_invoice_credit_insert BEFORE INSERT ON invoices FOR EACH ROW
BEGIN
  IF NEW.total_rwf > NEW.paid_rwf THEN
    IF NEW.pay_later_authorized_by IS NULL OR NEW.pay_later_authorized_at IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Outstanding balance requires pay-later authorization';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = @app_user_id AND p.active = TRUE
        AND (p.role IN ('admin','supervisor') OR p.can_authorize_credit = TRUE)
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staff member cannot approve pay-later';
    END IF;
    IF NOT (NEW.pay_later_authorized_by <=> @app_user_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Authorizing staff must be the signed-in user';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM tenants t WHERE t.id = NEW.tenant_id AND t.credit_allowed = TRUE
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tenant is not approved for credit';
    END IF;
  END IF;
END$$
CREATE TRIGGER enforce_invoice_credit_update BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
  IF NEW.total_rwf > NEW.paid_rwf THEN
    IF NEW.pay_later_authorized_by IS NULL OR NEW.pay_later_authorized_at IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Outstanding balance requires pay-later authorization';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = @app_user_id AND p.active = TRUE
        AND (p.role IN ('admin','supervisor') OR p.can_authorize_credit = TRUE)
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staff member cannot approve pay-later';
    END IF;
    IF NOT (NEW.pay_later_authorized_by <=> @app_user_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Authorizing staff must be the signed-in user';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM tenants t WHERE t.id = NEW.tenant_id AND t.credit_allowed = TRUE
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tenant is not approved for credit';
    END IF;
  END IF;
END$$
DELIMITER ;
