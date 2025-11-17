import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, webContents } from 'electron'
import { IpcListener, IpcSocketBackend, RemoveFunction } from '../common/IpcSocket'
import { isPlatform } from '../common/Utils'
import { IpcHandler } from './IpcHandler'
import { IpcHost } from './IpcHost'


interface ElectronHostOptions {
  ipcHandlers?: (typeof IpcHandler)[];
}

interface BrowserWindowOptions extends BrowserWindowConstructorOptions {
  /**
   * 前端地址
   *
   * 远程 `http://` URL 地址；
   * 本地 `file://` 协议的 HTML 文件；
   * 本地 HTML 文件地址；
   */
  frontendURL: string;
  /**
   * 隐藏应用菜单栏（避免 ALT 触发）
   */
  hideAppMenu?: boolean;
}


class ElectronIpc implements IpcSocketBackend {
  private static ipc = ipcMain
  
  public send(channel: string, ...args: any[]): void {
    webContents
      .getAllWebContents()
      .forEach((webContent) => {
        webContent.send(channel, ...args)
      })
  }
  
  public addListener(channel: string, listener: IpcListener): RemoveFunction {
    ElectronIpc.ipc.addListener(channel, listener)
    return () => ElectronIpc.ipc.removeListener(channel, listener)
  }
  
  public once(channel: string, listener: IpcListener) {
    ElectronIpc.ipc.once(channel, listener)
  }
  
  public removeListener(channel: string, listener: IpcListener) {
    ElectronIpc.ipc.removeListener(channel, listener)
  }
  
  public handle(channel: string, listener: (evt: any, ...args: any[]) => Promise<any>): RemoveFunction {
    ElectronIpc.ipc.removeHandler(channel) // make sure there's not already a handler registered
    ElectronIpc.ipc.handle(channel, listener)
    return () => ElectronIpc.ipc.removeHandler(channel)
  }
}


export class ElectronHost {
  private static _ipc: ElectronIpc
  
  private constructor() {}
  
  static _mainWindow?: BrowserWindow
  
  public static get mainWindow() { return this._mainWindow }
  
  public static get isValid() { return this._ipc !== undefined }
  
  static async startup(options?: ElectronHostOptions) {
    if (!this.isValid) {
      this._ipc = new ElectronIpc()
    }
    
    await IpcHost.startup({ socket: this._ipc })
    if (IpcHost.isValid) {
      options?.ipcHandlers?.forEach((ipc) => ipc.register())
    }
  }
  
  public static async openMainWindow(windowOptions: BrowserWindowOptions): Promise<void> {
    await app.whenReady()
    
    // 当所有窗口都关闭时退出应用程序（除非我们在 MacOS 上运行）
    app.on('window-all-closed', () => {
      if (!isPlatform('darwin')) {
        app.quit()
      }
    })
    
    // 如果主窗口已关闭并且应用程序已重新激活，请重新打开主窗口（这是 MacOS 的正常行为）
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this._openWindow(windowOptions)
      }
    })
    
    await this._openWindow(windowOptions)
  }
  
  public static shutdown(): void {
    app.exit()
  }
  
  private static async _openWindow(options: BrowserWindowOptions) {
    const { webPreferences, frontendURL, hideAppMenu, ...others } = options
    
    const win = this._mainWindow = new BrowserWindow({
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        experimentalFeatures: false,
        nodeIntegration: true,
        contextIsolation: true,
        sandbox: false,
        nodeIntegrationInWorker: true,
        nodeIntegrationInSubFrames: false,
        ...webPreferences,
      },
      ...others,
    })
    win.once('ready-to-show', () => win.show())
    
    hideAppMenu && win.setMenu(null)
    
    const urlReg = /^(https?|file):\/\/.*/
    if (urlReg.test(frontendURL)) {
      await win.loadURL(frontendURL)
    } else {
      await win.loadFile(frontendURL)
    }
    
    if (!app.isPackaged) {
      win.webContents.toggleDevTools()
    }
  }
}
