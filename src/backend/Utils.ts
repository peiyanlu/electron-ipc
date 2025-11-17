import { app, BrowserWindow, BrowserWindowConstructorOptions, shell } from 'electron'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { posix } from 'path'
import { classifyUrl, isWin } from '../common/Utils'


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
 * Win Squirrel 应用安装检查
 * @returns {boolean}
 */
export const checkSquirrel = (): boolean => {
  if (isWin) {
    const cmd = process.argv[1]
    const target = basename(process.execPath) // [AppName].exe
    
    const writeLog = (cmd: string) => {
      const logPath = resolve(tmpdir(), `${ target }.log`)
      appendFile(logPath, `${ new Date().toLocaleString() } ${ cmd } \n`).catch()
    }
    
    const run = (args: string[], done: () => void) => {
      const updateExe = resolve(dirname(process.execPath), '..', 'Update.exe')
      writeLog(updateExe)
      spawn(updateExe, args, { detached: true }).on('close', done)
    }
    
    if ([ '--squirrel-install', '--squirrel-updated' ].includes(cmd)) {
      writeLog(cmd)
      run([ `--createShortcut=${ target }` ], app.quit)
      return true
    }
    
    if (cmd === '--squirrel-uninstall') {
      writeLog(cmd)
      run([ `--removeShortcut=${ target }` ], app.quit)
      return true
    }
    
    if (cmd === '--squirrel-obsolete') {
      writeLog(cmd)
      app.quit()
      return true
    }
    
    return false
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
 * @param {boolean} allowExternalUrl
 */
export const onChildWindowOpenUrl = (allowExternalUrl?: boolean): void => {
  app.on('browser-window-created', (_event, win) => {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!WindowManager.canCreate()) {
        return { action: 'deny' }
      }
      
      const { isHttp } = classifyUrl(url)
      if (isHttp) {
        allowExternalUrl
          ? openSimpleWindow(url)
          : shell
            .openExternal(url)
            .catch(() => openSimpleWindow(url))
        return { action: 'deny' }
      }
      
      openSimpleWindow(url)
      
      return { action: 'deny' }
    })
  })
}
