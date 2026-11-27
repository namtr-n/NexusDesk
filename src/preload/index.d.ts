import type { NexusApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    nexus: NexusApi
  }
}

export {}
