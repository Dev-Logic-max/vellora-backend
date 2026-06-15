import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../../database/schema/enums';

export class CreateEmployeeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  /** Links the employee to an existing Supabase Auth identity, when known. */
  @IsOptional()
  @IsUUID()
  supabaseUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
