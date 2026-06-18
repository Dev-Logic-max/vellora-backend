import Papa from 'papaparse';
import type { Employee } from '../database/schema';

/** Columns accepted on import / produced on export. */
export interface EmployeeCsvRow {
  uniqueCode?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
}

const EXPORT_COLUMNS = [
  'uniqueCode',
  'firstName',
  'lastName',
  'email',
  'phone',
  'role',
  'department',
  'status',
] as const;

/** Parse uploaded CSV text into typed rows (header row required). */
export function parseEmployeeCsv(csv: string): EmployeeCsvRow[] {
  const result = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data
    .map((r) => ({
      uniqueCode: r.uniqueCode?.trim() || undefined,
      firstName: (r.firstName ?? r.first_name ?? '').trim(),
      lastName: (r.lastName ?? r.last_name ?? '').trim(),
      email: r.email?.trim() || undefined,
      phone: r.phone?.trim() || undefined,
      role: r.role?.trim() || undefined,
      department: r.department?.trim() || undefined,
    }))
    .filter((r) => r.firstName && r.lastName);
}

/** Serialize employees to CSV text for download. */
export function toEmployeeCsv(rows: Employee[]): string {
  return Papa.unparse(
    rows.map((e) => ({
      uniqueCode: e.uniqueCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email ?? '',
      phone: e.phone ?? '',
      role: e.role ?? '',
      department: e.department ?? '',
      status: e.status,
    })),
    { columns: EXPORT_COLUMNS as unknown as string[] },
  );
}
