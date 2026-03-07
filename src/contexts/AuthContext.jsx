import { createContext, useContext } from 'react'

const AuthContext = createContext(null)

export function useAuthContext() {
  return useContext(AuthContext)
}

export default AuthContext
