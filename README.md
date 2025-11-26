# electron-ipc

简化 Electron 前后端通信的 ipc 工具

## 后端

```ts
import {
  checkSquirrel,
  createTray,
  ElectronHost,
  getIconExt,
  IpcHost,
  isDev,
  onChildWindowOpenUrl,
  showAndFocus,
} from '@peiyanlu/electron-ipc/backend'
import { app, Menu } from 'electron'
import { join } from 'path'
import { ElectronSvgHandler } from './electron/IpcHandler'


const file = join(__dirname, '..', `renderer/${ MAIN_WINDOW_VITE_NAME }/index.html`)
const frontendURL = MAIN_WINDOW_VITE_DEV_SERVER_URL ?? file


const getIcon = (root: string, tray?: boolean) => {
  return join(root, 'icons', `icon.${ getIconExt(tray) }`)
}
const appIcon = getIcon(__dirname)
const trayIcon = getIcon(isDev ? __dirname : process.resourcesPath, true)


if (checkSquirrel()) {
  ElectronHost.shutdown()
}

ElectronHost.startup({
  ipcHandlers: [ ElectronSvgHandler ],
})
ElectronHost.openMainWindow({
    webPreferences: {
      preload: require.resolve('./preload.js'),
      sandbox: false,
    },
    width: 980,
    height: 740,
    show: false,
    icon: appIcon,
    frontendURL,
    hideAppMenu: true,
    singleInstance: true,
    devTools: true,
    beforeReady: () => {
      onChildWindowOpenUrl()
    },
  })
  .then((window) => {
    if (!window) return
    //   DO SOMETHING
    
    createTray({
      window: window,
      icon: trayIcon,
      menu: Menu.buildFromTemplate([
        {
          label: '打开',
          click: () => {
            showAndFocus(window)
          },
        },
        {
          label: '退出',
          click: () => {
            app.exit()
          },
        },
      ]),
      title: `${ APP_NAME } ${ APP_VERSION }`,
    })
  })

IpcHost.addListener('changeTheme', (_e, data: string) => {
  console.log('changeTheme:receiver', data)
})
```

## Preload

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { frontendApiKey, getFrontendApi } from '@peiyanlu/electron-ipc/preload'


contextBridge.exposeInMainWorld(frontendApiKey, getFrontendApi(ipcRenderer))
```

## 前端

```ts
import { svgoChannel, SvgoIpcInterface } from '@/electron/IpcInterface'
import { ElectronApp, IpcApp } from '@peiyanlu/electron-ipc/frontend'


ElectronApp.startup()
const svgoIpc = IpcApp.makeIpcFunctionProxy<SvgoIpcInterface>(svgoChannel, 'callMethod')


IpcApp.send('changeTheme', 'light')
```
