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
  /**
   * 单实例运行
   *
   * 保证用户多开启动时，聚焦已有窗口，不会多开窗口
   */
  singleInstance?: boolean;
  /**
   * `app.whenReady` 之前调用
   */
  beforeReady?: () => Promise<void> | void;
  /**
   * `app.whenReady` 之后调用
   */
  afterReady?: () => Promise<void> | void;
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
  private static _ipc: ElectronIpc | undefined
  
  private constructor() {}
  
  private static _mainWindow: BrowserWindow | undefined
  
  public static get mainWindow() { return this._mainWindow }
  
  public static get isValid() { return this._ipc !== undefined }
  
  public static startup(options?: ElectronHostOptions) {
    if (!this.isValid) {
      this._ipc = new ElectronIpc()
    }
    
    IpcHost.startup({ socket: this._ipc })
    if (IpcHost.isValid) {
      options?.ipcHandlers?.forEach((ipc) => ipc.register())
    }
  }
  
  public static async openMainWindow(windowOptions: BrowserWindowOptions): Promise<void> {
    const { singleInstance, beforeReady, afterReady } = windowOptions
    
    if (singleInstance) {
      // 请求单实例锁，如果获取锁失败，说明已有实例，退出当前实例
      const gotTheLock = app.requestSingleInstanceLock()
      if (!gotTheLock) {
        return app.quit()
      }
      
      // 当第二个实例启动时，会触发这个事件，聚焦已有窗口
      app.on('second-instance', () => {
        const win = this._mainWindow
        if (win) {
          if (win.isMinimized()) {
            win.restore()
          }
          win.focus()
        }
      })
    }
    
    await beforeReady?.()
    
    await app.whenReady()
    
    await afterReady?.()
    
    // 所有窗口关闭时退出（macOS 除外）
    app.on('window-all-closed', () => {
      if (!isPlatform('darwin')) {
        app.quit()
      }
    })
    // macOS 应用激活时打开主窗口
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this._openWindow(windowOptions)
      }
    })
    
    await this._openWindow(windowOptions)
  }
  
  public static shutdown(): void {
    app.exit()
    IpcHost.shutdown()
    this._mainWindow = undefined
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
