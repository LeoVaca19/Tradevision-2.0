export { parseTradesCsv, type CsvImportResult, type ParsedManualTrade, type FailedRow } from "./csv-import.js";
export {
  MetaApiDeal,
  METAAPI_INGEST_VERSION,
  normalizeClosedPositions,
  createMetaApiClient,
  type MetaApiClient,
  type NormalizedVerifiedTrade,
  type NormalizedExecution,
} from "./metaapi.js";
export {
  buildRoundTrips,
  type Fill,
  type FillAttribution,
  type ProfitCalcMethod,
  type RoundTrip,
} from "./round-trips.js";
export {
  MAX_UPLOAD_BYTES,
  validateUpload,
  buildAttachmentKey,
  attachmentKeyBelongsTo,
  readR2Config,
  createR2Client,
  type PresignedUpload,
  type PresignedDownload,
  type UploadValidation,
} from "./r2.js";
export {
  presignAttachmentUpload,
  presignAttachmentDownload,
  activeStorageProvider,
  readSupabaseStorageConfig,
  ensureStorageBucket,
  type StorageProvider,
  type SupabaseStorageConfig,
} from "./storage.js";

// Mentor IA NO vive acá (decidido en el Bloque 1 de la migración): tiene su
// propio paquete, `@tradevision/mentor` (Bloque 7), para que la invariante
// FR-38 (nunca toca Estadística Verificada, nunca se publica) sea una
// frontera de import verificable por typecheck.
