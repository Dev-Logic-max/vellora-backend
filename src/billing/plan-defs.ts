/**
 * Canonical default plan catalogue (Free/Starter/Pro/Business). Seeded into the
 * `plans` table and used as the fallback/default values the Pricing module
 * (super-admin) edits. `limits`: -1 = unlimited. `priceYear` ≈ pay for 10
 * months (≈2 months free on annual).
 *
 * Keep this in sync with the FE card defaults conceptually — but the FE reads
 * the live `plans` table via the API, so this is purely the source of truth for
 * what gets seeded / reset to.
 */
export interface PlanDef {
  key: string;
  name: string;
  tier: number;
  priceMonth: string;
  priceYear: string;
  tagline: string;
  description: string;
  highlights: string[];
  popular: boolean;
  sortOrder: number;
  limits: Record<string, number>;
  entitlements: Record<string, boolean>;
}

export const PLAN_DEFS: PlanDef[] = [
  {
    key: 'free',
    name: 'Free',
    tier: 0,
    priceMonth: '0',
    priceYear: '0',
    tagline: 'Get started, no card needed',
    description: 'Everything a single small store needs to run its people.',
    highlights: [
      '1 company · 2 stores',
      'Up to 20 employees',
      'Scheduling, attendance & leave',
      'Documents & onboarding',
      'In-app messaging',
    ],
    popular: false,
    sortOrder: 0,
    limits: { employees: 20, stores: 2, devices: 2, storage_gb: 2, ai_calls: 0 },
    entitlements: { messaging: true },
  },
  {
    key: 'starter',
    name: 'Starter',
    tier: 1,
    priceMonth: '19',
    priceYear: '190',
    tagline: 'For growing multi-store teams',
    description: 'Add terminals and advanced attendance as you scale to a few stores.',
    highlights: [
      '2 companies · 4 stores',
      'Up to 80 employees',
      'Store terminals (kiosk clock-in)',
      'Advanced attendance & corrections',
      'Advanced leave policies',
      'Everything in Free',
    ],
    popular: false,
    sortOrder: 1,
    limits: { employees: 80, stores: 4, devices: 10, storage_gb: 10, ai_calls: 0 },
    entitlements: {
      messaging: true,
      'leave.advanced': true,
      'employee.advanced': true,
      'attendance.advanced': true,
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    tier: 2,
    priceMonth: '49',
    priceYear: '490',
    tagline: 'The complete workforce platform',
    description: 'Recruiting, analytics and AI insights for serious operators.',
    highlights: [
      '3 companies · 9 stores',
      'Up to 120 employees',
      'Recruiting & careers site',
      'Reports & analytics',
      'AI insights (Gemini)',
      'Demand-aware scheduling',
      'Everything in Starter',
    ],
    popular: true,
    sortOrder: 2,
    limits: { employees: 120, stores: 9, devices: 50, storage_gb: 50, ai_calls: 1000 },
    entitlements: {
      messaging: true,
      'leave.advanced': true,
      'employee.advanced': true,
      'attendance.advanced': true,
      'scheduling.suggestions': true,
      analytics: true,
      recruiting: true,
      reports: true,
    },
  },
  {
    key: 'business',
    name: 'Business',
    tier: 3,
    priceMonth: '99',
    priceYear: '990',
    tagline: 'Unlimited scale + priority support',
    description: 'Unlimited companies, stores and people with every feature unlocked.',
    highlights: [
      'Unlimited companies & stores',
      'Unlimited employees',
      'Store finances',
      'Permission overrides',
      'Group policies',
      'Priority support',
      'Everything in Pro',
    ],
    popular: false,
    sortOrder: 3,
    limits: { employees: -1, stores: -1, devices: -1, storage_gb: 500, ai_calls: 5000 },
    entitlements: {
      messaging: true,
      'leave.advanced': true,
      'employee.advanced': true,
      'attendance.advanced': true,
      'scheduling.suggestions': true,
      analytics: true,
      recruiting: true,
      reports: true,
      'store.finances': true,
      'permissions.overrides': true,
      'group.policies': true,
    },
  },
];
