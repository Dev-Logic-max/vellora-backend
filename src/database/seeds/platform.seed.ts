/**
 * Platform seed — the super-admin operator + a realistic demo GROUP holding TWO
 * companies, each with TWO users per role and a handful of employees. Run this
 * to stand up the platform owner's own assets (kept small — the super admin
 * isn't tied to bulk data; the big dataset is the `enterprise` seed).
 *
 *   SEED_ENABLED=true SEED_FILE=platform pnpm db:seed
 *
 * Super-admin login: command@vellora.io  (platform_role = super_admin)
 * Every login's password = SEED_PASSWORD (default Vellora123!).
 */
import { PLAN_DEFS } from '../../billing/plan-defs';
import type { ScopeType } from '../schema';
import { wipeTenantData } from './data/wipe';
import type { SeedContext } from './seed-context';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Vellora123!';

type Role = 'owner' | 'hr' | 'area_manager' | 'store_manager' | 'employee';

/** The platform super-admin. */
const SUPER_ADMIN = { email: 'abdul.rehman@vellora.io', name: 'Abdul Rehman' };

/** Two users per role, realistic names. `owner` = the company Admin/Owner. */
const ROLE_USERS: { role: Role; people: { email: string; name: string }[] }[] = [
  {
    role: 'owner',
    people: [
      { email: 'adrian.cole@northwind.io', name: 'Adrian Cole' },
      { email: 'mara.okafor@northwind.io', name: 'Mara Okafor' },
    ],
  },
  {
    role: 'hr',
    people: [
      { email: 'lena.fischer@northwind.io', name: 'Lena Fischer' },
      { email: 'omar.haddad@northwind.io', name: 'Omar Haddad' },
    ],
  },
  {
    role: 'area_manager',
    people: [
      { email: 'sophie.martin@northwind.io', name: 'Sophie Martin' },
      { email: 'daniel.reyes@northwind.io', name: 'Daniel Reyes' },
    ],
  },
  {
    role: 'store_manager',
    people: [
      { email: 'priya.nair@northwind.io', name: 'Priya Nair' },
      { email: 'tom.becker@northwind.io', name: 'Tom Becker' },
    ],
  },
  {
    role: 'employee',
    people: [
      { email: 'ivy.chen@northwind.io', name: 'Ivy Chen' },
      { email: 'noah.walsh@northwind.io', name: 'Noah Walsh' },
    ],
  },
];

const COMPANIES = [
  {
    name: 'Northwind Retail',
    city: 'London',
    country: 'GB',
    currency: 'GBP',
    timezone: 'Europe/London',
  },
  {
    name: 'Northwind Logistics',
    city: 'Manchester',
    country: 'GB',
    currency: 'GBP',
    timezone: 'Europe/London',
  },
];

const EMP_NAMES = [
  ['Grace', 'Bishop'],
  ['Leo', 'Moreno'],
  ['Aisha', 'Rahman'],
  ['Felix', 'Novak'],
  ['Hana', 'Park'],
  ['Marco', 'Rossi'],
];

