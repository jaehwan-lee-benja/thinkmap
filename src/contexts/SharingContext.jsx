import { createContext, useContext } from 'react'

const SharingContext = createContext(null)

export function useSharingContext() {
  return useContext(SharingContext)
}

export default SharingContext
