export interface Clip {
  id: string;
  content?: string | null;
  length: number;
  isPinned: boolean;
  createdAt: string;
  image?: string | null;
  type: string;
  label: string;
  isHidden: boolean;
  source?: string; // "local" (default) or "network"
}
