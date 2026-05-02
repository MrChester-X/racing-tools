import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('raw_messages')
export class RawMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  kartodromId: string;

  @Column({ type: 'jsonb' })
  data: any;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
