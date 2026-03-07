import { createContext, useContext } from 'react'

const BackupContext = createContext(null)

export function useBackupContext() {
  return useContext(BackupContext)
}

export default BackupContext
