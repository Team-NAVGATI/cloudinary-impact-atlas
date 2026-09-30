import type { RiskLevel } from '@/lib/utils';

export type Phase = 'BASELINE' | 'BEFORE' | 'DURING' | 'AFTER';

export interface Zone {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  kind: 'RIVER' | 'LAKE' | 'MARSH' | 'LOCALITY' | 'COAST';
  lat: number;
  lng: number;
  description: string | null;
  keywords: string[];
}

export interface Contact {
  id: string;
  organization_id: string;
  zone_id: string | null;
  name: string;
  designation: string;
  email: string;
  phone: string | null;
  active: boolean;
}

export interface MediaAsset {
  id: string;
  organization_id: string;
  zone_id: string | null;
  cloudinary_public_id: string;
  cloudinary_asset_id: string | null;
  cloudinary_url: string;
  version: number | null;
  etag: string | null;
  resource_type: string;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  description: string | null;
  activity: string | null;
  location: string | null;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  status: string;
  phase: Phase;
  event_label: string | null;
  source_name: string | null;
  source_url: string | null;
  license: string | null;
  attribution: string | null;
  severity: number | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface VisionSignals {
  water_visible: boolean;
  blocked_drain: boolean;
  garbage: boolean;
  structures_submerged: boolean;
  people_at_risk: boolean;
  river_overflow: boolean;
}

export interface VisionResult {
  provider: 'cloudinary-ai-vision' | 'nvidia-vlm' | 'metadata-heuristic';
  model: string;
  caption: string;
  tags: string[];
  objects: string[];
  severity: 0 | 1 | 2 | 3;
  signals: VisionSignals;
  confidence: number;
  raw: unknown;
}

export interface AiAnalysis {
  id: string;
  media_asset_id: string;
  model: string;
  provider: string;
  description: string | null;
  severity: number | null;
  tags: string[];
  objects: unknown;
  environmental_signals: Partial<VisionSignals> & Record<string, unknown>;
  confidence: number | null;
  created_at: string;
}

export interface Report {
  id: string;
  organization_id: string;
  zone_id: string | null;
  title: string;
  content_markdown: string;
  risk_level: RiskLevel;
  risk_score: number;
  weather: Record<string, unknown>;
  evidence: unknown[];
  llm_provider: string | null;
  story_url: string | null;
  share_token: string;
  created_at: string;
}

export interface Comparison {
  id: string;
  zone_id: string | null;
  before_asset_id: string;
  after_asset_id: string;
  title: string | null;
  summary: string | null;
  change_score: number | null;
  provider: string | null;
  created_at: string;
}
