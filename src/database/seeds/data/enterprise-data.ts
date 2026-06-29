/**
 * Enterprise seed dataset — realistic multinational companies (web-researched
 * real firms), their groups, workplaces, and country-appropriate name pools.
 * Names of real PEOPLE are never used; employee names are generated from common
 * given/surname pools per country (worldpopulationreview / forebears references).
 */

export type Country = 'US' | 'GB' | 'AE' | 'FR' | 'DE' | 'CA' | 'SA' | 'PK';

export interface SeedWorkplace {
  kind: 'store' | 'office' | 'factory';
  name: string;
  city: string;
  country: Country;
}

export interface SeedCompany {
  name: string;
  country: Country;
  currency: string;
  timezone: string;
  category: string;
  city: string;
  workplaceTypes: ('stores' | 'offices' | 'factories')[];
  /** group label — companies sharing a label are grouped together. */
  group?: string;
  workplaces: SeedWorkplace[];
  /** rough employee headcount to generate for this company. */
  headcount: number;
}

/** 14 real multinational companies across 8 countries. Some independent, some
 * grouped in pairs. Workplaces are real city locations. */
export const COMPANIES: SeedCompany[] = [
  // ── United States ─────────────────────────────────────────────────────────
  {
    // Vellora — the platform's own demo company (formerly Zappos), grouped with
    // Whole Foods under "Dev Logics" so the group view has two members.
    name: 'Vellora',
    country: 'US',
    currency: 'USD',
    timezone: 'America/Los_Angeles',
    category: 'retail',
    city: 'Las Vegas',
    workplaceTypes: ['stores', 'offices'],
    group: 'Dev Logics',
    headcount: 8,
    workplaces: [
      { kind: 'office', name: 'Las Vegas HQ', city: 'Las Vegas', country: 'US' },
      { kind: 'store', name: 'Outlet Vegas', city: 'Las Vegas', country: 'US' },
    ],
  },
  {
    name: 'Whole Foods Market',
    country: 'US',
    currency: 'USD',
    timezone: 'America/Chicago',
    category: 'retail',
    city: 'Austin',
    workplaceTypes: ['stores', 'offices'],
    group: 'Dev Logics',
    headcount: 12,
    workplaces: [
      { kind: 'store', name: 'Austin Domain', city: 'Austin', country: 'US' },
      { kind: 'store', name: 'NYC Bowery', city: 'New York', country: 'US' },
      { kind: 'office', name: 'Austin HQ', city: 'Austin', country: 'US' },
    ],
  },
  // ── United Kingdom ────────────────────────────────────────────────────────
  {
    name: 'Marks & Spencer',
    country: 'GB',
    currency: 'GBP',
    timezone: 'Europe/London',
    category: 'retail',
    city: 'London',
    workplaceTypes: ['stores', 'offices'],
    headcount: 14,
    workplaces: [
      { kind: 'store', name: 'Marble Arch', city: 'London', country: 'GB' },
      { kind: 'store', name: 'Manchester Trafford', city: 'Manchester', country: 'GB' },
      { kind: 'office', name: 'Paddington HQ', city: 'London', country: 'GB' },
    ],
  },
  {
    name: 'JLR Manufacturing',
    country: 'GB',
    currency: 'GBP',
    timezone: 'Europe/London',
    category: 'automobile',
    city: 'Coventry',
    workplaceTypes: ['factories', 'offices'],
    headcount: 16,
    workplaces: [
      { kind: 'factory', name: 'Solihull Plant', city: 'Solihull', country: 'GB' },
      { kind: 'factory', name: 'Halewood Plant', city: 'Liverpool', country: 'GB' },
      { kind: 'office', name: 'Gaydon HQ', city: 'Warwick', country: 'GB' },
    ],
  },
  // ── United Arab Emirates ──────────────────────────────────────────────────
  {
    name: 'Apparel Group',
    country: 'AE',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    category: 'retail',
    city: 'Dubai',
    workplaceTypes: ['stores', 'offices'],
    group: 'Gulf Lifestyle Holding',
    headcount: 12,
    workplaces: [
      { kind: 'store', name: 'Dubai Mall', city: 'Dubai', country: 'AE' },
      { kind: 'store', name: 'Mall of the Emirates', city: 'Dubai', country: 'AE' },
      { kind: 'office', name: 'Jebel Ali HQ', city: 'Dubai', country: 'AE' },
    ],
  },
  {
    name: 'Lulu Group',
    country: 'AE',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    category: 'retail',
    city: 'Abu Dhabi',
    workplaceTypes: ['stores', 'offices'],
    group: 'Gulf Lifestyle Holding',
    headcount: 14,
    workplaces: [
      { kind: 'store', name: 'Al Wahda', city: 'Abu Dhabi', country: 'AE' },
      { kind: 'store', name: 'Khalidiyah', city: 'Abu Dhabi', country: 'AE' },
      { kind: 'office', name: 'Abu Dhabi HQ', city: 'Abu Dhabi', country: 'AE' },
    ],
  },
  // ── France ────────────────────────────────────────────────────────────────
  {
    name: 'Carrefour',
    country: 'FR',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    category: 'retail',
    city: 'Boulogne-Billancourt',
    workplaceTypes: ['stores', 'offices'],
    headcount: 14,
    workplaces: [
      { kind: 'store', name: 'Paris Bercy', city: 'Paris', country: 'FR' },
      { kind: 'store', name: 'Lyon Part-Dieu', city: 'Lyon', country: 'FR' },
      { kind: 'office', name: 'Massy HQ', city: 'Massy', country: 'FR' },
    ],
  },
  {
    name: 'Decathlon',
    country: 'FR',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    category: 'retail',
    city: 'Lille',
    workplaceTypes: ['stores', 'factories', 'offices'],
    headcount: 16,
    workplaces: [
      { kind: 'store', name: 'Villeneuve-d’Ascq', city: 'Lille', country: 'FR' },
      { kind: 'factory', name: 'Production Nord', city: 'Lille', country: 'FR' },
      { kind: 'office', name: 'Lille Campus', city: 'Lille', country: 'FR' },
    ],
  },
  // ── Germany ───────────────────────────────────────────────────────────────
  {
    name: 'Aldi Süd',
    country: 'DE',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    category: 'retail',
    city: 'Mülheim',
    workplaceTypes: ['stores', 'offices'],
    headcount: 12,
    workplaces: [
      { kind: 'store', name: 'Berlin Mitte', city: 'Berlin', country: 'DE' },
      { kind: 'store', name: 'Munich Centre', city: 'Munich', country: 'DE' },
      { kind: 'office', name: 'Mülheim HQ', city: 'Mülheim', country: 'DE' },
    ],
  },
  {
    name: 'Bosch Manufacturing',
    country: 'DE',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    category: 'automobile',
    city: 'Stuttgart',
    workplaceTypes: ['factories', 'offices'],
    headcount: 18,
    workplaces: [
      { kind: 'factory', name: 'Stuttgart Plant', city: 'Stuttgart', country: 'DE' },
      { kind: 'factory', name: 'Bamberg Plant', city: 'Bamberg', country: 'DE' },
      { kind: 'office', name: 'Gerlingen HQ', city: 'Stuttgart', country: 'DE' },
    ],
  },
  // ── Canada ────────────────────────────────────────────────────────────────
  {
    name: 'Loblaw Companies',
    country: 'CA',
    currency: 'CAD',
    timezone: 'America/Toronto',
    category: 'retail',
    city: 'Brampton',
    workplaceTypes: ['stores', 'offices'],
    headcount: 13,
    workplaces: [
      { kind: 'store', name: 'Toronto Eaton', city: 'Toronto', country: 'CA' },
      { kind: 'store', name: 'Vancouver Robson', city: 'Vancouver', country: 'CA' },
      { kind: 'office', name: 'Brampton HQ', city: 'Brampton', country: 'CA' },
    ],
  },
  // ── Saudi Arabia ──────────────────────────────────────────────────────────
  {
    name: 'Al Hokair Fashion Retail',
    country: 'SA',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    category: 'retail',
    city: 'Riyadh',
    workplaceTypes: ['stores', 'offices'],
    headcount: 12,
    workplaces: [
      { kind: 'store', name: 'Riyadh Park', city: 'Riyadh', country: 'SA' },
      { kind: 'store', name: 'Jeddah Red Sea', city: 'Jeddah', country: 'SA' },
      { kind: 'office', name: 'Riyadh HQ', city: 'Riyadh', country: 'SA' },
    ],
  },
  {
    name: 'Almarai',
    country: 'SA',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    category: 'food',
    city: 'Riyadh',
    workplaceTypes: ['factories', 'stores', 'offices'],
    headcount: 16,
    workplaces: [
      { kind: 'factory', name: 'Al Kharj Dairy', city: 'Al Kharj', country: 'SA' },
      { kind: 'store', name: 'Riyadh Distribution', city: 'Riyadh', country: 'SA' },
      { kind: 'office', name: 'Riyadh HQ', city: 'Riyadh', country: 'SA' },
    ],
  },
  // ── Pakistan (1–2) ────────────────────────────────────────────────────────
  {
    name: 'Khaadi',
    country: 'PK',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    category: 'textile',
    city: 'Karachi',
    workplaceTypes: ['stores', 'factories', 'offices'],
    headcount: 14,
    workplaces: [
      { kind: 'store', name: 'Dolmen Clifton', city: 'Karachi', country: 'PK' },
      { kind: 'store', name: 'Lahore Packages', city: 'Lahore', country: 'PK' },
      { kind: 'factory', name: 'Korangi Mill', city: 'Karachi', country: 'PK' },
      { kind: 'office', name: 'Karachi HQ', city: 'Karachi', country: 'PK' },
    ],
  },
];

