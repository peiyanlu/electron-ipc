import {
  app,
  autoUpdater,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Event,
  Menu,
  NativeImage,
  shell,
  Tray,
} from 'electron'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { basename, join, posix, resolve } from 'node:path'
import { format } from 'node:util'
import { classifyUrl, isMac, isWin } from '../common/Utils.js'


/**
 * 使用资源管理器打开 dir
 * @param {string} dir
 */
export const openDir = (dir: string): void => {
  let command = ''
  let args: string[] = []
  
  switch (process.platform) {
    case 'win32':
      command = 'cmd'
      args = [ '/c', 'start', '', dir ] // "" 必须占位
      break
    case 'darwin':
      command = 'open'
      args = [ dir ]
      break
    case 'linux':
      command = 'xdg-open'
      args = [ dir ]
      break
  }
  
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

export const normalizePath = (id: string): string => {
  const windowsSlashRE = /\\/g
  const slash = (p: string): string => p.replace(windowsSlashRE, '/')
  return posix.normalize(isWin ? slash(id) : id)
}

/**
 * 写入日志到 `app.getPath('logs')` 目录下
 * @param {string} text
 */
export const writeLog = (text: string) => {
  const filename = `${ new Date().toLocaleDateString().replaceAll('/', '-') }.log`
  const logPath = resolve(app.getPath('logs'), filename)
  appendFile(logPath, `[${ new Date().toLocaleString() }] ${ text } \n`).catch()
}

/**
 * Win Squirrel 应用安装检查
 * @returns {boolean}
 */
export const checkSquirrel = (): boolean => {
  if (!isWin) return false
  
  const squirrelEvent = process.argv[1]
  writeLog(`Squirrel event: ${ squirrelEvent } [${ process.argv.join(' ') }]`)
  if (!squirrelEvent?.startsWith('--squirrel-')) return false
  
  const run = (args: string[], done?: () => void) => {
    const updateExe = join(process.execPath, '..', '..', 'Update.exe')
    spawn(updateExe, args, { detached: true, stdio: 'ignore' })
      .on('close', () => done?.())
      .unref()
  }
  
  const exeName = basename(process.execPath)
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      run([ `--createShortcut=${ exeName }` ], app.quit)
      return true
    case '--squirrel-uninstall':
      run([ `--removeShortcut=${ exeName }` ], app.quit)
      return true
    case '--squirrel-firstrun':
      run([ `--createShortcut=${ exeName }` ])
      break
  }
  
  return false
}

/**
 * 创建不包含 Menu 的窗口
 * @param {string} url
 * @param {Electron.CrossProcessExports.BrowserWindowConstructorOptions} options
 * @returns {null | Electron.CrossProcessExports.BrowserWindow}
 */
export const openSimpleWindow = (url: string, options?: BrowserWindowConstructorOptions): BrowserWindow | null => {
  const child = WindowManager.createWindow({ width: 1200, height: 750, ...options })
  child?.loadURL(url).catch(console.error)
  child?.removeMenu()
  return child
}

/**
 * 窗口管理 可限制窗口数量
 */
export class WindowManager {
  static windows: Set<BrowserWindow> = new Set()
  static maxWindows = 10
  
  static canCreate() {
    return this.windows.size < this.maxWindows
  }
  
  static createWindow(options: BrowserWindowConstructorOptions) {
    if (!this.canCreate()) {
      return null
    }
    
    const win = new BrowserWindow(options)
    win.on('closed', () => this.windows.delete(win))
    
    this.windows.add(win)
    
    return win
  }
}

/**
 * 监听子窗口打开，在 ElectronHost.openMainWindow 之前调用
 *
 * @param {(url: string) => boolean | void} filter 返回 false 时阻止跳转
 * @beta
 */
export const onChildWindowOpenUrl = (filter?: (url: string) => boolean | void): void => {
  app.on('browser-window-created', (_event, win) => {
    const innerOpen = (url: string) => {
      if (WindowManager.canCreate()) {
        openSimpleWindow(url)
      }
    }
    
    const open = (url: string) => {
      const { isHttp } = classifyUrl(url)
      isHttp
        ? shell
          .openExternal(url)
          .catch(() => innerOpen(url))
        : innerOpen(url)
    }
    
    const abortable = (url: string) => {
      const useDefault = (url: string) => {
        const allow = filter?.(url)
        return false === allow
      }
      const same = (url: string) => {
        const base = win.webContents.getURL()
        return new URL(base).origin === new URL(url).origin
      }
      return useDefault(url) || same(url)
    }
    
    win.webContents.on('will-navigate', (evt) => {
      const { url, isMainFrame } = evt
      
      if (abortable(url)) return
      
      evt.preventDefault()
      isMainFrame && open(url)
    })
    
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (abortable(url)) {
        return { action: 'allow' }
      }
      
      open(url)
      return { action: 'deny' }
    })
  })
}

/**
 * 显示并聚焦窗口
 * @param {Electron.CrossProcessExports.BrowserWindow} window
 */
export const showAndFocus = (window: BrowserWindow) => {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) {
      window.restore()
    }
    
    window.show()
    
    if (!window.isFocused()) {
      window.focus()
    }
  }
}

