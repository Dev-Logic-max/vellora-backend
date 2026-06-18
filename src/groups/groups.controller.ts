import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Body() dto: CreateGroupDto, @CurrentUser('userId') userId: string) {
    return this.groupsService.create(dto, userId);
  }

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.groupsService.listForUser(userId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.groupsService.getOwned(id, userId);
  }

  @Get(':id/companies')
  companies(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.groupsService.companies(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.groupsService.remove(id, userId);
  }

  @Post(':id/companies/:companyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.attachCompany(id, companyId, userId);
  }

  @Delete(':id/companies/:companyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.detachCompany(id, companyId, userId);
  }
}
