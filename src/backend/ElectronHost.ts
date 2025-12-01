import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  Menu,
  NativeImage,
  Tray,
  webContents,
} from 'electron'
import { IpcListener, IpcSocketBackend, RemoveFunction } from '../common/IpcSocket.js'
import { isMac } from '../common/Utils.js'
import { IpcHandler } from './IpcHandler.js'
import { IpcHost } from './IpcHost.js'
import { isDev, showAndFocus } from './Utils.js'


interface ElectronHostOptions {
  ipcHandlers?: (typeof IpcHandler)[];
}

interface CreateTrayOptions {
  window: BrowserWindow
  icon: NativeImage | string
  menu: Menu
  title?: string
  hideDock?: boolean
  /** {@link getGUID} */
  guid?: string
}

interface CreatedTray {
  /** 获取系统托盘 */
  getTray(): Tray
  
  /** 允许应用退出而不是退出到托盘 */
  enableQuit(): void
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
  /** 系统托盘 */
  tray?: Omit<CreateTrayOptions, 'window'>;
  /** 参考 {@link setBackgroundColor} */
  backgroundColor?: string;
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
  private static _windowOptions: BrowserWindowOptions | undefined
  
  private constructor() {}
  
  private static _tray: CreatedTray | undefined
  
  public static get tray(): CreatedTray | undefined {
    return this._tray
  }
  
  private static _mainWindow: BrowserWindow | undefined
  
  public static get mainWindow(): BrowserWindow | undefined {
    return this._mainWindow?.isDestroyed() ? undefined : this._mainWindow
  }
  
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
  
  public static async openMainWindow(opts: BrowserWindowOptions): Promise<BrowserWindow | void> {
    const { singleInstance, beforeReady, afterReady, tray } = opts
    
    if (singleInstance && app.isPackaged) {
      if (!app.requestSingleInstanceLock()) {
        return app.quit()
      }
      
      app.on('second-instance', async () => {
        if (this.mainWindow) {
          showAndFocus(this.mainWindow)
        } else {
          this._mainWindow = await this.createWindow(this._windowOptions!)
        }
      })
    }
    
    await beforeReady?.()
    await app.whenReady()
    await afterReady?.()
    
    this._mainWindow = await this.createWindow(opts)
    
    if (tray) {
      this._tray = this.createTray({ window: this._mainWindow, ...tray })
    }
    
    return this._mainWindow
  }
  
  public static shutdown(): void {
    IpcHost.shutdown()
    this._tray?.enableQuit()
    this._tray = undefined
    this._mainWindow = undefined
    app.quit()
  }
  
  public static async reopenMainWindow() {
    if (!this._windowOptions) return
    this._mainWindow = await this.createWindow(this._windowOptions)
    return this._mainWindow
  }
  
  private static async createWindow(options: BrowserWindowOptions) {
    const { webPreferences, frontendURL, hideAppMenu, devTools, backgroundColor, ...others } = options
    
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
    
    hideAppMenu && window.setMenu(null)
    backgroundColor && window.setBackgroundColor(backgroundColor)
    
    const ready: Promise<void> = new Promise<void>((resolve) => {
      window.once('ready-to-show', () => resolve())
    })
    
    const loading: Promise<void> = /^(https?|file):\/\/.*/.test(frontendURL)
      ? window.loadURL(frontendURL)
      : window.loadFile(frontendURL)
    
    await Promise.all([ ready, loading ])
    
    showAndFocus(window)
    
    if (devTools && isDev) window.webContents.openDevTools()
    
    return window
  }
  
  private static createTray(options: CreateTrayOptions): CreatedTray {
    const { window, icon, menu, title, hideDock, guid } = options
    let allowQuit = false
    
    app.on('window-all-closed', () => { allowQuit && app.quit() })
    window.on('close', (e) => {
      if (!allowQuit) {
        e.preventDefault()
        window.hide()
      }
    })
    
    const tray = guid ? new Tray(icon, guid) : new Tray(icon)
    tray.setContextMenu(menu)
    title && tray.setToolTip(title)
    tray.on('click', () => {
      if (!window.isDestroyed()) {
        window.isVisible() ? window.hide() : showAndFocus(window)
      }
    })
    
    if (isMac) {
      app.on('activate', () => showAndFocus(window))
      hideDock && app.dock?.hide()
    }
    
    const getTray = () => tray
    const enableQuit = () => { allowQuit = true }
    
    return { getTray, enableQuit }
  }
}
