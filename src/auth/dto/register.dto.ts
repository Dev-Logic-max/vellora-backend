import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Referral-gated user signup: the user supplies the company's registration id +
 * their details. Recorded in `platform_signups` (independent), NOT a company user.
 */
export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /** The company-provided registration code (referral gate). */
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  registrationId!: string;
}

/**
 * Public self-service registration: creates the owner's auth user + a company in
 * `pending` status with an owner membership and a trialing subscription on the
 * chosen plan. Email verification promotes the company to `active` on first login.
 */
export class RegisterDto {
  // ── Company ────────────────────────────────────────────────────────────────
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  /** Industry/category for the registration cards (retail, hospitality, …). */
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  // ── Owner (admin) ──────────────────────────────────────────────────────────
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsOptional()
  @IsEmail()
  ownerSecondaryEmail?: string;

  @IsOptional()
  @IsEmail()
  ownerPersonalEmail?: string;

  // ── Plan ───────────────────────────────────────────────────────────────────
  /** Plan key from the catalogue (free/starter/pro/business). Defaults to free. */
  @IsOptional()
  @IsString()
  planKey?: string;

  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}
