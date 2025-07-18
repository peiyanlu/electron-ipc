import {
  IpcAppChannel,
  IpcAppNotifications,
  ipcChannel,
  IpcListener,
  IpcSocketBackend,
  RemoveFunction,
} from '../common/IpcSocket'
import { ElectronDialogHandler, IpcHostHandler, IpcHostNotifyHandler } from './IpcHandler'


export interface IpcHostOpts {
  socket?: IpcSocketBackend;
}


/**
 * 由具有专用后端的应用程序使用。IpcHosts 可能会向其对应的 IpcApp 发送消息。
 * @note 如果任何一端终止，另一端也必须终止。
 */
export class IpcHost {
  /** 确定 Ipc 是否可用于此后端。仅当在此类上调用 [[startup]] 时，这才为 true。 */
  public static get isValid(): boolean { return undefined !== this._ipc }
  
  private static _ipc: IpcSocketBackend | undefined
  
  /** 获取 [IpcSocketBackend]($common) 接口的实现。 */
  private static get ipc(): IpcSocketBackend { return this._ipc! }
  
  /**
   * 通过 Ipc 通道向前端发送消息。
   * @param {string} channel
   * @param data
   */
  public static send(channel: string, ...data: any[]): void {
    this.ipc.send(ipcChannel(channel), ...data)
  }
  
  /**
   * 为 Ipc 通道建立处理程序以接收 [[Frontend.invoke]] 调用
   * @param {string} channel
   * @param {(...args: any[]) => Promise<any>} handler 一个为 `channel` 提供实现的函数
   * @returns {RemoveFunction}
   */
  public static handle(channel: string, handler: (...args: any[]) => Promise<any>): RemoveFunction {
    return this.ipc.handle(ipcChannel(channel), handler)
  }
  
  /**
   * 建立处理程序以接收通过 [[IpcApp.send]] 发送的消息。
   * @param {string} channel
   * @param {IpcListener} listener 通过 'channel' 发送消息时调用的函数
   * @returns {RemoveFunction}
   */
  public static addListener(channel: string, listener: IpcListener): RemoveFunction {
    return this.ipc.addListener(ipcChannel(channel), listener)
  }
  
  /**
   * 删除以前注册的侦听器
   */
  public static removeListener(channel: string, listener: IpcListener): void {
    this.ipc.removeListener(ipcChannel(channel), listener)
  }
  
  
  /**
   * 触发 IpcApp 的 addListener
   *
   * ```
   * IpcHost.notifyIpcFrontend('notifyApp')
   * ```
   *
   * @param {T} methodName
   * @param {any} args
   */
  public static notifyIpcFrontend<T extends keyof IpcAppNotifications>(
    methodName: T,
    ...args: Parameters<IpcAppNotifications[T]>
  ) {
    return IpcHost.send(IpcAppChannel.AppNotify, methodName, ...args)
  }
  
  public static async startup(opt?: IpcHostOpts): Promise<void> {
    this._ipc = opt?.socket
    
    if (this.isValid) {
      IpcHostHandler.register()
      ElectronDialogHandler.register()
      IpcHostNotifyHandler.register()
    }
  }
  
  public static async shutdown(): Promise<void> {
    this._ipc = undefined
  }
}
