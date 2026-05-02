import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../auth/user.entity';

export enum VideoJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  ERROR = 'error',
}

@Entity('video_jobs')
export class VideoJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  raceUrl: string;

  @Column({ nullable: true })
  raceName: string;

  @Column()
  driverName: string;

  @Column('float')
  offset: number;

  @Column()
  sourceVideoS3Key: string;

  @Column({ nullable: true })
  resultVideoS3Key: string;

  @Column({ type: 'enum', enum: VideoJobStatus, default: VideoJobStatus.PENDING })
  status: VideoJobStatus;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  raceData: any;

  @Column({ type: 'float', nullable: true })
  videoDurationSec: number | null;

  @Column({ type: 'float', nullable: true })
  renderDurationMs: number | null;

  @Column({ type: 'float', nullable: true })
  uploadDurationMs: number | null;

  @Column({ type: 'varchar', nullable: true })
  remotionRenderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  remotionBucketName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  renderStartedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
