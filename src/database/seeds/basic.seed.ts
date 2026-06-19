/**
 * Basic test seed: one company, a login per role, and a little demo data in
 * every module — enough to sign in through the UI and click around.
 *
 *   npm run db:seed              # runs this (default)
 *   npm run db:seed -- basic
 *
 * Idempotent-ish: upserts the company by name, skips existing auth users.
 * The detailed/realistic seed comes after v1.
 */
import { and, eq } from 'drizzle-orm';
import type { ScopeType } from '../schema';
import type { SeedContext, SeedModule } from './seed-context';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Vellora123!';
const COMPANY_NAME = 'Vellora Demo Co';

type Role = 'owner' | 'hr' | 'area_manager' | 'store_manager' | 'employee';

const LOGINS: { email: string; name: string; role: Role }[] = [
  { email: 'owner@vellora.test', name: 'Olivia Owner', role: 'owner' },
  { email: 'hr@vellora.test', name: 'Hank HR', role: 'hr' },
  { email: 'area@vellora.test', name: 'Aria Area', role: 'area_manager' },
  { email: 'manager@vellora.test', name: 'Sam Store', role: 'store_manager' },
  { email: 'employee@vellora.test', name: 'Eli Employee', role: 'employee' },
];

async function run(ctx: SeedContext): Promise<void> {
  const { db, schema, log } = ctx;

  log('→ creating Supabase auth users…');
  const userIdByRole = new Map<Role, string>();
  for (const l of LOGINS) {
    const uid = await ctx.ensureAuthUser(l.email, l.name, PASSWORD);
    const [user] = await db
      .insert(schema.users)
      .values({ supabaseUid: uid, email: l.email, name: l.name })
      .onConflictDoUpdate({ target: schema.users.supabaseUid, set: { name: l.name } })
      .returning();
    userIdByRole.set(l.role, user.id);
  }

  log('→ company + stores…');
  let company = await db.query.companies.findFirst({
    where: eq(schema.companies.name, COMPANY_NAME),
  });
  if (!company) {
    [company] = await db
      .insert(schema.companies)
      .values({
        name: COMPANY_NAME,
        slug: 'vellora-demo',
        country: 'US',
        currency: 'USD',
        timezone: 'America/New_York',
      })
      .returning();
  } else if (!company.slug) {
    [company] = await db
      .update(schema.companies)
      .set({ slug: 'vellora-demo' })
      .where(eq(schema.companies.id, company.id))
      .returning();
  }
  const companyId = company.id;

  const storeDefs = [
    { name: 'Downtown', code: 'DT', timezone: 'America/New_York' },
    { name: 'Uptown', code: 'UT', timezone: 'America/New_York' },
    { name: 'Harbor', code: 'HB', timezone: 'America/Los_Angeles' },
  ];
  const storeIds: string[] = [];
  for (const s of storeDefs) {
    let store = await db.query.stores.findFirst({
      where: and(eq(schema.stores.companyId, companyId), eq(schema.stores.code, s.code)),
    });
    if (!store) {
      [store] = await db
        .insert(schema.stores)
        .values({ companyId, name: s.name, code: s.code, timezone: s.timezone, capacity: 12 })
        .returning();
    }
    storeIds.push(store.id);
  }

  log('→ memberships…');
  const scopeFor = (role: Role): { scopeType: ScopeType; scopeIds: string[] } => {
    if (role === 'area_manager') return { scopeType: 'area', scopeIds: [storeIds[0], storeIds[1]] };
    if (role === 'store_manager') return { scopeType: 'store', scopeIds: [storeIds[0]] };
    if (role === 'employee') return { scopeType: 'self', scopeIds: [] };
    return { scopeType: 'company', scopeIds: [] };
  };
  for (const l of LOGINS) {
    const userId = userIdByRole.get(l.role)!;
    const { scopeType, scopeIds } = scopeFor(l.role);
    await db
      .insert(schema.memberships)
      .values({ userId, companyId, role: l.role, scopeType, scopeIds, status: 'active' })
      .onConflictDoUpdate({
        target: [schema.memberships.userId, schema.memberships.companyId],
        set: { role: l.role, scopeType, scopeIds, status: 'active' },
      });
  }

  log('→ employees…');
  const empDefs = [
    {
      code: 'EMP-001',
      first: 'Eli',
      last: 'Employee',
      store: 0,
      role: 'Barista',
      linkUser: 'employee' as Role,
    },
    { code: 'EMP-002', first: 'Mia', last: 'Lopez', store: 0, role: 'Cashier' },
    { code: 'EMP-003', first: 'Noah', last: 'Patel', store: 1, role: 'Shift Lead' },
    { code: 'EMP-004', first: 'Ava', last: 'Chen', store: 1, role: 'Barista' },
    { code: 'EMP-005', first: 'Liam', last: 'Khan', store: 2, role: 'Cashier' },
    { code: 'EMP-006', first: 'Zoe', last: 'Diaz', store: 2, role: 'Cleaner' },
  ];
  const empIds: string[] = [];
  for (const e of empDefs) {
    let emp = await db.query.employees.findFirst({
      where: and(
        eq(schema.employees.companyId, companyId),
        eq(schema.employees.uniqueCode, e.code),
      ),
    });
    if (!emp) {
      [emp] = await db
        .insert(schema.employees)
        .values({
          companyId,
          primaryStoreId: storeIds[e.store],
          uniqueCode: e.code,
          firstName: e.first,
          lastName: e.last,
          role: e.role,
          status: 'active',
          userId: e.linkUser ? userIdByRole.get(e.linkUser) : undefined,
          timezone: storeDefs[e.store].timezone,
        })
        .returning();
    }
    empIds.push(emp.id);
  }

  log('→ leave…');
  const leaveTypeDefs = [
    { name: 'Vacation', color: '#4F46E5', paid: true },
    { name: 'Sick', color: '#14B8A6', paid: true },
    { name: 'Unpaid', color: '#6B7280', paid: false },
  ];
  const typeIds: string[] = [];
  for (const t of leaveTypeDefs) {
    let lt = await db.query.leaveTypes.findFirst({
      where: and(eq(schema.leaveTypes.companyId, companyId), eq(schema.leaveTypes.name, t.name)),
    });
    if (!lt) {
      [lt] = await db
        .insert(schema.leaveTypes)
        .values({ companyId, name: t.name, color: t.color, paid: t.paid })
        .returning();
    }
    typeIds.push(lt.id);
  }
  const year = new Date().getUTCFullYear();
  for (const empId of empIds.slice(0, 4)) {
    await db
      .insert(schema.leaveBalances)
      .values({ companyId, employeeId: empId, typeId: typeIds[0], year, entitled: '20' })
      .onConflictDoNothing();
  }
  await db
    .insert(schema.holidays)
    .values({ companyId, date: `${year}-12-25`, name: 'Christmas', recurring: true })
    .onConflictDoNothing();
  const hasReq = await db.query.leaveRequests.findFirst({
    where: eq(schema.leaveRequests.companyId, companyId),
  });
  if (!hasReq) {
    await db.insert(schema.leaveRequests).values({
      companyId,
      employeeId: empIds[1],
      typeId: typeIds[0],
      startDate: `${year}-07-14`,
      endDate: `${year}-07-16`,
      days: '3',
      status: 'requested',
      approverChain: [{ step: 0, role: 'store_manager', status: 'pending' }],
    });
    await db
      .insert(schema.leaveBalances)
      .values({
        companyId,
        employeeId: empIds[1],
        typeId: typeIds[0],
        year,
        entitled: '20',
        pending: '3',
      })
      .onConflictDoUpdate({
        target: [
          schema.leaveBalances.employeeId,
          schema.leaveBalances.typeId,
          schema.leaveBalances.year,
        ],
        set: { pending: '3' },
      });
  }

  log('→ onboarding…');
  let group = await db.query.taskGroups.findFirst({
    where: eq(schema.taskGroups.companyId, companyId),
  });
  if (!group) {
    [group] = await db
      .insert(schema.taskGroups)
      .values({ companyId, name: 'Paperwork', stage: 'pre_start', sortOrder: 0 })
      .returning();
    const taskRows = await db
      .insert(schema.tasks)
      .values([
        { companyId, groupId: group.id, title: 'Sign contract', sortOrder: 0 },
        { companyId, groupId: group.id, title: 'Upload ID', sortOrder: 1 },
        { companyId, groupId: group.id, title: 'Tax form', sortOrder: 2 },
      ])
      .returning();
    for (const empId of empIds.slice(0, 2)) {
      await db.insert(schema.onboardingAssignments).values(
        taskRows.map((t) => ({
          companyId,
          employeeId: empId,
          taskId: t.id,
          status: 'pending' as const,
        })),
      );
    }
  }

  log('→ shift + transfer…');
  const hasShift = await db.query.shifts.findFirst({
    where: eq(schema.shifts.companyId, companyId),
  });
  if (!hasShift) {
    const start = new Date();
    start.setUTCHours(13, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(21, 0, 0, 0);
    await db.insert(schema.shifts).values({
      companyId,
      storeId: storeIds[0],
      employeeId: empIds[0],
      startsAtUtc: start,
      endsAtUtc: end,
      status: 'published',
      source: 'manual',
    });
  }
  const hasTransfer = await db.query.transfers.findFirst({
    where: eq(schema.transfers.companyId, companyId),
  });
  if (!hasTransfer) {
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000);
    await db.insert(schema.transfers).values({
      companyId,
      employeeId: empIds[2],
      fromStoreId: storeIds[1],
      toStoreId: storeIds[0],
      kind: 'temporary',
      startDate: today.toISOString().slice(0, 10),
      endDate: in7.toISOString().slice(0, 10),
      reason: 'Cover peak week',
      status: 'requested',
    });
  }

  log('→ plans + subscription…');
  // Global plan catalogue (15-billing). limits: -1 = unlimited. Free is the
  // implicit base in EntitlementsService; we still seed it for the UI compare.
  const PLAN_DEFS = [
    {
      key: 'free',
      name: 'Free',
      tier: 0,
      priceMonth: '0',
      priceYear: '0',
      limits: { employees: 10, stores: 1, devices: 2, storage_gb: 1, ai_calls: 0 },
      entitlements: { messaging: true },
    },
    {
      key: 'starter',
      name: 'Starter',
      tier: 1,
      priceMonth: '29',
      priceYear: '290',
      limits: { employees: 50, stores: 3, devices: 10, storage_gb: 10, ai_calls: 0 },
      entitlements: { messaging: true, 'leave.advanced': true, 'employee.advanced': true },
    },
    {
      key: 'growth',
      name: 'Growth',
      tier: 2,
      priceMonth: '79',
      priceYear: '790',
      limits: { employees: 200, stores: 10, devices: 50, storage_gb: 50, ai_calls: 500 },
      entitlements: {
        messaging: true,
        'leave.advanced': true,
        'employee.advanced': true,
        'attendance.advanced': true,
        'scheduling.suggestions': true,
        analytics: true,
        recruiting: true,
      },
    },
    {
      key: 'business',
      name: 'Business',
      tier: 3,
      priceMonth: '199',
      priceYear: '1990',
      limits: { employees: -1, stores: -1, devices: -1, storage_gb: 500, ai_calls: 5000 },
      entitlements: {
        messaging: true,
        'leave.advanced': true,
        'employee.advanced': true,
        'attendance.advanced': true,
        'scheduling.suggestions': true,
        analytics: true,
        recruiting: true,
        'store.finances': true,
        'permissions.overrides': true,
        'group.policies': true,
      },
    },
  ];
  const planIdByKey = new Map<string, string>();
  for (const p of PLAN_DEFS) {
    const [row] = await db
      .insert(schema.plans)
      .values({
        key: p.key,
        name: p.name,
        tier: p.tier,
        priceMonth: p.priceMonth,
        priceYear: p.priceYear,
        limitsJson: p.limits,
        entitlementsJson: p.entitlements,
      })
      .onConflictDoUpdate({
        target: schema.plans.key,
        set: { limitsJson: p.limits, entitlementsJson: p.entitlements, tier: p.tier },
      })
      .returning();
    planIdByKey.set(p.key, row.id);
  }
  // Put the demo company on a trialing Growth subscription so usage meters + the
  // billing screen have something real to show.
  const trialEnds = new Date(Date.now() + 14 * 86_400_000);
  await db
    .insert(schema.subscriptions)
    .values({
      companyId,
      planId: planIdByKey.get('growth')!,
      status: 'trialing',
      interval: 'month',
      trialEndsAt: trialEnds,
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.companyId,
      set: { planId: planIdByKey.get('growth')!, status: 'trialing' },
    });

  log('→ recruiting…');
  const existingJob = await db.query.jobs.findFirst({
    where: eq(schema.jobs.companyId, companyId),
  });
  if (!existingJob) {
    const [job] = await db
      .insert(schema.jobs)
      .values({
        companyId,
        storeId: storeIds[0],
        title: 'Store Associate',
        slug: 'store-associate',
        description:
          'Front-of-house retail role at our Downtown store. Friendly, reliable, weekends.',
        employmentType: 'part_time',
        location: 'Downtown',
        status: 'published',
        published: true,
        screenerQuestions: [
          { id: 'q1', label: 'Are you available on weekends?', required: true },
          { id: 'q2', label: 'Years of retail experience?', required: false },
        ],
        createdBy: userIdByRole.get('hr'),
      })
      .returning();
    await db.insert(schema.candidates).values({
      companyId,
      jobId: job.id,
      name: 'Casey Candidate',
      email: 'casey@example.com',
      stage: 'applied',
      source: 'careers',
      consentAt: new Date(),
    });
  }

  log(`\n✅ Company: ${COMPANY_NAME} · password for every login: ${PASSWORD}`);
  console.table(LOGINS.map((l) => ({ role: l.role, email: l.email })));
}

const basicSeed: SeedModule = {
  name: 'basic',
  description: 'One company, 5 role logins, stores/employees + sample data in every module.',
  seed: run,
};

export default basicSeed;