// ── country-appropriate name pools (common given names + surnames) ───────────
export const NAME_POOLS: Record<Country, { first: string[]; last: string[] }> = {
  US: {
    first: [
      'James',
      'Olivia',
      'Liam',
      'Emma',
      'Noah',
      'Ava',
      'William',
      'Sophia',
      'Mason',
      'Isabella',
    ],
    last: [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Wilson',
      'Moore',
    ],
  },
  GB: {
    first: [
      'Oliver',
      'Amelia',
      'Harry',
      'Isla',
      'George',
      'Ava',
      'Jack',
      'Mia',
      'Charlie',
      'Grace',
    ],
    last: [
      'Smith',
      'Jones',
      'Taylor',
      'Brown',
      'Williams',
      'Wilson',
      'Evans',
      'Thomas',
      'Roberts',
      'Walker',
    ],
  },
  AE: {
    first: [
      'Mohammed',
      'Fatima',
      'Ahmed',
      'Aisha',
      'Omar',
      'Mariam',
      'Khalid',
      'Noura',
      'Saif',
      'Hessa',
    ],
    last: [
      'Al Maktoum',
      'Khan',
      'Hussain',
      'Al Nuaimi',
      'Mohamed',
      'Al Suwaidi',
      'Rahman',
      'Al Marri',
      'Saeed',
      'Al Falasi',
    ],
  },
  FR: {
    first: [
      'Gabriel',
      'Louise',
      'Raphaël',
      'Jade',
      'Louis',
      'Emma',
      'Léo',
      'Ambre',
      'Noah',
      'Alba',
    ],
    last: [
      'Martin',
      'Bernard',
      'Dubois',
      'Thomas',
      'Robert',
      'Richard',
      'Petit',
      'Durand',
      'Leroy',
      'Moreau',
    ],
  },
  DE: {
    first: ['Noah', 'Sophia', 'Matteo', 'Emma', 'Elias', 'Emilia', 'Theo', 'Hannah', 'Leo', 'Lina'],
    last: [
      'Müller',
      'Schmidt',
      'Schneider',
      'Fischer',
      'Weber',
      'Meyer',
      'Wagner',
      'Becker',
      'Schulz',
      'Hoffmann',
    ],
  },
  CA: {
    first: [
      'Liam',
      'Olivia',
      'Noah',
      'Emma',
      'Jacob',
      'Charlotte',
      'Lucas',
      'Sophia',
      'Ethan',
      'Ava',
    ],
    last: [
      'Smith',
      'Brown',
      'Tremblay',
      'Martin',
      'Roy',
      'Wilson',
      'Macdonald',
      'Gagnon',
      'Lee',
      'Taylor',
    ],
  },
  SA: {
    first: [
      'Mohammed',
      'Sara',
      'Abdullah',
      'Noura',
      'Faisal',
      'Reem',
      'Saud',
      'Lama',
      'Turki',
      'Hanan',
    ],
    last: [
      'Al Qahtani',
      'Al Ghamdi',
      'Al Otaibi',
      'Al Shehri',
      'Khan',
      'Mohammed',
      'Hussain',
      'Ahmad',
      'Al Dosari',
      'Al Harbi',
    ],
  },
  PK: {
    first: [
      'Muhammad',
      'Ayesha',
      'Ali',
      'Fatima',
      'Hassan',
      'Zainab',
      'Bilal',
      'Maryam',
      'Usman',
      'Hira',
    ],
    last: [
      'Khan',
      'Malik',
      'Bhatti',
      'Ahmed',
      'Iqbal',
      'Hussain',
      'Sheikh',
      'Qureshi',
      'Butt',
      'Chaudhry',
    ],
  },
};

export const DEPARTMENTS = [
  'Front of House',
  'Operations',
  'Logistics',
  'Management',
  'Finance',
  'IT',
];
export const JOB_TITLES = [
  'Sales Associate',
  'Cashier',
  'Shift Lead',
  'Supervisor',
  'Stock Clerk',
  'Team Lead',
  'Coordinator',
];
