// Shared TypeScript types for the Person Detail page

export interface OsintVectorResult {
  vector: string
  label: string
  query: string
  count: number
  results: {
    title: string
    link: string
    snippet: string
    source: string
    relevanceScore?: number
  }[]
}

export interface OsintSearchData {
  total: number
  vectorCount: number
  searchedAt: string
  vectors: OsintVectorResult[]
}

export interface PhotoSearchEngine {
  label: string
  desc: string
  color: string
  border: string
  bg: string
  url: string
}
