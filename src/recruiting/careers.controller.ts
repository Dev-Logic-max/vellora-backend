import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { ApplyDto, RequestResumeUploadDto } from './dto/recruiting.dto';
import { RecruitingService } from './recruiting.service';

/**
 * PUBLIC careers site API (09-recruiting §6). Unauthenticated — the tenant is
 * resolved from the company `:slug`, never from a token, and only published-job
 * public-safe fields are returned (no cross-tenant leak). Rate-limited per IP.
 * Applications capture explicit GDPR consent before any data is stored.
 */
@ApiTags('careers')
@Public()
@Controller('careers')
@UseGuards(RateLimitGuard)
export class CareersController {
  constructor(private readonly recruiting: RecruitingService) {}

  @Get(':slug/jobs')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  listJobs(@Param('slug') slug: string) {
    return this.recruiting.publicListJobs(slug);
  }

  @Get(':slug/jobs/:jobSlug')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  jobDetail(@Param('slug') slug: string, @Param('jobSlug') jobSlug: string) {
    return this.recruiting.publicJobDetail(slug, jobSlug);
  }

  @Post(':slug/resume-upload')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  resumeUpload(@Param('slug') slug: string, @Body() dto: RequestResumeUploadDto) {
    return this.recruiting.publicResumeUpload(slug, dto.filename);
  }

  @Post(':slug/jobs/:jobSlug/apply')
  @RateLimit({ limit: 5, windowMs: 60_000 })
  apply(@Param('slug') slug: string, @Param('jobSlug') jobSlug: string, @Body() dto: ApplyDto) {
    return this.recruiting.publicApply(slug, jobSlug, dto);
  }
}
