/**
 * Enterprise seed — a large, realistic, multinational dataset. 14 real companies
 * across 8 countries (some grouped in pairs, some independent), their stores /
 * offices / factories, 100+ country-named employees, and demo data in EVERY
 * module. ONE file, organized by module with section comments.
 *
 *   SEED_ENABLED=true SEED_FILE=enterprise pnpm db:seed
 *
 * Idempotent-ish: it WIPES tenant data first (full swap), then rebuilds. Real
 * company names are used; employee names are GENERATED from common name pools
 * per country (no real individuals).
 */
import { randomUUID } from 'node:crypto';
import { PLAN_DEFS } from '../../billing/plan-defs';
import { COMPANIES, DEPARTMENTS, JOB_TITLES, NAME_POOLS } from './data/enterprise-data';
import { wipeTenantData } from './data/wipe';
import type { SeedContext } from './seed-context';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Vellora123!';

// Deterministic PRNG so re-runs produce the same dataset.
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}
const pick = <T>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length];

async function run(ctx: SeedContext): Promise<void> {
  const { db, schema, log } = ctx;
  const rng = makeRng(20260627);

  await wipeTenantData(ctx);

  // ── PLATFORM ADMINS (separate table): super_admin + platform_admin + operations.
  log('→ platform admins…');
  const PLATFORM_ADMINS: { email: string; name: string; role: string }[] = [
    { email: 'abdul.rehman@vellora.io', name: 'Abdul Rehman', role: 'super_admin' },
    { email: 'khalid.mansour@vellora.io', name: 'Khalid Mansour', role: 'platform_admin' },
    { email: 'yusuf.alharbi@vellora.io', name: 'Yusuf Al-Harbi', role: 'operations' },
  ];
  for (const pa of PLATFORM_ADMINS) {
    const uid = await ctx.ensureAuthUser(pa.email, pa.name, PASSWORD);
    await db
      .insert(schema.platformAdmins)
      .values({ supabaseUid: uid, email: pa.email, name: pa.name, platformRole: pa.role })
      .onConflictDoUpdate({
        target: schema.platformAdmins.supabaseUid,
        set: { name: pa.name, platformRole: pa.role },
      });
  }

  // ── PLATFORM: plan catalogue (referenced by every company) ─────────────────
  log('→ plans…');
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
        tagline: p.tagline,
        description: p.description,
        highlights: p.highlights,
        popular: p.popular,
        sortOrder: p.sortOrder,
      })
      .onConflictDoUpdate({ target: schema.plans.key, set: { name: p.name } })
      .returning();
    planIdByKey.set(p.key, row.id);
  }
  const planKeys = ['free', 'starter', 'pro', 'business'];

  // ── GROUPS (companies sharing a `group` label are linked) ──────────────────
  log('→ groups…');
  const groupIdByName = new Map<string, string>();
  for (const name of new Set(COMPANIES.map((c) => c.group).filter(Boolean) as string[])) {
    const [g] = await db.insert(schema.groups).values({ name }).returning();
    groupIdByName.set(name, g.id);
  }

  let companyIdx = 0;
  let totalEmployees = 0;

  for (const def of COMPANIES) {
    companyIdx += 1;
    log(`→ [${companyIdx}/${COMPANIES.length}] ${def.name} (${def.country})…`);

    // ── COMPANY ──────────────────────────────────────────────────────────────
    const [company] = await db
      .insert(schema.companies)
      .values({
        name: def.name,
        slug: def.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        country: def.country,
        currency: def.currency,
        timezone: def.timezone,
        category: def.category,
        city: def.city,
        groupId: def.group ? groupIdByName.get(def.group) : null,
        workplaceTypes: def.workplaceTypes,
        status: 'active',
        // The referral/registration code users supply at signup.
        registrationId: `REG-${def.country}${String(companyIdx).padStart(2, '0')}`,
        companyEmail: `info@${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
        phone: '+1 555 0100',
        planId: planIdByKey.get(pick(planKeys, rng())) ?? null,
      })
      .returning();
    const companyId = company.id;

    // ── SUBSCRIPTION ──────────────────────────────────────────────────────────
    await db.insert(schema.subscriptions).values({
      companyId,
      planId: planIdByKey.get('pro')!,
      status: rng() > 0.5 ? 'active' : 'trialing',
      interval: 'month',
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
    });

    // ── WORKPLACES: stores / offices / factories ──────────────────────────────
    const storeIds: string[] = [];
    for (const wp of def.workplaces) {
      if (wp.kind === 'store') {
        const [s] = await db
          .insert(schema.stores)
          .values({
            companyId,
            name: wp.name,
            code: `STR-${String(100 + storeIds.length)}`,
            city: wp.city,
            country: wp.country,
            timezone: def.timezone,
            capacity: 10 + Math.floor(rng() * 30),
            category: def.category,
            headStore: storeIds.length === 0,
          })
          .returning();
        storeIds.push(s.id);
      } else if (wp.kind === 'office') {
        await db.insert(schema.offices).values({
          companyId,
          name: wp.name,
          code: `OFC-${String(100 + Math.floor(rng() * 800))}`,
          city: wp.city,
          country: wp.country,
          timezone: def.timezone,
          capacity: 40 + Math.floor(rng() * 200),
          headOffice: true,
          floors: 2 + Math.floor(rng() * 8),
          desks: 30 + Math.floor(rng() * 150),
          meetingRooms: 2 + Math.floor(rng() * 8),
          departments: DEPARTMENTS.slice(0, 3 + Math.floor(rng() * 3)),
        });
      } else {
        await db.insert(schema.factories).values({
          companyId,
          name: wp.name,
          code: `FAC-${String(100 + Math.floor(rng() * 800))}`,
          city: wp.city,
          country: wp.country,
          timezone: def.timezone,
          capacity: 80 + Math.floor(rng() * 300),
          productionLines: 2 + Math.floor(rng() * 8),
          dailyOutput: 1000 + Math.floor(rng() * 9000),
          shiftModel: 1 + Math.floor(rng() * 3),
          safetyLevel: pick(['low', 'medium', 'high'], rng()),
          machineCount: 10 + Math.floor(rng() * 90),
        });
      }
    }
    // Ensure at least one store exists for shifts/attendance even if def has none.
    if (storeIds.length === 0) {
      const [s] = await db
        .insert(schema.stores)
        .values({
          companyId,
          name: `${def.city} Branch`,
          code: 'STR-100',
          city: def.city,
          country: def.country,
          timezone: def.timezone,
          capacity: 20,
          headStore: true,
        })
        .returning();
      storeIds.push(s.id);
    }

    // ── PEOPLE: every person gets a non-null PLATFORM ROLE + an account (users
    // row) + an ACTIVE membership, plus ALL profile fields filled. The platform
    // role (admin/hr/area_manager/store_manager/employee) is what "role" means;
    // the JOB title is separate (job_title). This is the fix for "users with no
    // role" / HR & Managers not appearing.
    const pool = NAME_POOLS[def.country];
    const empIds: string[] = [];
    const emailDomain = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    // Platform-role per index: 0=admin(owner), 1=hr, 2=area_manager, 3-4=store_manager, rest=employee.
    const roleFor = (i: number): 'owner' | 'hr' | 'area_manager' | 'store_manager' | 'employee' =>
      i === 0
        ? 'owner'
        : i === 1
          ? 'hr'
          : i === 2
            ? 'area_manager'
            : i <= 4
              ? 'store_manager'
              : 'employee';

    for (let i = 0; i < def.headcount; i++) {
      const first = pick(pool.first, rng());
      const last = pick(pool.last, rng());
      const storeId = storeIds[i % storeIds.length];
      const hireDaysAgo = 30 + Math.floor(rng() * 900);
      const isLeaver = i > 5 && i % 11 === 0; // never make role-holders leavers
      const platformRole = isLeaver ? 'employee' : roleFor(i);
      const handle = `${first}.${last}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');
      // Globally-unique email (company index + person index) — users.email is unique.
      const personalEmail = `${handle}.c${companyIdx}u${i}@example.com`;

      // 1) Account (auth identity row). Real auth users only for the first few per
      //    company (keeps the Supabase admin-API calls reasonable); the rest get a
      //    synthetic uid so they still have a linked account + login record.
      const realLogin = i < 5;
      // supabase_uid is a uuid; non-login people get a synthetic uuid so they
      // still have a linked account record (no actual auth user).
      const supabaseUid = realLogin
        ? await ctx.ensureAuthUser(personalEmail, `${first} ${last}`, PASSWORD)
        : randomUUID();
      const [account] = await db
        .insert(schema.users)
        .values({ supabaseUid, email: personalEmail, name: `${first} ${last}` })
        .onConflictDoUpdate({ target: schema.users.supabaseUid, set: { name: `${first} ${last}` } })
        .returning();

      // 2) Person (people directory) — all fields filled.
      const [emp] = await db
        .insert(schema.employees)
        .values({
          companyId,
          primaryStoreId: storeId,
          userId: account.id,
          uniqueCode: `${def.country}-${String(companyIdx).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
          firstName: first,
          lastName: last,
          email: personalEmail,
          phone: `+1 555 0${String(100 + i).slice(-3)}`,
          companyEmail: `${handle}@${emailDomain}.com`,
          jobTitle: pick(JOB_TITLES, rng()),
          role: pick(JOB_TITLES, rng()),
          department: pick(DEPARTMENTS, rng()),
          supervisorId: empIds[0] && i > 0 ? empIds[0] : null,
          status: isLeaver ? 'archived' : 'active',
          hireDate: new Date(Date.now() - hireDaysAgo * 86_400_000).toISOString().slice(0, 10),
          deletedAt: isLeaver ? new Date(Date.now() - Math.floor(rng() * 60) * 86_400_000) : null,
          nationality: def.country,
          dateOfBirth: new Date(1985 + (i % 20), i % 12, 1 + (i % 27)).toISOString().slice(0, 10),
          gender: rng() > 0.5 ? 'male' : 'female',
          maritalStatus: pick(['single', 'married'], rng()),
          idCardNumber: `${def.country}${String(10000000 + i * 137).slice(0, 8)}`,
          iban: `${def.country}${String(60 + i)}0000${String(100000000000 + i * 991).slice(0, 12)}`,
          country: def.country,
          state: def.city,
          city: def.city,
          postalCode: String(10000 + i * 7).slice(0, 5),
          address: `${10 + i} ${def.city} Street`,
          workScheduleType: pick(['full_time', 'part_time', 'shift'], rng()),
          contractType: pick(['full_time', 'part_time'], rng()),
          contractEnd: null,
          weeklyHours: 30 + Math.floor(rng() * 10),
          timezone: def.timezone,
          benefits: { medical: rng() > 0.4, transport: rng() > 0.5, meals: rng() > 0.6 },
        })
        .returning();
      if (emp) empIds.push(emp.id);

      // 3) Membership — the PLATFORM ROLE + scope. Never null.
      const scope =
        platformRole === 'area_manager'
          ? { scopeType: 'area' as const, scopeIds: storeIds }
          : platformRole === 'store_manager'
            ? { scopeType: 'store' as const, scopeIds: [storeId] }
            : platformRole === 'employee'
              ? { scopeType: 'self' as const, scopeIds: [] }
              : { scopeType: 'company' as const, scopeIds: [] };
      await db
        .insert(schema.memberships)
        .values({ userId: account.id, companyId, role: platformRole, ...scope, status: 'active' })
        .onConflictDoUpdate({
          target: [schema.memberships.userId, schema.memberships.companyId],
          set: { role: platformRole, ...scope, status: 'active' },
        });
    }
    totalEmployees += empIds.length;
    const activeEmpIds = empIds; // archived included is fine for samples

    // ── LEAVE: types + balances + a request ───────────────────────────────────
    const leaveTypeIds: string[] = [];
    for (const t of [
      { name: 'Annual', color: '#4F46E5', paid: true },
      { name: 'Sick', color: '#14B8A6', paid: true },
      { name: 'Unpaid', color: '#6B7280', paid: false },
    ]) {
      const [lt] = await db
        .insert(schema.leaveTypes)
        .values({ companyId, name: t.name, color: t.color, paid: t.paid })
        .returning();
      leaveTypeIds.push(lt.id);
    }
    const year = new Date().getUTCFullYear();
    for (const empId of activeEmpIds.slice(0, 5)) {
      await db
        .insert(schema.leaveBalances)
        .values({ companyId, employeeId: empId, typeId: leaveTypeIds[0], year, entitled: '24' })
        .onConflictDoNothing();
    }
    if (activeEmpIds[1]) {
      await db.insert(schema.leaveRequests).values({
        companyId,
        employeeId: activeEmpIds[1],
        typeId: leaveTypeIds[0],
        startDate: `${year}-07-10`,
        endDate: `${year}-07-14`,
        days: '5',
        status: 'requested',
        approverChain: [{ step: 0, role: 'store_manager', status: 'pending' }],
      });
    }
    await db
      .insert(schema.holidays)
      .values({ companyId, date: `${year}-12-25`, name: 'Winter Holiday', recurring: true })
      .onConflictDoNothing();

    // ── ONBOARDING: a task group + assignments ────────────────────────────────
    const [taskGroup] = await db
      .insert(schema.taskGroups)
      .values({ companyId, name: 'New Hire Setup', stage: 'pre_start', sortOrder: 0 })
      .returning();
    const taskRows = await db
      .insert(schema.tasks)
      .values([
        { companyId, groupId: taskGroup.id, title: 'Sign contract', sortOrder: 0 },
        { companyId, groupId: taskGroup.id, title: 'Upload ID', sortOrder: 1 },
        { companyId, groupId: taskGroup.id, title: 'Safety briefing', sortOrder: 2 },
      ])
      .returning();
    for (const empId of activeEmpIds.slice(0, 3)) {
      await db.insert(schema.onboardingAssignments).values(
        taskRows.map((t, ti) => ({
          companyId,
          employeeId: empId,
          taskId: t.id,
          status: ti === 0 ? ('done' as const) : ('pending' as const),
        })),
      );
    }

    // ── STORE ACTIVITIES (current month overlay) ──────────────────────────────
    const monthStr = new Date().toISOString().slice(0, 7);
    const acts = [
      { type: 'window_display', name: 'Window display', color: '#6366f1', icon: '🪟' },
      { type: 'promo_setup', name: 'Promo setup', color: '#f59e0b', icon: '🏷️' },
    ];
    for (let i = 0; i < storeIds.length; i++) {
      const a = acts[i % acts.length];
      await db.insert(schema.storeActivities).values({
        companyId,
        storeId: storeIds[i],
        name: a.name,
        type: a.type,
        color: a.color,
        icon: a.icon,
        month: monthStr,
        startDate: `${monthStr}-01`,
        endDate: `${monthStr}-28`,
      });
    }

    // ── SHIFTS (a published week for the head store) ──────────────────────────
    const headStore = storeIds[0];
    for (let d = 0; d < 5; d++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + d);
      day.setUTCHours(9, 0, 0, 0);
      const end = new Date(day);
      end.setUTCHours(17, 0, 0, 0);
      const empId = activeEmpIds[d % Math.max(1, activeEmpIds.length)];
      if (!empId) continue;
      await db.insert(schema.shifts).values({
        companyId,
        storeId: headStore,
        employeeId: empId,
        startsAtUtc: day,
        endsAtUtc: end,
        breakMinutes: 30,
        status: pick(['published', 'assigned', 'draft'], rng()),
        source: 'manual',
      });
    }

    // ── ATTENDANCE (last 10 days for active staff) ────────────────────────────
    const attendanceRows: (typeof schema.attendanceLogs.$inferInsert)[] = [];
    for (let d = 1; d <= 10; d++) {
      const day = new Date(Date.now() - d * 86_400_000);
      for (const empId of activeEmpIds.slice(0, 8)) {
        if (rng() < 0.25) continue; // ~75% attendance
        const clockIn = new Date(day);
        clockIn.setUTCHours(9, Math.floor(rng() * 25), 0, 0);
        const clockOut = new Date(clockIn.getTime() + (7 + Math.floor(rng() * 2)) * 3_600_000);
        attendanceRows.push({
          companyId,
          storeId: headStore,
          employeeId: empId,
          clockInUtc: clockIn,
          clockOutUtc: clockOut,
          method: 'qr',
          status: rng() > 0.85 ? 'flagged' : 'closed',
        });
      }
    }
    for (let i = 0; i < attendanceRows.length; i += 200) {
      await db.insert(schema.attendanceLogs).values(attendanceRows.slice(i, i + 200));
    }

    // ── POS: categories + products per store ──────────────────────────────────
    for (const storeId of storeIds) {
      for (const cat of [
        { name: 'Apparel', color: '#8b5cf6' },
        { name: 'Accessories', color: '#0ea5e9' },
        { name: 'Footwear', color: '#f59e0b' },
      ]) {
        const [category] = await db
          .insert(schema.productCategories)
          .values({ companyId, storeId, name: cat.name, color: cat.color })
          .onConflictDoNothing()
          .returning();
        if (!category) continue;
        await db.insert(schema.products).values(
          Array.from({ length: 3 }, (_, pi) => ({
            companyId,
            storeId,
            categoryId: category.id,
            name: `${cat.name} Item ${pi + 1}`,
            sku: `${cat.name.slice(0, 3).toUpperCase()}-${storeId.slice(0, 4)}-${pi}`,
            price: String(10 + Math.floor(rng() * 90)),
            currency: def.currency,
            stock: Math.floor(rng() * 100),
            status: 'active',
          })),
        );
      }
    }

    // ── RECRUITING: a published job + candidates ──────────────────────────────
    const [job] = await db
      .insert(schema.jobs)
      .values({
        companyId,
        storeId: headStore,
        title: `${pick(JOB_TITLES, rng())} — ${def.city}`,
        slug: `role-${companyIdx}`,
        description: `Join ${def.name} in ${def.city}. Customer-focused, reliable.`,
        employmentType: 'full_time',
        location: def.city,
        status: 'published',
        published: true,
      })
      .returning();
    const STAGES = ['applied', 'review', 'interview', 'offer', 'hired'] as const;
    await db.insert(schema.candidates).values(
      Array.from({ length: 5 }, (_, ci) => {
        const f = pick(pool.first, rng());
        const l = pick(pool.last, rng());
        return {
          companyId,
          jobId: job.id,
          name: `${f} ${l}`,
          email: `${f.toLowerCase()}.${l.toLowerCase().replace(/\s/g, '')}@example.com`,
          stage: STAGES[ci],
          source: ci % 2 === 0 ? 'careers' : 'referral',
          consentAt: new Date(),
        };
      }),
    );
  }

  log(`\n✅ Enterprise seed: ${COMPANIES.length} companies, ${totalEmployees} employees.`);
}

const enterpriseSeed = {
  name: 'enterprise',
  description:
    'Large multinational dataset — 14 real companies across 8 countries (some grouped), ' +
    'their stores/offices/factories, 100+ country-named employees, and data in every module ' +
    '(leave, onboarding, shifts, attendance, POS, activities, recruiting). WIPES tenant data first.',
  seed: run,
};

export default enterpriseSeed;
