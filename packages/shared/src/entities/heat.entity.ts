import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { HeatStatus } from '../enums/heat-status.enum';
import { Lap } from './lap.entity';

@Entity('heats')
@Index(['kartodromId', 'scheduledTimestamp', 'name'], { unique: true })
export class Heat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  kartodromId: string;

  @Column('int')
  scheduledTimestamp: number;

  @Column('varchar')
  name: string;

  @Column({ type: 'enum', enum: HeatStatus, default: HeatStatus.UNKNOWN })
  status: HeatStatus;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  passAt: Date | null;

  @OneToMany(() => Lap, (lap) => lap.heat)
  laps: Lap[];
}
