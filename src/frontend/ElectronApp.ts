import { IpcHostChannel, IpcListener, IpcSocketFrontend } from '../common/IpcSocket'
import { ElectronApi, frontendApiKey } from '../ElectronPreload'
import { IpcApp } from './IpcApp'


declare global {
  interface Window {
    [frontendApiKey]: ElectronApi;
  }
}


class ElectronIpc implements IpcSocketFrontend {
  private static ipc = window[frontendApiKey] ?? require('electron').ipcRenderer
  
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


export class ElectronApp {
  public static dialogIpc = IpcApp.makeIpcFunctionProxy<Electron.Dialog>(IpcHostChannel.Dialog, 'callDialog')
  
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

