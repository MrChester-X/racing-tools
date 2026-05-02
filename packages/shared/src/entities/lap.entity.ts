import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Heat } from './heat.entity';

@Entity('laps')
@Index(['heat', 'driverExternalId', 'lapCount'], { unique: true })
export class Lap {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Heat, (heat) => heat.laps, { eager: true })
  @JoinColumn({ name: 'heatId' })
  heat: Heat;

  @Column('varchar')
  driverName: string;

  @Column('varchar')
  kart: string;

  @Column('int')
  position: number;

  @Column('int')
  lapCount: number;

  @Column('int')
  time: number;

  @Column('int')
  driverExternalId: number;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  passAt: Date | null;
}
