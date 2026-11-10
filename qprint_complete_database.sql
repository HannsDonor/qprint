-- ============================================================
-- QPRINT COMPLETE DATABASE
-- MySQL 8.0+ (XAMPP / phpMyAdmin)
--
-- Architecture:
--   1. QPrint website/backend handles customers, shops, jobs,
--      QR validation, payments, services, pricing and queue.
--   2. Each shop's Windows PC runs a registered Local Printing
--      Service (shop_devices) that receives authorized jobs.
--   3. The shop's camera is accessed by the browser; a separate
--      camera table is not required for the initial design.
--   4. printers stores the shop's physical printer configuration.
--
-- IMPORTANT:
--   - This creates a fresh database named qprint_db.
--   - Back up existing data before running.
--   - Store PDF files on server/local file storage, not in MySQL.
--   - Store password hashes and device-token hashes, never plaintext.
--   - Payment confirmation, QR validation, queueing and print
--     authorization must be implemented in backend transactions.
-- ============================================================

CREATE DATABASE IF NOT EXISTS qprint_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE qprint_db;

-- 1. USERS
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('customer','shop_owner') NOT NULL DEFAULT 'customer',
  contact_number VARCHAR(30) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

-- 2. SHOPS
CREATE TABLE shops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  shop_name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  contact_number VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  logo_path VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shops_owner FOREIGN KEY (owner_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_shops_owner (owner_id),
  INDEX idx_shops_active (is_active)
) ENGINE=InnoDB;

-- 3. SHOP OPERATING HOURS
CREATE TABLE shop_hours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  opening_time TIME NULL,
  closing_time TIME NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_shop_hours_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_shop_day (shop_id, day_of_week)
) ENGINE=InnoDB;

-- 4. SHOP SERVICES
-- Each shop owner creates and manages their own services.
CREATE TABLE shop_services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  service_name VARCHAR(150) NOT NULL,
  category ENUM('printing','photocopy','lamination','binding','other') NOT NULL DEFAULT 'other',
  description TEXT NULL,
  pricing_type ENUM('per_page','per_sheet','per_copy','fixed','custom') NOT NULL DEFAULT 'fixed',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shop_services_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_services_shop_available (shop_id, is_available),
  INDEX idx_services_category (category)
) ENGINE=InnoDB;

-- 5. SERVICE PRICE OPTIONS
-- A service may have multiple options, e.g. A4 B&W, A4 color,
-- ID lamination, A4 lamination, etc.
CREATE TABLE shop_service_prices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  option_name VARCHAR(120) NULL,
  paper_size VARCHAR(30) NULL,
  color_mode ENUM('black_white','colored') NULL,
  duplex BOOLEAN NULL,
  price DECIMAL(10,2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_prices_service FOREIGN KEY (service_id) REFERENCES shop_services(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_service_price_nonnegative CHECK (price >= 0),
  INDEX idx_service_prices_service (service_id, is_available)
) ENGINE=InnoDB;

-- 6. SHOP WINDOWS COMPUTERS / LOCAL PRINTING AGENTS
-- One shop can register one or more Windows computers.
-- device_token_hash is a hash of a generated secret token.
CREATE TABLE shop_devices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  device_name VARCHAR(150) NOT NULL,
  device_identifier VARCHAR(255) NOT NULL UNIQUE,
  operating_system VARCHAR(100) NOT NULL DEFAULT 'Windows',
  agent_version VARCHAR(50) NULL,
  device_token_hash VARCHAR(255) NULL,
  connection_status ENUM('connected','disconnected','unknown') NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shop_devices_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_shop_devices_status (shop_id, connection_status),
  INDEX idx_shop_devices_active (is_active)
) ENGINE=InnoDB;

