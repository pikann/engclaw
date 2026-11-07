import { createContext, useContext } from 'react'

/** Opens the global dictionary dialog for a word; null outside the provider (words stay plain). */
export const WordLookupContext = createContext<((word: string) => void) | null>(null)

export const useWordLookup = () => useContext(WordLookupContext)
