import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../../database/schema/enums';

/** Manual partial of CreateEmployeeDto (email is immutable post-create). */
export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  supabaseUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