-- 7. PRINTERS
-- Physical printers registered by a shop and optionally assigned
-- to a particular Windows computer running the local agent.
CREATE TABLE printers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  shop_device_id BIGINT UNSIGNED NULL,
  printer_name VARCHAR(150) NOT NULL,
  brand VARCHAR(100) NULL,
  model VARCHAR(100) NULL,
  printer_type ENUM('inkjet','laser','other') NOT NULL DEFAULT 'other',
  connection_type ENUM('usb','network','shared','other') NOT NULL DEFAULT 'usb',
  printer_identifier VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  supports_color BOOLEAN NOT NULL DEFAULT TRUE,
  supports_duplex BOOLEAN NOT NULL DEFAULT FALSE,
  supported_paper_sizes JSON NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  availability_status ENUM('available','unavailable','maintenance') NOT NULL DEFAULT 'available',
  connection_status ENUM('connected','disconnected','unknown') NOT NULL DEFAULT 'unknown',
  last_connected_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_printers_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_printers_device FOREIGN KEY (shop_device_id) REFERENCES shop_devices(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_printers_shop (shop_id),
  INDEX idx_printers_device (shop_device_id),
  INDEX idx_printers_status (shop_id, availability_status, connection_status)
) ENGINE=InnoDB;

-- 8. PRIORITY PRINTING SETTINGS
-- Priority is an optional paid add-on configured independently
-- by each shop. Fee is copied into the job when ordered.
CREATE TABLE shop_priority_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  priority_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_priority_settings_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_priority_fee_nonnegative CHECK (priority_fee >= 0)
) ENGINE=InnoDB;

-- 9. PRINT JOBS
-- A job is for one customer and one selected shop.
-- QR contains a random opaque token; only its hash is stored here.
CREATE TABLE print_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_code VARCHAR(40) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NULL,
  shop_id BIGINT UNSIGNED NOT NULL,
  print_type ENUM('standard','priority') NOT NULL DEFAULT 'standard',
  status ENUM(
    'awaiting_payment',
    'paid',
    'queued',
    'printing',
    'ready_for_pickup',
    'completed',
    'cancelled',
    'expired',
    'failed'
  ) NOT NULL DEFAULT 'awaiting_payment',
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  priority_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  qr_token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NULL,
  paid_at TIMESTAMP NULL,
  queued_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_print_jobs_customer FOREIGN KEY (customer_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_print_jobs_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_job_base_price CHECK (base_price >= 0),
  CONSTRAINT chk_job_priority_fee CHECK (priority_fee >= 0),
  CONSTRAINT chk_job_total_price CHECK (total_price >= 0),
  INDEX idx_jobs_customer (customer_id),
  INDEX idx_jobs_shop_status (shop_id, status),
  INDEX idx_jobs_queue (shop_id, status, print_type, paid_at),
  INDEX idx_jobs_created (created_at)
) ENGINE=InnoDB;

-- 10. UPLOADED DOCUMENT METADATA
-- Actual PDF bytes are stored on file storage, not in this table.
-- One or more documents may belong to a print job.
CREATE TABLE documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  page_count INT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  CONSTRAINT fk_documents_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_document_page_count CHECK (page_count > 0),
  INDEX idx_documents_job (job_id),
  INDEX idx_documents_expiry (expires_at, deleted_at)
) ENGINE=InnoDB;

-- 11. PRINT SETTINGS
-- Settings apply to the document/job as configured by customer.
CREATE TABLE print_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL UNIQUE,
  paper_size ENUM('A4','A3','Letter','Legal','Custom') NOT NULL DEFAULT 'A4',
  color_mode ENUM('black_white','colored') NOT NULL DEFAULT 'black_white',
  copies INT UNSIGNED NOT NULL DEFAULT 1,
  page_range VARCHAR(100) NULL,
  orientation ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  duplex BOOLEAN NOT NULL DEFAULT FALSE,
  pages_per_sheet INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_print_settings_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_print_copies CHECK (copies > 0),
  CONSTRAINT chk_pages_per_sheet CHECK (pages_per_sheet > 0)
) ENGINE=InnoDB;

