import { Test, TestingModule } from '@nestjs/testing';
import { TickerGateway } from './ticker.gateway';

describe('TickerGateway', () => {
  let gateway: TickerGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TickerGateway],
    }).compile();

    gateway = module.get<TickerGateway>(TickerGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
