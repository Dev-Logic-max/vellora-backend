import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, arrayContains, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { companies, groups, memberships, type Company, type Group } from '../database/schema';
import type { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

/**
 * Groups sit above the tenant, so they're managed on the privileged connection
 * with explicit owner checks (a user must be in `owner_user_ids`). Attaching a
 * company also requires the caller to own that company.
 */
@Injectable()
export class GroupsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async create(dto: CreateGroupDto, ownerUserId: string): Promise<Group> {
    const [group] = await this.db
      .insert(groups)
      .values({
        name: dto.name,
        logoUrl: dto.logoUrl,
        billingMode: dto.billingMode,
        ownerUserIds: [ownerUserId],
      })
      .returning();
    return group;
  }

  listForUser(userId: string): Promise<Group[]> {
    return this.db.query.groups.findMany({
      where: arrayContains(groups.ownerUserIds, [userId]),
      orderBy: (g, { asc }) => asc(g.name),
    });
  }

  async getOwned(id: string, userId: string): Promise<Group> {
    const group = await this.db.query.groups.findFirst({ where: eq(groups.id, id) });
    if (!group) throw new NotFoundException('Group not found.');
    this.assertOwner(group, userId);
    return group;
  }

  async update(id: string, userId: string, dto: UpdateGroupDto): Promise<Group> {
    await this.getOwned(id, userId);
    const [updated] = await this.db
      .update(groups)
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.billingMode !== undefined ? { billingMode: dto.billingMode } : {}),
        ...(dto.ownerUserIds !== undefined ? { ownerUserIds: dto.ownerUserIds } : {}),
      })
      .where(eq(groups.id, id))
      .returning();
    return updated;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.getOwned(id, userId);
    await this.db.update(companies).set({ groupId: null }).where(eq(companies.groupId, id));
    await this.db.delete(groups).where(eq(groups.id, id));
  }

  /** Companies currently in the group (the owner sees them across tenants). */
  async companies(id: string, userId: string): Promise<Company[]> {
    await this.getOwned(id, userId);
    return this.db.query.companies.findMany({ where: eq(companies.groupId, id) });
  }

  async attachCompany(groupId: string, companyId: string, userId: string): Promise<void> {
    await this.getOwned(groupId, userId);
    await this.assertCompanyOwner(companyId, userId);
    await this.db.update(companies).set({ groupId }).where(eq(companies.id, companyId));
  }

  async detachCompany(groupId: string, companyId: string, userId: string): Promise<void> {
    await this.getOwned(groupId, userId);
    await this.db
      .update(companies)
      .set({ groupId: null })
      .where(and(eq(companies.id, companyId), eq(companies.groupId, groupId)));
  }

  private assertOwner(group: Group, userId: string): void {
    if (!group.ownerUserIds.includes(userId)) {
      throw new ForbiddenException('You do not own this group.');
    }
  }

  private async assertCompanyOwner(companyId: string, userId: string): Promise<void> {
    const membership = await this.db.query.memberships.findFirst({
      where: and(
        eq(memberships.companyId, companyId),
        eq(memberships.userId, userId),
        eq(memberships.role, 'owner'),
      ),
    });
    if (!membership) {
      throw new ForbiddenException('You must own the company to attach it.');
    }
  }
}
