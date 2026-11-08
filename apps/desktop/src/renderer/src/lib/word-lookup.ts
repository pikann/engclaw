import { createContext, useContext } from 'react'

/** Opens the global dictionary dialog for a word (and the sentence it appeared in, when known); null outside the provider (words stay plain). */
export type WordLookup = (word: string, context?: string) => void

export const WordLookupContext = createContext<WordLookup | null>(null)

export const useWordLookup = () => useContext(WordLookupContext)