async function run(ctx: SeedContext): Promise<void> {
  const { db, schema, log } = ctx;

  await wipeTenantData(ctx);

  // ── PLATFORM: plans + the super-admin operator ─────────────────────────────
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

  log('→ platform admins…');
  for (const pa of [
    { ...SUPER_ADMIN, role: 'super_admin' },
    { email: 'khalid.mansour@vellora.io', name: 'Khalid Mansour', role: 'platform_admin' },
    { email: 'yusuf.alharbi@vellora.io', name: 'Yusuf Al-Harbi', role: 'operations' },
  ]) {
    const uid = await ctx.ensureAuthUser(pa.email, pa.name, PASSWORD);
    await db
      .insert(schema.platformAdmins)
      .values({ supabaseUid: uid, email: pa.email, name: pa.name, platformRole: pa.role })
      .onConflictDoUpdate({
        target: schema.platformAdmins.supabaseUid,
        set: { name: pa.name, platformRole: pa.role },
      });
  }

  // ── GROUP holding the two companies ────────────────────────────────────────
  log('→ group + companies…');
  const [group] = await db.insert(schema.groups).values({ name: 'Northwind Holdings' }).returning();

  // Create role users once (shared across both companies → two admins/HR/etc).
  const userIdByEmail = new Map<string, string>();
  for (const ru of ROLE_USERS) {
    for (const person of ru.people) {
      const uid = await ctx.ensureAuthUser(person.email, person.name, PASSWORD);
      const [u] = await db
        .insert(schema.users)
        .values({ supabaseUid: uid, email: person.email, name: person.name })
        .onConflictDoUpdate({ target: schema.users.supabaseUid, set: { name: person.name } })
        .returning();
      userIdByEmail.set(person.email, u.id);
    }
  }

  for (let ci = 0; ci < COMPANIES.length; ci++) {
    const def = COMPANIES[ci];
    const [company] = await db
      .insert(schema.companies)
      .values({
        name: def.name,
        slug: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        country: def.country,
        currency: def.currency,
        timezone: def.timezone,
        category: 'retail',
        city: def.city,
        groupId: group.id,
        workplaceTypes: ['stores', 'offices'],
        registrationId: `REG-NW${String(ci + 1).padStart(2, '0')}`,
        status: 'active',
        planId: planIdByKey.get('business') ?? null,
      })
      .returning();
    const companyId = company.id;

    await db.insert(schema.subscriptions).values({
      companyId,
      planId: planIdByKey.get('business')!,
      status: 'active',
      interval: 'month',
    });

    // Two stores per company.
    const storeIds: string[] = [];
    for (let s = 0; s < 2; s++) {
      const [store] = await db
        .insert(schema.stores)
        .values({
          companyId,
          name: `${def.city} Store ${s + 1}`,
          code: `NW-${ci}${s}0`,
          city: def.city,
          country: def.country,
          timezone: def.timezone,
          capacity: 15,
          headStore: s === 0,
        })
        .returning();
      storeIds.push(store.id);
    }
    // One office.
    await db.insert(schema.offices).values({
      companyId,
      name: `${def.city} HQ`,
      code: `NW-OFC-${ci}`,
      city: def.city,
      country: def.country,
      timezone: def.timezone,
      capacity: 60,
      headOffice: true,
      floors: 4,
      desks: 50,
      meetingRooms: 5,
      departments: ['Operations', 'Finance', 'IT'],
    });

    // Memberships — every role's TWO users join BOTH companies.
    for (const ru of ROLE_USERS) {
      for (const person of ru.people) {
        const userId = userIdByEmail.get(person.email)!;
        const scope: { scopeType: ScopeType; scopeIds: string[] } =
          ru.role === 'area_manager'
            ? { scopeType: 'area', scopeIds: storeIds }
            : ru.role === 'store_manager'
              ? { scopeType: 'store', scopeIds: [storeIds[0]] }
              : ru.role === 'employee'
                ? { scopeType: 'self', scopeIds: [] }
                : { scopeType: 'company', scopeIds: [] };
        await db
          .insert(schema.memberships)
          .values({ userId, companyId, role: ru.role, ...scope, status: 'active' })
          .onConflictDoUpdate({
            target: [schema.memberships.userId, schema.memberships.companyId],
            set: { role: ru.role, ...scope, status: 'active' },
          });
      }
    }

    // A few employees (4–6), linking the two "employee" role users to records.
    const empUserEmails = ROLE_USERS.find((r) => r.role === 'employee')!.people.map((p) => p.email);
    for (let i = 0; i < 6; i++) {
      const [first, last] = EMP_NAMES[i % EMP_NAMES.length];
      const linkEmail = i < empUserEmails.length ? empUserEmails[i] : undefined;
      const jt = i % 2 === 0 ? 'Sales Associate' : 'Supervisor';
      await db.insert(schema.employees).values({
        companyId,
        primaryStoreId: storeIds[i % storeIds.length],
        uniqueCode: `NW-${ci}-${String(i + 1).padStart(3, '0')}`,
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@northwind.io`,
        phone: `+44 20 7946 0${String(100 + i).slice(-3)}`,
        companyEmail: `${first.toLowerCase()}.${last.toLowerCase()}@northwind.io`,
        jobTitle: jt,
        role: jt,
        department: 'Operations',
        status: 'active',
        userId: linkEmail ? userIdByEmail.get(linkEmail) : undefined,
        dateOfBirth: new Date(1988 + i, i % 12, 1 + i).toISOString().slice(0, 10),
        gender: i % 2 === 0 ? 'male' : 'female',
        nationality: def.country,
        country: def.country,
        state: def.city,
        city: def.city,
        postalCode: String(10000 + i),
        iban: `${def.country}00NWND${String(100000000 + i)}`,
        contractType: 'full_time',
        weeklyHours: 40,
        timezone: def.timezone,
      });
    }
  }

  log(
    `\n✅ Platform seed: super admin ${SUPER_ADMIN.email}, group "Northwind Holdings" (2 companies).`,
  );
  console.table([
    { role: 'super_admin', email: SUPER_ADMIN.email },
    ...ROLE_USERS.flatMap((r) => r.people.map((p) => ({ role: r.role, email: p.email }))),
  ]);
}

const platformSeed = {
  name: 'platform',
  description:
    'Super-admin operator + a realistic group (Northwind Holdings) of TWO companies, ' +
    'TWO users per role, and a few employees. Small by design. WIPES tenant data first.',
  seed: run,
};

export default platformSeed;
