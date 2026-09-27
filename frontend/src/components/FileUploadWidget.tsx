import React, { useState } from 'react';
import { apiClient } from '../services/apiClient';
import { useNotification } from '../contexts/NotificationContext';

export interface FileUploadWidgetProps { patientId: string; onUploadSuccess?: () => void; }
type Analysis = Record<string, unknown>;
type UploadResult = { id?: string; filename?: string; original_filename?: string; processing_status?: string; notes?: string; analysis?: Analysis | null; created_at?: string; mime_type?: string };

const pretty = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
const renderValue = (value: unknown): string => Array.isArray(value) ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ') : value && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—');

export const FileUploadWidget: React.FC<FileUploadWidgetProps> = ({ patientId, onUploadSuccess }) => {
  const { showToast } = useNotification();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCategory, setFileCategory] = useState('voice');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [record, setRecord] = useState<UploadResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    if (next) { setSelectedFile(next); setUploadProgress(0); setAnalysis(null); setRecord(null); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) { showToast('warning', 'No File Selected', 'Please select a file before submitting.'); return; }
    setIsUploading(true); setUploadProgress(5); setAnalysis(null); setRecord(null);
    const formData = new FormData();
    formData.append('patient_id', patientId); formData.append('file_category', fileCategory); formData.append('file', selectedFile);
    try {
      const response = await apiClient.post<UploadResult>('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: event => { if (event.total) setUploadProgress(Math.min(95, Math.round(event.loaded * 100 / event.total))); } });
      const data = response.data || {};
      let parsed: any = null;
      if (data.notes) { try { parsed = JSON.parse(data.notes); } catch { parsed = null; } }
      const extracted = data.analysis || parsed?.analysis || null;
      setRecord(data); setAnalysis(extracted); setUploadProgress(100);
      if (extracted && Object.keys(extracted).length) showToast('success', 'Analysis complete', `NUVYRA extracted ${Object.keys(extracted).length} data fields from ${selectedFile.name}.`);
      else showToast('warning', 'Uploaded, but no extractable data was returned', 'The file was stored, but NUVYRA did not receive analyzable output.');
      onUploadSuccess?.();
    } catch (err: any) {
      showToast('error', 'Upload & analysis failed', err?.response?.data?.detail || err?.message || 'NUVYRA could not process this file.');
    } finally { setIsUploading(false); }
  };

  return <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
    <h3 className="text-base font-bold text-slate-900 mb-1">Multimodal File Upload</h3>
    <p className="text-xs text-slate-500 mb-4">Upload a voice sample, video, image, or PDF. NUVYRA will extract available technical measurements or document text and show exactly what it found.</p>
    <form onSubmit={handleUpload} className="space-y-4">
      <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50" aria-label="File category">
        <option value="voice">Voice Biomarker (.wav, .mp3, .m4a)</option><option value="video">Video & Facial Biomarker (.mp4, .webm)</option><option value="image">Image (.jpg, .png)</option><option value="pdf_report">PDF Report (.pdf)</option>
      </select>
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50"><input type="file" onChange={handleFileChange} id="file-input" className="hidden" disabled={isUploading}/><label htmlFor="file-input" className="cursor-pointer flex flex-col items-center"><span className="text-xs font-semibold text-indigo-600 mb-1">{selectedFile ? selectedFile.name : 'Click to select or drag & drop file'}</span><span className="text-[10px] text-slate-400">Maximum file size: 50MB</span></label></div>
      {isUploading && <div><div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Uploading and extracting data…</span><span>{uploadProgress}%</span></div><div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div className="bg-indigo-600 h-2 transition-all" style={{width:`${uploadProgress}%`}}/></div></div>}
      <button type="submit" disabled={!selectedFile || isUploading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-2.5 rounded-lg disabled:opacity-50">{isUploading ? 'Uploading & analyzing…' : 'Upload & Analyze'}</button>
    </form>
    {record && <div className="mt-5 space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs"><div className="flex items-center justify-between"><div className="font-semibold text-emerald-800">Analysis record</div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">{record.processing_status || 'COMPLETED'}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-slate-600"><div>File: <b>{record.original_filename || selectedFile?.name}</b></div><div>Record ID: <b className="font-mono">{record.id || '—'}</b></div><div>Type: <b>{record.mime_type || fileCategory}</b></div><div>Analyzed: <b>{record.created_at ? new Date(record.created_at).toLocaleString() : 'just now'}</b></div></div></div>
      {analysis ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-slate-700"><div className="font-semibold text-indigo-800 mb-3">What NUVYRA analyzed</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{Object.entries(analysis).filter(([key]) => key !== 'text_preview').map(([key,value]) => <div key={key} className="rounded-lg bg-white p-3"><div className="text-slate-500 mb-1">{pretty(key)}</div><div className="font-medium break-words whitespace-pre-wrap">{renderValue(value)}</div></div>)}</div>{typeof analysis.text_preview === 'string' && analysis.text_preview && <div className="mt-3"><div className="font-semibold text-slate-600 mb-1">Extracted text preview</div><pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px]">{analysis.text_preview}</pre></div>}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><b>Stored, but not analyzed.</b> The server returned no extracted measurements/text for this file. This is not presented as a successful analysis.</div>}
    </div>}
  </div>;
};
