import { InitializeUseCase } from '@/application/usecases/InitializeUseCase';
import { SearchUseCase } from '@/application/usecases/SearchUseCase';
import { FocusNodeUseCase } from '@/application/usecases/FocusNodeUseCase';
import { UnfocusUseCase } from '@/application/usecases/UnfocusUseCase';
import { AdjustDimensionUseCase } from '@/application/usecases/AdjustDimensionUseCase';
import { SwitchClusterUseCase } from '@/application/usecases/SwitchClusterUseCase';
import { GetPoetDetailUseCase } from '@/application/usecases/GetPoetDetailUseCase';
import { GetWorkDetailUseCase } from '@/application/usecases/GetWorkDetailUseCase';
import { GetPoetRelationsUseCase } from '@/application/usecases/GetPoetRelationsUseCase';
import { PersistViewUseCase } from '@/application/usecases/PersistViewUseCase';
import { CaptureScreenshotUseCase } from '@/application/usecases/CaptureScreenshotUseCase';
import { GenerateShareLinkUseCase } from '@/application/usecases/GenerateShareLinkUseCase';
import { RecitationUseCase } from '@/application/usecases/RecitationUseCase';
import { FavoritePoetsUseCase } from '@/application/usecases/FavoritePoetsUseCase';
import { JsonPoetRepository } from '@/infrastructure/data/PoetRepository';
import { JsonNodeRepository } from '@/infrastructure/data/NodeRepository';
import { JsonScoreRepository } from '@/infrastructure/data/ScoreRepository';
import { JsonWorkRepository } from '@/infrastructure/data/WorkRepository';
import { ShardedRelationRepository } from '@/infrastructure/data/ShardedRelationRepository';
import { JsonTourRepository } from '@/infrastructure/data/JsonTourRepository';
import { SpeechSynthesisAdapter } from '@/infrastructure/audio/SpeechSynthesisAdapter';
import { WasmBridge } from '@/infrastructure/wasm/bridge';
import { ShardSearchIndex } from '@/infrastructure/search/ShardSearchIndex';
import { ShardSemanticIndex } from '@/infrastructure/search/ShardSemanticIndex';
import { LoggerFactory } from '@/infrastructure/logging/LoggerFactory';
import { ConsoleLogger } from '@/infrastructure/logging/ConsoleLogger';
import { IndexedDBLogger } from '@/infrastructure/logging/IndexedDBLogger';
import { FileLogger } from '@/infrastructure/logging/FileLogger';
import { getConfig } from '@/infrastructure/config/ConfigLoader';
import { Galaxy } from '@/domain/aggregates/Galaxy';
import { LayoutService } from '@/domain/services/LayoutService';
import { RelationService } from '@/domain/services/RelationService';

export class CompositionRoot {
  readonly initializeUseCase: InitializeUseCase;
  readonly searchUseCase: SearchUseCase;
  readonly focusNodeUseCase: FocusNodeUseCase;
  readonly unfocusUseCase: UnfocusUseCase;
  readonly adjustDimensionUseCase: AdjustDimensionUseCase;
  readonly switchClusterUseCase: SwitchClusterUseCase;
  readonly getPoetDetailUseCase: GetPoetDetailUseCase;
  readonly getWorkDetailUseCase: GetWorkDetailUseCase;
  readonly getPoetRelationsUseCase: GetPoetRelationsUseCase;
  readonly persistViewUseCase: PersistViewUseCase;
  readonly captureScreenshotUseCase: CaptureScreenshotUseCase;
  readonly generateShareLinkUseCase: GenerateShareLinkUseCase;
  readonly recitationUseCase: RecitationUseCase;
  readonly favoritePoetsUseCase: FavoritePoetsUseCase;
  readonly wasm: WasmBridge;
  readonly logger: ConsoleLogger;
  readonly dbLogger: IndexedDBLogger;
  readonly fileLogger?: FileLogger;
  readonly galaxy: Galaxy;
  readonly relationService: RelationService;
  readonly tourRepository: JsonTourRepository;

  private static instance: CompositionRoot;

