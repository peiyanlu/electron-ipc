/** 这些方法存储在 `window.ipcRenderer` */
export interface ElectronApi {
  addListener: (channel: string, listener: ElectronListener) => void;
  removeListener: (channel: string, listener: ElectronListener) => void;
  invoke: (channel: string, ...data: any[]) => Promise<any>;
  once: (channel: string, listener: ElectronListener) => void;
  send: (channel: string, ...data: any[]) => void; // 仅适用于 render -> main
}

export type ElectronListener = (evt: any, ...args: any[]) => void;


export const getFrontendApi = (): ElectronApi => {
  const checkPrefix = (channel: string) => {
    if (!channel.startsWith('ipc.')) {
      throw new Error(`illegal channel name '${ channel }'`)
    }
  }
  const ipcRenderer = require('electron').ipcRenderer
  
  return {
    send(channel: string, ...data: any[]) {
      checkPrefix(channel)
      ipcRenderer.send(channel, ...data)
    },
    addListener(channel: string, listener: ElectronListener) {
      checkPrefix(channel)
      return ipcRenderer.addListener(channel, listener)
    },
    removeListener(channel: string, listener: ElectronListener) {
      return ipcRenderer.removeListener(channel, listener)
    },
    once(channel: string, listener: ElectronListener) {
      checkPrefix(channel)
      return ipcRenderer.once(channel, listener)
    },
    async invoke(channel: string, ...data: any[]): Promise<any> {
      checkPrefix(channel)
      return ipcRenderer.invoke(channel, ...data)
    },
  }
}


export const frontendApiKey = 'ipcRenderer'
