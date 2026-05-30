export interface Clip {
  id: string
  content?: string
  length: number
  isPinned: boolean
  createdAt: string
  image?: string
  type: string
  label: string
  isHidden: boolean
}
