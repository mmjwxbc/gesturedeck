const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export type PresentationUploadResponse = {
  id: string;
  original_filename: string;
  pdf_url: string;
};

export function makeApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

export async function uploadPresentation(file: File): Promise<PresentationUploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE}/api/presentations/upload`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed with status ${response.status}`);
  }

  return response.json();
}
