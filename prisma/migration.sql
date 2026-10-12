-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(256),
    "full_name" VARCHAR(200),
    "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "otp_code" VARCHAR(6),
    "otp_expires" TIMESTAMPTZ(6),
    "reset_token" VARCHAR(64),
    "reset_expires" TIMESTAMPTZ(6),
    "created_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsEmployee" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsTask" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsAssignment" (
    "id" VARCHAR(64) NOT NULL,
    "employee_id" VARCHAR(64) NOT NULL,
    "task_id" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsShiftDefinition" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "start_hhmm" VARCHAR(5) NOT NULL,
    "end_hhmm" VARCHAR(5) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsShiftRecord" (
    "id" VARCHAR(64) NOT NULL,
    "employee_id" VARCHAR(64) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "shift_time" VARCHAR(200),
    "time_in_yard" TIMESTAMPTZ(6),
    "time_out_yard" TIMESTAMPTZ(6),
    "attendance_status" VARCHAR(50),
    "reason" VARCHAR(1000),
    "notes" TEXT,
    "remarks" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsShiftRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsTaskEntry" (
    "id" VARCHAR(64) NOT NULL,
    "employee_id" VARCHAR(64) NOT NULL,
    "task_id" VARCHAR(64) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "time_started" TIMESTAMPTZ(6),
    "time_finished" TIMESTAMPTZ(6),
    "total_duration_ms" BIGINT NOT NULL DEFAULT 0,
    "total_paused_ms" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'stopped',
    "triggering_level" VARCHAR(10),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsTaskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsPauseEvent" (
    "id" VARCHAR(64) NOT NULL,
    "task_entry_id" VARCHAR(64) NOT NULL,
    "time_paused" TIMESTAMPTZ(6),
    "time_resumed" TIMESTAMPTZ(6),
    "interval_ms" BIGINT,

    CONSTRAINT "TmsPauseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsBreakRecord" (
    "id" VARCHAR(64) NOT NULL,
    "employee_id" VARCHAR(64) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "time_started" TIMESTAMPTZ(6),
    "time_finished" TIMESTAMPTZ(6),
    "duration_ms" BIGINT,
    "status" VARCHAR(20),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmsBreakRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsSnapshot" (
    "id" SERIAL NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saved_by" VARCHAR(320),
    "entry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TmsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
