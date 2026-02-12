import { Test, TestingModule } from '@nestjs/testing';
import { KiteService } from './kite.service';

describe('KiteService', () => {
  let service: KiteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KiteService],
    }).compile();

    service = module.get<KiteService>(KiteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