  private constructor() {
    const config = getConfig();
    const logConfig = config.getLoggingConfig();
    const bundle = LoggerFactory.createFromConfig(logConfig);
    this.logger = bundle.console;
    this.dbLogger = bundle.db ?? LoggerFactory.getIndexedDBLogger(logConfig.level, logConfig.retentionDays);
    this.fileLogger = bundle.file;

    this.logger.info('系统初始化', { version: config.get('version') });

    this.dbLogger.init().then(() => {
      this.logger.info('日志数据库初始化完成');
      this.fileLog('日志数据库初始化完成');
    }).catch(err => {
      this.logger.error('日志数据库初始化失败', { error: String(err) });
    });

    const poetRepo = new JsonPoetRepository();
    const nodeRepo = new JsonNodeRepository();
    const workRepo = new JsonWorkRepository();
    const scoreRepo = new JsonScoreRepository();
    this.wasm = new WasmBridge();
    this.galaxy = new Galaxy();
    const layoutService = new LayoutService();
    this.relationService = new RelationService();
    this.tourRepository = new JsonTourRepository();

    this.initializeUseCase = new InitializeUseCase(poetRepo, nodeRepo, scoreRepo, this.wasm);
    this.searchUseCase = new SearchUseCase(
      nodeRepo,
      this.wasm,
      new ShardSearchIndex(),
      new ShardSemanticIndex()
    );
    this.focusNodeUseCase = new FocusNodeUseCase(poetRepo, scoreRepo);
    this.unfocusUseCase = new UnfocusUseCase(this.galaxy);
    this.adjustDimensionUseCase = new AdjustDimensionUseCase(this.galaxy, layoutService);
    this.switchClusterUseCase = new SwitchClusterUseCase(this.galaxy, layoutService);
    this.getPoetDetailUseCase = new GetPoetDetailUseCase(poetRepo, workRepo, scoreRepo);
    this.getWorkDetailUseCase = new GetWorkDetailUseCase(workRepo, poetRepo, scoreRepo);
    this.getPoetRelationsUseCase = new GetPoetRelationsUseCase(
      this.relationService,
      new ShardedRelationRepository(this.relationService)
    );
    this.persistViewUseCase = new PersistViewUseCase();
    this.captureScreenshotUseCase = new CaptureScreenshotUseCase();
    this.generateShareLinkUseCase = new GenerateShareLinkUseCase();
    this.recitationUseCase = new RecitationUseCase(new SpeechSynthesisAdapter());
    this.favoritePoetsUseCase = new FavoritePoetsUseCase();
  }

  async initialize(): Promise<void> {
    if (this.wasm.initialized) return;
    try {
      await this.wasm.init();
      this.logger.info('WASM 模块初始化完成');
      this.fileLog('WASM 模块初始化完成');
    } catch (err) {
      this.logger.error('WASM 模块初始化失败', { error: String(err) });
      this.fileLog(`WASM 模块初始化失败: ${err}`);
    }
  }

  private fileLog(message: string, level: 'INFO' | 'ERROR' = 'INFO'): void {
    if (!this.fileLogger?.isReady) return;
    if (level === 'ERROR') {
      this.fileLogger.error(message);
    } else {
      this.fileLogger.info(message);
    }
  }

  static getInstance(): CompositionRoot {
    if (!CompositionRoot.instance) {
      CompositionRoot.instance = new CompositionRoot();
    }
    return CompositionRoot.instance;
  }

  logDebug(module: string, message: string, context?: object): void {
    const logger = LoggerFactory.createConsoleLogger(module, 'DEBUG');
    logger.debug(message, context);
    this.dbLogger.debug(message, { module, ...context });
    if (this.fileLogger?.isReady) {
      this.fileLogger.debug(`[${module}] ${message}`, context);
    }
  }

  logInfo(module: string, message: string, context?: object): void {
    const logger = LoggerFactory.createConsoleLogger(module);
    logger.info(message, context);
    this.dbLogger.info(message, { module, ...context });
    if (this.fileLogger?.isReady) {
      this.fileLogger.info(`[${module}] ${message}`, context);
    }
  }

  logError(module: string, message: string, context?: object): void {
    const logger = LoggerFactory.createConsoleLogger(module);
    logger.error(message, context);
    this.dbLogger.error(message, { module, ...context });
    if (this.fileLogger?.isReady) {
      this.fileLogger.error(`[${module}] ${message}`, context);
    }
  }
}
