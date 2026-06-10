import type { Dialog } from 'electron'
import type { PlatformPath } from 'node:path'
import type { Asyncify, IpcListener, IpcSocketFrontend } from '../common/ipc-socket.js'
import { IpcHostChannel } from '../common/ipc-socket.js'
import type { ElectronApi } from '../preload.js'
import { frontendApiKey } from '../preload.js'
import { IpcApp } from './ipc-app.js'


declare global {
  interface Window {
    [frontendApiKey]: ElectronApi;
  }
}


class ElectronIpc implements IpcSocketFrontend {
  private static ipc = window[frontendApiKey]
  
  public send(channel: string, ...data: any[]) {
    ElectronIpc.ipc.send(channel, ...data)
  }
  
  public addListener(channelName: string, listener: IpcListener) {
    ElectronIpc.ipc.addListener(channelName, listener)
    return () => ElectronIpc.ipc.removeListener(channelName, listener)
  }
  
  public once(channelName: string, listener: IpcListener) {
    ElectronIpc.ipc.once(channelName, listener)
  }
  
  public removeListener(channelName: string, listener: IpcListener) {
    ElectronIpc.ipc.removeListener(channelName, listener)
  }
  
  public async invoke(channel: string, ...args: any[]) {
    return ElectronIpc.ipc.invoke(channel, ...args)
  }
}


export class App {
  public static dialogIpc = IpcApp.makeIpcFunctionProxy<Dialog>(IpcHostChannel.Dialog, 'callMethod')
  public static pathIpc = IpcApp.makeIpcFunctionProxy<Asyncify<PlatformPath>>(IpcHostChannel.Path, 'callMethod')
  
  private static _ipc?: ElectronIpc
  
  public static get isValid(): boolean { return undefined !== this._ipc }
  
  public static startup() {
    if (!this.isValid) {
      this._ipc = new ElectronIpc()
    }
    IpcApp.startup(this._ipc!)
  }
  
  public static shutdown() {
    this._ipc = undefined
    IpcApp.shutdown()
  }
}

export { App as ElectronApp }
