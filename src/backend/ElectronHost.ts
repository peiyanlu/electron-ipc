import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, webContents } from 'electron'
import { IpcListener, IpcSocketBackend, RemoveFunction } from '../common/IpcSocket.js'
import { IpcHandler } from './IpcHandler.js'
import { IpcHost } from './IpcHost.js'
import { showAndFocus } from './Utils.js'


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
   *
   * 此行为会导致默认快捷键打开 `DevTools` 失效
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
  /**
   * 开发环境是否打开 `DevTools`
   */
  devTools?: boolean;
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
  /**
   * 继承 `openMainWindow` 的参数创建新窗口
   */
  static reopenMainWindow: (() => Promise<BrowserWindow>) | undefined
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
  
  public static async openMainWindow(windowOptions: BrowserWindowOptions): Promise<BrowserWindow | void> {
    const { singleInstance, beforeReady, afterReady } = windowOptions
    
    if (singleInstance && app.isPackaged) {
      if (!app.requestSingleInstanceLock()) {
        return app.quit()
      }
      
      app.on('second-instance', () => {
        showAndFocus(this._mainWindow!)
      })
    }
    
    await beforeReady?.()
    
    await app.whenReady()
    
    await afterReady?.()
    
    this.reopenMainWindow = this._openWindow.bind(ElectronHost, windowOptions)
    
    this._mainWindow = await this.reopenMainWindow()
    
    return this._mainWindow
  }
  
  public static shutdown(): void {
    app.exit()
    IpcHost.shutdown()
    this._mainWindow = undefined
  }
  
  private static async _openWindow(options: BrowserWindowOptions) {
    return new Promise<BrowserWindow>(async (resolve) => {
      const { webPreferences, frontendURL, hideAppMenu, devTools, ...others } = options
      
      const window = new BrowserWindow({
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
      window.once('ready-to-show', () => {
        showAndFocus(window)
        resolve(window)
      })
      hideAppMenu && window.setMenu(null)
      
      const urlReg = /^(https?|file):\/\/.*/
      if (urlReg.test(frontendURL)) {
        await window.loadURL(frontendURL)
      } else {
        await window.loadFile(frontendURL)
      }
      
      if (devTools && !app.isPackaged) {
        window.webContents.openDevTools()
      }
    })
  }
}