export interface CreateTrayOptions {
  window: BrowserWindow
  icon: NativeImage | string
  menu: Menu
  title?: string
  hideDock?: boolean
}

export interface CreatedTray {
  /** 获取系统托盘 */
  getTray(): Tray
  
  /** 允许应用退出而不是退出到托盘 */
  enableQuit(): void
}

/**
 * 创建系统托盘图标
 * @param {CreateTrayOptions} options
 * @returns {CreatedTray}
 */
export const createTray = (options: CreateTrayOptions): CreatedTray => {
  const { window, icon, menu, title, hideDock } = options
  let allowQuit = false
  
  app.on('window-all-closed', () => { allowQuit && app.quit() })
  window.on('close', (e) => {
    if (!allowQuit) {
      e.preventDefault()
      window.hide()
    }
  })
  
  const tray = new Tray(icon)
  tray.setContextMenu(menu)
  title && tray.setToolTip(title)
  tray.on('click', () => {
    if (!window.isDestroyed()) {
      if (window.isVisible()) {
        window.hide()
      } else {
        showAndFocus(window)
      }
    }
  })
  
  if (isMac) {
    app.on('activate', () => showAndFocus(window))
    hideDock && app.dock?.hide()
  }
  
  const getTray = () => tray
  const enableQuit = () => { allowQuit = true }
  
  autoUpdater.on('before-quit-for-update', enableQuit)
  
  return { getTray, enableQuit }
}

/**
 * 获取当前平台的图标格式
 * @param {boolean} tray
 * @returns {'ico' | 'icns' | 'png'}
 */
export const getIconExt = (tray?: boolean): 'ico' | 'icns' | 'png' => {
  switch (process.platform) {
    case 'win32':
      return 'ico'
    case 'darwin':
      return tray ? 'png' : 'icns'
    default:
      return 'png'
  }
}

/**
 * 是否是开发模式
 * @type {boolean}
 */
export const isDev: boolean = !app.isPackaged

/**
 * 检查给定选择器的元素
 * @param {Electron.CrossProcessExports.BrowserWindow} window
 * @param {string} selectors `document.querySelector` 支持的参数
 * @param {[number, number]} offset 相对于 `getBoundingClientRect()` 的 left 和 top 的位置数组 [0~width, 0~height]（默认元素的中心）
 * @returns {Promise<void>}
 */
export const inspectElement = async (
  window: BrowserWindow,
  selectors: string,
  offset?: [ number, number ],
): Promise<void> => {
  const code = `
  new Promise((resolve) => {
    const r = (min, max, val) => Math.min(min, Math.max(max, val))
    const el = document.querySelector('${ selectors }')
    if (!el) return resolve(null)
    const { left, top, width, height } = el.getBoundingClientRect()
    const temp = [${ offset }]
    const [ ox, oy ] = temp ? [ r(1, width, temp[0]), r(1, height, temp[1]) ] : [ width * .5, height * .5 ]
    resolve({ x: Math.round(left + ox), y: Math.round(top + oy) })
  })
  `
  const pos = await window.webContents.executeJavaScript(code)
  pos && window.webContents.inspectElement(pos.x, pos.y)
}

export interface IUpdateInfo {
  event: Event;
  releaseNotes: string;
  releaseName: string;
  releaseDate: Date;
  updateURL: string;
  
  /** 退出并更新 */
  done(): void;
}

interface UpdateOptions {
  /** `owner/repo` */
  repo: string;
  /** 更新频率（分钟）；默认 10 分钟，最短 5 分钟 */
  limit?: number;
  onNotifyUser?: (info: IUpdateInfo) => void;
}

/**
 * Win、Mac 平台检查更新
 *
 * 适用于免费托管更新服务 `update.electronjs.org`
 * @param {UpdateOptions} options
 */
export function checkUpdate(options: UpdateOptions) {
  if (isDev) return
  
  if (!(isWin || isMac)) return
  
  const { repo, limit, onNotifyUser } = options
  
  const feedURL = `https://update.electronjs.org/${ repo }/${ platform() }-${ arch() }/${ app.getVersion() }`
  const userAgent = format('%s/%s (%s: %s)', app.getName(), app.getVersion(), platform(), arch())
  
  autoUpdater.setFeedURL({
    url: feedURL,
    headers: { 'User-Agent': userAgent },
    serverType: 'default',
  })
  
  autoUpdater.on('error', (e) => writeLog(`Updater error: ${ e.message }`))
  
  autoUpdater.on('update-available', () => writeLog('Update available: downloading...'))
  
  autoUpdater.on('update-not-available', () => writeLog('Update not available'))
  
  autoUpdater.on(
    'update-downloaded',
    async (event: Event, releaseNotes: string, releaseName: string, releaseDate: Date, updateURL: string) => {
      writeLog(`Update downloaded: ${ [ releaseNotes, releaseName, releaseDate.toString(), updateURL ].join(' ') }`)
      
      onNotifyUser?.({
        event,
        releaseNotes,
        releaseName,
        releaseDate,
        updateURL,
        done: () => autoUpdater.quitAndInstall(),
      })
    },
  )
  
  app.whenReady().then(() => {
    setInterval(
      () => autoUpdater.checkForUpdates(),
      Math.max(5, limit ?? 10) * 60 * 1000,
    )
  })
}
