import { createContext, useContext } from 'react'

const TemplateContext = createContext(null)

export function useTemplateContext() {
  return useContext(TemplateContext)
}

export default TemplateContext
