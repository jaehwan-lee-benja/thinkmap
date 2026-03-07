import { createContext, useContext } from 'react'

const UIContext = createContext(null)

export function useUIContext() {
  return useContext(UIContext)
}

export default UIContext