-- 12. PRINT JOB ITEMS
-- Price/name snapshots preserve what the customer bought even if
-- the shop later edits or archives the original service.
CREATE TABLE print_job_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  service_price_id BIGINT UNSIGNED NULL,
  service_name VARCHAR(150) NOT NULL,
  option_name VARCHAR(120) NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_job_items_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_job_items_service FOREIGN KEY (service_id) REFERENCES shop_services(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_job_items_service_price FOREIGN KEY (service_price_id) REFERENCES shop_service_prices(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_job_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_job_item_unit_price CHECK (unit_price >= 0),
  CONSTRAINT chk_job_item_subtotal CHECK (subtotal >= 0),
  INDEX idx_job_items_job (job_id)
) ENGINE=InnoDB;

-- 13. PAYMENTS
-- Supports cash or GCash recording. For cash, owner confirms receipt.
-- For GCash, confirmation must follow the project's chosen process.
CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('cash','gcash') NOT NULL DEFAULT 'cash',
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  reference_number VARCHAR(100) NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_payments_user FOREIGN KEY (confirmed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_payment_amount CHECK (amount >= 0),
  INDEX idx_payments_job (job_id),
  INDEX idx_payments_status (payment_status),
  INDEX idx_payments_reference (reference_number)
) ENGINE=InnoDB;

-- 14. PRINT ATTEMPTS
-- Tracks each attempt to send a job to a physical printer.
-- Do not mark a job printed merely because a command was submitted;
-- record the local agent/spooler response and handle uncertainty.
CREATE TABLE print_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  printer_id BIGINT UNSIGNED NULL,
  shop_device_id BIGINT UNSIGNED NULL,
  attempt_number INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('pending','processing','submitted','printed','failed','cancelled')
    NOT NULL DEFAULT 'pending',
  local_spooler_job_id VARCHAR(150) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_attempts_printer FOREIGN KEY (printer_id) REFERENCES printers(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_attempts_device FOREIGN KEY (shop_device_id) REFERENCES shop_devices(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_attempt_number CHECK (attempt_number > 0),
  INDEX idx_attempts_job (job_id, created_at),
  INDEX idx_attempts_status (status),
  INDEX idx_attempts_device (shop_device_id, status)
) ENGINE=InnoDB;

-- 15. JOB STATUS HISTORY
-- Audit log of important job state changes.
CREATE TABLE job_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_job_history_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_job_history_user FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_job_history (job_id, created_at)
) ENGINE=InnoDB;

-- 16. TRANSACTIONS
-- One sales/receipt record per job after successful payment.
CREATE TABLE transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL UNIQUE,
  shop_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  subtotal DECIMAL(10,2) NOT NULL,
  priority_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_job FOREIGN KEY (job_id) REFERENCES print_jobs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_transactions_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_transaction_subtotal CHECK (subtotal >= 0),
  CONSTRAINT chk_transaction_priority_fee CHECK (priority_fee >= 0),
  CONSTRAINT chk_transaction_total CHECK (total_amount >= 0),
  INDEX idx_transactions_shop_date (shop_id, transaction_date)
) ENGINE=InnoDB;

-- ============================================================
-- EXAMPLE QUEUE QUERY
-- Use a prepared statement and pass the authenticated shop ID.
-- Priority jobs first; FIFO within each priority class.
-- Only paid jobs in queued status are eligible.
-- ============================================================
-- SELECT id, job_code, print_type, status, paid_at
-- FROM print_jobs
-- WHERE shop_id = ?
--   AND status = 'queued'
--   AND paid_at IS NOT NULL
-- ORDER BY
--   CASE WHEN print_type = 'priority' THEN 0 ELSE 1 END,
--   paid_at ASC,
--   id ASC;

-- ============================================================
-- BACKEND WORKFLOW NOTES
-- 1. Create print job and QR token; store only token hash.
-- 2. Customer selects shop services; calculate prices server-side.
-- 3. Shop owner records/validates payment.
-- 4. Backend atomically marks job paid/queued after confirmation.
-- 5. Browser camera scans QR; backend validates token, shop,
--    payment, expiry and job state.
-- 6. Backend authorizes the registered shop agent to retrieve
--    the document and selected printer settings.
-- 7. Local agent submits to Windows Print Spooler and reports
--    attempt status. Prevent duplicate submissions with an
--    idempotency/locking mechanism in backend logic.
-- 8. Mark ready_for_pickup only after the chosen completion
--    confirmation process; spooler acceptance alone is not
--    proof that paper physically came out.
-- ============================================================
