-- TMS local backend provisioning — FROZEN MSSQL REFERENCE (DO NOT RUN for prod).
-- The production backend is Express + Prisma against Supabase PostgreSQL;
-- the Postgres truth is prisma/schema.prisma + prisma/migration.sql.
-- Kept for history only (user decision 2026-10-12).
-- Run from this directory: sqlcmd -S ".\SQLEXPRESS" -E -C -i schema.sql
IF DB_ID('TMS') IS NULL CREATE DATABASE [TMS];
GO
USE [TMS];
GO
-- App users (Base44-compatible auth surface)
IF OBJECT_ID('dbo.[User]') IS NULL
CREATE TABLE dbo.[User] (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  email         NVARCHAR(320) NOT NULL UNIQUE,
  password_hash NVARCHAR(256) NULL,
  full_name     NVARCHAR(200) NULL,
  role          NVARCHAR(20) NOT NULL DEFAULT 'user', -- admin | user (Base44 User entity)
  email_verified BIT NOT NULL DEFAULT 0,
  otp_code      NVARCHAR(6) NULL,
  otp_expires   DATETIME2 NULL,
  reset_token   NVARCHAR(64) NULL,
  reset_expires DATETIME2 NULL,
  created_date  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
-- TMS time records — mirrors the browser store (src/lib/tmsStore.js).
-- IDs are the browser-generated string ids (emp_xxx, task_xxx, ...), so
-- save/load round-trips without remapping.
IF OBJECT_ID('dbo.TmsEmployee') IS NULL
CREATE TABLE dbo.TmsEmployee (
  id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
  name        NVARCHAR(200) NOT NULL,
  notes       NVARCHAR(MAX) NULL,
  remarks     NVARCHAR(MAX) NULL,
  updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF COL_LENGTH('dbo.TmsEmployee', 'notes') IS NULL
  ALTER TABLE dbo.TmsEmployee ADD notes NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.TmsEmployee', 'remarks') IS NULL
  ALTER TABLE dbo.TmsEmployee ADD remarks NVARCHAR(MAX) NULL;
GO
IF OBJECT_ID('dbo.TmsTask') IS NULL
CREATE TABLE dbo.TmsTask (
  id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
  name        NVARCHAR(300) NOT NULL,
  updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsAssignment') IS NULL
CREATE TABLE dbo.TmsAssignment (
  id          NVARCHAR(64) NOT NULL PRIMARY KEY,
  employee_id NVARCHAR(64) NOT NULL,
  task_id     NVARCHAR(64) NOT NULL,
  updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsShiftDefinition') IS NULL
CREATE TABLE dbo.TmsShiftDefinition (
  id          NVARCHAR(64)  NOT NULL PRIMARY KEY,
  name        NVARCHAR(200) NOT NULL,
  start_hhmm  NVARCHAR(5)   NOT NULL,
  end_hhmm    NVARCHAR(5)   NOT NULL,
  updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsShiftRecord') IS NULL
CREATE TABLE dbo.TmsShiftRecord (
  id                NVARCHAR(64)  NOT NULL PRIMARY KEY,
  employee_id       NVARCHAR(64)  NOT NULL,
  date              NVARCHAR(10)  NOT NULL,
  shift_time        NVARCHAR(200) NULL,
  time_in_yard      DATETIME2 NULL,
  time_out_yard     DATETIME2 NULL,
  attendance_status NVARCHAR(50)  NULL,
  reason            NVARCHAR(1000) NULL,
  notes             NVARCHAR(MAX) NULL,
  remarks           NVARCHAR(MAX) NULL,
  updated_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsTaskEntry') IS NULL
CREATE TABLE dbo.TmsTaskEntry (
  id                   NVARCHAR(64) NOT NULL PRIMARY KEY,
  employee_id          NVARCHAR(64) NOT NULL,
  task_id              NVARCHAR(64) NOT NULL,
  date                 NVARCHAR(10) NOT NULL,
  time_started         DATETIME2 NULL,
  time_finished        DATETIME2 NULL,
  total_duration_ms    BIGINT NOT NULL DEFAULT 0,
  total_paused_ms      BIGINT NOT NULL DEFAULT 0,
  status               NVARCHAR(20) NOT NULL DEFAULT 'stopped',
  triggering_level     NVARCHAR(10) NULL,
  updated_at           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsPauseEvent') IS NULL
CREATE TABLE dbo.TmsPauseEvent (
  id              NVARCHAR(64) NOT NULL PRIMARY KEY,
  task_entry_id   NVARCHAR(64) NOT NULL,
  time_paused     DATETIME2 NULL,
  time_resumed    DATETIME2 NULL,
  interval_ms     BIGINT NULL
);
GO
IF OBJECT_ID('dbo.TmsBreakRecord') IS NULL
CREATE TABLE dbo.TmsBreakRecord (
  id            NVARCHAR(64) NOT NULL PRIMARY KEY,
  employee_id   NVARCHAR(64) NOT NULL,
  date          NVARCHAR(10) NOT NULL,
  time_started  DATETIME2 NULL,
  time_finished DATETIME2 NULL,
  duration_ms   BIGINT NULL,
  status        NVARCHAR(20) NULL,
  updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.TmsSnapshot') IS NULL
CREATE TABLE dbo.TmsSnapshot (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  saved_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  saved_by    NVARCHAR(320) NULL,
  entry_count INT NOT NULL DEFAULT 0
);
GO
-- Dedicated SQL login for the Node app (Tedious cannot use integrated auth here)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'tms_app')
  CREATE LOGIN tms_app WITH PASSWORD = 'TmsLocal2026!', CHECK_POLICY = OFF;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'tms_app')
BEGIN
  CREATE USER tms_app FOR LOGIN tms_app;
  ALTER ROLE db_datareader ADD MEMBER tms_app;
  ALTER ROLE db_datawriter ADD MEMBER tms_app;
END
GO
