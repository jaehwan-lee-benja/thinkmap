import { createContext, useContext } from 'react'

const PageContext = createContext(null)

export function usePageContext() {
  return useContext(PageContext)
}

export default PageContext
