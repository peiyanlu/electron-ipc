import { app, BrowserWindow, BrowserWindowConstructorOptions, Menu, NativeImage, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { posix } from 'path'
import { classifyUrl, isPlatform, isWin } from '../common/Utils'


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

/**
 * 创建系统托盘图标
 * @param {CreateTrayOptions} trayOptions
 * @returns {Electron.CrossProcessExports.Tray}
 */
export const createTray = (trayOptions: CreateTrayOptions): Tray => {
  const { window, icon, menu, title, hideDock } = trayOptions
  
  app.on('window-all-closed', () => {})
  window.on('close', (e) => {
    e.preventDefault()
    window.hide()
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
  
  if (isPlatform('darwin')) {
    app.on('activate', () => showAndFocus(window))
    hideDock && app.dock?.hide()
  }
  
  return tray
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
export const isDev = !app.isPackaged
