import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Heat, Lap, RawMessage, HeatStatus } from '@racing/shared';

@Injectable()
export class TimingService {
  private readonly logger = new Logger(TimingService.name);

  constructor(
    @InjectRepository(Heat)
    private readonly heatRepository: Repository<Heat>,
    @InjectRepository(Lap)
    private readonly lapRepository: Repository<Lap>,
    @InjectRepository(RawMessage)
    private readonly rawMessageRepository: Repository<RawMessage>,
  ) {}

  async upsertHeat(data: {
    kartodromId: string;
    scheduledTimestamp: number;
    name: string;
    status: HeatStatus;
    meta: Record<string, any>;
    passAt: Date | null;
  }): Promise<Heat> {
    const result = await this.heatRepository
      .createQueryBuilder()
      .insert()
      .into(Heat)
      .values(data)
      .orUpdate(['status', 'meta', 'passAt'], ['kartodromId', 'scheduledTimestamp', 'name'])
      .returning('*')
      .execute();

    return result.raw[0] as Heat;
  }

  async insertLap(data: {
    heat: Heat;
    driverName: string;
    kart: string;
    position: number;
    lapCount: number;
    time: number;
    driverExternalId: number;
    meta: Record<string, any>;
    passAt: Date | null;
  }): Promise<boolean> {
    try {
      await this.lapRepository
        .createQueryBuilder()
        .insert()
        .into(Lap)
        .values({ ...data, heat: { id: data.heat.id } as any })
        .orIgnore()
        .execute();
      return true;
    } catch (err) {
      this.logger.warn(`Failed to insert lap: ${err.message}`);
      return false;
    }
  }

  async insertRawMessage(kartodromId: string, data: any): Promise<void> {
    await this.rawMessageRepository.save({ kartodromId, data });
  }
}
