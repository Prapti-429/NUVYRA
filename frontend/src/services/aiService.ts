import apiClient from './apiClient';

export interface AIAnalysisRequest {
  fatigue: number;
  mood_deviation: number;
  symptom_burden: number;
  energy_level?: number;
  sleep_quality?: number;
  stress_level?: number;
  concentration_level?: number;
  physical_comfort?: number;
  appetite_level?: number;
  mood_level?: number;
  sleep_hours?: number;
  sleep_awakenings?: number;
  physical_comfort_observation?: string;
  physical_comfort_notes?: string;
  voice_rms?: number;
  voice_zero_crossing_rate?: number;
  voice_pitch_hz?: number;
  voice_speech_activity?: number;
  voice_speech_rate?: number;
  voice_pause_ratio?: number;
  voice_language?: string;
  face_motion?: number;
  face_luminance_variability?: number;
  face_blink_proxy?: number;
  blink_rate_per_minute?: number;
  eye_opening_proxy?: number;
  gait_motion?: number;
  gait_variability?: number;
  gait_symmetry_proxy?: number;
  breathing_rate_per_minute?: number;
  breathing_variability?: number;
  head_motion?: number;
  head_motion_variability?: number;
  source_duration_seconds: number;
}

export interface BiomarkerFeature { name: string; category: string; value: number; deviation?: number | null; }
export interface AIContextSummary {
  past_history_count: number;
  document_count: number;
  pending_reminder_count: number;
  document_types: string[];
  context_used: string[];
  history_items: string[];
  analyzed_documents: Array<{
    filename: string;
    document_type: string;
    uploaded_at?: string | null;
    text_extracted: boolean;
    tests: string[];
    medications: string[];
    dates: string[];
    follow_up_mentions: string[];
    summary: string;
  }>;
}
export interface AIAnalysisResponse {
  check_in_id: string; overall_score: number; trend: string; confidence: number;
  model_name: string; model_version: string; baseline_observations: number;
  explanation: string; features: BiomarkerFeature[]; generated_at: string;
  data_quality_score: number; modalities_present: string[]; top_drivers: string[];
  recommendations: string[]; limitations: string[]; missing_modalities: string[];
  persistence_signal: string;
  context: AIContextSummary;
}
export interface AIHistoryPoint { check_in_id: string; score: number; trend: string; confidence: number; generated_at: string; }
export interface AIHistoryResponse { items: AIHistoryPoint[]; baseline_observations: number; model_name: string; model_version: string; }

export const aiService = {
  async analyze(payload: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const response = await apiClient.post<AIAnalysisResponse>('/ai/analyze', payload); return response.data;
  },
  async latest(): Promise<AIAnalysisResponse> { const response = await apiClient.get<AIAnalysisResponse>('/ai/latest'); return response.data; },
  async history(limit = 30): Promise<AIHistoryResponse> { const response = await apiClient.get<AIHistoryResponse>('/ai/history', { params: { limit } }); return response.data; },
};
