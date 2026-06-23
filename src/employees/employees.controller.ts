import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequireEntitlement } from '../common/decorators/require-entitlement.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { PlanGuard } from '../entitlements/plan.guard';
import {
  CreateBankAccountDto,
  CreateContractDto,
  CreateEmployeeDto,
  CreateMedicalDto,
  CreateQualificationDto,
  ImportEmployeesDto,
  InviteEmployeeDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
  UpdatePreferencesDto,
  UpsertStoreLinkDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListEmployeesDto) {
    return this.employees.list(companyId, query);
  }

  @Get('export')
  @UseGuards(RolesGuard, PlanGuard)
  @Roles('owner', 'hr')
  @RequireEntitlement('employee.advanced')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  export(@CompanyId() companyId: string) {
    return this.employees.exportCsv(companyId);
  }

  @Post('import')
  @UseGuards(RolesGuard, PlanGuard)
  @Roles('owner', 'hr')
  @RequireEntitlement('employee.advanced')
  import(@CompanyId() companyId: string, @Body() dto: ImportEmployeesDto) {
    return this.employees.importCsv(companyId, dto.csv);
  }

  @Get('supervisors')
  @ApiOperation({ summary: 'Users above Employee in this company (supervisor picker)' })
  supervisors(@CompanyId() companyId: string) {
    return this.employees.listSupervisors(companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  create(@CompanyId() companyId: string, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(companyId, dto);
  }

  @Get(':id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getDetail(companyId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(companyId, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  archive(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.archive(companyId, id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  @ApiOperation({ summary: 'Permanently delete an employee (irreversible)' })
  remove(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.remove(companyId, id);
  }

  @Post(':id/invite')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  invite(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteEmployeeDto,
  ) {
    return this.employees.invite(companyId, id, dto);
  }

  // ── secondary store links ───────────────────────────────────────────────
  @Get(':id/stores')
  listStores(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listStoreLinks(companyId, id);
  }

  @Post(':id/stores')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  addStore(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertStoreLinkDto,
  ) {
    return this.employees.addStoreLink(companyId, id, dto);
  }

  @Delete(':id/stores/:storeId')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  removeStore(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ) {
    return this.employees.removeStoreLink(companyId, id, storeId);
  }

  // ── bank accounts ─────────────────────────────────────────────────────────
  @Get(':id/bank-accounts')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  bankAccounts(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listBankAccounts(companyId, id);
  }

  @Post(':id/bank-accounts')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  addBankAccount(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.employees.addBankAccount(companyId, id, dto);
  }

  @Delete(':id/bank-accounts/:accountId')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  removeBankAccount(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.employees.removeBankAccount(companyId, id, accountId);
  }

  // ── contracts (permissioned) ─────────────────────────────────────────────
  @Get(':id/contracts')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  contracts(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listContracts(companyId, id);
  }

  @Post(':id/contracts')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  addContract(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContractDto,
  ) {
    return this.employees.addContract(companyId, id, dto);
  }

  // ── qualifications (paid) ─────────────────────────────────────────────────
  @Get(':id/qualifications')
  @UseGuards(PlanGuard)
  @RequireEntitlement('employee.advanced')
  qualifications(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listQualifications(companyId, id);
  }

  @Post(':id/qualifications')
  @UseGuards(RolesGuard, PlanGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  @RequireEntitlement('employee.advanced')
  addQualification(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQualificationDto,
  ) {
    return this.employees.addQualification(companyId, id, dto);
  }

  // ── medicals (paid) ──────────────────────────────────────────────────────
  @Get(':id/medicals')
  @UseGuards(PlanGuard)
  @RequireEntitlement('employee.advanced')
  medicals(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listMedicals(companyId, id);
  }

  @Post(':id/medicals')
  @UseGuards(RolesGuard, PlanGuard)
  @Roles('owner', 'hr')
  @RequireEntitlement('employee.advanced')
  addMedical(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMedicalDto,
  ) {
    return this.employees.addMedical(companyId, id, dto);
  }

  // ── preferences ─────────────────────────────────────────────────────────────
  @Get(':id/preferences')
  preferences(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getPreferences(companyId, id);
  }

  @Put(':id/preferences')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  setPreferences(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.employees.updatePreferences(companyId, id, dto);
  }
}
