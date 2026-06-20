import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Tenant-plane roles held via a membership (see roles-and-access.md §3). The
 * platform plane (super_admin, etc.) is modeled separately and added later.
 */
export const MEMBERSHIP_ROLES = [
  'owner',
  'hr',
  'area_manager',
  'store_manager',
  'employee',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const membershipRoleEnum = pgEnum('membership_role', MEMBERSHIP_ROLES);

/**
 * Where a membership applies (roles-and-access.md §4). `scope_ids` narrows it,
 * e.g. an area manager's `scope_type = 'area'` with the store ids in scope.
 */
export const SCOPE_TYPES = ['group', 'company', 'area', 'store', 'self'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export const scopeTypeEnum = pgEnum('scope_type', SCOPE_TYPES);

/** Lifecycle of a single user↔company membership. */
export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended', 'inactive'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const membershipStatusEnum = pgEnum('membership_status', MEMBERSHIP_STATUSES);

/** Company lifecycle (roles-and-access.md §6). */
export const COMPANY_STATUSES = ['pending', 'active', 'inactive', 'suspended', 'deleted'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const companyStatusEnum = pgEnum('company_status', COMPANY_STATUSES);

/** How a group is billed (roles-and-access.md §6). */
export const BILLING_MODES = ['consolidated', 'per_company'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];
export const billingModeEnum = pgEnum('billing_mode', BILLING_MODES);

/** Store lifecycle (02-stores §8). */
export const STORE_STATUSES = ['pending', 'active', 'inactive', 'suspended', 'archived'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];
export const storeStatusEnum = pgEnum('store_status', STORE_STATUSES);

/** Employee lifecycle (03-employees §8). */
export const EMPLOYEE_STATUSES = [
  'invited',
  'active',
  'on_leave',
  'suspended',
  'archived',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const employeeStatusEnum = pgEnum('employee_status', EMPLOYEE_STATUSES);

/** Contract / engagement type for an employee or a contract row (03-employees §3). */
export const CONTRACT_TYPES = [
  'full_time',
  'part_time',
  'temporary',
  'contractor',
  'intern',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const contractTypeEnum = pgEnum('contract_type', CONTRACT_TYPES);

/** How a secondary store link is used (03-employees §3). The primary store lives on the employee row. */
export const EMPLOYEE_STORE_RELATIONS = ['secondary', 'guest', 'peak'] as const;
export type EmployeeStoreRelation = (typeof EMPLOYEE_STORE_RELATIONS)[number];
export const employeeStoreRelationEnum = pgEnum(
  'employee_store_relation',
  EMPLOYEE_STORE_RELATIONS,
);

/** Qualification / medical validity (03-employees §8). `expiring` is derived on read (≤30d). */
export const CREDENTIAL_STATUSES = ['valid', 'expiring', 'expired'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];
export const credentialStatusEnum = pgEnum('credential_status', CREDENTIAL_STATUSES);

/** Shift lifecycle with distinct calendar colors (04-shifts §8). */
export const SHIFT_STATUSES = [
  'draft',
  'assigned',
  'published',
  'approved',
  'cancelled',
  'off',
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
export const shiftStatusEnum = pgEnum('shift_status', SHIFT_STATUSES);

/** How a shift came to exist (04-shifts §3). */
export const SHIFT_SOURCES = ['manual', 'template', 'suggested'] as const;
export type ShiftSource = (typeof SHIFT_SOURCES)[number];
export const shiftSourceEnum = pgEnum('shift_source', SHIFT_SOURCES);

// ── Attendance (05-attendance §3) ───────────────────────────────────────────
/** How a punch was captured. */
export const ATTENDANCE_METHODS = ['qr', 'manual', 'terminal'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];
export const attendanceMethodEnum = pgEnum('attendance_method', ATTENDANCE_METHODS);

/** Whether a punch arrived live or via an offline-queue flush. */
export const ATTENDANCE_SOURCES = ['online', 'offline_sync'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];
export const attendanceSourceEnum = pgEnum('attendance_source', ATTENDANCE_SOURCES);

/** Attendance log lifecycle (05-attendance §8). */
export const ATTENDANCE_LOG_STATUSES = ['open', 'closed', 'flagged', 'corrected'] as const;
export type AttendanceLogStatus = (typeof ATTENDANCE_LOG_STATUSES)[number];
export const attendanceLogStatusEnum = pgEnum('attendance_log_status', ATTENDANCE_LOG_STATUSES);

/** Anomaly rule families (05-attendance §6). */
export const ANOMALY_TYPES = [
  'late',
  'early_leave',
  'missing_punch',
  'no_show',
  'over_hours',
  'location_mismatch',
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];
export const anomalyTypeEnum = pgEnum('anomaly_type', ANOMALY_TYPES);

export const ANOMALY_SEVERITIES = ['low', 'medium', 'high'] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];
export const anomalySeverityEnum = pgEnum('anomaly_severity', ANOMALY_SEVERITIES);

/** Anomaly lifecycle (05-attendance §8). */
export const ANOMALY_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];
export const anomalyStatusEnum = pgEnum('anomaly_status', ANOMALY_STATUSES);

/** Correction-request lifecycle (05-attendance §8). */
export const CORRECTION_STATUSES = ['requested', 'approved', 'rejected'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];
export const correctionStatusEnum = pgEnum('correction_status', CORRECTION_STATUSES);

// ── Devices & Terminals (14-devices-terminals §3) ───────────────────────────
/** Store terminal/kiosk lifecycle. */
export const TERMINAL_STATUSES = ['pending', 'active', 'blocked'] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];
export const terminalStatusEnum = pgEnum('terminal_status', TERMINAL_STATUSES);

/** Personal device lifecycle. */
export const DEVICE_STATUSES = ['pending', 'registered', 'reset', 'blocked'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export const deviceStatusEnum = pgEnum('device_status', DEVICE_STATUSES);

// ── Leave & Holidays (06-leave-holidays §3, §8) ─────────────────────────────
/** Leave-request lifecycle. Multi-step chains stay `requested` until the last step approves. */
export const LEAVE_REQUEST_STATUSES = ['requested', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];
export const leaveRequestStatusEnum = pgEnum('leave_request_status', LEAVE_REQUEST_STATUSES);

// ── Onboarding (07-onboarding §3, §8) ───────────────────────────────────────
/** Stage a task group belongs to. */
export const ONBOARDING_STAGES = ['pre_start', 'first_day', 'first_week', 'first_month'] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];
export const onboardingStageEnum = pgEnum('onboarding_stage', ONBOARDING_STAGES);

/** Per-employee task assignment lifecycle. */
export const ONBOARDING_ASSIGNMENT_STATUSES = ['pending', 'done', 'skipped'] as const;
export type OnboardingAssignmentStatus = (typeof ONBOARDING_ASSIGNMENT_STATUSES)[number];
export const onboardingAssignmentStatusEnum = pgEnum(
  'onboarding_assignment_status',
  ONBOARDING_ASSIGNMENT_STATUSES,
);

// ── Transfers (12-transfers §3, §8) ─────────────────────────────────────────
/** Whether a transfer is a temporary loan or a permanent move. */
export const TRANSFER_KINDS = ['temporary', 'permanent'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];
export const transferKindEnum = pgEnum('transfer_kind', TRANSFER_KINDS);

/** Transfer lifecycle. Temporary ones activate, then auto-revert at the window end. */
export const TRANSFER_STATUSES = [
  'requested',
  'approved',
  'active',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const transferStatusEnum = pgEnum('transfer_status', TRANSFER_STATUSES);

// ── Documents (08-documents §3, §8) ─────────────────────────────────────────
/** Whether a folder holds company-wide files or one employee's files. */
export const DOC_FOLDER_KINDS = ['company', 'employee'] as const;
export type DocFolderKind = (typeof DOC_FOLDER_KINDS)[number];
export const docFolderKindEnum = pgEnum('doc_folder_kind', DOC_FOLDER_KINDS);

/** Who may see a document: everyone in the company, a role, or one employee. */
export const DOCUMENT_VISIBILITIES = ['company', 'role', 'employee'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];
export const documentVisibilityEnum = pgEnum('document_visibility', DOCUMENT_VISIBILITIES);

/** Document lifecycle. `expiring`/`expired` are set by the expiry scan job. */
export const DOCUMENT_STATUSES = ['active', 'expiring', 'expired', 'trashed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const documentStatusEnum = pgEnum('document_status', DOCUMENT_STATUSES);

/** E-signature request lifecycle (08-documents §8). */
export const SIGNATURE_STATUSES = ['requested', 'signed', 'declined'] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];
export const signatureStatusEnum = pgEnum('signature_status', SIGNATURE_STATUSES);

// ── Notifications (11-notifications §3) ──────────────────────────────────────
/** Notification priority — drives the dropdown dot color + live-toast behavior. */
export const NOTIF_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type NotifPriority = (typeof NOTIF_PRIORITIES)[number];
export const notifPriorityEnum = pgEnum('notif_priority', NOTIF_PRIORITIES);

/** Per-category digest cadence (paid). */
export const DIGEST_FREQS = ['off', 'daily', 'weekly'] as const;
export type DigestFreq = (typeof DIGEST_FREQS)[number];
export const digestFreqEnum = pgEnum('digest_freq', DIGEST_FREQS);

// ── Messaging & Email (13-messaging §3, §8) ─────────────────────────────────
/** A conversation is either a direct message or a named channel. */
export const CONVERSATION_KINDS = ['dm', 'channel'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];
export const conversationKindEnum = pgEnum('conversation_kind', CONVERSATION_KINDS);

/** Email message send lifecycle (13-messaging §8). */
export const EMAIL_STATUSES = [
  'draft',
  'queued',
  'sent',
  'delivered',
  'bounced',
  'failed',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
export const emailStatusEnum = pgEnum('email_status', EMAIL_STATUSES);

// ── Billing & Subscriptions (15-billing §8) ─────────────────────────────────
/** Subscription lifecycle, mirrored from Stripe. */
export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);

/** Invoice lifecycle, mirrored from Stripe. */
export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);

// ── Recruiting / ATS (09-recruiting §3, §8) ─────────────────────────────────
/** Job posting lifecycle. `published` controls public careers-site visibility. */
export const JOB_STATUSES = ['draft', 'published', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);

/** Pipeline stage a candidate sits in (kanban columns). */
export const CANDIDATE_STAGES = [
  'applied',
  'review',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const candidateStageEnum = pgEnum('candidate_stage', CANDIDATE_STAGES);

/** Interview delivery mode. */
export const INTERVIEW_MODES = ['onsite', 'phone', 'video'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const interviewModeEnum = pgEnum('interview_mode', INTERVIEW_MODES);

/** Interview lifecycle. */
export const INTERVIEW_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const interviewStatusEnum = pgEnum('interview_status', INTERVIEW_STATUSES);

// ── Reports & Analytics (16-reports §3, §8) ─────────────────────────────────
/** Generic job/run lifecycle for a scheduled/queued report run. */
export const REPORT_RUN_STATUSES = ['queued', 'running', 'ready', 'failed'] as const;
export type ReportRunStatus = (typeof REPORT_RUN_STATUSES)[number];
export const reportRunStatusEnum = pgEnum('report_run_status', REPORT_RUN_STATUSES);

// ── Platform plane (roles-and-access §3) ────────────────────────────────────
/** Cross-tenant operator roles. Held on `users.platform_role` (null = tenant-only). */
export const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'operations'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const platformRoleEnum = pgEnum('platform_role', PLATFORM_ROLES);
