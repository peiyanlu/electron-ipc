import { app } from 'electron'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { posix } from 'path'


export const isPlatform = (platform: NodeJS.Platform) => {
  return process && platform === process.platform
}


export const isWin = isPlatform('win32')


export const normalizePath = (id: string): string => {
  const windowsSlashRE = /\\/g
  const slash = (p: string): string => p.replace(windowsSlashRE, '/')
  return posix.normalize(isWin ? slash(id) : id)
}


export const checkSquirrel = () => {
  if (isWin) {
    const run = (args: string[], done: () => void) => {
      const updateExe = resolve(dirname(process.execPath), '..', 'Update.exe')
      writeLog(updateExe)
      spawn(updateExe, args, { detached: true }).on('close', done)
    }
    
    const writeLog = (cmd: string) => {
      const logPath = resolve(dirname(process.execPath), '..', '..', `${ basename(process.execPath) }.log`)
      appendFile(logPath, `${ new Date().toLocaleString() } ${ cmd } \n`).catch()
    }
    
    const cmd = process.argv[1]
    const target = basename(process.execPath)
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
